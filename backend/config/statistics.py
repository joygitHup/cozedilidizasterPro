"""统计分析聚合接口：灾害统计（来自隐患/预警/转移/巡查真实数据）"""
from calendar import monthrange
from datetime import datetime

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from emergency.models import EvacuationTask
from hazard.models import HazardPoint, InspectionTask
from warning.models import WarningRecord

TYPE_COLORS = {
    'landslide': '#ef4444',
    'collapse': '#f97316',
    'debris_flow': '#eab308',
    'others': '#3b82f6',
}

LEVEL_COLORS = {
    'red': '#ef4444',
    'orange': '#f97316',
    'yellow': '#eab308',
    'blue': '#3b82f6',
}


def _month_bounds(year: int, month: int):
    start = timezone.make_aware(datetime(year, month, 1, 0, 0, 0))
    last_day = monthrange(year, month)[1]
    end = timezone.make_aware(datetime(year, month, last_day, 23, 59, 59, 999999))
    return start, end


def _parse_year(request) -> int:
    raw = request.query_params.get('year')
    now = timezone.localtime()
    if not raw:
        return now.year
    try:
        y = int(raw)
        if 2000 <= y <= 2100:
            return y
    except (TypeError, ValueError):
        pass
    return now.year


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def disaster_statistics(request):
    """
    GET /api/statistics/disaster/?year=2026

    闭环口径：
    - 隐患台账 → 类型/等级/区域分布、威胁人数
    - 预警记录 → 月度趋势、闭环率、等级分布
    - 转移任务（关联预警/隐患）→ 年度转移人数
    - 巡查完成发现问题 → 可回写隐患状态，体现在状态分布与问题统计
    """
    year = _parse_year(request)
    now = timezone.localtime()
    year_start = timezone.make_aware(datetime(year, 1, 1))
    year_end = timezone.make_aware(datetime(year, 12, 31, 23, 59, 59, 999999))

    cur_month = now.month if now.year == year else 12
    if now.year < year:
        cur_month = 0
    month_start, month_end = (
        _month_bounds(year, cur_month) if cur_month else (year_start, year_start)
    )
    prev_year, prev_month = (year, cur_month - 1) if cur_month > 1 else (year - 1, 12)
    prev_start, prev_end = _month_bounds(prev_year, prev_month) if cur_month else (year_start, year_start)

    # —— 隐患 ——
    hazards = HazardPoint.objects.all()
    hazard_total = hazards.count()
    hazard_new_month = hazards.filter(
        created_at__gte=month_start, created_at__lte=month_end
    ).count() if cur_month else 0
    hazard_new_prev = hazards.filter(
        created_at__gte=prev_start, created_at__lte=prev_end
    ).count() if cur_month else 0
    if hazard_new_prev > 0:
        hazard_trend_pct = round((hazard_new_month - hazard_new_prev) / hazard_new_prev * 100, 1)
    else:
        hazard_trend_pct = 100.0 if hazard_new_month else 0.0

    threat = hazards.aggregate(
        people=Sum('threat_people'),
        houses=Sum('threat_houses'),
        assets=Sum('threat_assets'),
    )

    type_rows = hazards.values('type').annotate(value=Count('id')).order_by('-value')
    type_map = dict(HazardPoint.Type.choices)
    type_distribution = [
        {
            'key': r['type'],
            'name': type_map.get(r['type'], r['type']),
            'value': r['value'],
            'color': TYPE_COLORS.get(r['type'], '#64748b'),
        }
        for r in type_rows
    ]

    level_rows = hazards.values('level').annotate(value=Count('id')).order_by('-value')
    level_map = dict(HazardPoint.Level.choices)
    level_distribution = [
        {
            'key': r['level'],
            'name': level_map.get(r['level'], r['level']),
            'value': r['value'],
            'color': LEVEL_COLORS.get(r['level'], '#64748b'),
        }
        for r in level_rows
    ]

    status_rows = hazards.values('status').annotate(value=Count('id')).order_by('-value')
    status_map = dict(HazardPoint.Status.choices)
    status_distribution = [
        {
            'key': r['status'],
            'name': status_map.get(r['status'], r['status']),
            'value': r['value'],
        }
        for r in status_rows
    ]

    # —— 预警 ——
    warnings_year = WarningRecord.objects.filter(
        created_at__gte=year_start, created_at__lte=year_end
    )
    month_warnings = warnings_year.filter(
        created_at__gte=month_start, created_at__lte=month_end
    ).count() if cur_month else 0
    prev_warnings = WarningRecord.objects.filter(
        created_at__gte=prev_start, created_at__lte=prev_end
    ).count() if cur_month else 0
    month_closed = warnings_year.filter(
        status='closed',
        close_time__gte=month_start,
        close_time__lte=month_end,
    ).count() if cur_month else 0
    # 本月产生的预警中已闭环数（闭环率）
    month_warn_qs = warnings_year.filter(
        created_at__gte=month_start, created_at__lte=month_end
    ) if cur_month else warnings_year.none()
    month_warn_closed = month_warn_qs.filter(status='closed').count()
    closure_rate = (
        round(month_warn_closed / month_warnings * 100, 1) if month_warnings else 0.0
    )

    year_closed = warnings_year.filter(status='closed').count()
    year_total_warn = warnings_year.count()
    year_closure_rate = (
        round(year_closed / year_total_warn * 100, 1) if year_total_warn else 0.0
    )
    open_warnings = WarningRecord.objects.exclude(status='closed').count()

    monthly_map = {m: {'count': 0, 'closed': 0} for m in range(1, 13)}
    for row in (
        warnings_year.annotate(m=TruncMonth('created_at'))
        .values('m')
        .annotate(count=Count('id'))
    ):
        if row['m']:
            monthly_map[row['m'].month]['count'] = row['count']
    for row in (
        warnings_year.filter(status='closed')
        .annotate(m=TruncMonth('created_at'))
        .values('m')
        .annotate(count=Count('id'))
    ):
        if row['m']:
            monthly_map[row['m'].month]['closed'] = row['count']

    monthly_warnings = [
        {
            'month': m,
            'label': f'{m}月',
            'count': monthly_map[m]['count'],
            'closed': monthly_map[m]['closed'],
        }
        for m in range(1, 13)
    ]

    warn_level_rows = warnings_year.values('level').annotate(value=Count('id'))
    warn_level_map = dict(WarningRecord.Level.choices)
    warning_level_distribution = [
        {
            'key': r['level'],
            'name': warn_level_map.get(r['level'], r['level']),
            'value': r['value'],
            'color': LEVEL_COLORS.get(r['level'], '#64748b'),
        }
        for r in warn_level_rows
    ]

    # —— 转移（年度） ——
    evacuations_year = EvacuationTask.objects.filter(
        created_at__gte=year_start, created_at__lte=year_end
    ).exclude(status='cancelled')
    year_transferred = (
        evacuations_year.filter(status__in=['ongoing', 'completed']).aggregate(
            s=Sum('transferred_people')
        )['s']
        or 0
    )
    year_need_transfer = evacuations_year.aggregate(s=Sum('total_people'))['s'] or 0
    evacuations_from_warning = evacuations_year.filter(warning__isnull=False).count()
    evacuations_completed = evacuations_year.filter(status='completed').count()

    # —— 巡查问题（本月完成） ——
    insp_month = InspectionTask.objects.filter(
        status='completed',
        completed_at__gte=month_start,
        completed_at__lte=month_end,
    ) if cur_month else InspectionTask.objects.none()
    inspection_done_month = insp_month.count()
    inspection_issues_month = insp_month.aggregate(s=Sum('issue_count'))['s'] or 0

    # —— 区域分布（镇） ——
    region_rows = (
        hazards.values('town')
        .annotate(
            hazard_count=Count('id'),
            threat_people=Sum('threat_people'),
            warning_count=Count('warnings', filter=Q(
                warnings__created_at__gte=year_start,
                warnings__created_at__lte=year_end,
            )),
        )
        .order_by('-hazard_count')
    )
    region_distribution = [
        {
            'name': r['town'] or '未分区',
            'hazard_count': r['hazard_count'],
            'threat_people': r['threat_people'] or 0,
            'warning_count': r['warning_count'] or 0,
        }
        for r in region_rows[:12]
    ]

    # —— 高风险隐患清单（闭环下钻） ——
    high_risk = (
        hazards.filter(level__in=['red', 'orange'])
        .annotate(
            open_warning_count=Count(
                'warnings', filter=~Q(warnings__status='closed')
            )
        )
        .order_by('level', '-threat_people')[:10]
    )
    high_risk_points = [
        {
            'id': h.id,
            'code': h.code,
            'name': h.name,
            'type': h.type,
            'type_display': h.get_type_display(),
            'level': h.level,
            'level_display': h.get_level_display(),
            'status': h.status,
            'status_display': h.get_status_display(),
            'town': h.town,
            'village': h.village,
            'threat_people': h.threat_people,
            'open_warning_count': h.open_warning_count,
        }
        for h in high_risk
    ]

    # —— 本月预警清单 ——
    recent_warnings = []
    if cur_month:
        for w in (
            month_warn_qs.select_related('hazard_point')
            .order_by('-created_at')[:15]
        ):
            has_evac = w.evacuation_tasks.exclude(status='cancelled').exists()
            recent_warnings.append({
                'id': w.id,
                'code': w.code,
                'level': w.level,
                'level_display': w.get_level_display(),
                'status': w.status,
                'status_display': w.get_status_display(),
                'hazard_code': w.hazard_point.code if w.hazard_point_id else '',
                'hazard_name': w.hazard_point.name if w.hazard_point_id else '',
                'created_at': timezone.localtime(w.created_at).strftime('%Y-%m-%d %H:%M'),
                'has_evacuation': has_evac,
                'closed': w.status == 'closed',
            })

    return Response({
        'year': year,
        'generated_at': now.strftime('%Y-%m-%d %H:%M:%S'),
        'summary': {
            'hazard_total': hazard_total,
            'hazard_new_month': hazard_new_month,
            'hazard_trend_pct': hazard_trend_pct,
            'month_warnings': month_warnings,
            'month_warnings_delta': month_warnings - prev_warnings,
            'month_closed_warnings': month_warn_closed,
            'month_closed_actions': month_closed,
            'closure_rate': closure_rate,
            'year_warnings': year_total_warn,
            'year_closure_rate': year_closure_rate,
            'open_warnings': open_warnings,
            'year_transferred_people': year_transferred,
            'year_need_transfer': year_need_transfer,
            'threat_people_total': threat['people'] or 0,
            'threat_houses_total': threat['houses'] or 0,
            'threat_assets_total': float(threat['assets'] or 0),
            'inspection_done_month': inspection_done_month,
            'inspection_issues_month': inspection_issues_month,
            'evacuations_from_warning': evacuations_from_warning,
            'evacuations_completed': evacuations_completed,
        },
        'monthly_warnings': monthly_warnings,
        'type_distribution': type_distribution,
        'level_distribution': level_distribution,
        'status_distribution': status_distribution,
        'warning_level_distribution': warning_level_distribution,
        'region_distribution': region_distribution,
        'high_risk_points': high_risk_points,
        'recent_warnings': recent_warnings,
        'loop': {
            'description': (
                '隐患台账→监测预警→预警闭环/转移避险→巡查发现问题回写隐患状态'
            ),
            'warning_with_evacuation': evacuations_from_warning,
            'hazard_in_warning_or_emergency': hazards.filter(
                status__in=['warning', 'emergency']
            ).count(),
            'inspection_issues_synced_hint': (
                '巡查完成且 issue_count>0 时可将 stable→attention / attention→warning'
            ),
        },
    })


