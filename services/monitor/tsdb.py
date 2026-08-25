"""InfluxDB / Postgres TSDB facade."""
from __future__ import annotations

import atexit
import logging
import threading
from datetime import datetime, timezone as dt_timezone
from typing import Any

from common.config import external_tsdb_enabled, influxdb_config, tsdb_backend, tsdb_dual_write

logger = logging.getLogger("monitor.tsdb")

_client_lock = threading.Lock()
_client: "InfluxMonitorClient | None" = None

MEASUREMENT = "monitor_points"


def dual_write_pg() -> bool:
    return tsdb_dual_write()


def tsdb_query_ok() -> bool:
    if not external_tsdb_enabled():
        return False
    try:
        query_points(limit=1)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("TSDB probe failed: %s", exc)
        return False


def use_external_reads() -> bool:
    if not external_tsdb_enabled():
        return False
    if dual_write_pg():
        return tsdb_query_ok()
    return True


def _to_utc(dt: datetime | None) -> datetime:
    if dt is None:
        return datetime.now(dt_timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=dt_timezone.utc)
    return dt.astimezone(dt_timezone.utc)


def _flux_time(dt: datetime | None) -> str:
    return _to_utc(dt).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


class InfluxMonitorClient:
    def __init__(self) -> None:
        self._cfg = influxdb_config()
        self._client = None
        self._write_api = None
        self._query_api = None

    def connect(self):
        if self._client is not None:
            return self._client
        from influxdb_client import InfluxDBClient
        from influxdb_client.client.write_api import SYNCHRONOUS

        self._client = InfluxDBClient(
            url=self._cfg["URL"],
            token=self._cfg["TOKEN"],
            org=self._cfg["ORG"],
            timeout=int(self._cfg.get("TIMEOUT_MS", 10000)),
        )
        self._write_api = self._client.write_api(write_options=SYNCHRONOUS)
        self._query_api = self._client.query_api()
        return self._client

    def close(self) -> None:
        if self._client is None:
            return
        try:
            self._client.close()
        except Exception:  # noqa: BLE001
            pass
        self._client = None
        self._write_api = None
        self._query_api = None

    def _point(
        self,
        *,
        device_id: int,
        device_code: str,
        data_type: str,
        value: float,
        unit: str = "",
        channel: str = "",
        record_time: datetime | None = None,
    ):
        from influxdb_client import Point

        return (
            Point(MEASUREMENT)
            .tag("device_id", str(int(device_id)))
            .tag("device_code", device_code or "")
            .tag("data_type", data_type or "")
            .tag("channel", channel or "_")
            .tag("unit", (unit or "")[:64])
            .field("value", float(value))
            .time(_to_utc(record_time))
        )

    def write_point(
        self,
        *,
        device_id: int,
        device_code: str,
        data_type: str,
        value: float,
        unit: str = "",
        channel: str = "",
        record_time: datetime | None = None,
    ) -> None:
        self.connect()
        self._write_api.write(
            bucket=self._cfg["BUCKET"],
            org=self._cfg["ORG"],
            record=self._point(
                device_id=device_id,
                device_code=device_code,
                data_type=data_type,
                value=value,
                unit=unit,
                channel=channel,
                record_time=record_time,
            ),
        )

    def query_points(
        self,
        *,
        device_id: int | None = None,
        data_type: str | None = None,
        channel: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 1000,
        order: str = "asc",
    ) -> list[dict[str, Any]]:
        self.connect()
        start_s = _flux_time(start) if start else "-30d"
        stop_s = _flux_time(end) if end else "now()"
        start_expr = f'time(v: "{start_s}")' if start else start_s
        stop_expr = f'time(v: "{stop_s}")' if end else stop_s

        parts = [f'r._measurement == "{MEASUREMENT}"']
        if device_id is not None:
            parts.append(f'r.device_id == "{int(device_id)}"')
        if data_type:
            parts.append(f'r.data_type == "{data_type}"')
        if channel is not None and channel != "":
            parts.append(f'r.channel == "{channel}"')
        filt = " and ".join(parts)
        lim = max(1, min(int(limit), 5000))
        flux = f'''
from(bucket: "{self._cfg['BUCKET']}")
  |> range(start: {start_expr}, stop: {stop_expr})
  |> filter(fn: (r) => {filt})
  |> filter(fn: (r) => r._field == "value")
  |> sort(columns: ["_time"], desc: {"true" if order.lower() == "desc" else "false"})
  |> limit(n: {lim})
'''
        tables = self._query_api.query(flux, org=self._cfg["ORG"])
        rows: list[dict[str, Any]] = []
        for table in tables:
            for rec in table.records:
                val = rec.get_value()
                ch = rec.values.get("channel") or ""
                if ch == "_":
                    ch = ""
                rows.append(
                    {
                        "ts": rec.get_time(),
                        "record_time": rec.get_time(),
                        "value": float(val) if val is not None else None,
                        "unit": rec.values.get("unit") or "",
                        "device_id": int(rec.values["device_id"])
                        if rec.values.get("device_id") is not None
                        else None,
                        "device_code": rec.values.get("device_code") or "",
                        "data_type": rec.values.get("data_type") or "",
                        "channel": ch,
                    }
                )
        return rows

    def distinct_data_types(self, device_id: int) -> list[str]:
        self.connect()
        flux = f'''
from(bucket: "{self._cfg['BUCKET']}")
  |> range(start: -365d)
  |> filter(fn: (r) => r._measurement == "{MEASUREMENT}" and r.device_id == "{int(device_id)}" and r._field == "value")
  |> keep(columns: ["data_type"])
  |> distinct(column: "data_type")
'''
        tables = self._query_api.query(flux, org=self._cfg["ORG"])
        out: list[str] = []
        for table in tables:
            for rec in table.records:
                v = rec.values.get("data_type") or rec.get_value()
                if v and str(v) not in out:
                    out.append(str(v))
        return out


def get_client() -> InfluxMonitorClient:
    global _client
    with _client_lock:
        if _client is None:
            _client = InfluxMonitorClient()
            atexit.register(_client.close)
        return _client


def write_monitor_point(
    *,
    device_id: int,
    device_code: str,
    data_type: str,
    value: float,
    unit: str = "",
    channel: str = "",
    record_time: datetime | None = None,
) -> None:
    if tsdb_backend() != "influxdb":
        return
    get_client().write_point(
        device_id=device_id,
        device_code=device_code,
        data_type=data_type,
        value=float(value),
        unit=unit or "",
        channel=channel or "",
        record_time=record_time,
    )


def query_points(**kwargs) -> list[dict[str, Any]]:
    if tsdb_backend() != "influxdb":
        return []
    return get_client().query_points(**kwargs)


def distinct_data_types(device_id: int) -> list[str]:
    if tsdb_backend() != "influxdb":
        return []
    try:
        return get_client().distinct_data_types(device_id)
    except Exception:  # noqa: BLE001
        return []
