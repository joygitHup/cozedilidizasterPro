"""
现场部署前清库：清空业务/演示数据，仅保留系统默认。

保留：
- 管理员账号 admin（密码可用 --admin-password 指定，默认 admin123，部署后务必修改）
- SystemConfig 单例（恢复出厂默认值）
- 一条默认阈值预警模型模板（THRESH-DEFAULT）

用法：
  python manage.py reset_for_deploy --yes
  python manage.py reset_for_deploy --yes --admin-password 'YourStrongPass'
"""
from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction


class Command(BaseCommand):
    help = '清空业务数据，仅保留系统默认（现场部署用）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--yes',
            action='store_true',
            help='确认执行（必填，防止误操作）',
        )
        parser.add_argument(
            '--admin-password',
            default='admin123',
            help='重置后的 admin 密码（默认 admin123）',
        )
        parser.add_argument(
            '--keep-regions',
            action='store_true',
            help='保留行政区划 Region 数据',
        )

    def handle(self, *args, **options):
        if not options['yes']:
            raise CommandError('请加 --yes 确认执行。此操作不可恢复。')

        pwd = options['admin_password']
        keep_regions = options['keep_regions']

        self.stdout.write(self.style.WARNING('开始清空业务数据…'))

        with transaction.atomic():
            counts = self._purge(keep_regions=keep_regions)
            self._seed_defaults(admin_password=pwd)

        sidecar = self._purge_sidecars()

        self.stdout.write(self.style.SUCCESS('清库完成，已写入系统默认。'))
        for name, n in counts:
            self.stdout.write(f'  - {name}: 删除 {n}')
        for name, n in sidecar:
            self.stdout.write(f'  - {name}: {n}')
        self.stdout.write('')
        self.stdout.write(self.style.WARNING(
            f'登录账号: admin / {pwd}  （请在客户现场立即修改密码）'
        ))

    def _purge(self, *, keep_regions: bool) -> list[tuple[str, int]]:
        from ecology.models import EcologyProject, EffectAssessment, ProgressLog
        from emergency.models import EmergencyPlan, EmergencySupply, EvacuationTask
        from equipment.models import EquipmentAsset, MaterialStock
        from geology.models import CrossSection, GeologySite
        from hazard.models import HazardPoint, InspectionTask, Region, RiskSlope
        from monitoring.models import MonitorDailyAgg, MonitorData, MonitoringDevice, MqttIngestLog
        from syshub.models import Notification, SystemConfig
        from users.models import ApiAuditLog
        from warning.models import WarningModel, WarningRecord

        User = get_user_model()
        deleted: list[tuple[str, int]] = []

        def wipe(label: str, qs):
            n, _ = qs.delete()
            # qs.delete() returns (total_objects, per_type); for cascade n is total
            deleted.append((label, n))

        # 监测时序 / 日志
        wipe('MonitorData', MonitorData.objects.all())
        wipe('MonitorDailyAgg', MonitorDailyAgg.objects.all())
        wipe('MqttIngestLog', MqttIngestLog.objects.all())
        wipe('MonitoringDevice', MonitoringDevice.objects.all())

        # 预警 / 应急
        wipe('WarningRecord', WarningRecord.objects.all())
        wipe('EvacuationTask', EvacuationTask.objects.all())
        wipe('EmergencyPlan', EmergencyPlan.objects.all())
        wipe('EmergencySupply', EmergencySupply.objects.all())

        # 隐患 / 巡查
        wipe('InspectionTask', InspectionTask.objects.all())
        wipe('RiskSlope', RiskSlope.objects.all())
        wipe('HazardPoint', HazardPoint.objects.all())
        if not keep_regions:
            wipe('Region', Region.objects.all())

        # 生态 / 装备 / 地质
        wipe('ProgressLog', ProgressLog.objects.all())
        wipe('EffectAssessment', EffectAssessment.objects.all())
        wipe('EcologyProject', EcologyProject.objects.all())
        wipe('MaterialStock', MaterialStock.objects.all())
        wipe('EquipmentAsset', EquipmentAsset.objects.all())
        wipe('CrossSection', CrossSection.objects.all())
        wipe('GeologySite', GeologySite.objects.all())

        # 平台
        wipe('Notification', Notification.objects.all())
        wipe('ApiAuditLog', ApiAuditLog.objects.all())
        wipe('WarningModel', WarningModel.objects.all())

        # 非 admin 用户
        wipe('User(non-admin)', User.objects.exclude(username='admin'))

        # 会话 / JWT 黑名单（若存在）
        self._clear_optional_auth()

        # 重置系统配置：删后重建
        SystemConfig.objects.all().delete()
        deleted.append(('SystemConfig(reset)', 1))

        # SQLite 可顺带 vacuum（在事务外更好，这里跳过）
        return deleted

    def _clear_optional_auth(self):
        try:
            from django.contrib.sessions.models import Session

            Session.objects.all().delete()
        except Exception:  # noqa: BLE001
            pass
        try:
            from rest_framework_simplejwt.token_blacklist.models import (
                BlacklistedToken,
                OutstandingToken,
            )

            BlacklistedToken.objects.all().delete()
            OutstandingToken.objects.all().delete()
        except Exception:  # noqa: BLE001
            pass

    def _purge_sidecars(self) -> list[tuple[str, int]]:
        """清空非 DB 演示配置（视频通道等）。"""
        from pathlib import Path

        root = Path(__file__).resolve().parents[3]  # backend/
        repo = root.parent
        cameras = repo / 'services' / 'video' / 'cameras.yaml'
        empty = (
            '# 视频通道配置（现场按实际摄像头填写）\n'
            '# 推流示例:\n'
            '#   ffmpeg ... -f rtsp -rtsp_transport tcp rtsp://127.0.0.1:8554/cam1\n'
            '\n'
            'cameras: []\n'
        )
        result: list[tuple[str, int]] = []
        if cameras.exists():
            try:
                prev = cameras.read_text(encoding='utf-8')
                had = 0
                try:
                    import yaml

                    had = len((yaml.safe_load(prev) or {}).get('cameras') or [])
                except Exception:  # noqa: BLE001
                    had = 1 if 'id:' in prev else 0
                cameras.write_text(empty, encoding='utf-8')
                result.append(('VideoCameras(yaml)', had))
            except OSError as exc:
                self.stdout.write(self.style.WARNING(f'无法清空视频配置: {exc}'))
        return result

    def _seed_defaults(self, *, admin_password: str):
        from syshub.models import SystemConfig
        from warning.models import WarningModel

        User = get_user_model()
        admin, created = User.objects.get_or_create(
            username='admin',
            defaults={
                'role': 'admin',
                'department': '系统管理部',
                'is_staff': True,
                'is_superuser': True,
                'is_active': True,
            },
        )
        admin.role = 'admin'
        admin.is_staff = True
        admin.is_superuser = True
        admin.is_active = True
        admin.department = admin.department or '系统管理部'
        admin.set_password(admin_password)
        admin.save()

        cfg = SystemConfig.get_solo()
        # 恢复出厂字段
        cfg.system_name = '边坡地质灾害智能预防管控平台'
        cfg.force_threshold = '85 MPa'
        cfg.call_timeout_sec = 120
        cfg.notify_sms = True
        cfg.notify_call = True
        cfg.notify_app = True
        cfg.notify_email = False
        cfg.weather_text = '晴'
        cfg.weather_temp_c = 25
        cfg.weather_icon = 'sunny'
        cfg.extra = {}
        cfg.save()

        WarningModel.objects.get_or_create(
            code='THRESH-DEFAULT',
            defaults={
                'name': '默认阈值模型',
                'model_type': 'threshold',
                'description': '系统默认阈值模板，可按现场传感器调整后启用',
                'yellow_threshold': Decimal('50'),
                'orange_threshold': Decimal('70'),
                'red_threshold': Decimal('85'),
                'is_active': True,
                'params': {
                    'force': {'yellow': 50, 'orange': 70, 'red': 85, 'change_rate_red': 30},
                    'rainfall': {'yellow': 30, 'orange': 50, 'red': 80},
                    'displacement': {'yellow': 5, 'orange': 10, 'red': 20},
                    'stress': {'yellow': 40, 'orange': 60, 'red': 80},
                    'strain': {'yellow': 200, 'orange': 400, 'red': 600},
                    'temperature': {'yellow': 40, 'orange': 50, 'red': 60},
                },
            },
        )

        # 清理 django 缓存中的限流等 key（尽力而为）
        try:
            from django.core.cache import cache

            cache.clear()
        except Exception:  # noqa: BLE001
            pass

        _ = created
        _ = connection  # keep import used for future vacuum hooks
