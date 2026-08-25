"""网关能力（限流 / 审计）— Django 侧落地，后续可迁 Kong。"""
from __future__ import annotations

import logging
import time
import uuid
from typing import Iterable

from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse

logger = logging.getLogger('gateway.audit')


def trust_x_forwarded() -> bool:
    return bool(
        getattr(settings, 'GATEWAY_TRUST_X_FORWARDED', False)
        or getattr(settings, 'MQTT_INGEST_TRUST_X_FORWARDED', False)
    )


def client_ip(request) -> str:
    if trust_x_forwarded():
        forwarded = (request.META.get('HTTP_X_FORWARDED_FOR') or '').split(',')[0].strip()
        if forwarded:
            return forwarded
        real_ip = (request.META.get('HTTP_X_REAL_IP') or '').strip()
        if real_ip:
            return real_ip
    return (request.META.get('REMOTE_ADDR') or '').strip()


def request_id(request) -> str:
    rid = getattr(request, 'gateway_request_id', None)
    if rid:
        return rid
    incoming = (request.headers.get('X-Request-ID') or '').strip()[:64]
    rid = incoming or uuid.uuid4().hex[:16]
    request.gateway_request_id = rid
    return rid


def _path_matched(path: str, prefixes: Iterable[str]) -> bool:
    for p in prefixes:
        p = (p or '').strip()
        if not p:
            continue
        if path == p or path.startswith(p.rstrip('/') + '/') or path.startswith(p):
            return True
    return False


def should_rate_limit(request) -> bool:
    if not getattr(settings, 'GATEWAY_RATE_LIMIT_ENABLED', True):
        return False
    path = request.path or ''
    if not path.startswith('/api/'):
        return False
    skip = getattr(settings, 'GATEWAY_RATE_LIMIT_SKIP_PREFIXES', None) or [
        '/api/monitoring/ingest/',
    ]
    if path.rstrip('/') == '/api' or path == '/api/':
        return False
    return not _path_matched(path, skip)


def rate_limit_key(request) -> str:
    user = getattr(request, 'user', None)
    if user is not None and getattr(user, 'is_authenticated', False):
        return f'u:{user.pk}'
    return f'ip:{client_ip(request) or "unknown"}'


def check_rate_limit(request) -> tuple[bool, int, int]:
    """
    返回 (allowed, limit, remaining)。
    固定窗口：仅首次建 key 时设置过期，避免持续请求导致计数窗口被不断续期、永不归零。
    """
    path = request.path or ''
    if path.startswith('/api/users/login'):
        limit = int(getattr(settings, 'GATEWAY_LOGIN_RATE_LIMIT', 30) or 0)
        window = int(getattr(settings, 'GATEWAY_LOGIN_RATE_WINDOW', 60) or 60)
        bucket = 'login'
    else:
        limit = int(getattr(settings, 'GATEWAY_API_RATE_LIMIT', 300) or 0)
        window = int(getattr(settings, 'GATEWAY_API_RATE_WINDOW', 60) or 60)
        bucket = 'api'
    if limit <= 0:
        return True, 0, 0

    key = f'gw:rl:{bucket}:{rate_limit_key(request)}'
    try:
        # 仅首次写入设置 TTL；后续 incr 不刷新过期时间
        if cache.add(key, 1, timeout=window):
            return True, limit, max(0, limit - 1)
        try:
            n = int(cache.incr(key))
        except ValueError:
            cache.set(key, 1, timeout=window)
            n = 1
        return n <= limit, limit, max(0, limit - n)
    except Exception as exc:  # noqa: BLE001
        logger.warning('rate limit cache failed: %s', exc)
        return True, limit, limit


def should_audit(request, status_code: int | None = None) -> bool:
    if not getattr(settings, 'GATEWAY_AUDIT_ENABLED', True):
        return False
    path = request.path or ''
    if not path.startswith('/api/'):
        return False
    skip = getattr(settings, 'GATEWAY_AUDIT_SKIP_PREFIXES', None) or [
        '/api/monitoring/ingest/',
    ]
    if _path_matched(path, skip):
        return False
    if getattr(settings, 'GATEWAY_AUDIT_ALL', False):
        return True
    method = (request.method or 'GET').upper()
    if method in ('POST', 'PUT', 'PATCH', 'DELETE'):
        return True
    if status_code is not None and status_code >= 400:
        return True
    return False


def write_audit(request, response, duration_ms: int) -> None:
    status_code = getattr(response, 'status_code', 0) or 0
    if not should_audit(request, status_code):
        return

    rid = request_id(request)
    user = getattr(request, 'user', None)
    username = ''
    user_id = None
    if user is not None and getattr(user, 'is_authenticated', False):
        username = getattr(user, 'username', '') or ''
        user_id = getattr(user, 'pk', None)

    ip = client_ip(request)
    method = (request.method or '').upper()
    path = (request.path or '')[:300]
    query = (request.META.get('QUERY_STRING') or '')[:300]
    ua = (request.META.get('HTTP_USER_AGENT') or '')[:300]

    logger.info(
        'audit method=%s path=%s status=%s user=%s ip=%s duration_ms=%s rid=%s',
        method,
        path,
        status_code,
        username or '-',
        ip or '-',
        duration_ms,
        rid,
    )

    if not getattr(settings, 'GATEWAY_AUDIT_DB', True):
        return
    try:
        from users.models import ApiAuditLog

        ApiAuditLog.objects.create(
            request_id=rid,
            user_id=user_id,
            username=username[:150],
            ip=ip[:64],
            method=method[:10],
            path=path,
            query=query,
            status_code=status_code,
            duration_ms=max(0, int(duration_ms)),
            user_agent=ua,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning('audit db write failed: %s', exc)


class ApiRateLimitMiddleware:
    """API 全局限流（Redis/缓存）；ingest 走专用限流，默认跳过。"""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id(request)
        if should_rate_limit(request):
            allowed, limit, remaining = check_rate_limit(request)
            if not allowed:
                resp = JsonResponse(
                    {'detail': '请求过于频繁，请稍后再试', 'code': 'rate_limited'},
                    status=429,
                )
                resp['Retry-After'] = str(
                    int(getattr(settings, 'GATEWAY_API_RATE_WINDOW', 60) or 60)
                )
                if limit:
                    resp['X-RateLimit-Limit'] = str(limit)
                    resp['X-RateLimit-Remaining'] = '0'
                resp['X-Request-ID'] = request_id(request)
                write_audit(request, resp, 0)
                return resp
            request.gateway_rate_limit = (limit, remaining)

        response = self.get_response(request)
        lim = getattr(request, 'gateway_rate_limit', None)
        if lim:
            response['X-RateLimit-Limit'] = str(lim[0])
            response['X-RateLimit-Remaining'] = str(lim[1])
        response['X-Request-ID'] = request_id(request)
        return response


class ApiAuditMiddleware:
    """API 审计：写操作 + 4xx/5xx（可 GATEWAY_AUDIT_ALL=true 全量）。"""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id(request)
        t0 = time.monotonic()
        response = self.get_response(request)
        duration_ms = int((time.monotonic() - t0) * 1000)
        write_audit(request, response, duration_ms)
        if hasattr(response, '__setitem__'):
            response['X-Request-ID'] = request_id(request)
        return response
