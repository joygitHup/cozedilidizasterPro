'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import {
  Users,
  MapPin,
  Route,
  CheckCircle,
  TrendingUp,
  Plus,
  Search,
  Download,
  Loader2,
  X,
  Play,
  Ban,
  Trash2,
  RefreshCw,
  Pencil,
} from 'lucide-react';
import type {
  EvacuationGeoJSON,
  EvacuationRelated,
  EvacuationStatus,
  EvacuationTask,
  EvacuationTaskStats,
  HazardPoint,
  WarningRecord,
} from '@/types';
import {
  cancelEvacuationTask,
  completeEvacuationTask,
  createEvacuationFromWarning,
  createEvacuationTask,
  deleteEvacuationTask,
  exportEvacuationTasks,
  getEvacuationMapGeoJSON,
  getEvacuationRelated,
  getEvacuationStats,
  getEvacuationTasks,
  getHazardPoints,
  getWarningList,
  rerouteEvacuationTask,
  startEvacuationTask,
  updateEvacuationProgress,
  updateEvacuationTask,
} from '@/lib/services';
import { PageHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { canWriteModule } from '@/lib/permissions';

const EvacuationMap = dynamic(
  () =>
    import('@/components/emergency/evacuation-map').then((m) => m.EvacuationMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-80 items-center justify-center rounded-lg border border-border bg-slate-950 text-sm text-muted-foreground">
        地图加载中…
      </div>
    ),
  }
);

const STATUS_CONFIG: Record<
  EvacuationStatus,
  { color: string; bg: string; label: string }
> = {
  pending: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: '待转移' },
  ongoing: { color: 'text-cyan-400', bg: 'bg-cyan-500/20', label: '进行中' },
  completed: { color: 'text-green-400', bg: 'bg-green-500/20', label: '已完成' },
  cancelled: { color: 'text-slate-400', bg: 'bg-slate-500/20', label: '已取消' },
};

const INPUT_CLS =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500';

type FormMode = 'create' | 'from_warning' | 'edit' | null;

type FormState = {
  warning_id: string;
  hazard_point: string;
  shelter_name: string;
  shelter_address: string;
  shelter_longitude: string;
  shelter_latitude: string;
  total_people: string;
  commander: string;
  commander_phone: string;
  grid_worker: string;
  grid_phone: string;
};

const emptyForm = (): FormState => ({
  warning_id: '',
  hazard_point: '',
  shelter_name: '',
  shelter_address: '',
  shelter_longitude: '',
  shelter_latitude: '',
  total_people: '',
  commander: '',
  commander_phone: '',
  grid_worker: '',
  grid_phone: '',
});

