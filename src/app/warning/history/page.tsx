'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Search, Trash2 } from 'lucide-react';
import type { WarningRecord } from '@/types';
import { deleteWarningRecord, getWarningList } from '@/lib/services';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';

const LEVEL_STYLES: Record<string, string> = {
  red: 'bg-red-500/20 text-red-400',
  orange: 'bg-orange-500/20 text-orange-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
  blue: 'bg-blue-500/20 text-blue-400',
};

const STATUS_STYLES: Record<string, string> = {
  closed: 'bg-green-500/20 text-green-400',
  processing: 'bg-cyan-500/20 text-cyan-400',
  published: 'bg-cyan-500/20 text-cyan-400',
  analyzing: 'bg-yellow-500/20 text-yellow-400',
  confirmed: 'bg-orange-500/20 text-orange-400',
  pending: 'bg-red-500/20 text-red-400',
};

function durationText(w: WarningRecord) {
  if (!w.closeTime) return '—';
  const start = new Date(w.createTime).getTime();
  const end = new Date(w.closeTime).getTime();
  if (!start || !end || end < start) return '—';
  const mins = Math.round((end - start) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h${m}m` : `${h}h`;
}

function formatTime(v?: string) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return v;
  }
}

export default function WarningHistoryPage() {
  const [list, setList] = useState<WarningRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const del = useConfirmDelete<WarningRecord>();
  const pageSize = 15;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getWarningList({
        page,
        pageSize,
        statusGroup: 'closed',
        level: level || undefined,
        search: search || undefined,
      });
      setList(res.list);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [page, level, search]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDelete = () =>
    del.confirm(async (w) => {
      await deleteWarningRecord(w.dbId);
      await load();
    });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <PageHeader>
          <button
            onClick={load}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-accent"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> 刷新
          </button>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load())}
            placeholder="编号 / 隐患点 / 触发类型"
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={level}
          onChange={(e) => {
            setLevel(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border border-border bg-card px-3 text-sm"
        >
          <option value="">全部等级</option>
          <option value="red">红色</option>
          <option value="orange">橙色</option>
          <option value="yellow">黄色</option>
          <option value="blue">蓝色</option>
        </select>
        <button
          onClick={() => {
            setPage(1);
            load();
          }}
          className="h-9 rounded-lg bg-cyan-600 px-4 text-sm text-white hover:bg-cyan-700"
        >
          查询
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">预警编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">隐患点</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">等级</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">触发条件</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">触发时间</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">处置时长</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-cyan-400" />
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  暂无已闭环历史预警
                </td>
              </tr>
            ) : (
              list.map((h) => (
                <tr key={h.dbId} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs text-cyan-400">{h.id}</td>
                  <td className="px-4 py-3 text-white">
                    {h.hazardPointName}
                    <span className="ml-1 text-xs text-muted-foreground">({h.hazardPointId})</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded px-2 py-0.5 text-xs font-medium', LEVEL_STYLES[h.level])}>
                      {h.levelDisplay || h.level}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{h.triggerType || '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatTime(h.createTime)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white">{durationText(h)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded px-2 py-0.5 text-xs font-medium',
                        STATUS_STYLES[h.status] || STATUS_STYLES.closed
                      )}
                    >
                      {h.statusDisplay || h.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => del.open(h)}
                      className="inline-flex items-center gap-1 text-xs text-red-300 hover:underline"
                      title="删除已闭环预警"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> 删除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDeleteDialog
        open={!!del.target}
        title="确认删除历史预警？"
        name={del.target?.hazardPointName}
        code={del.target?.id}
        hint="仅已闭环预警可删除，删除后不可恢复。"
        error={del.error}
        loading={del.loading}
        onCancel={del.close}
        onConfirm={confirmDelete}
      />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          共 {total} 条 · 第 {page}/{totalPages} 页
        </span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-border px-3 py-1 disabled:opacity-40"
          >
            上一页
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-border px-3 py-1 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
