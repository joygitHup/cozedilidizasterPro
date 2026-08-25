"""隐患台账路由"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import HazardPointViewSet, RiskSlopeViewSet, InspectionTaskViewSet
from .region_views import RegionViewSet

router = DefaultRouter()
router.register(r'points', HazardPointViewSet, basename='hazard-point')
router.register(r'slopes', RiskSlopeViewSet, basename='risk-slope')
router.register(r'tasks', InspectionTaskViewSet, basename='inspection-task')
router.register(r'regions', RegionViewSet, basename='hazard-region')

urlpatterns = [
    path('', include(router.urls)),
]
