"""驾驶舱聚合接口：全系统数据汇总"""
from calendar import monthrange
from datetime import timedelta

from django.db.models import Avg, Count, Sum
from django.db.models.functions import TruncHour, TruncMonth
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from emergency.models import EvacuationTask
from hazard.models import HazardPoint, InspectionTask
from monitoring.models import MonitorData, MonitoringDevice
from warning.models import WarningRecord

TYPE_COLORS = {
    'landslide': '#ef4444',
    'collapse': '#f97316',
    'debris_flow': '#eab308',
    'others': '#3b82f6',
}


def _month_bounds(dt):
    start = dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last = monthrange(dt.year, dt.month)[1]
    end = dt.replace(day=last, hour=23, minute=59, second=59, microsecond=999999)
    return start, end


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_overview(request):
    """
    GET /api/dashboard/overview/

    汇总隐患、监测、预警、巡查、转移等模块，供驾驶舱总览。
    """
    now = timezone.localtime()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)
    month_start, month_end = _month_bounds(now)
    prev_month_anchor = (month_start - timedelta(days=1))
    prev_start, prev_end = _month_bounds(prev_month_anchor)
    year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    hours_24 = now - timedelta(hours=24)

    # —— 隐患 ——
    hazards = HazardPoint.objects.all()
    hazard_total = hazards.count()
    hazard_new_month = hazards.filter(
        created_at__gte=month_start, created_at__lte=month_end
    ).count()
    hazard_new_prev = hazards.filter(
        created_at__gte=prev_start, created_at__lte=prev_end
    ).count()
    if hazard_new_prev:
        hazard_trend = round(
            (hazard_new_month - hazard_new_prev) / hazard_new_prev * 100, 1
        )
    else:
        hazard_trend = 100.0 if hazard_new_month else 0.0

    type_map = dict(HazardPoint.Type.choices)
    type_rows = hazards.values('type').annotate(value=Count('id')).order_by('-value')
    hazard_type_distribution = [
        {
            'key': r['type'],
            'name': type_map.get(r['type'], r['type']),
            'value': r['value'],
            'color': TYPE_COLORS.get(r['type'], '#64748b'),
        }
        for r in type_rows
    ]

    # —— 设备 ——
    devices = MonitoringDevice.objects.all()
    device_total = devices.count()
    device_online = devices.filter(status='online').count()
    device_rate = round(device_online / device_total * 100, 1) if device_total else 0.0

    # —— 预警 ——
    today_warnings = WarningRecord.objects.filter(created_at__gte=today).count()
    yesterday_warnings = WarningRecord.objects.filter(
        created_at__gte=yesterday, created_at__lt=today
    ).count()
    open_warnings_qs = WarningRecord.objects.exclude(status='closed')
    open_warnings = open_warnings_qs.count()
    pending_confirm = WarningRecord.objects.filter(status='pending').count()

    # —— 待处置（预警待办 + 巡查待办 + 转移待办）——
    inspect_open = InspectionTask.objects.filter(
        status__in=['pending', 'in_progress']
    ).count()
    evac_open = EvacuationTask.objects.filter(
        status__in=['pending', 'ongoing']
    ).count()
    warn_actionable = WarningRecord.objects.filter(
        status__in=['pending', 'confirmed', 'analyzing', 'published', 'processing']
    ).count()
    pending_tasks = warn_actionable + inspect_open + evac_open

    # 昨日同期待处置快照近似：昨日创建且仍未闭环的同类（简化环比）
    y_warn = WarningRecord.objects.filter(
        created_at__gte=yesterday,
        created_at__lt=today,
        status__in=['pending', 'confirmed', 'analyzing', 'published', 'processing'],
    ).count()
    y_insp = InspectionTask.objects.filter(
        created_at__gte=yesterday,
        created_at__lt=today,
        status__in=['pending', 'in_progress'],
    ).count()
    y_evac = EvacuationTask.objects.filter(
        created_at__gte=yesterday,
        created_at__lt=today,
        status__in=['pending', 'ongoing'],
    ).count()
    tasks_trend = pending_tasks - (y_warn + y_insp + y_evac)

    # —— 转移人数 ——
    transferred_people = (
        EvacuationTask.objects.filter(status__in=['ongoing', 'completed']).aggregate(
            s=Sum('transferred_people')
        )['s']
        or 0
    )
    people_today = (
        EvacuationTask.objects.filter(
            updated_at__gte=today, status__in=['ongoing', 'completed']
        ).aggregate(s=Sum('transferred_people'))['s']
        or 0
    )
    people_yesterday = (
        EvacuationTask.objects.filter(
            updated_at__gte=yesterday,
            updated_at__lt=today,
            status__in=['ongoing', 'completed'],
        ).aggregate(s=Sum('transferred_people'))['s']
        or 0
    )
    people_trend = people_today - people_yesterday

    warning_by_level = {
        'red': open_warnings_qs.filter(level='red').count(),
        'orange': open_warnings_qs.filter(level='orange').count(),
        'yellow': open_warnings_qs.filter(level='yellow').count(),
        'blue': open_warnings_qs.filter(level='blue').count(),
    }

    # —— 月度预警趋势（本年）——
    monthly_map = {m: {'warnings': 0, 'closed': 0} for m in range(1, 13)}
    year_warnings = WarningRecord.objects.filter(created_at__gte=year_start)
    for row in (
        year_warnings.annotate(m=TruncMonth('created_at'))
        .values('m')
        .annotate(c=Count('id'))
    ):
        if row['m']:
            monthly_map[timezone.localtime(row['m']).month]['warnings'] = row['c']
    for row in (
        year_warnings.filter(status='closed')
        .annotate(m=TruncMonth('created_at'))
        .values('m')
        .annotate(c=Count('id'))
    ):
        if row['m']:
            monthly_map[timezone.localtime(row['m']).month]['closed'] = row['c']
    monthly_warnings = [
        {
            'month': m,
            'label': f'{m}月',
            'warnings': monthly_map[m]['warnings'],
            'closed': monthly_map[m]['closed'],
        }
        for m in range(1, 13)
    ]

    # —— 近 24 小时监测曲线（按小时均值）——
    series_types = [
        ('force', 'force'),
        ('rainfall', 'rainfall'),
        ('displacement', 'displacement'),
    ]
    hourly = {
        (now - timedelta(hours=23 - i)).replace(minute=0, second=0, microsecond=0): {
            'force': 0.0,
            'rainfall': 0.0,
            'displacement': 0.0,
        }
        for i in range(24)
    }
    # normalize keys to aware local hours
    hour_keys = sorted(hourly.keys())
    for dtype, key in series_types:
        rows = (
            MonitorData.objects.filter(
                data_type=dtype, record_time__gte=hours_24, record_time__lte=now
            )
            .annotate(h=TruncHour('record_time'))
            .values('h')
            .annotate(avg=Avg('value'))
        )
        by_h = {}
        for r in rows:
            if not r['h']:
                continue
            lh = timezone.localtime(r['h']).replace(minute=0, second=0, microsecond=0)
            by_h[lh] = float(r['avg'] or 0)
        for hk in hour_keys:
            if hk in by_h:
                hourly[hk][key] = round(by_h[hk], 2)

    monitor_trend = [
        {
            'time': hk.strftime('%H:00'),
            'force': hourly[hk]['force'],
            'rainfall': hourly[hk]['rainfall'],
            'displacement': hourly[hk]['displacement'],
        }
        for hk in hour_keys
    ]

    # —— 最新预警 ——
    latest_warnings = []
    for w in (
        WarningRecord.objects.select_related('hazard_point')
        .order_by('-created_at')[:8]
    ):
        latest_warnings.append({
            'id': w.id,
            'code': w.code,
            'hazardPointName': w.hazard_point.name if w.hazard_point_id else '',
            'hazardPointCode': w.hazard_point.code if w.hazard_point_id else '',
            'level': w.level,
            'levelDisplay': w.get_level_display(),
            'status': w.status,
            'statusDisplay': w.get_status_display(),
            'triggerType': w.trigger_type or '',
            'confidence': float(w.confidence or 0),
            'createTime': timezone.localtime(w.created_at).strftime('%Y-%m-%d %H:%M:%S'),
        })

    # —— 待办任务合集 ——
    todos = []
    for t in InspectionTask.objects.filter(
        status__in=['pending', 'in_progress']
    ).order_by('planned_date', 'id')[:6]:
        todos.append({
            'id': f'insp-{t.id}',
            'label': t.title or t.code,
            'time': (t.planned_date.strftime('%m-%d') if t.planned_date else '—'),
            'type': '巡查',
            'href': '/inspection/dispatch',
            'priority': t.priority,
            'status': t.status,
        })
    for e in EvacuationTask.objects.filter(
        status__in=['pending', 'ongoing']
    ).select_related('hazard_point').order_by('-updated_at')[:4]:
        name = e.hazard_point.name if e.hazard_point_id else e.code
        todos.append({
            'id': f'evac-{e.id}',
            'label': f'{name} 转移避险',
            'time': timezone.localtime(e.updated_at).strftime('%H:%M'),
            'type': '转移',
            'href': '/emergency/evacuation',
            'priority': 'high' if e.status == 'ongoing' else 'medium',
            'status': e.status,
        })
    for w in WarningRecord.objects.filter(
        status__in=['pending', 'confirmed', 'analyzing']
    ).select_related('hazard_point').order_by('-created_at')[:4]:
        name = w.hazard_point.name if w.hazard_point_id else w.code
        todos.append({
            'id': f'warn-{w.id}',
            'label': f'{name} 预警核实',
            'time': timezone.localtime(w.created_at).strftime('%H:%M'),
            'type': '核实',
            'href': '/warning/current',
            'priority': 'high' if w.level in ('red', 'orange') else 'medium',
            'status': w.status,
        })
    # 故障设备
    for d in MonitoringDevice.objects.filter(status__in=['fault', 'offline']).order_by(
        '-updated_at'
    )[:3]:
        todos.append({
            'id': f'dev-{d.id}',
            'label': f'{d.code} 设备检修',
            'time': timezone.localtime(d.updated_at).strftime('%H:%M'),
            'type': '维修',
            'href': '/monitoring/devices',
            'priority': 'medium' if d.status == 'offline' else 'high',
            'status': d.status,
        })

    # 排序：高优先级优先
    pri_rank = {'high': 0, 'medium': 1, 'low': 2}
    todos.sort(key=lambda x: pri_rank.get(x.get('priority'), 9))
    todos = todos[:10]

    # —— 设备状态拆分 ——
    device_status_rows = {
        r['status']: r['c']
        for r in devices.values('status').annotate(c=Count('id'))
    }
    device_by_status = {
        'online': device_status_rows.get('online', 0),
        'offline': device_status_rows.get('offline', 0),
        'fault': device_status_rows.get('fault', 0),
        'other': sum(
            v for k, v in device_status_rows.items()
            if k not in ('online', 'offline', 'fault')
        ),
    }

    # —— 转移汇总 ——
    evac_qs = EvacuationTask.objects.exclude(status='cancelled')
    evac_summary = {
        'pending': evac_qs.filter(status='pending').count(),
        'ongoing': evac_qs.filter(status='ongoing').count(),
        'completed': evac_qs.filter(status='completed').count(),
        'totalPeople': evac_qs.aggregate(s=Sum('total_people'))['s'] or 0,
        'transferredPeople': transferred_people,
        'pendingPeople': max(
            0,
            (evac_qs.filter(status__in=['pending', 'ongoing']).aggregate(
                s=Sum('total_people')
            )['s'] or 0)
            - (evac_qs.filter(status__in=['pending', 'ongoing']).aggregate(
                s=Sum('transferred_people')
            )['s'] or 0),
        ),
    }

    # —— 隐患热点（地图）——
    hotspots = []
    for hp in hazards.order_by('-level', '-updated_at')[:40]:
        hotspots.append({
            'id': hp.id,
            'code': hp.code,
            'name': hp.name,
            'level': hp.level,
            'status': hp.status,
            'type': hp.type,
            'longitude': float(hp.longitude) if hp.longitude is not None else None,
            'latitude': float(hp.latitude) if hp.latitude is not None else None,
            'threatPeople': hp.threat_people or 0,
            'town': getattr(hp, 'town', '') or '',
            'village': getattr(hp, 'village', '') or '',
        })

    # —— 综合风险等级 ——
    if warning_by_level['red'] > 0:
        overall_risk = {'level': 'red', 'label': 'Ⅰ级响应', 'score': 95}
    elif warning_by_level['orange'] > 0:
        overall_risk = {'level': 'orange', 'label': 'Ⅱ级响应', 'score': 75}
    elif warning_by_level['yellow'] > 0 or pending_confirm > 0:
        overall_risk = {'level': 'yellow', 'label': 'Ⅲ级响应', 'score': 55}
    elif open_warnings > 0:
        overall_risk = {'level': 'blue', 'label': 'Ⅳ级关注', 'score': 35}
    else:
        overall_risk = {'level': 'green', 'label': '常态监测', 'score': 15}

    return Response({
        'generatedAt': now.strftime('%Y-%m-%d %H:%M:%S'),
        'hazardTotal': hazard_total,
        'hazardTrend': hazard_trend,
        'hazardNewMonth': hazard_new_month,
        'deviceOnline': device_online,
        'deviceTotal': device_total,
        'deviceRate': device_rate,
        'deviceByStatus': device_by_status,
        'todayWarnings': today_warnings,
        'warningTrend': today_warnings - yesterday_warnings,
        'openWarnings': open_warnings,
        'pendingConfirm': pending_confirm,
        'pendingTasks': pending_tasks,
        'tasksTrend': tasks_trend,
        'inspectOpen': inspect_open,
        'evacOpen': evac_open,
        'warnActionable': warn_actionable,
        'transferredPeople': transferred_people,
        'peopleTrend': people_trend,
        'warningByLevel': warning_by_level,
        'hazardTypeDistribution': hazard_type_distribution,
        'monthlyWarnings': monthly_warnings,
        'monitorTrend': monitor_trend,
        'latestWarnings': latest_warnings,
        'todoTasks': todos,
        'hotspots': hotspots,
        'evacSummary': evac_summary,
        'overallRisk': overall_risk,
    })
