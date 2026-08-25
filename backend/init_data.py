"""初始化示例数据"""
import os
import sys
import django

# 设置 Django 环境
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from hazard.models import HazardPoint, RiskSlope, InspectionTask
from monitoring.models import MonitoringDevice, MonitorData
from warning.models import WarningRecord, WarningModel
from emergency.models import EmergencyPlan, EvacuationTask, EmergencySupply
from decimal import Decimal
from django.utils import timezone
from datetime import timedelta

User = get_user_model()


def create_users():
    """创建示例用户"""
    users = [
        {
            'username': 'admin', 'password': 'admin123', 'role': 'admin',
            'department': '系统管理部', 'phone': '13800000001',
        },
        {
            'username': 'leader', 'password': 'leader123', 'role': 'leader',
            'department': '应急指挥中心', 'phone': '13900139001',
        },
        {
            'username': 'operator', 'password': 'operator123', 'role': 'operator',
            'department': '监测预警中心', 'phone': '13800138000',
        },
        {
            'username': 'zhangsan', 'password': 'zhangsan123', 'role': 'grid_worker',
            'village': '竹园村', 'department': '竹园村村委会', 'phone': '13800138001',
        },
        {
            'username': 'lisi', 'password': 'lisi123', 'role': 'grid_worker',
            'village': '石桥村', 'department': '石桥村村委会', 'phone': '13800138002',
        },
        {
            'username': 'viewer', 'password': 'viewer123', 'role': 'viewer',
            'department': '综合办公室', 'phone': '13700000001',
        },
    ]

    for user_data in users:
        username = user_data.pop('username')
        password = user_data.pop('password')
        user, created = User.objects.get_or_create(
            username=username,
            defaults={**user_data, 'is_staff': username == 'admin'}
        )
        if created:
            user.set_password(password)
            user.save()
            print(f'创建用户: {username}')
        else:
            # 补齐电话，便于一键叫应
            dirty = False
            if not user.phone and user_data.get('phone'):
                user.phone = user_data['phone']
                dirty = True
            if dirty:
                user.save(update_fields=['phone'])
            print(f'用户已存在: {username}')


def create_warning_models():
    """阈值 + 趋势 / ML / 融合模型种子"""
    models = [
        {
            'code': 'THRESH-NPR',
            'name': 'NPR 阈值主模型',
            'model_type': 'threshold',
            'description': '牛顿力/降雨/位移等阈值研判',
            'yellow_threshold': Decimal('50'),
            'orange_threshold': Decimal('70'),
            'red_threshold': Decimal('85'),
            'is_active': True,
            'params': {
                'force': {'yellow': 50, 'orange': 70, 'red': 85, 'change_rate_red': 30},
                'rainfall': {'yellow': 30, 'orange': 50, 'red': 80},
                'displacement': {'yellow': 5, 'orange': 10, 'red': 20},
            },
        },
        {
            'code': 'TREND-DISP',
            'name': '位移趋势斜率',
            'model_type': 'trend',
            'description': '滑动窗口斜率/整窗变化量超阈告警',
            'yellow_threshold': Decimal('5'),
            'orange_threshold': Decimal('10'),
            'red_threshold': Decimal('20'),
            'is_active': True,
            'params': {
                'window_hours': 6,
                'yellow': 5, 'orange': 10, 'red': 20,
                'displacement': {'yellow': 5, 'orange': 10, 'red': 20},
            },
        },
        {
            'code': 'ML-ZSCORE',
            'name': '监测异常 Z-Score',
            'model_type': 'ml',
            'description': '相对滑动均值的 z-score 异常检测',
            'yellow_threshold': Decimal('2'),
            'orange_threshold': Decimal('3'),
            'red_threshold': Decimal('4'),
            'is_active': True,
            'params': {
                'window_hours': 24,
                'z_yellow': 2, 'z_orange': 3, 'z_red': 4,
            },
        },
        {
            'code': 'FUSION-MAIN',
            'name': '阈值+趋势+ML 融合',
            'model_type': 'fusion',
            'description': '多引擎加权融合，取最高置信等级',
            'yellow_threshold': Decimal('50'),
            'orange_threshold': Decimal('70'),
            'red_threshold': Decimal('85'),
            'is_active': True,
            'params': {
                'weights': {'threshold': 0.4, 'trend': 0.3, 'ml': 0.3},
            },
        },
    ]
    for row in models:
        obj, created = WarningModel.objects.get_or_create(code=row['code'], defaults=row)
        if not created and not obj.is_active and row.get('is_active'):
            obj.is_active = True
            obj.save(update_fields=['is_active'])
        print(f'{"创建" if created else "模型已存在"}: {obj.code} ({obj.model_type})')


