'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import {
  getChannelsStatus,
  getSystemConfig,
  getWeather,
  saveSystemConfig,
  type ChannelsStatus,
  type SystemConfig,
  type WeatherInfo,
} from '@/lib/platform-api';
import { PageHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';

const INPUT =
  'mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500';

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={cn('h-5 w-9 rounded-full p-0.5 transition-colors', on ? 'bg-cyan-600' : 'bg-slate-700')}
    >
      <div className={cn('h-4 w-4 rounded-full bg-white transition-transform', on ? 'ml-auto' : '')} />
    </button>
  );
}

export default function ConfigPage() {
  const [form, setForm] = useState<SystemConfig | null>(null);
  const [channels, setChannels] = useState<ChannelsStatus | null>(null);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [weatherLat, setWeatherLat] = useState('30.67');
  const [weatherLng, setWeatherLng] = useState('104.06');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cfg, ch, w] = await Promise.all([
        getSystemConfig(),
        getChannelsStatus(),
        getWeather(false),
      ]);
      setForm(cfg);
      setChannels(ch);
      setWeather(w);
      const extra = (cfg as SystemConfig).extra || {};
      if (extra.weather_lat != null) setWeatherLat(String(extra.weather_lat));
      if (extra.weather_lng != null) setWeatherLng(String(extra.weather_lng));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setMsg('');
    setError('');
    try {
      const saved = await saveSystemConfig({
        ...form,
        extra: {
          ...(form.extra || {}),
          weather_lat: Number(weatherLat) || 30.67,
          weather_lng: Number(weatherLng) || 104.06,
        },
      });
      setForm(saved);
      const w = await getWeather(true);
      setWeather(w);
      setChannels(await getChannelsStatus());
      setMsg('已保存，天气已按坐标刷新');
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const refreshWeather = async () => {
    try {
      const w = await getWeather(true);
      setWeather(w);
      setMsg(`天气已刷新（${w.provider || 'open-meteo'}）`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '天气刷新失败');
    }
  };

  if (loading || !form) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        actions={
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-cyan-600 px-3 text-sm text-white disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} 保存配置
          </button>
        }
      />
      {msg && (
        <div className="rounded border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-300">
          {msg}
        </div>
      )}
      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-4 text-sm font-medium text-white">基本设置</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">系统名称</label>
              <input
                className={INPUT}
                value={form.system_name}
                onChange={(e) => setForm({ ...form, system_name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">预警阈值(牛顿力)</label>
              <input
                className={cn(INPUT, 'font-mono')}
                value={form.force_threshold}
                onChange={(e) => setForm({ ...form, force_threshold: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">自动呼叫超时(秒)</label>
              <input
                type="number"
                className={cn(INPUT, 'font-mono')}
                value={form.call_timeout_sec}
                onChange={(e) =>
                  setForm({ ...form, call_timeout_sec: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">实况天气（Open-Meteo）</h3>
            <button
              type="button"
              onClick={() => void refreshWeather()}
              className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline"
            >
              <RefreshCw className="h-3 w-3" /> 拉取实况
            </button>
          </div>
          <div className="mb-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-3">
            <p className="text-2xl font-bold text-white">
              {weather?.temp_c ?? form.weather_temp_c}°C
              <span className="ml-2 text-base font-normal text-cyan-300">
                {weather?.text || form.weather_text}
              </span>
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {weather?.provider || 'cache'}
              {weather?.humidity != null ? ` · 湿度 ${weather.humidity}%` : ''}
              {weather?.wind_kmh != null ? ` · 风速 ${weather.wind_kmh} km/h` : ''}
              {weather?.cached ? ' · 缓存' : ''}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">测点纬度</label>
              <input
                className={cn(INPUT, 'font-mono')}
                value={weatherLat}
                onChange={(e) => setWeatherLat(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">测点经度</label>
              <input
                className={cn(INPUT, 'font-mono')}
                value={weatherLng}
                onChange={(e) => setWeatherLng(e.target.value)}
              />
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            保存后写入配置并强制刷新；未配 Key，使用公开 Open-Meteo。
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-4 text-sm font-medium text-white">通知开关</h3>
          <div className="space-y-3">
            {(
              [
                ['notify_sms', '短信通知'],
                ['notify_call', '电话呼叫'],
                ['notify_app', 'APP/站内推送'],
                ['notify_email', '邮件通知'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Toggle on={Boolean(form[key])} onChange={(v) => setForm({ ...form, [key]: v })} />
              </div>
            ))}
          </div>
          <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">
            APP 未配 Webhook 时写入顶栏铃铛；邮件需 EMAIL_WEBHOOK_URL 或 SMTP_*；短信/语音需
            SMS_WEBHOOK_URL / VOICE_WEBHOOK_URL。
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-4 text-sm font-medium text-white">通道 / 路网就绪</h3>
          <ul className="space-y-2 text-xs">
            {channels &&
              (
                [
                  ['sms', '短信'],
                  ['voice', '语音'],
                  ['email', '邮件'],
                  ['app', 'APP'],
                  ['route', '转移路网'],
                  ['weather', '天气'],
                ] as const
              ).map(([key, label]) => {
                const row = channels[key];
                return (
                  <li
                    key={key}
                    className="flex items-start justify-between gap-2 rounded border border-border/60 bg-muted/20 px-2.5 py-2"
                  >
                    <div>
                      <p className="font-medium text-white">
                        {label}
                        <span className="ml-2 font-mono text-[10px] text-cyan-400">
                          {row.mode}
                        </span>
                      </p>
                      <p className="mt-0.5 text-muted-foreground">{row.hint}</p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[10px]',
                        row.ready
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-amber-500/15 text-amber-400'
                      )}
                    >
                      {row.ready ? '可用' : '待配'}
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
      </div>
    </div>
  );
}
