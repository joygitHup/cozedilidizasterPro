'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Battery,
  Signal,
  Wifi,
  WifiOff,
  AlertCircle,
  RefreshCw,
  Download,
  Loader2,
  Zap,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type {
  DeviceTree,
  DeviceTreeGroup,
  MonitorDataOverview,
  MonitorDataType,
  MonitorLatest,
  MonitorSeries,
  MonitorTimeRange,
  MonitoringDevice,
} from '@/types';
import {
  exportMonitorData,
  getDeviceTree,
  getMonitorLatest,
  getMonitorOverview,
  getMonitorSeries,
  getMonitoringDevice,
  ingestMonitorData,
} from '@/lib/services';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';

const TYPE_LABELS: Record<string, string> = {
  npr_anchor: 'NPR锚索计',
  rainfall: '雨量计',
  fiber_optic: '光纤光栅',
  camera: '摄像头',
  gnss: 'GNSS位移站',
  inclinometer: '倾角仪',
  others: '其他',
};

const DATA_TYPE_LABELS: Record<string, string> = {
  force: '牛顿力',
  displacement: '位移',
  rainfall: '降雨',
  stress: '应力',
  strain: '应变',
  temperature: '温度',
};

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  online: { icon: Wifi, color: 'text-green-400', label: '在线' },
  offline: { icon: WifiOff, color: 'text-red-400', label: '离线' },
  fault: { icon: AlertCircle, color: 'text-yellow-400', label: '故障' },
};

const LEVEL_COLOR: Record<string, string> = {
  normal: 'bg-cyan-500',
  yellow: 'bg-yellow-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
};

const INPUT_CLS =
  'h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500';

function formatTime(v?: string | null) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return v;
  }
}

