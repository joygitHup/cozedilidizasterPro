"""平台公共 API：配置、天气、搜索、通知"""
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification, SystemConfig
from .serializers import NotificationSerializer, SystemConfigSerializer


@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def system_config_view(request):
    cfg = SystemConfig.get_solo()
    if request.method == 'GET':
        return Response(SystemConfigSerializer(cfg).data)
    ser = SystemConfigSerializer(cfg, data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    ser.save()
    return Response(ser.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def weather_view(request):
    """实况天气（Open-Meteo），?refresh=1 强制刷新"""
    from .weather import refresh_weather

    cfg = SystemConfig.get_solo()
    force = request.query_params.get('refresh') in ('1', 'true', 'True')
    data = refresh_weather(cfg, force=force)
    # 序列化 datetime
    if hasattr(data.get('updated_at'), 'isoformat'):
        data['updated_at'] = data['updated_at'].strftime('%Y-%m-%d %H:%M:%S')
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def channels_status_view(request):
    from .channels import channels_status

    return Response(channels_status())


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def global_search_view(request):
    q = (request.query_params.get('q') or '').strip()
    if len(q) < 1:
        return Response({'q': q, 'results': []})

    limit = min(int(request.query_params.get('limit') or 8), 20)
    results = []

    from hazard.models import HazardPoint
    for hp in HazardPoint.objects.filter(
        Q(name__icontains=q) | Q(code__icontains=q) | Q(address__icontains=q)
    )[:limit]:
        results.append({
            'type': 'hazard',
            'type_label': '隐患点',
            'id': hp.id,
            'title': hp.name,
            'subtitle': hp.code,
            'href': f'/hazard/points?id={hp.id}',
        })

    from monitoring.models import MonitoringDevice
    for d in MonitoringDevice.objects.filter(
        Q(name__icontains=q) | Q(code__icontains=q) | Q(address__icontains=q)
    )[:limit]:
        results.append({
            'type': 'device',
            'type_label': '监测设备',
            'id': d.id,
            'title': d.name,
            'subtitle': d.code,
            'href': f'/monitoring/devices?id={d.id}',
        })

    from warning.models import WarningRecord
    for w in WarningRecord.objects.select_related('hazard_point').filter(
        Q(code__icontains=q)
        | Q(trigger_type__icontains=q)
        | Q(hazard_point__name__icontains=q)
        | Q(hazard_point__code__icontains=q)
    )[:limit]:
        results.append({
            'type': 'warning',
            'type_label': '预警',
            'id': w.id,
            'title': w.code,
            'subtitle': f'{w.hazard_point.name if w.hazard_point_id else ""} · {w.level}',
            'href': f'/warning/current?id={w.id}' if w.status != 'closed' else f'/warning/history?id={w.id}',
        })

    from equipment.models import MaterialStock, EquipmentAsset
    for m in MaterialStock.objects.filter(
        Q(name__icontains=q) | Q(code__icontains=q)
    )[:limit]:
        results.append({
            'type': 'material',
            'type_label': '材料',
            'id': m.id,
            'title': m.name,
            'subtitle': m.code,
            'href': '/equipment/inventory',
        })
    for e in EquipmentAsset.objects.filter(
        Q(name__icontains=q) | Q(code__icontains=q) | Q(model__icontains=q)
    )[:limit]:
        results.append({
            'type': 'equipment',
            'type_label': '装备',
            'id': e.id,
            'title': e.name,
            'subtitle': e.code,
            'href': '/equipment/maintenance',
        })

    return Response({'q': q, 'count': len(results), 'results': results[: limit * 3]})


class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']
    filterset_fields = ['level', 'is_read']
    search_fields = ['title', 'body']
    ordering_fields = ['created_at']

    def get_queryset(self):
        user = self.request.user
        return Notification.objects.filter(
            Q(user__isnull=True) | Q(user=user)
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, source=serializer.validated_data.get('source') or 'manual')

    def list(self, request, *args, **kwargs):
        # 轻量同步：未闭环红色/橙色预警补一条通知（去重）
        self._sync_from_warnings(request.user)
        return super().list(request, *args, **kwargs)

    def _sync_from_warnings(self, user):
        try:
            from warning.models import WarningRecord

            open_qs = WarningRecord.objects.filter(
                status__in=['pending', 'confirmed', 'analyzing', 'published', 'processing'],
                level__in=['red', 'orange'],
            ).select_related('hazard_point')[:20]
            for w in open_qs:
                key = f'warning:{w.id}'
                if Notification.objects.filter(source=key).exists():
                    continue
                Notification.objects.create(
                    title=f'预警 {w.code}',
                    body=f'{w.hazard_point.name if w.hazard_point_id else ""} · {w.get_level_display()} · {w.trigger_type}',
                    level='danger' if w.level == 'red' else 'warning',
                    link=f'/warning/current?id={w.id}',
                    source=key,
                    user=None,
                )
        except Exception:  # noqa: BLE001
            pass

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        self.perform_create(ser)
        return Response(ser.data, status=status.HTTP_201_CREATED)
