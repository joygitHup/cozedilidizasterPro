"""监测序列化器"""
from rest_framework import serializers
from .models import MonitoringDevice, MonitorData


class MonitoringDeviceSerializer(serializers.ModelSerializer):
    """监测设备序列化器"""
    hazard_point_name = serializers.CharField(source='hazard_point.name', read_only=True)
    
    class Meta:
        model = MonitoringDevice
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class MonitoringDeviceListSerializer(serializers.ModelSerializer):
    """设备列表序列化器"""
    
    class Meta:
        model = MonitoringDevice
        fields = ['id', 'code', 'name', 'device_type', 'status', 
                  'battery', 'signal', 'last_data_time', 'address']


class MonitorDataSerializer(serializers.ModelSerializer):
    """监测数据序列化器"""
    device_code = serializers.CharField(source='device.code', read_only=True)
    device_name = serializers.CharField(source='device.name', read_only=True)
    
    class Meta:
        model = MonitorData
        fields = '__all__'
        read_only_fields = ['id', 'created_at']


class MonitorDataCreateSerializer(serializers.ModelSerializer):
    """监测数据创建序列化器"""
    
    class Meta:
        model = MonitorData
        fields = ['device', 'data_type', 'value', 'unit', 'record_time']
