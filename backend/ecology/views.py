"""生态治理视图：工程设计 → 进度填报 → 效果评估闭环"""
import csv
from io import StringIO

from django.db.models import Avg, Max, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import EcologyProject, EffectAssessment, ProgressLog
from .serializers import (
    EcologyProjectListSerializer,
    EcologyProjectSerializer,
    EffectAssessmentSerializer,
    ProgressLogSerializer,
)


class EcologyProjectViewSet(viewsets.ModelViewSet):
    """工程设计台账与状态流转"""

    queryset = EcologyProject.objects.select_related('hazard_point').all()
    filterset_fields = ['status', 'project_type', 'hazard_point']
    search_fields = ['code', 'name', 'location', 'manager', 'contractor']
    ordering_fields = ['created_at', 'updated_at', 'progress', 'budget', 'code']

    def get_serializer_class(self):
        if self.action == 'list':
            return EcologyProjectListSerializer
        return EcologyProjectSerializer

    def destroy(self, request, *args, **kwargs):
        project = self.get_object()
        if project.status == EcologyProject.Status.CONSTRUCTION:
            return Response(
                {'detail': '施工中工程不可删除，请先完工或归档'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        code = project.code
        self.perform_destroy(project)
        return Response({'detail': f'已删除工程 {code}'})

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        qs = self.filter_queryset(self.get_queryset())
        avg_progress = qs.aggregate(v=Avg('progress'))['v'] or 0
        return Response({
            'total': qs.count(),
            'designing': qs.filter(status='designing').count(),
            'approved': qs.filter(status='approved').count(),
            'construction': qs.filter(status='construction').count(),
            'completed': qs.filter(status='completed').count(),
            'archived': qs.filter(status='archived').count(),
            'avg_progress': round(float(avg_progress), 1),
            'total_budget': float(sum(p.budget for p in qs) or 0),
            'by_type': {
                t: qs.filter(project_type=t).count()
                for t in EcologyProject.ProjectType.values
            },
        })

    @action(detail=False, methods=['get'])
    def next_code(self, request):
        return Response({'code': EcologyProjectSerializer._next_code()})

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """设计中 → 已批复"""
        project = self.get_object()
        if project.status not in (
            EcologyProject.Status.DESIGNING,
            EcologyProject.Status.APPROVED,
        ):
            return Response(
                {'detail': f'当前状态({project.get_status_display()})不可批复'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        project.status = EcologyProject.Status.APPROVED
        project.approve_date = timezone.localdate()
        if not project.design_date:
            project.design_date = timezone.localdate()
        self._mark_milestone(project, '审查批复', 'done')
        project.save()
        return Response(EcologyProjectSerializer(project).data)

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """已批复/设计中 → 施工中"""
        project = self.get_object()
        if project.status in (
            EcologyProject.Status.COMPLETED,
            EcologyProject.Status.ARCHIVED,
        ):
            return Response({'detail': '工程已结束'}, status=status.HTTP_400_BAD_REQUEST)
        project.status = EcologyProject.Status.CONSTRUCTION
        if not project.start_date:
            project.start_date = timezone.localdate()
        if project.progress <= 0:
            project.progress = max(project.progress, 5)
        self._mark_milestone(project, '审查批复', 'done')
        self._mark_milestone(project, '开工建设', 'doing')
        if not project.current_milestone:
            project.current_milestone = '已开工，施工推进中'
        # 自动记一条进度
        ProgressLog.objects.create(
            project=project,
            progress=project.progress,
            done_days=project.done_days,
            milestone=project.current_milestone,
            note='工程开工',
            reporter=request.data.get('reporter') or project.manager or '',
            report_date=timezone.localdate(),
        )
        project.save()
        return Response(EcologyProjectSerializer(project).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """施工中 → 已完工"""
        project = self.get_object()
        if project.status == EcologyProject.Status.ARCHIVED:
            return Response({'detail': '已归档'}, status=status.HTTP_400_BAD_REQUEST)
        project.status = EcologyProject.Status.COMPLETED
        project.progress = 100
        project.actual_end_date = timezone.localdate()
        if project.planned_days and project.done_days < project.planned_days:
            project.done_days = project.planned_days
        project.current_milestone = request.data.get('milestone') or '已完工验收'
        self._mark_milestone(project, '开工建设', 'done')
        self._mark_milestone(project, '竣工验收', 'done')
        ProgressLog.objects.create(
            project=project,
            progress=100,
            done_days=project.done_days,
            milestone=project.current_milestone,
            note=request.data.get('note') or '竣工验收通过',
            reporter=request.data.get('reporter') or project.manager or '',
            report_date=timezone.localdate(),
        )
        project.save()
        return Response(EcologyProjectSerializer(project).data)

    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        project = self.get_object()
        if project.status not in (
            EcologyProject.Status.COMPLETED,
            EcologyProject.Status.ARCHIVED,
        ):
            return Response(
                {'detail': '仅已完工工程可归档'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        project.status = EcologyProject.Status.ARCHIVED
        project.save(update_fields=['status', 'updated_at'])
        return Response(EcologyProjectSerializer(project).data)

    @action(detail=True, methods=['post'])
    def report_progress(self, request, pk=None):
        """快捷进度填报（闭环到进度模块）"""
        project = self.get_object()
        if project.status in (
            EcologyProject.Status.DESIGNING,
            EcologyProject.Status.ARCHIVED,
        ):
            return Response(
                {'detail': '当前状态不可填报进度'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        data = {**request.data, 'project': project.id}
        ser = ProgressLogSerializer(data=data)
        ser.is_valid(raise_exception=True)
        log = ser.save()
        project.refresh_from_db()
        return Response({
            'log': ProgressLogSerializer(log).data,
            'project': EcologyProjectSerializer(project).data,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def related(self, request, pk=None):
        project = self.get_object()
        logs = ProgressLog.objects.filter(project=project).order_by('-report_date', '-id')[:20]
        assessments = EffectAssessment.objects.filter(project=project).order_by('-assess_date', '-id')
        return Response({
            'project': EcologyProjectSerializer(project).data,
            'progress_logs': ProgressLogSerializer(logs, many=True).data,
            'assessments': EffectAssessmentSerializer(assessments, many=True).data,
            'can_assess': project.status in (
                EcologyProject.Status.CONSTRUCTION,
                EcologyProject.Status.COMPLETED,
                EcologyProject.Status.ARCHIVED,
            ),
        })

    @action(detail=False, methods=['get'])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        buffer = StringIO()
        writer = csv.writer(buffer)
        writer.writerow([
            '编号', '名称', '类型', '状态', '位置', '预算(万)', '进度%',
            '计划工期', '已完成天', '里程碑', '负责人', '更新时间',
        ])
        for p in qs:
            writer.writerow([
                p.code, p.name, p.get_project_type_display(), p.get_status_display(),
                p.location, p.budget, p.progress, p.planned_days, p.done_days,
                p.current_milestone, p.manager, p.updated_at,
            ])
        resp = HttpResponse(
            buffer.getvalue().encode('utf-8-sig'),
            content_type='text/csv; charset=utf-8',
        )
        resp['Content-Disposition'] = 'attachment; filename="ecology_projects.csv"'
        return resp

    @staticmethod
    def _mark_milestone(project: EcologyProject, title: str, status_val: str):
        ms = list(project.milestones or [])
        found = False
        for item in ms:
            if isinstance(item, dict) and item.get('title') == title:
                item['status'] = status_val
                found = True
        if not found and title:
            ms.append({'order': len(ms) + 1, 'title': title, 'status': status_val})
        project.milestones = ms


class ProgressLogViewSet(viewsets.ModelViewSet):
    """治理进度填报"""

    queryset = ProgressLog.objects.select_related('project').all()
    serializer_class = ProgressLogSerializer
    filterset_fields = ['project', 'project__status', 'project__project_type']
    search_fields = ['project__code', 'project__name', 'milestone', 'reporter']
    ordering_fields = ['report_date', 'progress', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        status_q = self.request.query_params.get('status')
        if status_q:
            qs = qs.filter(project__status=status_q)
        return qs

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        projects = EcologyProject.objects.exclude(status='archived')
        return Response({
            'project_count': projects.count(),
            'construction': projects.filter(status='construction').count(),
            'completed': projects.filter(status='completed').count(),
            'avg_progress': round(
                float(projects.aggregate(v=Avg('progress'))['v'] or 0), 1
            ),
            'log_count': ProgressLog.objects.count(),
            'latest_report': ProgressLog.objects.aggregate(v=Max('report_date'))['v'],
        })

    @action(detail=False, methods=['get'])
    def board(self, request):
        """进度看板：每工程最新一条 + 工程摘要"""
        qs = EcologyProject.objects.exclude(status='archived').order_by('-updated_at')
        status_q = request.query_params.get('status')
        if status_q:
            qs = qs.filter(status=status_q)
        search = request.query_params.get('search')
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(code__icontains=search))

        results = []
        for p in qs[:50]:
            latest = p.progress_logs.order_by('-report_date', '-id').first()
            results.append({
                'project': EcologyProjectListSerializer(p).data,
                'latest_log': ProgressLogSerializer(latest).data if latest else None,
            })
        return Response({'count': len(results), 'results': results})

    def destroy(self, request, *args, **kwargs):
        log = self.get_object()
        project = log.project
        self.perform_destroy(log)
        # 回滚工程进度到最新剩余记录
        latest = project.progress_logs.order_by('-report_date', '-id').first()
        if latest:
            project.progress = latest.progress
            project.done_days = latest.done_days
            project.current_milestone = latest.milestone or project.current_milestone
        else:
            project.progress = 0
            project.done_days = 0
        project.sync_progress_status()
        project.save()
        return Response({'detail': '已删除进度记录并回同步工程进度'})


class EffectAssessmentViewSet(viewsets.ModelViewSet):
    """效果评估"""

    queryset = EffectAssessment.objects.select_related('project').all()
    serializer_class = EffectAssessmentSerializer
    filterset_fields = ['effect', 'project', 'project__status']
    search_fields = ['code', 'factor', 'project__name', 'project__code', 'assessor']
    ordering_fields = ['assess_date', 'created_at', 'code']

    def destroy(self, request, *args, **kwargs):
        item = self.get_object()
        code = item.code
        self.perform_destroy(item)
        return Response({'detail': f'已删除评估 {code}'})

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        qs = self.filter_queryset(self.get_queryset())
        return Response({
            'total': qs.count(),
            'significant': qs.filter(effect='significant').count(),
            'qualified': qs.filter(effect='qualified').count(),
            'monitoring': qs.filter(effect='monitoring').count(),
            'failed': qs.filter(effect='failed').count(),
            'project_covered': qs.values('project').distinct().count(),
        })

    @action(detail=False, methods=['get'])
    def next_code(self, request):
        return Response({'code': EffectAssessmentSerializer._next_code()})

    @action(detail=True, methods=['post'])
    def conclude(self, request, pk=None):
        """确认评估结论"""
        item = self.get_object()
        effect = request.data.get('effect')
        if effect:
            if effect not in EffectAssessment.Effect.values:
                return Response({'detail': '无效效果结论'}, status=status.HTTP_400_BAD_REQUEST)
            item.effect = effect
        if 'conclusion' in request.data:
            item.conclusion = request.data.get('conclusion') or ''
        if 'after_value' in request.data:
            item.after_value = request.data.get('after_value') or item.after_value
        item.save()
        # 若工程已完工且全部评估非监测中，可提示归档
        project = item.project
        pending = project.assessments.filter(effect='monitoring').exists()
        return Response({
            'assessment': EffectAssessmentSerializer(item).data,
            'project_ready_to_archive': (
                project.status == EcologyProject.Status.COMPLETED and not pending
            ),
        })

    @action(detail=False, methods=['get'])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        buffer = StringIO()
        writer = csv.writer(buffer)
        writer.writerow([
            '编号', '工程', '评估因子', '治理前', '治理后', '单位', '效果', '评估人', '评估日期',
        ])
        for a in qs:
            writer.writerow([
                a.code, a.project.name, a.factor, a.before_value, a.after_value,
                a.unit, a.get_effect_display(), a.assessor, a.assess_date,
            ])
        resp = HttpResponse(
            buffer.getvalue().encode('utf-8-sig'),
            content_type='text/csv; charset=utf-8',
        )
        resp['Content-Disposition'] = 'attachment; filename="ecology_assessments.csv"'
        return resp
