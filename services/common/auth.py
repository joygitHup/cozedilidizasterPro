"""JWT auth compatible with Django SIMPLE_JWT (HS256 + DJANGO_SECRET_KEY)."""
from __future__ import annotations

from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from common.config import DJANGO_SECRET_KEY

_bearer = HTTPBearer(auto_error=False)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            DJANGO_SECRET_KEY,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效或已过期的访问令牌",
        ) from exc
    if payload.get("token_type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="需要 access token",
        )
    return payload


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供认证信息",
        )
    return decode_access_token(credentials.credentials)


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any] | None:
    if credentials is None or not credentials.credentials:
        return None
    try:
        return decode_access_token(credentials.credentials)
    except HTTPException:
        return None


def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> int:
    payload = get_current_user(credentials)
    uid = payload.get("user_id")
    if uid is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 缺少 user_id",
        )
    return int(uid)


def optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> int | None:
    payload = get_optional_user(credentials)
    if not payload:
        return None
    uid = payload.get("user_id")
    return int(uid) if uid is not None else None
