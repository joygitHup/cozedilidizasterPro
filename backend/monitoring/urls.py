"""监测路由"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MonitoringDeviceViewSet, MonitorDataViewSet
from .ingest_views import (
    DeviceIotStateView,
    EngineThresholdResolveView,
    IotOpsAlertsView,
    MqttIngestLogListView,
    MqttIngestPreviewView,
    MqttIngestView,
)

router = DefaultRouter()
router.register(r'devices', MonitoringDeviceViewSet, basename='device')
router.register(r'data', MonitorDataViewSet, basename='monitor-data')

urlpatterns = [
    path('ingest/mqtt/', MqttIngestView.as_view(), name='mqtt-ingest'),
    path('ingest/preview/', MqttIngestPreviewView.as_view(), name='mqtt-ingest-preview'),
    path('ingest/state/', DeviceIotStateView.as_view(), name='mqtt-ingest-state'),
    path('ingest/logs/', MqttIngestLogListView.as_view(), name='mqtt-ingest-logs'),
    path('ingest/ops-alerts/', IotOpsAlertsView.as_view(), name='mqtt-ops-alerts'),
    path(
        'ingest/engine-threshold/',
        EngineThresholdResolveView.as_view(),
        name='mqtt-engine-threshold',
    ),
    path('', include(router.urls)),
]
