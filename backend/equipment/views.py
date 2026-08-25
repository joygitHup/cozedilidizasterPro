from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import EquipmentAsset, MaterialStock
from .serializers import EquipmentAssetSerializer, MaterialStockSerializer


class MaterialStockViewSet(viewsets.ModelViewSet):
    queryset = MaterialStock.objects.all()
    serializer_class = MaterialStockSerializer
    filterset_fields = ['location']
    search_fields = ['code', 'name', 'spec', 'location']
    ordering_fields = ['code', 'stock', 'updated_at', 'name']

    def get_queryset(self):
        qs = super().get_queryset()
        st = self.request.query_params.get('status')
        if st in MaterialStock.Status.values:
            # status 是计算属性，内存过滤规模小；材料表通常不大
            ids = [m.id for m in qs if m.status == st]
            qs = qs.filter(id__in=ids)
        return qs

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        qs = list(self.filter_queryset(self.get_queryset()))
        return Response({
            'total': len(qs),
            'adequate': sum(1 for m in qs if m.status == 'adequate'),
            'low': sum(1 for m in qs if m.status == 'low'),
            'short': sum(1 for m in qs if m.status == 'short'),
        })


class EquipmentAssetViewSet(viewsets.ModelViewSet):
    queryset = EquipmentAsset.objects.all()
    serializer_class = EquipmentAssetSerializer
    filterset_fields = ['status', 'location']
    search_fields = ['code', 'name', 'model', 'location', 'keeper']
    ordering_fields = ['code', 'next_maint', 'updated_at', 'name']

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        qs = self.filter_queryset(self.get_queryset())
        today = timezone.localdate()
        overdue = qs.filter(next_maint__lt=today).exclude(status='retired').count()
        return Response({
            'total': qs.count(),
            'normal': qs.filter(status='normal').count(),
            'maintain': qs.filter(status='maintain').count(),
            'fault': qs.filter(status='fault').count(),
            'retired': qs.filter(status='retired').count(),
            'overdue': overdue,
        })

    @action(detail=True, methods=['post'])
    def mark_maintained(self, request, pk=None):
        """登记保养完成，可选 next_days 默认 90 天"""
        asset = self.get_object()
        today = timezone.localdate()
        days = int(request.data.get('next_days') or 90)
        from datetime import timedelta

        asset.last_maint = today
        asset.next_maint = today + timedelta(days=max(1, days))
        asset.status = EquipmentAsset.Status.NORMAL
        asset.save(update_fields=['last_maint', 'next_maint', 'status', 'updated_at'])
        return Response(EquipmentAssetSerializer(asset).data)
