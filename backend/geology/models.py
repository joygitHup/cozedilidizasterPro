"""地质剖面与站点三维场景库"""
from django.db import models


class CrossSection(models.Model):
    """地质剖面：用 profile_points 驱动前端 SVG 渲染"""

    code = models.CharField('剖面编号', max_length=50, unique=True)
    name = models.CharField('剖面名称', max_length=100)
    location = models.CharField('位置', max_length=100, blank=True)
    direction = models.CharField('走向', max_length=50, blank=True)
    length_m = models.DecimalField('长度(m)', max_digits=10, decimal_places=1, default=0)
    hazard_point = models.ForeignKey(
        'hazard.HazardPoint',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cross_sections',
        verbose_name='关联隐患点',
    )
    profile_points = models.JSONField('剖面点', default=list, blank=True)
    layers = models.JSONField(
        '地层说明',
        default=list,
        blank=True,
        help_text='[{key, label, color}]',
    )
    description = models.TextField('说明', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'geology_cross_section'
        verbose_name = '地质剖面'
        verbose_name_plural = verbose_name
        ordering = ['code']

    def __str__(self):
        return f'{self.code} {self.name}'


class GeologySite(models.Model):
    """站点级三维场景（绑定隐患点 + 3D Tiles / Ion / GLB）"""

    class Status(models.TextChoices):
        DRAFT = 'draft', '草稿'
        PUBLISHED = 'published', '已发布'
        ARCHIVED = 'archived', '归档'

    code = models.CharField('场景编号', max_length=50, unique=True)
    name = models.CharField('场景名称', max_length=100)
    hazard_point = models.ForeignKey(
        'hazard.HazardPoint',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='geology_sites',
        verbose_name='关联隐患点',
    )
    longitude = models.DecimalField('经度', max_digits=12, decimal_places=8, null=True, blank=True)
    latitude = models.DecimalField('纬度', max_digits=12, decimal_places=8, null=True, blank=True)
    height = models.IntegerField('相机高度(m)', default=2500)
    tileset_url = models.CharField('3D Tiles URL', max_length=500, blank=True)
    ion_asset_id = models.CharField('Cesium Ion Asset Id', max_length=50, blank=True)
    glb_url = models.CharField('GLB/GLTF URL', max_length=500, blank=True)
    cover_url = models.CharField('封面图', max_length=500, blank=True)
    status = models.CharField(
        '状态', max_length=20, choices=Status.choices, default=Status.PUBLISHED
    )
    description = models.TextField('说明', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'geology_site'
        verbose_name = '三维站点场景'
        verbose_name_plural = verbose_name
        ordering = ['-updated_at']

    def __str__(self):
        return f'{self.code} {self.name}'

    def sync_coords_from_hazard(self):
        hp = self.hazard_point
        if not hp:
            return False
        dirty = False
        if self.longitude is None and hp.longitude is not None:
            self.longitude = hp.longitude
            dirty = True
        if self.latitude is None and hp.latitude is not None:
            self.latitude = hp.latitude
            dirty = True
        return dirty
