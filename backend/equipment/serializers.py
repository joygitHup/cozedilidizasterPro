from rest_framework import serializers

from .models import EquipmentAsset, MaterialStock


class MaterialStockSerializer(serializers.ModelSerializer):
    status = serializers.CharField(read_only=True)
    status_display = serializers.SerializerMethodField()

    class Meta:
        model = MaterialStock
        fields = [
            'id', 'code', 'name', 'spec', 'stock', 'unit', 'location',
            'min_stock', 'status', 'status_display', 'remark',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'status', 'status_display']

    def get_status_display(self, obj):
        return dict(MaterialStock.Status.choices).get(obj.status, obj.status)

    def validate_code(self, value):
        value = (value or '').strip().upper()
        if not value:
            raise serializers.ValidationError('编号不能为空')
        qs = MaterialStock.objects.filter(code=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('编号已存在')
        return value


class EquipmentAssetSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = EquipmentAsset
        fields = [
            'id', 'code', 'name', 'model', 'location',
            'last_maint', 'next_maint', 'status', 'status_display',
            'keeper', 'remark', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'status_display']

    def validate_code(self, value):
        value = (value or '').strip().upper()
        if not value:
            raise serializers.ValidationError('编号不能为空')
        qs = EquipmentAsset.objects.filter(code=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('编号已存在')
        return value
