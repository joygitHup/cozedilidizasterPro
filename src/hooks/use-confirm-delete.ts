'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * State helper for ConfirmDeleteDialog flows.
 */
export function useConfirmDelete<T>() {
  const [target, setTarget] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const loadingRef = useRef(false);

  const open = useCallback((item: T) => {
    setError('');
    setTarget(item);
  }, []);

  const close = useCallback(() => {
    if (loadingRef.current) return;
    setTarget(null);
    setError('');
  }, []);

  const confirm = useCallback(
    async (action: (item: T) => Promise<void>) => {
      if (!target) return;
      loadingRef.current = true;
      setLoading(true);
      setError('');
      try {
        await action(target);
        setTarget(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : '删除失败');
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [target]
  );

  return { target, open, close, confirm, loading, error };
}
