'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Radio,
  Bell,
  ClipboardList,
  Users,
  TrendingUp,
  TrendingDown,
  ArrowRight,
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
} from 'recharts';
import type { DashboardStats, WarningRecord } from '@/types';
import { getDashboardStats, getLatestWarnings } from '@/lib/mock-data';

const WARNING_COLORS: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  blue: '#3b82f6',
};

const WARNING_LABELS: Record<string, string> = {
  red: '红色',
  orange: '橙色',
  yellow: '黄色',
  blue: '蓝色',
};

const trendChartData = Array.from({ length: 24 }, (_, i) => ({
  time: `${String(i).padStart(2, '0')}:00`,
  牛顿力: Math.round(40 + Math.sin(i / 4) * 20 + Math.random() * 10),
  降雨量: Math.round(5 + Math.sin(i / 3) * 15 + Math.random() * 8),
  位移量: Math.round(8 + Math.sin(i / 5) * 5 + Math.random() * 3),
}));

const hazardTypeData = [
  { name: '滑坡', value: 684, color: '#ef4444' },
  { name: '崩塌', value: 312, color: '#f97316' },
  { name: '泥石流', value: 198, color: '#eab308' },
  { name: '其他', value: 90, color: '#3b82f6' },
];

const monthlyData = [
  { month: '1月', 预警数: 12, 处置数: 12 },
  { month: '2月', 预警数: 8, 处置数: 8 },
  { month: '3月', 预警数: 15, 处置数: 14 },
  { month: '4月', 预警数: 22, 处置数: 21 },
  { month: '5月', 预警数: 18, 处置数: 18 },
  { month: '6月', 预警数: 35, 处置数: 33 },
  { month: '7月', 预警数: 42, 处置数: 39 },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [warnings, setWarnings] = useState<WarningRecord[]>([]);

  useEffect(() => {
    getDashboardStats().then(setStats);
    getLatestWarnings(5).then(setWarnings);
  }, []);

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">驾驶舱总览</h1>
        <span className="text-sm text-muted-foreground">
          数据更新时间：2026-07-30 10:23
        </span>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard
          icon={AlertTriangle}
          label="隐患总数"
          value={stats.hazardTotal.toLocaleString()}
          trend={stats.hazardTrend}
          trendLabel="较上月"
          color="text-red-400"
          bgColor="bg-red-500/10"
        />
        <StatCard
          icon={Radio}
          label="在线设备"
          value={`${stats.deviceOnline}/${stats.deviceTotal}`}
          trend={stats.deviceRate}
          trendLabel="在线率"
          color="text-cyan-400"
          bgColor="bg-cyan-500/10"
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
        />
        <StatCard
          icon={ClipboardList}
          label="待处置"
          value={stats.pendingTasks.toString()}
          trend={stats.tasksTrend}
          trendLabel="较昨日"
          color="text-yellow-400"
          bgColor="bg-yellow-500/10"
          invertTrend
        />
        <StatCard
          icon={Users}
          label="转移人数"
          value={stats.transferredPeople.toString()}
          trend={stats.peopleTrend}
          trendLabel="较昨日"
          color="text-green-400"
          bgColor="bg-green-500/10"
        />
      </div>

      {/* 中间区域：图表 + 预警动态 */}
      <div className="grid grid-cols-3 gap-4">
        {/* 实时监测曲线 */}
        <div className="col-span-2 rounded-lg border border-border bg-card p-4">
          <h3 className="mb-4 text-sm font-semibold text-white">实时监测曲线</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trendChartData}>
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
              <Area type="monotone" dataKey="牛顿力" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="降雨量" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="位移量" stroke="#f97316" fill="#f97316" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-cyan-500" /> 牛顿力 (MPa)
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500" /> 降雨量 (mm)
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-orange-500" /> 位移量 (mm)
            </span>
          </div>
        </div>

        {/* 最新预警动态 */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">最新预警动态</h3>
            <a href="/warning/current" className="flex items-center gap-1 text-xs text-cyan-400 hover:underline">
              查看全部 <ArrowRight className="h-3 w-3" />
            </a>
          </div>
          <div className="space-y-3">
            {warnings.map((w) => (
              <div
                key={w.id}
                className="flex items-start gap-3 rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted"
              >
                <span
                  className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: WARNING_COLORS[w.level] }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{w.hazardPointName}</span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        color: WARNING_COLORS[w.level],
                        backgroundColor: `${WARNING_COLORS[w.level]}20`,
                      }}
                    >
                      {WARNING_LABELS[w.level]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground truncate">
                    {w.triggerType} · 置信度 {w.confidence}%
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {w.createTime.split(' ')[1]?.slice(0, 5)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 底部区域：图表 */}
      <div className="grid grid-cols-3 gap-4">
        {/* 隐患类型分布 */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-4 text-sm font-semibold text-white">隐患类型分布</h3>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie
                  data={hazardTypeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={65}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {hazardTypeData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {hazardTypeData.map((item) => (
                <div key={item.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                  <span className="text-muted-foreground">{item.name}</span>
                  <span className="font-mono font-medium text-white">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 月度预警趋势 */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-4 text-sm font-semibold text-white">月度预警趋势</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="预警数" fill="#f97316" radius={[2, 2, 0, 0]} />
              <Bar dataKey="处置数" fill="#22c55e" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 待办任务 */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-4 text-sm font-semibold text-white">待办任务</h3>
          <div className="space-y-3">
            {[
              { label: '竹林坡巡查任务', time: '10:00', type: '巡查' },
              { label: '石桥镇预警核实', time: '14:00', type: '核实' },
              { label: '李家坪转移确认', time: '15:00', type: '转移' },
              { label: '设备NPR-002维修', time: '16:00', type: '维修' },
              { label: '月度报告提交', time: '18:00', type: '报告' },
            ].map((task, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg bg-muted/50 p-2.5">
                <input type="checkbox" className="h-4 w-4 rounded border-border accent-cyan-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{task.label}</p>
                  <p className="text-xs text-muted-foreground">{task.time} · {task.type}</p>
                </div>
              </div>
            ))}
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
}) {
  const isPositive = trend > 0;
  const isGood = invertTrend ? !isPositive : isPositive;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={`rounded-lg p-1.5 ${bgColor}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </div>
      <p className={`mt-2 text-2xl font-bold font-mono ${color}`}>{value}</p>
      <div className="mt-1 flex items-center gap-1">
        <TrendIcon className={`h-3 w-3 ${isGood ? 'text-green-400' : 'text-red-400'}`} />
        <span className={`text-xs ${isGood ? 'text-green-400' : 'text-red-400'}`}>
          {isRate ? `${trend}%` : `${isPositive ? '+' : ''}${trend}`} {trendLabel}
        </span>
      </div>
    </div>
  );
}
