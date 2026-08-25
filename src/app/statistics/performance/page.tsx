'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  Bar,
  BarChart,
} from 'recharts';
import { Loader2, RefreshCw } from 'lucide-react';
import type { PerformanceStatistics } from '@/types';
import { getPerformanceStatistics } from '@/lib/services';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';

const INPUT_CLS =
  'h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500';

const LEVEL_CLS: Record<string, string> = {
  red: 'bg-red-500/20 text-red-400',
  orange: 'bg-orange-500/20 text-orange-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
  blue: 'bg-blue-500/20 text-blue-400',
};

function improveHint(
  pct: number | null | undefined,
  betterWhenPositive: 'time' | 'rate'
) {
  if (pct == null) return { text: '暂无环比', cls: 'text-muted-foreground' };
  if (betterWhenPositive === 'time') {
    // 正数 = 时间缩短 = 优化
    if (pct > 0) return { text: `↓ 较上月优化 ${pct}%`, cls: 'text-green-400' };
    if (pct < 0) return { text: `↑ 较上月变慢 ${Math.abs(pct)}%`, cls: 'text-red-400' };
    return { text: '与上月持平', cls: 'text-muted-foreground' };
  }
  if (pct > 0) return { text: `↑ ${pct}%`, cls: 'text-green-400' };
  if (pct < 0) return { text: `↓ ${Math.abs(pct)}%`, cls: 'text-red-400' };
  return { text: '与对比期持平', cls: 'text-muted-foreground' };
}

