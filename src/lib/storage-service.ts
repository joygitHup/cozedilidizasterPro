/** 附件微服务客户端（经 Next 反代 /storage-api） */

const BASE = '/storage-api';

export type StorageObject = {
  key: string;
  size?: number;
  last_modified?: string | null;
  url: string;
  filename?: string;
  content_type?: string;
};

export type GeologyModel = {
  id: string;
  name: string;
  key?: string;
  url?: string;
  viewer?: string;
  source?: string;
  longitude?: number;
  latitude?: number;
  height?: number;
  description?: string;
  size?: number;
};

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function storageHealth(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE}/health`, { cache: 'no-store' });
    return parseJson(res);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function uploadAttachment(
  file: File,
  opts?: { folder?: string; bizType?: string; bizId?: string }
): Promise<StorageObject & { ok: boolean }> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('folder', opts?.folder || 'attachments');
  if (opts?.bizType) fd.append('biz_type', opts.bizType);
  if (opts?.bizId) fd.append('biz_id', opts.bizId);
  const res = await fetch(`${BASE}/api/storage/upload`, { method: 'POST', body: fd });
  return parseJson(res);
}

export async function listAttachments(prefix = 'attachments/', limit = 100) {
  const q = new URLSearchParams({ prefix, limit: String(limit) });
  const res = await fetch(`${BASE}/api/storage/list?${q}`, { cache: 'no-store' });
  return parseJson<{ count: number; results: StorageObject[] }>(res);
}

export async function listGeologyModels() {
  const res = await fetch(`${BASE}/api/storage/models`, { cache: 'no-store' });
  return parseJson<{ count: number; results: GeologyModel[] }>(res);
}
