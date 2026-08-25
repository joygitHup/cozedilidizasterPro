from rest_framework import serializers

from .models import CrossSection, GeologySite

DEFAULT_LAYERS = [
    {'key': 'cover', 'label': '第四系', 'color': '#a16207'},
    {'key': 'weathered', 'label': '强风化', 'color': '#c2410c'},
    {'key': 'mid', 'label': '中风化', 'color': '#b91c1c'},
    {'key': 'bedrock', 'label': '基岩', 'color': '#475569'},
]


class CrossSectionSerializer(serializers.ModelSerializer):
    hazard_point_name = serializers.CharField(
        source='hazard_point.name', read_only=True, default=''
    )

    class Meta:
        model = CrossSection
        fields = [
            'id', 'code', 'name', 'location', 'direction', 'length_m',
            'hazard_point', 'hazard_point_name',
            'profile_points', 'layers', 'description',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'hazard_point_name']

    def validate_code(self, value):
        value = (value or '').strip().upper()
        if not value:
            raise serializers.ValidationError('编号不能为空')
        qs = CrossSection.objects.filter(code=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('编号已存在')
        return value

    def create(self, validated_data):
        if not validated_data.get('layers'):
            validated_data['layers'] = DEFAULT_LAYERS
        return super().create(validated_data)


class GeologySiteSerializer(serializers.ModelSerializer):
    hazard_point_name = serializers.CharField(
        source='hazard_point.name', read_only=True, default=''
    )
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    viewer_path = serializers.SerializerMethodField()

    class Meta:
        model = GeologySite
        fields = [
            'id', 'code', 'name', 'hazard_point', 'hazard_point_name',
            'longitude', 'latitude', 'height',
            'tileset_url', 'ion_asset_id', 'glb_url', 'cover_url',
            'status', 'status_display', 'description', 'viewer_path',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at',
            'hazard_point_name', 'status_display', 'viewer_path',
        ]

    def get_viewer_path(self, obj):
        from urllib.parse import urlencode

        q = {
            'lon': float(obj.longitude) if obj.longitude is not None else 104.06,
            'lat': float(obj.latitude) if obj.latitude is not None else 30.67,
            'h': obj.height or 2500,
            'site': obj.id,
        }
        if obj.tileset_url:
            q['tileset'] = obj.tileset_url
        if obj.ion_asset_id:
            q['ion'] = obj.ion_asset_id
        if obj.glb_url:
            q['glb'] = obj.glb_url
        return f'/geology/viewer?{urlencode(q)}'

    def validate_code(self, value):
        value = (value or '').strip().upper()
        if not value:
            raise serializers.ValidationError('编号不能为空')
        qs = GeologySite.objects.filter(code=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('编号已存在')
        return value

    def create(self, validated_data):
        obj = GeologySite(**validated_data)
        obj.sync_coords_from_hazard()
        obj.save()
        return obj

    def update(self, instance, validated_data):
        for k, v in validated_data.items():
            setattr(instance, k, v)
        instance.sync_coords_from_hazard()
        instance.save()
        return instance
