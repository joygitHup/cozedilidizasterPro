"""隐患台账管理模型"""
from django.db import models
from django.utils import timezone


class Region(models.Model):
    """行政区划：市 → 区 →（县可选）→ 村；区下可直接挂村"""

    class Level(models.TextChoices):
        CITY = 'city', '市'
        DISTRICT = 'district', '区'
        COUNTY = 'county', '县'
        VILLAGE = 'village', '村'

    # 上级允许的下级类型（区下可建县或村）
    LEVEL_CHILDREN = {
        Level.CITY: [Level.DISTRICT],
        Level.DISTRICT: [Level.COUNTY, Level.VILLAGE],
        Level.COUNTY: [Level.VILLAGE],
        Level.VILLAGE: [],
    }

    LEVEL_CHILD = {
        Level.CITY: Level.DISTRICT,
        Level.DISTRICT: Level.COUNTY,  # 默认展示用，实际可多选
        Level.COUNTY: Level.VILLAGE,
        Level.VILLAGE: None,
    }

    name = models.CharField('名称', max_length=50)
    level = models.CharField('层级', max_length=20, choices=Level.choices)
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
        verbose_name='上级区域',
    )
    sort_order = models.IntegerField('排序', default=0)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 'hazard_region'
        verbose_name = '行政区划'
        verbose_name_plural = verbose_name
        ordering = ['sort_order', 'id']
        indexes = [
            models.Index(fields=['level']),
            models.Index(fields=['parent', 'level']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['parent', 'name', 'level'],
                name='uniq_region_parent_name_level',
            ),
        ]

    def __str__(self):
        return f'{self.get_level_display()}:{self.name}'

    @property
    def child_level(self):
        kids = self.LEVEL_CHILDREN.get(self.level) or []
        return kids[0] if kids else None

    @property
    def child_levels(self):
        return list(self.LEVEL_CHILDREN.get(self.level) or [])


class HazardPoint(models.Model):
    """隐患点"""
    
    class Type(models.TextChoices):
        LANDSLIDE = 'landslide', '滑坡'
        COLLAPSE = 'collapse', '崩塌'
        DEBRIS_FLOW = 'debris_flow', '泥石流'
        OTHERS = 'others', '其他'
    
    class Level(models.TextChoices):
        RED = 'red', '红色'
        ORANGE = 'orange', '橙色'
        YELLOW = 'yellow', '黄色'
        BLUE = 'blue', '蓝色'
    
    class Status(models.TextChoices):
        STABLE = 'stable', '稳定'
        ATTENTION = 'attention', '关注'
        WARNING = 'warning', '预警'
        EMERGENCY = 'emergency', '紧急'
    
    code = models.CharField('编号', max_length=20, unique=True)
    name = models.CharField('名称', max_length=100)
    type = models.CharField('类型', max_length=20, choices=Type.choices)
    level = models.CharField('风险等级', max_length=10, choices=Level.choices)
    status = models.CharField('状态', max_length=20, choices=Status.choices, default=Status.STABLE)
    
    # 位置信息（市→区→县→村）
    longitude = models.DecimalField('经度', max_digits=12, decimal_places=8)
    latitude = models.DecimalField('纬度', max_digits=12, decimal_places=8)
    address = models.CharField('详细地址', max_length=200, blank=True)
    city = models.CharField('市', max_length=50, blank=True, default='')
    district = models.CharField('区', max_length=50, blank=True, default='')
    village = models.CharField('村', max_length=50, blank=True)
    town = models.CharField('镇(兼容)', max_length=50, blank=True)  # 兼容旧字段，写入时同步为区
    county = models.CharField('县', max_length=50, blank=True)
    
    # 规模
    volume = models.DecimalField('体积(m³)', max_digits=15, decimal_places=2, null=True, blank=True)
    length = models.DecimalField('长度(m)', max_digits=10, decimal_places=2, null=True, blank=True)
    width = models.DecimalField('宽度(m)', max_digits=10, decimal_places=2, null=True, blank=True)
    height = models.DecimalField('高度(m)', max_digits=10, decimal_places=2, null=True, blank=True)
    
    # 威胁对象
    threat_people = models.IntegerField('威胁人数', default=0)
    threat_houses = models.IntegerField('威胁房屋', default=0)
    threat_roads = models.DecimalField('威胁道路长度(m)', max_digits=10, decimal_places=2, default=0)
    threat_assets = models.DecimalField('威胁资产(万元)', max_digits=15, decimal_places=2, default=0)
    
    # 稳定性
    stability_coefficient = models.DecimalField('稳定性系数', max_digits=5, decimal_places=3, default=1.0)
    
    # 责任人
    responsible_person = models.CharField('责任人', max_length=50, blank=True)
    contact_phone = models.CharField('联系方式', max_length=20, blank=True)
    
    # 附件
    photos = models.JSONField('图片', default=list, blank=True)
    files = models.JSONField('附件', default=list, blank=True)
    
    # 时间
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    
    class Meta:
        db_table = 'hazard_point'
        verbose_name = '隐患点'
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=['level']),
            models.Index(fields=['status']),
            models.Index(fields=['-created_at']),
        ]
    
    def __str__(self):
        return f"{self.code} - {self.name}"