def create_hazard_points():
    """创建示例隐患点"""
    points = [
        {
            'code': 'HS001', 'name': '竹园坡', 'type': 'landslide',
            'level': 'red', 'status': 'warning',
            'longitude': Decimal('104.0668'), 'latitude': Decimal('30.5728'),
            'address': 'XX县XX镇竹园村', 'village': '竹园村', 'town': 'XX镇', 'county': 'XX县',
            'volume': Decimal('50000'), 'length': Decimal('200'), 'width': Decimal('150'), 'height': Decimal('30'),
            'threat_people': 156, 'threat_houses': 45, 'threat_assets': Decimal('2800'),
            'stability_coefficient': Decimal('1.05'),
            'responsible_person': '张三', 'contact_phone': '13800138001',
        },
        {
            'code': 'HS002', 'name': '石桥崖', 'type': 'collapse',
            'level': 'orange', 'status': 'attention',
            'longitude': Decimal('104.0750'), 'latitude': Decimal('30.5800'),
            'address': 'XX县XX镇石桥村', 'village': '石桥村', 'town': 'XX镇', 'county': 'XX县',
            'volume': Decimal('20000'), 'length': Decimal('100'), 'width': Decimal('80'), 'height': Decimal('50'),
            'threat_people': 89, 'threat_houses': 28, 'threat_assets': Decimal('1500'),
            'stability_coefficient': Decimal('1.10'),
            'responsible_person': '李四', 'contact_phone': '13800138002',
        },
        {
            'code': 'HS003', 'name': '李家坪', 'type': 'debris_flow',
            'level': 'yellow', 'status': 'stable',
            'longitude': Decimal('104.0800'), 'latitude': Decimal('30.5900'),
            'address': 'XX县XX镇李家村', 'village': '李家村', 'town': 'XX镇', 'county': 'XX县',
            'volume': Decimal('100000'), 'length': Decimal('500'), 'width': Decimal('100'), 'height': Decimal('20'),
            'threat_people': 23, 'threat_houses': 8, 'threat_assets': Decimal('500'),
            'stability_coefficient': Decimal('1.25'),
            'responsible_person': '王五', 'contact_phone': '13800138003',
        },
    ]
    
    for point_data in points:
        point, created = HazardPoint.objects.get_or_create(
            code=point_data['code'],
            defaults=point_data
        )
        if created:
            print(f'创建隐患点: {point.name}')
        else:
            print(f'隐患点已存在: {point.name}')
    
    return HazardPoint.objects.all()


def create_devices(hazard_points):
    """创建示例监测设备"""
    devices = [
        {'code': 'NPR-001', 'name': '竹园坡NPR锚索计', 'device_type': 'npr_anchor', 'hazard_point': hazard_points[0]},
        {'code': 'NPR-002', 'name': '石桥崖NPR锚索计', 'device_type': 'npr_anchor', 'hazard_point': hazard_points[1]},
        {'code': 'RAIN-001', 'name': '竹园坡雨量计', 'device_type': 'rainfall', 'hazard_point': hazard_points[0]},
        {'code': 'RAIN-002', 'name': '石桥崖雨量计', 'device_type': 'rainfall', 'hazard_point': hazard_points[1]},
        {'code': 'CAM-001', 'name': '竹园坡摄像头', 'device_type': 'camera', 'hazard_point': hazard_points[0]},
        {'code': 'CAM-002', 'name': '石桥崖摄像头', 'device_type': 'camera', 'hazard_point': hazard_points[1]},
    ]
    
    for device_data in devices:
        device, created = MonitoringDevice.objects.get_or_create(
            code=device_data['code'],
            defaults={
                **device_data,
                'longitude': device_data['hazard_point'].longitude,
                'latitude': device_data['hazard_point'].latitude,
                'address': device_data['hazard_point'].address,
                'status': 'online',
                'battery': 85,
                'signal': 'strong',
                'last_data_time': timezone.now(),
            }
        )
        if created:
            print(f'创建设备: {device.name}')
        else:
            print(f'设备已存在: {device.name}')
    
    return MonitoringDevice.objects.all()


