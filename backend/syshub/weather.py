"""天气：Open-Meteo 实况（无需 Key）+ 本地缓存"""
from __future__ import annotations

import json
import logging
import os
import urllib.parse
import urllib.request
from typing import Any

logger = logging.getLogger(__name__)

# WMO weathercode → 文案/图标
_WMO = {
    0: ('晴', 'sunny'),
    1: ('晴间多云', 'sunny'),
    2: ('多云', 'cloudy'),
    3: ('阴', 'cloudy'),
    45: ('雾', 'fog'),
    48: ('雾凇', 'fog'),
    51: ('小毛毛雨', 'rain'),
    53: ('毛毛雨', 'rain'),
    55: ('强毛毛雨', 'rain'),
    61: ('小雨', 'rain'),
    63: ('中雨', 'rain'),
    65: ('大雨', 'rain'),
    71: ('小雪', 'snow'),
    73: ('中雪', 'snow'),
    75: ('大雪', 'snow'),
    80: ('阵雨', 'rain'),
    81: ('强阵雨', 'rain'),
    82: ('暴雨', 'storm'),
    95: ('雷暴', 'storm'),
    96: ('雷暴伴冰雹', 'storm'),
    99: ('强雷暴冰雹', 'storm'),
}


def _http_get_json(url: str, timeout: float = 8.0) -> dict | None:
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'LandslideHazardPro/1.0'})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as exc:  # noqa: BLE001
        logger.warning('weather fetch fail: %s', exc)
        return None


def resolve_coords(cfg) -> tuple[float, float]:
    extra = cfg.extra if isinstance(cfg.extra, dict) else {}
    lat = extra.get('weather_lat')
    lng = extra.get('weather_lng')
    if lat is not None and lng is not None:
        try:
            return float(lat), float(lng)
        except (TypeError, ValueError):
            pass
    # 环境变量或默认四川某县
    try:
        return (
            float(os.getenv('WEATHER_LAT', '30.67')),
            float(os.getenv('WEATHER_LNG', '104.06')),
        )
    except ValueError:
        return 30.67, 104.06


def fetch_open_meteo(lat: float, lng: float) -> dict[str, Any] | None:
    qs = urllib.parse.urlencode({
        'latitude': lat,
        'longitude': lng,
        'current': 'temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m',
        'timezone': 'Asia/Shanghai',
    })
    data = _http_get_json(f'https://api.open-meteo.com/v1/forecast?{qs}')
    if not data or 'current' not in data:
        return None
    cur = data['current']
    code = int(cur.get('weather_code') or 0)
    text, icon = _WMO.get(code, ('多云', 'cloudy'))
    return {
        'text': text,
        'temp_c': int(round(float(cur.get('temperature_2m') or 0))),
        'icon': icon,
        'weather_code': code,
        'wind_kmh': round(float(cur.get('wind_speed_10m') or 0), 1),
        'humidity': int(cur.get('relative_humidity_2m') or 0),
        'provider': 'open-meteo',
        'latitude': lat,
        'longitude': lng,
    }


def refresh_weather(cfg, *, force: bool = False) -> dict[str, Any]:
    """拉取并写回 SystemConfig；失败则返回缓存"""
    from django.utils import timezone

    extra = dict(cfg.extra) if isinstance(cfg.extra, dict) else {}
    cached_at = extra.get('weather_fetched_at')
    if not force and cached_at:
        try:
            from datetime import datetime

            ts = datetime.fromisoformat(str(cached_at).replace('Z', '+00:00'))
            if timezone.is_naive(ts):
                ts = timezone.make_aware(ts)
            age = (timezone.now() - ts).total_seconds()
            if age < int(os.getenv('WEATHER_CACHE_SEC', '1800')):
                return {
                    'text': cfg.weather_text,
                    'temp_c': cfg.weather_temp_c,
                    'icon': cfg.weather_icon,
                    'provider': extra.get('weather_provider') or 'cache',
                    'wind_kmh': extra.get('weather_wind_kmh'),
                    'humidity': extra.get('weather_humidity'),
                    'cached': True,
                    'updated_at': cfg.updated_at,
                }
        except Exception:  # noqa: BLE001
            pass

    lat, lng = resolve_coords(cfg)
    live = fetch_open_meteo(lat, lng)
    if live:
        cfg.weather_text = live['text']
        cfg.weather_temp_c = live['temp_c']
        cfg.weather_icon = live['icon']
        extra.update({
            'weather_lat': lat,
            'weather_lng': lng,
            'weather_provider': live['provider'],
            'weather_wind_kmh': live.get('wind_kmh'),
            'weather_humidity': live.get('humidity'),
            'weather_fetched_at': timezone.now().isoformat(),
        })
        cfg.extra = extra
        cfg.save(update_fields=[
            'weather_text', 'weather_temp_c', 'weather_icon', 'extra', 'updated_at',
        ])
        return {
            **live,
            'cached': False,
            'updated_at': cfg.updated_at,
        }

    return {
        'text': cfg.weather_text,
        'temp_c': cfg.weather_temp_c,
        'icon': cfg.weather_icon,
        'provider': 'fallback',
        'cached': True,
        'error': '实况拉取失败，已返回本地缓存',
        'updated_at': cfg.updated_at,
    }
