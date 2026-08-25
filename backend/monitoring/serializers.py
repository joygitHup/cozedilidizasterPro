"""监测序列化器"""
from django.utils import timezone
from rest_framework import serializers

from .models import MonitorData, MonitoringDevice


class MonitoringDeviceSerializer(serializers.ModelSerializer):
    """监测设备详情/写入"""
    hazard_point_name = serializers.CharField(source='hazard_point.name', read_only=True)
    hazard_point_code = serializers.CharField(source='hazard_point.code', read_only=True)
    device_type_display = serializers.CharField(source='get_device_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    signal_display = serializers.CharField(source='get_signal_display', read_only=True)
    data_count = serializers.SerializerMethodField()
    is_stale = serializers.SerializerMethodField()
    low_battery = serializers.SerializerMethodField()

    class Meta:
        model = MonitoringDevice
        fields = [
            'id', 'code', 'name', 'device_type', 'device_type_display',
            'status', 'status_display',
            'longitude', 'latitude', 'address',
            'city', 'district', 'county', 'village', 'town',
            'hazard_point', 'hazard_point_name', 'hazard_point_code',
            'install_date', 'range_value', 'accuracy', 'power_consumption',
            'battery', 'signal', 'signal_display', 'last_data_time',
            'data_count', 'is_stale', 'low_battery',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'last_data_time', 'created_at', 'updated_at']
        extra_kwargs = {
            'code': {'required': False, 'allow_blank': True},
            'name': {'required': True},
            'device_type': {'required': True},
            'longitude': {'required': False},
            'latitude': {'required': False},
        }

    def get_data_count(self, obj):
        return obj.data_records.count()

    def get_is_stale(self, obj):
        if not obj.last_data_time:
            return obj.status == 'online'
        from datetime import timedelta
        return obj.last_data_time < timezone.now() - timedelta(hours=24)

    def get_low_battery(self, obj):
        return obj.battery < 20

    def validate_code(self, value):
        value = (value or '').strip().upper()
        if not value:
            return value
        qs = MonitoringDevice.objects.filter(code=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('设备编号已存在')
        return value

    def validate_battery(self, value):
        if value is None:
            return 100
        if not 0 <= int(value) <= 100:
            raise serializers.ValidationError('电量须在 0–100 之间')
        return value

    def validate(self, attrs):
        name = attrs.get('name', getattr(self.instance, 'name', ''))
        if not (name or '').strip():
            raise serializers.ValidationError({'name': '设备名称不能为空'})

        hazard = attrs.get(
            'hazard_point',
            getattr(self.instance, 'hazard_point', None) if self.instance else None,
        )
        initial = getattr(self, 'initial_data', {}) or {}
        lng = attrs.get('longitude', getattr(self.instance, 'longitude', None))
        lat = attrs.get('latitude', getattr(self.instance, 'latitude', None))

        if hazard:
            if 'longitude' not in initial or initial.get('longitude') in (None, ''):
                attrs['longitude'] = hazard.longitude
                lng = hazard.longitude
            if 'latitude' not in initial or initial.get('latitude') in (None, ''):
                attrs['latitude'] = hazard.latitude
                lat = hazard.latitude
            if not attrs.get('address') and not getattr(self.instance, 'address', ''):
                attrs.setdefault('address', hazard.address or hazard.name)
            # 行政区划：请求未显式传时，从隐患点带入
            for src, dest in (
                ('city', 'city'),
                ('district', 'district'),
                ('county', 'county'),
                ('village', 'village'),
                ('town', 'town'),
            ):
                incoming = initial.get(dest)
                current = attrs.get(dest, getattr(self.instance, dest, '') if self.instance else '')
                if (incoming in (None, '') or dest not in initial) and not (current or '').strip():
                    hp_val = getattr(hazard, src, '') or ''
                    if src == 'district' and not hp_val:
                        hp_val = getattr(hazard, 'town', '') or ''
                    if src == 'town' and not hp_val:
                        hp_val = getattr(hazard, 'district', '') or ''
                    if hp_val:
                        attrs[dest] = hp_val

        # 区/镇兼容互填
        district = (attrs.get('district') or getattr(self.instance, 'district', '') if self.instance else '') or ''
        town = (attrs.get('town') or getattr(self.instance, 'town', '') if self.instance else '') or ''
        if district and not town:
            attrs['town'] = district
        elif town and not district:
            attrs['district'] = town

        if lng is None or lat is None:
            raise serializers.ValidationError(
                {'longitude': '经纬度必填（或关联隐患点自动带入）'}
            )
        try:
            lng_f, lat_f = float(lng), float(lat)
        except (TypeError, ValueError):
            raise serializers.ValidationError('经纬度格式无效')
        if not (-180 <= lng_f <= 180) or not (-90 <= lat_f <= 90):
            raise serializers.ValidationError('经纬度超出有效范围')

        return attrs

    def create(self, validated_data):
        code = (validated_data.get('code') or '').strip()
        if not code:
            dtype = validated_data.get('device_type', 'others')
            validated_data['code'] = self._next_code(dtype)
        return super().create(validated_data)

    @staticmethod
    def _next_code(device_type: str = 'others') -> str:
        prefix_map = {
            'npr_anchor': 'NPR',
            'rainfall': 'RAIN',
            'fiber_optic': 'FIB',
            'camera': 'CAM',
            'gnss': 'GNSS',
            'inclinometer': 'INC',
            'others': 'DEV',
        }
        prefix = prefix_map.get(device_type, 'DEV')
        existing = (
            MonitoringDevice.objects.filter(code__startswith=f'{prefix}-')
            .order_by('-code')
            .values_list('code', flat=True)
        )
        max_n = 0
        for code in existing:
            suffix = code.split('-')[-1]
            if suffix.isdigit():
                max_n = max(max_n, int(suffix))
        return f'{prefix}-{max_n + 1:03d}'


class MonitoringDeviceListSerializer(serializers.ModelSerializer):
    """设备列表"""
    hazard_point_name = serializers.CharField(source='hazard_point.name', read_only=True)
    hazard_point_code = serializers.CharField(source='hazard_point.code', read_only=True)
    device_type_display = serializers.CharField(source='get_device_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    signal_display = serializers.CharField(source='get_signal_display', read_only=True)
    is_stale = serializers.SerializerMethodField()
    low_battery = serializers.SerializerMethodField()

    class Meta:
        model = MonitoringDevice
        fields = [
            'id', 'code', 'name', 'device_type', 'device_type_display',
            'status', 'status_display',
            'longitude', 'latitude', 'address',
            'city', 'district', 'county', 'village', 'town',
            'hazard_point', 'hazard_point_name', 'hazard_point_code',
            'battery', 'signal', 'signal_display', 'last_data_time',
            'range_value', 'accuracy', 'power_consumption', 'install_date',
            'is_stale', 'low_battery',
            'created_at', 'updated_at',
        ]

    def get_is_stale(self, obj):
        return MonitoringDeviceSerializer().get_is_stale(obj)

    def get_low_battery(self, obj):
        return MonitoringDeviceSerializer().get_low_battery(obj)


DEFAULT_UNITS = {
    'force': 'kN',
    'displacement': 'mm',
    'rainfall': 'mm',
    'stress': 'MPa',
    'strain': 'με',
    'temperature': '℃',
}


class MonitorDataSerializer(serializers.ModelSerializer):
    """监测数据序列化器"""
    device_code = serializers.CharField(source='device.code', read_only=True)
    device_name = serializers.CharField(source='device.name', read_only=True)
    data_type_display = serializers.CharField(source='get_data_type_display', read_only=True)
    hazard_point_id = serializers.IntegerField(
        source='device.hazard_point_id', read_only=True, allow_null=True
    )
    hazard_point_code = serializers.CharField(
        source='device.hazard_point.code', read_only=True, allow_null=True, default=None
    )

    class Meta:
        model = MonitorData
        fields = [
            'id', 'device', 'device_code', 'device_name',
            'data_type', 'data_type_display', 'channel', 'value', 'unit', 'record_time',
            'hazard_point_id', 'hazard_point_code', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class MonitorDataCreateSerializer(serializers.ModelSerializer):
    """监测数据创建（设备上报），触发设备上线 + 预警研判"""

    class Meta:
        model = MonitorData
        fields = ['device', 'data_type', 'channel', 'value', 'unit', 'record_time']
        extra_kwargs = {
            'unit': {'required': False, 'allow_blank': True},
            'channel': {'required': False, 'allow_blank': True},
            'record_time': {'required': False},
        }

    def validate_data_type(self, value):
        valid = {c.value for c in MonitorData.DataType}
        if value not in valid:
            raise serializers.ValidationError(
                f'无效数据类型，可选: {", ".join(sorted(valid))}'
            )
        return value

    def validate_value(self, value):
        try:
            float(value)
        except (TypeError, ValueError):
            raise serializers.ValidationError('数值无效')
        return value

    def validate(self, attrs):
        if not attrs.get('unit'):
            attrs['unit'] = DEFAULT_UNITS.get(attrs.get('data_type'), '')
        if not attrs.get('record_time'):
            attrs['record_time'] = timezone.now()
        return attrs
