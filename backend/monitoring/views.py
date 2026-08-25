"""çæµè§å¾"""
import csv
from datetime import timedelta
from io import StringIO

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from monitoring import tsdb

from .models import MonitorData, MonitoringDevice
from .serializers import (
    MonitorDataCreateSerializer,
    MonitorDataSerializer,
    MonitoringDeviceListSerializer,
    MonitoringDeviceSerializer,
)


class MonitoringDeviceViewSet(viewsets.ModelViewSet):
    """è®¾å¤ç®¡çï¼å¥åºâç»å®éæ£ç¹âå¨çº¿çæµâé¢è­¦é­ç¯"""

    queryset = MonitoringDevice.objects.select_related('hazard_point').all().order_by(
        '-updated_at', '-id'
    )
    filterset_fields = [
        'device_type', 'status', 'hazard_point', 'signal',
        'city', 'district', 'county', 'village',
    ]
    search_fields = [
        'name', 'code', 'address', 'city', 'district', 'county', 'village', 'town',
        'hazard_point__name', 'hazard_point__code',
    ]
    ordering_fields = [
        'created_at', 'updated_at', 'battery', 'last_data_time', 'code', 'status',
    ]

    def get_serializer_class(self):
        if self.action == 'list':
            return MonitoringDeviceListSerializer
        return MonitoringDeviceSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        low_battery = self.request.query_params.get('low_battery')
        if low_battery in ('1', 'true', 'True'):
            qs = qs.filter(battery__lt=20)
        stale = self.request.query_params.get('stale')
        if stale in ('1', 'true', 'True'):
            cutoff = timezone.now() - timedelta(hours=24)
            from django.db.models import Q
            qs = qs.filter(
                Q(last_data_time__lt=cutoff) | Q(last_data_time__isnull=True),
                status='online',
            )
        unlinked = self.request.query_params.get('unlinked')
        if unlinked in ('1', 'true', 'True'):
            qs = qs.filter(hazard_point__isnull=True)
        return qs

    def destroy(self, request, *args, **kwargs):
        device = self.get_object()
        if device.status == 'online':
            return Response(
                {'detail': 'å¨çº¿è®¾å¤ä¸å¯å é¤ï¼è¯·åæ è®°ä¸ºç¦»çº¿ææé'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # è¿ 24 å°æ¶ææ°æ®åç¦æ­¢å é¤ï¼é¿åç ´åçæµé¾è·¯
        recent = device.data_records.filter(
            record_time__gte=timezone.now() - timedelta(hours=24)
        ).exists()
        if recent:
            return Response(
                {'detail': 'è¿ 24 å°æ¶ä»æçæµæ°æ®ä¸æ¥ï¼ä¸è½å é¤'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        code = device.code
        self.perform_destroy(device)
        return Response({'detail': f'å·²å é¤è®¾å¤ {code}'}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        cutoff = timezone.now() - timedelta(hours=24)
        from django.db.models import Q
        stale = queryset.filter(
            Q(last_data_time__lt=cutoff) | Q(last_data_time__isnull=True),
            status='online',
        ).count()
        stats = {
            'total': queryset.count(),
            'online': queryset.filter(status='online').count(),
            'offline': queryset.filter(status='offline').count(),
            'fault': queryset.filter(status='fault').count(),
            'low_battery': queryset.filter(battery__lt=20).count(),
            'stale': stale,
            'unlinked': queryset.filter(hazard_point__isnull=True).count(),
            'by_type': {
                t: queryset.filter(device_type=t).count()
                for t in MonitoringDevice.DeviceType.values
            },
        }
        return Response(stats)

    @action(detail=False, methods=['get'])
    def next_code(self, request):
        dtype = request.query_params.get('device_type', 'others')
        return Response({'code': MonitoringDeviceSerializer._next_code(dtype)})

    @action(detail=False, methods=['get'])
    def device_tree(self, request):
        """按市→区→县→村层级分组（供实时监测左侧树）"""
        devices = list(self.filter_queryset(self.get_queryset()))

        def device_node(device):
            return {
                'id': device.id,
                'code': device.code,
                'name': device.name,
                'type': device.device_type,
                'status': device.status,
                'city': device.city or '',
                'district': device.district or device.town or '',
                'county': device.county or '',
                'village': device.village or '',
                'address': device.address or '',
            }

        def empty_group(name, level, key):
            return {
                'key': key,
                'name': name,
                'level': level,
                'count': 0,
                'online': 0,
                'children': [],
                'devices': [],
            }

        root_children = {}  # city -> node
        unassigned = empty_group('未分配区域', 'unassigned', 'unassigned')

        for device in devices:
            city = (device.city or '').strip()
            district = (device.district or device.town or '').strip()
            county = (device.county or '').strip()
            village = (device.village or '').strip()
            node = device_node(device)
            is_online = device.status == 'online'

            if not city:
                unassigned['devices'].append(node)
                unassigned['count'] += 1
                if is_online:
                    unassigned['online'] += 1
                continue

            city_node = root_children.get(city)
            if not city_node:
                city_node = empty_group(city, 'city', f'city:{city}')
                root_children[city] = city_node

            # 逐级下钻，设备挂在最深有值的节点
            path = [('district', district), ('county', county), ('village', village)]
            current = city_node
            path_prefix = city
            for level, name in path:
                if not name:
                    continue
                path_prefix = f'{path_prefix}/{name}'
                key = f'{level}:{path_prefix}'
                child_map = {c['name']: c for c in current['children']}
                child = child_map.get(name)
                if not child:
                    child = empty_group(name, level, key)
                    current['children'].append(child)
                current = child

            current['devices'].append(node)
            # 向上累计 count / online
            walk = [city_node]
            cur = city_node
            for level, name in path:
                if not name:
                    break
                cur = next(c for c in cur['children'] if c['name'] == name)
                walk.append(cur)
            for g in walk:
                g['count'] += 1
                if is_online:
                    g['online'] += 1

        nodes = sorted(root_children.values(), key=lambda x: x['name'])
        if unassigned['count']:
            nodes.append(unassigned)

        total = len(devices)
        online = sum(1 for d in devices if d.status == 'online')
        # 兼容旧前端：扁平 groups（村名或区名为 key）
        legacy = {}
        for d in devices:
            label = (
                (d.village or '').strip()
                or (d.county or '').strip()
                or (d.district or d.town or '').strip()
                or (d.city or '').strip()
                or '未分配区域'
            )
            legacy.setdefault(label, [])
            legacy[label].append(device_node(d))

        return Response({
            'nodes': nodes,
            'total': total,
            'online': online,
            'groups': legacy,
        })

    @action(detail=True, methods=['post'])
    def change_status(self, request, pk=None):
        """åæ´è®¾å¤ç¶æ"""
        device = self.get_object()
        new_status = request.data.get('status')
        valid = {c.value for c in MonitoringDevice.Status}
        if new_status not in valid:
            return Response(
                {'detail': f'æ æç¶æï¼å¯é: {", ".join(sorted(valid))}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        device.status = new_status
        device.save(update_fields=['status', 'updated_at'])
        return Response(MonitoringDeviceSerializer(device).data)

    @action(detail=True, methods=['post'])
    def bind_hazard(self, request, pk=None):
        """ç»å®/æ¢ç»éæ£ç¹ï¼å¯åæ­¥åæ """
        from hazard.models import HazardPoint

        device = self.get_object()
        hazard_id = request.data.get('hazard_point')
        sync_coords = request.data.get('sync_coords', True)
        if hazard_id in (None, ''):
            device.hazard_point = None
            device.save(update_fields=['hazard_point', 'updated_at'])
            return Response(MonitoringDeviceSerializer(device).data)
        try:
            point = HazardPoint.objects.get(pk=hazard_id)
        except HazardPoint.DoesNotExist:
            return Response({'detail': 'éæ£ç¹ä¸å­å¨'}, status=status.HTTP_404_NOT_FOUND)
        device.hazard_point = point
        update_fields = ['hazard_point', 'updated_at']
        if sync_coords:
            device.longitude = point.longitude
            device.latitude = point.latitude
            if not device.address:
                device.address = point.address or point.name
                update_fields.append('address')
            update_fields.extend(['longitude', 'latitude'])
        device.save(update_fields=update_fields)
        return Response(MonitoringDeviceSerializer(device).data)

    @action(detail=True, methods=['get'])
    def related(self, request, pk=None):
        """å³èæ°æ®ï¼ææ°çæµå¼ + éæ£ç¹æªé­ç¯é¢è­¦"""
        device = self.get_object()
        latest = list(
            device.data_records.order_by('-record_time').values(
                'id', 'data_type', 'value', 'unit', 'record_time'
            )[:20]
        )
        warnings = []
        hazard = None
        if device.hazard_point_id:
            point = device.hazard_point
            hazard = {
                'id': point.id,
                'code': point.code,
                'name': point.name,
                'level': point.level,
                'status': point.status,
            }
            warnings = list(
                point.warnings.exclude(status='closed')
                .order_by('-created_at')
                .values('id', 'code', 'level', 'status', 'trigger_type', 'created_at')[:10]
            )
        return Response({
            'device': MonitoringDeviceSerializer(device).data,
            'latest_data': latest,
            'hazard_point': hazard,
            'open_warnings': warnings,
        })

    @action(detail=False, methods=['get'])
    def export(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        buffer = StringIO()
        writer = csv.writer(buffer)
        writer.writerow([
            'ç¼å·', 'åç§°', 'ç±»å', 'ç¶æ', 'å®è£ä½ç½®',
            'å³èéæ£ç¹ç¼å·', 'å³èéæ£ç¹åç§°',
            'çµé', 'ä¿¡å·', 'æåæ°æ®æ¶é´', 'ç»åº¦', 'çº¬åº¦',
        ])
        for d in queryset:
            writer.writerow([
                d.code, d.name, d.get_device_type_display(), d.get_status_display(),
                d.address,
                d.hazard_point.code if d.hazard_point else '',
                d.hazard_point.name if d.hazard_point else '',
                d.battery, d.get_signal_display(), d.last_data_time,
                d.longitude, d.latitude,
            ])
        resp = HttpResponse(
            buffer.getvalue().encode('utf-8-sig'),
            content_type='text/csv; charset=utf-8',
        )
        resp['Content-Disposition'] = 'attachment; filename="monitoring_devices.csv"'
        return resp


RANGE_MAP = {
    '1h': timedelta(hours=1),
    '24h': timedelta(hours=24),
    '7d': timedelta(days=7),
    '30d': timedelta(days=30),
}

DEVICE_DEFAULT_DATA_TYPE = {
    'npr_anchor': 'force',
    'rainfall': 'rainfall',
    'fiber_optic': 'strain',
    'gnss': 'displacement',
    'inclinometer': 'displacement',
    'camera': 'temperature',
    'others': 'force',
}

PARAM_SCALE = {
    'force': 100,
    'rainfall': 100,
    'displacement': 50,
    'stress': 100,
    'strain': 800,
    'temperature': 50,
}


def _resolve_time_range(request):
    """è§£æ range / start_time / end_timeï¼é»è®¤è¿ 24 å°æ¶"""
    end = timezone.now()
    end_raw = request.query_params.get('end_time')
    start_raw = request.query_params.get('start_time')
    range_key = (request.query_params.get('range') or '').strip() or '24h'
    if end_raw:
        from django.utils.dateparse import parse_datetime
        parsed = parse_datetime(end_raw)
        if parsed:
            end = parsed if timezone.is_aware(parsed) else timezone.make_aware(parsed)
    if start_raw:
        from django.utils.dateparse import parse_datetime
        parsed = parse_datetime(start_raw)
        if parsed:
            start = parsed if timezone.is_aware(parsed) else timezone.make_aware(parsed)
            return start, end, 'custom'
    delta = RANGE_MAP.get(range_key, RANGE_MAP['24h'])
    if range_key not in RANGE_MAP and range_key != 'custom':
        range_key = '24h'
    return end - delta, end, range_key


def _thresholds_for(data_type: str):
    from warning.engines.rule_engine import WarningEngine
    return WarningEngine()._get_thresholds(data_type)


def _level_for_value(value: float, thresholds: dict):
    if value >= float(thresholds.get('red', 1e18)):
        return 'red'
    if value >= float(thresholds.get('orange', 1e18)):
        return 'orange'
    if value >= float(thresholds.get('yellow', 1e18)):
        return 'yellow'
    return 'normal'


class MonitorDataViewSet(viewsets.ModelViewSet):
    """çæµæ°æ®ï¼ä¸æ¥âå®æ¶æ²çº¿âéå¼ç å¤âé¢è­¦é­ç¯"""

    queryset = MonitorData.objects.select_related(
        'device', 'device__hazard_point'
    ).all().order_by('-record_time')
    filterset_fields = ['device', 'data_type']
    search_fields = ['device__code', 'device__name', 'device__address']
    ordering_fields = ['record_time', 'value', 'created_at']

    def get_permissions(self):
        if self.action in ('create',):
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == 'create':
            return MonitorDataCreateSerializer
        return MonitorDataSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        device_id = self.request.query_params.get('device') or self.request.query_params.get(
            'device_id'
        )
        data_type = self.request.query_params.get('data_type')
        if device_id:
            qs = qs.filter(device_id=device_id)
        if data_type:
            qs = qs.filter(data_type=data_type)
        start, end, _ = _resolve_time_range(self.request)
        # list / history æé»è®¤å¥æ¶é´çªï¼series/latest èªè¡å¤ç
        if self.action in ('list', 'history', 'export', 'overview', 'realtime'):
            if self.request.query_params.get('range') or self.request.query_params.get(
                'start_time'
            ):
                qs = qs.filter(record_time__gte=start, record_time__lte=end)
            elif self.action in ('realtime',):
                qs = qs.filter(record_time__gte=start, record_time__lte=end)
        return qs

    def perform_create(self, serializer):
        data = serializer.save()
        device = data.device
        device.last_data_time = data.record_time
        if device.status == 'offline':
            device.status = 'online'
        device.save(update_fields=['last_data_time', 'status', 'updated_at'])

        if tsdb.external_tsdb_enabled():
            try:
                tsdb.write_monitor_point(
                    device_id=device.id,
                    device_code=device.code,
                    data_type=data.data_type,
                    value=float(data.value),
                    unit=data.unit or '',
                    channel=getattr(data, 'channel', '') or '',
                    record_time=data.record_time,
                )
            except Exception:  # noqa: BLE001
                pass

        warning_result = None
        try:
            from warning.engines import WarningEngine
            warning_result = WarningEngine().evaluate_from_data(data)
        except Exception as exc:  # noqa: BLE001
            warning_result = {'triggered': False, 'error': str(exc)}

        self._last_warning_result = warning_result

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        payload = dict(MonitorDataSerializer(serializer.instance).data)
        if getattr(self, '_last_warning_result', None):
            payload['warning'] = self._last_warning_result
        return Response(payload, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=False, methods=['get'])
    def overview(self, request):
        """å®æ¶çæµæ»è§ææ """
        start, end, range_key = _resolve_time_range(request)
        qs = MonitorData.objects.filter(record_time__gte=start, record_time__lte=end)
        device_type = request.query_params.get('device_type')
        if device_type:
            qs = qs.filter(device__device_type=device_type)

        active_devices = qs.values('device_id').distinct().count()
        online = MonitoringDevice.objects.filter(status='online').count()
        from warning.models import WarningRecord
        open_warnings = WarningRecord.objects.exclude(status='closed').count()

        # è¶é»éå¼ç¹æ°ï¼æç±»ååèªéå¼ç²ç¥ç»è®¡ï¼
        over_count = 0
        for dtype in MonitorData.DataType.values:
            th = _thresholds_for(dtype)
            yellow = float(th.get('yellow', 0))
            over_count += qs.filter(data_type=dtype, value__gte=yellow).count()

        return Response({
            'range': range_key,
            'start_time': start,
            'end_time': end,
            'points': qs.count(),
            'active_devices': active_devices,
            'online_devices': online,
            'over_threshold': over_count,
            'open_warnings': open_warnings,
            'by_type': {
                t: qs.filter(data_type=t).count() for t in MonitorData.DataType.values
            },
        })

    @action(detail=False, methods=['get'])
    def realtime(self, request):
        """è¿æ¶æ®µçæµç¹åè¡¨ï¼é»è®¤ 1hï¼å¯ rangeï¼"""
        # æªæå®æ¶é»è®¤ 1 å°æ¶å®æ¶çªå£
        params = request.query_params
        if not params.get('range') and not params.get('start_time'):
            end = timezone.now()
            start = end - RANGE_MAP['1h']
            range_key = '1h'
        else:
            start, end, range_key = _resolve_time_range(request)
        qs = MonitorData.objects.select_related('device', 'device__hazard_point').filter(
            record_time__gte=start, record_time__lte=end
        )
        device_id = params.get('device_id') or params.get('device')
        data_type = params.get('data_type')
        if device_id:
            qs = qs.filter(device_id=device_id)
        if data_type:
            qs = qs.filter(data_type=data_type)
        limit = min(int(params.get('limit', 200)), 1000)
        serializer = MonitorDataSerializer(qs.order_by('-record_time')[:limit], many=True)
        return Response({
            'range': range_key,
            'start_time': start,
            'end_time': end,
            'count': len(serializer.data),
            'results': serializer.data,
        })

    @action(detail=False, methods=['get'])
    def history(self, request):
        """åå²æ¥è¯¢ï¼æå¤ 1000 æ¡ï¼æ¶é´æ­£åºä¾¿äºç»å¾ï¼"""
        start, end, range_key = _resolve_time_range(request)
        qs = MonitorData.objects.select_related('device').filter(
            record_time__gte=start, record_time__lte=end
        )
        device_id = request.query_params.get('device_id') or request.query_params.get('device')
        data_type = request.query_params.get('data_type')
        if device_id:
            qs = qs.filter(device_id=device_id)
        if data_type:
            qs = qs.filter(data_type=data_type)
        limit = min(int(request.query_params.get('limit', 500)), 1000)
        rows = list(qs.order_by('record_time')[:limit])
        return Response({
            'range': range_key,
            'start_time': start,
            'end_time': end,
            'count': len(rows),
            'results': MonitorDataSerializer(rows, many=True).data,
        })

    @action(detail=False, methods=['get'])
    def series(self, request):
        """单设备单类型时序 + 阈值 + 统计 + 未闭环预警（图表主接口）"""
        device_id = request.query_params.get('device_id') or request.query_params.get('device')
        if not device_id:
            return Response({'detail': '请指定 device_id'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            device = MonitoringDevice.objects.select_related('hazard_point').get(pk=device_id)
        except MonitoringDevice.DoesNotExist:
            return Response({'detail': '设备不存在'}, status=status.HTTP_404_NOT_FOUND)

        use_ts = tsdb.external_tsdb_enabled() and tsdb.tsdb_query_ok()
        if use_ts:
            available = tsdb.distinct_data_types(device.id)
        else:
            available = list(
                device.data_records.values_list('data_type', flat=True).distinct()
            )
        default_type = DEVICE_DEFAULT_DATA_TYPE.get(device.device_type, 'force')
        data_type = request.query_params.get('data_type') or (
            default_type if default_type in available or not available else available[0]
        )

        start, end, range_key = _resolve_time_range(request)
        limit = min(int(request.query_params.get('limit', 800)), 2000)

        if use_ts:
            td_rows = tsdb.query_points(
                device_id=device.id,
                data_type=data_type,
                start=start,
                end=end,
                limit=limit,
                order='asc',
            )
            values = [float(r['value']) for r in td_rows if r.get('value') is not None]
            unit = (td_rows[-1].get('unit') if td_rows else '') or ''
            points = [
                {
                    'id': i + 1,
                    'time': r.get('record_time') or r.get('ts'),
                    'value': float(r['value']),
                    'unit': r.get('unit') or '',
                }
                for i, r in enumerate(td_rows)
                if r.get('value') is not None
            ]
        else:
            qs = device.data_records.filter(
                data_type=data_type,
                record_time__gte=start,
                record_time__lte=end,
            ).order_by('record_time')
            rows = list(qs[:limit])
            values = [float(r.value) for r in rows]
            from .serializers import DEFAULT_UNITS
            unit = rows[-1].unit if rows else DEFAULT_UNITS.get(data_type, '')
            points = [
                {
                    'id': r.id,
                    'time': r.record_time,
                    'value': float(r.value),
                    'unit': r.unit,
                }
                for r in rows
            ]

        if not unit:
            from .serializers import DEFAULT_UNITS
            unit = DEFAULT_UNITS.get(data_type, '')

        thresholds = _thresholds_for(data_type)
        stats = {
            'count': len(values),
            'min': min(values) if values else None,
            'max': max(values) if values else None,
            'avg': round(sum(values) / len(values), 4) if values else None,
            'latest': values[-1] if values else None,
            'over_yellow': sum(1 for v in values if v >= float(thresholds.get('yellow', 0))),
            'over_orange': sum(1 for v in values if v >= float(thresholds.get('orange', 0))),
            'over_red': sum(1 for v in values if v >= float(thresholds.get('red', 0))),
        }

        open_warnings = []
        hazard = None
        if device.hazard_point_id:
            point = device.hazard_point
            hazard = {
                'id': point.id,
                'code': point.code,
                'name': point.name,
                'level': point.level,
                'status': point.status,
            }
            open_warnings = list(
                point.warnings.exclude(status='closed')
                .order_by('-created_at')
                .values('id', 'code', 'level', 'status', 'trigger_type', 'created_at')[:10]
            )

        return Response({
            'device': MonitoringDeviceSerializer(device).data,
            'data_type': data_type,
            'data_type_display': dict(MonitorData.DataType.choices).get(data_type, data_type),
            'unit': unit,
            'range': range_key,
            'start_time': start,
            'end_time': end,
            'thresholds': {
                'yellow': float(thresholds.get('yellow', 0)),
                'orange': float(thresholds.get('orange', 0)),
                'red': float(thresholds.get('red', 0)),
            },
            'points': points,
            'stats': stats,
            'available_types': available or [data_type],
            'hazard_point': hazard,
            'open_warnings': open_warnings,
            'scale_max': PARAM_SCALE.get(data_type, 100),
            'tsdb': tsdb.tsdb_backend() if use_ts else 'postgres',
        })

    @action(detail=False, methods=['get'])
    def latest(self, request):
        """è®¾å¤åæ°æ®ç±»åææ°å¼ï¼å¤åæ°èå¨ï¼"""
        device_id = request.query_params.get('device_id') or request.query_params.get('device')
        if not device_id:
            return Response({'detail': 'è¯·æå® device_id'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            device = MonitoringDevice.objects.get(pk=device_id)
        except MonitoringDevice.DoesNotExist:
            return Response({'detail': 'è®¾å¤ä¸å­å¨'}, status=status.HTTP_404_NOT_FOUND)

        params = []
        for dtype, label in MonitorData.DataType.choices:
            row = device.data_records.filter(data_type=dtype).order_by('-record_time').first()
            if not row:
                continue
            th = _thresholds_for(dtype)
            value = float(row.value)
            params.append({
                'data_type': dtype,
                'data_type_display': label,
                'value': value,
                'unit': row.unit,
                'record_time': row.record_time,
                'level': _level_for_value(value, th),
                'thresholds': {
                    'yellow': float(th.get('yellow', 0)),
                    'orange': float(th.get('orange', 0)),
                    'red': float(th.get('red', 0)),
                },
                'scale_max': PARAM_SCALE.get(dtype, 100),
            })
        return Response({
            'device_id': device.id,
            'device_code': device.code,
            'params': params,
        })

    @action(detail=False, methods=['get'])
    def thresholds(self, request):
        data_type = request.query_params.get('data_type')
        if data_type:
            return Response({data_type: _thresholds_for(data_type)})
        return Response({t: _thresholds_for(t) for t in MonitorData.DataType.values})

    @action(detail=False, methods=['get'])
    def export(self, request):
        start, end, _ = _resolve_time_range(request)
        qs = MonitorData.objects.select_related('device', 'device__hazard_point').filter(
            record_time__gte=start, record_time__lte=end
        )
        device_id = request.query_params.get('device_id') or request.query_params.get('device')
        data_type = request.query_params.get('data_type')
        if device_id:
            qs = qs.filter(device_id=device_id)
        if data_type:
            qs = qs.filter(data_type=data_type)
        buffer = StringIO()
        writer = csv.writer(buffer)
        writer.writerow([
            'è®¾å¤ç¼å·', 'è®¾å¤åç§°', 'æ°æ®ç±»å', 'æ°å¼', 'åä½',
            'è®°å½æ¶é´', 'å³èéæ£ç¹',
        ])
        for row in qs.order_by('-record_time')[:5000]:
            writer.writerow([
                row.device.code, row.device.name,
                row.get_data_type_display(), row.value, row.unit,
                row.record_time,
                row.device.hazard_point.code if row.device.hazard_point else '',
            ])
        resp = HttpResponse(
            buffer.getvalue().encode('utf-8-sig'),
            content_type='text/csv; charset=utf-8',
        )
        resp['Content-Disposition'] = 'attachment; filename="monitor_data.csv"'
        return resp

