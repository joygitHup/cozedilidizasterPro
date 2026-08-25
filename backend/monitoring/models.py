"""监测感知网络模型"""
from django.db import models


class MonitoringDevice(models.Model):
    """监测设备"""
    
    class DeviceType(models.TextChoices):
        NPR_ANCHOR = 'npr_anchor', 'NPR锚索计'
        RAINFALL = 'rainfall', '雨量计'
        FIBER_OPTIC = 'fiber_optic', '光纤光栅'
        CAMERA = 'camera', '摄像头'
        GNSS = 'gnss', 'GNSS位移站'
        INCLINOMETER = 'inclinometer', '倾角仪'
        OTHERS = 'others', '其他'
    
    class Status(models.TextChoices):
        ONLINE = 'online', '在线'
        OFFLINE = 'offline', '离线'
        FAULT = 'fault', '故障'
    
    class Signal(models.TextChoices):
        STRONG = 'strong', '强'
        MEDIUM = 'medium', '中'
        WEAK = 'weak', '弱'
    
    name = models.CharField('设备名称', max_length=100)
    code = models.CharField('设备编号', max_length=50, unique=True)
    device_type = models.CharField('设备类型', max_length=20, choices=DeviceType.choices)
    status = models.CharField('状态', max_length=10, choices=Status.choices, default=Status.ONLINE)
    
    # 位置（安装位置：市→区→县→村 + 详细地址）
    longitude = models.DecimalField('经度', max_digits=12, decimal_places=8)
    latitude = models.DecimalField('纬度', max_digits=12, decimal_places=8)
    address = models.CharField('详细地址', max_length=200, blank=True)
    city = models.CharField('市', max_length=50, blank=True, default='')
    district = models.CharField('区', max_length=50, blank=True, default='')
    county = models.CharField('县', max_length=50, blank=True, default='')
    village = models.CharField('村', max_length=50, blank=True, default='')
    town = models.CharField('镇(兼容)', max_length=50, blank=True, default='')  # 兼容旧数据，同步为区
    hazard_point = models.ForeignKey(
        'hazard.HazardPoint',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='devices',
        verbose_name='关联隐患点'
    )
    
    # 规格
    install_date = models.DateField('安装日期', null=True, blank=True)
    range_value = models.CharField('量程', max_length=50, blank=True)
    accuracy = models.CharField('精度', max_length=50, blank=True)
    power_consumption = models.DecimalField('功耗(W)', max_digits=6, decimal_places=2, default=0)
    
    # 状态信息
    battery = models.IntegerField('电量(%)', default=100)
    signal = models.CharField('信号强度', max_length=10, choices=Signal.choices, default=Signal.STRONG)
    last_data_time = models.DateTimeField('最后数据时间', null=True, blank=True)
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    
    class Meta:
        db_table = 'monitoring_device'
        verbose_name = '监测设备'
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=['device_type']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"{self.code} - {self.name}"

    def location_parts(self):
        """返回非空行政区划路径（市→区→县→村）"""
        district = self.district or self.town
        parts = []
        for v in (self.city, district, self.county, self.village):
            v = (v or '').strip()
            if v:
                parts.append(v)
        return parts

    def compose_address(self):
        """由行政区划拼详细地址展示串"""
        parts = self.location_parts()
        detail = (self.address or '').strip()
        # address 可能已含完整路径，避免重复拼接
        joined = ''.join(parts)
        if detail and joined and detail.startswith(joined):
            return detail
        if parts and detail:
            return f'{joined}{detail}' if not detail.startswith(parts[-1]) else detail
        return detail or joined

    def sync_region_from_hazard(self, hazard=None):
        """从关联隐患点同步行政区划（字段为空时）"""
        hp = hazard or self.hazard_point
        if not hp:
            return False
        dirty = False
        mapping = (
            ('city', getattr(hp, 'city', '') or ''),
            ('district', getattr(hp, 'district', '') or getattr(hp, 'town', '') or ''),
            ('county', getattr(hp, 'county', '') or ''),
            ('village', getattr(hp, 'village', '') or ''),
            ('town', getattr(hp, 'town', '') or getattr(hp, 'district', '') or ''),
        )
        for field, value in mapping:
            if value and not (getattr(self, field, '') or '').strip():
                setattr(self, field, value)
                dirty = True
        if not (self.address or '').strip() and (hp.address or hp.name):
            self.address = hp.address or hp.name
            dirty = True
        return dirty


