"""InfluxDB 2.x 监测时序客户端"""
from __future__ import annotations

import atexit
import logging
import threading
from datetime import datetime, timezone as dt_timezone
from typing import Any

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger('monitoring.tsdb')

_client_lock = threading.Lock()
_client: 'InfluxMonitorClient | None' = None

MEASUREMENT = 'monitor_points'


def _to_utc(dt: datetime | None) -> datetime:
    if dt is None:
        return datetime.now(dt_timezone.utc)
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt.astimezone(dt_timezone.utc)


def _flux_time(dt: datetime | None) -> str:
    return _to_utc(dt).strftime('%Y-%m-%dT%H:%M:%S.%fZ')


class InfluxMonitorClient:
    def __init__(self) -> None:
        self._cfg = settings.INFLUXDB_CONFIG
        self._client = None
        self._write_api = None
        self._query_api = None

    def connect(self):
        if self._client is not None:
            return self._client
        from influxdb_client import InfluxDBClient
        from influxdb_client.client.write_api import SYNCHRONOUS

        self._client = InfluxDBClient(
            url=self._cfg['URL'],
            token=self._cfg['TOKEN'],
            org=self._cfg['ORG'],
            timeout=int(self._cfg.get('TIMEOUT_MS', 10000)),
        )
        self._write_api = self._client.write_api(write_options=SYNCHRONOUS)
        self._query_api = self._client.query_api()
        logger.info('Connected to InfluxDB %s org=%s', self._cfg['URL'], self._cfg['ORG'])
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

    def ensure_schema(self) -> None:
        """InfluxDB 2 桶在 docker init 时创建；此处做连通探测。"""
        self.connect()
        # ping
        ready = self._client.ping()
        if not ready:
            raise RuntimeError(f'InfluxDB not ready: {self._cfg["URL"]}')
        logger.info(
            'InfluxDB ready: bucket=%s measurement=%s',
            self._cfg['BUCKET'],
            MEASUREMENT,
        )

    def _point(
        self,
        *,
        device_id: int,
        device_code: str,
        data_type: str,
        value: float,
        unit: str = '',
        channel: str = '',
        record_time: datetime | None = None,
    ):
        from influxdb_client import Point

        p = (
            Point(MEASUREMENT)
            .tag('device_id', str(int(device_id)))
            .tag('device_code', device_code or '')
            .tag('data_type', data_type or '')
            .tag('channel', channel or '_')
            .tag('unit', (unit or '')[:64])
            .field('value', float(value))
            .time(_to_utc(record_time))
        )
        return p

    def write_point(
        self,
        *,
        device_id: int,
        device_code: str,
        data_type: str,
        value: float,
        unit: str = '',
        channel: str = '',
        record_time: datetime | None = None,
    ) -> None:
        self.connect()
        self._write_api.write(
            bucket=self._cfg['BUCKET'],
            org=self._cfg['ORG'],
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

    def write_points_batch(self, rows: list[dict[str, Any]]) -> int:
        if not rows:
            return 0
        self.connect()
        points = [
            self._point(
                device_id=int(r['device_id']),
                device_code=str(r.get('device_code') or ''),
                data_type=str(r['data_type']),
                value=float(r['value']),
                unit=str(r.get('unit') or ''),
                channel=str(r.get('channel') or ''),
                record_time=r.get('record_time'),
            )
            for r in rows
        ]
        # 分批写入
        chunk = 500
        written = 0
        for i in range(0, len(points), chunk):
            part = points[i : i + chunk]
            self._write_api.write(
                bucket=self._cfg['BUCKET'],
                org=self._cfg['ORG'],
                record=part,
            )
            written += len(part)
        return written

    def _base_filter(
        self,
        *,
        device_id: int | None = None,
        data_type: str | None = None,
        channel: str | None = None,
    ) -> str:
        parts = [f'r._measurement == "{MEASUREMENT}"']
        if device_id is not None:
            parts.append(f'r.device_id == "{int(device_id)}"')
        if data_type:
            parts.append(f'r.data_type == "{data_type}"')
        if channel is not None and channel != '':
            parts.append(f'r.channel == "{channel}"')
        else:
            # 写入时空通道用 "_"
            pass
        return ' and '.join(parts)

    def query_points(
        self,
        *,
        device_id: int | None = None,
        data_type: str | None = None,
        channel: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 1000,
        order: str = 'asc',
    ) -> list[dict[str, Any]]:
        self.connect()
        start_s = _flux_time(start) if start else '-30d'
        stop_s = _flux_time(end) if end else 'now()'
        if start:
            start_expr = f'time(v: "{start_s}")'
        else:
            start_expr = start_s
        if end:
            stop_expr = f'time(v: "{stop_s}")'
        else:
            stop_expr = stop_s

        filt = self._base_filter(
            device_id=device_id, data_type=data_type, channel=channel
        )
        lim = max(1, min(int(limit), 5000))
        flux = f'''
from(bucket: "{self._cfg['BUCKET']}")
  |> range(start: {start_expr}, stop: {stop_expr})
  |> filter(fn: (r) => {filt})
  |> filter(fn: (r) => r._field == "value")
  |> sort(columns: ["_time"], desc: {"true" if order.lower() == "desc" else "false"})
  |> limit(n: {lim})
'''
        tables = self._query_api.query(flux, org=self._cfg['ORG'])
        rows: list[dict[str, Any]] = []
        for table in tables:
            for rec in table.records:
                val = rec.get_value()
                ch = rec.values.get('channel') or ''
                if ch == '_':
                    ch = ''
                rows.append(
                    {
                        'ts': rec.get_time(),
                        'record_time': rec.get_time(),
                        'value': float(val) if val is not None else None,
                        'unit': rec.values.get('unit') or '',
                        'device_id': int(rec.values['device_id'])
                        if rec.values.get('device_id') is not None
                        else None,
                        'device_code': rec.values.get('device_code') or '',
                        'data_type': rec.values.get('data_type') or '',
                        'channel': ch,
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
        tables = self._query_api.query(flux, org=self._cfg['ORG'])
        out: list[str] = []
        for table in tables:
            for rec in table.records:
                v = rec.values.get('data_type') or rec.get_value()
                if v and str(v) not in out:
                    out.append(str(v))
        return out

    def latest_by_device(self, device_id: int) -> list[dict[str, Any]]:
        types = self.distinct_data_types(device_id)
        out: list[dict[str, Any]] = []
        for dtype in types:
            rows = self.query_points(
                device_id=device_id, data_type=dtype, limit=1, order='desc'
            )
            if rows:
                out.append(rows[0])
        return out

    def count_points(
        self,
        *,
        device_id: int | None = None,
        data_type: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> int:
        rows = self.query_points(
            device_id=device_id,
            data_type=data_type,
            start=start,
            end=end,
            limit=5000,
            order='asc',
        )
        return len(rows)


def get_client() -> InfluxMonitorClient:
    global _client
    with _client_lock:
        if _client is None:
            _client = InfluxMonitorClient()
            atexit.register(_client.close)
        return _client
