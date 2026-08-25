'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Phone,
  MessageSquare,
  FileText,
  CheckCircle,
  Clock,
  AlertTriangle,
  Volume2,
  RefreshCw,
  Loader2,
  Download,
} from 'lucide-react';
import type { WarningRecord, WarningRelated, WarningStats } from '@/types';
import { getStoredUser } from '@/lib/auth';
import {
  analyzeWarning,
  callWarning,
  closeWarning,
  confirmWarning,
  exportWarnings,
  getWarning,
  getWarningList,
  getWarningRelated,
  getWarningStats,
  processWarning,
  publishWarning,
  type CallDispatchResult,
} from '@/lib/services';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { canWriteModule } from '@/lib/permissions';

const LEVEL_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  red: { color: 'text-red-400', bg: 'bg-red-500/20', label: '红色' },
  orange: { color: 'text-orange-400', bg: 'bg-orange-500/20', label: '橙色' },
  yellow: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: '黄色' },
  blue: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: '蓝色' },
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: 'text-red-400', bg: 'bg-red-500/20', label: '待确认' },
  confirmed: { color: 'text-orange-400', bg: 'bg-orange-500/20', label: '已确认' },
  analyzing: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: '研判中' },
  published: { color: 'text-cyan-400', bg: 'bg-cyan-500/20', label: '已发布' },
  processing: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: '处置中' },
  closed: { color: 'text-green-400', bg: 'bg-green-500/20', label: '已闭环' },
};

const FILTER_TABS = [
  { key: 'open', label: '未闭环' },
  { key: 'pending', label: '待确认' },
  { key: 'processing', label: '处置中' },
  { key: 'closed', label: '已闭环' },
] as const;

const TRIGGER_LABELS: Record<string, string> = {
  force: '牛顿力',
  rainfall: '降雨量',
  displacement: '位移',
  moisture: '含水量',
  stress: '应力',
  strain: '应变',
  temperature: '温度',
  value: '监测值',
  change_rate: '变化率',
  data_type: '数据类型',
  unit: '单位',
  device_id: '设备ID',
  device_code: '设备编号',
  channel: '通道',
  model_code: '预警模型',
  model_name: '模型名称',
  thresholds: '触发阈值',
};

function formatTriggerValue(key: string, val: unknown): string {
  if (val == null) return '—';
  if (key === 'thresholds' && typeof val === 'object' && !Array.isArray(val)) {
    const t = val as Record<string, unknown>;
    const y = t.yellow ?? t.Y;
    const o = t.orange ?? t.O;
    const r = t.red ?? t.R;
    const parts = [`黄${y ?? '—'}`, `橙${o ?? '—'}`, `红${r ?? '—'}`];
    if (t.change_rate_red != null) parts.push(`变化率红${t.change_rate_red}`);
    return parts.join(' / ');
  }
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

function formatTime(v?: string) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return v;
  }
}

function actorName() {
  const u = getStoredUser();
  if (!u) return '值班员';
  return u.first_name || u.username;
}

