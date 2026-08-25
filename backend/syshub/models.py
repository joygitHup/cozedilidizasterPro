"""系统配置、通知等平台级能力"""
from django.db import models


class SystemConfig(models.Model):
    """单例系统配置（pk=1）"""

    system_name = models.CharField('系统名称', max_length=100, default='边坡地质灾害智能预防管控平台')
    force_threshold = models.CharField('预警阈值(牛顿力展示)', max_length=50, default='85 MPa')
    call_timeout_sec = models.IntegerField('自动呼叫超时(秒)', default=120)
    notify_sms = models.BooleanField('短信通知', default=True)
    notify_call = models.BooleanField('电话呼叫', default=True)
    notify_app = models.BooleanField('APP推送', default=True)
    notify_email = models.BooleanField('邮件通知', default=False)
    weather_text = models.CharField('天气文案', max_length=50, default='晴')
    weather_temp_c = models.IntegerField('气温℃', default=25)
    weather_icon = models.CharField('天气图标', max_length=20, default='sunny')
    extra = models.JSONField('扩展配置', default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'syshub_system_config'
        verbose_name = '系统配置'
        verbose_name_plural = verbose_name

    def __str__(self):
        return self.system_name

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class Notification(models.Model):
    """站内通知（顶栏铃铛）"""

    class Level(models.TextChoices):
        INFO = 'info', '信息'
        WARNING = 'warning', '预警'
        DANGER = 'danger', '紧急'

    title = models.CharField('标题', max_length=200)
    body = models.TextField('内容', blank=True)
    level = models.CharField('级别', max_length=20, choices=Level.choices, default=Level.INFO)
    link = models.CharField('跳转路径', max_length=200, blank=True)
    is_read = models.BooleanField('已读', default=False)
    user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notifications',
        verbose_name='指定用户(空=全员)',
    )
    source = models.CharField('来源', max_length=50, blank=True, default='system')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'syshub_notification'
        verbose_name = '站内通知'
        verbose_name_plural = verbose_name
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['is_read', '-created_at']),
        ]

    def __str__(self):
        return self.title
