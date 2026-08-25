'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Plus,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
  Pencil,
  Trash2,
  Loader2,
  Play,
  CheckCircle2,
  Ban,
} from 'lucide-react';
import type {
  HazardPoint,
  InspectionPriority,
  InspectionStatus,
  InspectionTask,
  InspectionTaskPayload,
  InspectionTaskStats,
  InspectionTaskType,
} from '@/types';
import {
  cancelInspectionTask,
  completeInspectionTask,
  createInspectionTask,
  deleteInspectionTask,
  dispatchInspectionTask,
  exportInspectionTasks,
  getHazardPoints,
  getInspectionNextCode,
  getInspectionStats,
  getInspectionTask,
  getInspectionTasks,
  startInspectionTask,
  updateInspectionTask,
} from '@/lib/services';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';

const STATUS_STYLES: Record<InspectionStatus, { bg: string; color: string; label: string }> = {
  pending: { bg: 'bg-yellow-500/20', color: 'text-yellow-400', label: '待执行' },
  in_progress: { bg: 'bg-cyan-500/20', color: 'text-cyan-400', label: '进行中' },
  completed: { bg: 'bg-green-500/20', color: 'text-green-400', label: '已完成' },
  cancelled: { bg: 'bg-slate-500/20', color: 'text-slate-400', label: '已取消' },
};

const TYPE_LABELS: Record<InspectionTaskType, string> = {
  routine: '日常巡查',
  special: '专项排查',
  emergency: '应急排查',
  periodic: '定期巡检',
};

const INPUT_CLS =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500';

type FormState = {
  code: string;
  title: string;
  description: string;
  task_type: InspectionTaskType;
  priority: InspectionPriority;
  hazard_point: string;
  assigned_to: string;
  assigned_phone: string;
  route_desc: string;
  checkpoint_count: string;
  planned_date: string;
};

const emptyForm = (): FormState => ({
  code: '',
  title: '',
  description: '',
  task_type: 'routine',
  priority: 'medium',
  hazard_point: '',
  assigned_to: '',
  assigned_phone: '',
  route_desc: '',
  checkpoint_count: '1',
  planned_date: new Date().toISOString().slice(0, 10),
});

function taskToForm(t: InspectionTask): FormState {
  return {
    code: t.code,
    title: t.title,
    description: t.description,
    task_type: t.taskType,
    priority: t.priority,
    hazard_point: t.hazardPointId != null ? String(t.hazardPointId) : '',
    assigned_to: t.assignedTo,
    assigned_phone: t.assignedPhone,
    route_desc: t.routeDesc,
    checkpoint_count: String(t.checkpointCount || 1),
    planned_date: t.plannedDate || '',
  };
}

function formToPayload(form: FormState): InspectionTaskPayload {
  return {
    code: form.code.trim() || undefined,
    title: form.title.trim(),
    description: form.description.trim(),
    task_type: form.task_type,
    priority: form.priority,
    hazard_point: form.hazard_point ? Number(form.hazard_point) : null,
    assigned_to: form.assigned_to.trim(),
    assigned_phone: form.assigned_phone.trim(),
    route_desc: form.route_desc.trim(),
    checkpoint_count: Number(form.checkpoint_count || 1),
    planned_date: form.planned_date || null,
  };
}

