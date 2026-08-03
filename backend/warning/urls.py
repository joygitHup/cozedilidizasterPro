"""预警路由"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import WarningRecordViewSet, WarningModelViewSet

router = DefaultRouter()
router.register(r'records', WarningRecordViewSet, basename='warning-record')
router.register(r'models', WarningModelViewSet, basename='warning-model')

urlpatterns = [
    path('', include(router.urls)),
]
