"""预警序列化器"""
from rest_framework import serializers

from .models import WarningModel, WarningRecord


class WarningRecordSerializer(serializers.ModelSerializer):
    """预警记录详情"""
    hazard_name = serializers.CharField(source='hazard_point.name', read_only=True)
    hazard_code = serializers.CharField(source='hazard_point.code', read_only=True)
    hazard_point_id = serializers.IntegerField(source='hazard_point.id', read_only=True)
    level_display = serializers.CharField(source='get_level_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    timeline = serializers.SerializerMethodField()

    class Meta:
        model = WarningRecord
        fields = [
            'id', 'code', 'hazard_point', 'hazard_point_id', 'hazard_name', 'hazard_code',
            'level', 'level_display', 'trigger_type', 'trigger_value', 'confidence',
            'status', 'status_display', 'call_status', 'call_detail',
            'confirm_time', 'confirm_user', 'publish_time', 'publish_user',
            'close_time', 'close_reason', 'timeline',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'code', 'created_at', 'updated_at',
            'confirm_time', 'publish_time', 'close_time',
        ]

    def get_timeline(self, obj):
        events = [
            {
                'time': obj.created_at,
                'event': '预警触发',
                'actor': '规则引擎',
                'status': 'completed',
            }
        ]
        if obj.confirm_time:
            events.append({
                'time': obj.confirm_time,
                'event': '值班确认',
                'actor': obj.confirm_user or '',
                'status': 'completed',
            })
        if obj.status == 'analyzing' or (
            obj.status in ('published', 'processing', 'closed') and obj.confirm_time
        ):
            # 研判节点：进入 analyzing 或已越过该阶段
            if obj.status == 'analyzing':
                events.append({
                    'time': obj.updated_at,
                    'event': '会商研判',
                    'actor': '',
                    'status': 'current',
                })
            elif obj.confirm_time:
                events.append({
                    'time': obj.confirm_time,
                    'event': '会商研判',
                    'actor': '',
                    'status': 'completed',
                })
        if obj.publish_time:
            events.append({
                'time': obj.publish_time,
                'event': '发布预警',
                'actor': obj.publish_user or '',
                'status': 'completed',
            })
        if obj.call_status in ('success', 'failed', 'timeout') and obj.call_detail:
            events.append({
                'time': obj.call_detail.get('called_at') or obj.updated_at,
                'event': f"一键叫应({obj.call_status})",
                'actor': obj.call_detail.get('caller', ''),
                'status': 'completed' if obj.call_status == 'success' else 'completed',
            })
        if obj.close_time:
            events.append({
                'time': obj.close_time,
                'event': f"闭环归档：{obj.close_reason}" if obj.close_reason else '闭环归档',
                'actor': '',
                'status': 'completed',
            })
        else:
            # 标记当前步骤
            open_steps = {
                'pending': '待确认',
                'confirmed': '待研判/发布',
                'analyzing': '研判中',
                'published': '已发布待处置',
                'processing': '处置中',
            }
            if obj.status in open_steps and not any(e.get('status') == 'current' for e in events):
                events.append({
                    'time': obj.updated_at,
                    'event': open_steps[obj.status],
                    'actor': '',
                    'status': 'current',
                })
        return events


class WarningRecordListSerializer(serializers.ModelSerializer):
    """预警列表"""
    hazard_name = serializers.CharField(source='hazard_point.name', read_only=True)
    hazard_code = serializers.CharField(source='hazard_point.code', read_only=True)
    level_display = serializers.CharField(source='get_level_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = WarningRecord
        fields = [
            'id', 'code', 'hazard_point', 'hazard_name', 'hazard_code',
            'level', 'level_display', 'status', 'status_display',
            'trigger_type', 'confidence', 'call_status',
            'created_at', 'confirm_time', 'publish_time', 'close_time', 'updated_at',
        ]


class WarningConfirmSerializer(serializers.Serializer):
    confirm_user = serializers.CharField(max_length=50, required=False, allow_blank=True)
    note = serializers.CharField(required=False, allow_blank=True)


class WarningPublishSerializer(serializers.Serializer):
    publish_user = serializers.CharField(max_length=50, required=False, allow_blank=True)
    note = serializers.CharField(required=False, allow_blank=True)


class WarningCloseSerializer(serializers.Serializer):
    close_reason = serializers.CharField(max_length=200)


class WarningCallSerializer(serializers.Serializer):
    caller = serializers.CharField(max_length=50, required=False, allow_blank=True)
    targets = serializers.ListField(
        child=serializers.CharField(), required=False, allow_empty=True
    )
    channels = serializers.ListField(
        child=serializers.ChoiceField(choices=['sms', 'voice']),
        required=False,
        allow_empty=True,
    )


class WarningAnalyzeSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True)
    conclusion = serializers.CharField(required=False, allow_blank=True)


class WarningModelSerializer(serializers.ModelSerializer):
    """预警模型详情/写入"""
    model_type_display = serializers.CharField(source='get_model_type_display', read_only=True)
    threshold_summary = serializers.SerializerMethodField()
    accuracy = serializers.SerializerMethodField()
    is_primary = serializers.SerializerMethodField()

    class Meta:
        model = WarningModel
        fields = [
            'id', 'code', 'name', 'model_type', 'model_type_display',
            'description', 'params',
            'yellow_threshold', 'orange_threshold', 'red_threshold',
            'threshold_summary', 'accuracy', 'is_primary',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'code': {'required': False, 'allow_blank': True},
            'name': {'required': True},
            'model_type': {'required': True},
            'params': {'required': False},
        }

    def get_threshold_summary(self, obj):
        summary = (
            f"黄{obj.yellow_threshold}/橙{obj.orange_threshold}/红{obj.red_threshold}"
        )
        params = obj.params or {}
        typed = [
            k for k, v in params.items()
            if k not in ('accuracy', 'thresholds', 'weights', 'window_hours',
                         'accel_yellow', 'accel_orange', 'accel_red')
            and isinstance(v, dict)
        ]
        if typed:
            summary += f" | 专用:{','.join(typed)}"
        return summary

    def get_accuracy(self, obj):
        params = obj.params or {}
        if params.get('accuracy') is not None:
            try:
                return float(params['accuracy'])
            except (TypeError, ValueError):
                pass
        # 粗略：近 30 天同类型触发置信度均值
        from datetime import timedelta
        from django.utils import timezone
        from django.db.models import Avg
        from .models import WarningRecord

        since = timezone.now() - timedelta(days=30)
        avg = (
            WarningRecord.objects.filter(created_at__gte=since)
            .aggregate(v=Avg('confidence'))
            .get('v')
        )
        return round(float(avg), 1) if avg is not None else None

    def get_is_primary(self, obj):
        """
        引擎回退主模型（启用 threshold 中最新一条）。
        若另有带 data_type 专用 params 的启用模型，研判该类型时会优先专用模型。
        """
        if not obj.is_active or obj.model_type != WarningModel.ModelType.THRESHOLD:
            return False
        primary = (
            WarningModel.objects.filter(
                is_active=True, model_type=WarningModel.ModelType.THRESHOLD
            )
            .order_by('-updated_at')
            .values_list('id', flat=True)
            .first()
        )
        return primary == obj.id

    def validate_code(self, value):
        value = (value or '').strip().upper()
        if not value:
            return value
        qs = WarningModel.objects.filter(code=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('模型编号已存在')
        return value

    def validate(self, attrs):
        name = attrs.get('name', getattr(self.instance, 'name', ''))
        if not (name or '').strip():
            raise serializers.ValidationError({'name': '模型名称不能为空'})

        yellow = attrs.get(
            'yellow_threshold',
            getattr(self.instance, 'yellow_threshold', 0) if self.instance else 0,
        )
        orange = attrs.get(
            'orange_threshold',
            getattr(self.instance, 'orange_threshold', 0) if self.instance else 0,
        )
        red = attrs.get(
            'red_threshold',
            getattr(self.instance, 'red_threshold', 0) if self.instance else 0,
        )
        try:
            y, o, r = float(yellow), float(orange), float(red)
        except (TypeError, ValueError):
            raise serializers.ValidationError('阈值必须为数字')
        if not (0 <= y <= o <= r):
            raise serializers.ValidationError(
                '阈值须满足：0 ≤ 黄色 ≤ 橙色 ≤ 红色'
            )

        params = attrs.get('params', getattr(self.instance, 'params', None) if self.instance else {})
        if params is None:
            params = {}
        if not isinstance(params, dict):
            raise serializers.ValidationError({'params': '参数须为 JSON 对象'})
        # 校验分类型阈值嵌套
        for key, conf in params.items():
            if key in ('accuracy', 'unit', 'note'):
                continue
            if isinstance(conf, dict):
                vals = []
                for level in ('yellow', 'orange', 'red'):
                    if level in conf and conf[level] is not None:
                        try:
                            vals.append(float(conf[level]))
                        except (TypeError, ValueError):
                            raise serializers.ValidationError(
                                {f'params.{key}.{level}': '须为数字'}
                            )
                if vals and sorted(vals) != vals:
                    raise serializers.ValidationError(
                        {f'params.{key}': '黄/橙/红阈值须递增'}
                    )
        attrs['params'] = params
        return attrs

    def create(self, validated_data):
        code = (validated_data.get('code') or '').strip()
        if not code:
            validated_data['code'] = self._next_code(
                validated_data.get('model_type', 'threshold')
            )
        return super().create(validated_data)

    @staticmethod
    def _next_code(model_type: str = 'threshold') -> str:
        prefix_map = {
            'threshold': 'THRESH',
            'trend': 'TREND',
            'ml': 'ML',
            'fusion': 'FUSION',
        }
        prefix = prefix_map.get(model_type, 'MODEL')
        existing = (
            WarningModel.objects.filter(code__startswith=f'{prefix}-')
            .order_by('-code')
            .values_list('code', flat=True)
        )
        max_n = 0
        for code in existing:
            suffix = code.split('-')[-1]
            if suffix.isdigit():
                max_n = max(max_n, int(suffix))
        # 兼容历史 THRESH-DEFAULT
        if WarningModel.objects.filter(code__startswith=prefix).exists() and max_n == 0:
            max_n = WarningModel.objects.filter(code__startswith=prefix).count()
        return f'{prefix}-{max_n + 1:03d}'


class WarningModelListSerializer(serializers.ModelSerializer):
    model_type_display = serializers.CharField(source='get_model_type_display', read_only=True)
    threshold_summary = serializers.SerializerMethodField()
    accuracy = serializers.SerializerMethodField()
    is_primary = serializers.SerializerMethodField()

    class Meta:
        model = WarningModel
        fields = [
            'id', 'code', 'name', 'model_type', 'model_type_display',
            'description', 'yellow_threshold', 'orange_threshold', 'red_threshold',
            'threshold_summary', 'accuracy', 'is_primary', 'is_active',
            'params', 'created_at', 'updated_at',
        ]

    def get_threshold_summary(self, obj):
        return WarningModelSerializer().get_threshold_summary(obj)

    def get_accuracy(self, obj):
        return WarningModelSerializer().get_accuracy(obj)

    def get_is_primary(self, obj):
        return WarningModelSerializer().get_is_primary(obj)


class WarningModelTestSerializer(serializers.Serializer):
    data_type = serializers.ChoiceField(
        choices=['force', 'rainfall', 'displacement', 'stress', 'strain', 'temperature'],
        default='force',
    )
    value = serializers.FloatField()
