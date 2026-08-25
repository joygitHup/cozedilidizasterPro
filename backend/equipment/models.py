"""材料库存与装备运维"""
from django.db import models


class MaterialStock(models.Model):
    """材料库存"""

    class Status(models.TextChoices):
        ADEQUATE = 'adequate', '充足'
        LOW = 'low', '偏低'
        SHORT = 'short', '不足'

    code = models.CharField('编号', max_length=50, unique=True)
    name = models.CharField('材料名称', max_length=100)
    spec = models.CharField('规格', max_length=100, blank=True)
    stock = models.DecimalField('库存', max_digits=12, decimal_places=2, default=0)
    unit = models.CharField('单位', max_length=20, default='件')
    location = models.CharField('存放位置', max_length=100, blank=True)
    min_stock = models.DecimalField('最低库存', max_digits=12, decimal_places=2, default=0)
    remark = models.CharField('备注', max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'equipment_material'
        verbose_name = '材料库存'
        verbose_name_plural = verbose_name
        ordering = ['code']

    def __str__(self):
        return f'{self.code} {self.name}'

    @property
    def status(self) -> str:
        stock = float(self.stock or 0)
        min_stock = float(self.min_stock or 0)
        if stock <= 0 or (min_stock > 0 and stock < min_stock * 0.5):
            return self.Status.SHORT
        if min_stock > 0 and stock < min_stock:
            return self.Status.LOW
        return self.Status.ADEQUATE


class EquipmentAsset(models.Model):
    """装备台账与运维"""

    class Status(models.TextChoices):
        NORMAL = 'normal', '正常'
        MAINTAIN = 'maintain', '待保养'
        FAULT = 'fault', '故障'
        RETIRED = 'retired', '报废'

    code = models.CharField('编号', max_length=50, unique=True)
    name = models.CharField('装备名称', max_length=100)
    model = models.CharField('型号', max_length=100, blank=True)
    location = models.CharField('存放/使用位置', max_length=100, blank=True)
    last_maint = models.DateField('上次保养', null=True, blank=True)
    next_maint = models.DateField('下次保养', null=True, blank=True)
    status = models.CharField(
        '状态', max_length=20, choices=Status.choices, default=Status.NORMAL
    )
    keeper = models.CharField('保管人', max_length=50, blank=True)
    remark = models.CharField('备注', max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'equipment_asset'
        verbose_name = '装备运维'
        verbose_name_plural = verbose_name
        ordering = ['code']

    def __str__(self):
        return f'{self.code} {self.name}'
