from django.contrib import admin

from .models import CrossSection, GeologySite


@admin.register(CrossSection)
class CrossSectionAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'location', 'direction', 'length_m')
    search_fields = ('code', 'name', 'location')


@admin.register(GeologySite)
class GeologySiteAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'status', 'hazard_point', 'tileset_url', 'ion_asset_id')
    list_filter = ('status',)
    search_fields = ('code', 'name')
