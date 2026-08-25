"""转移路线 / 安置点几何工具（优先真实路网）"""
from __future__ import annotations

import json
import logging
import math
import os
import urllib.error
import urllib.parse
import urllib.request
from decimal import Decimal
from typing import Any, Dict, List, Optional, Sequence, Tuple

logger = logging.getLogger(__name__)


def _f(v) -> float:
    return float(v)


def haversine_km(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def interpolate_route(
    start: Sequence[float],
    end: Sequence[float],
    points: int = 6,
) -> List[List[float]]:
    """兜底：贝塞尔折线"""
    lng1, lat1 = _f(start[0]), _f(start[1])
    lng2, lat2 = _f(end[0]), _f(end[1])
    mid_lng = (lng1 + lng2) / 2 + (lat2 - lat1) * 0.15
    mid_lat = (lat1 + lat2) / 2 - (lng2 - lng1) * 0.15
    coords: List[List[float]] = []
    n = max(points, 2)
    for i in range(n + 1):
        t = i / n
        lng = (1 - t) ** 2 * lng1 + 2 * (1 - t) * t * mid_lng + t ** 2 * lng2
        lat = (1 - t) ** 2 * lat1 + 2 * (1 - t) * t * mid_lat + t ** 2 * lat2
        coords.append([round(lng, 6), round(lat, 6)])
    return coords


def _http_get_json(url: str, timeout: float = 12.0) -> Optional[dict]:
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'LandslideHazardPro/1.0'})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as exc:  # noqa: BLE001
        logger.warning('route http fail: %s', exc)
        return None


def fetch_mapbox_route(start: Sequence[float], end: Sequence[float]) -> Optional[Dict[str, Any]]:
    token = (
        os.getenv('MAPBOX_ACCESS_TOKEN')
        or os.getenv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN')
        or ''
    ).strip()
    if not token:
        return None
    profile = os.getenv('MAPBOX_DIRECTIONS_PROFILE', 'walking')
    coords = f'{_f(start[0])},{_f(start[1])};{_f(end[0])},{_f(end[1])}'
    url = (
        f'https://api.mapbox.com/directions/v5/mapbox/{profile}/{coords}'
        f'?geometries=geojson&overview=full&access_token={urllib.parse.quote(token)}'
    )
    data = _http_get_json(url)
    if not data or not data.get('routes'):
        return None
    route = data['routes'][0]
    geometry = route.get('geometry') or {}
    path = geometry.get('coordinates') or []
    if len(path) < 2:
        return None
    distance_m = float(route.get('distance') or 0)
    duration_s = float(route.get('duration') or 0)
    return {
        'path': [[round(_f(c[0]), 6), round(_f(c[1]), 6)] for c in path],
        'distance_km': round(distance_m / 1000.0, 2),
        'estimated_time': max(5, int(math.ceil(duration_s / 60.0))),
        'provider': 'mapbox',
        'profile': profile,
    }


def fetch_osrm_route(start: Sequence[float], end: Sequence[float]) -> Optional[Dict[str, Any]]:
    base = (os.getenv('OSRM_BASE_URL') or 'https://router.project-osrm.org').rstrip('/')
    profile = os.getenv('OSRM_PROFILE', 'foot')
    coords = f'{_f(start[0])},{_f(start[1])};{_f(end[0])},{_f(end[1])}'
    url = f'{base}/route/v1/{profile}/{coords}?overview=full&geometries=geojson'
    data = _http_get_json(url)
    if not data or data.get('code') != 'Ok' or not data.get('routes'):
        return None
    route = data['routes'][0]
    path = (route.get('geometry') or {}).get('coordinates') or []
    if len(path) < 2:
        return None
    distance_m = float(route.get('distance') or 0)
    duration_s = float(route.get('duration') or 0)
    return {
        'path': [[round(_f(c[0]), 6), round(_f(c[1]), 6)] for c in path],
        'distance_km': round(distance_m / 1000.0, 2),
        'estimated_time': max(5, int(math.ceil(duration_s / 60.0))),
        'provider': 'osrm',
        'profile': profile,
    }


def resolve_route(start: Sequence[float], end: Sequence[float]) -> Dict[str, Any]:
    """Mapbox → OSRM → 插值兜底"""
    prefer = (os.getenv('ROUTE_PROVIDER') or 'auto').lower().strip()
    if prefer in ('mapbox', 'auto'):
        hit = fetch_mapbox_route(start, end)
        if hit:
            return hit
    if prefer in ('osrm', 'auto'):
        hit = fetch_osrm_route(start, end)
        if hit:
            return hit
    path = interpolate_route(start, end)
    dist = path_distance_km(path)
    return {
        'path': path,
        'distance_km': dist,
        'estimated_time': estimate_minutes(dist),
        'provider': 'interpolate',
        'profile': 'demo',
    }


