"""预警序列化器"""
from rest_framework import serializers
from .models import WarningRecord, WarningModel


class WarningRecordSerializer(serializers.ModelSerializer):
    """预警记录序列化器"""
    hazard_name = serializers.CharField(source='hazard_point.name', read_only=True)
    hazard_code = serializers.CharField(source='hazard_point.code', read_only=True)
    
    class Meta:
        model = WarningRecord
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class WarningRecordListSerializer(serializers.ModelSerializer):
    """预警列表序列化器"""
    hazard_name = serializers.CharField(source='hazard_point.name', read_only=True)
    
    class Meta:
        model = WarningRecord
        fields = ['id', 'code', 'hazard_name', 'level', 'status', 
                  'created_at', 'confirm_time', 'close_time']


class WarningConfirmSerializer(serializers.Serializer):
    """预警确认序列化器"""
    confirm_user = serializers.CharField(max_length=50)
    note = serializers.CharField(required=False, allow_blank=True)


class WarningCloseSerializer(serializers.Serializer):
    """预警闭环序列化器"""
    close_reason = serializers.CharField(max_length=200)


class WarningModelSerializer(serializers.ModelSerializer):
    """预警模型序列化器"""
    
    class Meta:
        model = WarningModel
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']
