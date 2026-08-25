"""预警规则引擎：监测数据 → 阈值研判 → 自动建单

业务语义约定：
1) 阈值模型：启用的 threshold 中，优先「带该 data_type 专用 params」的模型，
   再按 updated_at；结果带回 model_code，避免运维误判启用模型。
2) 未绑隐患点：仍研判阈值，写入 Redis 可见告警，不静默丢弃。
3) 去重：同级未闭环则「续报」刷新触发值；更高级别则新建单。
"""
from __future__ import annotations

import logging
from datetime import timedelta
from decimal import Decimal
from typing import Any, Dict, Optional, Tuple

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

LEVEL_PRIORITY = {'blue': 1, 'yellow': 2, 'orange': 3, 'red': 4}

DEFAULT_THRESHOLDS = {
    'force': {'yellow': 50, 'orange': 70, 'red': 85, 'change_rate_red': 30},
    'rainfall': {'yellow': 30, 'orange': 50, 'red': 80},
    'displacement': {'yellow': 5, 'orange': 10, 'red': 20},
    'stress': {'yellow': 40, 'orange': 60, 'red': 80},
    'strain': {'yellow': 200, 'orange': 400, 'red': 600},
    'temperature': {'yellow': 40, 'orange': 50, 'red': 60},
}

TRIGGER_LABELS = {
    'force': '牛顿力超阈值',
    'force_drop': '牛顿力突降',
    'rainfall': '降雨量预警',
    'displacement': '位移超阈值',
    'stress': '应力超阈值',
    'strain': '应变超阈值',
    'temperature': '温度超阈值',
}

UNLINKED_ALERT_TTL = 6 * 3600
UNLINKED_ALERT_KEY = 'iot:alert:unlinked:{code}'


