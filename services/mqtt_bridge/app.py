#!/usr/bin/env python3
"""
本地 MQTT Broker → Django ingest 轻量桥接

特性：
- 转发失败落盘 spool，恢复后重放（防桥接/后端短暂不可用丢数）
- 支持多实例：MQTT_SHARE_GROUP + 唯一 client_id（共享订阅，消息只被一个实例处理）
"""
from __future__ import annotations

import json
import logging
import os
import signal
import socket
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import paho.mqtt.client as mqtt
import requests

logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO'),
    format='%(asctime)s [%(levelname)s] [trace=%(trace_id)s] %(message)s',
)
log = logging.getLogger('mqtt-bridge')


class _TraceFilter(logging.Filter):
    def filter(self, record):
        if not hasattr(record, 'trace_id'):
            record.trace_id = '-'
        return True


for _h in logging.root.handlers:
    _h.addFilter(_TraceFilter())


def _new_trace_id() -> str:
    return f'iot-{uuid.uuid4().hex[:12]}'


def _ensure_trace(payload: dict[str, Any]) -> str:
    tid = str(payload.get('trace_id') or payload.get('traceId') or '').strip()
    if not tid:
        tid = _new_trace_id()
        payload['trace_id'] = tid
    return tid

MQTT_HOST = os.getenv('MQTT_HOST', '127.0.0.1')
MQTT_PORT = int(os.getenv('MQTT_PORT', '1883'))
MQTT_USER = os.getenv('MQTT_USER', '')
MQTT_PASSWORD = os.getenv('MQTT_PASSWORD', '')
MQTT_TOPIC = os.getenv('MQTT_TOPIC', 'geo/telemetry/#')
# 多实例时设同一组名，例如 geohazard；单实例可留空
MQTT_SHARE_GROUP = os.getenv('MQTT_SHARE_GROUP', '').strip()
_base_client = os.getenv('MQTT_CLIENT_ID', 'geohazard-mqtt-bridge')
MQTT_CLIENT_ID = os.getenv(
    'MQTT_CLIENT_ID_FULL',
    f'{_base_client}-{socket.gethostname()}-{os.getpid()}-{uuid.uuid4().hex[:6]}',
)

INGEST_URL = os.getenv(
    'DJANGO_INGEST_URL',
    'http://127.0.0.1:8000/api/monitoring/ingest/mqtt/',
)
INGEST_TOKEN = os.getenv('MQTT_INGEST_TOKEN', 'dev-mqtt-ingest-token')
INGEST_ASYNC = os.getenv('INGEST_ASYNC', 'true').lower() in ('1', 'true', 'yes')

SPOOL_DIR = Path(os.getenv('MQTT_BRIDGE_SPOOL_DIR', str(Path(__file__).resolve().parent / 'spool')))
SPOOL_FLUSH_SEC = float(os.getenv('MQTT_BRIDGE_SPOOL_FLUSH_SEC', '5'))
SPOOL_MAX_FILES = int(os.getenv('MQTT_BRIDGE_SPOOL_MAX_FILES', '5000'))

_running = True
_spool_lock = threading.Lock()


def _shutdown(*_args):
    global _running
    _running = False
    log.info('shutting down...')


def _subscribe_topic() -> str:
    if MQTT_SHARE_GROUP:
        # MQTT-5 / EMQX / Mosquitto 共享订阅：$share/{group}/{topic}
        return f'$share/{MQTT_SHARE_GROUP}/{MQTT_TOPIC}'
    return MQTT_TOPIC


def _parse_payload(raw: bytes, topic: str) -> dict[str, Any]:
    text = raw.decode('utf-8', errors='replace').strip()
    if not text:
        raise ValueError('empty payload')
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError('payload must be JSON object')
    data.setdefault('topic', topic)
    if not any(
        data.get(k)
        for k in ('device_code', 'deviceCode', 'devId', 'sn', 'imei', 'code', 'id', 'cam')
    ):
        parts = [p for p in topic.strip('/').split('/') if p]
        # 去掉 $share/group 前缀后的业务 topic 已在 msg.topic 中为原始 topic
        if len(parts) >= 4 and parts[0] == 'geo' and parts[1] == 'telemetry':
            data['device_code'] = parts[3]
        elif len(parts) >= 3 and parts[0] == 'geo' and parts[1] == 'telemetry':
            data['device_code'] = parts[2]
    data['async'] = INGEST_ASYNC
    _ensure_trace(data)
    return data


def _spool_enqueue(payload: dict[str, Any], reason: str) -> None:
    tid = _ensure_trace(payload)
    SPOOL_DIR.mkdir(parents=True, exist_ok=True)
    name = f'{time.time_ns()}_{uuid.uuid4().hex}.json'
    path = SPOOL_DIR / name
    with _spool_lock:
        existing = list(SPOOL_DIR.glob('*.json'))
        if len(existing) >= SPOOL_MAX_FILES:
            for old in sorted(existing, key=lambda p: p.name)[: max(1, len(existing) - SPOOL_MAX_FILES + 1)]:
                try:
                    old.unlink(missing_ok=True)
                except Exception:  # noqa: BLE001
                    pass
        path.write_text(
            json.dumps(
                {'reason': reason, 'payload': payload, 'trace_id': tid, 'at': time.time()},
                ensure_ascii=False,
            ),
            encoding='utf-8',
        )
    log.warning('spooled message reason=%s file=%s', reason, path.name, extra={'trace_id': tid})


