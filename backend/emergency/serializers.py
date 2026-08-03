"""应急序列化器"""
from rest_framework import serializers
from .models import EmergencyPlan, EvacuationTask, EmergencySupply


class EmergencyPlanSerializer(serializers.ModelSerializer):
    """应急预案序列化器"""
    
    class Meta:
        model = EmergencyPlan
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class EvacuationTaskSerializer(serializers.ModelSerializer):
    """避险转移任务序列化器"""
    hazard_point_name = serializers.CharField(source='hazard_point.name', read_only=True)
    completion_rate = serializers.ReadOnlyField()
    
    class Meta:
        model = EvacuationTask
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class EvacuationTaskListSerializer(serializers.ModelSerializer):
    """转移任务列表序列化器"""
    hazard_point_name = serializers.CharField(source='hazard_point.name', read_only=True)
    completion_rate = serializers.ReadOnlyField()
    
    class Meta:
        model = EvacuationTask
        fields = ['id', 'code', 'hazard_point_name', 'total_people', 
                  'transferred_people', 'completion_rate', 'status', 'created_at']


class EmergencySupplySerializer(serializers.ModelSerializer):
    """应急物资序列化器"""
    
    class Meta:
        model = EmergencySupply
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']