class WarningEngine:
    """阈值规则引擎"""

    DEDUP_HOURS = 6

    def evaluate_from_data(self, monitor_data) -> Dict[str, Any]:
        device = monitor_data.device
        hazard = device.hazard_point
        data_type = monitor_data.data_type
        value = float(monitor_data.value)
        channel = (getattr(monitor_data, 'channel', None) or '').strip().upper()
        thresholds, model_meta = self._get_thresholds_with_meta(data_type)

        # GNSS/倾角分轴：仅对合位移通道 H 或空通道做阈值预警，避免三轴各建一张单
        if data_type == 'displacement' and channel and channel not in ('H',):
            return {
                'triggered': False,
                'reason': f'分轴通道 {channel} 仅入库，预警以合位移通道 H 为准',
                'channel': channel,
                'model_code': model_meta.get('code'),
                'thresholds': thresholds,
            }

        alerts = []
        if data_type == 'force':
            change_rate = self._force_change_rate(device, value)
            drop_threshold = thresholds.get('change_rate_red', 30)
            if change_rate is not None and change_rate > drop_threshold:
                alerts.append({
                    'type': 'force_drop',
                    'level': 'red',
                    'value': value,
                    'change_rate': round(change_rate, 2),
                    'confidence': 90.0,
                })

        level = self._level_by_value(value, thresholds)
        if level:
            alerts.append({
                'type': data_type,
                'level': level,
                'value': value,
                'confidence': self._confidence_for_level(level),
            })

        if not alerts:
            # 阈值未达时仍跑趋势/ML，可能单独触发
            try:
                from warning.engines.advanced import run_advanced_engines

                for adv in run_advanced_engines(device, data_type, channel, value):
                    if adv.get('triggered'):
                        alerts.append({
                            'type': adv.get('trigger_type') or adv.get('engine'),
                            'level': adv['level'],
                            'value': value,
                            'confidence': adv.get('confidence', 70),
                            'engine': adv.get('engine'),
                            'model_code': adv.get('model_code'),
                            'model_name': adv.get('model_name'),
                            'advanced': adv,
                        })
            except Exception as exc:  # noqa: BLE001
                logger.warning('advanced engine (no-threshold) skip: %s', exc)

        if not alerts:
            self._clear_unlinked_alert(device.code)
            return {
                'triggered': False,
                'reason': '未达阈值',
                'model_code': model_meta.get('code'),
                'model_name': model_meta.get('name'),
                'thresholds': thresholds,
            }

        best = max(alerts, key=lambda a: LEVEL_PRIORITY.get(a['level'], 0))
        trigger_value = {
            'data_type': data_type,
            'channel': channel,
            'value': value,
            'unit': monitor_data.unit,
            'device_id': device.id,
            'device_code': device.code,
            'model_code': best.get('model_code') or model_meta.get('code'),
            'model_name': best.get('model_name') or model_meta.get('name'),
            'thresholds': thresholds,
            'engine': best.get('engine') or 'threshold',
            **{k: v for k, v in best.items() if k not in ('type', 'level', 'confidence', 'advanced', 'engine', 'model_code', 'model_name')},
        }
        if best.get('advanced'):
            trigger_value['advanced'] = {
                k: v for k, v in best['advanced'].items() if k not in ('parts',)
            }

        # 再与高级引擎比一次最高级（阈值已触发时）
        try:
            from warning.engines.advanced import LEVEL_PRIORITY as AP
            from warning.engines.advanced import merge_fusion, run_advanced_engines

            advanced = run_advanced_engines(device, data_type, channel, value)
            for adv in advanced:
                if not adv.get('triggered'):
                    continue
                if adv.get('engine') == 'fusion':
                    parts = [{'triggered': True, 'engine': 'threshold', 'level': best['level']}]
                    parts += [a for a in advanced if a.get('engine') in ('trend', 'ml') and a.get('triggered')]
                    fused = merge_fusion(parts, None)
                    if not fused.get('triggered'):
                        continue
                    adv = {**adv, **fused}
                if AP.get(adv.get('level'), 0) > LEVEL_PRIORITY.get(best['level'], 0):
                    best = {
                        'type': adv.get('trigger_type') or adv.get('engine'),
                        'level': adv['level'],
                        'value': value,
                        'confidence': adv.get('confidence', 70),
                    }
                    trigger_value.update({
                        'engine': adv.get('engine'),
                        'model_code': adv.get('model_code') or trigger_value.get('model_code'),
                        'model_name': adv.get('model_name') or trigger_value.get('model_name'),
                        'advanced': {k: v for k, v in adv.items() if k not in ('parts',)},
                    })
        except Exception as exc:  # noqa: BLE001
            logger.warning('advanced engine skip: %s', exc)

        # 未绑隐患点：研判成功但不建单，写入可见告警
        if not hazard:
            alert = {
                'type': 'unlinked_hazard',
                'device_code': device.code,
                'device_name': device.name,
                'level': best['level'],
                'data_type': data_type,
                'value': value,
                'unit': monitor_data.unit,
                'model_code': model_meta.get('code'),
                'message': '监测值已超阈，但设备未关联隐患点，无法生成预警单',
                'at': timezone.now().isoformat(),
            }
            cache.set(UNLINKED_ALERT_KEY.format(code=device.code), alert, timeout=UNLINKED_ALERT_TTL)
            self._push_ops_alert(alert)
            logger.warning(
                '超阈但未绑隐患点: device=%s level=%s value=%s model=%s',
                device.code, best['level'], value, model_meta.get('code'),
            )
            return {
                'triggered': False,
                'would_trigger': True,
                'blocked': 'unlinked_hazard',
                'reason': '设备未关联隐患点',
                'level': best['level'],
                'model_code': model_meta.get('code'),
                'model_name': model_meta.get('name'),
                'thresholds': thresholds,
                'ops_alert': alert,
            }

        result = {
            'triggered': True,
            'level': best['level'],
            'trigger_type': best['type'],
            'trigger_value': trigger_value,
            'confidence': best.get('confidence', 60.0),
            'hazard_point_id': hazard.id,
            'alerts': alerts,
            'model_code': model_meta.get('code'),
            'model_name': model_meta.get('name'),
            'thresholds': thresholds,
        }

        record, action = self._create_or_renew_warning(hazard, result)
        result['warning_id'] = record.id if record else None
        result['warning_code'] = record.code if record else None
        result['deduplicated'] = action == 'skipped'
        result['renewed'] = action == 'renewed'
        result['created'] = action == 'created'
        self._clear_unlinked_alert(device.code)
        return result

    def resolve_threshold_model(self, data_type: str):
        """供 API/序列化与引擎共用的模型解析。"""
        from warning.models import WarningModel

        qs = list(
            WarningModel.objects.filter(is_active=True, model_type='threshold')
            .order_by('-updated_at')
        )
        if not qs:
            return None

        typed = []
        for m in qs:
            params = m.params or {}
            type_params = params.get(data_type) or (params.get('thresholds') or {}).get(data_type)
            if isinstance(type_params, dict) and type_params:
                typed.append(m)
        # 有该数据类型专用配置的模型优先（如 THRESH-RAIN 的 rainfall）
        if typed:
            return typed[0]
        return qs[0]

    def _get_thresholds_with_meta(self, data_type: str) -> Tuple[Dict[str, float], Dict[str, Any]]:
        base = dict(DEFAULT_THRESHOLDS.get(data_type, {'yellow': 50, 'orange': 70, 'red': 85}))
        model = self.resolve_threshold_model(data_type)
        meta: Dict[str, Any] = {'code': None, 'name': None, 'id': None}
        if not model:
            meta['code'] = 'BUILTIN-DEFAULT'
            meta['name'] = '内置默认阈值'
            return base, meta

        meta = {'code': model.code, 'name': model.name, 'id': model.id}
        params = model.params or {}
        type_params = params.get(data_type) or (params.get('thresholds') or {}).get(data_type)

        # 有类型专用 params 时，只用专用阈值，避免被模型「通用三色」误覆盖
        if isinstance(type_params, dict) and type_params:
            base.update({k: float(v) for k, v in type_params.items() if v is not None})
        else:
            base.update({
                'yellow': float(model.yellow_threshold or base.get('yellow', 0)),
                'orange': float(model.orange_threshold or base.get('orange', 0)),
                'red': float(model.red_threshold or base.get('red', 0)),
            })
        return base, meta

    def _get_thresholds(self, data_type: str) -> Dict[str, float]:
        thresholds, _ = self._get_thresholds_with_meta(data_type)
        return thresholds

    def _level_by_value(self, value: float, thresholds: Dict[str, float]) -> Optional[str]:
        red = float(thresholds.get('red', 999999))
        orange = float(thresholds.get('orange', 999999))
        yellow = float(thresholds.get('yellow', 999999))
        if value >= red:
            return 'red'
        if value >= orange:
            return 'orange'
        if value >= yellow:
            return 'yellow'
        return None

    def _confidence_for_level(self, level: str) -> float:
        return {'red': 90.0, 'orange': 75.0, 'yellow': 60.0, 'blue': 45.0}.get(level, 50.0)

    def _force_change_rate(self, device, current_value: float) -> Optional[float]:
        from monitoring.models import MonitorData

        records = list(
            MonitorData.objects.filter(device=device, data_type='force')
            .order_by('-record_time')[:2]
        )
        if len(records) < 2:
            return None
        previous = float(records[1].value)
        if previous == 0:
            return None
        drop = (previous - current_value) / abs(previous) * 100
        return drop if drop > 0 else None

    def _clear_unlinked_alert(self, device_code: str) -> None:
        cache.delete(UNLINKED_ALERT_KEY.format(code=device_code))

    def _push_ops_alert(self, alert: dict) -> None:
        """运维可见告警列表（Redis）"""
        key = 'iot:ops_alerts'
        try:
            items = cache.get(key) or []
            if not isinstance(items, list):
                items = []
            items = [a for a in items if not (
                a.get('type') == alert.get('type') and a.get('device_code') == alert.get('device_code')
            )]
            items.insert(0, alert)
            cache.set(key, items[:100], timeout=7 * 24 * 3600)
        except Exception:  # noqa: BLE001
            pass

    @transaction.atomic
    def _create_or_renew_warning(self, hazard, result: Dict[str, Any]):
        """
        返回 (record, action) action in created|renewed|skipped
        - 更高级别：始终新建
        - 同级别未闭环：续报（刷新触发值/时间），不让值班误以为「没报警」
        """
        from warning.models import WarningRecord

        open_statuses = [
            WarningRecord.Status.PENDING,
            WarningRecord.Status.CONFIRMED,
            WarningRecord.Status.ANALYZING,
            WarningRecord.Status.PUBLISHED,
            WarningRecord.Status.PROCESSING,
        ]
        since = timezone.now() - timedelta(hours=self.DEDUP_HOURS)
        new_level = result['level']
        new_pri = LEVEL_PRIORITY.get(new_level, 0)

        open_qs = WarningRecord.objects.filter(
            hazard_point=hazard,
            status__in=open_statuses,
            created_at__gte=since,
        ).order_by('-created_at')

        same_level = open_qs.filter(level=new_level).first()
        if same_level:
            detail = same_level.call_detail if isinstance(same_level.call_detail, dict) else {}
            renew_count = int(detail.get('renew_count') or 0) + 1
            detail.update({
                'auto': True,
                'renew_count': renew_count,
                'last_renew_at': timezone.now().isoformat(),
                'message': f'规则引擎续报第{renew_count}次（同级去重窗口内）',
            })
            same_level.trigger_value = result['trigger_value']
            same_level.confidence = Decimal(str(round(result['confidence'], 2)))
            same_level.call_detail = detail
            same_level.save(update_fields=[
                'trigger_value', 'confidence', 'call_detail', 'updated_at',
            ])
            logger.info(
                '预警续报: %s hazard=%s level=%s renew=%s',
                same_level.code, hazard.code, new_level, renew_count,
            )
            return same_level, 'renewed'

        # 已有更高级或同窗未闭环的更低级：更高级才新建；若仅有更低级也新建（升级）
        higher = [
            w for w in open_qs
            if LEVEL_PRIORITY.get(w.level, 0) > new_pri
        ]
        if higher:
            logger.info(
                '跳过较低级预警: hazard=%s level=%s higher=%s',
                hazard.code, new_level, higher[0].code,
            )
            return None, 'skipped'

        code = self._next_warning_code()
        trigger_type = TRIGGER_LABELS.get(result['trigger_type'], result['trigger_type'])
        record = WarningRecord.objects.create(
            code=code,
            hazard_point=hazard,
            level=new_level,
            trigger_type=trigger_type,
            trigger_value=result['trigger_value'],
            confidence=Decimal(str(round(result['confidence'], 2))),
            status=WarningRecord.Status.PENDING,
            call_status='pending',
            call_detail={
                'auto': True,
                'renew_count': 0,
                'message': '规则引擎自动触发',
                'model_code': result.get('model_code'),
            },
        )
        if new_level in ('red', 'orange') and hazard.status in ('stable', 'attention'):
            hazard.status = 'warning'
            hazard.save(update_fields=['status', 'updated_at'])

        logger.info('预警触发: %s %s %s model=%s', record.code, hazard.name, record.level, result.get('model_code'))
        return record, 'created'

    def _next_warning_code(self) -> str:
        from warning.models import WarningRecord

        prefix = f"W{timezone.now().strftime('%Y%m%d%H%M')}"
        count = WarningRecord.objects.filter(code__startswith=prefix[:9]).count() + 1
        return f"{prefix}{count:03d}"
