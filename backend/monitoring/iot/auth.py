"""Ingest API 鉴权：Token + 可选 IP 白名单 + 简易限流"""
from __future__ import annotations

import hmac
import ipaddress
import logging
from typing import Iterable

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

DEFAULT_DEV_TOKEN = 'dev-mqtt-ingest-token'


def _configured_tokens() -> list[str]:
    raw = (getattr(settings, 'MQTT_INGEST_TOKENS', '') or '').strip()
    single = (getattr(settings, 'MQTT_INGEST_TOKEN', '') or '').strip()
    tokens: list[str] = []
    if raw:
        tokens.extend(t.strip() for t in raw.split(',') if t.strip())
    if single and single not in tokens:
        tokens.append(single)
    return tokens


def ingest_auth_errors() -> list[str]:
    """启动/自检用：生产配置问题"""
    errors: list[str] = []
    tokens = _configured_tokens()
    debug = bool(getattr(settings, 'DEBUG', True))
    if not tokens:
        errors.append('未配置 MQTT_INGEST_TOKEN / MQTT_INGEST_TOKENS')
    if not debug and any(t == DEFAULT_DEV_TOKEN for t in tokens):
        errors.append('生产环境禁止使用默认 Token dev-mqtt-ingest-token，请在 .env 更换')
    return errors


def extract_ingest_token(request) -> str:
    # 优先专用头，避免浏览器带 JWT Authorization 时误当 ingest token
    dedicated = (request.headers.get('X-Ingest-Token', '') or '').strip()
    if dedicated:
        return dedicated
    auth = request.headers.get('Authorization', '') or ''
    if auth.startswith('Bearer '):
        return auth[7:].strip()
    return ''


def _client_ip(request) -> str:
    # 仅信任直接对端；若前置反代需自行配 REAL_IP，避免伪造 X-Forwarded-For
    trust_fwd = bool(getattr(settings, 'MQTT_INGEST_TRUST_X_FORWARDED', False))
    if trust_fwd:
        forwarded = (request.META.get('HTTP_X_FORWARDED_FOR') or '').split(',')[0].strip()
        if forwarded:
            return forwarded
    return (request.META.get('REMOTE_ADDR') or '').strip()


def _ip_allowed(ip: str, allowlist: Iterable[str]) -> bool:
    if not allowlist:
        return True
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    for item in allowlist:
        item = (item or '').strip()
        if not item:
            continue
        try:
            if '/' in item:
                if addr in ipaddress.ip_network(item, strict=False):
                    return True
            elif addr == ipaddress.ip_address(item):
                return True
        except ValueError:
            continue
    return False


def _rate_limited(ip: str, token_fp: str) -> bool:
    limit = int(getattr(settings, 'MQTT_INGEST_RATE_LIMIT', 120) or 0)
    if limit <= 0:
        return False
    window = int(getattr(settings, 'MQTT_INGEST_RATE_WINDOW', 60) or 60)
    key = f'iot:ingest_rl:{token_fp}:{ip or "unknown"}'
    try:
        n = cache.get(key)
        if n is None:
            cache.set(key, 1, timeout=window)
            return False
        n = int(n) + 1
        cache.set(key, n, timeout=window)
        return n > limit
    except Exception:  # noqa: BLE001
        return False


def authorize_ingest(request) -> tuple[bool, str, int]:
    """
    返回 (ok, detail, http_status)

    默认强制 Token；仅当 MQTT_INGEST_ALLOW_DEBUG_BYPASS=true 且 DEBUG 时允许无 Token 放行。
    """
    debug = bool(getattr(settings, 'DEBUG', True))
    tokens = _configured_tokens()
    allow_bypass = bool(getattr(settings, 'MQTT_INGEST_ALLOW_DEBUG_BYPASS', False))

    if not tokens:
        if debug and allow_bypass:
            logger.warning(
                'MQTT ingest token 未配置，已按 MQTT_INGEST_ALLOW_DEBUG_BYPASS 临时放行（勿用于现场）'
            )
            return True, '', 200
        return False, '服务未配置 ingest token（请设置 MQTT_INGEST_TOKEN）', 503

    if not debug and any(t == DEFAULT_DEV_TOKEN for t in tokens):
        return False, '生产环境拒绝默认 ingest token，请更换 MQTT_INGEST_TOKEN', 503

    provided = extract_ingest_token(request)
    if not provided or not any(hmac.compare_digest(provided, t) for t in tokens):
        return False, '无效 ingest token', 401

    allow_raw = (getattr(settings, 'MQTT_INGEST_ALLOW_IPS', '') or '').strip()
    allowlist = [x.strip() for x in allow_raw.split(',') if x.strip()]
    ip = _client_ip(request)
    if allowlist and not _ip_allowed(ip, allowlist):
        logger.warning('ingest IP 拒绝: %s', ip)
        return False, '来源 IP 不在白名单', 403

    token_fp = provided[:6]
    if _rate_limited(ip, token_fp):
        return False, '请求过于频繁', 429

    return True, '', 200
