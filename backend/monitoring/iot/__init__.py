"""物联网接入包（惰性导出，避免 Django LOGGING 配置阶段循环导入）"""

__all__ = [
    'process_telemetry_payload',
    'get_device_latest',
    'get_device_online',
    'set_device_latest',
    'set_device_online',
]


def __getattr__(name: str):
    if name == 'process_telemetry_payload':
        from .ingest import process_telemetry_payload

        return process_telemetry_payload
    if name in ('get_device_latest', 'get_device_online', 'set_device_latest', 'set_device_online'):
        from . import redis_state

        return getattr(redis_state, name)
    raise AttributeError(name)
