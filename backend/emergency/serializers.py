"""应急序列化器"""
from rest_framework import serializers

from .models import EmergencyPlan, EmergencySupply, EvacuationTask

# 响应等级 ↔ 预警色标（业务展示）
LEVEL_COLOR = {'1': 'red', '2': 'orange', '3': 'yellow', '4': 'blue'}
COLOR_LEVEL = {v: k for k, v in LEVEL_COLOR.items()}


class EmergencyPlanSerializer(serializers.ModelSerializer):
    """应急预案详情/写入"""
    level_display = serializers.CharField(source='get_level_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    color_level = serializers.SerializerMethodField()
    target_scope = serializers.SerializerMethodField()
    step_count = serializers.SerializerMethodField()

    class Meta:
        model = EmergencyPlan
        fields = [
            'id', 'code', 'name', 'level', 'level_display', 'color_level',
            'status', 'status_display',
            'description', 'content', 'applicable_scenarios', 'target_scope',
            'commander', 'commander_phone', 'step_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'code': {'required': False, 'allow_blank': True},
            'name': {'required': True},
            'level': {'required': True},
            'content': {'required': False},
            'applicable_scenarios': {'required': False},
        }

    def get_color_level(self, obj):
        return LEVEL_COLOR.get(obj.level, 'blue')

    def get_target_scope(self, obj):
        scenarios = obj.applicable_scenarios or []
        if isinstance(scenarios, list) and scenarios:
            return '、'.join(str(s) for s in scenarios)
        return ''

    def get_step_count(self, obj):
        content = obj.content or {}
        steps = content.get('steps') or []
        return len(steps) if isinstance(steps, list) else 0

    def validate_code(self, value):
        value = (value or '').strip().upper()
        if not value:
            return value
        qs = EmergencyPlan.objects.filter(code=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('预案编号已存在')
        return value

    def validate_level(self, value):
        valid = {c.value for c in EmergencyPlan.Level}
        if value not in valid:
            # 兼容前端传 red/orange
            mapped = COLOR_LEVEL.get(value)
            if mapped:
                return mapped
            raise serializers.ValidationError(f'无效响应等级，可选: {", ".join(sorted(valid))}')
        return value

    def validate(self, attrs):
        name = attrs.get('name', getattr(self.instance, 'name', ''))
        if not (name or '').strip():
            raise serializers.ValidationError({'name': '预案名称不能为空'})

        content = attrs.get(
            'content',
            getattr(self.instance, 'content', {}) if self.instance else {},
        )
        if content is None:
            content = {}
        if not isinstance(content, dict):
            raise serializers.ValidationError({'content': '预案内容须为 JSON 对象'})
        steps = content.get('steps')
        if steps is not None and not isinstance(steps, list):
            raise serializers.ValidationError({'content.steps': '处置步骤须为数组'})
        attrs['content'] = content

        scenarios = attrs.get(
            'applicable_scenarios',
            getattr(self.instance, 'applicable_scenarios', []) if self.instance else [],
        )
        if scenarios is None:
            scenarios = []
        if isinstance(scenarios, str):
            scenarios = [s.strip() for s in scenarios.replace('，', ',').split(',') if s.strip()]
        if not isinstance(scenarios, list):
            raise serializers.ValidationError({'applicable_scenarios': '适用对象须为列表'})
        attrs['applicable_scenarios'] = scenarios
        return attrs

    def create(self, validated_data):
        code = (validated_data.get('code') or '').strip()
        if not code:
            validated_data['code'] = self._next_code()
        if not validated_data.get('content'):
            validated_data['content'] = {
                'steps': [
                    {'order': 1, 'title': '接警确认', 'desc': '值班员确认预警信息'},
                    {'order': 2, 'title': '启动响应', 'desc': '按等级启动应急响应'},
                    {'order': 3, 'title': '转移安置', 'desc': '组织危险区人员转移'},
                    {'order': 4, 'title': '复盘闭环', 'desc': '险情解除后评估归档'},
                ],
                'resources': [],
            }
        return super().create(validated_data)

    @staticmethod
    def _next_code() -> str:
        existing = (
            EmergencyPlan.objects.filter(code__startswith='EP')
            .order_by('-code')
            .values_list('code', flat=True)
        )
        max_n = 0
        for code in existing:
            suffix = code.replace('EP', '').lstrip('-')
            if suffix.isdigit():
                max_n = max(max_n, int(suffix))
        return f'EP{max_n + 1:03d}'


class EmergencyPlanListSerializer(serializers.ModelSerializer):
    level_display = serializers.CharField(source='get_level_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    color_level = serializers.SerializerMethodField()
    target_scope = serializers.SerializerMethodField()
    step_count = serializers.SerializerMethodField()

    class Meta:
        model = EmergencyPlan
        fields = [
            'id', 'code', 'name', 'level', 'level_display', 'color_level',
            'status', 'status_display', 'description',
            'applicable_scenarios', 'target_scope', 'step_count',
            'commander', 'commander_phone', 'updated_at', 'created_at',
        ]

    def get_color_level(self, obj):
        return EmergencyPlanSerializer().get_color_level(obj)

    def get_target_scope(self, obj):
        return EmergencyPlanSerializer().get_target_scope(obj)

    def get_step_count(self, obj):
        return EmergencyPlanSerializer().get_step_count(obj)


class EvacuationTaskSerializer(serializers.ModelSerializer):
    """避险转移任务详情/写入"""
    hazard_point_name = serializers.CharField(source='hazard_point.name', read_only=True)
    hazard_point_code = serializers.CharField(source='hazard_point.code', read_only=True)
    hazard_point_level = serializers.CharField(source='hazard_point.level', read_only=True)
    hazard_longitude = serializers.DecimalField(
        source='hazard_point.longitude', max_digits=12, decimal_places=8, read_only=True
    )
    hazard_latitude = serializers.DecimalField(
        source='hazard_point.latitude', max_digits=12, decimal_places=8, read_only=True
    )
    warning_code = serializers.CharField(source='warning.code', read_only=True, allow_null=True)
    warning_level = serializers.CharField(source='warning.level', read_only=True, allow_null=True)
    warning_status = serializers.CharField(source='warning.status', read_only=True, allow_null=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    completion_rate = serializers.ReadOnlyField()

    class Meta:
        model = EvacuationTask
        fields = [
            'id', 'code', 'warning', 'warning_code', 'warning_level', 'warning_status',
            'hazard_point', 'hazard_point_name', 'hazard_point_code', 'hazard_point_level',
            'hazard_longitude', 'hazard_latitude',
            'status', 'status_display',
            'total_people', 'transferred_people', 'completion_rate',
            'shelter_name', 'shelter_address', 'shelter_longitude', 'shelter_latitude',
            'route_path', 'route_distance', 'estimated_time', 'route_provider',
            'commander', 'commander_phone', 'grid_worker', 'grid_phone',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'route_provider']
        extra_kwargs = {
            'code': {'required': False, 'allow_blank': True},
            'route_path': {'required': False},
            'shelter_name': {'required': False, 'allow_blank': True},
        }

    def validate_code(self, value):
        value = (value or '').strip().upper()
        if not value:
            return value
        qs = EvacuationTask.objects.filter(code=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('任务编号已存在')
        return value

    def validate_status(self, value):
        valid = {c.value for c in EvacuationTask.Status}
        if value not in valid:
            raise serializers.ValidationError(f'无效状态，可选: {", ".join(sorted(valid))}')
        return value

    def validate(self, attrs):
        total = attrs.get('total_people', getattr(self.instance, 'total_people', 0))
        transferred = attrs.get(
            'transferred_people', getattr(self.instance, 'transferred_people', 0)
        )
        if total is not None and total < 0:
            raise serializers.ValidationError({'total_people': '需转移人数不能为负'})
        if transferred is not None and transferred < 0:
            raise serializers.ValidationError({'transferred_people': '已转移人数不能为负'})
        if total is not None and transferred is not None and transferred > total:
            raise serializers.ValidationError({'transferred_people': '已转移人数不能超过需转移人数'})
        return attrs

    def create(self, validated_data):
        from .geo import ensure_task_geometry

        code = (validated_data.get('code') or '').strip()
        if not code:
            validated_data['code'] = self._next_code()
        point = validated_data.get('hazard_point')
        if point and not validated_data.get('total_people'):
            validated_data['total_people'] = point.threat_people or 0
        task = EvacuationTask(**validated_data)
        ensure_task_geometry(task)
        task.save()
        return task

    def update(self, instance, validated_data):
        from .geo import ensure_task_geometry

        for k, v in validated_data.items():
            setattr(instance, k, v)
        ensure_task_geometry(instance)
        instance.save()
        return instance

    @staticmethod
    def _next_code() -> str:
        existing = (
            EvacuationTask.objects.filter(code__startswith='EV')
            .order_by('-code')
            .values_list('code', flat=True)
        )
        max_n = 0
        for code in existing:
            suffix = code.replace('EV', '').lstrip('-')
            # 兼容 EV001 与 EV20260326120000
            if suffix.isdigit() and len(suffix) <= 4:
                max_n = max(max_n, int(suffix))
        return f'EV{max_n + 1:03d}'


class EvacuationTaskListSerializer(serializers.ModelSerializer):
    """转移任务列表序列化器"""
    hazard_point_name = serializers.CharField(source='hazard_point.name', read_only=True)
    hazard_point_code = serializers.CharField(source='hazard_point.code', read_only=True)
    hazard_point_level = serializers.CharField(source='hazard_point.level', read_only=True)
    hazard_longitude = serializers.DecimalField(
        source='hazard_point.longitude', max_digits=12, decimal_places=8, read_only=True
    )
    hazard_latitude = serializers.DecimalField(
        source='hazard_point.latitude', max_digits=12, decimal_places=8, read_only=True
    )
    warning_code = serializers.CharField(source='warning.code', read_only=True, allow_null=True)
    warning_level = serializers.CharField(source='warning.level', read_only=True, allow_null=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    completion_rate = serializers.ReadOnlyField()

    class Meta:
        model = EvacuationTask
        fields = [
            'id', 'code', 'warning', 'warning_code', 'warning_level',
            'hazard_point', 'hazard_point_name', 'hazard_point_code', 'hazard_point_level',
            'hazard_longitude', 'hazard_latitude',
            'total_people', 'transferred_people', 'completion_rate', 'status', 'status_display',
            'shelter_name', 'shelter_address', 'shelter_longitude', 'shelter_latitude',
            'route_path', 'route_distance', 'estimated_time', 'route_provider',
            'commander', 'commander_phone', 'grid_worker', 'grid_phone',
            'created_at', 'updated_at',
        ]


class EmergencySupplySerializer(serializers.ModelSerializer):
    """应急物资序列化器"""
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = EmergencySupply
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']
