'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  ClipboardList,
  Maximize2,
  Radio,
  RefreshCw,
  ShieldAlert,
  Siren,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getDashboardStats, getEvacuationMapGeoJSON } from '@/lib/services';
import type { DashboardStats, EvacuationGeoJSON } from '@/types';
import { cn } from '@/lib/utils';

const LEVEL_COLOR: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  blue: '#3b82f6',
  green: '#22c55e',
};

const LEVEL_LABEL: Record<string, string> = {
  red: '红色',
  orange: '橙色',
  yellow: '黄色',
  blue: '蓝色',
  green: '绿色',
};

function Panel({
  title,
  children,
  className,
  extra,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  extra?: ReactNode;
}) {
  return (
    <section
      className={cn(
        'relative flex min-h-0 flex-col overflow-hidden rounded-lg border border-cyan-500/25 bg-slate-950/75 shadow-[inset_0_0_40px_rgba(6,182,212,0.04)] backdrop-blur-sm',
        className
      )}
    >
      <div className="pointer-events-none absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
      <div className="flex items-center justify-between border-b border-cyan-500/15 px-3 py-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-cyan-300">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
          {title}
        </h2>
        {extra}
      </div>
      <div className="min-h-0 flex-1 p-3">{children}</div>
    </section>
  );
}

