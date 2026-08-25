'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import {
  createGeologySite,
  deleteGeologySite,
  getGeologySiteStats,
  getGeologySites,
  updateGeologySite,
  type GeologySite,
} from '@/lib/platform-api';
import {
  listGeologyModels,
  storageHealth,
  uploadAttachment,
  type GeologyModel,
} from '@/lib/storage-service';
import { getHazardPoints } from '@/lib/services';
import { cn } from '@/lib/utils';
import { canWriteModule } from '@/lib/permissions';

const INPUT =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500';

type FormState = {
  code: string;
  name: string;
  hazard_point: string;
  longitude: string;
  latitude: string;
  height: string;
  tileset_url: string;
  ion_asset_id: string;
  glb_url: string;
  status: string;
  description: string;
};

const emptyForm = (): FormState => ({
  code: '',
  name: '',
  hazard_point: '',
  longitude: '',
  latitude: '',
  height: '2500',
  tileset_url: '',
  ion_asset_id: '',
  glb_url: '',
  status: 'published',
  description: '',
});

export default function GeologyModelsPage() {
  const [tab, setTab] = useState<'sites' | 'minio'>('sites');
  const [sites, setSites] = useState<GeologySite[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    published: number;
    with_tileset: number;
    with_ion: number;
  } | null>(null);
  const [models, setModels] = useState<GeologyModel[]>([]);
  const [health, setHealth] = useState<{ ok: boolean; error?: string } | null>(null);
  const [hazards, setHazards] = useState<Array<{ dbId: number; name: string; code: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<GeologySite | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const canWrite = canWriteModule('geology');

  const refreshSites = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, st] = await Promise.all([
        getGeologySites(),
        getGeologySiteStats(),
      ]);
      setSites(list.list);
      setStats(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshMinio = useCallback(async () => {
    try {
      const [h, list] = await Promise.all([storageHealth(), listGeologyModels()]);
      setHealth(h);
      setModels(list.results || []);
    } catch (e) {
      setHealth({ ok: false, error: e instanceof Error ? e.message : String(e) });
      setModels([]);
    }
  }, []);

  useEffect(() => {
    void refreshSites();
    void refreshMinio();
    void getHazardPoints({ pageSize: 100 })
      .then((res) =>
        setHazards(
          res.list.map((h) => ({
            dbId: Number(h.id),
            name: h.name,
            code: h.code || String(h.id),
          }))
        )
      )
      .catch(() => setHazards([]));
  }, [refreshSites, refreshMinio]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModal('create');
  };

  const openEdit = (s: GeologySite) => {
    setEditing(s);
    setForm({
      code: s.code,
      name: s.name,
      hazard_point: s.hazard_point != null ? String(s.hazard_point) : '',
      longitude: s.longitude != null ? String(s.longitude) : '',
      latitude: s.latitude != null ? String(s.latitude) : '',
      height: String(s.height || 2500),
      tileset_url: s.tileset_url,
      ion_asset_id: s.ion_asset_id,
      glb_url: s.glb_url,
      status: s.status || 'published',
      description: s.description,
    });
    setModal('edit');
  };

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const payload: Partial<GeologySite> = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        hazard_point: form.hazard_point ? Number(form.hazard_point) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        latitude: form.latitude ? Number(form.latitude) : null,
        height: Number(form.height) || 2500,
        tileset_url: form.tileset_url.trim(),
        ion_asset_id: form.ion_asset_id.trim(),
        glb_url: form.glb_url.trim(),
        status: form.status,
        description: form.description.trim(),
      };
      if (modal === 'edit' && editing) {
        await updateGeologySite(editing.id, payload);
        setMsg('站点已更新');
      } else {
        await createGeologySite(payload);
        setMsg('站点已创建');
      }
      setModal(null);
      await refreshSites();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (s: GeologySite) => {
    if (!window.confirm(`删除站点 ${s.code}？`)) return;
    try {
      await deleteGeologySite(s.id);
      await refreshSites();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    }
  };

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setMsg('');
    try {
      const up = await uploadAttachment(file, { folder: 'models', bizType: 'geology' });
      setMsg(`已上传 ${file.name}`);
      await refreshMinio();
      const url = (up as { url?: string }).url || '';
      if (url) {
        setForm((f) => ({
          ...f,
          glb_url: file.name.match(/\.glb|\.gltf/i) ? url : f.glb_url,
          tileset_url: file.name.match(/\.json|\.b3dm/i) ? url : f.tileset_url,
        }));
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void (tab === 'sites' ? refreshSites() : refreshMinio())}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              刷新
            </button>
            {canWrite && tab === 'sites' && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 rounded-md bg-cyan-600 px-3 py-1.5 text-xs text-white hover:bg-cyan-500"
              >
                <Plus className="h-3.5 w-3.5" />
                登记站点场景
              </button>
            )}
            {canWrite && (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                上传到 MinIO
                <input
                  type="file"
                  className="hidden"
                  accept=".glb,.gltf,.json,.b3dm,.zip"
                  disabled={uploading}
                  onChange={(e) => void onUpload(e.target.files?.[0] || null)}
                />
              </label>
            )}
            <Link
              href="/geology/viewer"
              className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/40 px-3 py-1.5 text-xs text-cyan-400 hover:bg-cyan-500/10"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              打开三维场景
            </Link>
          </div>
        }
      />

      <div className="flex gap-2">
        {(
          [
            ['sites', '站点三维库'],
            ['minio', 'MinIO 文件'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs',
              tab === k
                ? 'bg-cyan-600 text-white'
                : 'border border-border text-slate-400 hover:bg-slate-800'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {msg && (
        <div className="rounded border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-300">
          {msg}
        </div>
      )}
      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {tab === 'sites' && stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['站点总数', stats.total],
            ['已发布', stats.published],
            ['含 3D Tiles', stats.with_tileset],
            ['含 Ion', stats.with_ion],
          ].map(([label, v]) => (
            <div key={String(label)} className="rounded-lg border border-border bg-card px-3 py-2">
              <p className="text-[10px] text-muted-foreground">{label}</p>
              <p className="font-mono text-lg text-white">{v}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'sites' &&
        (loading ? (
          <div className="flex h-40 items-center justify-center text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            加载站点库…
          </div>
        ) : sites.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
            暂无站点场景。点击「登记站点场景」绑定隐患点与 3D Tiles / Ion / GLB。
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sites.map((s) => (
              <div key={s.id} className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-slate-800 via-cyan-900/20 to-slate-900">
                  <Box className="h-12 w-12 text-cyan-500/40" />
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-medium text-white">{s.name}</h3>
                      <p className="font-mono text-[10px] text-cyan-400">{s.code}</p>
                    </div>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                      {s.status_display || s.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2">
                    {s.hazard_point_name
                      ? `关联：${s.hazard_point_name}`
                      : s.description || '未关联隐患点'}
                  </p>
                  <p className="text-[10px] text-slate-600">
                    {[
                      s.tileset_url && 'Tiles',
                      s.ion_asset_id && `Ion ${s.ion_asset_id}`,
                      s.glb_url && 'GLB',
                    ]
                      .filter(Boolean)
                      .join(' · ') || '仅坐标场景'}
                  </p>
                  <div className="flex items-center justify-between border-t border-border pt-2">
                    <Link
                      href={s.viewer_path || `/geology/viewer?site=${s.id}`}
                      className="text-xs text-cyan-400 hover:underline"
                    >
                      进入场景
                    </Link>
                    {canWrite && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDelete(s)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

      {tab === 'minio' && (
        <>
          <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-slate-400">
            存储微服务：
            {health?.ok ? (
              <span className="ml-2 text-emerald-400">MinIO 已连接</span>
            ) : (
              <span className="ml-2 text-amber-400">
                未就绪 — scripts/start-storage.ps1
                {health?.error ? `（${health.error}）` : ''}
              </span>
            )}
            <span className="ml-2 text-slate-500">上传后可在登记站点时填入 GLB / Tiles URL</span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {models.map((m) => (
              <div key={m.id} className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-sm text-white">{m.name}</h3>
                <p className="mt-1 truncate text-xs text-slate-500">{m.url || m.key}</p>
                <Link
                  href={`/geology/viewer?lon=${m.longitude ?? 104.06}&lat=${m.latitude ?? 30.67}&h=${m.height ?? 2500}${m.url ? `&tileset=${encodeURIComponent(m.url)}` : ''}`}
                  className="mt-2 inline-block text-xs text-cyan-400 hover:underline"
                >
                  预览
                </Link>
              </div>
            ))}
          </div>
        </>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !saving && setModal(null)} />
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                {modal === 'create' ? '登记站点场景' : '编辑站点场景'}
              </h3>
              <button type="button" onClick={() => setModal(null)}>
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <label className="text-xs text-muted-foreground">编号</label>
                <input
                  className={INPUT}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">名称</label>
                <input
                  className={INPUT}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">关联隐患点</label>
                <select
                  className={INPUT}
                  value={form.hazard_point}
                  onChange={(e) => setForm({ ...form, hazard_point: e.target.value })}
                >
                  <option value="">无</option>
                  {hazards.map((h) => (
                    <option key={h.dbId} value={h.dbId}>
                      {h.code} · {h.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">经度</label>
                <input
                  className={INPUT}
                  value={form.longitude}
                  onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                  placeholder="可从隐患点同步"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">纬度</label>
                <input
                  className={INPUT}
                  value={form.latitude}
                  onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">相机高度(m)</label>
                <input
                  className={INPUT}
                  value={form.height}
                  onChange={(e) => setForm({ ...form, height: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">状态</label>
                <select
                  className={INPUT}
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="published">已发布</option>
                  <option value="draft">草稿</option>
                  <option value="archived">归档</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">3D Tiles URL</label>
                <input
                  className={INPUT}
                  value={form.tileset_url}
                  onChange={(e) => setForm({ ...form, tileset_url: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Cesium Ion Asset Id</label>
                <input
                  className={INPUT}
                  value={form.ion_asset_id}
                  onChange={(e) => setForm({ ...form, ion_asset_id: e.target.value })}
                  placeholder="需配置 NEXT_PUBLIC_CESIUM_ION_TOKEN"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">GLB/GLTF URL</label>
                <input
                  className={INPUT}
                  value={form.glb_url}
                  onChange={(e) => setForm({ ...form, glb_url: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">说明</label>
                <textarea
                  className={cn(INPUT, 'h-20 py-2')}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs"
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving || !form.code || !form.name}
                onClick={() => void save()}
                className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
