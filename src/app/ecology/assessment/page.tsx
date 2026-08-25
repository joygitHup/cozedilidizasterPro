'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Download,
  Loader2,
  X,
  CheckCircle,
  Trash2,
} from 'lucide-react';
import type {
  EcologyAssessment,
  EcologyAssessmentStats,
  EcologyEffect,
  EcologyProject,
} from '@/types';
import {
  archiveEcologyProject,
  concludeEcologyAssessment,
  createEcologyAssessment,
  deleteEcologyAssessment,
  exportEcologyAssessments,
  getEcologyAssessmentNextCode,
  getEcologyAssessmentStats,
  getEcologyAssessments,
  getEcologyProjects,
} from '@/lib/services';
import { PageHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';

const EFFECT_STYLE: Record<EcologyEffect, { label: string; color: string; bg: string }> = {
  significant: { label: '显著提升', color: 'text-green-400', bg: 'bg-green-500/20' },
  qualified: { label: '达标', color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
  monitoring: { label: '监测中', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  failed: { label: '未达标', color: 'text-red-400', bg: 'bg-red-500/20' },
};

const INPUT =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500';

export default function AssessmentPage() {
  const [list, setList] = useState<EcologyAssessment[]>([]);
  const [stats, setStats] = useState<EcologyAssessmentStats | null>(null);
  const [effectFilter, setEffectFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [modal, setModal] = useState(false);
  const [projects, setProjects] = useState<EcologyProject[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    code: '',
    project: '',
    factor: '',
    before_value: '',
    after_value: '',
    unit: '',
    effect: 'monitoring' as EcologyEffect,
    conclusion: '',
    assessor: '',
  });
  const del = useConfirmDelete<EcologyAssessment>();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, st] = await Promise.all([
        getEcologyAssessments({
          pageSize: 100,
          effect: effectFilter || undefined,
          search: search.trim() || undefined,
        }),
        getEcologyAssessmentStats(),
      ]);
      setList(res.list);
      setStats(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [effectFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = async () => {
    setModal(true);
    setError('');
    try {
      const [code, projs] = await Promise.all([
        getEcologyAssessmentNextCode(),
        getEcologyProjects({ pageSize: 100 }),
      ]);
      const eligible = projs.list.filter((p) =>
        ['construction', 'completed', 'archived'].includes(p.status)
      );
      setProjects(eligible);
      setForm({
        code,
        project: eligible[0] ? String(eligible[0].id) : '',
        factor: '',
        before_value: '',
        after_value: '',
        unit: '',
        effect: 'monitoring',
        conclusion: '',
        assessor: '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    }
  };

  const submit = async () => {
    if (!form.project || !form.factor.trim()) {
      setError('请选择工程并填写评估因子');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await createEcologyAssessment({
        code: form.code || undefined,
        project: Number(form.project),
        factor: form.factor.trim(),
        before_value: form.before_value || '-',
        after_value: form.after_value || '-',
        unit: form.unit,
        effect: form.effect,
        conclusion: form.conclusion,
        assessor: form.assessor,
      });
      setModal(false);
      setMsg('评估已创建');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const conclude = async (a: EcologyAssessment, effect: EcologyEffect) => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await concludeEcologyAssessment(a.id, { effect });
      if (res.project_ready_to_archive) {
        setMsg(`${a.projectCode} 评估已齐，可归档工程`);
      } else {
        setMsg('评估结论已更新');
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const archiveProject = async (projectId: number) => {
    setBusy(true);
    try {
      await archiveEcologyProject(projectId);
      setMsg('工程已归档，治理闭环完成');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '归档失败');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () =>
    del.confirm(async (a) => {
      await deleteEcologyAssessment(a.id);
      await load();
    });

  return (
    <div className="space-y-4">
      <PageHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            className={cn(INPUT, 'w-40 pl-8')}
            placeholder="搜索工程/因子"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={cn(INPUT, 'w-auto')}
          value={effectFilter}
          onChange={(e) => setEffectFilter(e.target.value)}
        >
          <option value="">全部效果</option>
          {Object.entries(EFFECT_STYLE).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => exportEcologyAssessments({ effect: effectFilter || undefined, search })}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm"
        >
          <Download className="h-3.5 w-3.5" /> 导出
        </button>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-cyan-600 px-3 text-sm text-white"
        >
          <Plus className="h-3.5 w-3.5" /> 新建评估
        </button>
      </PageHeader>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
      {msg && (
        <div className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-300">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="评估总数" value={String(stats?.total ?? 0)} />
        <Stat label="显著提升" value={String(stats?.significant ?? 0)} />
        <Stat label="达标" value={String(stats?.qualified ?? 0)} />
        <Stat label="监测中" value={String(stats?.monitoring ?? 0)} />
        <Stat label="覆盖工程" value={String(stats?.project_covered ?? 0)} />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">工程名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">评估因子</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">治理前</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">治理后</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">效果</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">评估日期</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  暂无评估。完工或施工中工程可新建评估。
                </td>
              </tr>
            ) : (
              list.map((a) => {
                const sc = EFFECT_STYLE[a.effect];
                return (
                  <tr
                    key={a.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-cyan-400">{a.code}</td>
                    <td className="px-4 py-3 text-white">
                      <div>{a.projectName}</div>
                      <div className="text-xs text-muted-foreground">{a.projectCode}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{a.factor}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-red-400">
                      {a.beforeValue}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-green-400">
                      {a.afterValue}
                      {a.unit ? ` ${a.unit}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded px-2 py-0.5 text-xs font-medium', sc.bg, sc.color)}>
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{a.assessDate || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {a.effect === 'monitoring' && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => conclude(a, 'significant')}
                              className="text-xs text-green-400 hover:underline"
                            >
                              显著
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => conclude(a, 'qualified')}
                              className="text-xs text-cyan-400 hover:underline"
                            >
                              达标
                            </button>
                          </>
                        )}
                        {a.projectStatus === 'completed' && a.effect !== 'monitoring' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => archiveProject(a.projectId)}
                            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-white"
                          >
                            <CheckCircle className="h-3 w-3" /> 归档工程
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => del.open(a)}
                          className="text-xs text-red-300 hover:underline"
                        >
                          <Trash2 className="inline h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDeleteDialog
        open={!!del.target}
        title="确认删除效果评估？"
        name={del.target?.projectName}
        code={del.target?.code}
        error={del.error}
        loading={del.loading}
        onCancel={del.close}
        onConfirm={confirmDelete}
      />

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-white">新建效果评估</h3>
              <button type="button" onClick={() => setModal(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">编号</span>
                <input
                  className={INPUT}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">关联工程 *</span>
                <select
                  className={INPUT}
                  value={form.project}
                  onChange={(e) => setForm({ ...form, project: e.target.value })}
                >
                  <option value="">请选择（施工中/已完工）</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name} · {p.statusDisplay}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">评估因子 *</span>
                <input
                  className={INPUT}
                  placeholder="如：排水效率 / 边坡稳定性"
                  value={form.factor}
                  onChange={(e) => setForm({ ...form, factor: e.target.value })}
                />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">治理前</span>
                  <input
                    className={INPUT}
                    value={form.before_value}
                    onChange={(e) => setForm({ ...form, before_value: e.target.value })}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">治理后</span>
                  <input
                    className={INPUT}
                    value={form.after_value}
                    onChange={(e) => setForm({ ...form, after_value: e.target.value })}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">单位</span>
                  <input
                    className={INPUT}
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">效果</span>
                <select
                  className={INPUT}
                  value={form.effect}
                  onChange={(e) =>
                    setForm({ ...form, effect: e.target.value as EcologyEffect })
                  }
                >
                  {Object.entries(EFFECT_STYLE).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">评估说明</span>
                <textarea
                  className={cn(INPUT, 'h-20 py-2')}
                  value={form.conclusion}
                  onChange={(e) => setForm({ ...form, conclusion: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">评估人</span>
                <input
                  className={INPUT}
                  value={form.assessor}
                  onChange={(e) => setForm({ ...form, assessor: e.target.value })}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(false)}
                className="h-9 rounded-lg border border-border px-4 text-sm"
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={submit}
                className="inline-flex h-9 items-center gap-1 rounded-lg bg-cyan-600 px-4 text-sm text-white"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} 保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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