function SituationalMap({
  hotspots,
  geojson,
}: {
  hotspots: NonNullable<DashboardStats['hotspots']>;
  geojson: EvacuationGeoJSON | null;
}) {
  const points = useMemo(() => {
    const fromHp = hotspots
      .filter((h) => h.longitude != null && h.latitude != null)
      .map((h) => ({
        id: `hp-${h.id}`,
        lng: h.longitude as number,
        lat: h.latitude as number,
        name: h.name,
        level: h.level,
        kind: 'hazard' as const,
        meta: `${h.code} · 威胁 ${h.threatPeople}人`,
      }));
    const fromRoute: typeof fromHp = [];
    for (const f of geojson?.features || []) {
      if (f.geometry.type !== 'Point') continue;
      const [lng, lat] = f.geometry.coordinates as [number, number];
      const p = (f.properties || {}) as Record<string, unknown>;
      fromRoute.push({
        id: `pt-${String(p.id || lng)}`,
        lng,
        lat,
        name: String(p.name || p.shelter_name || '安置点'),
        level: String(p.level || 'blue'),
        kind: p.kind === 'shelter' || String(p.type || '').includes('shelter')
          ? ('shelter' as const)
          : ('route' as const),
        meta: String(p.code || p.status || ''),
      });
    }
    return [...fromHp, ...fromRoute];
  }, [hotspots, geojson]);

  const routes = useMemo(() => {
    return (geojson?.features || [])
      .filter((f) => f.geometry.type === 'LineString')
      .map((f, i) => ({
        id: `line-${i}`,
        coords: f.geometry.coordinates as [number, number][],
      }));
  }, [geojson]);

  const project = useMemo(() => {
    const coords = [
      ...points.map((p) => [p.lng, p.lat] as [number, number]),
      ...routes.flatMap((r) => r.coords),
    ];
    if (!coords.length) return null;
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const w = Math.max(maxLng - minLng, 0.02);
    const h = Math.max(maxLat - minLat, 0.02);
    const pad = 0.1;
    return (lng: number, lat: number) => {
      const x = ((lng - minLng) / w) * (1 - pad * 2) + pad;
      const y = 1 - (((lat - minLat) / h) * (1 - pad * 2) + pad);
      return [x * 1000, y * 620] as const;
    };
  }, [points, routes]);

  const [active, setActive] = useState<string | null>(null);
  const activePt = points.find((p) => p.id === active);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        暂无空间坐标数据
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[280px] overflow-hidden rounded-md border border-slate-800 bg-[#030712]">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(6,182,212,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.08) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <svg viewBox="0 0 1000 620" className="h-full w-full">
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </radialGradient>
        </defs>
        {routes.map((r) => {
          const d = r.coords
            .map((c, i) => {
              const [x, y] = project(c[0], c[1]);
              return `${i === 0 ? 'M' : 'L'}${x},${y}`;
            })
            .join(' ');
          return (
            <path
              key={r.id}
              d={d}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2.5"
              strokeOpacity="0.75"
              strokeDasharray="6 4"
            />
          );
        })}
        {points.map((p) => {
          const [x, y] = project(p.lng, p.lat);
          const color =
            p.kind === 'shelter'
              ? '#22c55e'
              : LEVEL_COLOR[p.level] || '#06b6d4';
          return (
            <g
              key={p.id}
              className="cursor-pointer"
              onMouseEnter={() => setActive(p.id)}
              onMouseLeave={() => setActive(null)}
            >
              {(p.level === 'red' || p.level === 'orange') && p.kind === 'hazard' && (
                <circle cx={x} cy={y} r={22} fill="url(#glow)">
                  <animate
                    attributeName="r"
                    values="16;26;16"
                    dur="2.4s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <circle
                cx={x}
                cy={y}
                r={p.kind === 'hazard' ? 7 : 5}
                fill={color}
                stroke="#0f172a"
                strokeWidth="1.5"
              />
              {p.kind === 'hazard' && (
                <text
                  x={x + 10}
                  y={y - 8}
                  fill="#cbd5e1"
                  fontSize="11"
                  className="select-none"
                >
                  {p.name.slice(0, 8)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-2 text-[10px] text-slate-400">
        <span className="inline-flex items-center gap-1">
          <i className="h-2 w-2 rounded-full bg-red-500" /> 高风险隐患
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="h-2 w-2 rounded-full bg-cyan-400" /> 转移路线
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="h-2 w-2 rounded-full bg-emerald-500" /> 安置点
        </span>
      </div>
      {activePt && (
        <div className="absolute right-2 top-2 max-w-xs rounded border border-cyan-500/30 bg-slate-950/90 px-3 py-2 text-xs shadow-lg">
          <p className="font-medium text-white">{activePt.name}</p>
          <p className="mt-0.5 text-slate-400">{activePt.meta}</p>
          <p className="mt-1 text-cyan-300">
            {activePt.kind === 'hazard'
              ? `${LEVEL_LABEL[activePt.level] || activePt.level}风险`
              : activePt.kind === 'shelter'
                ? '安置点'
                : '关联点位'}
          </p>
        </div>
      )}
    </div>
  );
}

export default function CommandScreenPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [geojson, setGeojson] = useState<EvacuationGeoJSON | null>(null);
  const [clock, setClock] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, gj] = await Promise.all([
        getDashboardStats(),
        getEvacuationMapGeoJSON().catch(() => null),
      ]);
      setStats(data);
      setGeojson(gj);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleString('zh-CN', { hour12: false }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const risk = stats?.overallRisk;
  const level = stats?.warningByLevel;
  const levelBars = [
    { key: 'red', label: '红色', value: level?.red ?? 0 },
    { key: 'orange', label: '橙色', value: level?.orange ?? 0 },
    { key: 'yellow', label: '黄色', value: level?.yellow ?? 0 },
    { key: 'blue', label: '蓝色', value: level?.blue ?? 0 },
  ];
  const levelMax = Math.max(1, ...levelBars.map((x) => x.value));

  const devicePie = [
    { name: '在线', value: stats?.deviceByStatus?.online ?? stats?.deviceOnline ?? 0, color: '#22d3ee' },
    { name: '离线', value: stats?.deviceByStatus?.offline ?? 0, color: '#64748b' },
    { name: '故障', value: stats?.deviceByStatus?.fault ?? 0, color: '#ef4444' },
    { name: '其他', value: stats?.deviceByStatus?.other ?? 0, color: '#eab308' },
  ].filter((d) => d.value > 0);

  const monthly = (stats?.monthlyWarnings || []).map((m) => ({
    label: m.label || `${m.month}月`,
    warnings: m.warnings,
    closed: m.closed,
  }));
  const monitor = stats?.monitorTrend || [];
  const ticker = (stats?.latestWarnings || [])
    .map(
      (w) =>
        `【${w.levelDisplay || w.level}】${w.code} ${w.hazardPointName} · ${w.statusDisplay || w.status}`
    )
    .join('　　　');

  const kpis = [
    {
      label: '隐患点位',
      value: stats?.hazardTotal ?? '—',
      sub: `本月新增 ${stats?.hazardNewMonth ?? 0}`,
      icon: AlertTriangle,
      color: 'text-amber-400',
    },
    {
      label: '感知在线',
      value: stats ? `${stats.deviceOnline}/${stats.deviceTotal}` : '—',
      sub: `在线率 ${stats?.deviceRate ?? 0}%`,
      icon: Radio,
      color: 'text-cyan-400',
    },
    {
      label: '未闭环预警',
      value: stats?.openWarnings ?? '—',
      sub: `待确认 ${stats?.pendingConfirm ?? 0}`,
      icon: ShieldAlert,
      color: 'text-red-400',
    },
    {
      label: '今日预警',
      value: stats?.todayWarnings ?? '—',
      sub: `环比 ${(stats?.warningTrend ?? 0) >= 0 ? '+' : ''}${stats?.warningTrend ?? 0}`,
      icon: Bell,
      color: 'text-orange-400',
    },
    {
      label: '指挥待办',
      value: stats?.pendingTasks ?? '—',
      sub: `预警${stats?.warnActionable ?? 0}·巡查${stats?.inspectOpen ?? 0}·转移${stats?.evacOpen ?? 0}`,
      icon: ClipboardList,
      color: 'text-yellow-300',
    },
    {
      label: '已转移人数',
      value: stats?.transferredPeople ?? '—',
      sub: `待转移 ${stats?.evacSummary?.pendingPeople ?? 0}`,
      icon: Users,
      color: 'text-emerald-400',
    },
  ];

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#020617] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(6,182,212,0.14),_transparent_50%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(239,68,68,0.06),_transparent_45%)]" />

      {/* Header */}
      <header className="relative z-20 flex shrink-0 items-center justify-between border-b border-cyan-500/20 px-4 py-2.5 md:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 rounded border border-slate-700/80 px-2 py-1 text-[11px] text-slate-500 hover:border-cyan-500/40 hover:text-cyan-300"
          >
            <ArrowLeft className="h-3 w-3" />
            管理台
          </Link>
          <div>
            <h1 className="bg-gradient-to-r from-cyan-200 via-white to-cyan-300 bg-clip-text text-base font-bold tracking-[0.2em] text-transparent md:text-xl">
              边坡地质灾害指挥驾驶舱
            </h1>
            <p className="text-[10px] tracking-widest text-slate-500">
              COMMAND &amp; CONTROL · GEO-HAZARD SITUATIONAL AWARENESS
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {risk && (
            <div
              className="hidden items-center gap-2 rounded-full border px-3 py-1 sm:flex"
              style={{
                borderColor: `${LEVEL_COLOR[risk.level] || '#22d3ee'}66`,
                background: `${LEVEL_COLOR[risk.level] || '#22d3ee'}18`,
              }}
            >
              <Siren
                className="h-3.5 w-3.5"
                style={{ color: LEVEL_COLOR[risk.level] || '#22d3ee' }}
              />
              <span
                className="text-xs font-semibold"
                style={{ color: LEVEL_COLOR[risk.level] || '#22d3ee' }}
              >
                {risk.label}
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                指数 {risk.score}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => void load()}
            className="rounded border border-slate-700 p-1.5 text-slate-400 hover:text-cyan-300"
            title="刷新"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!document.fullscreenElement) {
                void document.documentElement.requestFullscreen?.();
              } else {
                void document.exitFullscreen?.();
              }
            }}
            className="rounded border border-slate-700 p-1.5 text-slate-400 hover:text-cyan-300"
            title="全屏"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <div className="text-right">
            <div className="font-mono text-sm text-cyan-300 md:text-base">{clock}</div>
            <div className="text-[10px] text-slate-500">
              20s 自动刷新 · {stats?.generatedAt || '—'}
            </div>
          </div>
        </div>
      </header>

      {/* Ticker */}
      <div className="relative z-20 flex shrink-0 items-center gap-3 border-b border-red-500/20 bg-red-950/20 px-4 py-1.5">
        <span className="shrink-0 rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-300">
          实时告警
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div
            className="whitespace-nowrap text-xs text-slate-300"
            style={{
              display: 'inline-block',
              paddingLeft: '100%',
              animation: 'screen-marquee 32s linear infinite',
            }}
          >
            {ticker || '当前无活跃预警滚动信息 · 系统保持常态监测'}
          </div>
        </div>
      </div>

      {error && (
        <div className="relative z-20 mx-4 mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
          {error}
        </div>
      )}

      {/* Body */}
      <main className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-12 lg:gap-3 lg:p-4">
        {/* Left */}
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-3">
          <Panel title="核心指标">
            <div className="grid grid-cols-2 gap-2">
              {kpis.map((k) => {
                const Icon = k.icon;
                return (
                  <div
                    key={k.label}
                    className="rounded-md border border-slate-800/80 bg-slate-900/60 px-2.5 py-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">{k.label}</span>
                      <Icon className={cn('h-3 w-3', k.color)} />
                    </div>
                    <div className={cn('mt-1 font-mono text-lg font-bold tabular-nums', k.color)}>
                      {k.value}
                    </div>
                    <div className="truncate text-[10px] text-slate-500">{k.sub}</div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="预警等级态势" className="min-h-[140px]">
            <div className="space-y-2.5">
              {levelBars.map((row) => (
                <div key={row.key} className="flex items-center gap-2 text-xs">
                  <span className="w-8 text-slate-400">{row.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${(row.value / levelMax) * 100}%`,
                        background: LEVEL_COLOR[row.key],
                        boxShadow: `0 0 10px ${LEVEL_COLOR[row.key]}66`,
                      }}
                    />
                  </div>
                  <span
                    className="w-6 text-right font-mono font-semibold"
                    style={{ color: LEVEL_COLOR[row.key] }}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="设备健康度" className="min-h-[160px] flex-1">
            {devicePie.length === 0 ? (
              <p className="flex h-full items-center justify-center text-xs text-slate-600">
                暂无设备
              </p>
            ) : (
              <div className="flex h-full items-center gap-2">
                <div className="h-36 w-36 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={devicePie}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={36}
                        outerRadius={54}
                        paddingAngle={2}
                      >
                        {devicePie.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: '#0f172a',
                          border: '1px solid #334155',
                          fontSize: 11,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-1.5 text-xs">
                  {devicePie.map((d) => (
                    <li key={d.name} className="flex items-center gap-2 text-slate-400">
                      <i className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                      {d.name}
                      <span className="font-mono text-white">{d.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        </div>

        {/* Center */}
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-6">
          <Panel
            title="全域态势地图 · 隐患 / 转移路线 / 安置点"
            className="min-h-[320px] flex-[1.4]"
            extra={
              <span className="text-[10px] text-slate-500">
                {(stats?.hotspots || []).length} 热点
              </span>
            }
          >
            <SituationalMap hotspots={stats?.hotspots || []} geojson={geojson} />
          </Panel>

          <div className="grid min-h-[180px] flex-1 grid-cols-1 gap-3 md:grid-cols-2">
            <Panel title="近 24h 监测曲线">
              <div className="h-[150px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monitor}>
                    <defs>
                      <linearGradient id="gForce" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 9 }} interval={4} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 9 }} width={28} />
                    <Tooltip
                      contentStyle={{
                        background: '#0f172a',
                        border: '1px solid #334155',
                        fontSize: 11,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="force"
                      name="锚索力"
                      stroke="#06b6d4"
                      fill="url(#gForce)"
                      strokeWidth={1.5}
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="rainfall"
                      name="雨量"
                      stroke="#3b82f6"
                      fill="transparent"
                      strokeWidth={1.5}
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="displacement"
                      name="位移"
                      stroke="#f97316"
                      fill="transparent"
                      strokeWidth={1.5}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="月度预警闭环">
              <div className="h-[150px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 9 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 9 }} width={24} />
                    <Tooltip
                      contentStyle={{
                        background: '#0f172a',
                        border: '1px solid #334155',
                        fontSize: 11,
                      }}
                    />
                    <Bar dataKey="warnings" name="发生" fill="#f97316" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="closed" name="闭环" fill="#22d3ee" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
        </div>

        {/* Right */}
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-3">
          <Panel title="最新预警动态" className="min-h-[220px] flex-1">
            <ul className="max-h-full space-y-2 overflow-y-auto pr-1">
              {(stats?.latestWarnings || []).length === 0 && (
                <li className="py-8 text-center text-xs text-slate-600">暂无预警</li>
              )}
              {(stats?.latestWarnings || []).map((w) => (
                <li
                  key={w.id || w.code}
                  className="rounded-md border border-slate-800 bg-slate-900/50 px-2.5 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-cyan-300">{w.code}</span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        color: LEVEL_COLOR[w.level] || '#94a3b8',
                        background: `${LEVEL_COLOR[w.level] || '#94a3b8'}22`,
                      }}
                    >
                      {w.levelDisplay || w.level}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-white">{w.hazardPointName}</p>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                    <span>{w.statusDisplay || w.status}</span>
                    <span className="font-mono">{w.createTime?.slice(11, 19) || '—'}</span>
                  </div>
                  {w.confidence != null && (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-cyan-500/80"
                        style={{ width: `${Math.min(100, Number(w.confidence))}%` }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="避险转移进度">
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded bg-yellow-500/10 py-2">
                  <div className="font-mono text-lg text-yellow-300">
                    {stats?.evacSummary?.pending ?? 0}
                  </div>
                  <div className="text-[10px] text-slate-500">待转移</div>
                </div>
                <div className="rounded bg-cyan-500/10 py-2">
                  <div className="font-mono text-lg text-cyan-300">
                    {stats?.evacSummary?.ongoing ?? 0}
                  </div>
                  <div className="text-[10px] text-slate-500">进行中</div>
                </div>
                <div className="rounded bg-emerald-500/10 py-2">
                  <div className="font-mono text-lg text-emerald-300">
                    {stats?.evacSummary?.completed ?? 0}
                  </div>
                  <div className="text-[10px] text-slate-500">已完成</div>
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[10px] text-slate-500">
                  <span>人口转移完成率</span>
                  <span className="font-mono text-cyan-300">
                    {stats?.evacSummary?.totalPeople
                      ? (
                          ((stats.evacSummary.transferredPeople || 0) /
                            stats.evacSummary.totalPeople) *
                          100
                        ).toFixed(1)
                      : 0}
                    %
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-emerald-400"
                    style={{
                      width: `${
                        stats?.evacSummary?.totalPeople
                          ? Math.min(
                              100,
                              ((stats.evacSummary.transferredPeople || 0) /
                                stats.evacSummary.totalPeople) *
                                100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="指挥待办" className="min-h-[160px] flex-1">
            <ul className="max-h-full space-y-1.5 overflow-y-auto text-xs">
              {(stats?.todoTasks || []).length === 0 && (
                <li className="py-6 text-center text-slate-600">暂无待办</li>
              )}
              {(stats?.todoTasks || []).map((t) => (
                <li
                  key={t.id}
                  className="flex items-start gap-2 rounded border border-slate-800/80 bg-slate-900/40 px-2 py-1.5"
                >
                  <Activity
                    className={cn(
                      'mt-0.5 h-3 w-3 shrink-0',
                      t.priority === 'high' ? 'text-red-400' : 'text-cyan-400'
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-slate-200">{t.label}</p>
                    <p className="text-[10px] text-slate-500">
                      {t.type} · {t.time}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </main>

      <style>{`
        @keyframes screen-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}
