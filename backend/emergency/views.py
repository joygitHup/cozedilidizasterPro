"""应急视图"""
import csv
from copy import deepcopy
from io import StringIO

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import EmergencyPlan, EmergencySupply, EvacuationTask
from .serializers import (
    COLOR_LEVEL,
    LEVEL_COLOR,
    EmergencyPlanListSerializer,
    EmergencyPlanSerializer,
    EmergencySupplySerializer,
    EvacuationTaskListSerializer,
    EvacuationTaskSerializer,
)


class EmergencyPlanViewSet(viewsets.ModelViewSet):
    """预案管理：编制→生效→匹配预警→启动响应→归档闭环"""

    queryset = EmergencyPlan.objects.all().order_by('-updated_at', '-id')
    filterset_fields = ['level', 'status']
    search_fields = ['name', 'code', 'description', 'commander']
    ordering_fields = ['created_at', 'updated_at', 'level', 'code']

    def get_serializer_class(self):
        if self.action == 'list':
            return EmergencyPlanListSerializer
        return EmergencyPlanSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        color = self.request.query_params.get('color_level')
        if color and color in COLOR_LEVEL:
            qs = qs.filter(level=COLOR_LEVEL[color])
        return qs

    def destroy(self, request, *args, **kwargs):
        plan = self.get_object()
        if plan.status == EmergencyPlan.Status.ACTIVE:
            return Response(
                {'detail': '生效中的预案不可删除，请先归档'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        code = plan.code
        self.perform_destroy(plan)
        return Response({'detail': f'已删除预案 {code}'})

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        qs = self.filter_queryset(self.get_queryset())
        return Response({
            'total': qs.count(),
            'draft': qs.filter(status='draft').count(),
            'active': qs.filter(status='active').count(),
            'archived': qs.filter(status='archived').count(),
            'by_level': {
                lv: qs.filter(level=lv).count() for lv in EmergencyPlan.Level.values
            },
            'by_color': {
                color: qs.filter(level=lv).count()
                for lv, color in LEVEL_COLOR.items()
            },
        })

    @action(detail=False, methods=['get'])
    def next_code(self, request):
        return Response({'code': EmergencyPlanSerializer._next_code()})

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """草案/归档 → 生效"""
        plan = self.get_object()
        if plan.status == EmergencyPlan.Status.ACTIVE:
            return Response(
                {'detail': '预案已生效'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not (plan.content or {}).get('steps'):
            return Response(
                {'detail': '请先配置处置步骤后再生效'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        plan.status = EmergencyPlan.Status.ACTIVE
        plan.save(update_fields=['status', 'updated_at'])
        return Response(EmergencyPlanSerializer(plan).data)

    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        """生效/草案 → 归档"""
        plan = self.get_object()
        if plan.status == EmergencyPlan.Status.ARCHIVED:
            return Response({'detail': '预案已归档'}, status=status.HTTP_400_BAD_REQUEST)
        plan.status = EmergencyPlan.Status.ARCHIVED
        plan.save(update_fields=['status', 'updated_at'])
        return Response(EmergencyPlanSerializer(plan).data)

    @action(detail=True, methods=['post'])
    def revise(self, request, pk=None):
        """基于现有预案生成修订草案（新编号）"""
        plan = self.get_object()
        new_code = EmergencyPlanSerializer._next_code()
        clone = EmergencyPlan.objects.create(
            code=new_code,
            name=f'{plan.name}（修订）',
            level=plan.level,
            status=EmergencyPlan.Status.DRAFT,
            description=plan.description,
            content=deepcopy(plan.content or {}),
            applicable_scenarios=list(plan.applicable_scenarios or []),
            commander=plan.commander,
            commander_phone=plan.commander_phone,
        )
        return Response(EmergencyPlanSerializer(clone).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def match(self, request):
        """按预警等级/预警单匹配生效预案（响应闭环入口）"""
        warning_id = request.query_params.get('warning_id')
        color = request.query_params.get('color_level') or request.query_params.get('level')
        warning = None
        if warning_id:
            from warning.models import WarningRecord
            try:
                warning = WarningRecord.objects.select_related('hazard_point').get(pk=warning_id)
            except WarningRecord.DoesNotExist:
                return Response({'detail': '预警不存在'}, status=status.HTTP_404_NOT_FOUND)
            color = warning.level
        if color in COLOR_LEVEL:
            level = COLOR_LEVEL[color]
        elif color in EmergencyPlan.Level.values:
            level = color
            color = LEVEL_COLOR.get(level)
        else:
            return Response(
                {'detail': '请提供 warning_id 或 color_level(red/orange/yellow/blue)'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        plans = EmergencyPlan.objects.filter(
            status=EmergencyPlan.Status.ACTIVE, level=level
        ).order_by('-updated_at')
        return Response({
            'color_level': color,
            'response_level': level,
            'warning': (
                {
                    'id': warning.id,
                    'code': warning.code,
                    'level': warning.level,
                    'hazard_point': warning.hazard_point.name,
                    'status': warning.status,
                }
                if warning else None
            ),
            'count': plans.count(),
            'results': EmergencyPlanListSerializer(plans, many=True).data,
        })

    @action(detail=True, methods=['get'])
    def related(self, request, pk=None):
        """关联：同等级未闭环预警、转移任务、物资概况"""
        plan = self.get_object()
        color = LEVEL_COLOR.get(plan.level, 'blue')
        from warning.models import WarningRecord

        open_warnings = list(
            WarningRecord.objects.filter(level=color)
            .exclude(status='closed')
            .select_related('hazard_point')
            .order_by('-created_at')
            .values(
                'id', 'code', 'level', 'status', 'trigger_type',
                'hazard_point__code', 'hazard_point__name', 'created_at',
            )[:15]
        )
        # 转移任务：关联这些预警或同隐患点
        warning_ids = [w['id'] for w in open_warnings]
        evacuations = list(
            EvacuationTask.objects.filter(warning_id__in=warning_ids)
            .order_by('-created_at')
            .values(
                'id', 'code', 'status', 'total_people', 'transferred_people',
                'shelter_name', 'hazard_point__name',
            )[:10]
        ) if warning_ids else []

        supplies = list(
            EmergencySupply.objects.order_by('-quantity').values(
                'id', 'code', 'name', 'category', 'quantity', 'unit', 'storage_location'
            )[:10]
        )
        return Response({
            'plan': EmergencyPlanSerializer(plan).data,
            'open_warnings': open_warnings,
            'evacuations': evacuations,
            'supplies': supplies,
            'color_level': color,
        })

    @action(detail=True, methods=['post'])
    def launch(self, request, pk=None):
        """
        启动预案响应：绑定预警单，可选自动创建转移任务草稿。
        body: { warning_id, create_evacuation?: bool }
        """
        plan = self.get_object()
        if plan.status != EmergencyPlan.Status.ACTIVE:
            return Response(
                {'detail': '仅生效预案可启动响应'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        warning_id = request.data.get('warning_id')
        if not warning_id:
            return Response({'detail': '请指定 warning_id'}, status=status.HTTP_400_BAD_REQUEST)
        from warning.models import WarningRecord

        try:
            warning = WarningRecord.objects.select_related('hazard_point').get(pk=warning_id)
        except WarningRecord.DoesNotExist:
            return Response({'detail': '预警不存在'}, status=status.HTTP_404_NOT_FOUND)

        expected_color = LEVEL_COLOR.get(plan.level)
        if warning.level != expected_color:
            return Response(
                {
                    'detail': (
                        f'预案响应等级({plan.get_level_display()}/{expected_color})'
                        f'与预警等级({warning.level})不匹配'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 推进预警进入处置
        if warning.status in ('pending', 'confirmed', 'analyzing', 'published'):
            if warning.status == 'pending':
                warning.status = 'confirmed'
                warning.confirm_time = timezone.now()
                warning.confirm_user = request.user.get_username() if request.user.is_authenticated else '预案启动'
            if warning.status in ('confirmed', 'analyzing'):
                warning.status = 'published'
                warning.publish_time = timezone.now()
                warning.publish_user = plan.commander or '预案启动'
            warning.status = 'processing'
            warning.save()

        evacuation = None
        create_evacuation = request.data.get('create_evacuation', True)
        if create_evacuation:
            point = warning.hazard_point
            existing = EvacuationTask.objects.filter(
                warning=warning, status__in=['pending', 'ongoing']
            ).first()
            if existing:
                evacuation = existing
            else:
                from .geo import ensure_task_geometry

                shelter = (plan.content or {}).get('default_shelter') or '指定安置点'
                evacuation = EvacuationTask(
                    code=EvacuationTaskSerializer._next_code(),
                    warning=warning,
                    hazard_point=point,
                    status='pending',
                    total_people=point.threat_people or 0,
                    transferred_people=0,
                    shelter_name=shelter if isinstance(shelter, str) else '指定安置点',
                    shelter_address=(
                        point.address
                        or f'{point.town or ""}{point.village or ""}避险安置点'
                        or f'{point.name}附近安置点'
                    ),
                    commander=plan.commander,
                    commander_phone=plan.commander_phone,
                )
                ensure_task_geometry(evacuation)
                evacuation.save()

        return Response({
            'plan': EmergencyPlanSerializer(plan).data,
            'warning': {
                'id': warning.id,
                'code': warning.code,
                'status': warning.status,
                'level': warning.level,
            },
            'evacuation': (
                {
                    'id': evacuation.id,
                    'code': evacuation.code,
                    'status': evacuation.status,
                    'total_people': evacuation.total_people,
                }
                if evacuation else None
            ),
            'message': f'已启动预案 {plan.code}，预警进入处置',
        })

    @action(detail=False, methods=['get'])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        buffer = StringIO()
        writer = csv.writer(buffer)
        writer.writerow([
            '编号', '名称', '响应等级', '色标', '状态', '适用对象',
            '指挥人', '电话', '步骤数', '更新时间',
        ])
        for p in qs:
            writer.writerow([
                p.code, p.name, p.get_level_display(), LEVEL_COLOR.get(p.level, ''),
                p.get_status_display(),
                '、'.join(p.applicable_scenarios or []),
                p.commander, p.commander_phone,
                len((p.content or {}).get('steps') or []),
                p.updated_at,
            ])
        resp = HttpResponse(
            buffer.getvalue().encode('utf-8-sig'),
            content_type='text/csv; charset=utf-8',
        )
        resp['Content-Disposition'] = 'attachment; filename="emergency_plans.csv"'
        return resp


class EvacuationTaskViewSet(viewsets.ModelViewSet):
    """
    避险转移：创建(关联预警/隐患) → 启动 → 进度上报 → 完成/取消
    地图：map_geojson / shelters 供 Mapbox 展示路线与安置点
    """
    queryset = (
        EvacuationTask.objects.select_related('hazard_point', 'warning')
        .all()
        .order_by('-created_at', '-id')
    )
    filterset_fields = ['status', 'hazard_point', 'warning']
    search_fields = ['code', 'hazard_point__name', 'shelter_name', 'commander', 'warning__code']
    ordering_fields = ['created_at', 'updated_at', 'total_people', 'route_distance']

    def get_serializer_class(self):
        if self.action == 'list':
            return EvacuationTaskListSerializer
        return EvacuationTaskSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        warning_code = self.request.query_params.get('warning_code')
        if warning_code:
            qs = qs.filter(warning__code__icontains=warning_code)
        shelter = self.request.query_params.get('shelter')
        if shelter:
            qs = qs.filter(shelter_name__icontains=shelter)
        return qs

    def destroy(self, request, *args, **kwargs):
        task = self.get_object()
        if task.status == EvacuationTask.Status.ONGOING:
            return Response(
                {'detail': '进行中的转移任务不可删除，请先取消或完成'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        code = task.code
        self.perform_destroy(task)
        return Response({'detail': f'已删除转移任务 {code}'})

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        qs = self.filter_queryset(self.get_queryset())
        total_people = sum(t.total_people for t in qs)
        transferred = sum(t.transferred_people for t in qs)
        shelters = qs.exclude(shelter_name='').values('shelter_name').distinct().count()
        routes = qs.exclude(route_path=[]).count()
        return Response({
            'total_tasks': qs.count(),
            'pending': qs.filter(status='pending').count(),
            'ongoing': qs.filter(status='ongoing').count(),
            'completed': qs.filter(status='completed').count(),
            'cancelled': qs.filter(status='cancelled').count(),
            'total_people': total_people,
            'transferred_people': transferred,
            'pending_people': max(total_people - transferred, 0),
            'completion_rate': round(transferred / total_people * 100, 1) if total_people > 0 else 0,
            'shelter_count': shelters,
            'route_count': routes,
        })

    @action(detail=False, methods=['get'])
    def next_code(self, request):
        return Response({'code': EvacuationTaskSerializer._next_code()})

    @action(detail=False, methods=['get'])
    def map_geojson(self, request):
        """Mapbox 用 FeatureCollection：隐患点 / 安置点 / 转移路线"""
        from .geo import build_map_geojson, ensure_task_geometry

        qs = self.filter_queryset(self.get_queryset()).exclude(status='cancelled')
        dirty = []
        for task in qs:
            before = (task.shelter_longitude, task.route_path)
            ensure_task_geometry(task)
            after = (task.shelter_longitude, task.route_path)
            if before != after:
                dirty.append(task)
        if dirty:
            EvacuationTask.objects.bulk_update(
                dirty,
                [
                    'shelter_longitude', 'shelter_latitude',
                    'route_path', 'route_distance', 'estimated_time', 'route_provider',
                ],
            )
        return Response(build_map_geojson(qs))

    @action(detail=True, methods=['post'])
    def reroute(self, request, pk=None):
        """强制按真实路网重算转移路线（Mapbox/OSRM）"""
        from .geo import ensure_task_geometry

        task = self.get_object()
        ensure_task_geometry(task, force_reroute=True)
        task.save(update_fields=[
            'shelter_longitude', 'shelter_latitude',
            'route_path', 'route_distance', 'estimated_time', 'route_provider',
            'updated_at',
        ])
        data = EvacuationTaskSerializer(task).data
        data['route_hint'] = (
            '真实路网（Mapbox/OSRM）'
            if task.route_provider in ('mapbox', 'osrm')
            else '演示折线（未配置 MAPBOX_ACCESS_TOKEN 且 OSRM 不可达时的兜底）'
        )
        return Response(data)

    @action(detail=False, methods=['get'])
    def shelters(self, request):
        """安置点聚合（名称 + 坐标 + 关联任务）"""
        from .geo import ensure_task_geometry

        qs = self.filter_queryset(self.get_queryset()).exclude(status='cancelled')
        by_name = {}
        for task in qs:
            ensure_task_geometry(task)
            name = task.shelter_name or '未命名安置点'
            item = by_name.setdefault(name, {
                'name': name,
                'address': task.shelter_address or '',
                'longitude': float(task.shelter_longitude) if task.shelter_longitude is not None else None,
                'latitude': float(task.shelter_latitude) if task.shelter_latitude is not None else None,
                'task_count': 0,
                'total_people': 0,
                'transferred_people': 0,
                'tasks': [],
            })
            item['task_count'] += 1
            item['total_people'] += task.total_people
            item['transferred_people'] += task.transferred_people
            item['tasks'].append({
                'id': task.id,
                'code': task.code,
                'status': task.status,
                'hazard_point': task.hazard_point.name,
            })
        return Response({'count': len(by_name), 'results': list(by_name.values())})

    @action(detail=False, methods=['post'])
    def from_warning(self, request):
        """
        由预警单创建转移任务（闭环入口）
        body: { warning_id, shelter_name?, shelter_address?, commander?, ... }
        """
        from warning.models import WarningRecord
        from .geo import ensure_task_geometry

        warning_id = request.data.get('warning_id')
        if not warning_id:
            return Response({'detail': '请指定 warning_id'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            warning = WarningRecord.objects.select_related('hazard_point').get(pk=warning_id)
        except WarningRecord.DoesNotExist:
            return Response({'detail': '预警不存在'}, status=status.HTTP_404_NOT_FOUND)

        if warning.status == 'closed':
            return Response({'detail': '已闭环预警不可再发起转移'}, status=status.HTTP_400_BAD_REQUEST)

        existing = EvacuationTask.objects.filter(
            warning=warning, status__in=['pending', 'ongoing']
        ).first()
        if existing:
            return Response(
                {
                    'detail': f'该预警已有进行中的转移任务 {existing.code}',
                    'evacuation': EvacuationTaskSerializer(existing).data,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        point = warning.hazard_point
        task = EvacuationTask(
            code=request.data.get('code') or EvacuationTaskSerializer._next_code(),
            warning=warning,
            hazard_point=point,
            status='pending',
            total_people=request.data.get('total_people') or point.threat_people or 0,
            transferred_people=0,
            shelter_name=request.data.get('shelter_name') or '指定安置点',
            shelter_address=request.data.get('shelter_address') or '',
            commander=request.data.get('commander') or '',
            commander_phone=request.data.get('commander_phone') or '',
            grid_worker=request.data.get('grid_worker') or '',
            grid_phone=request.data.get('grid_phone') or '',
        )
        if request.data.get('shelter_longitude') is not None:
            task.shelter_longitude = request.data.get('shelter_longitude')
        if request.data.get('shelter_latitude') is not None:
            task.shelter_latitude = request.data.get('shelter_latitude')
        ensure_task_geometry(task)
        task.save()

        # 预警进入处置
        if warning.status in ('pending', 'confirmed', 'analyzing', 'published'):
            warning.status = 'processing'
            warning.save(update_fields=['status', 'updated_at'])

        return Response(EvacuationTaskSerializer(task).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """待转移 → 进行中"""
        task = self.get_object()
        if task.status == EvacuationTask.Status.CANCELLED:
            return Response({'detail': '已取消任务不可启动'}, status=status.HTTP_400_BAD_REQUEST)
        if task.status == EvacuationTask.Status.COMPLETED:
            return Response({'detail': '任务已完成'}, status=status.HTTP_400_BAD_REQUEST)
        from .geo import ensure_task_geometry
        ensure_task_geometry(task)
        task.status = EvacuationTask.Status.ONGOING
        if task.transferred_people <= 0 and task.total_people > 0:
            # 启动时默认记入首批转移（可后续修正）
            pass
        task.save()
        if task.warning_id and task.warning.status not in ('processing', 'closed'):
            task.warning.status = 'processing'
            task.warning.save(update_fields=['status', 'updated_at'])
        return Response(EvacuationTaskSerializer(task).data)

    @action(detail=True, methods=['post'])
    def update_progress(self, request, pk=None):
        task = self.get_object()
        if task.status == EvacuationTask.Status.CANCELLED:
            return Response({'detail': '已取消任务不可更新进度'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            transferred = int(request.data.get('transferred_people', task.transferred_people))
        except (TypeError, ValueError):
            return Response({'detail': 'transferred_people 须为整数'}, status=status.HTTP_400_BAD_REQUEST)
        if transferred < 0:
            return Response({'detail': '已转移人数不能为负'}, status=status.HTTP_400_BAD_REQUEST)
        if transferred > task.total_people:
            return Response({'detail': '已转移人数不能超过需转移人数'}, status=status.HTTP_400_BAD_REQUEST)

        task.transferred_people = transferred
        if transferred >= task.total_people and task.total_people > 0:
            task.status = EvacuationTask.Status.COMPLETED
        elif transferred > 0:
            task.status = EvacuationTask.Status.ONGOING
        elif task.status != EvacuationTask.Status.PENDING:
            task.status = EvacuationTask.Status.ONGOING
        task.save()
        self._maybe_close_warning(task)
        return Response(EvacuationTaskSerializer(task).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """标记全部转移完成"""
        task = self.get_object()
        if task.status == EvacuationTask.Status.CANCELLED:
            return Response({'detail': '已取消任务不可完成'}, status=status.HTTP_400_BAD_REQUEST)
        task.transferred_people = task.total_people
        task.status = EvacuationTask.Status.COMPLETED
        task.save()
        self._maybe_close_warning(task)
        return Response(EvacuationTaskSerializer(task).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        task = self.get_object()
        if task.status == EvacuationTask.Status.COMPLETED:
            return Response({'detail': '已完成任务不可取消'}, status=status.HTTP_400_BAD_REQUEST)
        task.status = EvacuationTask.Status.CANCELLED
        task.save(update_fields=['status', 'updated_at'])
        return Response(EvacuationTaskSerializer(task).data)

    @action(detail=True, methods=['get'])
    def related(self, request, pk=None):
        """关联预警 / 同隐患其他转移 / 匹配预案"""
        task = self.get_object()
        warning = None
        if task.warning_id:
            w = task.warning
            warning = {
                'id': w.id,
                'code': w.code,
                'level': w.level,
                'status': w.status,
                'trigger_type': w.trigger_type or '',
            }
        siblings = list(
            EvacuationTask.objects.filter(hazard_point=task.hazard_point)
            .exclude(pk=task.pk)
            .order_by('-created_at')
            .values('id', 'code', 'status', 'shelter_name', 'total_people', 'transferred_people')[:10]
        )
        plans = []
        if warning and warning.get('level'):
            level = COLOR_LEVEL.get(warning['level'])
            if level:
                plans = list(
                    EmergencyPlan.objects.filter(status='active', level=level)
                    .order_by('-updated_at')
                    .values('id', 'code', 'name', 'level', 'commander')[:5]
                )
        return Response({
            'task': EvacuationTaskSerializer(task).data,
            'warning': warning,
            'sibling_tasks': siblings,
            'matched_plans': plans,
        })

    @action(detail=False, methods=['get'])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        buffer = StringIO()
        writer = csv.writer(buffer)
        writer.writerow([
            '任务编号', '预警编号', '隐患点', '状态', '需转移', '已转移', '完成率%',
            '安置点', '安置点地址', '安置经度', '安置纬度',
            '路线距离km', '预计分钟', '指挥人', '网格员', '创建时间',
        ])
        for t in qs:
            writer.writerow([
                t.code,
                t.warning.code if t.warning_id else '',
                t.hazard_point.name,
                t.get_status_display(),
                t.total_people,
                t.transferred_people,
                t.completion_rate,
                t.shelter_name,
                t.shelter_address,
                t.shelter_longitude,
                t.shelter_latitude,
                t.route_distance,
                t.estimated_time,
                t.commander,
                t.grid_worker,
                t.created_at,
            ])
        resp = HttpResponse(
            buffer.getvalue().encode('utf-8-sig'),
            content_type='text/csv; charset=utf-8',
        )
        resp['Content-Disposition'] = 'attachment; filename="evacuation_tasks.csv"'
        return resp

    @staticmethod
    def _maybe_close_warning(task: EvacuationTask):
        """同一预警下所有转移均完成时，确保预警处于处置中（闭环由值班人工确认关闭）"""
        if not task.warning_id or task.status != EvacuationTask.Status.COMPLETED:
            return
        open_tasks = EvacuationTask.objects.filter(
            warning_id=task.warning_id
        ).exclude(status__in=['completed', 'cancelled'])
        if open_tasks.exists():
            return
        warning = task.warning
        if warning.status not in ('closed', 'processing'):
            warning.status = 'processing'
            warning.save(update_fields=['status', 'updated_at'])


class EmergencySupplyViewSet(viewsets.ModelViewSet):
    """应急物资视图集"""
    queryset = EmergencySupply.objects.all().order_by('-updated_at', '-id')
    serializer_class = EmergencySupplySerializer
    filterset_fields = ['category']
    search_fields = ['name', 'code', 'storage_location', 'responsible_person']
    ordering_fields = ['quantity', 'updated_at', 'code', 'name']

    def destroy(self, request, *args, **kwargs):
        item = self.get_object()
        code = item.code
        self.perform_destroy(item)
        return Response({'detail': f'已删除物资 {code}'})

    @action(detail=False, methods=['get'])
    def next_code(self, request):
        prefix = 'S'
        last = (
            EmergencySupply.objects.filter(code__startswith=prefix)
            .order_by('-code')
            .values_list('code', flat=True)
            .first()
        )
        n = 1
        if last:
            digits = ''.join(ch for ch in last[len(prefix):] if ch.isdigit())
            if digits:
                n = int(digits) + 1
        return Response({'code': f'{prefix}{n:03d}'})

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        low = queryset.filter(quantity__lt=50).count()
        stats = {
            'total': queryset.count(),
            'low_stock': low,
            'by_category': {},
        }
        for category in EmergencySupply.Category.values:
            stats['by_category'][category] = queryset.filter(category=category).count()
        return Response(stats)
