from django.contrib import admin

from .models import Notification, SystemConfig


@admin.register(SystemConfig)
class SystemConfigAdmin(admin.ModelAdmin):
    list_display = ('system_name', 'weather_text', 'weather_temp_c', 'updated_at')


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('title', 'level', 'is_read', 'source', 'created_at')
    list_filter = ('level', 'is_read')
