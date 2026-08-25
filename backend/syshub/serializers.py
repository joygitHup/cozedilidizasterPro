from rest_framework import serializers

from .models import Notification, SystemConfig


class SystemConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemConfig
        fields = [
            'system_name', 'force_threshold', 'call_timeout_sec',
            'notify_sms', 'notify_call', 'notify_app', 'notify_email',
            'weather_text', 'weather_temp_c', 'weather_icon',
            'extra', 'updated_at',
        ]
        read_only_fields = ['updated_at']


class NotificationSerializer(serializers.ModelSerializer):
    level_display = serializers.CharField(source='get_level_display', read_only=True)

    class Meta:
        model = Notification
        fields = [
            'id', 'title', 'body', 'level', 'level_display',
            'link', 'is_read', 'source', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'level_display']
