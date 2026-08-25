from django.contrib import admin

from .models import MonitorDailyAgg, MonitorData, MonitoringDevice, MqttIngestLog


@admin.register(MonitoringDevice)
class MonitoringDeviceAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'device_type', 'status', 'battery', 'last_data_time')
    search_fields = ('code', 'name')
    list_filter = ('device_type', 'status')


@admin.register(MonitorData)
class MonitorDataAdmin(admin.ModelAdmin):
    list_display = ('device', 'data_type', 'value', 'unit', 'record_time')
    list_filter = ('data_type',)


@admin.register(MonitorDailyAgg)
class MonitorDailyAggAdmin(admin.ModelAdmin):
    list_display = ('device', 'data_type', 'day', 'count', 'min_value', 'max_value', 'avg_value')
    list_filter = ('data_type', 'day')


@admin.register(MqttIngestLog)
class MqttIngestLogAdmin(admin.ModelAdmin):
    list_display = ('trace_id', 'device_code', 'status', 'topic', 'monitor_data_id', 'created_at')
    list_filter = ('status',)
    search_fields = ('device_code', 'topic', 'trace_id', 'error')