export default function EvacuationPage() {
  const [tasks, setTasks] = useState<EvacuationTask[]>([]);
  const [stats, setStats] = useState<EvacuationTaskStats | null>(null);
  const [geojson, setGeojson] = useState<EvacuationGeoJSON | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<EvacuationTask | null>(null);
  const [related, setRelated] = useState<EvacuationRelated | null>(null);
  const [progressValue, setProgressValue] = useState('');
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [warnings, setWarnings] = useState<WarningRecord[]>([]);
  const [hazards, setHazards] = useState<HazardPoint[]>([]);
  const del = useConfirmDelete<EvacuationTask>();
  const canWrite = canWriteModule('emergency');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [listRes, st, gj] = await Promise.all([
        getEvacuationTasks({
          pageSize: 100,
          status: statusFilter || undefined,
          search: search.trim() || undefined,
        }),
        getEvacuationStats(),
        getEvacuationMapGeoJSON(),
      ]);
      setTasks(listRes.list);
      setStats(st);
      setGeojson(gj);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (task: EvacuationTask) => {
    setSelected(task);
    setProgressValue(String(task.transferredPeople));
    setRelated(null);
    try {
      const r = await getEvacuationRelated(task.dbId);
      setRelated(r);
    } catch {
      /* ignore */
    }
  };

  const openCreate = async (mode: 'create' | 'from_warning') => {
    setFormMode(mode);
    setForm(emptyForm());
    setError('');
    try {
      const [w, h] = await Promise.all([
        getWarningList({ pageSize: 50, openOnly: true }),
        getHazardPoints({ pageSize: 100 }),
      ]);
      setWarnings(w.list);
      setHazards(h.list);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载选项失败');
    }
  };

  const openEdit = (task: EvacuationTask) => {
    setFormMode('edit');
    setForm({
      warning_id: task.warningDbId ? String(task.warningDbId) : '',
      hazard_point: task.hazardPointDbId ? String(task.hazardPointDbId) : '',
      shelter_name: task.shelter,
      shelter_address: task.shelterAddress,
      shelter_longitude: task.shelterLng != null ? String(task.shelterLng) : '',
      shelter_latitude: task.shelterLat != null ? String(task.shelterLat) : '',
      total_people: String(task.totalPeople),
      commander: task.commander,
      commander_phone: task.commanderPhone,
      grid_worker: task.gridWorker,
      grid_phone: task.gridPhone,
    });
  };

  const submitForm = async () => {
    setBusy(true);
    setError('');
    try {
      if (formMode === 'from_warning') {
        if (!form.warning_id) throw new Error('请选择预警单');
        await createEvacuationFromWarning({
          warning_id: Number(form.warning_id),
          shelter_name: form.shelter_name || undefined,
          shelter_address: form.shelter_address || undefined,
          shelter_longitude: form.shelter_longitude
            ? Number(form.shelter_longitude)
            : undefined,
          shelter_latitude: form.shelter_latitude
            ? Number(form.shelter_latitude)
            : undefined,
          total_people: form.total_people ? Number(form.total_people) : undefined,
          commander: form.commander || undefined,
          commander_phone: form.commander_phone || undefined,
          grid_worker: form.grid_worker || undefined,
          grid_phone: form.grid_phone || undefined,
        });
      } else if (formMode === 'create') {
        if (!form.hazard_point) throw new Error('请选择隐患点');
        await createEvacuationTask({
          hazard_point: Number(form.hazard_point),
          warning: form.warning_id ? Number(form.warning_id) : null,
          shelter_name: form.shelter_name || '指定安置点',
          shelter_address: form.shelter_address,
          shelter_longitude: form.shelter_longitude
            ? Number(form.shelter_longitude)
            : null,
          shelter_latitude: form.shelter_latitude
            ? Number(form.shelter_latitude)
            : null,
          total_people: form.total_people ? Number(form.total_people) : 0,
          commander: form.commander,
          commander_phone: form.commander_phone,
          grid_worker: form.grid_worker,
          grid_phone: form.grid_phone,
        });
      } else if (formMode === 'edit' && selected) {
        await updateEvacuationTask(selected.dbId, {
          shelter_name: form.shelter_name,
          shelter_address: form.shelter_address,
          shelter_longitude: form.shelter_longitude
            ? Number(form.shelter_longitude)
            : null,
          shelter_latitude: form.shelter_latitude
            ? Number(form.shelter_latitude)
            : null,
          total_people: form.total_people ? Number(form.total_people) : 0,
          commander: form.commander,
          commander_phone: form.commander_phone,
          grid_worker: form.grid_worker,
          grid_phone: form.grid_phone,
        });
      }
      setFormMode(null);
      await load();
      if (selected) {
        const refreshed = (await getEvacuationTasks({ pageSize: 100 })).list.find(
          (t) => t.dbId === selected.dbId
        );
        if (refreshed) await openDetail(refreshed);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (
    action: () => Promise<EvacuationTask>,
    keepOpen = true
  ) => {
    setBusy(true);
    setError('');
    try {
      const updated = await action();
      await load();
      if (keepOpen) await openDetail(updated);
      else {
        setSelected(null);
        setRelated(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () =>
    del.confirm(async (task) => {
      await deleteEvacuationTask(task.dbId);
      setSelected(null);
      setRelated(null);
      await load();
    });

  const pendingPeople = stats?.pending_people ?? 0;
  const transferredPeople = stats?.transferred_people ?? 0;
  const transferRate = stats?.completion_rate ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索编号/隐患点/安置点"
              className={cn(INPUT_CLS, 'w-40 pl-8')}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
          >
            <option value="">全部状态</option>
            <option value="pending">待转移</option>
            <option value="ongoing">进行中</option>
            <option value="completed">已完成</option>
            <option value="cancelled">已取消</option>
          </select>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm text-foreground hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" /> 刷新
          </button>
          <button
            type="button"
            onClick={() => exportEvacuationTasks({ status: statusFilter || undefined, search: search || undefined })}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm text-foreground hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" /> 导出
          </button>
          <button
            type="button"
            onClick={() => openCreate('from_warning')}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 text-sm text-cyan-300 hover:bg-cyan-500/20"
          >
            <Plus className="h-3.5 w-3.5" /> 预警发起
          </button>
          <button
            type="button"
            onClick={() => openCreate('create')}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-cyan-600 px-3 text-sm text-white hover:bg-cyan-500"
          >
            <Plus className="h-3.5 w-3.5" /> 新建任务
          </button>
      </PageHeader>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <MiniStat
          icon={Users}
          label="待转移"
          value={`${pendingPeople}人`}
          color="text-yellow-400"
          bg="bg-yellow-500/10"
        />
        <MiniStat
          icon={CheckCircle}
          label="已转移"
          value={`${transferredPeople}人`}
          color="text-green-400"
          bg="bg-green-500/10"
        />
        <MiniStat
          icon={TrendingUp}
          label="转移率"
          value={`${transferRate}%`}
          color="text-cyan-400"
          bg="bg-cyan-500/10"
        />
        <MiniStat
          icon={MapPin}
          label="安置点"
          value={`${stats?.shelter_count ?? 0}个`}
          color="text-blue-400"
          bg="bg-blue-500/10"
        />
        <MiniStat
          icon={Route}
          label="转移路线"
          value={`${stats?.route_count ?? 0}条`}
          color="text-purple-400"
          bg="bg-purple-500/10"
        />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">任务/预警</th>
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
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  暂无转移任务，可从预警发起或新建
                </td>
              </tr>
            ) : (
              tasks.map((task) => {
                const rate =
                  task.completionRate ||
                  (task.totalPeople > 0
                    ? (task.transferredPeople / task.totalPeople) * 100
                    : 0);
                const sc = STATUS_CONFIG[task.status];
                return (
                  <tr
                    key={task.dbId}
                    onClick={() => openDetail(task)}
                    className={cn(
                      'cursor-pointer border-b border-border last:border-0 hover:bg-muted/30 transition-colors',
                      selected?.dbId === task.dbId && 'bg-cyan-500/5'
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-cyan-400">{task.id}</div>
                      <div className="text-xs text-muted-foreground">
                        {task.warningCode || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white font-medium">{task.pointName}</td>
                    <td className="px-4 py-3 text-right font-mono text-white">
                      {task.totalPeople}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-green-400">
                      {task.transferredPeople}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              rate >= 100
                                ? 'bg-green-500'
                                : rate >= 50
                                  ? 'bg-cyan-500'
                                  : 'bg-yellow-500'
                            )}
                            style={{ width: `${Math.min(rate, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-white">
                          {rate.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-cyan-400">
                      {task.route.distance}km · {task.route.estimatedTime}min
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{task.shelter || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded px-2 py-0.5 text-xs font-medium',
                          sc.bg,
                          sc.color
                        )}
                      >
                        {sc.label}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">转移路线与安置点分布</h3>
          <p className="text-xs text-muted-foreground">
            Mapbox 展示隐患点 → 路线 → 安置点
            {selected ? ` · 高亮 ${selected.id}` : ''}
          </p>
        </div>
        <EvacuationMap
          geojson={geojson}
          highlightTaskId={selected?.dbId ?? null}
          heightClass="h-[22rem]"
        />
        {tasks.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {tasks
              .filter((t) => t.status !== 'cancelled')
              .slice(0, 8)
              .map((task, i) => (
                <button
                  key={task.dbId}
                  type="button"
                  onClick={() => openDetail(task)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors',
                    selected?.dbId === task.dbId
                      ? 'border-cyan-500/50 bg-cyan-500/10'
                      : 'border-border bg-muted/30 hover:bg-muted/50'
                  )}
                >
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full',
                      task.status === 'completed'
                        ? 'bg-green-500'
                        : 'bg-cyan-500 animate-pulse'
                    )}
                  />
                  <span className="text-white">
                    路线{i + 1}: {task.pointName} → {task.shelter}
                  </span>
                  <span className="text-muted-foreground">
                    ({task.route.distance}km / {task.route.estimatedTime}min)
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>

      {/* 详情抽屉 */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
          <div className="flex h-full w-full max-w-lg flex-col border-l border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h3 className="text-base font-semibold text-white">{selected.id}</h3>
                <p className="text-xs text-muted-foreground">
                  {selected.pointName} · {STATUS_CONFIG[selected.status].label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setRelated(null);
                }}
                className="rounded-lg p-1.5 hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
              <section className="space-y-1">
                <p className="text-muted-foreground">
                  预警：{selected.warningCode || '未关联'}
                </p>
                <p className="text-muted-foreground">
                  安置点：{selected.shelter || '—'}（{selected.shelterAddress || '无地址'}）
                </p>
                <p className="text-muted-foreground">
                  路线：{selected.route.distance} km · 预计 {selected.route.estimatedTime}{' '}
                  分钟 · {selected.route.path.length} 坐标点
                  {selected.route.provider
                    ? ` · 来源 ${selected.route.provider}`
                    : ''}
                </p>
                <p className="text-muted-foreground">
                  指挥：{selected.commander || '—'} {selected.commanderPhone}
                </p>
                <p className="text-muted-foreground">
                  网格员：{selected.gridWorker || '—'} {selected.gridPhone}
                </p>
              </section>

              <section className="rounded-lg border border-border p-3">
                <p className="mb-2 text-xs text-muted-foreground">转移进度</p>
                <div className="mb-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={selected.totalPeople}
                    value={progressValue}
                    onChange={(e) => setProgressValue(e.target.value)}
                    className={cn(INPUT_CLS, 'w-28')}
                    disabled={
                      !canWrite ||
                      selected.status === 'completed' ||
                      selected.status === 'cancelled'
                    }
                  />
                  <span className="text-muted-foreground">/ {selected.totalPeople} 人</span>
                  <button
                    type="button"
                    disabled={busy || !canWrite || selected.status === 'cancelled'}
                    onClick={() =>
                      runAction(() =>
                        updateEvacuationProgress(
                          selected.dbId,
                          Number(progressValue || 0)
                        )
                      )
                    }
                    className="h-9 rounded-lg bg-cyan-600 px-3 text-xs text-white hover:bg-cyan-500 disabled:opacity-50"
                  >
                    上报进度
                  </button>
                </div>
              </section>

              {related?.warning && (
                <section className="rounded-lg border border-border p-3 text-xs">
                  <p className="mb-1 font-medium text-white">关联预警闭环</p>
                  <p className="text-muted-foreground">
                    {related.warning.code} · {related.warning.level} ·{' '}
                    {related.warning.status}
                  </p>
                  {related.matched_plans.length > 0 && (
                    <p className="mt-1 text-muted-foreground">
                      匹配预案：
                      {related.matched_plans.map((p) => p.code).join('、')}
                    </p>
                  )}
                </section>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !canWrite || selected.status === 'cancelled'}
                  onClick={() =>
                    runAction(async () => {
                      const t = await rerouteEvacuationTask(selected.dbId);
                      setError('');
                      alert(
                        t.route_hint
                          ? `路线已重算：${t.route.provider || 'unknown'} · ${t.route_hint}`
                          : `路线已重算：${t.route.provider || 'unknown'} · ${t.route.distance}km / ${t.route.path.length}点`
                      );
                      return t;
                    })
                  }
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 text-xs text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
                >
                  <Route className="h-3.5 w-3.5" /> 路网重算
                </button>
                {selected.status === 'pending' && (
                  <button
                    type="button"
                    disabled={busy || !canWrite}
                    onClick={() => runAction(() => startEvacuationTask(selected.dbId))}
                    className="inline-flex h-9 items-center gap-1 rounded-lg bg-cyan-600 px-3 text-xs text-white disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5" /> 启动转移
                  </button>
                )}
                {(selected.status === 'pending' || selected.status === 'ongoing') && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => runAction(() => completeEvacuationTask(selected.dbId))}
                    className="inline-flex h-9 items-center gap-1 rounded-lg bg-green-600 px-3 text-xs text-white"
                  >
                    <CheckCircle className="h-3.5 w-3.5" /> 全部完成
                  </button>
                )}
                {selected.status !== 'completed' && selected.status !== 'cancelled' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => runAction(() => cancelEvacuationTask(selected.dbId))}
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs"
                  >
                    <Ban className="h-3.5 w-3.5" /> 取消
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openEdit(selected)}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs"
                >
                  <Pencil className="h-3.5 w-3.5" /> 编辑安置/职责
                </button>
                {selected.status !== 'ongoing' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => del.open(selected)}
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-500/40 px-3 text-xs text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> 删除
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!del.target}
        title="确认删除转移任务？"
        name={del.target?.pointName}
        code={del.target?.id}
        error={del.error}
        loading={del.loading}
        onCancel={del.close}
        onConfirm={confirmDelete}
      />

      {/* 新建/编辑弹窗 */}
      {formMode && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                {formMode === 'from_warning'
                  ? '从预警发起转移'
                  : formMode === 'edit'
                    ? '编辑转移任务'
                    : '新建转移任务'}
              </h3>
              <button type="button" onClick={() => setFormMode(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[70vh] space-y-3 overflow-y-auto">
              {(formMode === 'from_warning' || formMode === 'create') && (
                <Field label="关联预警">
                  <select
                    className={INPUT_CLS}
                    value={form.warning_id}
                    onChange={(e) => {
                      const wid = e.target.value;
                      const w = warnings.find((x) => String(x.dbId) === wid);
                      const hp = hazards.find(
                        (h) =>
                          String(h.id) === String(w?.hazardPointDbId) ||
                          h.code === w?.hazardPointId
                      );
                      setForm((f) => ({
                        ...f,
                        warning_id: wid,
                        hazard_point: w?.hazardPointDbId
                          ? String(w.hazardPointDbId)
                          : hp?.id || f.hazard_point,
                        total_people: hp
                          ? String(hp.threat.people)
                          : f.total_people,
                      }));
                    }}
                  >
                    <option value="">
                      {formMode === 'from_warning' ? '请选择预警单' : '可选'}
                    </option>
                    {warnings.map((w) => (
                      <option key={w.dbId} value={w.dbId}>
                        {w.id} · {w.hazardPointName} · {w.level}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {formMode === 'create' && (
                <Field label="隐患点 *">
                  <select
                    className={INPUT_CLS}
                    value={form.hazard_point}
                    onChange={(e) => {
                      const hp = hazards.find((x) => x.id === e.target.value);
                      setForm((f) => ({
                        ...f,
                        hazard_point: e.target.value,
                        total_people: hp ? String(hp.threat.people) : f.total_people,
                      }));
                    }}
                  >
                    <option value="">请选择隐患点</option>
                    {hazards.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.code} · {h.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="安置点名称">
                  <input
                    className={INPUT_CLS}
                    value={form.shelter_name}
                    onChange={(e) => setForm({ ...form, shelter_name: e.target.value })}
                    placeholder="如：竹园村小学"
                  />
                </Field>
                <Field label="需转移人数">
                  <input
                    type="number"
                    className={INPUT_CLS}
                    value={form.total_people}
                    onChange={(e) => setForm({ ...form, total_people: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="安置点地址">
                <input
                  className={INPUT_CLS}
                  value={form.shelter_address}
                  onChange={(e) => setForm({ ...form, shelter_address: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="安置点经度">
                  <input
                    className={INPUT_CLS}
                    value={form.shelter_longitude}
                    onChange={(e) =>
                      setForm({ ...form, shelter_longitude: e.target.value })
                    }
                    placeholder="可选，空则自动推算"
                  />
                </Field>
                <Field label="安置点纬度">
                  <input
                    className={INPUT_CLS}
                    value={form.shelter_latitude}
                    onChange={(e) =>
                      setForm({ ...form, shelter_latitude: e.target.value })
                    }
                    placeholder="可选，空则自动推算"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="指挥人">
                  <input
                    className={INPUT_CLS}
                    value={form.commander}
                    onChange={(e) => setForm({ ...form, commander: e.target.value })}
                  />
                </Field>
                <Field label="指挥电话">
                  <input
                    className={INPUT_CLS}
                    value={form.commander_phone}
                    onChange={(e) =>
                      setForm({ ...form, commander_phone: e.target.value })
                    }
                  />
                </Field>
                <Field label="网格员">
                  <input
                    className={INPUT_CLS}
                    value={form.grid_worker}
                    onChange={(e) => setForm({ ...form, grid_worker: e.target.value })}
                  />
                </Field>
                <Field label="网格员电话">
                  <input
                    className={INPUT_CLS}
                    value={form.grid_phone}
                    onChange={(e) => setForm({ ...form, grid_phone: e.target.value })}
                  />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">
                保存后将自动生成隐患点→安置点转移路线（GeoJSON），并在 Mapbox 地图中展示。
              </p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFormMode(null)}
                className="h-9 rounded-lg border border-border px-4 text-sm"
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={submitForm}
                className="inline-flex h-9 items-center gap-1 rounded-lg bg-cyan-600 px-4 text-sm text-white disabled:opacity-50"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
      <div className={cn('rounded-lg p-2', bg)}>
        <Icon className={cn('h-5 w-5', color)} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('font-mono text-lg font-bold', color)}>{value}</p>
      </div>
    </div>
  );
}
