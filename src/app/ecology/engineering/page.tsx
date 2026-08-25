'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Download,
  Loader2,
  X,
  CheckCircle,
  Play,
  Archive,
  Pencil,
  Trash2,
} from 'lucide-react';
import type {
  EcologyProject,
  EcologyProjectPayload,
  EcologyProjectStats,
  EcologyProjectStatus,
  EcologyProjectType,
  HazardPoint,
} from '@/types';
import {
  approveEcologyProject,
  archiveEcologyProject,
  completeEcologyProject,
  createEcologyProject,
  deleteEcologyProject,
  exportEcologyProjects,
  getEcologyProjectNextCode,
  getEcologyProjectRelated,
  getEcologyProjectStats,
  getEcologyProjects,
  getHazardPoints,
  startEcologyProject,
  updateEcologyProject,
} from '@/lib/services';
import { PageHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';

const STATUS_STYLE: Record<EcologyProjectStatus, { label: string; color: string; bg: string }> = {
  designing: { label: '设计中', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  approved: { label: '已批复', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  construction: { label: '施工中', color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
  completed: { label: '已完工', color: 'text-green-400', bg: 'bg-green-500/20' },
  archived: { label: '已归档', color: 'text-slate-400', bg: 'bg-slate-500/20' },
};

const TYPE_OPTIONS: { value: EcologyProjectType; label: string }[] = [
  { value: 'anchor', label: '锚索加固' },
  { value: 'drainage', label: '排水工程' },
  { value: 'vegetation', label: '生态恢复' },
  { value: 'retaining', label: '挡土墙' },
  { value: 'other', label: '其他' },
];

const INPUT =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500';

type FormState = {
  code: string;
  name: string;
  project_type: EcologyProjectType;
  hazard_point: string;
  location: string;
  description: string;
  budget: string;
  planned_days: string;
  designer: string;
  contractor: string;
  manager: string;
  manager_phone: string;
};

const emptyForm = (): FormState => ({
  code: '',
  name: '',
  project_type: 'anchor',
  hazard_point: '',
  location: '',
  description: '',
  budget: '',
  planned_days: '90',
  designer: '',
  contractor: '',
  manager: '',
  manager_phone: '',
});

export default function EngineeringPage() {
  const [list, setList] = useState<EcologyProject[]>([]);
  const [stats, setStats] = useState<EcologyProjectStats | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<EcologyProject | null>(null);
  const [relatedNote, setRelatedNote] = useState('');
  const [formOpen, setFormOpen] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [hazards, setHazards] = useState<HazardPoint[]>([]);
  const [busy, setBusy] = useState(false);
  const del = useConfirmDelete<EcologyProject>();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, st] = await Promise.all([
        getEcologyProjects({
          pageSize: 100,
          status: statusFilter || undefined,
          projectType: typeFilter || undefined,
          search: search.trim() || undefined,
        }),
        getEcologyProjectStats(),
      ]);
      setList(res.list);
      setStats(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (p: EcologyProject) => {
    setSelected(p);
    setRelatedNote('');
    try {
      const rel = await getEcologyProjectRelated(p.id);
      setRelatedNote(
        `进度记录 ${rel.progress_logs.length} 条 · 评估 ${rel.assessments.length} 条` +
          (rel.can_assess ? ' · 可进行效果评估' : ' · 批复开工后方可评估')
      );
    } catch {
      /* ignore */
    }
  };

  const openCreate = async () => {
    setForm(emptyForm());
    setFormOpen('create');
    try {
      const [code, h] = await Promise.all([
        getEcologyProjectNextCode(),
        getHazardPoints({ pageSize: 100 }),
      ]);
      setForm((f) => ({ ...f, code }));
      setHazards(h.list);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    }
  };

  const openEdit = async (p: EcologyProject) => {
    setFormOpen('edit');
    setForm({
      code: p.code,
      name: p.name,
      project_type: p.projectType,
      hazard_point: p.hazardPointId ? String(p.hazardPointId) : '',
      location: p.location,
      description: p.description,
      budget: String(p.budget),
      planned_days: String(p.plannedDays),
      designer: p.designer,
      contractor: p.contractor,
      manager: p.manager,
      manager_phone: p.managerPhone,
    });
    try {
      const h = await getHazardPoints({ pageSize: 100 });
      setHazards(h.list);
    } catch {
      /* ignore */
    }
  };

  const toPayload = (): EcologyProjectPayload => ({
    code: form.code.trim() || undefined,
    name: form.name.trim(),
    project_type: form.project_type,
    hazard_point: form.hazard_point ? Number(form.hazard_point) : null,
    location: form.location.trim(),
    description: form.description.trim(),
    budget: Number(form.budget || 0),
    planned_days: Number(form.planned_days || 0),
    designer: form.designer.trim(),
    contractor: form.contractor.trim(),
    manager: form.manager.trim(),
    manager_phone: form.manager_phone.trim(),
  });

  const submit = async () => {
    if (!form.name.trim()) {
      setError('请填写工程名称');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (formOpen === 'create') {
        const created = await createEcologyProject(toPayload());
        setFormOpen(null);
        await load();
        await openDetail(created);
      } else if (formOpen === 'edit' && selected) {
        const updated = await updateEcologyProject(selected.id, toPayload());
        setFormOpen(null);
        await load();
        await openDetail(updated);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<EcologyProject>) => {
    setBusy(true);
    setError('');
    try {
      const p = await fn();
      await load();
      await openDetail(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () =>
    del.confirm(async (project) => {
      await deleteEcologyProject(project.id);
      setSelected(null);
      await load();
    });

  return (
    <div className="space-y-4">
      <PageHeader>
        <div className="relative min-w-[160px] max-w-xs flex-1 basis-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className={cn(INPUT, 'pl-8')}
            placeholder="编号 / 名称 / 位置"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={cn(INPUT, 'w-[132px] shrink-0')}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">全部状态</option>
          {Object.entries(STATUS_STYLE).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select
          className={cn(INPUT, 'w-[132px] shrink-0')}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">全部类型</option>
          {TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {(search || statusFilter || typeFilter) && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setStatusFilter('');
              setTypeFilter('');
            }}
            className="h-9 shrink-0 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:bg-accent hover:text-cyan-400"
          >
            清空
          </button>
        )}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportEcologyProjects({
                status: statusFilter || undefined,
                search: search.trim() || undefined,
              })
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-accent"
          >
            <Download className="h-3.5 w-3.5" /> 导出
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-cyan-600 px-3 text-sm text-white hover:bg-cyan-500"
          >
            <Plus className="h-3.5 w-3.5" /> 新建工程
          </button>
        </div>
      </PageHeader>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="工程总数" value={String(stats?.total ?? 0)} />
        <Stat label="设计中" value={String(stats?.designing ?? 0)} />
        <Stat label="施工中" value={String(stats?.construction ?? 0)} />
        <Stat label="已完工" value={String(stats?.completed ?? 0)} />
        <Stat label="平均进度" value={`${stats?.avg_progress ?? 0}%`} />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">工程名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">类型</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">位置</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">进度</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">预算</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">暂无工程，请新建</td></tr>
            ) : list.map((p) => {
              const sc = STATUS_STYLE[p.status];
              return (
                <tr key={p.id} onClick={() => openDetail(p)} className={cn('cursor-pointer border-b border-border last:border-0 hover:bg-muted/30', selected?.id === p.id && 'bg-cyan-500/5')}>
                  <td className="px-4 py-3 font-mono text-xs text-cyan-400">{p.code}</td>
                  <td className="px-4 py-3 font-medium text-white">{p.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.projectTypeDisplay}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.location || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-cyan-500" style={{ width: `${p.progress}%` }} />
                      </div>
                      <span className="font-mono text-xs text-white">{p.progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-white">{p.budgetDisplay}</td>
                  <td className="px-4 py-3"><span className={cn('rounded px-2 py-0.5 text-xs font-medium', sc.bg, sc.color)}>{sc.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
          <div className="flex h-full w-full max-w-lg flex-col border-l border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h3 className="font-semibold text-white">{selected.name}</h3>
                <p className="text-xs text-muted-foreground">{selected.code} · {STATUS_STYLE[selected.status].label}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
              <p className="text-muted-foreground">{selected.description || '暂无设计说明'}</p>
              <p className="text-muted-foreground">位置：{selected.location || '—'} · 隐患点：{selected.hazardPointName || '—'}</p>
              <p className="text-muted-foreground">预算 {selected.budgetDisplay} · 工期 {selected.doneDays}/{selected.plannedDays} 天</p>
              <p className="text-muted-foreground">里程碑：{selected.currentMilestone || '—'}</p>
              <p className="text-muted-foreground">设计 {selected.designer || '—'} · 施工 {selected.contractor || '—'} · 负责人 {selected.manager || '—'}</p>
              {relatedNote && <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-cyan-300">{relatedNote}</p>}
              <div className="space-y-1">
                {(selected.milestones || []).map((m) => (
                  <div key={m.order} className="flex items-center justify-between rounded border border-border px-3 py-1.5 text-xs">
                    <span className="text-white">{m.order}. {m.title}</span>
                    <span className="text-muted-foreground">{m.status}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {selected.status === 'designing' && (
                  <button type="button" disabled={busy} onClick={() => act(() => approveEcologyProject(selected.id))} className="inline-flex h-9 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs text-white"><CheckCircle className="h-3.5 w-3.5" /> 批复</button>
                )}
                {(selected.status === 'designing' || selected.status === 'approved') && (
                  <button type="button" disabled={busy} onClick={() => act(() => startEcologyProject(selected.id))} className="inline-flex h-9 items-center gap-1 rounded-lg bg-cyan-600 px-3 text-xs text-white"><Play className="h-3.5 w-3.5" /> 开工</button>
                )}
                {selected.status === 'construction' && (
                  <button type="button" disabled={busy} onClick={() => act(() => completeEcologyProject(selected.id))} className="inline-flex h-9 items-center gap-1 rounded-lg bg-green-600 px-3 text-xs text-white"><CheckCircle className="h-3.5 w-3.5" /> 完工验收</button>
                )}
                {selected.status === 'completed' && (
                  <button type="button" disabled={busy} onClick={() => act(() => archiveEcologyProject(selected.id))} className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs"><Archive className="h-3.5 w-3.5" /> 归档</button>
                )}
                <button type="button" disabled={busy} onClick={() => openEdit(selected)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs"><Pencil className="h-3.5 w-3.5" /> 编辑</button>
                {selected.status !== 'construction' && (
                  <button type="button" disabled={busy} onClick={() => del.open(selected)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-500/40 px-3 text-xs text-red-300"><Trash2 className="h-3.5 w-3.5" /> 删除</button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">闭环：设计 → 批复 → 开工（自动记进度）→ 治理进度填报 → 完工 → 效果评估 → 归档</p>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!del.target}
        title="确认删除治理工程？"
        name={del.target?.name}
        code={del.target?.code}
        error={del.error}
        loading={del.loading}
        onCancel={del.close}
        onConfirm={confirmDelete}
      />

      {formOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-white">{formOpen === 'create' ? '新建治理工程' : '编辑工程'}</h3>
              <button type="button" onClick={() => setFormOpen(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[70vh] space-y-3 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <Field label="编号"><input className={INPUT} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
                <Field label="类型">
                  <select className={INPUT} value={form.project_type} onChange={(e) => setForm({ ...form, project_type: e.target.value as EcologyProjectType })}>
                    {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="工程名称 *"><input className={INPUT} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="关联隐患点">
                <select className={INPUT} value={form.hazard_point} onChange={(e) => {
                  const hp = hazards.find((h) => h.id === e.target.value);
                  setForm({
                    ...form,
                    hazard_point: e.target.value,
                    location: hp ? `${hp.location.town}${hp.location.village || ''}` || hp.location.address : form.location,
                  });
                }}>
                  <option value="">可选</option>
                  {hazards.map((h) => <option key={h.id} value={h.id}>{h.code} · {h.name}</option>)}
                </select>
              </Field>
              <Field label="位置"><input className={INPUT} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
              <Field label="设计说明"><textarea className={cn(INPUT, 'h-20 py-2')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="预算(万元)"><input type="number" className={INPUT} value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></Field>
                <Field label="计划工期(天)"><input type="number" className={INPUT} value={form.planned_days} onChange={(e) => setForm({ ...form, planned_days: e.target.value })} /></Field>
                <Field label="设计单位"><input className={INPUT} value={form.designer} onChange={(e) => setForm({ ...form, designer: e.target.value })} /></Field>
                <Field label="施工单位"><input className={INPUT} value={form.contractor} onChange={(e) => setForm({ ...form, contractor: e.target.value })} /></Field>
                <Field label="负责人"><input className={INPUT} value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} /></Field>
                <Field label="电话"><input className={INPUT} value={form.manager_phone} onChange={(e) => setForm({ ...form, manager_phone: e.target.value })} /></Field>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setFormOpen(null)} className="h-9 rounded-lg border border-border px-4 text-sm">取消</button>
              <button type="button" disabled={busy} onClick={submit} className="inline-flex h-9 items-center gap-1 rounded-lg bg-cyan-600 px-4 text-sm text-white">
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} 保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-lg font-bold text-cyan-400">{value}</p>
    </div>
  );
}
