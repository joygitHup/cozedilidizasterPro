'use client';

import { useEffect, useState } from 'react';
import {
  Siren,
  Users,
  MapPin,
  Route,
  CheckCircle,
  Clock,
  TrendingUp,
} from 'lucide-react';
import type { EvacuationTask } from '@/types';
import { getEvacuationTasks } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: '待转移' },
  ongoing: { color: 'text-cyan-400', bg: 'bg-cyan-500/20', label: '进行中' },
  completed: { color: 'text-green-400', bg: 'bg-green-500/20', label: '已完成' },
  cancelled: { color: 'text-slate-400', bg: 'bg-slate-500/20', label: '已取消' },
};

export default function EvacuationPage() {
  const [tasks, setTasks] = useState<EvacuationTask[]>([]);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    getEvacuationTasks().then(setTasks);
  }, []);

  const filtered = statusFilter ? tasks.filter((t) => t.status === statusFilter) : tasks;

  const totalPeople = tasks.reduce((s, t) => s + t.totalPeople, 0);
  const transferredPeople = tasks.reduce((s, t) => s + t.transferredPeople, 0);
  const transferRate = totalPeople > 0 ? ((transferredPeople / totalPeople) * 100).toFixed(1) : '0';
  const shelters = new Set(tasks.map((t) => t.shelter)).size;
  const routes = tasks.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Siren className="h-4 w-4" />
          <span>应急响应处置</span>
          <span>/</span>
          <span className="text-white">避险转移</span>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
          >
            <option value="">全部状态</option>
            <option value="pending">待转移</option>
            <option value="ongoing">进行中</option>
            <option value="completed">已完成</option>
          </select>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-5 gap-4">
        <MiniStat icon={Users} label="待转移" value={`${totalPeople - transferredPeople}人`} color="text-yellow-400" bg="bg-yellow-500/10" />
        <MiniStat icon={CheckCircle} label="已转移" value={`${transferredPeople}人`} color="text-green-400" bg="bg-green-500/10" />
        <MiniStat icon={TrendingUp} label="转移率" value={`${transferRate}%`} color="text-cyan-400" bg="bg-cyan-500/10" />
        <MiniStat icon={MapPin} label="安置点" value={`${shelters}个`} color="text-blue-400" bg="bg-blue-500/10" />
        <MiniStat icon={Route} label="转移路线" value={`${routes}条`} color="text-purple-400" bg="bg-purple-500/10" />
      </div>

      {/* 任务列表 */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">预警编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">隐患点</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">需转移</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">已转移</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">完成率</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">路线</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">安置点</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((task) => {
              const rate = task.totalPeople > 0 ? ((task.transferredPeople / task.totalPeople) * 100).toFixed(1) : '0';
              const sc = STATUS_CONFIG[task.status];
              return (
                <tr key={task.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-cyan-400">{task.warningId}</td>
                  <td className="px-4 py-3 text-white font-medium">{task.pointName}</td>
                  <td className="px-4 py-3 text-right font-mono text-white">{task.totalPeople}</td>
                  <td className="px-4 py-3 text-right font-mono text-green-400">{task.transferredPeople}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', Number(rate) >= 100 ? 'bg-green-500' : Number(rate) >= 50 ? 'bg-cyan-500' : 'bg-yellow-500')}
                          style={{ width: `${Math.min(Number(rate), 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-white">{rate}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-xs text-cyan-400 hover:underline">
                      {task.route.distance}km · 查看
                    </button>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{task.shelter}</td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded px-2 py-0.5 text-xs font-medium', sc.bg, sc.color)}>
                      {sc.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 转移地图区域（模拟） */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">🗺️ 转移路线与安置点分布</h3>
        <div className="relative h-64 rounded-lg bg-slate-900 border border-border overflow-hidden">
          {/* 模拟地图 */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <MapPin className="mx-auto h-12 w-12 text-slate-600" />
              <p className="mt-2 text-sm text-muted-foreground">GIS 地图区域</p>
              <p className="text-xs text-slate-500">集成 Cesium/Mapbox 后展示转移路线和安置点</p>
            </div>
          </div>

          {/* 模拟标注 */}
          <div className="absolute top-4 left-4 space-y-2">
            {tasks.map((task, i) => (
              <div key={task.id} className="flex items-center gap-2 rounded-lg bg-card/90 px-3 py-1.5 text-xs backdrop-blur">
                <span className={cn('h-2 w-2 rounded-full', task.status === 'completed' ? 'bg-green-500' : 'bg-cyan-500 animate-pulse')} />
                <span className="text-white">路线{i + 1}: {task.pointName} → {task.shelter}</span>
                <span className="text-muted-foreground">({task.route.distance}km, 预计{task.route.estimatedTime}min)</span>
              </div>
            ))}
          </div>

          {/* 图例 */}
          <div className="absolute bottom-4 right-4 flex gap-3 rounded-lg bg-card/90 px-3 py-2 text-xs backdrop-blur">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> 安置点</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-500" /> 转移路线</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> 隐患点</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, color, bg }: { icon: React.ElementType; label: string; value: string; color: string; bg: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
      <div className={cn('rounded-lg p-2', bg)}>
        <Icon className={cn('h-5 w-5', color)} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-lg font-bold font-mono', color)}>{value}</p>
      </div>
    </div>
  );
}