export default function WarningCurrentPage() {
  const [warnings, setWarnings] = useState<WarningRecord[]>([]);
  const [selected, setSelected] = useState<WarningRecord | null>(null);
  const [related, setRelated] = useState<WarningRelated | null>(null);
  const [stats, setStats] = useState<WarningStats | null>(null);
  const [filter, setFilter] = useState<(typeof FILTER_TABS)[number]['key']>('open');
  const [levelFilter, setLevelFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [callChannels, setCallChannels] = useState<Array<'sms' | 'voice'>>(['sms', 'voice']);
  const [lastDispatch, setLastDispatch] = useState<CallDispatchResult | null>(null);
  const canWrite = canWriteModule('warning');

  const loadStats = useCallback(async () => {
    try {
      setStats(await getWarningStats());
    } catch {
      setStats(null);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getWarningList({
        page: 1,
        pageSize: 50,
        statusGroup: filter,
        level: levelFilter || undefined,
      });
      setWarnings(res.list);
      setSelected((prev) => {
        if (!res.list.length) return null;
        if (prev && res.list.some((w) => w.dbId === prev.dbId)) {
          return res.list.find((w) => w.dbId === prev.dbId) || res.list[0];
        }
        return res.list[0];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setWarnings([]);
    } finally {
      setLoading(false);
    }
  }, [filter, levelFilter]);

  const loadDetail = useCallback(async (w: WarningRecord) => {
    try {
      const [detail, rel] = await Promise.all([
        getWarning(w.dbId),
        getWarningRelated(w.dbId),
      ]);
      setSelected(detail);
      setRelated(rel);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载详情失败');
    }
  }, []);

  useEffect(() => {
    loadList();
    loadStats();
  }, [loadList, loadStats]);

  useEffect(() => {
    if (selected) loadDetail(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随选中 id 刷新详情
  }, [selected?.dbId]);

  useEffect(() => {
    const t = setInterval(() => {
      loadList();
      loadStats();
    }, 30000);
    return () => clearInterval(t);
  }, [loadList, loadStats]);

  const runAction = async (
    key: string,
    fn: () => Promise<WarningRecord & { dispatch?: CallDispatchResult }>,
    successText: string
  ) => {
    if (!selected) return;
    if (!canWrite && key !== '') {
      setError('当前角色无预警写权限');
      return;
    }
    setActing(key);
    setMsg('');
    try {
      const updated = await fn();
      setSelected(updated);
      if (updated.dispatch) {
        setLastDispatch(updated.dispatch);
        const st = updated.dispatch.status;
        if (st === 'failed') {
          setError(updated.dispatch.message || '叫应失败');
          setMsg('');
        } else if (st === 'partial') {
          setMsg(`部分叫应成功：${updated.dispatch.message}`);
        } else {
          setMsg(`${successText}（${updated.dispatch.message || '通道已派发'}）`);
        }
      } else {
        setMsg(successText);
      }
      await loadList();
      await loadStats();
      setRelated(await getWarningRelated(updated.dbId));
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
      setMsg('');
    } finally {
      setActing('');
    }
  };

  const handleClose = async () => {
    if (!selected) return;
    const reason = window.prompt('请输入闭环原因', '风险已解除，监测恢复正常');
    if (!reason?.trim()) return;
    await runAction('close', () => closeWarning(selected.dbId, reason.trim()), '已闭环归档');
  };

  const openByLevel = stats?.open_by_level;
  const user = getStoredUser();

  return (
    <div className="space-y-4">
      <PageHeader>
          <span className="flex items-center gap-1 text-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="font-mono text-red-400">红色{openByLevel?.red ?? 0}</span>
          </span>
          <span className="flex items-center gap-1 text-sm">
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            <span className="font-mono text-orange-400">橙色{openByLevel?.orange ?? 0}</span>
          </span>
          <span className="flex items-center gap-1 text-sm">
            <span className="h-2 w-2 rounded-full bg-yellow-500" />
            <span className="font-mono text-yellow-400">黄色{openByLevel?.yellow ?? 0}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            未闭环 {stats?.open ?? 0} · 待确认 {stats?.pending ?? 0}
          </span>
          <button
            onClick={() => {
              loadList();
              loadStats();
            }}
            className="flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs hover:bg-accent"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> 刷新
          </button>
          <button
            onClick={() =>
              exportWarnings({ statusGroup: filter, level: levelFilter || undefined }).catch((e) =>
                alert(e instanceof Error ? e.message : '导出失败')
              )
            }
            className="flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs hover:bg-accent"
          >
            <Download className="h-3.5 w-3.5" /> 导出
          </button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm transition-colors',
              filter === tab.key
                ? 'bg-cyan-600 font-medium text-white'
                : 'border border-border bg-card text-muted-foreground hover:text-white'
            )}
          >
            {tab.label}
          </button>
        ))}
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="ml-auto h-9 rounded-lg border border-border bg-card px-3 text-sm"
        >
          <option value="">全部等级</option>
          <option value="red">红色</option>
          <option value="orange">橙色</option>
          <option value="yellow">黄色</option>
          <option value="blue">蓝色</option>
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}
      {msg && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300">
          {msg}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* 列表 */}
        <div className="w-full shrink-0 space-y-2 lg:w-64">
          {loading && !warnings.length ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
            </div>
          ) : warnings.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              暂无预警
            </div>
          ) : (
            warnings.map((w) => {
              const lc = LEVEL_CONFIG[w.level];
              return (
                <button
                  key={w.dbId}
                  onClick={() => setSelected(w)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-all',
                    selected?.dbId === w.dbId
                      ? 'border-cyan-500 bg-cyan-500/10'
                      : 'border-border bg-card hover:border-slate-600'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={cn('h-4 w-4', lc.color)} />
                    <span className="font-mono text-xs text-cyan-400">{w.id}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-white">{w.hazardPointName}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', lc.bg, lc.color)}>
                      {lc.label}
                    </span>
                    <span className={cn('text-[10px]', STATUS_CONFIG[w.status]?.color)}>
                      {STATUS_CONFIG[w.status]?.label}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {formatTime(w.createTime).split(' ')[1]?.slice(0, 5) || ''}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* 详情 */}
        {selected ? (
          <div className="min-w-0 flex-1 space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">预警基本信息</h3>
              </div>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <InfoRow label="预警编号" value={selected.id} mono />
                <InfoRow
                  label="隐患点"
                  value={`${selected.hazardPointName} (${selected.hazardPointId})`}
                />
                <InfoRow label="预警等级">
                  <span className={cn('font-medium', LEVEL_CONFIG[selected.level].color)}>
                    {LEVEL_CONFIG[selected.level].label}
                  </span>
                </InfoRow>
                <InfoRow label="状态">
                  <span className={STATUS_CONFIG[selected.status]?.color}>
                    {STATUS_CONFIG[selected.status]?.label}
                  </span>
                </InfoRow>
                <InfoRow label="触发时间" value={formatTime(selected.createTime)} />
                <InfoRow label="触发条件" value={selected.triggerType || '—'} />
                <InfoRow
                  label="置信度"
                  value={`${selected.confidence}%`}
                  valueClass="font-mono text-cyan-400"
                />
                <InfoRow
                  label="叫应"
                  value={selected.callStatus || '未叫应'}
                  valueClass="text-white"
                />
              </div>
              {lastDispatch && (
                <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
                  <p className="font-medium text-white">
                    最近叫应：{lastDispatch.status}
                    {lastDispatch.channels?.length
                      ? ` · 通道 ${lastDispatch.channels.join('+')}`
                      : ''}
                  </p>
                  <p className="mt-1 text-muted-foreground">{lastDispatch.message}</p>
                  <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-muted-foreground">
                    {(lastDispatch.results || []).map((r, i) => (
                      <li key={i} className="flex flex-wrap gap-x-2">
                        <span className={r.ok ? 'text-emerald-400' : 'text-red-400'}>
                          {r.ok ? '✓' : '✗'}
                        </span>
                        <span>{r.target}</span>
                        <span>{r.channel}/{r.provider}</span>
                        <span className="break-all">{r.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-white">关联监测数据</h3>
              <div className="space-y-3">
                {Object.entries(selected.triggerValue || {})
                  .filter(([k]) => !['device_id'].includes(k))
                  .map(([key, val]) => {
                    const isObj = val !== null && typeof val === 'object';
                    const num = typeof val === 'number' ? val : Number(val);
                    const showBar =
                      !isObj && !Number.isNaN(num) && typeof val !== 'string' && key !== 'device_id';
                    const max = key.includes('rate') ? 100 : 100;
                    const pct = showBar ? Math.min((num / max) * 100, 100) : 0;
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-xs text-muted-foreground">
                          {TRIGGER_LABELS[key] ?? key}
                        </span>
                        {showBar ? (
                          <>
                            <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-orange-500' : 'bg-cyan-500'
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-16 text-right font-mono text-xs text-white">{num}</span>
                          </>
                        ) : (
                          <span className="min-w-0 flex-1 break-all font-mono text-xs text-white">
                            {formatTriggerValue(key, val)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                {!Object.keys(selected.triggerValue || {}).length && (
                  <p className="text-xs text-muted-foreground">暂无触发值明细</p>
                )}
              </div>
              {related?.latest_data?.length ? (
                <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto border-t border-border pt-3 text-xs text-muted-foreground">
                  {related.latest_data.slice(0, 6).map((d, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>
                        {d.data_type} {d.value}
                        {d.unit}
                      </span>
                      <span>{formatTime(String(d.record_time))}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">处置时间线</h3>
              </div>
              <div className="space-y-3">
                {selected.timeline.map((event, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div
                      className={cn(
                        'mt-1 h-3 w-3 shrink-0 rounded-full',
                        event.status === 'completed'
                          ? 'bg-green-500'
                          : event.status === 'current'
                            ? 'bg-cyan-500 animate-pulse'
                            : 'bg-slate-600'
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'text-sm',
                            event.status === 'pending' ? 'text-muted-foreground' : 'text-white'
                          )}
                        >
                          {event.event}
                          {event.actor ? (
                            <span className="ml-2 text-xs text-muted-foreground">@{event.actor}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {formatTime(event.time)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
            选择左侧预警查看详情
          </div>
        )}

        {/* 操作 */}
        {selected && (
          <div className="w-full shrink-0 space-y-4 lg:w-64">
            <div className="rounded-lg border border-border bg-card p-4">
              <h4 className="mb-3 text-sm font-semibold text-white">当前处置人</h4>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm font-medium text-white">{user?.first_name || user?.username || '未登录'}</p>
                <p className="text-xs text-muted-foreground">
                  {user?.role_display || user?.role || '值班席'} · {user?.department || '—'}
                </p>
              </div>

              <div className="mt-4 space-y-2">
                <ActionBtn
                  disabled={selected.status !== 'pending' || !!acting || !canWrite}
                  loading={acting === 'confirm'}
                  className="bg-orange-600 hover:bg-orange-700"
                  icon={CheckCircle}
                  label="确认预警"
                  onClick={() =>
                    runAction(
                      'confirm',
                      () => confirmWarning(selected.dbId, actorName()),
                      '已确认预警'
                    )
                  }
                />
                <ActionBtn
                  disabled={
                    !['confirmed', 'analyzing'].includes(selected.status) ||
                    !!acting ||
                    !canWrite
                  }
                  loading={acting === 'analyze'}
                  className="bg-yellow-600 hover:bg-yellow-700"
                  icon={MessageSquare}
                  label="会商研判"
                  onClick={() =>
                    runAction(
                      'analyze',
                      () =>
                        analyzeWarning(selected.dbId, {
                          note: '值班会商研判',
                          conclusion: '维持预警等级，启动应急准备',
                        }),
                      '已进入研判'
                    )
                  }
                />
                <ActionBtn
                  disabled={
                    !['confirmed', 'analyzing'].includes(selected.status) ||
                    !!acting ||
                    !canWrite
                  }
                  loading={acting === 'publish'}
                  className="bg-red-600 hover:bg-red-700"
                  icon={Volume2}
                  label="发布预警"
                  onClick={() =>
                    runAction(
                      'publish',
                      () => publishWarning(selected.dbId, actorName()),
                      '预警已发布'
                    )
                  }
                />
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
                  <span className="w-full text-muted-foreground">叫应通道</span>
                  {(['sms', 'voice'] as const).map((ch) => (
                    <label key={ch} className="inline-flex items-center gap-1.5 text-slate-300">
                      <input
                        type="checkbox"
                        checked={callChannels.includes(ch)}
                        disabled={!canWrite}
                        onChange={(e) => {
                          setCallChannels((prev) => {
                            if (e.target.checked) return [...new Set([...prev, ch])];
                            return prev.filter((x) => x !== ch);
                          });
                        }}
                      />
                      {ch === 'sms' ? '短信' : '语音'}
                    </label>
                  ))}
                </div>
                <ActionBtn
                  disabled={
                    selected.status === 'closed' ||
                    !!acting ||
                    !canWrite ||
                    callChannels.length === 0
                  }
                  loading={acting === 'call'}
                  className="bg-cyan-600 hover:bg-cyan-700"
                  icon={Phone}
                  label="一键叫应"
                  onClick={() =>
                    runAction(
                      'call',
                      () =>
                        callWarning(selected.dbId, actorName(), {
                          channels: callChannels,
                        }),
                      '叫应已派发'
                    )
                  }
                />
                <ActionBtn
                  disabled={
                    !['published', 'processing', 'analyzing', 'confirmed'].includes(
                      selected.status
                    ) ||
                    !!acting ||
                    !canWrite
                  }
                  loading={acting === 'process'}
                  className="bg-blue-600 hover:bg-blue-700"
                  icon={FileText}
                  label="进入处置"
                  onClick={() =>
                    runAction('process', () => processWarning(selected.dbId), '已进入处置中')
                  }
                />
                <ActionBtn
                  disabled={selected.status === 'closed' || !!acting || !canWrite}
                  loading={acting === 'close'}
                  className="bg-green-600 hover:bg-green-700"
                  icon={CheckCircle}
                  label="处置完成/闭环"
                  onClick={handleClose}
                />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                闭环路径：确认 → 研判 → 发布 → 叫应/处置 → 闭环。配置 SMS_WEBHOOK_URL /
                VOICE_WEBHOOK_URL 后走真实短信/语音网关；闭环后隐患点无未结预警将回落为「关注」。
                {!canWrite && ' 当前角色为只读，无法执行处置操作。'}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h4 className="mb-3 text-sm font-semibold text-white">关联信息</h4>
              <div className="space-y-2 text-sm">
                <InfoRow
                  label="威胁人数"
                  value={`${related?.hazard_point.threat_people ?? '—'}人`}
                  valueClass="font-mono text-white"
                />
                <InfoRow
                  label="威胁房屋"
                  value={`${related?.hazard_point.threat_houses ?? '—'}户`}
                />
                <InfoRow
                  label="责任人"
                  value={
                    related?.hazard_point.responsible_person
                      ? `${related.hazard_point.responsible_person}${
                          related.hazard_point.contact_phone
                            ? `(${related.hazard_point.contact_phone})`
                            : ''
                        }`
                      : '—'
                  }
                />
                <InfoRow
                  label="监测设备"
                  value={`${related?.devices.length ?? 0} 台`}
                  valueClass="font-mono text-cyan-400"
                />
                <InfoRow
                  label="转移任务"
                  value={
                    related?.evacuations?.[0]
                      ? `${related.evacuations[0].code} · ${related.evacuations[0].status}`
                      : '无'
                  }
                />
                {related?.evacuations?.[0]?.shelter_name && (
                  <InfoRow label="转移场所" value={related.evacuations[0].shelter_name} />
                )}
                {related?.evacuations?.[0]?.grid_worker && (
                  <InfoRow
                    label="网格员"
                    value={`${related.evacuations[0].grid_worker}${
                      related.evacuations[0].grid_phone
                        ? `(${related.evacuations[0].grid_phone})`
                        : ''
                    }`}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
  valueClass,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  valueClass?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      {children ?? (
        <span className={cn('text-right text-white', mono && 'font-mono text-cyan-400', valueClass)}>
          {value}
        </span>
      )}
    </div>
  );
}

function ActionBtn({
  label,
  icon: Icon,
  onClick,
  className,
  disabled,
  loading,
}: {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        className
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}
