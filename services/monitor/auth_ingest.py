"""Ingest API auth — port of backend/monitoring/iot/auth.py."""
from __future__ import annotations

import hmac
import ipaddress
import logging
import os
from typing import Iterable

from fastapi import Request

from common import redis_client
from common.config import (
    debug,
    mqtt_ingest_allow_ips,
    mqtt_ingest_rate_limit,
    mqtt_ingest_rate_window,
    mqtt_ingest_tokens,
    mqtt_ingest_trust_x_forwarded,
)

logger = logging.getLogger(__name__)

DEFAULT_DEV_TOKEN = "dev-mqtt-ingest-token"


def extract_ingest_token(request: Request) -> str:
    dedicated = (request.headers.get("X-Ingest-Token") or "").strip()
    if dedicated:
        return dedicated
    auth = request.headers.get("Authorization") or ""
    if auth.startswith("Bearer "):
        return auth[7:].strip()
    return ""


def _client_ip(request: Request) -> str:
    if mqtt_ingest_trust_x_forwarded():
        forwarded = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
        if forwarded:
            return forwarded
    if request.client:
        return request.client.host
    return ""


def _ip_allowed(ip: str, allowlist: Iterable[str]) -> bool:
    if not allowlist:
        return True
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    for item in allowlist:
        item = (item or "").strip()
        if not item:
            continue
        try:
            if "/" in item:
                if addr in ipaddress.ip_network(item, strict=False):
                    return True
            elif addr == ipaddress.ip_address(item):
                return True
        except ValueError:
            continue
    return False


def _rate_limited(ip: str, token_fp: str) -> bool:
    limit = mqtt_ingest_rate_limit()
    if limit <= 0:
        return False
    window = mqtt_ingest_rate_window()
    key = f"iot:ingest_rl:{token_fp}:{ip or 'unknown'}"
    n = redis_client.incr(key, ttl=window)
    if n is None:
        return False
    return n > limit


def authorize_ingest(request: Request) -> tuple[bool, str, int]:
    tokens = mqtt_ingest_tokens()
    allow_bypass = os.getenv("MQTT_INGEST_ALLOW_DEBUG_BYPASS", "false").lower() in (
        "1",
        "true",
        "yes",
    )

    if not tokens:
        if debug() and allow_bypass:
            logger.warning(
                "MQTT ingest token 未配置，已按 MQTT_INGEST_ALLOW_DEBUG_BYPASS 临时放行（勿用于现场）"
            )
            return True, "", 200
        return False, "服务未配置 ingest token（请设置 MQTT_INGEST_TOKEN）", 503

    if not debug() and any(t == DEFAULT_DEV_TOKEN for t in tokens):
        return False, "生产环境拒绝默认 ingest token，请更换 MQTT_INGEST_TOKEN", 503

    provided = extract_ingest_token(request)
    if not provided or not any(hmac.compare_digest(provided, t) for t in tokens):
        return False, "无效 ingest token", 401

    allowlist = mqtt_ingest_allow_ips()
    ip = _client_ip(request)
    if allowlist and not _ip_allowed(ip, allowlist):
        logger.warning("ingest IP 拒绝: %s", ip)
        return False, "来源 IP 不在白名单", 403

    token_fp = provided[:6]
    if _rate_limited(ip, token_fp):
        return False, "请求过于频繁", 429

    return True, "", 200
