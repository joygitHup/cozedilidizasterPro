"""Celery 应用：复用本机已有 Redis/RabbitMQ，不新建中间件容器"""
from __future__ import annotations

import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('geohazard')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
# 独立队列，避免本机其它项目的 Celery worker 误消费
app.conf.task_default_queue = 'geohazard'
app.conf.task_default_exchange = 'geohazard'
app.conf.task_default_routing_key = 'geohazard'

# Beat 调度（入库由 ingest 异步任务触发；此处负责离线/聚合/兜底预警）
app.conf.beat_schedule = {
    'iot-mark-offline-every-5-min': {
        'task': 'monitoring.tasks.mark_offline_devices',
        'schedule': 300.0,
    },
    'iot-aggregate-daily-0110': {
        'task': 'monitoring.tasks.aggregate_daily',
        'schedule': crontab(hour=1, minute=10),
    },
    'iot-evaluate-warnings-every-10-min': {
        'task': 'monitoring.tasks.evaluate_pending_warnings',
        'schedule': 600.0,
    },
}
