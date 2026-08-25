"""趋势 / 简易 ML / 融合推理（与阈值引擎并用）"""
from __future__ import annotations

import math
from datetime import timedelta
from typing import Any, Dict, List, Optional, Tuple

from django.utils import timezone

LEVEL_PRIORITY = {'blue': 1, 'yellow': 2, 'orange': 3, 'red': 4}


def _level_from_score(score: float, yellow: float, orange: float, red: float) -> Optional[str]:
    if score >= red:
        return 'red'
    if score >= orange:
        return 'orange'
    if score >= yellow:
        return 'yellow'
    return None


def _recent_values(device, data_type: str, channel: str, hours: int, limit: int = 60) -> List[float]:
    from monitoring.models import MonitorData

    since = timezone.now() - timedelta(hours=max(1, hours))
    qs = MonitorData.objects.filter(
        device=device, data_type=data_type, record_time__gte=since
    )
    ch = (channel or '').strip().upper()
    if ch:
        qs = qs.filter(channel=ch)
    rows = list(qs.order_by('-record_time')[:limit])
    rows.reverse()
    return [float(r.value) for r in rows]


def evaluate_trend(device, data_type: str, channel: str, value: float, params: dict) -> Dict[str, Any]:
    """斜率趋势：单位时间内变化量超过阈值则告警"""
    window = int(params.get('window_hours') or params.get('window') or 6)
    values = _recent_values(device, data_type, channel, window)
    if len(values) < 3:
        values = values + [float(value)]
    if len(values) < 2:
        return {'triggered': False, 'reason': '样本不足', 'engine': 'trend'}

    n = len(values)
    xs = list(range(n))
    mean_x = sum(xs) / n
    mean_y = sum(values) / n
    den = sum((x - mean_x) ** 2 for x in xs) or 1.0
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, values)) / den
    # 归一：整窗变化量
    delta = slope * (n - 1)
    yellow = float(params.get('yellow') or params.get('slope_yellow') or 5)
    orange = float(params.get('orange') or params.get('slope_orange') or 10)
    red = float(params.get('red') or params.get('slope_red') or 20)
    score = abs(delta)
    level = _level_from_score(score, yellow, orange, red)
    if not level:
        return {
            'triggered': False,
            'reason': '趋势未达阈',
            'engine': 'trend',
            'slope': round(slope, 4),
            'delta': round(delta, 4),
            'sample_size': n,
        }
    return {
        'triggered': True,
        'engine': 'trend',
        'level': level,
        'trigger_type': 'trend_slope',
        'confidence': 55.0 + LEVEL_PRIORITY[level] * 10,
        'slope': round(slope, 4),
        'delta': round(delta, 4),
        'sample_size': n,
        'thresholds': {'yellow': yellow, 'orange': orange, 'red': red},
    }


def evaluate_ml(device, data_type: str, channel: str, value: float, params: dict) -> Dict[str, Any]:
    """简易异常检测：相对滑动均值的 z-score / 相对偏差"""
    window = int(params.get('window_hours') or 24)
    values = _recent_values(device, data_type, channel, window, limit=120)
    if len(values) < 5:
        return {'triggered': False, 'reason': 'ML样本不足', 'engine': 'ml'}

    mean = sum(values) / len(values)
    var = sum((v - mean) ** 2 for v in values) / max(len(values) - 1, 1)
    std = math.sqrt(var) or 1e-6
    z = abs(float(value) - mean) / std
    yellow = float(params.get('z_yellow') or params.get('yellow') or 2.0)
    orange = float(params.get('z_orange') or params.get('orange') or 3.0)
    red = float(params.get('z_red') or params.get('red') or 4.0)
    level = _level_from_score(z, yellow, orange, red)
    if not level:
        return {
            'triggered': False,
            'reason': 'ML未达异常常数',
            'engine': 'ml',
            'z_score': round(z, 3),
            'mean': round(mean, 4),
            'std': round(std, 4),
        }
    return {
        'triggered': True,
        'engine': 'ml',
        'level': level,
        'trigger_type': 'ml_anomaly',
        'confidence': 50.0 + LEVEL_PRIORITY[level] * 12,
        'z_score': round(z, 3),
        'mean': round(mean, 4),
        'std': round(std, 4),
        'thresholds': {'yellow': yellow, 'orange': orange, 'red': red},
    }


def merge_fusion(parts: List[Dict[str, Any]], weights: dict | None = None) -> Dict[str, Any]:
    """融合：加权等级投票"""
    weights = weights or {'threshold': 0.4, 'trend': 0.3, 'ml': 0.3}
    triggered = [p for p in parts if p.get('triggered')]
    if not triggered:
        return {
            'triggered': False,
            'reason': '融合未触发',
            'engine': 'fusion',
            'parts': parts,
        }

    score = 0.0
    detail = []
    for p in triggered:
        eng = p.get('engine') or 'threshold'
        w = float(weights.get(eng, 0.25))
        pri = LEVEL_PRIORITY.get(p.get('level'), 0)
        score += w * pri
        detail.append({'engine': eng, 'level': p.get('level'), 'weight': w})

    if score >= 2.5:
        level = 'red'
    elif score >= 1.6:
        level = 'orange'
    elif score >= 0.8:
        level = 'yellow'
    else:
        return {'triggered': False, 'reason': '融合分不足', 'engine': 'fusion', 'score': score, 'parts': parts}

    best = max(triggered, key=lambda a: LEVEL_PRIORITY.get(a.get('level'), 0))
    return {
        'triggered': True,
        'engine': 'fusion',
        'level': level,
        'trigger_type': 'fusion',
        'confidence': min(95.0, 60.0 + score * 10),
        'score': round(score, 3),
        'parts': detail,
        'primary': best.get('engine'),
    }


def run_advanced_engines(device, data_type: str, channel: str, value: float) -> List[Dict[str, Any]]:
    from warning.models import WarningModel

    out: List[Dict[str, Any]] = []
    models = list(
        WarningModel.objects.filter(is_active=True, model_type__in=['trend', 'ml', 'fusion'])
        .order_by('-updated_at')
    )
    trend_r = None
    ml_r = None
    for m in models:
        params = dict(m.params or {})
        type_params = params.get(data_type) or {}
        if isinstance(type_params, dict):
            params = {**params, **type_params}
        # 未配专用参数时回退模型三色阈
        params.setdefault('yellow', float(m.yellow_threshold or 0))
        params.setdefault('orange', float(m.orange_threshold or 0))
        params.setdefault('red', float(m.red_threshold or 0))

        if m.model_type == 'trend':
            r = evaluate_trend(device, data_type, channel, value, params)
            r['model_code'] = m.code
            r['model_name'] = m.name
            trend_r = r
            out.append(r)
        elif m.model_type == 'ml':
            r = evaluate_ml(device, data_type, channel, value, params)
            r['model_code'] = m.code
            r['model_name'] = m.name
            ml_r = r
            out.append(r)

    fusion_models = [m for m in models if m.model_type == 'fusion']
    if fusion_models:
        m = fusion_models[0]
        parts = [p for p in out if p.get('engine') in ('trend', 'ml')]
        # threshold 结果由外层传入时再融合；此处先用已有
        r = merge_fusion(parts, (m.params or {}).get('weights'))
        r['model_code'] = m.code
        r['model_name'] = m.name
        out.append(r)

    return out
