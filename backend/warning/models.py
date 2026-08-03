"""智能预警中心模型"""
from django.db import models


class WarningRecord(models.Model):
    """预警记录"""
    
    class Level(models.TextChoices):
        RED = 'red', '红色'
        ORANGE = 'orange', '橙色'
        YELLOW = 'yellow', '黄色'
        BLUE = 'blue', '蓝色'
    
    class Status(models.TextChoices):
        PENDING = 'pending', '待确认'
        CONFIRMED = 'confirmed', '已确认'
        ANALYZING = 'analyzing', '研判中'
        PUBLISHED = 'published', '已发布'
        PROCESSING = 'processing', '处置中'
        CLOSED = 'closed', '已闭环'
    
    code = models.CharField('预警编号', max_length=50, unique=True)
    hazard_point = models.ForeignKey(
        'hazard.HazardPoint',
        on_delete=models.CASCADE,
        related_name='warnings',
        verbose_name='隐患点'
    )
    level = models.CharField('预警等级', max_length=10, choices=Level.choices)
    trigger_type = models.CharField('触发类型', max_length=50, blank=True)
    trigger_value = models.JSONField('触发值', default=dict, blank=True)
    confidence = models.DecimalField('置信度', max_digits=5, decimal_places=2, default=0)
    status = models.CharField('状态', max_length=20, choices=Status.choices, default=Status.PENDING)
    
    # 叫应信息
    call_status = models.CharField('叫应状态', max_length=20, blank=True)
    call_detail = models.JSONField('叫应详情', default=dict, blank=True)
    
    # 处置流程时间线
    confirm_time = models.DateTimeField('确认时间', null=True, blank=True)
    confirm_user = models.CharField('确认人', max_length=50, blank=True)
    publish_time = models.DateTimeField('发布时间', null=True, blank=True)
    publish_user = models.CharField('发布人', max_length=50, blank=True)
    close_time = models.DateTimeField('闭环时间', null=True, blank=True)
    close_reason = models.CharField('闭环原因', max_length=200, blank=True)
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    
    class Meta:
        db_table = 'warning_record'
        verbose_name = '预警记录'
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=['status', 'level']),
            models.Index(fields=['hazard_point']),
            models.Index(fields=['-created_at']),
        ]
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.code} - {self.hazard_point.name} ({self.get_level_display()})"


class WarningModel(models.Model):
    """预警模型配置"""
    
    class ModelType(models.TextChoices):
        THRESHOLD = 'threshold', '阈值模型'
        TREND = 'trend', '趋势模型'
        ML = 'ml', '机器学习模型'
        FUSION = 'fusion', '融合模型'
    
    name = models.CharField('模型名称', max_length=100)
    code = models.CharField('模型编号', max_length=50, unique=True)
    model_type = models.CharField('模型类型', max_length=20, choices=ModelType.choices)
    description = models.TextField('描述', blank=True)
    
    # 参数配置
    params = models.JSONField('参数配置', default=dict)
    
    # 阈值配置
    yellow_threshold = models.DecimalField('黄色阈值', max_digits=10, decimal_places=2, default=0)
    orange_threshold = models.DecimalField('橙色阈值', max_digits=10, decimal_places=2, default=0)
    red_threshold = models.DecimalField('红色阈值', max_digits=10, decimal_places=2, default=0)
    
    is_active = models.BooleanField('是否启用', default=True)
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    
    class Meta:
        db_table = 'warning_model'
        verbose_name = '预警模型'
        verbose_name_plural = verbose_name
    
    def __str__(self):
        return f"{self.code} - {self.name}"
