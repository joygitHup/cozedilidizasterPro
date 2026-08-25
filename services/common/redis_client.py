"""Redis client wrapper (JSON values, django_redis-compatible key prefix)."""
from __future__ import annotations

import json
from typing import Any

import redis

from common.config import REDIS_KEY_PREFIX, REDIS_URL

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(REDIS_URL, decode_responses=True)
    return _client


def _key(name: str) -> str:
    if REDIS_KEY_PREFIX and not name.startswith(f"{REDIS_KEY_PREFIX}:"):
        return f"{REDIS_KEY_PREFIX}:{name}"
    return name


class RedisCache:
    """Minimal cache interface used by WarningEngine."""

    def get(self, key: str) -> Any:
        raw = get_redis().get(_key(key))
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            return raw

    def set(self, key: str, value: Any, timeout: int | None = None) -> None:
        payload = json.dumps(value, ensure_ascii=False, default=str)
        get_redis().set(_key(key), payload, ex=timeout)

    def delete(self, key: str) -> None:
        get_redis().delete(_key(key))

    def incr(self, key: str, timeout: int | None = None) -> int | None:
        try:
            r = get_redis()
            pk = _key(key)
            n = r.incr(pk)
            if timeout and n == 1:
                r.expire(pk, timeout)
            return int(n)
        except redis.RedisError:
            return None


cache = RedisCache()


def get(key: str) -> Any:
    return cache.get(key)


def set(key: str, value: Any, *, ttl: int | None = None) -> bool:
    try:
        cache.set(key, value, timeout=ttl)
        return True
    except redis.RedisError:
        return False


def delete(key: str) -> bool:
    try:
        cache.delete(key)
        return True
    except redis.RedisError:
        return False


def incr(key: str, *, ttl: int | None = None) -> int | None:
    return cache.incr(key, timeout=ttl)