class MonitorData(models.Model):
    """监测数据"""
    
    class DataType(models.TextChoices):
        FORCE = 'force', '牛顿力'
        DISPLACEMENT = 'displacement', '位移'
        RAINFALL = 'rainfall', '降雨量'
        STRESS = 'stress', '应力'
        STRAIN = 'strain', '应变'
        TEMPERATURE = 'temperature', '温度'
    
    device = models.ForeignKey(
        MonitoringDevice,
        on_delete=models.CASCADE,
        related_name='data_records',
        verbose_name='设备'
    )
    data_type = models.CharField('数据类型', max_length=20, choices=DataType.choices)
    # 通道：GNSS 用 E/N/U/H；倾角仪用 X/Y；空=标量测点
    channel = models.CharField('通道', max_length=16, blank=True, default='', db_index=True)
    value = models.DecimalField('数值', max_digits=15, decimal_places=4)
    unit = models.CharField('单位', max_length=10, default='')
    record_time = models.DateTimeField('记录时间')
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    
    class Meta:
        db_table = 'monitor_data'
        verbose_name = '监测数据'
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=['device', '-record_time']),
            models.Index(fields=['data_type', '-record_time']),
            models.Index(fields=['device', 'data_type', 'channel', '-record_time']),
        ]
        ordering = ['-record_time']
    
    def __str__(self):
        ch = f'/{self.channel}' if self.channel else ''
        return f"{self.device.code} - {self.data_type}{ch}: {self.value}{self.unit}"


class MonitorDailyAgg(models.Model):
    """监测日聚合（Celery Beat 生成）"""

    device = models.ForeignKey(
        MonitoringDevice,
        on_delete=models.CASCADE,
        related_name='daily_aggs',
        verbose_name='设备',
    )
    data_type = models.CharField('数据类型', max_length=20, choices=MonitorData.DataType.choices)
    channel = models.CharField('通道', max_length=16, blank=True, default='')
    day = models.DateField('日期')
    count = models.IntegerField('样本数', default=0)
    min_value = models.DecimalField('最小', max_digits=15, decimal_places=4, null=True, blank=True)
    max_value = models.DecimalField('最大', max_digits=15, decimal_places=4, null=True, blank=True)
    avg_value = models.DecimalField('平均', max_digits=15, decimal_places=4, null=True, blank=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 'monitor_daily_agg'
        verbose_name = '监测日聚合'
        verbose_name_plural = verbose_name
        constraints = [
            models.UniqueConstraint(
                fields=['device', 'data_type', 'channel', 'day'],
                name='uniq_monitor_daily_agg',
            ),
        ]
        indexes = [
            models.Index(fields=['day', 'data_type']),
            models.Index(fields=['device', '-day']),
        ]

    def __str__(self):
        ch = f'/{self.channel}' if self.channel else ''
        return f'{self.device.code} {self.data_type}{ch} {self.day}'


class MqttIngestLog(models.Model):
    """MQTT/桥接接入审计（最近报文，便于联调）"""

    class Status(models.TextChoices):
        ACCEPTED = 'accepted', '已受理'
        PROCESSED = 'processed', '已处理'
        FAILED = 'failed', '失败'

    topic = models.CharField('主题', max_length=200, blank=True)
    device_code = models.CharField('设备编号', max_length=50, blank=True, db_index=True)
    payload = models.JSONField('报文', default=dict, blank=True)
    status = models.CharField(
        '状态', max_length=20, choices=Status.choices, default=Status.ACCEPTED
    )
    error = models.CharField('错误', max_length=300, blank=True)
    monitor_data_id = models.IntegerField('监测数据ID', null=True, blank=True)
    trace_id = models.CharField('TraceId', max_length=64, blank=True, db_index=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)

    class Meta:
        db_table = 'mqtt_ingest_log'
        verbose_name = 'MQTT接入日志'
        verbose_name_plural = verbose_name
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['trace_id', '-created_at']),
        ]
