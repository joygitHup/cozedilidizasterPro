from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import EquipmentAssetViewSet, MaterialStockViewSet

router = DefaultRouter()
router.register(r'materials', MaterialStockViewSet, basename='equipment-material')
router.register(r'assets', EquipmentAssetViewSet, basename='equipment-asset')

urlpatterns = [
    path('', include(router.urls)),
]
