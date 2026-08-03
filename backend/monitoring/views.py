"""监测视图"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from datetime import timedelta
from .models import MonitoringDevice, MonitorData
from .serializers import (
    MonitoringDeviceSerializer, MonitoringDeviceListSerializer,
    MonitorDataSerializer, MonitorDataCreateSerializer
)


class MonitoringDeviceViewSet(viewsets.ModelViewSet):
    """监测设备视图集"""
    queryset = MonitoringDevice.objects.all()
    filterset_fields = ['device_type', 'status', 'hazard_point']
    search_fields = ['name', 'code', 'address']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return MonitoringDeviceListSerializer
        return MonitoringDeviceSerializer
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """设备统计"""
        queryset = self.get_queryset()
        stats = {
            'total': queryset.count(),
            'online': queryset.filter(status='online').count(),
            'offline': queryset.filter(status='offline').count(),
            'fault': queryset.filter(status='fault').count(),
            'by_type': {},
        }
        for device_type in MonitoringDevice.DeviceType.values:
            stats['by_type'][device_type] = queryset.filter(device_type=device_type).count()
        return Response(stats)
    
    @action(detail=False, methods=['get'])
    def device_tree(self, request):
        """获取设备树（按区域分组）"""
        devices = self.get_queryset()
        tree = {}
        for device in devices:
            town = device.address or '未分配'
            if town not in tree:
                tree[town] = []
            tree[town].append({
                'id': device.id,
                'code': device.code,
                'name': device.name,
                'type': device.device_type,
                'status': device.status,
            })
        return Response(tree)


class MonitorDataViewSet(viewsets.ModelViewSet):
    """监测数据视图集"""
    queryset = MonitorData.objects.all()
    filterset_fields = ['device', 'data_type']
    ordering_fields = ['record_time']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return MonitorDataCreateSerializer
        return MonitorDataSerializer
    
    @action(detail=False, methods=['get'])
    def realtime(self, request):
        """获取实时数据（最近1小时）"""
        one_hour_ago = timezone.now() - timedelta(hours=1)
        device_id = request.query_params.get('device_id')
        
        queryset = self.get_queryset().filter(record_time__gte=one_hour_ago)
        if device_id:
            queryset = queryset.filter(device_id=device_id)
        
        serializer = MonitorDataSerializer(queryset[:100], many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def history(self, request):
        """获取历史数据"""
        device_id = request.query_params.get('device_id')
        data_type = request.query_params.get('data_type')
        start_time = request.query_params.get('start_time')
        end_time = request.query_params.get('end_time')
        
        queryset = self.get_queryset()
        if device_id:
            queryset = queryset.filter(device_id=device_id)
        if data_type:
            queryset = queryset.filter(data_type=data_type)
        if start_time:
            queryset = queryset.filter(record_time__gte=start_time)
        if end_time:
            queryset = queryset.filter(record_time__lte=end_time)
        
        serializer = MonitorDataSerializer(queryset[:500], many=True)
        return Response(serializer.data)
