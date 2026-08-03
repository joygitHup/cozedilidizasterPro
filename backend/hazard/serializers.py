"""隐患台账序列化器"""
from rest_framework import serializers
from .models import HazardPoint, RiskSlope, InspectionTask


class HazardPointSerializer(serializers.ModelSerializer):
    """隐患点序列化器"""
    
    class Meta:
        model = HazardPoint
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class HazardPointListSerializer(serializers.ModelSerializer):
    """隐患点列表序列化器"""
    
    class Meta:
        model = HazardPoint
        fields = ['id', 'code', 'name', 'type', 'level', 'status', 
                  'threat_people', 'responsible_person', 'village', 'town']


class RiskSlopeSerializer(serializers.ModelSerializer):
    """风险斜坡序列化器"""
    hazard_point_name = serializers.CharField(source='hazard_point.name', read_only=True)
    
    class Meta:
        model = RiskSlope
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class InspectionTaskSerializer(serializers.ModelSerializer):
    """排查任务序列化器"""
    hazard_point_name = serializers.CharField(source='hazard_point.name', read_only=True)
    
    class Meta:
        model = InspectionTask
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']
