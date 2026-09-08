"""一键叫应通道：短信 / 语音（可配置真实网关，未配置时走可控控制台通道）"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class TargetResult:
    target: str
    phone: str
    channel: str  # sms | voice | console
    ok: bool
    detail: str = ''
    provider: str = ''


@dataclass
class CallDispatchResult:
    ok: bool
    status: str  # success | partial | failed
    channels: list[str] = field(default_factory=list)
    results: list[TargetResult] = field(default_factory=list)
    message: str = ''

    def to_dict(self) -> dict[str, Any]:
        return {
            'ok': self.ok,
            'status': self.status,
            'channels': self.channels,
            'message': self.message,
            'results': [asdict(r) for r in self.results],
        }


def _parse_target(raw: str) -> tuple[str, str]:
    """'张三:13800138000' → (name, phone)"""
    text = (raw or '').strip()
    if ':' in text:
        name, phone = text.split(':', 1)
        return name.strip() or '联系人', phone.strip()
    if text.isdigit() and len(text) >= 7:
        return '联系人', text
    return text or '联系人', ''


def _http_json(url: str, payload: dict, timeout: float = 8.0) -> tuple[bool, str]:
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=data,
        headers={'Content-Type': 'application/json; charset=utf-8'},
        method='POST',
    )
    token = os.getenv('NOTIFY_WEBHOOK_TOKEN', '').strip()
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode('utf-8', errors='ignore')[:500]
            if 200 <= resp.status < 300:
                return True, body or f'HTTP {resp.status}'
            return False, body or f'HTTP {resp.status}'
    except urllib.error.HTTPError as exc:
        return False, f'HTTP {exc.code}: {(exc.read() or b"")[:200].decode("utf-8", errors="ignore")}'
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)[:300]


def _send_sms(phone: str, content: str) -> TargetResult:
    provider = (os.getenv('SMS_PROVIDER') or 'auto').lower().strip()
    webhook = (os.getenv('SMS_WEBHOOK_URL') or '').strip()
    aliyun_key = (os.getenv('ALIYUN_SMS_ACCESS_KEY_ID') or '').strip()

    if provider in ('webhook', 'auto') and webhook:
        ok, detail = _http_json(webhook, {
            'type': 'sms',
            'phone': phone,
            'content': content,
        })
        return TargetResult(target=phone, phone=phone, channel='sms', ok=ok, detail=detail, provider='webhook')

    if provider in ('aliyun', 'auto') and aliyun_key:
        # 精简对接：走通用短信网关 Webhook 形态；完整签名可后续替换
        endpoint = (os.getenv('ALIYUN_SMS_GATEWAY_URL') or webhook or '').strip()
        if not endpoint:
            return TargetResult(
                target=phone, phone=phone, channel='sms', ok=False,
                detail='已配置 ALIYUN_SMS_ACCESS_KEY_ID 但缺少 ALIYUN_SMS_GATEWAY_URL / SMS_WEBHOOK_URL',
                provider='aliyun',
            )
        ok, detail = _http_json(endpoint, {
            'type': 'sms',
            'provider': 'aliyun',
            'access_key_id': aliyun_key,
            'sign_name': os.getenv('ALIYUN_SMS_SIGN_NAME', '地质灾害'),
            'template_code': os.getenv('ALIYUN_SMS_TEMPLATE_CODE', ''),
            'phone': phone,
            'content': content,
        })
        return TargetResult(target=phone, phone=phone, channel='sms', ok=ok, detail=detail, provider='aliyun')

    # 未配置真实网关：默认计为失败（避免值班误判「已叫应」）
    if provider == 'required' or provider in ('auto', 'webhook', 'aliyun', 'console', ''):
        logger.info('[SMS-CONSOLE] to=%s content=%s', phone, content[:120])
        allow_console = (os.getenv('NOTIFY_ALLOW_CONSOLE') or '').lower() in (
            '1', 'true', 'yes',
        )
        if allow_console:
            return TargetResult(
                target=phone, phone=phone, channel='sms', ok=True,
                detail='NOTIFY_ALLOW_CONSOLE：仅写日志，未真正发短信',
                provider='console',
            )
        return TargetResult(
            target=phone, phone=phone, channel='sms', ok=False,
            detail='未配置 SMS_WEBHOOK_URL / 阿里云短信网关（已记日志，计为失败）',
            provider='console',
        )
    return TargetResult(
        target=phone, phone=phone, channel='sms', ok=False,
        detail=f'未知 SMS_PROVIDER={provider}',
        provider='none',
    )


def _send_voice(phone: str, content: str) -> TargetResult:
    provider = (os.getenv('VOICE_PROVIDER') or 'auto').lower().strip()
    webhook = (os.getenv('VOICE_WEBHOOK_URL') or os.getenv('SMS_WEBHOOK_URL') or '').strip()

    if provider in ('webhook', 'auto') and webhook:
        ok, detail = _http_json(webhook, {
            'type': 'voice',
            'phone': phone,
            'content': content,
        })
        return TargetResult(target=phone, phone=phone, channel='voice', ok=ok, detail=detail, provider='webhook')

    logger.info('[VOICE-CONSOLE] to=%s content=%s', phone, content[:120])
    allow_console = (os.getenv('NOTIFY_ALLOW_CONSOLE') or '').lower() in (
        '1', 'true', 'yes',
    )
    if allow_console:
        return TargetResult(
            target=phone, phone=phone, channel='voice', ok=True,
            detail='NOTIFY_ALLOW_CONSOLE：仅写日志，未真正外呼',
            provider='console',
        )
    return TargetResult(
        target=phone, phone=phone, channel='voice', ok=False,
        detail='未配置 VOICE_WEBHOOK_URL（已记日志，计为失败）',
        provider='console',
    )


def build_call_content(*, warning_code: str, hazard_name: str, level: str, trigger: str) -> str:
    return (
        f'【地质灾害预警】编号{warning_code}，隐患点{hazard_name}，等级{level}，'
        f'触发：{trigger or "监测超阈"}。请立即核实并反馈。'
    )


def dispatch_call(
    *,
    targets: list[str],
    content: str,
    channels: list[str] | None = None,
) -> CallDispatchResult:
    """
    channels: ['sms','voice'] 默认两者都试（有手机号时）
    """
    use = channels or ['sms', 'voice']
    results: list[TargetResult] = []
    used_channels: set[str] = set()

    for raw in targets:
        name, phone = _parse_target(raw)
        if not phone or not any(c.isdigit() for c in phone):
            results.append(TargetResult(
                target=raw, phone='', channel='none', ok=False,
                detail=f'无法解析手机号（{name}）', provider='none',
            ))
            continue
        label = f'{name}:{phone}'
        if 'sms' in use:
            r = _send_sms(phone, content)
            r.target = label
            results.append(r)
            used_channels.add('sms')
        if 'voice' in use:
            r = _send_voice(phone, content)
            r.target = label
            results.append(r)
            used_channels.add('voice')

    if not results:
        return CallDispatchResult(ok=False, status='failed', message='无有效叫应目标', channels=[])

    oks = [r.ok for r in results]
    if all(oks):
        status = 'success'
    elif any(oks):
        status = 'partial'
    else:
        status = 'failed'

    return CallDispatchResult(
        ok=status in ('success', 'partial'),
        status=status,
        channels=sorted(used_channels),
        results=results,
        message={
            'success': '叫应通道已全部送达',
            'partial': '部分目标叫应成功',
            'failed': '叫应失败，请检查短信/语音网关配置',
        }[status],
    )
