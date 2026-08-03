"""用户模型"""
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """自定义用户模型"""
    
    class Role(models.TextChoices):
        ADMIN = 'admin', '系统管理员'
        LEADER = 'leader', '值班领导'
        OPERATOR = 'operator', '值班员'
        GRID_WORKER = 'grid_worker', '网格员'
        VIEWER = 'viewer', '查看者'
    
    phone = models.CharField('手机号', max_length=20, blank=True)
    role = models.CharField('角色', max_length=20, choices=Role.choices, default=Role.VIEWER)
    department = models.CharField('部门', max_length=100, blank=True)
    village = models.CharField('负责村', max_length=50, blank=True)
    avatar = models.URLField('头像', blank=True)
    
    class Meta:
        db_table = 'users'
        verbose_name = '用户'
        verbose_name_plural = verbose_name
    
    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.get_role_display()})"
