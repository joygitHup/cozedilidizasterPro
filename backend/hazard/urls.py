"""隐患台账路由"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import HazardPointViewSet, RiskSlopeViewSet, InspectionTaskViewSet

router = DefaultRouter()
router.register(r'points', HazardPointViewSet, basename='hazard-point')
router.register(r'slopes', RiskSlopeViewSet, basename='risk-slope')
router.register(r'tasks', InspectionTaskViewSet, basename='inspection-task')

urlpatterns = [
    path('', include(router.urls)),
]
