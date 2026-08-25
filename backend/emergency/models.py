"""应急响应处置模型"""
from django.db import models


class EmergencyPlan(models.Model):
    """应急预案"""
    
    class Level(models.TextChoices):
        LEVEL_1 = '1', '一级'
        LEVEL_2 = '2', '二级'
        LEVEL_3 = '3', '三级'
        LEVEL_4 = '4', '四级'
    
    class Status(models.TextChoices):
        DRAFT = 'draft', '草稿'
        ACTIVE = 'active', '生效'
        ARCHIVED = 'archived', '已归档'
    
    name = models.CharField('预案名称', max_length=200)
    code = models.CharField('预案编号', max_length=50, unique=True)
    level = models.CharField('响应等级', max_length=5, choices=Level.choices)
    status = models.CharField('状态', max_length=10, choices=Status.choices, default=Status.DRAFT)
    
    description = models.TextField('预案描述', blank=True)
    content = models.JSONField('预案内容', default=dict)
    
    # 适用范围
    applicable_scenarios = models.JSONField('适用场景', default=list, blank=True)
    
    # 负责人
    commander = models.CharField('指挥人', max_length=50, blank=True)
    commander_phone = models.CharField('联系电话', max_length=20, blank=True)
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    
    class Meta:
        db_table = 'emergency_plan'
        verbose_name = '应急预案'
        verbose_name_plural = verbose_name
    
    def __str__(self):
        return f"{self.code} - {self.name}"


class EvacuationTask(models.Model):
    """避险转移任务"""
    
    class Status(models.TextChoices):
        PENDING = 'pending', '待转移'
        ONGOING = 'ongoing', '进行中'
        COMPLETED = 'completed', '已完成'
        CANCELLED = 'cancelled', '已取消'
    
    code = models.CharField('任务编号', max_length=50, unique=True)
    warning = models.ForeignKey(
        'warning.WarningRecord',
        on_delete=models.CASCADE,
        related_name='evacuation_tasks',
        verbose_name='关联预警',
        null=True, blank=True
    )
    hazard_point = models.ForeignKey(
        'hazard.HazardPoint',
        on_delete=models.CASCADE,
        related_name='evacuation_tasks',
        verbose_name='关联隐患点'
    )
    status = models.CharField('状态', max_length=20, choices=Status.choices, default=Status.PENDING)
    
    # 转移信息
    total_people = models.IntegerField('需转移人数', default=0)
    transferred_people = models.IntegerField('已转移人数', default=0)
    
    # 安置点
    shelter_name = models.CharField('安置点名称', max_length=100, blank=True)
    shelter_address = models.CharField('安置点地址', max_length=200, blank=True)
    shelter_longitude = models.DecimalField(
        '安置点经度', max_digits=12, decimal_places=8, null=True, blank=True
    )
    shelter_latitude = models.DecimalField(
        '安置点纬度', max_digits=12, decimal_places=8, null=True, blank=True
    )
    
    # 路线：[[lng, lat], ...] GeoJSON LineString 坐标序
    route_path = models.JSONField('路线坐标', default=list, blank=True)
    route_distance = models.DecimalField('路线距离(km)', max_digits=10, decimal_places=2, default=0)
    estimated_time = models.IntegerField('预计时间(分钟)', default=0)
    route_provider = models.CharField(
        '路网来源',
        max_length=20,
        blank=True,
        default='',
        help_text='mapbox | osrm | interpolate',
    )
    
    # 职责
    commander = models.CharField('指挥人', max_length=50, blank=True)
    commander_phone = models.CharField('联系电话', max_length=20, blank=True)
    grid_worker = models.CharField('网格员', max_length=50, blank=True)
    grid_phone = models.CharField('网格员电话', max_length=20, blank=True)
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    
    class Meta:
        db_table = 'evacuation_task'
        verbose_name = '避险转移任务'
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['-created_at']),
        ]
    
    def __str__(self):
        return f"{self.code} - {self.hazard_point.name}"
    
    @property
    def completion_rate(self):
        if self.total_people == 0:
            return 0
        return round(self.transferred_people / self.total_people * 100, 1)


class EmergencySupply(models.Model):
    """应急物资"""
    
    class Category(models.TextChoices):
        FOOD = 'food', '食品'
        WATER = 'water', '饮用水'
        TENT = 'tent', '帐篷'
        MEDICAL = 'medical', '医疗用品'
        TOOL = 'tool', '工具设备'
        OTHER = 'other', '其他'
    
    name = models.CharField('物资名称', max_length=100)
    code = models.CharField('物资编号', max_length=50, unique=True)
    category = models.CharField('类别', max_length=20, choices=Category.choices)
    
    quantity = models.IntegerField('数量', default=0)
    unit = models.CharField('单位', max_length=20, default='件')
    
    storage_location = models.CharField('存放位置', max_length=200, blank=True)
    
    responsible_person = models.CharField('负责人', max_length=50, blank=True)
    contact_phone = models.CharField('联系电话', max_length=20, blank=True)
    
    last_check_date = models.DateField('最后检查日期', null=True, blank=True)
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    
    class Meta:
        db_table = 'emergency_supply'
        verbose_name = '应急物资'
        verbose_name_plural = verbose_name
    
    def __str__(self):
        return f"{self.code} - {self.name}"