def create_warnings(hazard_points):
    """创建示例预警记录"""
    now = timezone.now()
    warnings = [
        {
            'code': f'W{now.strftime("%Y%m%d")}001',
            'hazard_point': hazard_points[0],
            'level': 'red',
            'trigger_type': 'npr_drop',
            'trigger_value': {'npr_force': 45.2, 'change_rate': 35},
            'confidence': Decimal('87.3'),
            'status': 'confirmed',
            'confirm_time': now - timedelta(minutes=30),
            'confirm_user': '值班员小王',
        },
        {
            'code': f'W{now.strftime("%Y%m%d")}002',
            'hazard_point': hazard_points[1],
            'level': 'orange',
            'trigger_type': 'rainfall',
            'trigger_value': {'rainfall': 55},
            'confidence': Decimal('75.0'),
            'status': 'pending',
        },
        {
            'code': f'W{now.strftime("%Y%m%d")}003',
            'hazard_point': hazard_points[0],
            'level': 'yellow',
            'trigger_type': 'displacement',
            'trigger_value': {'displacement': 8.5},
            'confidence': Decimal('60.0'),
            'status': 'closed',
            'close_time': now - timedelta(hours=2),
            'close_reason': '风险已解除',
        },
    ]
    
    for warning_data in warnings:
        warning, created = WarningRecord.objects.get_or_create(
            code=warning_data['code'],
            defaults=warning_data
        )
        if created:
            print(f'创建预警: {warning.code}')
        else:
            print(f'预警已存在: {warning.code}')


def create_evacuation_tasks(hazard_points):
    """创建示例转移任务"""
    warnings = WarningRecord.objects.all()
    if not warnings.exists():
        return
    
    tasks = [
        {
            'code': 'EV001',
            'warning': warnings[0],
            'hazard_point': hazard_points[0],
            'status': 'ongoing',
            'total_people': 156,
            'transferred_people': 143,
            'shelter_name': '竹园村小学',
            'shelter_address': '竹园村中心路1号',
            'route_distance': Decimal('2.3'),
            'estimated_time': 35,
            'commander': '张指挥官',
            'commander_phone': '13900139001',
            'grid_worker': '张三',
            'grid_phone': '13800138001',
        },
        {
            'code': 'EV002',
            'warning': warnings[1] if len(warnings) > 1 else None,
            'hazard_point': hazard_points[1],
            'status': 'completed',
            'total_people': 89,
            'transferred_people': 89,
            'shelter_name': '镇政府',
            'shelter_address': 'XX镇中心路100号',
            'route_distance': Decimal('4.1'),
            'estimated_time': 55,
            'commander': '李指挥官',
            'commander_phone': '13900139002',
            'grid_worker': '李四',
            'grid_phone': '13800138002',
        },
    ]
    
    for task_data in tasks:
        task, created = EvacuationTask.objects.get_or_create(
            code=task_data['code'],
            defaults=task_data
        )
        if created:
            print(f'创建转移任务: {task.code}')
        else:
            print(f'转移任务已存在: {task.code}')


