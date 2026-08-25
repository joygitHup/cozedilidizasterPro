from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import CrossSection, GeologySite
from .serializers import CrossSectionSerializer, GeologySiteSerializer


class CrossSectionViewSet(viewsets.ModelViewSet):
    queryset = CrossSection.objects.select_related('hazard_point').all()
    serializer_class = CrossSectionSerializer
    filterset_fields = ['hazard_point', 'location']
    search_fields = ['code', 'name', 'location', 'direction']
    ordering_fields = ['code', 'length_m', 'updated_at']

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        qs = self.filter_queryset(self.get_queryset())
        return Response({'total': qs.count()})


class GeologySiteViewSet(viewsets.ModelViewSet):
    queryset = GeologySite.objects.select_related('hazard_point').all()
    serializer_class = GeologySiteSerializer
    filterset_fields = ['status', 'hazard_point']
    search_fields = ['code', 'name', 'description', 'hazard_point__name']
    ordering_fields = ['updated_at', 'code', 'name']

    def get_queryset(self):
        qs = super().get_queryset()
        published = self.request.query_params.get('published')
        if published in ('1', 'true', 'True'):
            qs = qs.filter(status=GeologySite.Status.PUBLISHED)
        return qs

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        qs = self.filter_queryset(self.get_queryset())
        return Response({
            'total': qs.count(),
            'published': qs.filter(status='published').count(),
            'with_tileset': qs.exclude(tileset_url='').count(),
            'with_ion': qs.exclude(ion_asset_id='').count(),
        })
