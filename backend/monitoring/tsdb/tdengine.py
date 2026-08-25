"""TDengine 监测时序客户端（原生 taos 驱动）"""
from __future__ import annotations

import atexit
import logging
import threading
from datetime import datetime
from typing import Any

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger('monitoring.tsdb')

_client_lock = threading.Lock()
_client: 'TDengineMonitorClient | None' = None


def _escape(value: str) -> str:
    return (value or '').replace("'", "''")


def _ts_literal(dt: datetime | None) -> str:
    if dt is None:
        return 'NOW'
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    local = timezone.localtime(dt)
    return f"'{local.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}'"


def _ident(name: str) -> str:
    safe = ''.join(ch if ch.isalnum() or ch == '_' else '_' for ch in (name or ''))
    if not safe or safe[0].isdigit():
        safe = f't_{safe}'
    return safe.lower()[:190]


class TDengineMonitorClient:
    """monitor_points 超级表：一设备一类型一通道一张子表"""

    STABLE = 'monitor_points'

    def __init__(self) -> None:
        self._conn = None
        self._cfg = settings.TDENGINE_CONFIG
        self._known_tables: set[str] = set()
        self._schema_ready = False

    def connect(self):
        if self._conn is not None:
            return self._conn
        import taos

        kwargs = {
            'host': self._cfg['HOST'],
            'port': int(self._cfg.get('PORT', 6030)),
            'user': self._cfg['USER'],
            'password': self._cfg['PASSWORD'],
        }
        db = self._cfg.get('DATABASE')
        if db:
            # 库可能尚未创建，先无库连接再 CREATE
            try:
                self._conn = taos.connect(**kwargs, database=db)
            except Exception:
                self._conn = taos.connect(**kwargs)
        else:
            self._conn = taos.connect(**kwargs)
        logger.info('Connected to TDengine %s:%s', kwargs['host'], kwargs['port'])
        return self._conn

    def close(self) -> None:
        conn = self._conn
        self._conn = None
        if conn is None:
            return
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            try:
                if getattr(conn, '_conn', None) is not None:
                    conn._conn = None
            except Exception:  # noqa: BLE001
                pass

    def _execute(self, sql: str):
        conn = self.connect()
        return conn.execute(sql)

    def _query(self, sql: str):
        conn = self.connect()
        return conn.query(sql)

    def ensure_schema(self) -> None:
        if self._schema_ready:
            return
        db = self._cfg['DATABASE']
        keep = int(self._cfg.get('KEEP', 365))
        duration = int(self._cfg.get('DURATION', 10))
        buffer = int(self._cfg.get('BUFFER', 16))
        self.connect()
        self._execute(
            f'CREATE DATABASE IF NOT EXISTS {db} KEEP {keep} DURATION {duration} BUFFER {buffer}'
        )
        self._execute(f'USE {db}')
        self._execute(
            f'''
            CREATE STABLE IF NOT EXISTS {self.STABLE} (
                ts TIMESTAMP,
                value DOUBLE,
                unit NCHAR(16)
            ) TAGS (
                device_id BIGINT,
                device_code NCHAR(64),
                data_type NCHAR(32),
                channel NCHAR(16)
            )
            '''
        )
        self._schema_ready = True
        logger.info('TDengine schema ready: %s.%s', db, self.STABLE)

    def _table_name(self, device_id: int, data_type: str, channel: str) -> str:
        ch = channel or 'scalar'
        return _ident(f'mp_{device_id}_{data_type}_{ch}')

    def _ensure_subtable(
        self,
        *,
        device_id: int,
        device_code: str,
        data_type: str,
        channel: str,
    ) -> str:
        self.ensure_schema()
        table = self._table_name(device_id, data_type, channel)
        if table in self._known_tables:
            return table
        self._execute(f'USE {self._cfg["DATABASE"]}')
        sql = (
            f"CREATE TABLE IF NOT EXISTS {table} USING {self.STABLE} TAGS "
            f"({int(device_id)}, '{_escape(device_code)}', '{_escape(data_type)}', "
            f"'{_escape(channel or '')}')"
        )
        self._execute(sql)
        self._known_tables.add(table)
        return table

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
        table = self._ensure_subtable(
            device_id=device_id,
            device_code=device_code,
            data_type=data_type,
            channel=channel or '',
        )
        self._execute(f'USE {self._cfg["DATABASE"]}')
        sql = (
            f"INSERT INTO {table} (ts, value, unit) VALUES "
            f"({_ts_literal(record_time)}, {float(value)}, '{_escape((unit or '')[:16])}')"
        )
        self._execute(sql)

    def write_points_batch(self, rows: list[dict[str, Any]]) -> int:
        if not rows:
            return 0
        self.ensure_schema()
        self._execute(f'USE {self._cfg["DATABASE"]}')
        # 按子表分组批量 INSERT
        groups: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            table = self._ensure_subtable(
                device_id=int(row['device_id']),
                device_code=str(row['device_code']),
                data_type=str(row['data_type']),
                channel=str(row.get('channel') or ''),
            )
            groups.setdefault(table, []).append(row)
        written = 0
        for table, items in groups.items():
            values = []
            for item in items:
                values.append(
                    f"({_ts_literal(item.get('record_time'))}, {float(item['value'])}, "
                    f"'{_escape(str(item.get('unit') or '')[:16])}')"
                )
            # 分片，避免单条 SQL 过长
            chunk = 200
            for i in range(0, len(values), chunk):
                part = values[i : i + chunk]
                self._execute(
                    f"INSERT INTO {table} (ts, value, unit) VALUES {', '.join(part)}"
                )
                written += len(part)
        return written

    def _where(
        self,
        *,
        device_id: int | None = None,
        data_type: str | None = None,
        channel: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> str:
        clauses: list[str] = []
        if device_id is not None:
            clauses.append(f'device_id={int(device_id)}')
        if data_type:
            clauses.append(f"data_type='{_escape(data_type)}'")
        if channel is not None and channel != '':
            clauses.append(f"channel='{_escape(channel)}'")
        if start is not None:
            clauses.append(f'ts >= {_ts_literal(start)}')
        if end is not None:
            clauses.append(f'ts <= {_ts_literal(end)}')
        return (' WHERE ' + ' AND '.join(clauses)) if clauses else ''

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
        self.ensure_schema()
        self._execute(f'USE {self._cfg["DATABASE"]}')
        where = self._where(
            device_id=device_id,
            data_type=data_type,
            channel=channel,
            start=start,
            end=end,
        )
        direction = 'ASC' if order.lower() != 'desc' else 'DESC'
        lim = max(1, min(int(limit), 5000))
        sql = (
            f'SELECT ts, value, unit, device_id, device_code, data_type, channel '
            f'FROM {self.STABLE}{where} ORDER BY ts {direction} LIMIT {lim}'
        )
        result = self._query(sql)
        rows = []
        for item in result.fetch_all():
            ts, value, unit, did, code, dtype, ch = item
            rows.append(
                {
                    'ts': ts,
                    'record_time': ts,
                    'value': float(value) if value is not None else None,
                    'unit': unit or '',
                    'device_id': int(did) if did is not None else None,
                    'device_code': code or '',
                    'data_type': dtype or '',
                    'channel': ch or '',
                }
            )
        return rows

    def distinct_data_types(self, device_id: int) -> list[str]:
        self.ensure_schema()
        self._execute(f'USE {self._cfg["DATABASE"]}')
        sql = (
            f'SELECT DISTINCT data_type FROM {self.STABLE} '
            f'WHERE device_id={int(device_id)}'
        )
        try:
            result = self._query(sql)
            return [str(r[0]) for r in result.fetch_all() if r and r[0]]
        except Exception as exc:  # noqa: BLE001
            logger.warning('distinct_data_types failed: %s', exc)
            return []

    def latest_by_device(self, device_id: int) -> list[dict[str, Any]]:
        """各 data_type 最新一条（按类型分组）"""
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
        self.ensure_schema()
        self._execute(f'USE {self._cfg["DATABASE"]}')
        where = self._where(
            device_id=device_id, data_type=data_type, start=start, end=end
        )
        sql = f'SELECT COUNT(*) FROM {self.STABLE}{where}'
        try:
            result = self._query(sql)
            rows = result.fetch_all()
            return int(rows[0][0]) if rows else 0
        except Exception as exc:  # noqa: BLE001
            logger.warning('count_points failed: %s', exc)
            return 0


def get_client() -> TDengineMonitorClient:
    global _client
    with _client_lock:
        if _client is None:
            _client = TDengineMonitorClient()
            atexit.register(_client.close)
        return _client