def create_equipment_and_geology(hazard_points):
    from datetime import date
    from equipment.models import EquipmentAsset, MaterialStock
    from geology.models import CrossSection
    from geology.serializers import DEFAULT_LAYERS
    from syshub.models import Notification, SystemConfig

    SystemConfig.get_solo()

    materials = [
        {'code': 'M001', 'name': '锚索钢绞线', 'spec': 'φ15.2mm', 'stock': 2500, 'unit': '米', 'location': '县仓库', 'min_stock': 1000},
        {'code': 'M002', 'name': '水泥 P.O42.5', 'spec': '50kg/袋', 'stock': 80, 'unit': '袋', 'location': 'A镇分站', 'min_stock': 100},
        {'code': 'M003', 'name': '钢筋 HRB400', 'spec': 'φ20mm', 'stock': 5000, 'unit': '千克', 'location': '县仓库', 'min_stock': 2000},
        {'code': 'M004', 'name': '防护网', 'spec': '2m×5m', 'stock': 120, 'unit': '片', 'location': '县仓库', 'min_stock': 50},
        {'code': 'M005', 'name': '排水管 PVC', 'spec': 'φ110mm', 'stock': 15, 'unit': '根', 'location': 'A镇分站', 'min_stock': 30},
    ]
    for row in materials:
        obj, created = MaterialStock.objects.get_or_create(code=row['code'], defaults=row)
        print(f'{"创建" if created else "材料已存在"}: {obj.code}')

    assets = [
        {'code': 'EQ001', 'name': '全站仪', 'model': 'Leica TS16', 'location': 'A镇竹林村', 'last_maint': date(2026, 7, 15), 'next_maint': date(2026, 10, 15), 'status': 'normal'},
        {'code': 'EQ002', 'name': '无人机', 'model': 'DJI M300 RTK', 'location': '县应急中心', 'last_maint': date(2026, 7, 1), 'next_maint': date(2026, 8, 1), 'status': 'maintain'},
        {'code': 'EQ003', 'name': '地质雷达', 'model': 'GSSI SIR-4000', 'location': '县应急中心', 'last_maint': date(2026, 6, 20), 'next_maint': date(2026, 9, 20), 'status': 'normal'},
        {'code': 'EQ004', 'name': '裂缝计', 'model': 'SBB-50', 'location': 'A镇石桥镇', 'last_maint': date(2026, 7, 10), 'next_maint': date(2026, 10, 10), 'status': 'normal'},
    ]
    for row in assets:
        obj, created = EquipmentAsset.objects.get_or_create(code=row['code'], defaults=row)
        print(f'{"创建" if created else "装备已存在"}: {obj.code}')

    def profile(amp=12):
        pts = []
        for i in range(0, 101, 5):
            # 地表折线 + 分层 y（深度向下为正）
            surface = 10 + amp * (0.5 - abs(i - 50) / 100)
            pts.append({'x': i, 'y': surface, 'layer': 'cover'})
        # 添加分层界面采样（供 SVG 区域填充）
        return pts

    sections = [
        {
            'code': 'CS-A', 'name': "A-A' 剖面", 'location': '竹林坡', 'direction': 'NE-SW',
            'length_m': Decimal('320'), 'profile_points': profile(14), 'layers': DEFAULT_LAYERS,
            'hazard_point': hazard_points[0] if hazard_points else None,
            'description': '竹园坡主剖面',
        },
        {
            'code': 'CS-B', 'name': "B-B' 剖面", 'location': '石桥崖', 'direction': 'NW-SE',
            'length_m': Decimal('280'), 'profile_points': profile(10), 'layers': DEFAULT_LAYERS,
            'hazard_point': hazard_points[1] if len(hazard_points) > 1 else None,
        },
        {
            'code': 'CS-C', 'name': "C-C' 剖面", 'location': '李家坪', 'direction': 'E-W',
            'length_m': Decimal('200'), 'profile_points': profile(8), 'layers': DEFAULT_LAYERS,
            'hazard_point': hazard_points[2] if len(hazard_points) > 2 else None,
        },
    ]
    for row in sections:
        hp = row.pop('hazard_point', None)
        obj, created = CrossSection.objects.get_or_create(code=row['code'], defaults={**row, 'hazard_point': hp})
        print(f'{"创建" if created else "剖面已存在"}: {obj.code}')

    if not Notification.objects.exists():
        Notification.objects.create(
            title='系统就绪',
            body='材料装备、剖面与系统配置已接入后端，可在顶栏搜索与查看通知。',
            level='info',
            link='/system/config',
            source='seed',
        )
        print('创建示例通知')

    from geology.models import GeologySite

    sites = [
        {
            'code': 'SITE-ZY',
            'name': '竹园坡三维场景',
            'hazard_point': hazard_points[0] if hazard_points else None,
            'height': 2200,
            'status': 'published',
            'description': '竹园坡站点级场景（可补 Ion/Tiles/GLB）',
        },
        {
            'code': 'SITE-SQ',
            'name': '石桥崖三维场景',
            'hazard_point': hazard_points[1] if len(hazard_points) > 1 else None,
            'height': 2800,
            'status': 'published',
            'description': '石桥崖站点场景',
        },
    ]
    for row in sites:
        hp = row.pop('hazard_point', None)
        obj, created = GeologySite.objects.get_or_create(
            code=row['code'],
            defaults={**row, 'hazard_point': hp},
        )
        if created or (hp and not obj.longitude):
            obj.hazard_point = hp or obj.hazard_point
            obj.sync_coords_from_hazard()
            obj.save()
        print(f'{"创建" if created else "站点已存在"}: {obj.code}')


def main():
    print('开始初始化示例数据...')
    print('=' * 50)
    
    create_users()
    print()

    create_warning_models()
    print()

    hazard_points = list(create_hazard_points())
    print()
    
    create_devices(hazard_points)
    print()
    
    create_warnings(hazard_points)
    print()
    
    create_evacuation_tasks(hazard_points)
    print()

    create_equipment_and_geology(hazard_points)
    print()
    
    print('=' * 50)
    print('示例数据初始化完成!')
    print()
    print('测试账号:')
    print('  管理员: admin / admin123')
    print('  值班领导: leader / leader123')
    print('  值班员: operator / operator123')
    print('  网格员: zhangsan / zhangsan123')


if __name__ == '__main__':
    main()