function formatDuration(mins: number) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h${m}m` : `${m}m`;
}

export default function HazardTasksPage() {
  const [tasks, setTasks] = useState<InspectionTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [stats, setStats] = useState<InspectionTaskStats | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<InspectionTask | null>(null);

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [hazardOptions, setHazardOptions] = useState<HazardPoint[]>([]);

  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeResult, setCompleteResult] = useState('');
  const [completeIssues, setCompleteIssues] = useState('0');
  const del = useConfirmDelete<InspectionTask>();

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadStats = useCallback(async () => {
    try {
      setStats(await getInspectionStats());
    } catch {
      setStats(null);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getInspectionTasks({
        page,
        pageSize,
        search,
        status: statusFilter,
        taskType: typeFilter,
        priority: priorityFilter,
        overdue: overdueOnly,
      });
      setTasks(res.list);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setTasks([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, typeFilter, priorityFilter, overdueOnly]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    getHazardPoints({ page: 1, pageSize: 100 })
      .then((r) => setHazardOptions(r.list))
      .catch(() => setHazardOptions([]));
  }, []);

  const openDetail = async (task: InspectionTask) => {
    setSelected(task);
    try {
      setSelected(await getInspectionTask(task.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载详情失败');
    }
  };

  const openCreate = async () => {
    const f = emptyForm();
    try {
      f.code = await getInspectionNextCode();
    } catch {
      /* ignore */
    }
    setForm(f);
    setFormError('');
    setModalMode('create');
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setFormError('请填写任务标题');
      return;
    }
    if (form.task_type === 'emergency' && !form.hazard_point) {
      setFormError('应急排查必须关联隐患点');
      return;
    }
    if (form.priority === 'high' && (!form.assigned_to.trim() || !form.planned_date)) {
      setFormError('高优先级任务需指定执行人与计划日期');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (modalMode === 'create') {
        const created = await createInspectionTask(formToPayload(form));
        setModalMode(null);
        await loadData();
        await loadStats();
        await openDetail(created);
      } else if (modalMode === 'edit' && selected) {
        const updated = await updateInspectionTask(selected.id, formToPayload(form));
        setModalMode(null);
        setSelected(updated);
        await loadData();
        await loadStats();
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () =>
    del.confirm(async (task) => {
      await deleteInspectionTask(task.id);
      if (selected?.id === task.id) setSelected(null);
      await loadData();
      await loadStats();
    });

  const handleStart = async (task: InspectionTask) => {
    try {
      const updated = await startInspectionTask(task.id);
      setSelected(updated);
      await loadData();
      await loadStats();
    } catch (e) {
      alert(e instanceof Error ? e.message : '开始失败');
    }
  };

  const handleCancel = async (task: InspectionTask) => {
    const reason = window.prompt('取消原因（可选）') ?? '';
    try {
      const updated = await cancelInspectionTask(task.id, reason);
      setSelected(updated);
      await loadData();
      await loadStats();
    } catch (e) {
      alert(e instanceof Error ? e.message : '取消失败');
    }
  };

  const handleComplete = async () => {
    if (!selected) return;
    if (!completeResult.trim()) {
      alert('请填写排查结果');
      return;
    }
    try {
      const updated = await completeInspectionTask(selected.id, {
        result: completeResult.trim(),
        issue_count: Number(completeIssues || 0),
        sync_hazard_status: true,
      });
      setCompleteOpen(false);
      setCompleteResult('');
      setCompleteIssues('0');
      setSelected(updated);
      await loadData();
      await loadStats();
      if (updated.hazard_status_updated) {
        alert(
          `任务已完成。关联隐患点状态已更新为：${updated.hazard_status_updated.status}`
        );
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '完成失败');
    }
  };

  const handleQuickDispatch = async (task: InspectionTask) => {
    const name = window.prompt('指定执行人', task.assignedTo || '');
    if (!name) return;
    try {
      const updated = await dispatchInspectionTask(task.id, { assigned_to: name });
      setSelected(updated);
      await loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : '派发失败');
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700"
          >
            <Plus className="h-4 w-4" /> 新建任务
          </button>
          <button
            onClick={() =>
              exportInspectionTasks({ status: statusFilter, search }).catch((e) =>
                alert(e instanceof Error ? e.message : '导出失败')
              )
            }
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
          >
            <Download className="h-4 w-4" /> 导出
          </button>
      </PageHeader>

      {stats && (
        <div className="grid grid-cols-5 gap-3">
          <Stat label="全部" value={stats.total} />
          <Stat label="待执行" value={stats.by_status.pending} accent="text-yellow-400" />
          <Stat label="进行中" value={stats.by_status.in_progress} accent="text-cyan-400" />
          <Stat label="已完成" value={stats.by_status.completed} accent="text-green-400" />
          <Stat label="逾期" value={stats.overdue} accent="text-red-400" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">筛选条件</h3>
          <button
            onClick={() => {
              setSearch('');
              setStatusFilter('');
              setTypeFilter('');
              setPriorityFilter('');
              setOverdueOnly(false);
              setPage(1);
            }}
            className="text-xs text-muted-foreground hover:text-cyan-400"
          >
            清空条件
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-4">
            <label className="mb-1.5 block text-xs text-muted-foreground">关键词</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (setPage(1), loadData())}
                placeholder="编号 / 标题 / 执行人"
                className={cn(INPUT_CLS, 'pl-9')}
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs text-muted-foreground">状态</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className={INPUT_CLS}
            >
              <option value="">全部</option>
              <option value="pending">待执行</option>
              <option value="in_progress">进行中</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs text-muted-foreground">类型</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className={INPUT_CLS}
            >
              <option value="">全部</option>
              <option value="routine">日常巡查</option>
              <option value="special">专项排查</option>
              <option value="emergency">应急排查</option>
              <option value="periodic">定期巡检</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs text-muted-foreground">优先级</label>
            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setPage(1);
              }}
              className={INPUT_CLS}
            >
              <option value="">全部</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>
          <div className="flex items-end gap-2 md:col-span-2">
            <label className="flex h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background px-2 text-xs text-muted-foreground hover:border-cyan-500/40">
              <input
                type="checkbox"
                className="accent-cyan-500"
                checked={overdueOnly}
                onChange={(e) => {
                  setOverdueOnly(e.target.checked);
                  setPage(1);
                }}
              />
              仅逾期
            </label>
            <button
              onClick={() => {
                setPage(1);
                loadData();
              }}
              className="h-9 shrink-0 rounded-lg bg-cyan-600 px-4 text-sm font-medium text-white hover:bg-cyan-700"
            >
              查询
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">任务编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">任务名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">类型</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">负责人</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">计划日期</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  暂无排查任务
                </td>
              </tr>
            ) : (
              tasks.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs text-cyan-400">{t.code}</td>
                  <td className="px-4 py-3 text-white">
                    {t.title}
                    {t.isOverdue && (
                      <span className="ml-2 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-400">
                        逾期
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {TYPE_LABELS[t.taskType] || t.taskTypeDisplay}
                  </td>
                  <td className="px-4 py-3 text-white">{t.assignedTo || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.plannedDate || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded px-2 py-0.5 text-xs font-medium',
                        STATUS_STYLES[t.status].bg,
                        STATUS_STYLES[t.status].color
                      )}
                    >
                      {STATUS_STYLES[t.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openDetail(t)}
                        className="text-xs text-cyan-400 hover:underline"
                      >
                        详情
                      </button>
                      <button
                        onClick={() => {
                          setSelected(t);
                          setForm(taskToForm(t));
                          setFormError('');
                          setModalMode('edit');
                        }}
                        className="text-muted-foreground hover:text-white"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => del.open(t)}
                        className="text-muted-foreground hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          共 {total} 条 第 {page}/{totalPages} 页
        </span>
        <div className="flex gap-1">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded p-1 hover:bg-accent disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded p-1 hover:bg-accent disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 详情 */}
      <ConfirmDeleteDialog
        open={!!del.target}
        title="确认删除排查任务？"
        name={del.target?.title}
        code={del.target?.code}
        error={del.error}
        loading={del.loading}
        onCancel={del.close}
        onConfirm={confirmDelete}
      />

      {selected && !modalMode && !completeOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} />
          <div className="relative w-[480px] overflow-y-auto border-l border-border bg-card">
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card p-4">
              <h3 className="text-lg font-bold text-white">{selected.title}</h3>
              <button onClick={() => setSelected(null)} className="rounded p-1 hover:bg-accent">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-3">
                <Info label="编号" value={selected.code} />
                <Info label="类型" value={TYPE_LABELS[selected.taskType]} />
                <Info label="优先级" value={selected.priorityDisplay || selected.priority} />
                <Info label="状态">
                  <span
                    className={cn(
                      'rounded px-2 py-0.5 text-xs font-medium',
                      STATUS_STYLES[selected.status].bg,
                      STATUS_STYLES[selected.status].color
                    )}
                  >
                    {STATUS_STYLES[selected.status].label}
                  </span>
                </Info>
              </div>
              <div className="rounded-lg border border-border p-3 text-sm">
                <p className="text-xs text-muted-foreground">关联隐患点</p>
                <p className="mt-1 text-white">
                  {selected.hazardPointCode
                    ? `${selected.hazardPointName} (${selected.hazardPointCode})`
                    : '未关联'}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">执行人 / 电话</p>
                <p className="mt-1 text-white">
                  {selected.assignedTo || '—'} {selected.assignedPhone && `· ${selected.assignedPhone}`}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">路线 / 检查点</p>
                <p className="mt-1 text-white">
                  {selected.routeDesc || '—'} · {selected.checkpointCount} 个点
                </p>
                <p className="mt-3 text-xs text-muted-foreground">计划 / 开始 / 完成</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selected.plannedDate || '—'} / {selected.startedAt || '—'} /{' '}
                  {selected.completedAt || '—'}
                </p>
              </div>
              {selected.result && (
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">排查结果</p>
                  <p className="mt-1 text-sm text-white whitespace-pre-wrap">{selected.result}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    发现问题 {selected.issueCount} · 耗时 {formatDuration(selected.durationMinutes)}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {selected.status === 'pending' && (
                  <>
                    <ActionBtn onClick={() => handleQuickDispatch(selected)}>派发</ActionBtn>
                    <ActionBtn onClick={() => handleStart(selected)} icon={<Play className="h-3.5 w-3.5" />}>
                      开始
                    </ActionBtn>
                  </>
                )}
                {(selected.status === 'pending' || selected.status === 'in_progress') && (
                  <>
                    <ActionBtn
                      onClick={() => {
                        setCompleteResult('');
                        setCompleteIssues('0');
                        setCompleteOpen(true);
                      }}
                      icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    >
                      完成
                    </ActionBtn>
                    <ActionBtn
                      onClick={() => handleCancel(selected)}
                      icon={<Ban className="h-3.5 w-3.5" />}
                      danger
                    >
                      取消
                    </ActionBtn>
                  </>
                )}
                <ActionBtn
                  onClick={() => {
                    setForm(taskToForm(selected));
                    setFormError('');
                    setModalMode('edit');
                  }}
                >
                  编辑
                </ActionBtn>
              </div>
              <p className="text-xs text-muted-foreground">
                闭环说明：完成任务须填写结果；若发现问题且已关联隐患点，将自动提升隐患点状态（稳定→关注，问题≥3→预警）。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 完成弹窗 */}
      {completeOpen && selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCompleteOpen(false)} />
          <div className="relative w-[420px] rounded-lg border border-border bg-card p-6">
            <h3 className="mb-4 text-lg font-bold text-white">完成排查任务</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">排查结果 *</label>
                <textarea
                  className={cn(INPUT_CLS, 'h-24 py-2')}
                  value={completeResult}
                  onChange={(e) => setCompleteResult(e.target.value)}
                  placeholder="填写现场情况与处置建议"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">发现问题数</label>
                <input
                  className={INPUT_CLS}
                  type="number"
                  min={0}
                  value={completeIssues}
                  onChange={(e) => setCompleteIssues(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setCompleteOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground"
                >
                  取消
                </button>
                <button
                  onClick={handleComplete}
                  className="rounded-lg bg-cyan-600 px-4 py-2 text-sm text-white hover:bg-cyan-700"
                >
                  确认完成
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 新建/编辑 */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !saving && setModalMode(null)} />
          <div className="relative max-h-[85vh] w-[640px] overflow-y-auto rounded-lg border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {modalMode === 'create' ? '新建排查任务' : '编辑排查任务'}
              </h3>
              <button onClick={() => setModalMode(null)} className="rounded p-1 hover:bg-accent">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            {formError && (
              <div className="mb-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {formError}
              </div>
            )}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="编号">
                  <input
                    className={INPUT_CLS}
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    disabled={modalMode === 'edit'}
                  />
                </Field>
                <Field label="标题 *">
                  <input
                    className={INPUT_CLS}
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </Field>
                <Field label="类型">
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
                </Field>
                <Field label="优先级">
                  <select
                    className={INPUT_CLS}
                    value={form.priority}
                    onChange={(e) =>
                      setForm({ ...form, priority: e.target.value as InspectionPriority })
                    }
                  >
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                </Field>
                <Field label="关联隐患点">
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
                </Field>
                <Field label="计划日期">
                  <input
                    className={INPUT_CLS}
                    type="date"
                    value={form.planned_date}
                    onChange={(e) => setForm({ ...form, planned_date: e.target.value })}
                  />
                </Field>
                <Field label="执行人">
                  <input
                    className={INPUT_CLS}
                    value={form.assigned_to}
                    onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                  />
                </Field>
                <Field label="联系电话">
                  <input
                    className={INPUT_CLS}
                    value={form.assigned_phone}
                    onChange={(e) => setForm({ ...form, assigned_phone: e.target.value })}
                  />
                </Field>
                <Field label="检查点数">
                  <input
                    className={INPUT_CLS}
                    type="number"
                    min={1}
                    value={form.checkpoint_count}
                    onChange={(e) => setForm({ ...form, checkpoint_count: e.target.value })}
                  />
                </Field>
                <Field label="排查路线">
                  <input
                    className={INPUT_CLS}
                    value={form.route_desc}
                    onChange={(e) => setForm({ ...form, route_desc: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="描述">
                <textarea
                  className={cn(INPUT_CLS, 'h-20 py-2')}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <button
                  onClick={() => setModalMode(null)}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm text-white hover:bg-cyan-700 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  保存
                </button>
              </div>
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
  accent = 'text-white',
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-mono text-xl font-semibold', accent)}>{value}</p>
    </div>
  );
}

function Info({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children ?? <p className="mt-0.5 text-sm text-white">{value}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  icon,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs',
        danger
          ? 'border-red-500/40 text-red-400 hover:bg-red-500/10'
          : 'border-border text-foreground hover:bg-accent'
      )}
    >
      {icon}
      {children}
    </button>
  );
}
