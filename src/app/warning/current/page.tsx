'use client';

import { useEffect, useState } from 'react';
import {
  Bell,
  Phone,
  MessageSquare,
  FileText,
  CheckCircle,
  Clock,
  AlertTriangle,
  Volume2,
} from 'lucide-react';
import type { WarningRecord } from '@/types';
import { getLatestWarnings } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const LEVEL_CONFIG: Record<string, { color: string; bg: string; label: string; emoji: string }> = {
  red: { color: 'text-red-400', bg: 'bg-red-500/20', label: '红色', emoji: '🔴' },
  orange: { color: 'text-orange-400', bg: 'bg-orange-500/20', label: '橙色', emoji: '🟠' },
  yellow: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: '黄色', emoji: '🟡' },
  blue: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: '蓝色', emoji: '🔵' },
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
  { key: '', label: '全部' },
  { key: 'pending', label: '未处置' },
  { key: 'confirmed', label: '处置中' },
  { key: 'closed', label: '已闭环' },
];

export default function WarningCurrentPage() {
  const [warnings, setWarnings] = useState<WarningRecord[]>([]);
  const [selected, setSelected] = useState<WarningRecord | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    getLatestWarnings(20).then((data) => {
      setWarnings(data);
      if (data.length > 0) setSelected(data[0]);
    });
  }, []);

  const filtered = filter ? warnings.filter((w) => w.status === filter) : warnings;

  const levelCounts = {
    red: warnings.filter((w) => w.level === 'red' && w.status !== 'closed').length,
    orange: warnings.filter((w) => w.level === 'orange' && w.status !== 'closed').length,
    yellow: warnings.filter((w) => w.level === 'yellow' && w.status !== 'closed').length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Bell className="h-4 w-4" />
          <span>智能预警中心</span>
          <span>/</span>
          <span className="text-white">实时预警</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse-warning" />
            <span className="text-red-400 font-mono">红色{levelCounts.red}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            <span className="text-orange-400 font-mono">橙色{levelCounts.orange}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-yellow-500" />
            <span className="text-yellow-400 font-mono">黄色{levelCounts.yellow}</span>
          </span>
        </div>
      </div>

      {/* 筛选标签 */}
      <div className="flex gap-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm transition-colors',
              filter === tab.key
                ? 'bg-cyan-600 text-white font-medium'
                : 'bg-card border border-border text-muted-foreground hover:text-white'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {/* 左侧预警列表 */}
        <div className="w-64 shrink-0 space-y-2">
          {filtered.map((w) => {
            const lc = LEVEL_CONFIG[w.level];
            return (
              <button
                key={w.id}
                onClick={() => setSelected(w)}
                className={cn(
                  'w-full rounded-lg border p-3 text-left transition-all',
                  selected?.id === w.id
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-border bg-card hover:border-slate-600'
                )}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className={cn('h-4 w-4', lc.color)} />
                  <span className="text-xs text-muted-foreground">
                    {w.createTime.split(' ')[1]?.slice(0, 5)}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-white">{w.hazardPointName}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', lc.bg, lc.color)}>
                    {lc.label}
                  </span>
                  <span className={cn('text-[10px]', STATUS_CONFIG[w.status].color)}>
                    {STATUS_CONFIG[w.status].label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* 中间预警详情 */}
        {selected && (
          <div className="flex-1 space-y-4">
            {/* 基本信息 */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">预警基本信息</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">预警编号</span>
                  <span className="font-mono text-white">{selected.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">隐患点</span>
                  <span className="text-white">{selected.hazardPointName} ({selected.hazardPointId})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">预警等级</span>
                  <span className={cn('font-medium', LEVEL_CONFIG[selected.level].color)}>
                    {LEVEL_CONFIG[selected.level].emoji} {LEVEL_CONFIG[selected.level].label}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">触发时间</span>
                  <span className="text-white">{selected.createTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">触发条件</span>
                  <span className="text-white">{selected.triggerType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">置信度</span>
                  <span className="font-mono text-cyan-400">{selected.confidence}%</span>
                </div>
              </div>
            </div>

            {/* 关联数据 */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-white">📊 关联数据展示</h3>
              <div className="space-y-3">
                {Object.entries(selected.triggerValue).map(([key, val]) => {
                  const labels: Record<string, string> = { force: '牛顿力', rainfall: '降雨量', displacement: '位移量', moisture: '含水量', stress: '应力' };
                  const maxVals: Record<string, number> = { force: 100, rainfall: 80, displacement: 30, moisture: 50, stress: 50 };
                  const max = maxVals[key] ?? 100;
                  const pct = Math.min((val / max) * 100, 100);
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="w-16 text-xs text-muted-foreground">{labels[key] ?? key}</span>
                      <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-orange-500' : 'bg-cyan-500')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-16 text-right text-xs font-mono text-white">{val}</span>
                    </div>
                  );
                })}
              </div>
              <button className="mt-3 text-xs text-cyan-400 hover:underline">查看完整曲线 →</button>
            </div>

            {/* 处置时间线 */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">处置时间线</h3>
              </div>
              <div className="space-y-3">
                {selected.timeline.map((event, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={cn(
                      'mt-1 h-3 w-3 rounded-full shrink-0',
                      event.status === 'completed' ? 'bg-green-500' : event.status === 'current' ? 'bg-cyan-500 animate-pulse-warning' : 'bg-slate-600'
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={cn('text-sm', event.status === 'pending' ? 'text-muted-foreground' : 'text-white')}>
                          {event.event}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">{event.time}</span>
                      </div>
                      {i < selected.timeline.length - 1 && (
                        <div className="ml-1.5 mt-1 h-4 w-px bg-border" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 右侧操作面板 */}
        {selected && (
          <div className="w-64 shrink-0 space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <h4 className="mb-3 text-sm font-semibold text-white">当前处置人</h4>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm font-medium text-white">张值班组</p>
                <p className="text-xs text-muted-foreground">角色：值班领导</p>
              </div>

              <div className="mt-4 space-y-2">
                <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors">
                  <Volume2 className="h-4 w-4" /> 发布预警
                </button>
                <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 py-2.5 text-sm font-medium text-white hover:bg-orange-700 transition-colors">
                  <Phone className="h-4 w-4" /> 一键呼叫
                </button>
                <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 py-2.5 text-sm font-medium text-white hover:bg-cyan-700 transition-colors">
                  <MessageSquare className="h-4 w-4" /> 会商研判
                </button>
                <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
                  <FileText className="h-4 w-4" /> 生成指令
                </button>
                <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors">
                  <CheckCircle className="h-4 w-4" /> 处置完成
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h4 className="mb-3 text-sm font-semibold text-white">📋 关联信息</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">威胁人数</span>
                  <span className="text-white font-mono">156人</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">转移场所</span>
                  <span className="text-white">村小学</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">责任人</span>
                  <span className="text-white">张三(138xxx)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">网格员</span>
                  <span className="text-white">李四(139xxx)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