class RiskSlope(models.Model):
    """风险斜坡"""
    
    class RiskLevel(models.TextChoices):
        HIGH = 'high', '高风险'
        MEDIUM = 'medium', '中风险'
        LOW = 'low', '低风险'
    
    name = models.CharField('名称', max_length=100)
    code = models.CharField('编号', max_length=20, unique=True)
    hazard_point = models.ForeignKey(
        HazardPoint, 
        on_delete=models.CASCADE, 
        related_name='risk_slopes',
        verbose_name='关联隐患点',
        null=True, blank=True
    )
    risk_level = models.CharField('风险等级', max_length=10, choices=RiskLevel.choices)
    area = models.DecimalField('面积(km²)', max_digits=10, decimal_places=2)
    slope_angle = models.DecimalField('坡度(°)', max_digits=5, decimal_places=2, default=0)
    description = models.TextField('描述', blank=True)
    
    # 位置
    longitude = models.DecimalField('经度', max_digits=12, decimal_places=8)
    latitude = models.DecimalField('纬度', max_digits=12, decimal_places=8)
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    
    class Meta:
        db_table = 'risk_slope'
        verbose_name = '风险斜坡'
        verbose_name_plural = verbose_name
    
    def __str__(self):
        return f"{self.code} - {self.name}"


class InspectionTask(models.Model):
    """排查任务"""

    class Status(models.TextChoices):
        PENDING = 'pending', '待执行'
        IN_PROGRESS = 'in_progress', '进行中'
        COMPLETED = 'completed', '已完成'
        CANCELLED = 'cancelled', '已取消'

    class Priority(models.TextChoices):
        HIGH = 'high', '高'
        MEDIUM = 'medium', '中'
        LOW = 'low', '低'

    class TaskType(models.TextChoices):
        ROUTINE = 'routine', '日常巡查'
        SPECIAL = 'special', '专项排查'
        EMERGENCY = 'emergency', '应急排查'
        PERIODIC = 'periodic', '定期巡检'

    code = models.CharField('任务编号', max_length=30, unique=True, blank=True)
    title = models.CharField('任务标题', max_length=200)
    description = models.TextField('任务描述', blank=True)
    task_type = models.CharField(
        '任务类型', max_length=20, choices=TaskType.choices, default=TaskType.ROUTINE
    )
    hazard_point = models.ForeignKey(
        HazardPoint,
        on_delete=models.CASCADE,
        related_name='inspection_tasks',
        verbose_name='关联隐患点',
        null=True, blank=True
    )
    status = models.CharField('状态', max_length=20, choices=Status.choices, default=Status.PENDING)
    priority = models.CharField('优先级', max_length=10, choices=Priority.choices, default=Priority.MEDIUM)

    # 执行人 / 路线
    assigned_to = models.CharField('执行人', max_length=50, blank=True)
    assigned_phone = models.CharField('联系电话', max_length=20, blank=True)
    route_desc = models.CharField('排查路线', max_length=200, blank=True)
    checkpoint_count = models.IntegerField('检查点数', default=1)

    # 时间
    planned_date = models.DateField('计划日期', null=True, blank=True)
    started_at = models.DateTimeField('开始时间', null=True, blank=True)
    completed_at = models.DateTimeField('完成时间', null=True, blank=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    # 结果
    result = models.TextField('排查结果', blank=True)
    issue_count = models.IntegerField('发现问题数', default=0)
    duration_minutes = models.IntegerField('耗时(分钟)', default=0)
    photos = models.JSONField('现场照片', default=list, blank=True)

    class Meta:
        db_table = 'inspection_task'
        verbose_name = '排查任务'
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['-planned_date']),
            models.Index(fields=['task_type']),
        ]

    def __str__(self):
        return f"{self.code} - {self.title}" if self.code else self.title
