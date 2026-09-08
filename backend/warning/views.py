"""预警视图：触发→确认→研判→发布→叫应→处置→闭环"""
import csv
import logging
from io import StringIO

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import WarningModel, WarningRecord
from .serializers import (
    WarningAnalyzeSerializer,
    WarningCallSerializer,
    WarningCloseSerializer,
    WarningConfirmSerializer,
    WarningModelListSerializer,
    WarningModelSerializer,
    WarningModelTestSerializer,
    WarningPublishSerializer,
    WarningRecordListSerializer,
    WarningRecordSerializer,
)

logger = logging.getLogger(__name__)

OPEN_STATUSES = [
    WarningRecord.Status.PENDING,
    WarningRecord.Status.CONFIRMED,
    WarningRecord.Status.ANALYZING,
    WarningRecord.Status.PUBLISHED,
    WarningRecord.Status.PROCESSING,
]
PROCESSING_STATUSES = [
    WarningRecord.Status.CONFIRMED,
    WarningRecord.Status.ANALYZING,
    WarningRecord.Status.PUBLISHED,
    WarningRecord.Status.PROCESSING,
]


def _actor_name(request, fallback_field='confirm_user'):
    data = request.data or {}
    name = data.get(fallback_field) or data.get('publish_user') or data.get('caller')
    if name:
        return str(name).strip()
    user = getattr(request, 'user', None)
    if user and getattr(user, 'is_authenticated', False):
        return user.get_full_name() or user.username
    return '值班员'


