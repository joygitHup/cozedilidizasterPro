'use client';

import { AlertTriangle, Loader2, X } from 'lucide-react';

export type ConfirmDeleteDialogProps = {
  open: boolean;
  title?: string;
  /** Primary subject name shown in the message */
  name?: string;
  /** Optional secondary code / id */
  code?: string;
  description?: string;
  hint?: string;
  error?: string;
  loading?: boolean;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

/**
 * Shared secondary-confirm dialog for destructive delete actions.
 */
export function ConfirmDeleteDialog({
  open,
  title = '确认删除？',
  name,
  code,
  description,
  hint,
  error,
  loading = false,
  confirmLabel = '确认删除',
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  if (!open) return null;

  const subject =
    name || code ? (
      <>
        即将删除
        {name ? (
          <>
            「<span className="font-medium text-white">{name}</span>」
          </>
        ) : null}
        {code ? (
          <>
            （<span className="font-mono text-cyan-400">{code}</span>）
          </>
        ) : null}
        。此操作不可恢复。
      </>
    ) : (
      '此操作不可恢复，请确认后继续。'
    );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={() => !loading && onCancel()} />
      <div className="relative w-[420px] max-w-[calc(100%-2rem)] rounded-lg border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-red-500/15 p-2">
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{description ?? subject}</p>
            {hint ? <p className="mt-2 text-xs text-amber-400/90">{hint}</p> : null}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded p-1 hover:bg-accent disabled:opacity-50"
            aria-label="关闭"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {error ? (
          <div className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? '删除中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
