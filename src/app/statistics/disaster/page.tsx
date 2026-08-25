'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Loader2, RefreshCw } from 'lucide-react';
import type { DisasterStatistics } from '@/types';
import { getDisasterStatistics } from '@/lib/services';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';

const LEVEL_CLS: Record<string, string> = {
  red: 'bg-red-500/20 text-red-400',
  orange: 'bg-orange-500/20 text-orange-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
  blue: 'bg-blue-500/20 text-blue-400',
};

const INPUT_CLS =
  'h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500';

export default function DisasterStatsPage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<DisasterStatistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getDisasterStatistics(year);
      setData(res);
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
        数据来自隐患台账、预警记录、转移任务与巡查闭环；操作业务模块后统计自动更新。
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
            <StatCard
              label="隐患点总数"
              value={String(s?.hazard_total ?? 0)}
              hint={
                (s?.hazard_trend_pct ?? 0) >= 0
                  ? `本月新增 ${s?.hazard_new_month ?? 0} · ↑ ${s?.hazard_trend_pct ?? 0}%`
                  : `本月新增 ${s?.hazard_new_month ?? 0} · ↓ ${Math.abs(s?.hazard_trend_pct ?? 0)}%`
              }
              hintCls={(s?.hazard_trend_pct ?? 0) > 0 ? 'text-yellow-400' : 'text-green-400'}
              href="/hazard/points"
            />
            <StatCard
              label="本月新增预警"
              value={String(s?.month_warnings ?? 0)}
              hint={
                (s?.month_warnings_delta ?? 0) >= 0
                  ? `较上月 ↑ ${s?.month_warnings_delta ?? 0} 件`
                  : `较上月 ↓ ${Math.abs(s?.month_warnings_delta ?? 0)} 件`
              }
              hintCls={(s?.month_warnings_delta ?? 0) > 0 ? 'text-red-400' : 'text-green-400'}
              href="/warning/current"
            />
            <StatCard
              label="本月预警闭环"
              value={String(s?.month_closed_warnings ?? 0)}
              hint={`闭环率 ${s?.closure_rate ?? 0}% · 在办 ${s?.open_warnings ?? 0}`}
              hintCls="text-green-400"
              href="/warning/history"
            />
            <StatCard
              label="累计转移人数"
              value={String(s?.year_transferred_people ?? 0)}
              hint={`本年度 · 需转 ${s?.year_need_transfer ?? 0} · 预警衍生 ${s?.evacuations_from_warning ?? 0}`}
              hintCls="text-muted-foreground"
              href="/emergency/evacuation"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniStat label="威胁人数" value={String(s?.threat_people_total ?? 0)} />
            <MiniStat label="威胁房屋" value={String(s?.threat_houses_total ?? 0)} />
            <MiniStat
              label="本月巡查完成"
              value={String(s?.inspection_done_month ?? 0)}
              sub={`发现问题 ${s?.inspection_issues_month ?? 0}`}
            />
            <MiniStat
              label="年度预警闭环率"
              value={`${s?.year_closure_rate ?? 0}%`}
              sub={`预警 ${s?.year_warnings ?? 0} 件`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-4 text-sm font-medium text-white">月度预警趋势</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data?.monthly_warnings ?? []}>
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
                    allowDecimals={false}
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
                  <Bar dataKey="count" name="新增" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="closed" name="已闭环" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-4 text-sm font-medium text-white">灾害类型分布（隐患点）</h3>
              {(data?.type_distribution?.length ?? 0) === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">暂无隐患点数据</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={data?.type_distribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={4}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) =>
                        `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {(data?.type_distribution ?? []).map((entry, index) => (
                        <Cell key={index} fill={entry.color || '#64748b'} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-medium text-white">风险等级分布</h3>
              <div className="space-y-2">
                {(data?.level_distribution ?? []).map((item) => {
                  const total = s?.hazard_total || 1;
                  const pct = Math.round((item.value / total) * 100);
                  return (
                    <div key={item.key || item.name}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-muted-foreground">{item.name}</span>
                        <span className="font-mono text-white">
                          {item.value}（{pct}%）
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded bg-muted">
                        <div
                          className="h-full rounded"
                          style={{ width: `${pct}%`, backgroundColor: item.color || '#06b6d4' }}
                        />
                      </div>
                    </div>
                  );
                })}
                {(data?.level_distribution?.length ?? 0) === 0 && (
                  <p className="text-sm text-muted-foreground">暂无数据</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-medium text-white">区域分布（镇）</h3>
              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-2 text-left font-medium">区域</th>
                      <th className="py-2 text-right font-medium">隐患</th>
                      <th className="py-2 text-right font-medium">威胁人</th>
                      <th className="py-2 text-right font-medium">年度预警</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.region_distribution ?? []).map((r) => (
                      <tr key={r.name} className="border-b border-border/50">
                        <td className="py-2 text-white">{r.name}</td>
                        <td className="py-2 text-right font-mono text-cyan-400">
                          {r.hazard_count}
                        </td>
                        <td className="py-2 text-right font-mono text-muted-foreground">
                          {r.threat_people}
                        </td>
                        <td className="py-2 text-right font-mono text-yellow-400">
                          {r.warning_count}
                        </td>
                      </tr>
                    ))}
                    {(data?.region_distribution?.length ?? 0) === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-muted-foreground">
                          暂无区域数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-sm font-medium text-white">高风险隐患点</h3>
                <Link href="/hazard/points" className="text-xs text-cyan-400 hover:underline">
                  台账
                </Link>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                      <th className="px-3 py-2 text-left">编号</th>
                      <th className="px-3 py-2 text-left">名称</th>
                      <th className="px-3 py-2 text-left">等级</th>
                      <th className="px-3 py-2 text-right">威胁</th>
                      <th className="px-3 py-2 text-right">未闭环预警</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.high_risk_points ?? []).map((p) => (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-3 py-2 font-mono text-cyan-400">{p.code}</td>
                        <td className="px-3 py-2 text-white">
                          {p.name}
                          <div className="text-muted-foreground">
                            {p.type_display} · {p.village || p.town || '—'}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5',
                              LEVEL_CLS[p.level] || 'bg-muted text-muted-foreground'
                            )}
                          >
                            {p.level_display}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{p.threat_people}</td>
                        <td className="px-3 py-2 text-right font-mono text-yellow-400">
                          {p.open_warning_count}
                        </td>
                      </tr>
                    ))}
                    {(data?.high_risk_points?.length ?? 0) === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                          暂无红/橙色隐患点
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-sm font-medium text-white">本月预警清单</h3>
                <Link href="/warning/current" className="text-xs text-cyan-400 hover:underline">
                  预警中心
                </Link>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                      <th className="px-3 py-2 text-left">预警</th>
                      <th className="px-3 py-2 text-left">隐患点</th>
                      <th className="px-3 py-2 text-left">状态</th>
                      <th className="px-3 py-2 text-left">转移</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.recent_warnings ?? []).map((w) => (
                      <tr key={w.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-3 py-2">
                          <div className="font-mono text-cyan-400">{w.code}</div>
                          <div className="text-muted-foreground">{w.created_at}</div>
                        </td>
                        <td className="px-3 py-2 text-white">
                          {w.hazard_name}
                          <div className="font-mono text-muted-foreground">{w.hazard_code}</div>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5',
                              LEVEL_CLS[w.level] || 'bg-muted text-muted-foreground'
                            )}
                          >
                            {w.level_display}
                          </span>
                          <div className="mt-0.5 text-muted-foreground">{w.status_display}</div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {w.has_evacuation ? (
                            <span className="text-green-400">已发起</span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                    {(data?.recent_warnings?.length ?? 0) === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                          本月暂无预警
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {data?.loop && (
            <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
              业务闭环：{data.loop.description}。当前预警/紧急状态隐患{' '}
              <span className="font-mono text-yellow-400">
                {data.loop.hazard_in_warning_or_emergency}
              </span>{' '}
              处；由预警衍生转移任务{' '}
              <span className="font-mono text-cyan-400">{data.loop.warning_with_evacuation}</span>{' '}
              条。
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  hintCls,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  hintCls?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-cyan-500/40"
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold text-white">{value}</p>
      <p className={cn('mt-1 text-xs', hintCls)}>{hint}</p>
    </Link>
  );
}

function MiniStat({
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