export default function PerformancePage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<PerformanceStatistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getPerformanceStatistics(year));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const s = data?.summary;
  const years = [thisYear, thisYear - 1, thisYear - 2];
  const respHint = improveHint(s?.response_improve_pct, 'time');
  const closeHint = improveHint(s?.closure_improve_pct, 'time');
  const rateHint = improveHint(s?.closure_rate_delta, 'rate');
  const covHint = improveHint(s?.coverage_delta, 'rate');

  const funnelMax = Math.max(
    data?.funnel.warnings_created || 1,
    data?.funnel.inspections_completed || 1,
    1
  );

  return (
    <div className="space-y-4">
      <PageHeader>
        <select
          className={cn(INPUT_CLS, 'w-auto')}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}年
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm"
        >
          <RefreshCw className="h-3.5 w-3.5" /> 刷新
        </button>
      </PageHeader>

      <p className="text-xs text-muted-foreground">
        效能来自预警确认/闭环、巡查覆盖与转移完成等真实业务时序；在预警中心确认、闭环或完成巡查后刷新即可更新。
        {data?.generated_at ? ` 更新于 ${data.generated_at}` : ''}
      </p>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Link
              href="/warning/current"
              className="rounded-lg border border-border bg-card p-4 hover:border-cyan-500/40"
            >
              <p className="text-xs text-muted-foreground">平均响应时间</p>
              <p className="mt-1 font-mono text-2xl font-bold text-cyan-400">
                {s?.avg_response_minutes ?? 0}
                <span className="ml-1 text-sm text-muted-foreground">分钟</span>
              </p>
              <p className={cn('mt-1 text-xs', respHint.cls)}>{respHint.text}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                样本 {s?.sample_response_count ?? 0} · 确认−创建
              </p>
            </Link>
            <Link
              href="/warning/history"
              className="rounded-lg border border-border bg-card p-4 hover:border-cyan-500/40"
            >
              <p className="text-xs text-muted-foreground">平均处置时长</p>
              <p className="mt-1 font-mono text-2xl font-bold text-cyan-400">
                {s?.avg_closure_hours ?? 0}
                <span className="ml-1 text-sm text-muted-foreground">小时</span>
              </p>
              <p className={cn('mt-1 text-xs', closeHint.cls)}>{closeHint.text}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                样本 {s?.sample_closure_count ?? 0} · 闭环−创建
              </p>
            </Link>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">闭环率</p>
              <p className="mt-1 font-mono text-2xl font-bold text-green-400">
                {s?.closure_rate ?? 0}%
              </p>
              <p className={cn('mt-1 text-xs', rateHint.cls)}>{rateHint.text}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                年度 {s?.year_closure_rate ?? 0}%
              </p>
            </div>
            <Link
              href="/inspection/records"
              className="rounded-lg border border-border bg-card p-4 hover:border-cyan-500/40"
            >
              <p className="text-xs text-muted-foreground">巡查覆盖率</p>
              <p className="mt-1 font-mono text-2xl font-bold text-cyan-400">
                {s?.inspect_coverage ?? 0}%
              </p>
              <p className={cn('mt-1 text-xs', covHint.cls)}>{covHint.text}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                已覆盖 {s?.hazards_covered ?? 0}/{s?.hazard_total ?? 0} 隐患点
              </p>
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Mini label="预警确认率" value={`${s?.confirm_rate ?? 0}%`} />
            <Mini
              label="巡查按时率"
              value={`${s?.inspect_ontime_rate ?? 0}%`}
              sub={`均耗时 ${s?.avg_inspect_duration ?? 0} 分`}
            />
            <Mini
              label="转移任务完成率"
              value={`${s?.evacuation_complete_rate ?? 0}%`}
              sub={`人员到位 ${s?.people_transfer_rate ?? 0}%`}
            />
            <Mini
              label="设备在线率"
              value={`${s?.device_online_rate ?? 0}%`}
              sub={`${s?.device_online ?? 0}/${s?.device_total ?? 0}`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-4 text-sm font-medium text-white">
                响应效率趋势（响应分钟 / 处置小时）
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={data?.monthly_efficiency ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="response"
                    stroke="#06b6d4"
                    fill="#06b6d4"
                    fillOpacity={0.12}
                    name="响应(分钟)"
                  />
                  <Area
                    type="monotone"
                    dataKey="closure"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.12}
                    name="处置(小时)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-4 text-sm font-medium text-white">月度闭环率</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data?.monthly_efficiency ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="closure_rate"
                    name="闭环率%"
                    fill="#22d3ee"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-medium text-white">业务闭环漏斗</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                {data?.loop.description}
              </p>
              <div className="space-y-2.5">
                {(
                  [
                    ['预警创建', data?.funnel.warnings_created],
                    ['已确认', data?.funnel.warnings_confirmed],
                    ['已闭环', data?.funnel.warnings_closed],
                    ['发起转移', data?.funnel.evacuations_launched],
                    ['转移完成', data?.funnel.evacuations_completed],
                    ['巡查完成', data?.funnel.inspections_completed],
                    ['隐患覆盖', data?.funnel.hazards_covered],
                  ] as Array<[string, number | undefined]>
                ).map(([label, val]) => {
                  const v = val ?? 0;
                  const pct = Math.min(100, Math.round((v / funnelMax) * 100));
                  return (
                    <div key={label}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-mono text-white">{v}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded bg-muted">
                        <div
                          className="h-full rounded bg-cyan-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-sm font-medium text-white">响应偏慢预警 Top</h3>
                <Link href="/warning/current" className="text-xs text-cyan-400 hover:underline">
                  去处理
                </Link>
              </div>
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                      <th className="px-3 py-2 text-left">预警</th>
                      <th className="px-3 py-2 text-left">隐患点</th>
                      <th className="px-3 py-2 text-left">等级</th>
                      <th className="px-3 py-2 text-right">响应(分)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.slow_responses ?? []).map((w) => (
                      <tr key={w.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-3 py-2">
                          <div className="font-mono text-cyan-400">{w.code}</div>
                          <div className="text-muted-foreground">{w.created_at}</div>
                        </td>
                        <td className="px-3 py-2 text-white">{w.hazard_name || '—'}</td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5',
                              LEVEL_CLS[w.level] || 'bg-muted text-muted-foreground'
                            )}
                          >
                            {w.level_display}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-yellow-400">
                          {w.response_minutes}
                        </td>
                      </tr>
                    ))}
                    {(data?.slow_responses?.length ?? 0) === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                          暂无已确认预警样本（请先在预警中心确认预警）
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Mini({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-lg font-semibold text-cyan-400">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
