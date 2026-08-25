'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Radio,
  Bell,
  ClipboardList,
  Users,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import type { DashboardStats } from '@/types';
import { getDashboardStats } from '@/lib/services';
import { cn } from '@/lib/utils';

const WARNING_COLORS: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  blue: '#3b82f6',
};

/** 等容器有实际宽高后再挂载 Recharts，避免网格布局下 0×0 空白 */
function ChartFrame({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) setReady(true);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn('relative w-full min-w-0', className)}>
      {ready ? (
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          图表加载中…
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStats(await getDashboardStats());
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-card p-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        正在加载驾驶舱数据…
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="space-y-3 rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-red-400">{error || '驾驶舱数据加载失败'}</p>
        <button
          type="button"
          onClick={load}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm"
        >
          <RefreshCw className="h-3.5 w-3.5" /> 重试
        </button>
      </div>
    );
  }

  const hazardTypeData = (stats.hazardTypeDistribution ?? []).map((d) => ({
    ...d,
    value: Number(d.value) || 0,
  }));
  const monthlyData = (stats.monthlyWarnings ?? []).map((m) => ({
    month: m.label || `${m.month}月`,
    warnings: Number(m.warnings) || 0,
    closed: Number(m.closed) || 0,
  }));
  const monitorTrend = stats.monitorTrend ?? [];
  const warnings = stats.latestWarnings ?? [];
  const todos = stats.todoTasks ?? [];
  const level = stats.warningByLevel;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">驾驶舱总览</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            汇总隐患、监测、预警、巡查与转移全链路数据；业务变更后自动刷新。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            数据更新时间：{stats.generatedAt || '—'}
          </span>
          <button
            type="button"
            onClick={load}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard
          icon={AlertTriangle}
          label="隐患总数"
          value={stats.hazardTotal.toLocaleString()}
          trend={stats.hazardTrend}
          trendLabel="较上月新增"
          color="text-red-400"
          bgColor="bg-red-500/10"
          href="/hazard/points"
          isRate
        />
        <StatCard
          icon={Radio}
          label="在线设备"
          value={`${stats.deviceOnline}/${stats.deviceTotal}`}
          trend={stats.deviceRate}
          trendLabel="在线率"
          color="text-cyan-400"
          bgColor="bg-cyan-500/10"
          href="/monitoring/devices"
          isRate
        />
        <StatCard
          icon={Bell}
          label="今日预警"
          value={stats.todayWarnings.toString()}
          trend={stats.warningTrend}
          trendLabel="较昨日"
          color="text-orange-400"
          bgColor="bg-orange-500/10"
          href="/warning/current"
        />
        <StatCard
          icon={ClipboardList}
          label="待处置"
          value={stats.pendingTasks.toString()}
          trend={stats.tasksTrend}
          trendLabel="较昨日新增待办"
          color="text-yellow-400"
          bgColor="bg-yellow-500/10"
          href="/inspection/dispatch"
          invertTrend
          hint={`预警${stats.warnActionable ?? 0} · 巡查${stats.inspectOpen ?? 0} · 转移${stats.evacOpen ?? 0}`}
        />
        <StatCard
          icon={Users}
          label="转移人数"
          value={stats.transferredPeople.toString()}
          trend={stats.peopleTrend}
          trendLabel="较昨日"
          color="text-green-400"
          bgColor="bg-green-500/10"
          href="/emergency/evacuation"
        />
      </div>

      {level && (
        <div className="grid grid-cols-4 gap-3">
          {(['red', 'orange', 'yellow', 'blue'] as const).map((k) => (
            <div
              key={k}
              className="rounded-lg border border-border bg-card px-3 py-2"
            >
              <p className="text-xs text-muted-foreground">
                {k === 'red' ? '红色' : k === 'orange' ? '橙色' : k === 'yellow' ? '黄色' : '蓝色'}
                未闭环
              </p>
              <p
                className="font-mono text-xl font-bold"
                style={{ color: WARNING_COLORS[k] }}
              >
                {level[k] ?? 0}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">近 24 小时监测曲线</h3>
            <Link href="/monitoring/realtime" className="text-xs text-cyan-400 hover:underline">
              实时监测
            </Link>
          </div>
          {monitorTrend.every(
            (p) => p.force === 0 && p.rainfall === 0 && p.displacement === 0
          ) ? (
            <p className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
              近 24 小时暂无监测数据上报
            </p>
          ) : (
            <ChartFrame className="h-[240px]">
              <AreaChart data={monitorTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} interval={3} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: '#f1f5f9' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="force"
                  name="牛顿力"
                  stroke="#06b6d4"
                  fill="#06b6d4"
                  fillOpacity={0.1}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="rainfall"
                  name="降雨量"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.1}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="displacement"
                  name="位移量"
                  stroke="#f97316"
                  fill="#f97316"
                  fillOpacity={0.1}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ChartFrame>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">最新预警动态</h3>
            <Link
              href="/warning/current"
              className="flex items-center gap-1 text-xs text-cyan-400 hover:underline"
            >
              查看全部 <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="max-h-[260px] space-y-3 overflow-y-auto">
            {warnings.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">暂无预警</p>
            ) : (
              warnings.map((w) => (
                <div
                  key={w.id}
                  className="flex items-start gap-3 rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted"
                >
                  <span
                    className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: WARNING_COLORS[w.level] || '#64748b' }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-white">
                        {w.hazardPointName || w.code}
                      </span>
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          color: WARNING_COLORS[w.level],
                          backgroundColor: `${WARNING_COLORS[w.level]}20`,
                        }}
                      >
                        {w.levelDisplay}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {w.triggerType || '—'} · {w.statusDisplay} · 置信度 {w.confidence}%
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {w.createTime.split(' ')[1]?.slice(0, 5)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">隐患类型分布</h3>
            <Link href="/statistics/disaster" className="text-xs text-cyan-400 hover:underline">
              灾害统计
            </Link>
          </div>
          {hazardTypeData.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">暂无隐患点</p>
          ) : (
            <div className="flex h-[200px] min-w-0 items-center gap-3">
              <ChartFrame className="h-[180px] w-[180px] shrink-0">
                <PieChart>
                  <Pie
                    data={hazardTypeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    isAnimationActive={false}
                  >
                    {hazardTypeData.map((entry, index) => (
                      <Cell key={`${entry.key}-${index}`} fill={entry.color || '#64748b'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ChartFrame>
              <div className="min-w-0 flex-1 space-y-2.5">
                {hazardTypeData.map((item) => {
                  const total = hazardTypeData.reduce((s, x) => s + x.value, 0) || 1;
                  const pct = Math.round((item.value / total) * 100);
                  return (
                    <div key={item.key || item.name}>
                      <div className="mb-1 flex items-center gap-2 text-xs">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="truncate text-muted-foreground">{item.name}</span>
                        <span className="ml-auto font-mono text-white">
                          {item.value}
                          <span className="ml-1 text-muted-foreground">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-1 overflow-hidden rounded bg-muted">
                        <div
                          className="h-full rounded"
                          style={{ width: `${pct}%`, backgroundColor: item.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-lg border border-border bg-card p-4">
          <h3 className="mb-4 text-sm font-semibold text-white">月度预警趋势</h3>
          <ChartFrame className="h-[200px]">
            <BarChart data={monthlyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="month"
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={28}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="warnings"
                name="预警数"
                fill="#f97316"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                dataKey="closed"
                name="处置数"
                fill="#22c55e"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ChartFrame>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">待办任务</h3>
            <span className="text-xs text-muted-foreground">{todos.length} 项</span>
          </div>
          <div className="max-h-[200px] space-y-2.5 overflow-y-auto">
            {todos.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">暂无待办</p>
            ) : (
              todos.map((task) => (
                <Link
                  key={task.id}
                  href={task.href}
                  className="flex items-center gap-3 rounded-lg bg-muted/50 p-2.5 transition-colors hover:bg-muted"
                >
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      task.priority === 'high' ? 'bg-red-400' : 'bg-cyan-400'
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{task.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {task.time} · {task.type}
                    </p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  trendLabel,
  color,
  bgColor,
  invertTrend,
  isRate,
  href,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  trend: number;
  trendLabel: string;
  color: string;
  bgColor: string;
  invertTrend?: boolean;
  isRate?: boolean;
  href: string;
  hint?: string;
}) {
  const isPositive = trend > 0;
  const isGood = invertTrend ? !isPositive : isPositive;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-cyan-500/40"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={`rounded-lg p-1.5 ${bgColor}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </div>
      <p className={`mt-2 font-mono text-2xl font-bold ${color}`}>{value}</p>
      <div className="mt-1 flex items-center gap-1">
        <TrendIcon className={`h-3 w-3 ${isGood ? 'text-green-400' : 'text-red-400'}`} />
        <span className={`text-xs ${isGood ? 'text-green-400' : 'text-red-400'}`}>
          {isRate ? `${trend}%` : `${isPositive ? '+' : ''}${trend}`} {trendLabel}
        </span>
      </div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </Link>
  );
}
