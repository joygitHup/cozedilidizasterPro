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
        {'username': 'admin', 'password': 'admin123', 'role': 'admin', 'department': '系统管理部'},
        {'username': 'leader', 'password': 'leader123', 'role': 'leader', 'department': '应急指挥中心'},
        {'username': 'operator', 'password': 'operator123', 'role': 'operator', 'department': '监测预警中心'},
        {'username': 'zhangsan', 'password': 'zhangsan123', 'role': 'grid_worker', 'village': '竹园村', 'department': '竹园村村委会'},
        {'username': 'lisi', 'password': 'lisi123', 'role': 'grid_worker', 'village': '石桥村', 'department': '石桥村村委会'},
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
            print(f'用户已存在: {username}')


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


def main():
    print('开始初始化示例数据...')
    print('=' * 50)
    
    create_users()
    print()
    
    hazard_points = list(create_hazard_points())
    print()
    
    create_devices(hazard_points)
    print()
    
    create_warnings(hazard_points)
    print()
    
    create_evacuation_tasks(hazard_points)
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