class WarningRecordViewSet(viewsets.ModelViewSet):
    """实时/历史预警：全流程处置闭环"""

    queryset = WarningRecord.objects.select_related('hazard_point').all().order_by(
        '-created_at', '-id'
    )
    filterset_fields = ['level', 'status', 'hazard_point']
    search_fields = ['code', 'hazard_point__name', 'hazard_point__code', 'trigger_type']
    ordering_fields = ['created_at', 'level', 'status', 'confidence', 'updated_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return WarningRecordListSerializer
        return WarningRecordSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        open_only = self.request.query_params.get('open_only')
        if open_only in ('1', 'true', 'True'):
            qs = qs.exclude(status=WarningRecord.Status.CLOSED)
        status_group = self.request.query_params.get('status_group')
        if status_group == 'open':
            qs = qs.filter(status__in=OPEN_STATUSES)
        elif status_group == 'pending':
            qs = qs.filter(status=WarningRecord.Status.PENDING)
        elif status_group == 'processing':
            qs = qs.filter(status__in=PROCESSING_STATUSES)
        elif status_group == 'closed':
            qs = qs.filter(status=WarningRecord.Status.CLOSED)
        return qs

    def destroy(self, request, *args, **kwargs):
        warning = self.get_object()
        if warning.status != WarningRecord.Status.CLOSED:
            return Response(
                {'detail': '仅已闭环预警可删除，请先闭环'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        code = warning.code
        self.perform_destroy(warning)
        return Response({'detail': f'已删除预警 {code}'})

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        base = self.filter_queryset(self.get_queryset())
        # 实时页默认看全库未闭环等级分布
        all_qs = WarningRecord.objects.all()
        open_qs = all_qs.exclude(status=WarningRecord.Status.CLOSED)
        stats = {
            'total': all_qs.count(),
            'open': open_qs.count(),
            'pending': all_qs.filter(status='pending').count(),
            'processing': all_qs.filter(status__in=PROCESSING_STATUSES).count(),
            'closed': all_qs.filter(status='closed').count(),
            'by_level': {
                'red': all_qs.filter(level='red').count(),
                'orange': all_qs.filter(level='orange').count(),
                'yellow': all_qs.filter(level='yellow').count(),
                'blue': all_qs.filter(level='blue').count(),
            },
            'open_by_level': {
                'red': open_qs.filter(level='red').count(),
                'orange': open_qs.filter(level='orange').count(),
                'yellow': open_qs.filter(level='yellow').count(),
                'blue': open_qs.filter(level='blue').count(),
            },
            'filtered_total': base.count(),
        }
        return Response(stats)

    @action(detail=False, methods=['get'])
    def latest(self, request):
        limit = min(int(request.query_params.get('limit', 20)), 100)
        open_only = request.query_params.get('open_only', '1')
        qs = self.get_queryset()
        if open_only in ('1', 'true', 'True', ''):
            qs = qs.exclude(status=WarningRecord.Status.CLOSED)
        serializer = WarningRecordSerializer(qs[:limit], many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def related(self, request, pk=None):
        """关联隐患点 / 设备 / 最新监测 / 转移任务"""
        warning = self.get_object()
        point = warning.hazard_point
        devices = list(
            point.devices.order_by('-last_data_time').values(
                'id', 'code', 'name', 'device_type', 'status', 'battery', 'last_data_time'
            )[:20]
        )
        latest_data = []
        from monitoring.models import MonitorData
        for dev in point.devices.all()[:8]:
            row = (
                MonitorData.objects.filter(device=dev)
                .order_by('-record_time')
                .values('device_id', 'data_type', 'value', 'unit', 'record_time')
                .first()
            )
            if row:
                latest_data.append(row)

        evacuations = list(
            point.evacuation_tasks.order_by('-created_at').values(
                'id', 'code', 'status', 'total_people', 'transferred_people',
                'shelter_name', 'commander', 'grid_worker', 'grid_phone',
                'commander_phone',
            )[:5]
        )

        return Response({
            'warning': WarningRecordSerializer(warning).data,
            'hazard_point': {
                'id': point.id,
                'code': point.code,
                'name': point.name,
                'level': point.level,
                'status': point.status,
                'address': point.address,
                'town': point.town,
                'village': point.village,
                'threat_people': point.threat_people,
                'threat_houses': point.threat_houses,
                'responsible_person': point.responsible_person,
                'contact_phone': point.contact_phone,
            },
            'devices': devices,
            'latest_data': latest_data,
            'evacuations': evacuations,
        })

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        warning = self.get_object()
        if warning.status != WarningRecord.Status.PENDING:
            return Response(
                {'detail': f'当前状态「{warning.get_status_display()}」不可确认'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = WarningConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        warning.status = WarningRecord.Status.CONFIRMED
        warning.confirm_time = timezone.now()
        warning.confirm_user = serializer.validated_data.get('confirm_user') or _actor_name(
            request, 'confirm_user'
        )
        warning.save()
        point = warning.hazard_point
        if point.status in ('stable', 'attention'):
            point.status = 'warning'
            point.save(update_fields=['status', 'updated_at'])
        return Response(WarningRecordSerializer(warning).data)

    @action(detail=True, methods=['post'])
    def analyze(self, request, pk=None):
        """会商研判"""
        warning = self.get_object()
        if warning.status not in (
            WarningRecord.Status.CONFIRMED,
            WarningRecord.Status.ANALYZING,
        ):
            return Response(
                {'detail': '请先确认预警后再研判'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = WarningAnalyzeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        warning.status = WarningRecord.Status.ANALYZING
        detail = warning.call_detail or {}
        detail['analyze'] = {
            'note': serializer.validated_data.get('note', ''),
            'conclusion': serializer.validated_data.get('conclusion', ''),
            'at': timezone.now().isoformat(),
            'by': _actor_name(request),
        }
        warning.call_detail = detail
        warning.save()
        return Response(WarningRecordSerializer(warning).data)

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        warning = self.get_object()
        if warning.status not in (
            WarningRecord.Status.CONFIRMED,
            WarningRecord.Status.ANALYZING,
            WarningRecord.Status.PUBLISHED,
        ):
            return Response(
                {'detail': '仅已确认/研判中的预警可发布'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = WarningPublishSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        warning.status = WarningRecord.Status.PUBLISHED
        warning.publish_time = timezone.now()
        warning.publish_user = serializer.validated_data.get('publish_user') or _actor_name(
            request, 'publish_user'
        )
        warning.save()
        point = warning.hazard_point
        if warning.level in ('red', 'orange'):
            point.status = 'emergency' if warning.level == 'red' else 'warning'
            point.save(update_fields=['status', 'updated_at'])
        return Response(WarningRecordSerializer(warning).data)

    @action(detail=True, methods=['post'])
    def call(self, request, pk=None):
        """一键叫应：短信/语音/邮件/APP（受系统配置开关控制）"""
        from warning.channels.notify import build_call_content, dispatch_call

        warning = self.get_object()
        if warning.status == WarningRecord.Status.CLOSED:
            return Response({'detail': '已闭环预警不可叫应'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = WarningCallSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        point = warning.hazard_point
        targets = list(serializer.validated_data.get('targets') or [])
        if not targets:
            if point.contact_phone:
                targets.append(f'{point.responsible_person or "责任人"}:{point.contact_phone}')
            from users.models import User

            for role, label in (('leader', '值班领导'), ('grid_worker', '网格员')):
                u = User.objects.filter(role=role, is_active=True).exclude(phone='').first()
                if u and u.phone:
                    targets.append(f'{label}:{u.phone}')
        if not targets:
            return Response(
                {'detail': '无叫应目标：请填写手机号或维护隐患点/用户联系电话'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        caller = serializer.validated_data.get('caller') or _actor_name(request, 'caller')
        req_channels = serializer.validated_data.get('channels') or None
        content = build_call_content(
            warning_code=warning.code,
            hazard_name=point.name,
            level=warning.get_level_display(),
            trigger=warning.trigger_type,
        )

        # 系统配置开关
        try:
            from syshub.models import SystemConfig

            cfg = SystemConfig.get_solo()
        except Exception:  # noqa: BLE001
            cfg = None

        use = list(req_channels) if req_channels else []
        if not use:
            use = []
            if not cfg or cfg.notify_sms:
                use.append('sms')
            if not cfg or cfg.notify_call:
                use.append('voice')
        if not use:
            use = ['sms']

        dispatch = dispatch_call(targets=targets, content=content, channels=use)
        extra_results = []

        # 邮件
        if cfg and cfg.notify_email:
            try:
                from syshub.channels import send_email
                from users.models import User

                emails = list(
                    User.objects.filter(is_active=True)
                    .exclude(email='')
                    .values_list('email', flat=True)[:8]
                )
                if not emails and getattr(request.user, 'email', ''):
                    emails = [request.user.email]
                for em in emails:
                    r = send_email(
                        to=em,
                        subject=f'【地质灾害叫应】{warning.code}',
                        body=content,
                    )
                    extra_results.append(r.to_dict())
                    dispatch.results.append(r)  # type: ignore[arg-type]
            except Exception as exc:  # noqa: BLE001
                logger.warning('email notify skip: %s', exc)

        # APP / 站内
        if not cfg or cfg.notify_app:
            try:
                from syshub.channels import send_app_push

                r = send_app_push(
                    title=f'叫应 · {warning.code}',
                    body=content,
                    link=f'/warning/current?id={warning.id}',
                )
                extra_results.append(r.to_dict())
                dispatch.results.append(r)  # type: ignore[arg-type]
            except Exception as exc:  # noqa: BLE001
                logger.warning('app push skip: %s', exc)

    # TargetResult objects — email/app append ChannelResult with .ok
        oks = []
        for x in dispatch.results:
            if hasattr(x, 'ok'):
                oks.append(bool(x.ok))
            elif isinstance(x, dict):
                oks.append(bool(x.get('ok')))
        if oks and all(oks):
            dispatch.status = 'success'
            dispatch.ok = True
            dispatch.message = '叫应通道已全部送达'
        elif oks and any(oks):
            dispatch.status = 'partial'
            dispatch.ok = True
            dispatch.message = '部分目标叫应成功'
        elif oks:
            dispatch.status = 'failed'
            dispatch.ok = False
            dispatch.message = '叫应失败，请检查短信/语音/邮件网关配置'

        # to_dict 需兼容 ChannelResult
        def _dispatch_dict():
            base = {
                'ok': dispatch.ok,
                'status': dispatch.status,
                'channels': list(dispatch.channels),
                'message': dispatch.message,
                'results': [],
            }
            for r in dispatch.results:
                if hasattr(r, 'to_dict'):
                    base['results'].append(r.to_dict())
                elif hasattr(r, 'ok'):
                    base['results'].append({
                        'target': getattr(r, 'target', ''),
                        'phone': getattr(r, 'phone', ''),
                        'channel': getattr(r, 'channel', ''),
                        'ok': r.ok,
                        'detail': getattr(r, 'detail', ''),
                        'provider': getattr(r, 'provider', ''),
                    })
                elif isinstance(r, dict):
                    base['results'].append(r)
            return base

        warning.call_status = {
            'success': 'success',
            'partial': 'partial',
            'failed': 'failed',
        }.get(dispatch.status, dispatch.status)
        if dispatch.status == 'failed':
            warning.call_status = 'failed'
        warning.call_detail = {
            **(warning.call_detail or {}),
            'caller': caller,
            'targets': targets,
            'content': content,
            'called_at': timezone.now().isoformat(),
            'result': dispatch.message,
            'dispatch': _dispatch_dict(),
            'extra': extra_results,
        }
        if warning.status == WarningRecord.Status.PUBLISHED and dispatch.ok:
            warning.status = WarningRecord.Status.PROCESSING
        warning.save()

        try:
            from syshub.models import Notification

            Notification.objects.create(
                title=f'叫应{"成功" if dispatch.ok else "失败"} · {warning.code}',
                body=dispatch.message,
                level='warning' if dispatch.ok else 'danger',
                link=f'/warning/current?id={warning.id}',
                source=f'call:{warning.id}:{timezone.now().timestamp()}',
            )
        except Exception:  # noqa: BLE001
            pass

        data = WarningRecordSerializer(warning).data
        data['dispatch'] = _dispatch_dict()
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        """标记处置中"""
        warning = self.get_object()
        if warning.status not in (
            WarningRecord.Status.PUBLISHED,
            WarningRecord.Status.PROCESSING,
            WarningRecord.Status.ANALYZING,
            WarningRecord.Status.CONFIRMED,
        ):
            return Response(
                {'detail': '当前状态不可进入处置'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        warning.status = WarningRecord.Status.PROCESSING
        warning.save(update_fields=['status', 'updated_at'])
        return Response(WarningRecordSerializer(warning).data)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        warning = self.get_object()
        if warning.status == WarningRecord.Status.CLOSED:
            return Response({'detail': '预警已闭环'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = WarningCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        warning.status = WarningRecord.Status.CLOSED
        warning.close_time = timezone.now()
        warning.close_reason = serializer.validated_data['close_reason']
        warning.save()

        # 无其他未闭环预警时回落隐患点状态
        point = warning.hazard_point
        still_open = point.warnings.exclude(status='closed').exclude(pk=warning.pk).exists()
        if not still_open and point.status in ('warning', 'emergency'):
            point.status = 'attention'
            point.save(update_fields=['status', 'updated_at'])

        return Response(WarningRecordSerializer(warning).data)

    @action(detail=False, methods=['get'])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        buffer = StringIO()
        writer = csv.writer(buffer)
        writer.writerow([
            '编号', '隐患点编号', '隐患点', '等级', '状态', '触发类型',
            '置信度', '确认人', '发布人', '闭环原因', '创建时间', '闭环时间',
        ])
        for w in qs[:5000]:
            writer.writerow([
                w.code,
                w.hazard_point.code,
                w.hazard_point.name,
                w.get_level_display(),
                w.get_status_display(),
                w.trigger_type,
                w.confidence,
                w.confirm_user,
                w.publish_user,
                w.close_reason,
                w.created_at,
                w.close_time,
            ])
        resp = HttpResponse(
            buffer.getvalue().encode('utf-8-sig'),
            content_type='text/csv; charset=utf-8',
        )
        resp['Content-Disposition'] = 'attachment; filename="warning_records.csv"'
        return resp


class WarningModelViewSet(viewsets.ModelViewSet):
    """预警模型配置：入库→调参→启用→试算→引擎闭环"""

    queryset = WarningModel.objects.all().order_by('-is_active', '-updated_at', '-id')
    filterset_fields = ['model_type', 'is_active']
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['created_at', 'updated_at', 'code', 'is_active']

    def get_serializer_class(self):
        if self.action == 'list':
            return WarningModelListSerializer
        return WarningModelSerializer

    def destroy(self, request, *args, **kwargs):
        model = self.get_object()
        if model.is_active and model.model_type == WarningModel.ModelType.THRESHOLD:
            others = WarningModel.objects.filter(
                is_active=True, model_type=WarningModel.ModelType.THRESHOLD
            ).exclude(pk=model.pk).exists()
            if not others:
                return Response(
                    {'detail': '不能删除唯一启用的阈值模型，请先启用其他模型或停用本模型'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        code = model.code
        self.perform_destroy(model)
        return Response({'detail': f'已删除模型 {code}'})

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        qs = self.filter_queryset(self.get_queryset())
        return Response({
            'total': qs.count(),
            'active': qs.filter(is_active=True).count(),
            'inactive': qs.filter(is_active=False).count(),
            'by_type': {
                t: qs.filter(model_type=t).count()
                for t in WarningModel.ModelType.values
            },
            'primary_threshold_id': (
                WarningModel.objects.filter(
                    is_active=True, model_type='threshold'
                )
                .order_by('-updated_at')
                .values_list('id', flat=True)
                .first()
            ),
            'engine_resolve_hint': (
                '启用模型中：带 data_type 专用 params 者优先；'
                '启用 THRESH-RAIN 时请用 activate?exclusive=1 避免与默认模型并存误解'
            ),
        })

    @action(detail=False, methods=['get'])
    def next_code(self, request):
        mtype = request.query_params.get('model_type', 'threshold')
        return Response({'code': WarningModelSerializer._next_code(mtype)})

    def perform_create(self, serializer):
        model = serializer.save()
        self._ensure_single_active_threshold(model)

    def perform_update(self, serializer):
        model = serializer.save()
        self._ensure_single_active_threshold(model)

    def _ensure_single_active_threshold(self, model):
        """阈值模型启用时独占，避免多主模型导致闭环混乱"""
        if (
            model.is_active
            and model.model_type == WarningModel.ModelType.THRESHOLD
        ):
            WarningModel.objects.filter(
                is_active=True, model_type=WarningModel.ModelType.THRESHOLD
            ).exclude(pk=model.pk).update(is_active=False, updated_at=timezone.now())

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """启用模型；阈值类型可 exclusive=1 独占启用"""
        model = self.get_object()
        exclusive = request.data.get('exclusive', True)
        if isinstance(exclusive, str):
            exclusive = exclusive.lower() in ('1', 'true', 'yes')
        model.is_active = True
        model.save(update_fields=['is_active', 'updated_at'])
        deactivated = []
        if exclusive and model.model_type == WarningModel.ModelType.THRESHOLD:
            others = WarningModel.objects.filter(
                is_active=True, model_type=WarningModel.ModelType.THRESHOLD
            ).exclude(pk=model.pk)
            deactivated = list(others.values_list('code', flat=True))
            others.update(is_active=False, updated_at=timezone.now())
        data = WarningModelSerializer(model).data
        data['deactivated'] = deactivated
        return Response(data)

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        model = self.get_object()
        if model.is_active and model.model_type == WarningModel.ModelType.THRESHOLD:
            others = WarningModel.objects.filter(
                is_active=True, model_type=WarningModel.ModelType.THRESHOLD
            ).exclude(pk=model.pk).exists()
            if not others:
                return Response(
                    {'detail': '至少保留一个启用的阈值模型，供监测预警引擎使用'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        model.is_active = False
        model.save(update_fields=['is_active', 'updated_at'])
        return Response(WarningModelSerializer(model).data)

    @action(detail=True, methods=['post'])
    def loop_demo(self, request, pk=None):
        """
        闭环联调：独占启用本阈值模型 → 模拟设备标准报文入库 → 规则引擎建单。
        返回上报结果与预警单，便于跳转「实时预警」处置。
        """
        model = self.get_object()
        if model.model_type != WarningModel.ModelType.THRESHOLD:
            return Response(
                {
                    'detail': (
                        f'{model.get_model_type_display()}不参与监测上报自动建单；'
                        '请选用阈值模型跑闭环'
                    ),
                    'skipped': True,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1) 独占启用
        model.is_active = True
        model.save(update_fields=['is_active', 'updated_at'])
        WarningModel.objects.filter(
            is_active=True, model_type=WarningModel.ModelType.THRESHOLD
        ).exclude(pk=model.pk).update(is_active=False, updated_at=timezone.now())

        # 2) 标准报文（可被请求覆盖）
        presets = {
            'THRESH-RAIN': {
                'device_code': 'RAIN-001',
                'data_type': 'rainfall',
                'value': 65,
                'unit': 'mm',
            },
            'THRESH-NPR': {
                'device_code': 'NPR-001',
                'data_type': 'force',
                'value': 88,
                'unit': 'kN',
            },
            'THRESH-FIBER': {
                'device_code': 'FIB-001',
                'data_type': 'strain',
                'value': 650,
                'unit': 'με',
            },
            'THRESH-DISP': {
                'device_code': 'GNSS-001',
                'data_type': 'displacement',
                'channel': 'H',
                'value': 16,
                'unit': 'mm',
            },
            'THRESH-TEMP': {
                'device_code': 'CAM-001',
                'data_type': 'temperature',
                'value': 56,
                'unit': '℃',
            },
            'THRESH-DEFAULT': {
                'device_code': 'RAIN-001',
                'data_type': 'rainfall',
                'value': 55,
                'unit': 'mm',
            },
        }
        payload = dict(presets.get(model.code) or {
            'device_code': 'RAIN-001',
            'data_type': 'rainfall',
            'value': 55,
            'unit': 'mm',
        })
        for key in ('device_code', 'data_type', 'value', 'unit', 'channel', 'battery', 'signal'):
            if key in request.data and request.data.get(key) not in (None, ''):
                payload[key] = request.data.get(key)

        from monitoring.iot.ingest import process_telemetry_payload
        from monitoring.iot.tracing import new_trace_id
        from monitoring.models import MonitoringDevice

        device = MonitoringDevice.objects.filter(code=payload['device_code']).first()
        if not device:
            return Response(
                {'detail': f"设备不存在: {payload['device_code']}，请先初始化设备台账"},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not device.hazard_point_id:
            return Response(
                {
                    'detail': (
                        f"设备 {device.code} 未关联隐患点，超阈不会建预警单；"
                        '请先在监测设备中绑定隐患点'
                    ),
                    'device_code': device.code,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        tid = new_trace_id()
        topic = f"geo/telemetry/{payload['device_code']}"
        try:
            ingest = process_telemetry_payload(
                payload, topic=topic, persist=True, trace_id=tid
            )
        except Exception as exc:  # noqa: BLE001
            return Response(
                {'detail': str(exc), 'trace_id': tid, 'payload': payload},
                status=status.HTTP_400_BAD_REQUEST,
            )

        warnings = ingest.get('warnings') or []
        hit = next((w for w in warnings if w.get('triggered') or w.get('would_trigger')), None)
        warning_id = (hit or {}).get('warning_id')
        warning_code = (hit or {}).get('warning_code')

        return Response(
            {
                'ok': True,
                'step': {
                    '1_activate': model.code,
                    '2_ingest': payload,
                    '3_engine': hit,
                    '4_dispose': '/warning/current',
                },
                'model_code': model.code,
                'trace_id': tid,
                'ingest': ingest,
                'warning_id': warning_id,
                'warning_code': warning_code,
                'renewed': (hit or {}).get('renewed'),
                'created': (hit or {}).get('created'),
                'message': (
                    f"已启用 {model.code} 并上报 {payload['device_code']} "
                    f"{payload['data_type']}={payload['value']}；"
                    + (
                        f"预警单 {(warning_code or warning_id)}，请前往实时预警处置"
                        if warning_id
                        else (
                            '已触发但被去重续报' if (hit or {}).get('renewed')
                            else '未建单，请查看 warnings 详情'
                        )
                    )
                ),
            }
        )

    @action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        """试算：阈值 / 趋势 / ML / 融合（不落库）"""
        model = self.get_object()
        serializer = WarningModelTestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data_type = serializer.validated_data['data_type']
        value = float(serializer.validated_data['value'])
        device_id = request.data.get('device_id')
        channel = str(request.data.get('channel') or '')

        from warning.engines.advanced import evaluate_ml, evaluate_trend, merge_fusion
        from warning.engines.rule_engine import DEFAULT_THRESHOLDS

        params = dict(model.params or {})
        type_params = params.get(data_type) if isinstance(params.get(data_type), dict) else {}
        params = {**params, **(type_params or {})}
        params.setdefault('yellow', float(model.yellow_threshold or 0))
        params.setdefault('orange', float(model.orange_threshold or 0))
        params.setdefault('red', float(model.red_threshold or 0))

        device = None
        if device_id:
            from monitoring.models import MonitoringDevice
            device = MonitoringDevice.objects.filter(pk=device_id).first()

        if model.model_type == 'trend':
            if not device:
                return Response({'detail': '趋势试算需要 device_id'}, status=status.HTTP_400_BAD_REQUEST)
            result = evaluate_trend(device, data_type, channel, value, params)
            return Response({'model_id': model.id, 'model_code': model.code, 'model_type': model.model_type, **result})

        if model.model_type == 'ml':
            if not device:
                return Response({'detail': 'ML试算需要 device_id'}, status=status.HTTP_400_BAD_REQUEST)
            result = evaluate_ml(device, data_type, channel, value, params)
            return Response({'model_id': model.id, 'model_code': model.code, 'model_type': model.model_type, **result})

        if model.model_type == 'fusion':
            parts = []
            base = dict(DEFAULT_THRESHOLDS.get(data_type, {}))
            base.update({
                'yellow': float(model.yellow_threshold or base.get('yellow', 0)),
                'orange': float(model.orange_threshold or base.get('orange', 0)),
                'red': float(model.red_threshold or base.get('red', 0)),
            })
            thr_level = None
            if value >= float(base.get('red', 1e18)):
                thr_level = 'red'
            elif value >= float(base.get('orange', 1e18)):
                thr_level = 'orange'
            elif value >= float(base.get('yellow', 1e18)):
                thr_level = 'yellow'
            if thr_level:
                parts.append({'triggered': True, 'engine': 'threshold', 'level': thr_level})
            if device:
                tr = evaluate_trend(device, data_type, channel, value, params)
                if tr.get('triggered'):
                    parts.append(tr)
                mr = evaluate_ml(device, data_type, channel, value, params)
                if mr.get('triggered'):
                    parts.append(mr)
            result = merge_fusion(parts, params.get('weights'))
            return Response({'model_id': model.id, 'model_code': model.code, 'model_type': model.model_type, **result})

        base = dict(DEFAULT_THRESHOLDS.get(data_type, {}))
        if isinstance(type_params, dict) and type_params:
            base.update({k: float(v) for k, v in type_params.items() if v is not None})
        else:
            base.update({
                'yellow': float(model.yellow_threshold),
                'orange': float(model.orange_threshold),
                'red': float(model.red_threshold),
            })

        level = None
        if value >= float(base.get('red', 1e18)):
            level = 'red'
        elif value >= float(base.get('orange', 1e18)):
            level = 'orange'
        elif value >= float(base.get('yellow', 1e18)):
            level = 'yellow'

        return Response({
            'model_id': model.id,
            'model_code': model.code,
            'model_type': model.model_type,
            'data_type': data_type,
            'value': value,
            'thresholds': {
                'yellow': float(base.get('yellow', 0)),
                'orange': float(base.get('orange', 0)),
                'red': float(base.get('red', 0)),
            },
            'level': level,
            'triggered': level is not None,
            'engine': 'threshold',
            'message': (
                f'将触发{dict(WarningRecord.Level.choices).get(level, level)}预警'
                if level else '未达阈值，不会建单'
            ),
            'engine_primary': WarningModelSerializer().get_is_primary(model),
        })

    @action(detail=False, methods=['get'])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        buffer = StringIO()
        writer = csv.writer(buffer)
        writer.writerow([
            '编号', '名称', '类型', '黄色阈值', '橙色阈值', '红色阈值',
            '启用', '描述', '更新时间',
        ])
        for m in qs:
            writer.writerow([
                m.code, m.name, m.get_model_type_display(),
                m.yellow_threshold, m.orange_threshold, m.red_threshold,
                '是' if m.is_active else '否', m.description, m.updated_at,
            ])
        resp = HttpResponse(
            buffer.getvalue().encode('utf-8-sig'),
            content_type='text/csv; charset=utf-8',
        )
        resp['Content-Disposition'] = 'attachment; filename="warning_models.csv"'
        return resp
