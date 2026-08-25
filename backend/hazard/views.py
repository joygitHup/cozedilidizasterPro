"""隐患台账视图"""
import csv
from io import StringIO

from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import HazardPoint, InspectionTask, RiskSlope
from .region_views import build_tree
from .serializers import (
    HazardPointListSerializer,
    HazardPointSerializer,
    HazardPointWriteSerializer,
    InspectionTaskListSerializer,
    InspectionTaskSerializer,
    RiskSlopeListSerializer,
    RiskSlopeSerializer,
)


def _split_csv(raw):
    if not raw:
        return []
    return [x.strip() for x in str(raw).split(',') if x.strip()]


class HazardPointViewSet(viewsets.ModelViewSet):
    """隐患点视图集：列表/详情/增删改 + 区域树/统计/导出"""

    queryset = HazardPoint.objects.all().order_by('-updated_at', '-id')
    filterset_fields = [
        'level', 'status', 'type', 'village', 'town', 'county', 'city', 'district',
    ]
    search_fields = [
        'name', 'code', 'address', 'responsible_person',
        'village', 'town', 'county', 'city', 'district',
    ]
    ordering_fields = ['created_at', 'updated_at', 'level', 'threat_people', 'code']

    def get_serializer_class(self):
        if self.action == 'list':
            return HazardPointListSerializer
        if self.action in ('create', 'update', 'partial_update'):
            return HazardPointWriteSerializer
        return HazardPointSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        cities = _split_csv(self.request.query_params.get('cities'))
        districts = _split_csv(self.request.query_params.get('districts'))
        counties = _split_csv(self.request.query_params.get('counties'))
        villages = _split_csv(self.request.query_params.get('villages'))
        # 兼容旧参数
        towns = _split_csv(self.request.query_params.get('towns'))
        if towns and not districts:
            districts = towns

        if cities:
            qs = qs.filter(city__in=cities)
        if districts:
            qs = qs.filter(district__in=districts)
        if counties:
            qs = qs.filter(county__in=counties)
        if villages:
            qs = qs.filter(village__in=villages)
        return qs

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        open_warnings = instance.warnings.exclude(status='closed').count()
        if open_warnings:
            return Response(
                {
                    'detail': f'该隐患点仍有 {open_warnings} 条未闭环预警，无法删除。请先闭环预警。',
                    'open_warning_count': open_warnings,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        active_devices = instance.devices.filter(status='online').count()
        if active_devices:
            return Response(
                {
                    'detail': f'该隐患点仍有 {active_devices} 台在线设备关联，请先解绑或下线设备后再删除。',
                    'online_device_count': active_devices,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        code = instance.code
        self.perform_destroy(instance)
        return Response({'detail': f'已删除隐患点 {code}'}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """隐患点统计"""
        queryset = self.filter_queryset(self.get_queryset())
        stats = {
            'total': queryset.count(),
            'by_level': {
                'red': queryset.filter(level='red').count(),
                'orange': queryset.filter(level='orange').count(),
                'yellow': queryset.filter(level='yellow').count(),
                'blue': queryset.filter(level='blue').count(),
            },
            'by_status': {
                'stable': queryset.filter(status='stable').count(),
                'attention': queryset.filter(status='attention').count(),
                'warning': queryset.filter(status='warning').count(),
                'emergency': queryset.filter(status='emergency').count(),
            },
            'total_threat_people': sum(q.threat_people for q in queryset),
        }
        return Response(stats)

    @action(detail=False, methods=['get'])
    def map_data(self, request):
        """获取地图数据"""
        queryset = self.filter_queryset(self.get_queryset())
        data = [{
            'id': p.id,
            'code': p.code,
            'name': p.name,
            'level': p.level,
            'status': p.status,
            'longitude': float(p.longitude),
            'latitude': float(p.latitude),
        } for p in queryset]
        return Response(data)

    @action(detail=False, methods=['get'])
    def regions(self, request):
        """区域树：市 → 区 → 县 → 村（Region 表，可伸缩筛选）"""
        return Response(build_tree())

    @action(detail=False, methods=['get'])
    def next_code(self, request):
        """预览下一个可用编号"""
        return Response({'code': HazardPointWriteSerializer._next_code()})

    @action(detail=True, methods=['get'])
    def related(self, request, pk=None):
        """详情关联：设备 / 未闭环预警 / 排查任务"""
        point = self.get_object()
        devices = list(
            point.devices.values(
                'id', 'code', 'name', 'device_type', 'status', 'last_data_time'
            )[:20]
        )
        warnings = list(
            point.warnings.exclude(status='closed')
            .order_by('-created_at')
            .values('id', 'code', 'level', 'status', 'trigger_type', 'created_at')[:10]
        )
        tasks = list(
            point.inspection_tasks.order_by('-created_at').values(
                'id', 'title', 'status', 'priority', 'assigned_to', 'planned_date'
            )[:10]
        )
        return Response({
            'devices': devices,
            'warnings': warnings,
            'inspection_tasks': tasks,
        })

    @action(detail=True, methods=['post'])
    def change_status(self, request, pk=None):
        """单独变更状态（处置闭环）"""
        point = self.get_object()
        new_status = request.data.get('status')
        valid = {c.value for c in HazardPoint.Status}
        if new_status not in valid:
            return Response(
                {'detail': f'无效状态，可选: {", ".join(sorted(valid))}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # 有未闭环红色预警时不允许直接标为稳定
        if new_status == 'stable':
            red_open = point.warnings.filter(level='red').exclude(status='closed').exists()
            if red_open:
                return Response(
                    {'detail': '存在未闭环红色预警，不能标记为稳定'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        point.status = new_status
        point.save(update_fields=['status', 'updated_at'])
        return Response(HazardPointSerializer(point).data)

    @action(detail=False, methods=['get'])
    def export(self, request):
        """导出 CSV"""
        queryset = self.filter_queryset(self.get_queryset())
        buffer = StringIO()
        writer = csv.writer(buffer)
        writer.writerow([
            '编号', '名称', '类型', '等级', '状态', '县', '镇', '村', '地址',
            '经度', '纬度', '威胁人数', '威胁房屋', '责任人', '联系电话', '稳定性系数',
        ])
        for p in queryset:
            writer.writerow([
                p.code, p.name, p.get_type_display(), p.get_level_display(),
                p.get_status_display(), p.county, p.town, p.village, p.address,
                p.longitude, p.latitude, p.threat_people, p.threat_houses,
                p.responsible_person, p.contact_phone, p.stability_coefficient,
            ])
        resp = HttpResponse(buffer.getvalue().encode('utf-8-sig'), content_type='text/csv; charset=utf-8')
        resp['Content-Disposition'] = 'attachment; filename="hazard_points.csv"'
        return resp


class RiskSlopeViewSet(viewsets.ModelViewSet):
    """风险斜坡：列表/详情/增删改 + 统计/编号/关联/导出"""

    queryset = RiskSlope.objects.select_related('hazard_point').all().order_by('-updated_at', '-id')
    filterset_fields = ['risk_level', 'hazard_point']
    search_fields = ['name', 'code', 'description', 'hazard_point__name', 'hazard_point__code']
    ordering_fields = ['created_at', 'updated_at', 'area', 'slope_angle', 'risk_level', 'code']

    def get_serializer_class(self):
        if self.action == 'list':
            return RiskSlopeListSerializer
        return RiskSlopeSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        coverage = self.request.query_params.get('monitor_coverage')
        if coverage:
            # 在内存过滤监测覆盖（数据量可控）；也可后续改为注解
            matched_ids = [
                s.id for s in qs
                if RiskSlopeSerializer._coverage_code(s) == coverage
            ]
            qs = qs.filter(id__in=matched_ids)
        unlinked = self.request.query_params.get('unlinked')
        if unlinked in ('1', 'true', 'True'):
            qs = qs.filter(hazard_point__isnull=True)
        return qs

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        # 高风险且关联隐患点仍有未闭环预警时，禁止删除
        if instance.risk_level == 'high' and instance.hazard_point_id:
            open_n = instance.hazard_point.warnings.exclude(status='closed').count()
            if open_n:
                return Response(
                    {
                        'detail': f'高风险斜坡关联隐患点仍有 {open_n} 条未闭环预警，无法删除。',
                        'open_warning_count': open_n,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        code = instance.code
        self.perform_destroy(instance)
        return Response({'detail': f'已删除风险斜坡 {code}'}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        items = list(queryset)
        by_coverage = {'unlinked': 0, 'pending': 0, 'partial': 0, 'full': 0, 'offline': 0}
        for s in items:
            by_coverage[RiskSlopeSerializer._coverage_code(s)] = (
                by_coverage.get(RiskSlopeSerializer._coverage_code(s), 0) + 1
            )
        return Response({
            'total': len(items),
            'by_level': {
                'high': sum(1 for s in items if s.risk_level == 'high'),
                'medium': sum(1 for s in items if s.risk_level == 'medium'),
                'low': sum(1 for s in items if s.risk_level == 'low'),
            },
            'by_coverage': by_coverage,
            'linked': sum(1 for s in items if s.hazard_point_id),
            'unlinked': sum(1 for s in items if not s.hazard_point_id),
            'total_area': float(sum((s.area or 0) for s in items)),
        })

    @action(detail=False, methods=['get'])
    def next_code(self, request):
        return Response({'code': RiskSlopeSerializer._next_code()})

    @action(detail=True, methods=['get'])
    def related(self, request, pk=None):
        """关联隐患点的设备与预警，形成监测-预警闭环视图"""
        slope = self.get_object()
        point = slope.hazard_point
        if not point:
            return Response({
                'hazard_point': None,
                'devices': [],
                'warnings': [],
                'message': '未关联隐患点',
            })
        devices = list(
            point.devices.values(
                'id', 'code', 'name', 'device_type', 'status', 'last_data_time'
            )[:20]
        )
        warnings = list(
            point.warnings.exclude(status='closed')
            .order_by('-created_at')
            .values('id', 'code', 'level', 'status', 'trigger_type', 'created_at')[:10]
        )
        return Response({
            'hazard_point': {
                'id': point.id,
                'code': point.code,
                'name': point.name,
                'level': point.level,
                'status': point.status,
            },
            'devices': devices,
            'warnings': warnings,
            'monitor_coverage': RiskSlopeSerializer._coverage_code(slope),
        })

    @action(detail=True, methods=['post'])
    def bind_hazard(self, request, pk=None):
        """绑定/换绑隐患点；可同步坐标"""
        slope = self.get_object()
        hazard_id = request.data.get('hazard_point')
        sync_coords = request.data.get('sync_coords', True)
        if not hazard_id:
            return Response({'detail': '请提供 hazard_point'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            point = HazardPoint.objects.get(pk=hazard_id)
        except HazardPoint.DoesNotExist:
            return Response({'detail': '隐患点不存在'}, status=status.HTTP_404_NOT_FOUND)
        slope.hazard_point = point
        update_fields = ['hazard_point', 'updated_at']
        if sync_coords:
            slope.longitude = point.longitude
            slope.latitude = point.latitude
            update_fields.extend(['longitude', 'latitude'])
        slope.save(update_fields=update_fields)
        return Response(RiskSlopeSerializer(slope).data)

    @action(detail=True, methods=['post'])
    def change_level(self, request, pk=None):
        """变更风险等级"""
        slope = self.get_object()
        new_level = request.data.get('risk_level')
        valid = {c.value for c in RiskSlope.RiskLevel}
        if new_level not in valid:
            return Response(
                {'detail': f'无效等级，可选: {", ".join(sorted(valid))}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if new_level == 'high' and not slope.hazard_point_id:
            return Response(
                {'detail': '升为高风险前必须先关联隐患点'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        slope.risk_level = new_level
        slope.save(update_fields=['risk_level', 'updated_at'])
        return Response(RiskSlopeSerializer(slope).data)

    @action(detail=False, methods=['get'])
    def export(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        buffer = StringIO()
        writer = csv.writer(buffer)
        writer.writerow([
            '编号', '名称', '风险等级', '面积(km²)', '坡度(°)',
            '关联隐患点编号', '关联隐患点名称', '监测覆盖',
            '经度', '纬度', '描述',
        ])
        for s in queryset:
            writer.writerow([
                s.code, s.name, s.get_risk_level_display(), s.area, s.slope_angle,
                s.hazard_point.code if s.hazard_point else '',
                s.hazard_point.name if s.hazard_point else '',
                RiskSlopeSerializer().get_monitor_coverage_display(s),
                s.longitude, s.latitude, s.description,
            ])
        resp = HttpResponse(
            buffer.getvalue().encode('utf-8-sig'),
            content_type='text/csv; charset=utf-8',
        )
        resp['Content-Disposition'] = 'attachment; filename="risk_slopes.csv"'
        return resp


class InspectionTaskViewSet(viewsets.ModelViewSet):
    """排查任务：创建→派发→执行→完成/取消，与隐患点状态闭环"""

    queryset = InspectionTask.objects.select_related('hazard_point').all().order_by(
        '-planned_date', '-id'
    )
    filterset_fields = ['status', 'priority', 'task_type', 'assigned_to', 'hazard_point']
    search_fields = [
        'title', 'code', 'description', 'assigned_to', 'route_desc',
        'hazard_point__name', 'hazard_point__code',
    ]
    ordering_fields = ['planned_date', 'created_at', 'priority', 'status', 'completed_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return InspectionTaskListSerializer
        return InspectionTaskSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        overdue = self.request.query_params.get('overdue')
        if overdue in ('1', 'true', 'True'):
            from django.utils import timezone
            today = timezone.localdate()
            qs = qs.filter(
                status__in=['pending', 'in_progress'],
                planned_date__lt=today,
            )
        records_only = self.request.query_params.get('records')
        if records_only in ('1', 'true', 'True'):
            qs = qs.filter(status='completed')
        dispatch_only = self.request.query_params.get('dispatch')
        if dispatch_only in ('1', 'true', 'True'):
            qs = qs.exclude(status__in=['completed', 'cancelled'])
        unassigned = self.request.query_params.get('unassigned')
        if unassigned in ('1', 'true', 'True'):
            qs = qs.filter(assigned_to='')
        return qs

    def destroy(self, request, *args, **kwargs):
        task = self.get_object()
        if task.status == InspectionTask.Status.IN_PROGRESS:
            return Response(
                {'detail': '进行中的任务不能删除，请先取消或完成'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if task.status == InspectionTask.Status.COMPLETED:
            return Response(
                {'detail': '已完成任务已形成巡查记录，不能删除'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        code = task.code
        self.perform_destroy(task)
        return Response({'detail': f'已删除排查任务 {code}'}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        qs = self.filter_queryset(self.get_queryset())
        from django.utils import timezone
        today = timezone.localdate()
        overdue = qs.filter(
            status__in=['pending', 'in_progress'], planned_date__lt=today
        ).count()
        return Response({
            'total': qs.count(),
            'by_status': {
                'pending': qs.filter(status='pending').count(),
                'in_progress': qs.filter(status='in_progress').count(),
                'completed': qs.filter(status='completed').count(),
                'cancelled': qs.filter(status='cancelled').count(),
            },
            'by_type': {
                t: qs.filter(task_type=t).count()
                for t in InspectionTask.TaskType.values
            },
            'overdue': overdue,
            'high_priority_open': qs.filter(
                priority='high', status__in=['pending', 'in_progress']
            ).count(),
            'issue_total': sum(t.issue_count for t in qs.filter(status='completed')),
        })

    @action(detail=False, methods=['get'])
    def next_code(self, request):
        return Response({'code': InspectionTaskSerializer._next_code()})

    @action(detail=False, methods=['get'])
    def dispatch_stats(self, request):
        """任务派发看板统计（不含已完成/已取消）"""
        from django.utils import timezone

        qs = InspectionTask.objects.exclude(
            status__in=['completed', 'cancelled']
        )
        today = timezone.localdate()
        return Response({
            'open_total': qs.count(),
            'unassigned': qs.filter(assigned_to='').count(),
            'pending': qs.filter(status='pending').count(),
            'in_progress': qs.filter(status='in_progress').count(),
            'overdue': qs.filter(
                status__in=['pending', 'in_progress'],
                planned_date__lt=today,
            ).count(),
            'assigned_pending': qs.filter(status='pending').exclude(assigned_to='').count(),
        })

    @action(detail=False, methods=['get'])
    def workers(self, request):
        """可选执行人：网格员 / 值班员 / 领导"""
        from users.models import User

        qs = User.objects.filter(
            is_active=True,
            role__in=['grid_worker', 'operator', 'leader'],
        ).order_by('role', 'username')
        search = (request.query_params.get('search') or '').strip()
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(username__icontains=search) | Q(first_name__icontains=search)
            )
        results = []
        for u in qs[:50]:
            name = (u.first_name or '').strip() or u.username
            results.append({
                'id': u.id,
                'username': u.username,
                'name': name,
                'phone': getattr(u, 'phone', '') or '',
                'role': u.role,
                'role_display': u.get_role_display(),
                'village': getattr(u, 'village', '') or '',
            })
        return Response({'count': len(results), 'results': results})

    @action(detail=False, methods=['post'])
    def create_dispatch(self, request):
        """
        创建并派发（闭环入口）
        body 同创建任务，且必须含 assigned_to
        """
        assignee = (request.data.get('assigned_to') or '').strip()
        if not assignee:
            return Response(
                {'detail': '创建并派发必须指定执行人'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        data = {**request.data, 'assigned_to': assignee, 'status': 'pending'}
        ser = InspectionTaskSerializer(data=data)
        ser.is_valid(raise_exception=True)
        task = ser.save()
        return Response(InspectionTaskSerializer(task).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='assign')
    def assign(self, request, pk=None):
        """派发/改派执行人"""
        task = self.get_object()
        if task.status in (
            InspectionTask.Status.COMPLETED,
            InspectionTask.Status.CANCELLED,
        ):
            return Response(
                {'detail': '已完成或已取消的任务不能再派发'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from datetime import datetime, date

        assignee = (request.data.get('assigned_to') or '').strip()
        if not assignee:
            return Response({'detail': '请指定执行人'}, status=status.HTTP_400_BAD_REQUEST)
        task.assigned_to = assignee
        task.assigned_phone = request.data.get('assigned_phone', task.assigned_phone) or ''
        if request.data.get('planned_date'):
            raw = request.data['planned_date']
            if isinstance(raw, date) and not isinstance(raw, datetime):
                task.planned_date = raw
            else:
                try:
                    task.planned_date = datetime.strptime(str(raw)[:10], '%Y-%m-%d').date()
                except ValueError:
                    return Response(
                        {'detail': '计划日期格式无效，应为 YYYY-MM-DD'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
        if request.data.get('route_desc') is not None:
            task.route_desc = request.data.get('route_desc') or ''
        if request.data.get('checkpoint_count') is not None:
            try:
                task.checkpoint_count = max(1, int(request.data['checkpoint_count']))
            except (TypeError, ValueError):
                pass
        task.save()
        # 刷新实例，避免 planned_date 仍为未解析字符串导致序列化报错
        task.refresh_from_db()
        return Response(InspectionTaskSerializer(task).data)

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """开始执行：待执行 → 进行中"""
        from django.utils import timezone

        task = self.get_object()
        if task.status != InspectionTask.Status.PENDING:
            return Response(
                {'detail': '仅待执行任务可开始'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not task.assigned_to:
            return Response(
                {'detail': '请先派发执行人再开始任务'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        task.status = InspectionTask.Status.IN_PROGRESS
        task.started_at = timezone.now()
        task.save(update_fields=['status', 'started_at', 'updated_at'])
        return Response(InspectionTaskSerializer(task).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """完成任务并回写隐患点状态（发现问题则提升关注）"""
        from django.utils import timezone

        task = self.get_object()
        if task.status not in (
            InspectionTask.Status.PENDING,
            InspectionTask.Status.IN_PROGRESS,
        ):
            return Response(
                {'detail': '当前状态不可完成'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        result = (request.data.get('result') or '').strip()
        if not result:
            return Response(
                {'detail': '请填写排查结果，形成巡查记录闭环'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        issue_count = int(request.data.get('issue_count', 0) or 0)
        if issue_count < 0:
            return Response({'detail': '问题数不能为负'}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        if not task.started_at:
            task.started_at = now
        duration = int((now - task.started_at).total_seconds() // 60)
        if request.data.get('duration_minutes') is not None:
            try:
                duration = max(0, int(request.data['duration_minutes']))
            except (TypeError, ValueError):
                pass

        task.status = InspectionTask.Status.COMPLETED
        task.result = result
        task.issue_count = issue_count
        task.completed_at = now
        task.duration_minutes = duration
        if request.data.get('photos') is not None:
            task.photos = request.data.get('photos') or []
        task.save()

        # 业务闭环：发现问题 → 提升隐患点状态
        sync_hazard = request.data.get('sync_hazard_status', True)
        hazard_updated = None
        if sync_hazard and task.hazard_point_id and issue_count > 0:
            point = task.hazard_point
            if point.status == 'stable':
                point.status = 'attention'
                point.save(update_fields=['status', 'updated_at'])
                hazard_updated = {'id': point.id, 'status': point.status}
            elif issue_count >= 3 and point.status == 'attention':
                point.status = 'warning'
                point.save(update_fields=['status', 'updated_at'])
                hazard_updated = {'id': point.id, 'status': point.status}

        data = InspectionTaskSerializer(task).data
        data['hazard_status_updated'] = hazard_updated
        return Response(data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """取消任务"""
        task = self.get_object()
        if task.status == InspectionTask.Status.COMPLETED:
            return Response(
                {'detail': '已完成任务不能取消'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if task.status == InspectionTask.Status.CANCELLED:
            return Response(InspectionTaskSerializer(task).data)
        reason = (request.data.get('reason') or '').strip()
        task.status = InspectionTask.Status.CANCELLED
        if reason:
            task.result = f"[已取消] {reason}"
        task.save(update_fields=['status', 'result', 'updated_at'])
        return Response(InspectionTaskSerializer(task).data)

    @action(detail=False, methods=['get'])
    def export(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        buffer = StringIO()
        writer = csv.writer(buffer)
        writer.writerow([
            '编号', '标题', '类型', '状态', '优先级', '执行人', '计划日期',
            '关联隐患点', '路线', '检查点', '问题数', '耗时(分)', '结果',
        ])
        for t in queryset:
            writer.writerow([
                t.code, t.title, t.get_task_type_display(), t.get_status_display(),
                t.get_priority_display(), t.assigned_to, t.planned_date,
                t.hazard_point.code if t.hazard_point else '',
                t.route_desc, t.checkpoint_count, t.issue_count,
                t.duration_minutes, t.result,
            ])
        resp = HttpResponse(
            buffer.getvalue().encode('utf-8-sig'),
            content_type='text/csv; charset=utf-8',
        )
        resp['Content-Disposition'] = 'attachment; filename="inspection_tasks.csv"'
        return resp
