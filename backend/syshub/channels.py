"""邮件 / APP 推送通道（Webhook 或 SMTP；未配置时可控台/站内兜底）"""
from __future__ import annotations

import json
import logging
import os
import smtplib
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, field
from email.mime.text import MIMEText
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class ChannelResult:
    channel: str
    ok: bool
    detail: str = ''
    provider: str = ''
    target: str = ''

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class MultiNotifyResult:
    ok: bool
    status: str
    results: list[ChannelResult] = field(default_factory=list)
    message: str = ''

    def to_dict(self) -> dict[str, Any]:
        return {
            'ok': self.ok,
            'status': self.status,
            'message': self.message,
            'results': [r.to_dict() for r in self.results],
        }


def _http_json(url: str, payload: dict, timeout: float = 8.0) -> tuple[bool, str]:
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(
        url, data=data,
        headers={'Content-Type': 'application/json; charset=utf-8'},
        method='POST',
    )
    token = os.getenv('NOTIFY_WEBHOOK_TOKEN', '').strip()
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode('utf-8', errors='ignore')[:400]
            return 200 <= resp.status < 300, body or f'HTTP {resp.status}'
    except urllib.error.HTTPError as exc:
        return False, f'HTTP {exc.code}'
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)[:200]


def send_email(*, to: str, subject: str, body: str) -> ChannelResult:
    to = (to or '').strip()
    if not to or '@' not in to:
        return ChannelResult(channel='email', ok=False, detail='无效邮箱', provider='none', target=to)

    webhook = (os.getenv('EMAIL_WEBHOOK_URL') or '').strip()
    if webhook:
        ok, detail = _http_json(webhook, {
            'type': 'email', 'to': to, 'subject': subject, 'body': body,
        })
        return ChannelResult(channel='email', ok=ok, detail=detail, provider='webhook', target=to)

    host = (os.getenv('SMTP_HOST') or '').strip()
    if host:
        port = int(os.getenv('SMTP_PORT', '587'))
        user = os.getenv('SMTP_USER', '')
        password = os.getenv('SMTP_PASSWORD', '')
        from_addr = os.getenv('SMTP_FROM', user or 'noreply@geohazard.local')
        use_tls = os.getenv('SMTP_TLS', '1') not in ('0', 'false', 'False')
        try:
            msg = MIMEText(body, 'plain', 'utf-8')
            msg['Subject'] = subject
            msg['From'] = from_addr
            msg['To'] = to
            with smtplib.SMTP(host, port, timeout=10) as smtp:
                if use_tls:
                    smtp.starttls()
                if user:
                    smtp.login(user, password)
                smtp.sendmail(from_addr, [to], msg.as_string())
            return ChannelResult(
                channel='email', ok=True, detail='SMTP 已发送',
                provider='smtp', target=to,
            )
        except Exception as exc:  # noqa: BLE001
            return ChannelResult(
                channel='email', ok=False, detail=str(exc)[:200],
                provider='smtp', target=to,
            )

    if os.getenv('EMAIL_PROVIDER', 'auto').lower() == 'required':
        return ChannelResult(
            channel='email', ok=False,
            detail='未配置 EMAIL_WEBHOOK_URL / SMTP_HOST',
            provider='none', target=to,
        )
    logger.info('[EMAIL-CONSOLE] to=%s subject=%s', to, subject)
    return ChannelResult(
        channel='email', ok=True,
        detail='已写入服务日志（未配置邮件网关时的开发通道）',
        provider='console', target=to,
    )


