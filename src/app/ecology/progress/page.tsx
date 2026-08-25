'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Loader2, X, Search, Trash2 } from 'lucide-react';
import type {
  EcologyProgressBoardItem,
  EcologyProgressLog,
  EcologyProgressStats,
  EcologyProject,
} from '@/types';
import {
  createEcologyProgress,
  deleteEcologyProgress,
  getEcologyProgressBoard,
  getEcologyProgressStats,
  getEcologyProjects,
} from '@/lib/services';
import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { cn } from '@/lib/utils';

const INPUT =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500';

export default function ProgressPage() {
  const [board, setBoard] = useState<EcologyProgressBoardItem[]>([]);
  const [stats, setStats] = useState<EcologyProgressStats | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [projects, setProjects] = useState<EcologyProject[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    project: '',
    progress: '50',
    done_days: '0',
    milestone: '',
    note: '',
    reporter: '',
  });
  const del = useConfirmDelete<EcologyProgressLog>();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [b, s] = await Promise.all([
        getEcologyProgressBoard({
          status: statusFilter || undefined,
          search: search.trim() || undefined,
        }),
        getEcologyProgressStats(),
      ]);
      setBoard(b);
      setStats(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const openReport = async (projectId?: number) => {
    setModal(true);
    setError('');
    try {
      const res = await getEcologyProjects({ pageSize: 100 });
      const active = res.list.filter((p) =>
        ['approved', 'construction', 'completed'].includes(p.status)
      );
      setProjects(active);
      const cur = active.find((p) => p.id === projectId) || active[0];
      if (cur) {
        setForm({
          project: String(cur.id),
          progress: String(Math.min(cur.progress + 5, 100)),
          done_days: String(Math.min(cur.doneDays + 1, cur.plannedDays || cur.doneDays + 1)),
          milestone: cur.currentMilestone || '',
          note: '',
          reporter: cur.manager || '',
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载工程失败');
    }
  };

  const submit = async () => {
    if (!form.project) {
      setError('请选择工程');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await createEcologyProgress({
        project: Number(form.project),
        progress: Number(form.progress),
        done_days: Number(form.done_days || 0),
        milestone: form.milestone,
        note: form.note,
        reporter: form.reporter,
      });
      setModal(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '填报失败');
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
            className={cn(INPUT, 'w-40 pl-8')}
            placeholder="搜索工程"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={cn(INPUT, 'w-auto')}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">全部状态</option>
          <option value="construction">施工中</option>
          <option value="completed">已完工</option>
          <option value="approved">已批复</option>
          <option value="designing">设计中</option>
        </select>
        <button
          type="button"
          onClick={() => openReport()}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-cyan-600 px-3 text-sm text-white"
        >
          <Plus className="h-3.5 w-3.5" /> 填报进度
        </button>
      </PageHeader>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="在册工程" value={String(stats?.project_count ?? 0)} />
        <Stat label="施工中" value={String(stats?.construction ?? 0)} />
        <Stat label="平均进度" value={`${stats?.avg_progress ?? 0}%`} />
        <Stat label="进度记录" value={String(stats?.log_count ?? 0)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {board.length === 0 ? (
            <div className="col-span-full rounded-lg border border-border bg-card p-10 text-center text-muted-foreground">
              暂无进度数据，请先在「工程设计」中批复/开工，再填报进度
            </div>
          ) : (
            board.map(({ project: p, latest_log }) => (
              <div key={p.id} className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-white">{p.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {p.code} · {p.statusDisplay}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'font-mono text-lg font-bold',
                      p.progress === 100 ? 'text-green-400' : 'text-cyan-400'
                    )}
                  >
                    {p.progress}%
                  </span>
                </div>
                <div className="mb-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      p.progress === 100 ? 'bg-green-500' : 'bg-cyan-500'
                    )}
                    style={{ width: `${p.progress}%` }}
                  />
                </div>
                <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                  <span>完成: {p.doneDays} 天</span>
                  <span>总工期: {p.plannedDays} 天</span>
                </div>
                <p className="border-t border-border pt-2 text-xs text-muted-foreground">
                  {p.currentMilestone || latest_log?.milestone || '暂无里程碑'}
                </p>
                {latest_log && (
                  <div className="mt-1 flex items-start justify-between gap-2">
                    <p className="text-xs text-slate-500">
                      最近填报：{latest_log.reportDate} · {latest_log.reporter || '—'} ·{' '}
                      {latest_log.progress}%
                    </p>
                    <button
                      type="button"
                      onClick={() => del.open(latest_log)}
                      className="shrink-0 text-xs text-red-300 hover:underline"
                      title="删除最近一条进度记录"
                    >
                      <Trash2 className="inline h-3 w-3" /> 撤销
                    </button>
                  </div>
                )}
                {p.status !== 'archived' && p.status !== 'designing' && (
                  <button
                    type="button"
                    onClick={() => openReport(p.id)}
                    className="mt-3 text-xs text-cyan-400 hover:underline"
                  >
                    继续填报 →
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!del.target}
        title="确认撤销进度填报？"
        name={del.target?.projectName}
        code={del.target ? `${del.target.progress}% · ${del.target.reportDate}` : undefined}
        hint="删除后将回同步工程进度到上一笔有效填报。"
        error={del.error}
        loading={del.loading}
        onCancel={del.close}
        onConfirm={() =>
          del.confirm(async (log) => {
            await deleteEcologyProgress(log.id);
            await load();
          })
        }
      />

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-white">填报治理进度</h3>
              <button type="button" onClick={() => setModal(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">工程</span>
                <select
                  className={INPUT}
                  value={form.project}
                  onChange={(e) => {
                    const p = projects.find((x) => String(x.id) === e.target.value);
                    setForm({
                      ...form,
                      project: e.target.value,
                      progress: p ? String(p.progress) : form.progress,
                      done_days: p ? String(p.doneDays) : form.done_days,
                      milestone: p?.currentMilestone || form.milestone,
                      reporter: p?.manager || form.reporter,
                    });
                  }}
                >
                  <option value="">请选择</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name}（{p.progress}%）
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">进度%</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className={INPUT}
                    value={form.progress}
                    onChange={(e) => setForm({ ...form, progress: e.target.value })}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">累计完成天</span>
                  <input
                    type="number"
                    className={INPUT}
                    value={form.done_days}
                    onChange={(e) => setForm({ ...form, done_days: e.target.value })}
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">里程碑</span>
                <input
                  className={INPUT}
                  value={form.milestone}
                  onChange={(e) => setForm({ ...form, milestone: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">说明</span>
                <textarea
                  className={cn(INPUT, 'h-20 py-2')}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">填报人</span>
                <input
                  className={INPUT}
                  value={form.reporter}
                  onChange={(e) => setForm({ ...form, reporter: e.target.value })}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                保存后将同步工程台账进度；达到 100% 时自动转为已完工。
              </p>
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
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} 提交
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
