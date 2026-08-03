"""监测路由"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MonitoringDeviceViewSet, MonitorDataViewSet

router = DefaultRouter()
router.register(r'devices', MonitoringDeviceViewSet, basename='device')
router.register(r'data', MonitorDataViewSet, basename='monitor-data')

urlpatterns = [
    path('', include(router.urls)),
]
