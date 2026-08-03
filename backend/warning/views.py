"""预警视图"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import WarningRecord, WarningModel
from .serializers import (
    WarningRecordSerializer, WarningRecordListSerializer,
    WarningConfirmSerializer, WarningCloseSerializer,
    WarningModelSerializer
)


class WarningRecordViewSet(viewsets.ModelViewSet):
    """预警记录视图集"""
    queryset = WarningRecord.objects.all()
    filterset_fields = ['level', 'status', 'hazard_point']
    search_fields = ['code', 'hazard_point__name']
    ordering_fields = ['created_at', 'level']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return WarningRecordListSerializer
        return WarningRecordSerializer
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """预警统计"""
        queryset = self.get_queryset()
        stats = {
            'total': queryset.count(),
            'pending': queryset.filter(status='pending').count(),
            'processing': queryset.filter(status__in=['confirmed', 'analyzing', 'published', 'processing']).count(),
            'closed': queryset.filter(status='closed').count(),
            'by_level': {
                'red': queryset.filter(level='red').count(),
                'orange': queryset.filter(level='orange').count(),
                'yellow': queryset.filter(level='yellow').count(),
                'blue': queryset.filter(level='blue').count(),
            }
        }
        return Response(stats)
    
    @action(detail=False, methods=['get'])
    def latest(self, request):
        """获取最新预警"""
        limit = int(request.query_params.get('limit', 5))
        queryset = self.get_queryset()[:limit]
        serializer = WarningRecordListSerializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """确认预警"""
        warning = self.get_object()
        serializer = WarningConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        warning.status = 'confirmed'
        warning.confirm_time = timezone.now()
        warning.confirm_user = serializer.validated_data['confirm_user']
        warning.save()
        
        return Response(WarningRecordSerializer(warning).data)
    
    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        """发布预警"""
        warning = self.get_object()
        warning.status = 'published'
        warning.publish_time = timezone.now()
        warning.publish_user = request.data.get('publish_user', '')
        warning.save()
        return Response(WarningRecordSerializer(warning).data)
    
    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        """闭环预警"""
        warning = self.get_object()
        serializer = WarningCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        warning.status = 'closed'
        warning.close_time = timezone.now()
        warning.close_reason = serializer.validated_data['close_reason']
        warning.save()
        
        return Response(WarningRecordSerializer(warning).data)


class WarningModelViewSet(viewsets.ModelViewSet):
    """预警模型视图集"""
    queryset = WarningModel.objects.all()
    serializer_class = WarningModelSerializer
    filterset_fields = ['model_type', 'is_active']
    search_fields = ['name', 'code']
