"""用户模型"""
from django.contrib.auth.models import AbstractUser
from django.conf import settings
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


class ApiAuditLog(models.Model):
    """API 网关审计日志（写操作 / 失败响应）"""

    request_id = models.CharField('请求ID', max_length=64, blank=True, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='api_audit_logs',
        verbose_name='用户',
    )
    username = models.CharField('用户名', max_length=150, blank=True, db_index=True)
    ip = models.CharField('IP', max_length=64, blank=True, db_index=True)
    method = models.CharField('方法', max_length=10, db_index=True)
    path = models.CharField('路径', max_length=300, db_index=True)
    query = models.CharField('查询串', max_length=300, blank=True)
    status_code = models.PositiveSmallIntegerField('状态码', db_index=True)
    duration_ms = models.PositiveIntegerField('耗时ms', default=0)
    user_agent = models.CharField('UA', max_length=300, blank=True)
    created_at = models.DateTimeField('时间', auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'api_audit_log'
        verbose_name = 'API审计日志'
        verbose_name_plural = verbose_name
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at', 'path']),
            models.Index(fields=['username', '-created_at']),
        ]

    def __str__(self):
        return f'{self.method} {self.path} {self.status_code}'
