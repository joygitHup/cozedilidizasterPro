"""生态治理序列化器"""
from rest_framework import serializers

from .models import EcologyProject, EffectAssessment, ProgressLog


class EcologyProjectSerializer(serializers.ModelSerializer):
    project_type_display = serializers.CharField(source='get_project_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    hazard_point_name = serializers.CharField(source='hazard_point.name', read_only=True, allow_null=True)
    hazard_point_code = serializers.CharField(source='hazard_point.code', read_only=True, allow_null=True)
    progress_log_count = serializers.SerializerMethodField()
    assessment_count = serializers.SerializerMethodField()
    budget_display = serializers.SerializerMethodField()

    class Meta:
        model = EcologyProject
        fields = [
            'id', 'code', 'name', 'project_type', 'project_type_display',
            'status', 'status_display',
            'hazard_point', 'hazard_point_name', 'hazard_point_code',
            'location', 'description',
            'budget', 'budget_display', 'progress', 'planned_days', 'done_days',
            'current_milestone', 'milestones',
            'designer', 'contractor', 'manager', 'manager_phone',
            'design_date', 'approve_date', 'start_date', 'end_date', 'actual_end_date',
            'progress_log_count', 'assessment_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'code': {'required': False, 'allow_blank': True},
            'name': {'required': True},
        }

    def get_progress_log_count(self, obj):
        return obj.progress_logs.count()

    def get_assessment_count(self, obj):
        return obj.assessments.count()

    def get_budget_display(self, obj):
        return f'¥{float(obj.budget):g}万'

    def validate_code(self, value):
        value = (value or '').strip().upper()
        if not value:
            return value
        qs = EcologyProject.objects.filter(code=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('工程编号已存在')
        return value

    def validate_progress(self, value):
        if value is None:
            return 0
        if value < 0 or value > 100:
            raise serializers.ValidationError('进度须在 0–100')
        return value

    def validate_milestones(self, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError('里程碑须为数组')
        return value

    def create(self, validated_data):
        if not (validated_data.get('code') or '').strip():
            validated_data['code'] = self._next_code()
        if not validated_data.get('milestones'):
            validated_data['milestones'] = [
                {'order': 1, 'title': '方案设计', 'status': 'done'},
                {'order': 2, 'title': '审查批复', 'status': 'pending'},
                {'order': 3, 'title': '开工建设', 'status': 'pending'},
                {'order': 4, 'title': '竣工验收', 'status': 'pending'},
            ]
        return super().create(validated_data)

    @staticmethod
    def _next_code() -> str:
        existing = (
            EcologyProject.objects.filter(code__startswith='GE')
            .order_by('-code')
            .values_list('code', flat=True)
        )
        max_n = 0
        for code in existing:
            suffix = code.replace('GE', '').lstrip('-')
            if suffix.isdigit():
                max_n = max(max_n, int(suffix))
        return f'GE{max_n + 1:03d}'


class EcologyProjectListSerializer(serializers.ModelSerializer):
    project_type_display = serializers.CharField(source='get_project_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    hazard_point_name = serializers.CharField(source='hazard_point.name', read_only=True, allow_null=True)
    budget_display = serializers.SerializerMethodField()
    assessment_count = serializers.SerializerMethodField()

    class Meta:
        model = EcologyProject
        fields = [
            'id', 'code', 'name', 'project_type', 'project_type_display',
            'status', 'status_display', 'hazard_point', 'hazard_point_name',
            'location', 'budget', 'budget_display', 'progress',
            'planned_days', 'done_days', 'current_milestone',
            'manager', 'assessment_count', 'updated_at', 'created_at',
        ]

    def get_budget_display(self, obj):
        return f'¥{float(obj.budget):g}万'

    def get_assessment_count(self, obj):
        return obj.assessments.count()


class ProgressLogSerializer(serializers.ModelSerializer):
    project_code = serializers.CharField(source='project.code', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)
    project_status = serializers.CharField(source='project.status', read_only=True)
    project_type = serializers.CharField(source='project.project_type', read_only=True)
    planned_days = serializers.IntegerField(source='project.planned_days', read_only=True)

    class Meta:
        model = ProgressLog
        fields = [
            'id', 'project', 'project_code', 'project_name', 'project_status', 'project_type',
            'planned_days', 'progress', 'done_days', 'milestone', 'note',
            'reporter', 'report_date', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_progress(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError('进度须在 0–100')
        return value

    def create(self, validated_data):
        from django.utils import timezone

        if not validated_data.get('report_date'):
            validated_data['report_date'] = timezone.localdate()
        log = super().create(validated_data)
        project = log.project
        project.progress = log.progress
        project.done_days = log.done_days or project.done_days
        if log.milestone:
            project.current_milestone = log.milestone
        project.sync_progress_status()
        project.save()
        return log


class EffectAssessmentSerializer(serializers.ModelSerializer):
    effect_display = serializers.CharField(source='get_effect_display', read_only=True)
    project_code = serializers.CharField(source='project.code', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)
    project_status = serializers.CharField(source='project.status', read_only=True)

    class Meta:
        model = EffectAssessment
        fields = [
            'id', 'code', 'project', 'project_code', 'project_name', 'project_status',
            'factor', 'before_value', 'after_value', 'unit',
            'effect', 'effect_display', 'conclusion', 'assessor', 'assess_date',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'code': {'required': False, 'allow_blank': True},
            'factor': {'required': True},
        }

    def validate_code(self, value):
        value = (value or '').strip().upper()
        if not value:
            return value
        qs = EffectAssessment.objects.filter(code=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('评估编号已存在')
        return value

    def validate(self, attrs):
        project = attrs.get('project') or getattr(self.instance, 'project', None)
        if project and project.status == EcologyProject.Status.DESIGNING:
            raise serializers.ValidationError(
                {'project': '设计中的工程不可评估，请先批复并开工'}
            )
        return attrs

    def create(self, validated_data):
        from django.utils import timezone

        if not (validated_data.get('code') or '').strip():
            validated_data['code'] = self._next_code()
        if not validated_data.get('assess_date'):
            validated_data['assess_date'] = timezone.localdate()
        return super().create(validated_data)

    @staticmethod
    def _next_code() -> str:
        existing = (
            EffectAssessment.objects.filter(code__startswith='EA')
            .order_by('-code')
            .values_list('code', flat=True)
        )
        max_n = 0
        for code in existing:
            suffix = code.replace('EA', '').lstrip('-')
            if suffix.isdigit():
                max_n = max(max_n, int(suffix))
        return f'EA{max_n + 1:03d}'
