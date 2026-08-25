"""MQTT 桥接专用接入 API（设备不直连 Django，只发 MQTT）"""
from __future__ import annotations

from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from monitoring.iot.auth import authorize_ingest
from monitoring.iot.redis_state import get_device_latest, get_device_online, redis_health
from monitoring.iot.tracing import HEADER_NAME, extract_trace_id, log_event
from monitoring.models import MqttIngestLog, MonitoringDevice
from warning.engines.rule_engine import UNLINKED_ALERT_KEY


def _require_ingest_auth(request):
    ok, detail, code = authorize_ingest(request)
    if ok:
        return None
    return Response({'detail': detail}, status=code)


def _with_trace_headers(response: Response, trace_id: str) -> Response:
    response[HEADER_NAME] = trace_id
    return response


class MqttIngestView(APIView):
    """
    POST /api/monitoring/ingest/mqtt/

    支持标准格式，或各设备类型厂商字段（由适配器归一化）。
    Header: X-Trace-Id（可选，桥接传入；缺省服务端生成）
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        denied = _require_ingest_auth(request)
        if denied:
            return denied

        payload = request.data if isinstance(request.data, dict) else {}
        tid = extract_trace_id(request=request, payload=payload)
        topic = str(payload.get('topic') or '')
        use_async = payload.get('async', True)
        if isinstance(use_async, str):
            use_async = use_async.lower() in ('1', 'true', 'yes')

        body = {k: v for k, v in payload.items() if k not in ('async', 'topic', 'trace_id', 'traceId')}
        log_event('http.ingest', topic=topic, async_mode=use_async)

        from monitoring.iot.ingest import process_telemetry_payload

        if use_async:
            try:
                from monitoring.tasks import ingest_telemetry_task

                async_result = ingest_telemetry_task.delay(
                    body, topic=topic, persist=True, trace_id=tid
                )
                return _with_trace_headers(
                    Response(
                        {
                            'ok': True,
                            'queued': True,
                            'task_id': async_result.id,
                            'trace_id': tid,
                            'device_code': body.get('device_code') or '',
                        },
                        status=status.HTTP_202_ACCEPTED,
                    ),
                    tid,
                )
            except Exception:  # noqa: BLE001
                use_async = False

        try:
            result = process_telemetry_payload(body, topic=topic, persist=True, trace_id=tid)
            result['queued'] = False
            result['trace_id'] = tid
            return _with_trace_headers(Response(result, status=status.HTTP_201_CREATED), tid)
        except ValueError as exc:
            msg = str(exc)
            code = status.HTTP_404_NOT_FOUND if msg.startswith('设备不存在') else status.HTTP_400_BAD_REQUEST
            return _with_trace_headers(
                Response({'detail': msg, 'trace_id': tid}, status=code), tid
            )
        except Exception as exc:  # noqa: BLE001
            return _with_trace_headers(
                Response({'detail': str(exc), 'trace_id': tid}, status=status.HTTP_500_INTERNAL_SERVER_ERROR),
                tid,
            )


class MqttIngestPreviewView(APIView):
    """POST /api/monitoring/ingest/preview/ — 只看适配结果，不入库"""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        denied = _require_ingest_auth(request)
        if denied:
            return denied
        payload = request.data if isinstance(request.data, dict) else {}
        topic = str(payload.get('topic') or '')
        body = {k: v for k, v in payload.items() if k not in ('async', 'topic')}
        try:
            from monitoring.iot.adapters import expand_to_canonical

            points = expand_to_canonical(body, topic=topic)
            return Response(
                {
                    'ok': True,
                    'device_code': points[0]['device_code'],
                    'device_type': points[0].get('device_type'),
                    'points': [
                        {
                            'data_type': p['data_type'],
                            'channel': p.get('channel') or '',
                            'value': str(p['value']),
                            'unit': p['unit'],
                            'record_time': p['record_time'].isoformat(),
                        }
                        for p in points
                    ],
                }
            )
        except ValueError as exc:
            msg = str(exc)
            code = status.HTTP_404_NOT_FOUND if msg.startswith('设备不存在') else status.HTTP_400_BAD_REQUEST
            return Response({'detail': msg}, status=code)


class DeviceIotStateView(APIView):
    """GET /api/monitoring/ingest/state/?device_code=DEV001 — Redis 最新值/在线"""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        denied = _require_ingest_auth(request)
        if denied:
            return denied
        code = (request.query_params.get('device_code') or '').strip()
        if not code:
            return Response({'detail': '需要 device_code'}, status=status.HTTP_400_BAD_REQUEST)
        online = get_device_online(code)
        return Response(
            {
                'device_code': code,
                'online': online,
                'online_unknown': online is None,
                'latest': get_device_latest(code),
                'redis': redis_health(),
                'unlinked_alert': cache.get(UNLINKED_ALERT_KEY.format(code=code)),
                'adapter_fail': cache.get(f'iot:adapter_fail:{code}'),
                'adapter_fail_count': cache.get(f'iot:adapter_fail_count:{code}') or 0,
            }
        )


class IotOpsAlertsView(APIView):
    """GET /api/monitoring/ingest/ops-alerts/ — 运维可见：未绑隐患超阈、适配失败等"""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        denied = _require_ingest_auth(request)
        if denied:
            return denied
        alerts = cache.get('iot:ops_alerts') or []
        # 附带当前未绑隐患的在线设备清单
        unlinked = list(
            MonitoringDevice.objects.filter(hazard_point__isnull=True)
            .values('code', 'name', 'device_type', 'status')[:50]
        )
        failed_logs = list(
            MqttIngestLog.objects.filter(status=MqttIngestLog.Status.FAILED)
            .order_by('-created_at')
            .values('id', 'device_code', 'topic', 'error', 'created_at')[:20]
        )
        for row in failed_logs:
            row['created_at'] = row['created_at'].isoformat()
        return Response(
            {
                'ops_alerts': alerts if isinstance(alerts, list) else [],
                'redis': redis_health(),
                'unlinked_devices': unlinked,
                'recent_failed_logs': failed_logs,
            }
        )


class EngineThresholdResolveView(APIView):
    """GET /api/monitoring/ingest/engine-threshold/?data_type=rainfall — 当前引擎实际用哪套阈值"""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        denied = _require_ingest_auth(request)
        if denied:
            return denied
        data_type = (request.query_params.get('data_type') or 'rainfall').strip()
        from warning.engines import WarningEngine

        engine = WarningEngine()
        thresholds, meta = engine._get_thresholds_with_meta(data_type)
        return Response(
            {
                'data_type': data_type,
                'model_code': meta.get('code'),
                'model_name': meta.get('name'),
                'model_id': meta.get('id'),
                'thresholds': thresholds,
                'hint': '启用专用模型请 POST /api/warning/models/{id}/activate/ 且 exclusive=true',
            }
        )


class MqttIngestLogListView(APIView):
    """GET /api/monitoring/ingest/logs/ — 最近接入日志（联调）"""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        denied = _require_ingest_auth(request)
        if denied:
            return denied
        limit = min(int(request.query_params.get('limit') or 50), 200)
        qs = MqttIngestLog.objects.all()
        tid = (request.query_params.get('trace_id') or '').strip()
        device_code = (request.query_params.get('device_code') or '').strip()
        if tid:
            qs = qs.filter(trace_id=tid)
        if device_code:
            qs = qs.filter(device_code=device_code)
        rows = qs[:limit]
        return Response(
            [
                {
                    'id': r.id,
                    'trace_id': r.trace_id,
                    'topic': r.topic,
                    'device_code': r.device_code,
                    'status': r.status,
                    'error': r.error,
                    'monitor_data_id': r.monitor_data_id,
                    'payload': r.payload,
                    'created_at': r.created_at.isoformat(),
                }
                for r in rows
            ]
        )
