"""修改 admin 密码（现场部署后立即执行）"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = '设置管理员 admin 的登录密码'

    def add_arguments(self, parser):
        parser.add_argument('--password', required=True, help='新密码')
        parser.add_argument(
            '--username',
            default='admin',
            help='管理员用户名（默认 admin）',
        )

    def handle(self, *args, **options):
        pwd = options['password']
        if len(pwd) < 8:
            raise CommandError('密码至少 8 位')
        User = get_user_model()
        try:
            user = User.objects.get(username=options['username'])
        except User.DoesNotExist as exc:
            raise CommandError(f"用户不存在: {options['username']}") from exc
        user.set_password(pwd)
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        if hasattr(user, 'role'):
            user.role = 'admin'
        user.save()
        self.stdout.write(self.style.SUCCESS(f"已更新 {user.username} 密码"))
