'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  CheckCircle,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import type {
  HazardPoint,
  InspectionTask,
  InspectionTaskType,
} from '@/types';
import {
  cancelInspectionTask,
  completeInspectionTask,
  createAndDispatchInspectionTask,
  dispatchInspectionTask,
  getHazardPoints,
  getInspectionDispatchStats,
  getInspectionNextCode,
  getInspectionTasks,
  getInspectionWorkers,
  startInspectionTask,
  type InspectionDispatchStats,
  type InspectionWorker,
} from '@/lib/services';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  pending: { label: '待执行', cls: 'bg-yellow-500/20 text-yellow-400' },
  in_progress: { label: '进行中', cls: 'bg-cyan-500/20 text-cyan-400' },
};

const INPUT_CLS =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500';

type ModalMode = 'create' | 'dispatch' | 'complete' | null;

export default function InspectionDispatchPage() {
  const [tasks, setTasks] = useState<InspectionTask[]>([]);
  const [stats, setStats] = useState<InspectionDispatchStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  const [modal, setModal] = useState<ModalMode>(null);
  const [active, setActive] = useState<InspectionTask | null>(null);
  const [hazardOptions, setHazardOptions] = useState<HazardPoint[]>([]);
  const [workers, setWorkers] = useState<InspectionWorker[]>([]);

  const [form, setForm] = useState({
    code: '',
    title: '',
    task_type: 'routine' as InspectionTaskType,
    assigned_to: '',
    assigned_phone: '',
    route_desc: '',
    checkpoint_count: '5',
    planned_date: new Date().toISOString().slice(0, 10),
    hazard_point: '',
    priority: 'medium',
  });
  const [completeForm, setCompleteForm] = useState({
    result: '',
    issue_count: '0',
    duration_minutes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, st] = await Promise.all([
        getInspectionTasks({
          page: 1,
          pageSize: 100,
          dispatch: true,
          status: statusFilter || undefined,
          search: search.trim() || undefined,
          unassigned: unassignedOnly || undefined,
        }),
        getInspectionDispatchStats(),
      ]);
      setTasks(res.list);
      setStats(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, unassignedOnly]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getHazardPoints({ page: 1, pageSize: 100 })
      .then((r) => setHazardOptions(r.list))
      .catch(() => undefined);
    getInspectionWorkers()
      .then(setWorkers)
      .catch(() => undefined);
  }, []);

  const pickWorker = (name: string) => {
    const w = workers.find((x) => x.name === name || x.username === name);
    setForm((f) => ({
      ...f,
      assigned_to: name,
      assigned_phone: w?.phone || f.assigned_phone,
    }));
  };

  const openCreate = async () => {
    setError('');
    let code = '';
    try {
      code = await getInspectionNextCode();
    } catch {
      /* ignore */
    }
    setForm({
      code,
      title: '',
      task_type: 'routine',
      assigned_to: workers[0]?.name || '',
      assigned_phone: workers[0]?.phone || '',
      route_desc: '',
      checkpoint_count: '5',
      planned_date: new Date().toISOString().slice(0, 10),
      hazard_point: '',
      priority: 'medium',
    });
    setActive(null);
    setModal('create');
  };

  const openDispatch = (task: InspectionTask) => {
    setActive(task);
    setForm({
      code: task.code,
      title: task.title,
      task_type: task.taskType,
      assigned_to: task.assignedTo || workers[0]?.name || '',
      assigned_phone: task.assignedPhone || '',
      route_desc: task.routeDesc || '',
      checkpoint_count: String(task.checkpointCount || 1),
      planned_date: task.plannedDate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      hazard_point: task.hazardPointId ? String(task.hazardPointId) : '',
      priority: task.priority,
    });
    setModal('dispatch');
  };

  const openComplete = (task: InspectionTask) => {
    setActive(task);
    setCompleteForm({ result: '', issue_count: '0', duration_minutes: '' });
    setModal('complete');
  };

  const submitCreate = async () => {
    if (!form.title.trim() || !form.assigned_to.trim()) {
      setError('请填写任务名称与执行人');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await createAndDispatchInspectionTask({
        code: form.code || undefined,
        title: form.title.trim(),
        task_type: form.task_type,
        priority: form.priority as 'high' | 'medium' | 'low',
        assigned_to: form.assigned_to.trim(),
        assigned_phone: form.assigned_phone.trim(),
        route_desc: form.route_desc.trim(),
        checkpoint_count: Number(form.checkpoint_count || 1),
        planned_date: form.planned_date,
        hazard_point: form.hazard_point ? Number(form.hazard_point) : null,
      });
      setModal(null);
      setMsg('任务已创建并派发');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  const submitDispatch = async () => {
    if (!active) return;
    if (!form.assigned_to.trim()) {
      setError('请指定执行人');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await dispatchInspectionTask(active.id, {
        assigned_to: form.assigned_to.trim(),
        assigned_phone: form.assigned_phone.trim(),
        planned_date: form.planned_date || undefined,
        route_desc: form.route_desc,
        checkpoint_count: Number(form.checkpoint_count || 1),
      });
      setModal(null);
      setMsg(`已派发至 ${form.assigned_to.trim()}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '派发失败');
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async (task: InspectionTask) => {
    setBusy(true);
    setError('');
    try {
      await startInspectionTask(task.id);
      setMsg(`${task.code} 已开始执行`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '开始失败');
    } finally {
      setBusy(false);
    }
  };

  const submitComplete = async () => {
    if (!active) return;
    if (!completeForm.result.trim()) {
      setError('请填写排查结果，以形成巡查记录');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await completeInspectionTask(active.id, {
        result: completeForm.result.trim(),
        issue_count: Number(completeForm.issue_count || 0),
        duration_minutes: completeForm.duration_minutes
          ? Number(completeForm.duration_minutes)
          : undefined,
        sync_hazard_status: true,
      });
      setModal(null);
      let tip = `${active.code} 已完成，已进入「巡查记录」`;
      if (res.hazard_status_updated) {
        tip += `；隐患点状态已同步为 ${res.hazard_status_updated.status}`;
      }
      setMsg(tip);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '完成失败');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async (task: InspectionTask) => {
    const reason = window.prompt('取消原因（可选）', '');
    if (reason === null) return;
    setBusy(true);
    setError('');
    try {
      await cancelInspectionTask(task.id, reason);
      setMsg(`${task.code} 已取消`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '取消失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            className={cn(INPUT_CLS, 'w-40 pl-8')}
            placeholder="搜索编号/名称/执行人"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={cn(INPUT_CLS, 'w-auto')}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">全部状态</option>
          <option value="pending">待执行</option>
          <option value="in_progress">进行中</option>
        </select>
        <label className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={unassignedOnly}
            onChange={(e) => setUnassignedOnly(e.target.checked)}
          />
          仅未派发
        </label>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm"
        >
          <RefreshCw className="h-3.5 w-3.5" /> 刷新
        </button>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-cyan-600 px-3 text-sm text-white hover:bg-cyan-500"
        >
          <Plus className="h-4 w-4" /> 新建并派发
        </button>
      </PageHeader>

      <p className="text-xs text-muted-foreground">
        闭环：创建派发 → 开始执行 → 完成归档（巡查记录）/ 取消；发现问题可同步提升隐患点状态。
      </p>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}
      {msg && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-300">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="待办任务" value={String(stats?.open_total ?? 0)} />
        <Stat label="未派发" value={String(stats?.unassigned ?? 0)} color="text-yellow-400" />
        <Stat label="已派待执行" value={String(stats?.assigned_pending ?? 0)} />
        <Stat label="进行中" value={String(stats?.in_progress ?? 0)} color="text-cyan-400" />
        <Stat label="已逾期" value={String(stats?.overdue ?? 0)} color="text-red-400" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">任务编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">任务名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">路线</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">检查点</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">执行人</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">日期</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>
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
                  暂无待派发/执行中任务
                </td>
              </tr>
            ) : (
              tasks.map((t) => {
                const sc = STATUS_STYLES[t.status] || {
                  label: t.statusDisplay || t.status,
                  cls: 'bg-muted text-muted-foreground',
                };
                return (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs text-cyan-400">
                      {t.code}
                      {t.isOverdue && (
                        <span className="ml-1 text-red-400">逾期</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white">
                      <div>{t.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.hazardPointName || t.taskTypeDisplay || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {t.routeDesc || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-white">
                      {t.checkpointCount}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t.assignedTo || (
                        <span className="text-yellow-400">未派发</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {t.plannedDate || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded px-2 py-0.5 text-xs font-medium', sc.cls)}>
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {(t.status === 'pending' || t.status === 'in_progress') && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openDispatch(t)}
                            className="text-xs text-cyan-400 hover:underline"
                          >
                            {t.assignedTo ? '改派' : '派发'}
                          </button>
                        )}
                        {t.status === 'pending' && (
                          <button
                            type="button"
                            disabled={busy || !t.assignedTo}
                            onClick={() => handleStart(t)}
                            className="inline-flex items-center gap-0.5 text-xs text-green-400 hover:underline disabled:opacity-40"
                          >
                            <Play className="h-3 w-3" /> 开始
                          </button>
                        )}
                        {(t.status === 'pending' || t.status === 'in_progress') && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openComplete(t)}
                            className="inline-flex items-center gap-0.5 text-xs text-emerald-400 hover:underline"
                          >
                            <CheckCircle className="h-3 w-3" /> 完成
                          </button>
                        )}
                        {t.status !== 'cancelled' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleCancel(t)}
                            className="inline-flex items-center gap-0.5 text-xs text-red-300 hover:underline"
                          >
                            <Ban className="h-3 w-3" /> 取消
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 创建并派发 / 改派 */}
      {(modal === 'create' || modal === 'dispatch') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModal(null)} />
          <div className="relative w-full max-w-lg rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                {modal === 'create' ? '新建并派发任务' : `派发 / 改派 · ${active?.code}`}
              </h3>
              <button type="button" onClick={() => setModal(null)} className="rounded p-1 hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid max-h-[70vh] grid-cols-2 gap-3 overflow-y-auto">
              {modal === 'create' && (
                <>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs text-muted-foreground">任务名称 *</label>
                    <input
                      className={INPUT_CLS}
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">任务类型</label>
                    <select
                      className={INPUT_CLS}
                      value={form.task_type}
                      onChange={(e) =>
                        setForm({ ...form, task_type: e.target.value as InspectionTaskType })
                      }
                    >
                      <option value="routine">日常巡查</option>
                      <option value="special">专项排查</option>
                      <option value="emergency">应急排查</option>
                      <option value="periodic">定期巡检</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">优先级</label>
                    <select
                      className={INPUT_CLS}
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    >
                      <option value="high">高</option>
                      <option value="medium">中</option>
                      <option value="low">低</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs text-muted-foreground">关联隐患点</label>
                    <select
                      className={INPUT_CLS}
                      value={form.hazard_point}
                      onChange={(e) => setForm({ ...form, hazard_point: e.target.value })}
                    >
                      <option value="">不关联</option>
                      {hazardOptions.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.code} - {h.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">执行人 *</label>
                <select
                  className={INPUT_CLS}
                  value={form.assigned_to}
                  onChange={(e) => pickWorker(e.target.value)}
                >
                  <option value="">请选择</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.name}>
                      {w.name}（{w.role_display}
                      {w.village ? ` · ${w.village}` : ''}）
                    </option>
                  ))}
                </select>
                <input
                  className={cn(INPUT_CLS, 'mt-2')}
                  placeholder="或手动输入姓名"
                  value={form.assigned_to}
                  onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">联系电话</label>
                <input
                  className={INPUT_CLS}
                  value={form.assigned_phone}
                  onChange={(e) => setForm({ ...form, assigned_phone: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">计划日期</label>
                <input
                  className={INPUT_CLS}
                  type="date"
                  value={form.planned_date}
                  onChange={(e) => setForm({ ...form, planned_date: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">检查点数</label>
                <input
                  className={INPUT_CLS}
                  type="number"
                  min={1}
                  value={form.checkpoint_count}
                  onChange={(e) => setForm({ ...form, checkpoint_count: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs text-muted-foreground">排查路线</label>
                <input
                  className={INPUT_CLS}
                  value={form.route_desc}
                  onChange={(e) => setForm({ ...form, route_desc: e.target.value })}
                  placeholder="如：竹园坡→石桥崖→李家坪"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="h-9 rounded-lg border border-border px-4 text-sm"
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={modal === 'create' ? submitCreate : submitDispatch}
                className="inline-flex h-9 items-center gap-1 rounded-lg bg-cyan-600 px-4 text-sm text-white disabled:opacity-60"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {modal === 'create' ? '创建并派发' : '确认派发'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 完成 → 巡查记录 */}
      {modal === 'complete' && active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModal(null)} />
          <div className="relative w-full max-w-md rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">完成任务 · {active.code}</h3>
              <button type="button" onClick={() => setModal(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              填写结果后任务进入「巡查记录」归档；若发现问题将同步隐患点状态。
            </p>
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">排查结果 *</span>
                <textarea
                  className={cn(INPUT_CLS, 'h-24 py-2')}
                  value={completeForm.result}
                  onChange={(e) =>
                    setCompleteForm({ ...completeForm, result: e.target.value })
                  }
                  placeholder="巡查情况、处置措施等"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">发现问题数</span>
                  <input
                    type="number"
                    min={0}
                    className={INPUT_CLS}
                    value={completeForm.issue_count}
                    onChange={(e) =>
                      setCompleteForm({ ...completeForm, issue_count: e.target.value })
                    }
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">耗时(分钟)</span>
                  <input
                    type="number"
                    min={0}
                    className={INPUT_CLS}
                    value={completeForm.duration_minutes}
                    onChange={(e) =>
                      setCompleteForm({
                        ...completeForm,
                        duration_minutes: e.target.value,
                      })
                    }
                    placeholder="可选"
                  />
                </label>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="h-9 rounded-lg border border-border px-4 text-sm"
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={submitComplete}
                className="inline-flex h-9 items-center gap-1 rounded-lg bg-green-600 px-4 text-sm text-white disabled:opacity-60"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                确认完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  color = 'text-cyan-400',
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('font-mono text-lg font-bold', color)}>{value}</p>
    </div>
  );
}
