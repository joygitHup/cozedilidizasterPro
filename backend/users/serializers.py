"""用户序列化器"""
from rest_framework import serializers
from .models import User


class UserSerializer(serializers.ModelSerializer):
    """用户序列化器"""
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 
                  'phone', 'role', 'department', 'village', 'avatar',
                  'is_active', 'date_joined']
        read_only_fields = ['id', 'date_joined']


class UserListSerializer(serializers.ModelSerializer):
    """用户列表序列化器"""
    
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'phone', 'role', 'department']
