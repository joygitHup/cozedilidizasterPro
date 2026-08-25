'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import {
  createMaterial,
  deleteMaterial,
  getMaterialStats,
  getMaterials,
  updateMaterial,
  type MaterialStock,
} from '@/lib/platform-api';
import { PageHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';

const INPUT =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500';

type Form = {
  code: string;
  name: string;
  spec: string;
  stock: string;
  unit: string;
  location: string;
  min_stock: string;
  remark: string;
};

const empty = (): Form => ({
  code: '',
  name: '',
  spec: '',
  stock: '0',
  unit: '件',
  location: '',
  min_stock: '0',
  remark: '',
});

export default function InventoryPage() {
  const [list, setList] = useState<MaterialStock[]>([]);
  const [stats, setStats] = useState<{ total: number; adequate: number; low: number; short: number } | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<MaterialStock | null>(null);
  const [form, setForm] = useState<Form>(empty());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, s] = await Promise.all([
        getMaterials({ search: search.trim() || undefined, pageSize: 100 }),
        getMaterialStats(),
      ]);
      setList(res.list);
      setStats(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(empty());
    setModal('create');
  };

  const openEdit = (m: MaterialStock) => {
    setEditing(m);
    setForm({
      code: m.code,
      name: m.name,
      spec: m.spec,
      stock: String(m.stock),
      unit: m.unit,
      location: m.location,
      min_stock: String(m.min_stock),
      remark: m.remark,
    });
    setModal('edit');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        spec: form.spec.trim(),
        stock: Number(form.stock) || 0,
        unit: form.unit.trim() || '件',
        location: form.location.trim(),
        min_stock: Number(form.min_stock) || 0,
        remark: form.remark.trim(),
      };
      if (!payload.name) throw new Error('名称不能为空');
      if (modal === 'create') await createMaterial(payload);
      else if (editing) await updateMaterial(editing.id, payload);
      setModal(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m: MaterialStock) => {
    if (!confirm(`删除材料 ${m.code}？`)) return;
    try {
      await deleteMaterial(m.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-cyan-600 px-3 text-sm text-white hover:bg-cyan-500"
          >
            <Plus className="h-4 w-4" /> 新增材料
          </button>
        }
      />

      {stats && (
        <div className="grid grid-cols-4 gap-3">
          {[
            ['合计', stats.total, 'text-white'],
            ['充足', stats.adequate, 'text-green-400'],
            ['偏低', stats.low, 'text-yellow-400'],
            ['不足', stats.short, 'text-red-400'],
          ].map(([label, val, color]) => (
            <div key={String(label)} className="rounded-lg border border-border bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className={cn('mt-1 text-xl font-semibold font-mono', color)}>{val}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className={cn(INPUT, 'pl-9')}
            placeholder="编号 / 名称 / 存放位置"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="h-9 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:text-white"
        >
          刷新
        </button>
      </div>

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
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">材料名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">规格</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">库存</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">存放位置</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  暂无数据
                </td>
              </tr>
            ) : (
              list.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs text-cyan-400">{m.code}</td>
                  <td className="px-4 py-3 text-white">{m.name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{m.spec || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-white">
                    {m.stock} {m.unit}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{m.location || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded px-2 py-0.5 text-xs font-medium',
                        m.status === 'adequate' && 'bg-green-500/20 text-green-400',
                        m.status === 'low' && 'bg-yellow-500/20 text-yellow-400',
                        m.status === 'short' && 'bg-red-500/20 text-red-400'
                      )}
                    >
                      {m.status_display}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => openEdit(m)} className="mr-2 text-muted-foreground hover:text-cyan-400">
                      <Pencil className="inline h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => void remove(m)} className="text-muted-foreground hover:text-red-400">
                      <Trash2 className="inline h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium text-white">{modal === 'create' ? '新增材料' : '编辑材料'}</h3>
              <button type="button" onClick={() => setModal(null)}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ['code', '编号'],
                  ['name', '名称'],
                  ['spec', '规格'],
                  ['unit', '单位'],
                  ['stock', '库存'],
                  ['min_stock', '最低库存'],
                  ['location', '存放位置'],
                  ['remark', '备注'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className={key === 'remark' || key === 'location' ? 'col-span-2' : ''}>
                  <label className="text-xs text-muted-foreground">{label}</label>
                  <input
                    className={cn(INPUT, 'mt-1')}
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setModal(null)} className="h-9 rounded-lg border border-border px-3 text-sm text-muted-foreground">
                取消
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="inline-flex h-9 items-center gap-1 rounded-lg bg-cyan-600 px-3 text-sm text-white disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} 保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
