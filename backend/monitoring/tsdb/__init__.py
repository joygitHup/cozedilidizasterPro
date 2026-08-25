"""时序存储门面：postgres | influxdb | tdengine"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from django.conf import settings

logger = logging.getLogger('monitoring.tsdb')


def tsdb_backend() -> str:
    raw = (getattr(settings, 'TSDB_BACKEND', None) or 'postgres').lower().strip()
    if raw in ('influx', 'influxdb2'):
        return 'influxdb'
    return raw


def external_tsdb_enabled() -> bool:
    return tsdb_backend() in ('influxdb', 'tdengine')


def tdengine_enabled() -> bool:
    """兼容旧调用；优先使用 external_tsdb_enabled / tsdb_backend。"""
    return external_tsdb_enabled()


def influxdb_enabled() -> bool:
    return tsdb_backend() == 'influxdb'


def dual_write_pg() -> bool:
    """外部时序库开启时是否仍写 Postgres MonitorData（预警/日聚合兼容）"""
    if not external_tsdb_enabled():
        return True
    return bool(getattr(settings, 'TSDB_DUAL_WRITE', True))


def _driver():
    backend = tsdb_backend()
    if backend == 'influxdb':
        from monitoring.tsdb.influxdb import get_client

        return get_client()
    if backend == 'tdengine':
        from monitoring.tsdb.tdengine import get_client

        return get_client()
    return None


def ensure_schema() -> None:
    client = _driver()
    if client is None:
        return
    client.ensure_schema()


def write_monitor_point(
    *,
    device_id: int,
    device_code: str,
    data_type: str,
    value: float,
    unit: str = '',
    channel: str = '',
    record_time: datetime | None = None,
) -> None:
    client = _driver()
    if client is None:
        return
    client.write_point(
        device_id=device_id,
        device_code=device_code,
        data_type=data_type,
        value=float(value),
        unit=unit or '',
        channel=channel or '',
        record_time=record_time,
    )


def write_monitor_points_batch(rows: list[dict[str, Any]]) -> int:
    client = _driver()
    if client is None or not rows:
        return 0
    return client.write_points_batch(rows)


def query_points(
    *,
    device_id: int | None = None,
    data_type: str | None = None,
    channel: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = 1000,
    order: str = 'asc',
) -> list[dict[str, Any]]:
    client = _driver()
    if client is None:
        return []
    return client.query_points(
        device_id=device_id,
        data_type=data_type,
        channel=channel,
        start=start,
        end=end,
        limit=limit,
        order=order,
    )


def query_points_or_empty(**kwargs) -> list[dict[str, Any]]:
    try:
        return query_points(**kwargs)
    except Exception:  # noqa: BLE001
        return []


def tsdb_query_ok() -> bool:
    if not external_tsdb_enabled():
        return False
    try:
        query_points(limit=1)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning('TSDB probe failed: %s', exc)
        return False


def distinct_data_types(device_id: int) -> list[str]:
    client = _driver()
    if client is None:
        return []
    try:
        return client.distinct_data_types(device_id)
    except Exception:  # noqa: BLE001
        return []


def latest_by_device(device_id: int) -> list[dict[str, Any]]:
    client = _driver()
    if client is None:
        return []
    try:
        return client.latest_by_device(device_id)
    except Exception:  # noqa: BLE001
        return []


def count_points(
    *,
    device_id: int | None = None,
    data_type: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
) -> int:
    client = _driver()
    if client is None:
        return 0
    try:
        return client.count_points(
            device_id=device_id,
            data_type=data_type,
            start=start,
            end=end,
        )
    except Exception:  # noqa: BLE001
        return 0


def use_external_reads() -> bool:
    """是否走外部时序读路径；失败且双写开启时回退 Postgres。"""
    if not external_tsdb_enabled():
        return False
    if dual_write_pg():
        return tsdb_query_ok()
    return True


# 旧名兼容
td_query_ok = tsdb_query_ok
use_tdengine_reads = use_external_reads
