from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CrossSectionViewSet, GeologySiteViewSet

router = DefaultRouter()
router.register(r'cross-sections', CrossSectionViewSet, basename='geology-cross-section')
router.register(r'sites', GeologySiteViewSet, basename='geology-site')

urlpatterns = [
    path('', include(router.urls)),
]
