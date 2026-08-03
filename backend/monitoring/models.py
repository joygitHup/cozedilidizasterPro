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
    
    # 位置
    longitude = models.DecimalField('经度', max_digits=12, decimal_places=8)
    latitude = models.DecimalField('纬度', max_digits=12, decimal_places=8)
    address = models.CharField('安装位置', max_length=200, blank=True)
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
        ]
        ordering = ['-record_time']
    
    def __str__(self):
        return f"{self.device.code} - {self.data_type}: {self.value}{self.unit}"
