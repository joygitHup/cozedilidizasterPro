"""应急路由"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EmergencyPlanViewSet, EvacuationTaskViewSet, EmergencySupplyViewSet

router = DefaultRouter()
router.register(r'plans', EmergencyPlanViewSet, basename='emergency-plan')
router.register(r'evacuation', EvacuationTaskViewSet, basename='evacuation-task')
router.register(r'supplies', EmergencySupplyViewSet, basename='emergency-supply')

urlpatterns = [
    path('', include(router.urls)),
]
