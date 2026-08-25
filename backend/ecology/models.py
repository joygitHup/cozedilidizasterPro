"""生态治理工程模型：工程设计 → 治理进度 → 效果评估"""
from django.db import models


class EcologyProject(models.Model):
    """治理工程（工程设计主台账）"""

    class ProjectType(models.TextChoices):
        ANCHOR = 'anchor', '锚索加固'
        DRAINAGE = 'drainage', '排水工程'
        VEGETATION = 'vegetation', '生态恢复'
        RETAINING = 'retaining', '挡土墙'
        OTHER = 'other', '其他'

    class Status(models.TextChoices):
        DESIGNING = 'designing', '设计中'
        APPROVED = 'approved', '已批复'
        CONSTRUCTION = 'construction', '施工中'
        COMPLETED = 'completed', '已完工'
        ARCHIVED = 'archived', '已归档'

    code = models.CharField('工程编号', max_length=50, unique=True)
    name = models.CharField('工程名称', max_length=200)
    project_type = models.CharField(
        '工程类型', max_length=20, choices=ProjectType.choices, default=ProjectType.OTHER
    )
    status = models.CharField(
        '状态', max_length=20, choices=Status.choices, default=Status.DESIGNING
    )

    hazard_point = models.ForeignKey(
        'hazard.HazardPoint',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ecology_projects',
        verbose_name='关联隐患点',
    )
    location = models.CharField('工程位置', max_length=200, blank=True)
    description = models.TextField('设计说明', blank=True)

    budget = models.DecimalField('预算(万元)', max_digits=12, decimal_places=2, default=0)
    progress = models.IntegerField('进度%', default=0)
    planned_days = models.IntegerField('计划工期(天)', default=0)
    done_days = models.IntegerField('已完成工期(天)', default=0)
    current_milestone = models.CharField('当前里程碑', max_length=200, blank=True)
    milestones = models.JSONField('里程碑节点', default=list, blank=True)

    designer = models.CharField('设计单位/人', max_length=100, blank=True)
    contractor = models.CharField('施工单位', max_length=100, blank=True)
    manager = models.CharField('项目负责人', max_length=50, blank=True)
    manager_phone = models.CharField('联系电话', max_length=20, blank=True)

    design_date = models.DateField('设计完成日', null=True, blank=True)
    approve_date = models.DateField('批复日期', null=True, blank=True)
    start_date = models.DateField('开工日期', null=True, blank=True)
    end_date = models.DateField('计划完工日', null=True, blank=True)
    actual_end_date = models.DateField('实际完工日', null=True, blank=True)

    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 'ecology_project'
        verbose_name = '治理工程'
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['project_type']),
            models.Index(fields=['-created_at']),
        ]
        ordering = ['-updated_at', '-id']

    def __str__(self):
        return f'{self.code} - {self.name}'

    def sync_progress_status(self):
        """按进度自动校正施工状态"""
        if self.status == self.Status.ARCHIVED:
            return
        if self.progress >= 100:
            self.progress = 100
            if self.status == self.Status.CONSTRUCTION:
                self.status = self.Status.COMPLETED
        elif self.progress > 0 and self.status in (
            self.Status.DESIGNING,
            self.Status.APPROVED,
        ):
            self.status = self.Status.CONSTRUCTION


class ProgressLog(models.Model):
    """治理进度填报记录"""

    project = models.ForeignKey(
        EcologyProject,
        on_delete=models.CASCADE,
        related_name='progress_logs',
        verbose_name='关联工程',
    )
    progress = models.IntegerField('填报进度%')
    done_days = models.IntegerField('累计完成天数', default=0)
    milestone = models.CharField('里程碑说明', max_length=200, blank=True)
    note = models.TextField('进度说明', blank=True)
    reporter = models.CharField('填报人', max_length=50, blank=True)
    report_date = models.DateField('填报日期', null=True, blank=True)

    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 'ecology_progress_log'
        verbose_name = '治理进度'
        verbose_name_plural = verbose_name
        ordering = ['-report_date', '-id']
        indexes = [
            models.Index(fields=['project', '-report_date']),
        ]

    def __str__(self):
        return f'{self.project.code} @ {self.progress}%'


class EffectAssessment(models.Model):
    """效果评估"""

    class Effect(models.TextChoices):
        SIGNIFICANT = 'significant', '显著提升'
        QUALIFIED = 'qualified', '达标'
        MONITORING = 'monitoring', '监测中'
        FAILED = 'failed', '未达标'

    code = models.CharField('评估编号', max_length=50, unique=True)
    project = models.ForeignKey(
        EcologyProject,
        on_delete=models.CASCADE,
        related_name='assessments',
        verbose_name='关联工程',
    )
    factor = models.CharField('评估因子', max_length=100)
    before_value = models.CharField('治理前', max_length=50, blank=True, default='-')
    after_value = models.CharField('治理后', max_length=50, blank=True, default='-')
    unit = models.CharField('单位', max_length=20, blank=True)
    effect = models.CharField(
        '效果结论', max_length=20, choices=Effect.choices, default=Effect.MONITORING
    )
    conclusion = models.TextField('评估说明', blank=True)
    assessor = models.CharField('评估人', max_length=50, blank=True)
    assess_date = models.DateField('评估日期', null=True, blank=True)

    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 'ecology_assessment'
        verbose_name = '效果评估'
        verbose_name_plural = verbose_name
        ordering = ['-assess_date', '-id']
        indexes = [
            models.Index(fields=['effect']),
            models.Index(fields=['project', '-assess_date']),
        ]

    def __str__(self):
        return f'{self.code} - {self.factor}'
