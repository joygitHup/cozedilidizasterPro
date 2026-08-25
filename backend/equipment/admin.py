from django.contrib import admin

from .models import EquipmentAsset, MaterialStock


@admin.register(MaterialStock)
class MaterialStockAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'stock', 'unit', 'location', 'min_stock', 'updated_at')
    search_fields = ('code', 'name')


@admin.register(EquipmentAsset)
class EquipmentAssetAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'model', 'status', 'location', 'next_maint')
    list_filter = ('status',)
    search_fields = ('code', 'name')
