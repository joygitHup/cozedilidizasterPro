"""隐患台账视图"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import HazardPoint, RiskSlope, InspectionTask
from .serializers import (
    HazardPointSerializer, HazardPointListSerializer,
    RiskSlopeSerializer, InspectionTaskSerializer
)


class HazardPointViewSet(viewsets.ModelViewSet):
    """隐患点视图集"""
    queryset = HazardPoint.objects.all()
    filterset_fields = ['level', 'status', 'type', 'village', 'town']
    search_fields = ['name', 'code', 'address']
    ordering_fields = ['created_at', 'level', 'threat_people']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return HazardPointListSerializer
        return HazardPointSerializer
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """隐患点统计"""
        queryset = self.get_queryset()
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
        queryset = self.get_queryset()
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


class RiskSlopeViewSet(viewsets.ModelViewSet):
    """风险斜坡视图集"""
    queryset = RiskSlope.objects.all()
    serializer_class = RiskSlopeSerializer
    filterset_fields = ['risk_level']
    search_fields = ['name', 'code']


class InspectionTaskViewSet(viewsets.ModelViewSet):
    """排查任务视图集"""
    queryset = InspectionTask.objects.all()
    serializer_class = InspectionTaskSerializer
    filterset_fields = ['status', 'priority', 'assigned_to']
    search_fields = ['title', 'description']
    ordering_fields = ['planned_date', 'created_at']
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """完成任务"""
        task = self.get_object()
        task.status = 'completed'
        task.result = request.data.get('result', '')
        task.save()
        return Response(InspectionTaskSerializer(task).data)
