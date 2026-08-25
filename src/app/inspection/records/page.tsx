'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { InspectionTask } from '@/types';
import { getInspectionTasks } from '@/lib/services';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';

function formatDuration(mins: number) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h${m}m` : `${m}m`;
}

export default function InspectionRecordsPage() {
  const [records, setRecords] = useState<InspectionTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<InspectionTask | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getInspectionTasks({ page: 1, pageSize: 50, records: true });
      setRecords(res.list);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader />
      <p className="text-sm text-muted-foreground">
        仅展示已完成的排查任务，作为巡查归档记录；数据来自排查任务完成闭环。
      </p>

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">任务名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">巡查人</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">日期</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">检查点</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">时长</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">发现问题</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  暂无巡查记录，请先在排查任务中完成任务
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs text-cyan-400">{r.code}</td>
                  <td className="px-4 py-3 text-white">{r.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.assignedTo || '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {(r.completedAt || r.plannedDate || '').slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white">
                    {r.checkpointCount}/{r.checkpointCount}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDuration(r.durationMinutes)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={cn(
                        'font-mono text-xs',
                        r.issueCount > 0 ? 'text-yellow-400' : 'text-green-400'
                      )}
                    >
                      {r.issueCount}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
                      已提交
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setSelected(r)}
                      className="text-xs text-cyan-400 hover:underline"
                    >
                      详情
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} />
          <div className="relative w-[480px] rounded-lg border border-border bg-card p-6">
            <h3 className="mb-3 text-lg font-bold text-white">{selected.title}</h3>
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                编号 <span className="font-mono text-cyan-400">{selected.code}</span>
              </p>
              <p className="text-muted-foreground">
                巡查人 <span className="text-white">{selected.assignedTo}</span>
              </p>
              <p className="text-muted-foreground">
                隐患点{' '}
                <span className="text-white">
                  {selected.hazardPointCode
                    ? `${selected.hazardPointName} (${selected.hazardPointCode})`
                    : '—'}
                </span>
              </p>
              <div className="rounded border border-border p-3">
                <p className="text-xs text-muted-foreground">排查结果</p>
                <p className="mt-1 whitespace-pre-wrap text-white">{selected.result || '—'}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                问题数 {selected.issueCount} · 耗时 {formatDuration(selected.durationMinutes)}
              </p>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