def send_app_push(
    *,
    title: str,
    body: str,
    link: str = '',
    user_ids: list[int] | None = None,
) -> ChannelResult:
    """APP 推送：Webhook + 站内通知表"""
    webhook = (os.getenv('APP_PUSH_WEBHOOK_URL') or '').strip()
    provider = 'console'
    detail = ''
    ok = True

    if webhook:
        ok, detail = _http_json(webhook, {
            'type': 'app_push',
            'title': title,
            'body': body,
            'link': link,
            'user_ids': user_ids or [],
        })
        provider = 'webhook'
    else:
        logger.info('[APP-PUSH-CONSOLE] title=%s body=%s', title, body[:80])
        detail = '已写服务日志；并写入站内通知（铃铛）'
        if os.getenv('APP_PUSH_PROVIDER', 'auto').lower() == 'required':
            ok = False
            detail = '未配置 APP_PUSH_WEBHOOK_URL'
            provider = 'none'

    # 站内通知（真正触达管理端）
    try:
        from syshub.models import Notification

        if user_ids:
            for uid in user_ids:
                Notification.objects.create(
                    title=title, body=body, link=link,
                    level='warning', source='app_push', user_id=uid,
                )
        else:
            Notification.objects.create(
                title=title, body=body, link=link,
                level='warning', source='app_push', user=None,
            )
        if provider == 'console':
            detail = '站内通知已创建（未配置 APP_PUSH_WEBHOOK_URL）'
            ok = True
            provider = 'inapp+console'
        else:
            detail = f'{detail}; 站内通知已同步'
            provider = f'{provider}+inapp'
    except Exception as exc:  # noqa: BLE001
        detail = f'{detail}; 站内通知失败: {exc}'[:200]
        if provider == 'console':
            ok = False

    return ChannelResult(
        channel='app', ok=ok, detail=detail, provider=provider, target='broadcast',
    )


def channels_status() -> dict[str, Any]:
    """供系统配置页展示通道就绪状态"""
    sms_wh = bool(os.getenv('SMS_WEBHOOK_URL', '').strip())
    voice_wh = bool(
        (os.getenv('VOICE_WEBHOOK_URL') or os.getenv('SMS_WEBHOOK_URL') or '').strip()
    )
    email_wh = bool(os.getenv('EMAIL_WEBHOOK_URL', '').strip())
    smtp = bool(os.getenv('SMTP_HOST', '').strip())
    app_wh = bool(os.getenv('APP_PUSH_WEBHOOK_URL', '').strip())
    mapbox = bool(
        (os.getenv('MAPBOX_ACCESS_TOKEN') or os.getenv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN') or '').strip()
    )
    route_pref = (os.getenv('ROUTE_PROVIDER') or 'auto').lower()
    return {
        'sms': {
            'ready': sms_wh or (os.getenv('SMS_PROVIDER', 'auto') != 'required'),
            'mode': 'webhook' if sms_wh else 'console',
            'hint': '配置 SMS_WEBHOOK_URL 走真实短信' if not sms_wh else 'Webhook 已配置',
        },
        'voice': {
            'ready': voice_wh or (os.getenv('VOICE_PROVIDER', 'auto') != 'required'),
            'mode': 'webhook' if voice_wh else 'console',
            'hint': '配置 VOICE_WEBHOOK_URL' if not voice_wh else 'Webhook 已配置',
        },
        'email': {
            'ready': email_wh or smtp or True,
            'mode': 'webhook' if email_wh else ('smtp' if smtp else 'console'),
            'hint': '配置 EMAIL_WEBHOOK_URL 或 SMTP_HOST' if not (email_wh or smtp) else '已配置',
        },
        'app': {
            'ready': True,
            'mode': 'webhook+inapp' if app_wh else 'inapp',
            'hint': '未配 APP_PUSH_WEBHOOK_URL 时写入站内铃铛' if not app_wh else 'Webhook+站内',
        },
        'route': {
            'ready': True,
            'mode': 'mapbox' if mapbox and route_pref in ('auto', 'mapbox') else 'osrm/auto',
            'mapbox': mapbox,
            'hint': (
                '已配置 Mapbox Directions'
                if mapbox
                else '未配 MAPBOX_ACCESS_TOKEN 时走公共 OSRM，失败再插值'
            ),
            'osrm_base': os.getenv('OSRM_BASE_URL') or 'https://router.project-osrm.org',
        },
        'weather': {
            'ready': True,
            'mode': 'open-meteo',
            'hint': 'Open-Meteo 实况，可在配置中设 weather_lat/lng',
        },
    }