function formatAxisTime(v: string, range: MonitorTimeRange) {
  const d = new Date(v);
  if (range === '1h' || range === '24h') {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:00`;
}

const LEVEL_LABEL: Record<string, string> = {
  city: '市',
  district: '区',
  county: '县',
  village: '村',
  unassigned: '未分配',
};

function collectDevices(nodes: DeviceTreeGroup[]): { id: number }[] {
  const out: { id: number }[] = [];
  const walk = (list: DeviceTreeGroup[]) => {
    for (const n of list) {
      out.push(...n.devices);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export default function MonitoringRealtimePage() {
  const [range, setRange] = useState<MonitorTimeRange>('24h');
  const [deviceTypeFilter, setDeviceTypeFilter] = useState('');
  const [tree, setTree] = useState<DeviceTree>({ nodes: [], total: 0, online: 0 });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [device, setDevice] = useState<MonitoringDevice | null>(null);
  const [dataType, setDataType] = useState<MonitorDataType | ''>('');
  const [series, setSeries] = useState<MonitorSeries | null>(null);
  const [latest, setLatest] = useState<MonitorLatest | null>(null);
  const [overview, setOverview] = useState<MonitorDataOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [ingestMsg, setIngestMsg] = useState('');
  const [ingesting, setIngesting] = useState(false);

  const loadTree = useCallback(async () => {
    try {
      const data = await getDeviceTree({
        deviceType: deviceTypeFilter || undefined,
      });
      setTree(data);
      setExpanded((prev) => {
        const next = { ...prev };
        const mark = (nodes: DeviceTreeGroup[]) => {
          for (const n of nodes) {
            if (next[n.key] === undefined) next[n.key] = true;
            if (n.children?.length) mark(n.children);
          }
        };
        mark(data.nodes || []);
        return next;
      });
      const flat = collectDevices(data.nodes || []);
      setSelectedId((cur) => {
        if (cur && flat.some((d) => d.id === cur)) return cur;
        return flat[0]?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载设备树失败');
    }
  }, [deviceTypeFilter]);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(
        await getMonitorOverview({
          range,
          deviceType: deviceTypeFilter || undefined,
        })
      );
    } catch {
      setOverview(null);
    }
  }, [range, deviceTypeFilter]);

  const loadDeviceData = useCallback(async () => {
    if (!selectedId) {
      setDevice(null);
      setSeries(null);
      setLatest(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [dev, ser, lat] = await Promise.all([
        getMonitoringDevice(selectedId),
        getMonitorSeries({
          deviceId: selectedId,
          dataType: dataType || undefined,
          range,
        }),
        getMonitorLatest(selectedId),
      ]);
      setDevice(dev);
      setSeries(ser);
      setLatest(lat);
      if (!dataType && ser.data_type) {
        setDataType(ser.data_type);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载监测数据失败');
    } finally {
      setLoading(false);
    }
  }, [selectedId, dataType, range]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    loadDeviceData();
  }, [loadDeviceData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      loadOverview();
      loadDeviceData();
    }, 30000);
    return () => clearInterval(timer);
  }, [autoRefresh, loadOverview, loadDeviceData]);

  const chartData = useMemo(() => {
    if (!series?.points?.length) return [];
    return series.points.map((p) => ({
      time: formatAxisTime(p.time, range),
      fullTime: formatTime(p.time),
      value: p.value,
    }));
  }, [series, range]);

  const statusConfig = device ? STATUS_CONFIG[device.status] : null;
  const StatusIcon = statusConfig?.icon ?? Wifi;

  const handleRefresh = () => {
    loadTree();
    loadOverview();
    loadDeviceData();
  };

  const handleSimulate = async () => {
    if (!selectedId || !series) return;
    setIngesting(true);
    setIngestMsg('');
    try {
      const base = series.stats.latest ?? series.thresholds.yellow;
      // 略高于黄阈值，便于演示闭环触发
      const value = Math.max(base * 1.05, series.thresholds.yellow + 1);
      const result = await ingestMonitorData({
        device: selectedId,
        data_type: (dataType || series.data_type) as MonitorDataType,
        value: Number(value.toFixed(2)),
        unit: series.unit,
      });
      const w = result.warning;
      if (w?.triggered) {
        setIngestMsg(
          w.deduplicated
            ? `已上报 ${value.toFixed(2)}${series.unit}，预警已存在（去重）`
            : `已上报并触发预警 ${w.warning_code || ''}（${w.level}）`
        );
      } else {
        setIngestMsg(
          `已上报 ${value.toFixed(2)}${series.unit}${w?.reason ? ` · ${w.reason}` : ''}`
        );
      }
      await loadDeviceData();
      await loadOverview();
    } catch (e) {
      setIngestMsg(e instanceof Error ? e.message : '上报失败');
    } finally {
      setIngesting(false);
    }
  };

  const treeNodes = tree.nodes || [];

  const renderTreeGroup = (group: DeviceTreeGroup, depth = 0) => {
    const open = expanded[group.key] !== false;
    const hasKids = (group.children?.length || 0) > 0 || (group.devices?.length || 0) > 0;
    return (
      <div key={group.key}>
        <button
          type="button"
          onClick={() => setExpanded((p) => ({ ...p, [group.key]: !open }))}
          className="flex w-full items-center gap-1 rounded px-1 py-1.5 text-left text-sm text-white hover:bg-accent"
          style={{ paddingLeft: 4 + depth * 10 }}
        >
          {hasKids ? (
            open ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )
          ) : (
            <span className="inline-block h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{group.name}</span>
          <span className="ml-1 shrink-0 text-[10px] text-muted-foreground">
            {LEVEL_LABEL[group.level] || ''}
          </span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {group.online}/{group.count}
          </span>
        </button>
        {open && (
          <>
            {(group.children || []).map((child) => renderTreeGroup(child, depth + 1))}
            {(group.devices || []).map((node) => {
              const sc = STATUS_CONFIG[node.status] || STATUS_CONFIG.offline;
              const SI = sc.icon;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(node.id);
                    setDataType('');
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors',
                    selectedId === node.id
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-muted-foreground hover:bg-accent hover:text-white'
                  )}
                  style={{ paddingLeft: 18 + (depth + 1) * 10 }}
                >
                  <SI className={cn('h-3 w-3 shrink-0', sc.color)} />
                  <span className="truncate">{node.name}</span>
                </button>
              );
            })}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as MonitorTimeRange)}
            className={INPUT_CLS}
          >
            <option value="1h">近1小时</option>
            <option value="24h">近24小时</option>
            <option value="7d">近7天</option>
            <option value="30d">近30天</option>
          </select>
          <select
            value={deviceTypeFilter}
            onChange={(e) => setDeviceTypeFilter(e.target.value)}
            className={INPUT_CLS}
          >
            <option value="">全部设备类型</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <label className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-cyan-500"
            />
            自动刷新(30s)
          </label>
          <button
            onClick={handleRefresh}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm hover:bg-accent"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> 刷新
          </button>
          <button
            onClick={() =>
              exportMonitorData({
                deviceId: selectedId ?? undefined,
                dataType: dataType || undefined,
                range,
              }).catch((e) => alert(e instanceof Error ? e.message : '导出失败'))
            }
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm hover:bg-accent"
          >
            <Download className="h-4 w-4" /> 导出
          </button>
      </PageHeader>

      {overview && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="监测点数" value={overview.points} />
          <StatCard label="有数据设备" value={overview.active_devices} accent="text-cyan-400" />
          <StatCard label="在线设备" value={overview.online_devices} accent="text-green-400" />
          <StatCard label="超黄阈值点" value={overview.over_threshold} accent="text-yellow-400" />
          <StatCard label="未闭环预警" value={overview.open_warnings} accent="text-orange-400" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* 左侧设备树 */}
        <div className="w-full shrink-0 rounded-lg border border-border bg-card p-3 lg:w-64">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">设备树</h4>
            <span className="text-[10px] text-muted-foreground">
              在线 {tree.online}/{tree.total}
            </span>
          </div>
          <div className="max-h-[560px] space-y-0.5 overflow-y-auto">
            {treeNodes.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                暂无设备，请先在设备管理配置安装区域
              </p>
            ) : (
              treeNodes.map((group) => renderTreeGroup(group))
            )}
          </div>
        </div>

        {/* 中间图表 */}
        <div className="min-w-0 flex-1 space-y-4">
          {loading && !series ? (
            <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-card">
              <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
            </div>
          ) : series && device ? (
            <>
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">
                    {device.name} · {series.data_type_display || DATA_TYPE_LABELS[series.data_type]}
                    变化曲线
                  </h3>
                  <button
                    onClick={handleSimulate}
                    disabled={ingesting}
                    className="flex items-center gap-1 rounded-lg bg-orange-600/90 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-60"
                    title="模拟上报一条偏高数据，验证预警闭环"
                  >
                    {ingesting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5" />
                    )}
                    模拟上报
                  </button>
                </div>
                {ingestMsg && (
                  <p className="mb-2 text-xs text-amber-300/90">{ingestMsg}</p>
                )}
                {chartData.length === 0 ? (
                  <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                    该时段暂无监测数据
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} unit={series.unit ? ` ${series.unit}` : ''} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        formatter={(v: number) => [`${v} ${series.unit}`, series.data_type_display]}
                        labelFormatter={(_, payload) =>
                          payload?.[0]?.payload?.fullTime || _
                        }
                      />
                      <ReferenceLine
                        y={series.thresholds.red}
                        stroke="#ef4444"
                        strokeDasharray="3 3"
                        label={{ value: '红', fill: '#ef4444', fontSize: 10 }}
                      />
                      <ReferenceLine
                        y={series.thresholds.orange}
                        stroke="#f97316"
                        strokeDasharray="3 3"
                        label={{ value: '橙', fill: '#f97316', fontSize: 10 }}
                      />
                      <ReferenceLine
                        y={series.thresholds.yellow}
                        stroke="#eab308"
                        strokeDasharray="3 3"
                        label={{ value: '黄', fill: '#eab308', fontSize: 10 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#06b6d4"
                        fill="#06b6d4"
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(series.available_types.length
                    ? series.available_types
                    : [series.data_type]
                  ).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setDataType(tab)}
                      className={cn(
                        'rounded px-3 py-1 text-xs transition-colors',
                        (dataType || series.data_type) === tab
                          ? 'bg-cyan-600 text-white'
                          : 'bg-muted text-muted-foreground hover:text-white'
                      )}
                    >
                      {DATA_TYPE_LABELS[tab] || tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold text-white">多参数联动</h3>
                {latest?.params?.length ? (
                  <div className="space-y-3">
                    {latest.params.map((p) => (
                      <ParamBar
                        key={p.data_type}
                        label={p.data_type_display}
                        value={p.value}
                        max={Math.max(p.scale_max, p.thresholds.red * 1.1, p.value)}
                        unit={p.unit}
                        color={LEVEL_COLOR[p.level] || 'bg-cyan-500'}
                        level={p.level}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">暂无多参数数据</p>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
              请选择左侧设备查看实时曲线
            </div>
          )}
        </div>

        {/* 右侧信息 */}
        {device && statusConfig && series && (
          <div className="w-full shrink-0 space-y-4 lg:w-64">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">设备信息</h4>
                <span className={cn('flex items-center gap-1 text-xs', statusConfig.color)}>
                  <StatusIcon className="h-3 w-3" /> {statusConfig.label}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <Row label="编号" value={device.code} mono />
                <Row label="名称" value={device.name} />
                <Row label="类型" value={TYPE_LABELS[device.type] || device.type} />
                <Row
                  label="安装区域"
                  value={
                    [
                      device.location.city,
                      device.location.district,
                      device.location.county,
                      device.location.village,
                    ]
                      .filter(Boolean)
                      .join(' / ') || '—'
                  }
                />
                <Row label="详细地址" value={device.location.address || '—'} />
                <Row
                  label="隐患点"
                  value={
                    device.hazardPointCode
                      ? `${device.hazardPointName} (${device.hazardPointCode})`
                      : '未关联'
                  }
                />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">电池</span>
                  <span className="flex items-center gap-1 text-white">
                    <Battery
                      className={cn(
                        'h-3.5 w-3.5',
                        device.battery < 20 ? 'text-red-400' : 'text-green-400'
                      )}
                    />
                    {device.battery}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">信号</span>
                  <span
                    className={cn(
                      'flex items-center gap-1',
                      device.signal === 'strong'
                        ? 'text-green-400'
                        : device.signal === 'medium'
                          ? 'text-yellow-400'
                          : 'text-red-400'
                    )}
                  >
                    <Signal className="h-3.5 w-3.5" />
                    {device.signal === 'strong' ? '强' : device.signal === 'medium' ? '中' : '弱'}
                  </span>
                </div>
                <Row label="数据更新" value={formatTime(device.lastDataTime)} />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h4 className="mb-3 text-sm font-semibold text-white">时段统计</h4>
              <div className="space-y-2 text-sm">
                <Row
                  label="最大值"
                  value={
                    series.stats.max != null
                      ? `${series.stats.max.toFixed(2)} ${series.unit}`
                      : '—'
                  }
                  valueClass="font-mono text-red-400"
                />
                <Row
                  label="最小值"
                  value={
                    series.stats.min != null
                      ? `${series.stats.min.toFixed(2)} ${series.unit}`
                      : '—'
                  }
                  valueClass="font-mono text-green-400"
                />
                <Row
                  label="平均值"
                  value={
                    series.stats.avg != null
                      ? `${series.stats.avg.toFixed(2)} ${series.unit}`
                      : '—'
                  }
                  valueClass="font-mono text-white"
                />
                <Row
                  label="超黄/橙/红"
                  value={`${series.stats.over_yellow}/${series.stats.over_orange}/${series.stats.over_red}`}
                  valueClass="font-mono text-orange-400"
                />
                <Row
                  label="样本数"
                  value={String(series.stats.count)}
                  valueClass="font-mono text-white"
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h4 className="mb-3 text-sm font-semibold text-white">预警闭环</h4>
              {series.hazard_point ? (
                <p className="mb-2 text-xs text-muted-foreground">
                  关联 {series.hazard_point.name}（{series.hazard_point.code}）
                </p>
              ) : (
                <p className="mb-2 text-xs text-amber-400">未关联隐患点，上报不会建预警单</p>
              )}
              {series.open_warnings.length === 0 ? (
                <p className="text-xs text-muted-foreground">当前无未闭环预警</p>
              ) : (
                <ul className="space-y-1.5">
                  {series.open_warnings.map((w) => (
                    <li
                      key={w.id}
                      className="rounded border border-orange-500/20 bg-orange-500/10 px-2 py-1.5 text-xs text-orange-300"
                    >
                      <span className="font-mono">{w.code}</span> · {w.level} · {w.status}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = 'text-white',
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-mono text-xl font-bold', accent)}>{value}</p>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  valueClass,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-right text-white',
          mono && 'font-mono text-cyan-400',
          valueClass
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ParamBar({
  label,
  value,
  max,
  unit,
  color,
  level,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  color: string;
  level: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-24 shrink-0 text-right text-xs font-mono text-white">
        {value}
        {unit}
        {level !== 'normal' && (
          <span className="ml-1 text-[10px] text-orange-400">{level}</span>
        )}
      </span>
    </div>
  );
}
