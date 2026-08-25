"""隐患台账序列化器"""
from rest_framework import serializers
from .models import HazardPoint, RiskSlope, InspectionTask


class HazardPointSerializer(serializers.ModelSerializer):
    """隐患点详情/写入序列化器"""
    type_display = serializers.CharField(source='get_type_display', read_only=True)
    level_display = serializers.CharField(source='get_level_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    device_count = serializers.SerializerMethodField()
    open_warning_count = serializers.SerializerMethodField()
    inspection_pending_count = serializers.SerializerMethodField()

    class Meta:
        model = HazardPoint
        fields = [
            'id', 'code', 'name', 'type', 'type_display', 'level', 'level_display',
            'status', 'status_display',
            'longitude', 'latitude', 'address',
            'city', 'district', 'county', 'village', 'town',
            'volume', 'length', 'width', 'height',
            'threat_people', 'threat_houses', 'threat_roads', 'threat_assets',
            'stability_coefficient', 'responsible_person', 'contact_phone',
            'photos', 'files',
            'device_count', 'open_warning_count', 'inspection_pending_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_device_count(self, obj):
        return obj.devices.count()

    def get_open_warning_count(self, obj):
        return obj.warnings.exclude(status='closed').count()

    def get_inspection_pending_count(self, obj):
        return obj.inspection_tasks.filter(status__in=['pending', 'in_progress']).count()

    def validate_code(self, value):
        value = (value or '').strip().upper()
        if not value:
            return value
        qs = HazardPoint.objects.filter(code=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('隐患点编号已存在')
        return value

    def validate(self, attrs):
        lng = attrs.get('longitude', getattr(self.instance, 'longitude', None))
        lat = attrs.get('latitude', getattr(self.instance, 'latitude', None))
        if lng is None or lat is None:
            raise serializers.ValidationError({'longitude': '经纬度必填'})
        try:
            lng_f, lat_f = float(lng), float(lat)
        except (TypeError, ValueError):
            raise serializers.ValidationError('经纬度格式无效')
        if not (-180 <= lng_f <= 180) or not (-90 <= lat_f <= 90):
            raise serializers.ValidationError('经纬度超出有效范围')

        name = attrs.get('name', getattr(self.instance, 'name', ''))
        if not (name or '').strip():
            raise serializers.ValidationError({'name': '名称不能为空'})

        # 区写入时同步兼容字段 town
        district = attrs.get('district')
        if district is not None:
            attrs['town'] = (district or '').strip()

        # 高风险默认提升关注状态（仅新建或同时改等级时）
        level = attrs.get('level', getattr(self.instance, 'level', None))
        status = attrs.get('status', getattr(self.instance, 'status', 'stable'))
        if self.instance is None and 'status' not in attrs:
            if level in ('red', 'orange'):
                attrs['status'] = HazardPoint.Status.ATTENTION
            else:
                attrs.setdefault('status', HazardPoint.Status.STABLE)
        elif level in ('red',) and status == 'stable' and 'status' not in self.initial_data:
            attrs['status'] = HazardPoint.Status.ATTENTION

        return attrs

    def create(self, validated_data):
        code = (validated_data.get('code') or '').strip()
        if not code:
            validated_data['code'] = self._next_code()
        if validated_data.get('district') and not validated_data.get('town'):
            validated_data['town'] = validated_data['district']
        return super().create(validated_data)

    @staticmethod
    def _next_code() -> str:
        existing = (
            HazardPoint.objects.filter(code__startswith='HS')
            .order_by('-code')
            .values_list('code', flat=True)
        )
        max_n = 0
        for code in existing:
            suffix = code[2:]
            if suffix.isdigit():
                max_n = max(max_n, int(suffix))
        return f'HS{max_n + 1:03d}'


class HazardPointListSerializer(serializers.ModelSerializer):
    """隐患点列表序列化器"""
    type_display = serializers.CharField(source='get_type_display', read_only=True)
    level_display = serializers.CharField(source='get_level_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = HazardPoint
        fields = [
            'id', 'code', 'name', 'type', 'type_display', 'level', 'level_display',
            'status', 'status_display',
            'longitude', 'latitude', 'address',
            'city', 'district', 'county', 'village', 'town',
            'volume', 'length', 'width', 'height',
            'threat_people', 'threat_houses', 'threat_roads', 'threat_assets',
            'stability_coefficient', 'responsible_person', 'contact_phone',
            'created_at', 'updated_at',
        ]


class HazardPointWriteSerializer(HazardPointSerializer):
    """写入时可不传 code（自动生成）"""

    class Meta(HazardPointSerializer.Meta):
        extra_kwargs = {
            'code': {'required': False, 'allow_blank': True},
            'longitude': {'required': True},
            'latitude': {'required': True},
            'name': {'required': True},
            'type': {'required': True},
            'level': {'required': True},
        }


class RiskSlopeSerializer(serializers.ModelSerializer):
    """风险斜坡详情/写入"""
    hazard_point_name = serializers.CharField(source='hazard_point.name', read_only=True)
    hazard_point_code = serializers.CharField(source='hazard_point.code', read_only=True)
    risk_level_display = serializers.CharField(source='get_risk_level_display', read_only=True)
    monitor_coverage = serializers.SerializerMethodField()
    monitor_coverage_display = serializers.SerializerMethodField()
    device_count = serializers.SerializerMethodField()
    open_warning_count = serializers.SerializerMethodField()

    class Meta:
        model = RiskSlope
        fields = [
            'id', 'code', 'name', 'hazard_point', 'hazard_point_name', 'hazard_point_code',
            'risk_level', 'risk_level_display', 'area', 'slope_angle', 'description',
            'longitude', 'latitude',
            'monitor_coverage', 'monitor_coverage_display',
            'device_count', 'open_warning_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'code': {'required': False, 'allow_blank': True},
            'name': {'required': True},
            'risk_level': {'required': True},
            'area': {'required': True},
            'longitude': {'required': False},
            'latitude': {'required': False},
            'hazard_point': {'required': False, 'allow_null': True},
        }

    def get_monitor_coverage(self, obj):
        return self._coverage_code(obj)

    def get_monitor_coverage_display(self, obj):
        return {
            'unlinked': '未关联隐患点',
            'pending': '待部署',
            'partial': '部分覆盖',
            'full': '已覆盖',
            'offline': '设备离线',
        }.get(self._coverage_code(obj), '未知')

    def get_device_count(self, obj):
        if not obj.hazard_point_id:
            return 0
        return obj.hazard_point.devices.count()

    def get_open_warning_count(self, obj):
        if not obj.hazard_point_id:
            return 0
        return obj.hazard_point.warnings.exclude(status='closed').count()

    @staticmethod
    def _coverage_code(obj) -> str:
        if not obj.hazard_point_id:
            return 'unlinked'
        devices = obj.hazard_point.devices.all()
        total = devices.count()
        if total == 0:
            return 'pending'
        online = devices.filter(status='online').count()
        if online == total:
            return 'full'
        if online > 0:
            return 'partial'
        return 'offline'

    def validate_code(self, value):
        value = (value or '').strip().upper()
        if not value:
            return value
        qs = RiskSlope.objects.filter(code=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('斜坡编号已存在')
        return value

    def validate(self, attrs):
        name = attrs.get('name', getattr(self.instance, 'name', ''))
        if not (name or '').strip():
            raise serializers.ValidationError({'name': '名称不能为空'})

        area = attrs.get('area', getattr(self.instance, 'area', None))
        if area is not None and float(area) <= 0:
            raise serializers.ValidationError({'area': '面积必须大于 0'})

        lng = attrs.get('longitude', getattr(self.instance, 'longitude', None))
        lat = attrs.get('latitude', getattr(self.instance, 'latitude', None))
        hazard_point = attrs.get(
            'hazard_point',
            getattr(self.instance, 'hazard_point', None) if self.instance else None,
        )
        # 关联隐患点且未显式传坐标时，继承隐患点坐标
        initial = getattr(self, 'initial_data', {}) or {}
        if hazard_point:
            if 'longitude' not in initial or initial.get('longitude') in (None, ''):
                attrs['longitude'] = hazard_point.longitude
                lng = hazard_point.longitude
            if 'latitude' not in initial or initial.get('latitude') in (None, ''):
                attrs['latitude'] = hazard_point.latitude
                lat = hazard_point.latitude

        if lng is None or lat is None:
            raise serializers.ValidationError({'longitude': '经纬度必填（或关联隐患点自动带入）'})
        try:
            lng_f, lat_f = float(lng), float(lat)
        except (TypeError, ValueError):
            raise serializers.ValidationError('经纬度格式无效')
        if not (-180 <= lng_f <= 180) or not (-90 <= lat_f <= 90):
            raise serializers.ValidationError('经纬度超出有效范围')

        # 高风险必须关联隐患点
        risk_level = attrs.get('risk_level', getattr(self.instance, 'risk_level', None))
        if risk_level == 'high' and not hazard_point:
            raise serializers.ValidationError(
                {'hazard_point': '高风险斜坡必须关联隐患点，以保证监测与预警闭环'}
            )

        return attrs

    def create(self, validated_data):
        code = (validated_data.get('code') or '').strip()
        if not code:
            validated_data['code'] = self._next_code()
        return super().create(validated_data)

    @staticmethod
    def _next_code() -> str:
        existing = (
            RiskSlope.objects.filter(code__startswith='RS')
            .order_by('-code')
            .values_list('code', flat=True)
        )
        max_n = 0
        for code in existing:
            suffix = code[2:]
            if suffix.isdigit():
                max_n = max(max_n, int(suffix))
        return f'RS{max_n + 1:03d}'


class RiskSlopeListSerializer(serializers.ModelSerializer):
    """风险斜坡列表"""
    hazard_point_name = serializers.CharField(source='hazard_point.name', read_only=True)
    hazard_point_code = serializers.CharField(source='hazard_point.code', read_only=True)
    risk_level_display = serializers.CharField(source='get_risk_level_display', read_only=True)
    monitor_coverage = serializers.SerializerMethodField()
    monitor_coverage_display = serializers.SerializerMethodField()

    class Meta:
        model = RiskSlope
        fields = [
            'id', 'code', 'name', 'hazard_point', 'hazard_point_name', 'hazard_point_code',
            'risk_level', 'risk_level_display', 'area', 'slope_angle',
            'longitude', 'latitude',
            'monitor_coverage', 'monitor_coverage_display',
            'created_at', 'updated_at',
        ]

    def get_monitor_coverage(self, obj):
        return RiskSlopeSerializer._coverage_code(obj)

    def get_monitor_coverage_display(self, obj):
        return RiskSlopeSerializer().get_monitor_coverage_display(obj)


class InspectionTaskSerializer(serializers.ModelSerializer):
    """排查任务详情/写入"""
    hazard_point_name = serializers.CharField(source='hazard_point.name', read_only=True)
    hazard_point_code = serializers.CharField(source='hazard_point.code', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    task_type_display = serializers.CharField(source='get_task_type_display', read_only=True)
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = InspectionTask
        fields = [
            'id', 'code', 'title', 'description', 'task_type', 'task_type_display',
            'hazard_point', 'hazard_point_name', 'hazard_point_code',
            'status', 'status_display', 'priority', 'priority_display',
            'assigned_to', 'assigned_phone', 'route_desc', 'checkpoint_count',
            'planned_date', 'started_at', 'completed_at',
            'result', 'issue_count', 'duration_minutes', 'photos',
            'is_overdue', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'started_at', 'completed_at', 'duration_minutes',
            'created_at', 'updated_at',
        ]
        extra_kwargs = {
            'code': {'required': False, 'allow_blank': True},
            'title': {'required': True},
        }

    def get_is_overdue(self, obj):
        if obj.status not in (
            InspectionTask.Status.PENDING,
            InspectionTask.Status.IN_PROGRESS,
        ):
            return False
        if not obj.planned_date:
            return False
        from django.utils import timezone
        planned = obj.planned_date
        if isinstance(planned, str):
            from datetime import datetime
            try:
                planned = datetime.strptime(planned[:10], '%Y-%m-%d').date()
            except ValueError:
                return False
        return planned < timezone.localdate()

    def validate_code(self, value):
        value = (value or '').strip().upper()
        if not value:
            return value
        qs = InspectionTask.objects.filter(code=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('任务编号已存在')
        return value

    def validate(self, attrs):
        title = attrs.get('title', getattr(self.instance, 'title', ''))
        if not (title or '').strip():
            raise serializers.ValidationError({'title': '任务标题不能为空'})

        priority = attrs.get('priority', getattr(self.instance, 'priority', 'medium'))
        assigned = attrs.get('assigned_to', getattr(self.instance, 'assigned_to', ''))
        planned = attrs.get('planned_date', getattr(self.instance, 'planned_date', None))
        hazard = attrs.get(
            'hazard_point',
            getattr(self.instance, 'hazard_point', None) if self.instance else None,
        )
        task_type = attrs.get(
            'task_type',
            getattr(self.instance, 'task_type', InspectionTask.TaskType.ROUTINE),
        )

        if priority == 'high':
            if not (assigned or '').strip():
                raise serializers.ValidationError({'assigned_to': '高优先级任务必须指定执行人'})
            if not planned:
                raise serializers.ValidationError({'planned_date': '高优先级任务必须指定计划日期'})

        if task_type == InspectionTask.TaskType.EMERGENCY and not hazard:
            raise serializers.ValidationError(
                {'hazard_point': '应急排查必须关联隐患点，以保证处置闭环'}
            )

        checkpoint = attrs.get(
            'checkpoint_count',
            getattr(self.instance, 'checkpoint_count', 1) if self.instance else 1,
        )
        if checkpoint is not None and int(checkpoint) < 1:
            raise serializers.ValidationError({'checkpoint_count': '检查点数至少为 1'})

        return attrs

    def create(self, validated_data):
        code = (validated_data.get('code') or '').strip()
        if not code:
            validated_data['code'] = self._next_code()
        return super().create(validated_data)

    @staticmethod
    def _next_code() -> str:
        from django.utils import timezone
        prefix = f"PT{timezone.localdate().strftime('%Y%m%d')}"
        existing = (
            InspectionTask.objects.filter(code__startswith=prefix)
            .order_by('-code')
            .values_list('code', flat=True)
        )
        max_n = 0
        for code in existing:
            suffix = code[len(prefix):]
            if suffix.isdigit():
                max_n = max(max_n, int(suffix))
        return f'{prefix}{max_n + 1:03d}'


class InspectionTaskListSerializer(serializers.ModelSerializer):
    """排查任务列表"""
    hazard_point_name = serializers.CharField(source='hazard_point.name', read_only=True)
    hazard_point_code = serializers.CharField(source='hazard_point.code', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    task_type_display = serializers.CharField(source='get_task_type_display', read_only=True)
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = InspectionTask
        fields = [
            'id', 'code', 'title', 'task_type', 'task_type_display',
            'hazard_point', 'hazard_point_name', 'hazard_point_code',
            'status', 'status_display', 'priority', 'priority_display',
            'assigned_to', 'assigned_phone', 'route_desc', 'checkpoint_count',
            'planned_date', 'started_at', 'completed_at',
            'result', 'issue_count', 'duration_minutes', 'is_overdue',
            'created_at', 'updated_at',
        ]

    def get_is_overdue(self, obj):
        return InspectionTaskSerializer().get_is_overdue(obj)
