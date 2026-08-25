"""生态治理路由"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import EcologyProjectViewSet, EffectAssessmentViewSet, ProgressLogViewSet

router = DefaultRouter()
router.register(r'projects', EcologyProjectViewSet, basename='ecology-project')
router.register(r'progress', ProgressLogViewSet, basename='ecology-progress')
router.register(r'assessments', EffectAssessmentViewSet, basename='ecology-assessment')

urlpatterns = [
    path('', include(router.urls)),
]
