from django.contrib import admin

from .models import EcologyProject, EffectAssessment, ProgressLog


@admin.register(EcologyProject)
class EcologyProjectAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'project_type', 'status', 'progress', 'budget', 'manager')
    list_filter = ('status', 'project_type')
    search_fields = ('code', 'name', 'location')


@admin.register(ProgressLog)
class ProgressLogAdmin(admin.ModelAdmin):
    list_display = ('project', 'progress', 'done_days', 'milestone', 'reporter', 'report_date')
    list_filter = ('report_date',)


@admin.register(EffectAssessment)
class EffectAssessmentAdmin(admin.ModelAdmin):
    list_display = ('code', 'project', 'factor', 'effect', 'assessor', 'assess_date')
    list_filter = ('effect',)
    search_fields = ('code', 'factor', 'project__name')