def _forward_once(payload: dict[str, Any]) -> None:
    tid = _ensure_trace(payload)
    headers = {
        'Content-Type': 'application/json',
        'X-Ingest-Token': INGEST_TOKEN,
        'Authorization': f'Bearer {INGEST_TOKEN}',
        'X-Trace-Id': tid,
    }
    resp = requests.post(INGEST_URL, json=payload, headers=headers, timeout=10)
    if resp.status_code >= 400:
        raise RuntimeError(f'ingest HTTP {resp.status_code}: {resp.text[:300]}')
    log.info(
        'forwarded %s -> %s %s',
        payload.get('device_code') or payload.get('devId') or payload.get('sn'),
        resp.status_code,
        resp.text[:120],
        extra={'trace_id': tid},
    )


def _forward(payload: dict[str, Any]) -> None:
    tid = _ensure_trace(payload)
    try:
        _forward_once(payload)
    except Exception as exc:  # noqa: BLE001
        log.error('ingest forward failed: %s', exc, extra={'trace_id': tid})
        _spool_enqueue(payload, reason=str(exc)[:200])


def _flush_spool_once() -> int:
    if not SPOOL_DIR.exists():
        return 0
    sent = 0
    with _spool_lock:
        files = sorted(SPOOL_DIR.glob('*.json'), key=lambda p: p.name)[:50]
    for path in files:
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
            payload = data.get('payload') if isinstance(data, dict) else None
            if not isinstance(payload, dict):
                path.unlink(missing_ok=True)
                continue
            _forward_once(payload)
            path.unlink(missing_ok=True)
            sent += 1
        except Exception as exc:  # noqa: BLE001
            log.error('spool replay failed %s: %s', path.name, exc)
            # 留在磁盘，下次再试；避免热循环打爆后端
            break
    return sent


def _spool_worker():
    while _running:
        try:
            n = _flush_spool_once()
            if n:
                log.info('spool replayed %s messages', n)
        except Exception as exc:  # noqa: BLE001
            log.exception('spool worker error: %s', exc)
        time.sleep(SPOOL_FLUSH_SEC)


def _make_client() -> mqtt.Client:
    try:
        client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION1,
            client_id=MQTT_CLIENT_ID,
            protocol=mqtt.MQTTv311,
            clean_session=True,
        )
    except (AttributeError, TypeError):
        client = mqtt.Client(client_id=MQTT_CLIENT_ID, protocol=mqtt.MQTTv311, clean_session=True)
    return client


def main() -> int:
    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    SPOOL_DIR.mkdir(parents=True, exist_ok=True)
    threading.Thread(target=_spool_worker, name='spool-flusher', daemon=True).start()

    client = _make_client()
    if MQTT_USER:
        client.username_pw_set(MQTT_USER, MQTT_PASSWORD)

    sub_topic = _subscribe_topic()

    def on_connect(client, _userdata, _flags, rc):
        if rc != 0:
            log.error('mqtt connect rc=%s', rc)
            return
        result, mid = client.subscribe(sub_topic, qos=1)
        log.info(
            'connected %s:%s subscribe %s result=%s mid=%s client_id=%s',
            MQTT_HOST, MQTT_PORT, sub_topic, result, mid, MQTT_CLIENT_ID,
        )

    def on_subscribe(_client, _userdata, mid, granted_qos):
        log.info('subscribe ack mid=%s qos=%s', mid, granted_qos)

    def on_message(_client, _userdata, msg):
        try:
            payload = _parse_payload(msg.payload, msg.topic)
            tid = _ensure_trace(payload)
            log.info(
                'recv topic=%s bytes=%s',
                msg.topic,
                len(msg.payload or b''),
                extra={'trace_id': tid},
            )
            _forward(payload)
        except Exception as exc:  # noqa: BLE001
            tid = _new_trace_id()
            log.exception(
                'handle message failed topic=%s: %s',
                msg.topic,
                exc,
                extra={'trace_id': tid},
            )
            try:
                raw = {
                    'topic': msg.topic,
                    'raw': msg.payload.decode('utf-8', errors='replace'),
                    'trace_id': tid,
                }
                _spool_enqueue(raw, reason=f'parse:{exc}')
            except Exception:  # noqa: BLE001
                pass

    def on_disconnect(_client, _userdata, rc):
        log.warning('disconnected rc=%s', rc)

    client.on_connect = on_connect
    client.on_subscribe = on_subscribe
    client.on_message = on_message
    client.on_disconnect = on_disconnect

    log.info(
        'bridge start mqtt=%s:%s -> %s spool=%s share=%s',
        MQTT_HOST, MQTT_PORT, INGEST_URL, SPOOL_DIR, MQTT_SHARE_GROUP or '-',
    )
    while _running:
        try:
            client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
            client.loop_forever(retry_first_connection=True)
        except Exception as exc:  # noqa: BLE001
            if not _running:
                break
            log.error('mqtt loop error: %s; retry in 3s', exc)
            time.sleep(3)
    try:
        client.disconnect()
    except Exception:  # noqa: BLE001
        pass
    # 退出前尽量冲刷
    try:
        _flush_spool_once()
    except Exception:  # noqa: BLE001
        pass
    return 0


if __name__ == '__main__':
    sys.exit(main())