def path_distance_km(path: Sequence[Sequence[float]]) -> float:
    if not path or len(path) < 2:
        return 0.0
    total = 0.0
    for i in range(1, len(path)):
        total += haversine_km(
            _f(path[i - 1][0]), _f(path[i - 1][1]),
            _f(path[i][0]), _f(path[i][1]),
        )
    return round(total, 2)


def estimate_minutes(distance_km: float, speed_kmh: float = 4.0) -> int:
    if distance_km <= 0:
        return 0
    return max(5, int(math.ceil(distance_km / speed_kmh * 60)))


def default_shelter_offset(lng: float, lat: float, idx: int = 0) -> Tuple[float, float]:
    dx = 0.018 + (idx % 3) * 0.004
    dy = 0.012 - (idx % 2) * 0.003
    return round(lng + dx, 6), round(lat + dy, 6)


def ensure_task_geometry(task, *, force_reroute: bool = False) -> None:
    """补全路线与安置点坐标；优先真实路网"""
    point = task.hazard_point
    start = [_f(point.longitude), _f(point.latitude)]
    if task.shelter_longitude is not None and task.shelter_latitude is not None:
        end = [_f(task.shelter_longitude), _f(task.shelter_latitude)]
    else:
        end = list(default_shelter_offset(start[0], start[1], task.id or 0))
        task.shelter_longitude = Decimal(str(end[0]))
        task.shelter_latitude = Decimal(str(end[1]))

    path = task.route_path
    need = force_reroute or not isinstance(path, list) or len(path) < 2
    meta = getattr(task, 'route_meta', None) if hasattr(task, 'route_meta') else None
    if need or (isinstance(path, list) and len(path) <= 8 and not force_reroute):
        # 短折线多半是旧演示数据，尝试升级为真实路网
        if need or (isinstance(path, list) and len(path) <= 8):
            routed = resolve_route(start, end)
            task.route_path = routed['path']
            task.route_distance = Decimal(str(routed['distance_km']))
            task.estimated_time = int(routed['estimated_time'])
            if hasattr(task, 'route_provider'):
                task.route_provider = str(routed.get('provider') or '')
            logger.info(
                'route task=%s provider=%s dist=%s points=%s',
                getattr(task, 'code', ''),
                routed.get('provider'),
                routed.get('distance_km'),
                len(routed.get('path') or []),
            )
            return

    dist = path_distance_km(task.route_path)
    if not task.route_distance or float(task.route_distance) <= 0:
        task.route_distance = Decimal(str(dist))
    if not task.estimated_time:
        task.estimated_time = estimate_minutes(dist)


def task_to_geo_features(task) -> List[Dict[str, Any]]:
    ensure_task_geometry(task)
    point = task.hazard_point
    features: List[Dict[str, Any]] = []
    features.append({
        'type': 'Feature',
        'geometry': {
            'type': 'Point',
            'coordinates': [_f(point.longitude), _f(point.latitude)],
        },
        'properties': {
            'kind': 'hazard',
            'task_id': task.id,
            'task_code': task.code,
            'name': point.name,
            'code': point.code,
            'level': point.level,
            'status': task.status,
        },
    })
    if task.shelter_longitude is not None and task.shelter_latitude is not None:
        features.append({
            'type': 'Feature',
            'geometry': {
                'type': 'Point',
                'coordinates': [
                    _f(task.shelter_longitude),
                    _f(task.shelter_latitude),
                ],
            },
            'properties': {
                'kind': 'shelter',
                'task_id': task.id,
                'task_code': task.code,
                'name': task.shelter_name or '安置点',
                'address': task.shelter_address or '',
                'status': task.status,
            },
        })
    path = task.route_path if isinstance(task.route_path, list) else []
    if len(path) >= 2:
        features.append({
            'type': 'Feature',
            'geometry': {
                'type': 'LineString',
                'coordinates': [[_f(c[0]), _f(c[1])] for c in path if len(c) >= 2],
            },
            'properties': {
                'kind': 'route',
                'task_id': task.id,
                'task_code': task.code,
                'name': f'{point.name} → {task.shelter_name or "安置点"}',
                'distance_km': float(task.route_distance or 0),
                'estimated_time': task.estimated_time,
                'status': task.status,
            },
        })
    return features


def build_map_geojson(tasks) -> Dict[str, Any]:
    features: List[Dict[str, Any]] = []
    seen_shelters = set()
    for task in tasks:
        for feat in task_to_geo_features(task):
            if feat['properties'].get('kind') == 'shelter':
                key = feat['properties'].get('name')
                if key in seen_shelters:
                    continue
                seen_shelters.add(key)
            features.append(feat)
    return {'type': 'FeatureCollection', 'features': features}
