"""IoT 链路统一 TraceId（bridge → HTTP → Django → Celery）"""
from __future__ import annotations

import logging
import uuid
from contextvars import ContextVar
from typing import Any

_trace_id: ContextVar[str] = ContextVar('iot_trace_id', default='')

HEADER_NAME = 'X-Trace-Id'
LOGGER = logging.getLogger('iot.trace')


def new_trace_id() -> str:
    # 短可读：iot- + 12 hex
    return f'iot-{uuid.uuid4().hex[:12]}'


def get_trace_id() -> str:
    return _trace_id.get() or ''


def set_trace_id(trace_id: str | None) -> str:
    tid = (trace_id or '').strip() or new_trace_id()
    _trace_id.set(tid)
    return tid


def extract_trace_id(request=None, payload: dict[str, Any] | None = None, headers: dict | None = None) -> str:
    """从 HTTP Header / 报文字段提取，没有则新建"""
    if request is not None:
        hid = (
            request.headers.get(HEADER_NAME)
            or request.headers.get('X-Request-Id')
            or ''
        ).strip()
        if hid:
            return set_trace_id(hid)
    if headers:
        hid = (headers.get(HEADER_NAME) or headers.get('X-Request-Id') or '').strip()
        if hid:
            return set_trace_id(hid)
    if payload:
        hid = str(payload.get('trace_id') or payload.get('traceId') or '').strip()
        if hid:
            return set_trace_id(hid)
    return set_trace_id(None)


def bind_trace(trace_id: str | None = None) -> str:
    return set_trace_id(trace_id)


def log_event(stage: str, message: str = '', **extra: Any) -> None:
    tid = get_trace_id()
    payload = {'trace_id': tid, 'stage': stage, **extra}
    extra_bits = ' '.join(f'{k}={v}' for k, v in payload.items() if k not in ('trace_id', 'stage') and v is not None)
    LOGGER.info('[%s] stage=%s %s %s', tid, stage, message, extra_bits)


class TraceIdFilter(logging.Filter):
    """挂到 logging handlers，使格式串可用 %(trace_id)s"""

    def filter(self, record: logging.LogRecord) -> bool:
        record.trace_id = get_trace_id() or '-'  # type: ignore[attr-defined]
        return True
