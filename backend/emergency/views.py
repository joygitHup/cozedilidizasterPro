"""应急视图"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import EmergencyPlan, EvacuationTask, EmergencySupply
from .serializers import (
    EmergencyPlanSerializer, EvacuationTaskSerializer,
    EvacuationTaskListSerializer, EmergencySupplySerializer
)


class EmergencyPlanViewSet(viewsets.ModelViewSet):
    """应急预案视图集"""
    queryset = EmergencyPlan.objects.all()
    serializer_class = EmergencyPlanSerializer
    filterset_fields = ['level', 'status']
    search_fields = ['name', 'code', 'description']


class EvacuationTaskViewSet(viewsets.ModelViewSet):
    """避险转移任务视图集"""
    queryset = EvacuationTask.objects.all()
    filterset_fields = ['status', 'hazard_point']
    search_fields = ['code', 'hazard_point__name']
    ordering_fields = ['created_at', 'total_people']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return EvacuationTaskListSerializer
        return EvacuationTaskSerializer
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """转移统计"""
        queryset = self.get_queryset()
        total_people = sum(t.total_people for t in queryset)
        transferred = sum(t.transferred_people for t in queryset)
        
        stats = {
            'total_tasks': queryset.count(),
            'pending': queryset.filter(status='pending').count(),
            'ongoing': queryset.filter(status='ongoing').count(),
            'completed': queryset.filter(status='completed').count(),
            'total_people': total_people,
            'transferred_people': transferred,
            'completion_rate': round(transferred / total_people * 100, 1) if total_people > 0 else 0,
        }
        return Response(stats)
    
    @action(detail=True, methods=['post'])
    def update_progress(self, request, pk=None):
        """更新转移进度"""
        task = self.get_object()
        transferred = request.data.get('transferred_people', task.transferred_people)
        task.transferred_people = transferred
        if transferred >= task.total_people:
            task.status = 'completed'
        elif transferred > 0:
            task.status = 'ongoing'
        task.save()
        return Response(EvacuationTaskSerializer(task).data)


class EmergencySupplyViewSet(viewsets.ModelViewSet):
    """应急物资视图集"""
    queryset = EmergencySupply.objects.all()
    serializer_class = EmergencySupplySerializer
    filterset_fields = ['category']
    search_fields = ['name', 'code', 'storage_location']
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """物资统计"""
        queryset = self.get_queryset()
        stats = {
            'total': queryset.count(),
            'by_category': {},
        }
        for category in EmergencySupply.Category.values:
            stats['by_category'][category] = queryset.filter(category=category).count()
        return Response(stats)