def _avg(values):
    vals = [v for v in values if v is not None]
    if not vals:
        return None
    return round(sum(vals) / len(vals), 2)


def _warning_durations(qs):
    """响应分钟=确认-创建；处置小时=闭环-创建。"""
    response_mins = []
    closure_hours = []
    for w in qs.only('created_at', 'confirm_time', 'close_time', 'status'):
        if w.confirm_time and w.created_at:
            delta = (w.confirm_time - w.created_at).total_seconds() / 60.0
            if delta >= 0:
                response_mins.append(delta)
        if w.status == 'closed' and w.close_time and w.created_at:
            delta_h = (w.close_time - w.created_at).total_seconds() / 3600.0
            if delta_h >= 0:
                closure_hours.append(delta_h)
    return response_mins, closure_hours


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def performance_statistics(request):
    """
    GET /api/statistics/performance/?year=2026

    效能闭环口径：
    - 响应时间：预警确认时间 − 创建时间（分钟）
    - 处置时长：预警闭环时间 − 创建时间（小时）
    - 闭环率：已闭环预警 / 期间预警总数
    - 巡查覆盖率：当年有完成巡查的隐患点 / 隐患点总数
    - 派生：叫应确认率、转移完成率、巡查按时率、设备在线率
    """
    from monitoring.models import MonitoringDevice

    year = _parse_year(request)
    now = timezone.localtime()
    year_start = timezone.make_aware(datetime(year, 1, 1))
    year_end = timezone.make_aware(datetime(year, 12, 31, 23, 59, 59, 999999))

    cur_month = now.month if now.year == year else (12 if now.year > year else 0)
    month_start, month_end = (
        _month_bounds(year, cur_month) if cur_month else (year_start, year_start)
    )
    prev_year, prev_month = (year, cur_month - 1) if cur_month > 1 else (year - 1, 12)
    prev_start, prev_end = (
        _month_bounds(prev_year, prev_month) if cur_month else (year_start, year_start)
    )

    warnings_year = WarningRecord.objects.filter(
        created_at__gte=year_start, created_at__lte=year_end
    )
    warnings_month = warnings_year.filter(
        created_at__gte=month_start, created_at__lte=month_end
    ) if cur_month else WarningRecord.objects.none()
    warnings_prev = WarningRecord.objects.filter(
        created_at__gte=prev_start, created_at__lte=prev_end
    ) if cur_month else WarningRecord.objects.none()

    # —— 响应 / 处置 ——
    resp_m, close_m = _warning_durations(warnings_month)
    resp_p, close_p = _warning_durations(warnings_prev)
    resp_y, close_y = _warning_durations(warnings_year)

    avg_response = _avg(resp_m) if cur_month else _avg(resp_y)
    avg_closure = _avg(close_m) if cur_month else _avg(close_y)
    prev_response = _avg(resp_p)
    prev_closure = _avg(close_p)

    # 时间下降视为优化，前端展示用正数“优化 x%”
    response_improve_pct = None
    if avg_response is not None and prev_response not in (None, 0):
        response_improve_pct = round((prev_response - avg_response) / prev_response * 100, 1)
    closure_improve_pct = None
    if avg_closure is not None and prev_closure not in (None, 0):
        closure_improve_pct = round((prev_closure - avg_closure) / prev_closure * 100, 1)

    # —— 闭环率 ——
    def _closure_rate(qs):
        total = qs.count()
        if not total:
            return 0.0
        closed = qs.filter(status='closed').count()
        return round(closed / total * 100, 1)

    closure_rate = _closure_rate(warnings_month) if cur_month else _closure_rate(warnings_year)
    prev_closure_rate = _closure_rate(warnings_prev)
    closure_rate_delta = (
        round(closure_rate - prev_closure_rate, 1) if cur_month else None
    )
    year_closure_rate = _closure_rate(warnings_year)

    # —— 巡查覆盖率：隐患点被完成巡查覆盖 ——
    hazard_total = HazardPoint.objects.count()
    covered_ids = set(
        InspectionTask.objects.filter(
            status='completed',
            hazard_point__isnull=False,
            completed_at__gte=year_start,
            completed_at__lte=year_end,
        ).values_list('hazard_point_id', flat=True)
    )
    covered = len(covered_ids)
    inspect_coverage = (
        round(covered / hazard_total * 100, 1) if hazard_total else 0.0
    )

    # 上一年覆盖率作对比
    prev_year_start = timezone.make_aware(datetime(year - 1, 1, 1))
    prev_year_end = timezone.make_aware(datetime(year - 1, 12, 31, 23, 59, 59, 999999))
    covered_prev = len(set(
        InspectionTask.objects.filter(
            status='completed',
            hazard_point__isnull=False,
            completed_at__gte=prev_year_start,
            completed_at__lte=prev_year_end,
        ).values_list('hazard_point_id', flat=True)
    ))
    prev_coverage = (
        round(covered_prev / hazard_total * 100, 1) if hazard_total else 0.0
    )
    coverage_delta = round(inspect_coverage - prev_coverage, 1)

    # —— 月度效率趋势 ——
    monthly = []
    for m in range(1, 13):
        ms, me = _month_bounds(year, m)
        qs = warnings_year.filter(created_at__gte=ms, created_at__lte=me)
        r_mins, c_hours = _warning_durations(qs)
        total = qs.count()
        closed = qs.filter(status='closed').count()
        monthly.append({
            'month': m,
            'label': f'{m}月',
            'response': _avg(r_mins) or 0,
            'closure': _avg(c_hours) or 0,
            'warnings': total,
            'closed': closed,
            'closure_rate': round(closed / total * 100, 1) if total else 0,
        })

    # —— 巡查按时率 / 耗时 ——
    insp_done = InspectionTask.objects.filter(
        status='completed',
        completed_at__gte=year_start,
        completed_at__lte=year_end,
    )
    insp_total_done = insp_done.count()
    on_time = 0
    for t in insp_done.only('planned_date', 'completed_at'):
        if t.planned_date and t.completed_at:
            if timezone.localtime(t.completed_at).date() <= t.planned_date:
                on_time += 1
        elif t.planned_date is None:
            on_time += 1
    inspect_ontime_rate = (
        round(on_time / insp_total_done * 100, 1) if insp_total_done else 0.0
    )
    from django.db.models import Avg
    avg_inspect_duration = insp_done.aggregate(a=Avg('duration_minutes'))['a']
    avg_inspect_duration = round(float(avg_inspect_duration or 0), 1)

    # —— 转移完成率 ——
    evac_year = EvacuationTask.objects.filter(
        created_at__gte=year_start, created_at__lte=year_end
    ).exclude(status='cancelled')
    evac_total = evac_year.count()
    evac_done = evac_year.filter(status='completed').count()
    evacuation_complete_rate = (
        round(evac_done / evac_total * 100, 1) if evac_total else 0.0
    )
    # 人员转移完成度
    evac_agg = evac_year.aggregate(
        need=Sum('total_people'), done=Sum('transferred_people')
    )
    need_p = evac_agg['need'] or 0
    done_p = evac_agg['done'] or 0
    people_transfer_rate = round(done_p / need_p * 100, 1) if need_p else 0.0

    # —— 预警确认率 ——
    warn_total_y = warnings_year.count()
    confirmed_y = warnings_year.exclude(confirm_time__isnull=True).count()
    confirm_rate = (
        round(confirmed_y / warn_total_y * 100, 1) if warn_total_y else 0.0
    )

    # —— 设备在线率 ——
    devices = MonitoringDevice.objects.all()
    device_total = devices.count()
    device_online = devices.filter(status='online').count()
    device_online_rate = (
        round(device_online / device_total * 100, 1) if device_total else 0.0
    )

    # —— 环节漏斗（闭环下钻） ——
    funnel = {
        'warnings_created': warn_total_y,
        'warnings_confirmed': confirmed_y,
        'warnings_closed': warnings_year.filter(status='closed').count(),
        'evacuations_launched': evac_total,
        'evacuations_completed': evac_done,
        'inspections_completed': insp_total_done,
        'hazards_covered': covered,
    }

    # 慢响应预警 Top（本月或全年）
    slow_qs = (warnings_month if cur_month else warnings_year).filter(
        confirm_time__isnull=False
    ).select_related('hazard_point').order_by('-created_at')[:80]
    slow_list = []
    for w in slow_qs:
        mins = (w.confirm_time - w.created_at).total_seconds() / 60.0
        if mins < 0:
            continue
        slow_list.append({
            'id': w.id,
            'code': w.code,
            'hazard_name': w.hazard_point.name if w.hazard_point_id else '',
            'level': w.level,
            'level_display': w.get_level_display(),
            'status': w.status,
            'status_display': w.get_status_display(),
            'response_minutes': round(mins, 1),
            'created_at': timezone.localtime(w.created_at).strftime('%Y-%m-%d %H:%M'),
        })
    slow_list.sort(key=lambda x: x['response_minutes'], reverse=True)
    slow_responses = slow_list[:10]

    return Response({
        'year': year,
        'generated_at': now.strftime('%Y-%m-%d %H:%M:%S'),
        'summary': {
            'avg_response_minutes': avg_response or 0,
            'response_improve_pct': response_improve_pct,
            'avg_closure_hours': avg_closure or 0,
            'closure_improve_pct': closure_improve_pct,
            'closure_rate': closure_rate,
            'closure_rate_delta': closure_rate_delta,
            'year_closure_rate': year_closure_rate,
            'inspect_coverage': inspect_coverage,
            'coverage_delta': coverage_delta,
            'hazards_covered': covered,
            'hazard_total': hazard_total,
            'confirm_rate': confirm_rate,
            'inspect_ontime_rate': inspect_ontime_rate,
            'avg_inspect_duration': avg_inspect_duration,
            'evacuation_complete_rate': evacuation_complete_rate,
            'people_transfer_rate': people_transfer_rate,
            'device_online_rate': device_online_rate,
            'device_online': device_online,
            'device_total': device_total,
            'month_warnings': warnings_month.count() if cur_month else warn_total_y,
            'sample_response_count': len(resp_m) if cur_month else len(resp_y),
            'sample_closure_count': len(close_m) if cur_month else len(close_y),
        },
        'monthly_efficiency': monthly,
        'funnel': funnel,
        'slow_responses': slow_responses,
        'loop': {
            'description': (
                '预警创建→确认响应→处置闭环→转移完成→巡查覆盖回写隐患'
            ),
            'metrics': [
                'avg_response_minutes',
                'avg_closure_hours',
                'closure_rate',
                'inspect_coverage',
            ],
        },
    })
