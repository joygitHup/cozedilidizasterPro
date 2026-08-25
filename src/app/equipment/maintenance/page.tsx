'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Search, Trash2, Wrench, X } from 'lucide-react';
import {
  createEquipmentAsset,
  deleteEquipmentAsset,
  getEquipmentAssets,
  getEquipmentStats,
  markEquipmentMaintained,
  updateEquipmentAsset,
  type EquipmentAsset,
} from '@/lib/platform-api';
import { PageHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';

const INPUT =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500';

type Form = {
  code: string;
  name: string;
  model: string;
  location: string;
  last_maint: string;
  next_maint: string;
  status: EquipmentAsset['status'];
  keeper: string;
  remark: string;
};

const empty = (): Form => ({
  code: '',
  name: '',
  model: '',
  location: '',
  last_maint: '',
  next_maint: '',
  status: 'normal',
  keeper: '',
  remark: '',
});

export default function MaintenancePage() {
  const [list, setList] = useState<EquipmentAsset[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    normal: number;
    maintain: number;
    fault: number;
    overdue: number;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<EquipmentAsset | null>(null);
  const [form, setForm] = useState<Form>(empty());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, s] = await Promise.all([
        getEquipmentAssets({ search: search.trim() || undefined, pageSize: 100 }),
        getEquipmentStats(),
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

  const openEdit = (m: EquipmentAsset) => {
    setEditing(m);
    setForm({
      code: m.code,
      name: m.name,
      model: m.model,
      location: m.location,
      last_maint: m.last_maint || '',
      next_maint: m.next_maint || '',
      status: m.status,
      keeper: m.keeper,
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
        model: form.model.trim(),
        location: form.location.trim(),
        last_maint: form.last_maint || null,
        next_maint: form.next_maint || null,
        status: form.status,
        keeper: form.keeper.trim(),
        remark: form.remark.trim(),
      };
      if (!payload.name) throw new Error('名称不能为空');
      if (modal === 'create') await createEquipmentAsset(payload);
      else if (editing) await updateEquipmentAsset(editing.id, payload);
      setModal(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const doMaint = async (m: EquipmentAsset) => {
    try {
      await markEquipmentMaintained(m.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '登记失败');
    }
  };

  const remove = async (m: EquipmentAsset) => {
    if (!confirm(`删除装备 ${m.code}？`)) return;
    try {
      await deleteEquipmentAsset(m.id);
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
            <Plus className="h-4 w-4" /> 新增装备
          </button>
        }
      />

      {stats && (
        <div className="grid grid-cols-5 gap-3">
          {[
            ['合计', stats.total, 'text-white'],
            ['正常', stats.normal, 'text-green-400'],
            ['待保养', stats.maintain, 'text-yellow-400'],
            ['故障', stats.fault, 'text-red-400'],
            ['逾期', stats.overdue, 'text-orange-400'],
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
            placeholder="编号 / 名称 / 型号"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button type="button" onClick={() => void load()} className="h-9 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:text-white">
          刷新
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">装备名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">型号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">位置</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">上次保养</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">下次保养</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
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
                  暂无数据
                </td>
              </tr>
            ) : (
              list.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs text-cyan-400">{e.code}</td>
                  <td className="px-4 py-3 text-white">{e.name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{e.model || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.location || '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{e.last_maint || '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{e.next_maint || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded px-2 py-0.5 text-xs font-medium',
                        e.status === 'normal' && 'bg-green-500/20 text-green-400',
                        e.status === 'maintain' && 'bg-yellow-500/20 text-yellow-400',
                        e.status === 'fault' && 'bg-red-500/20 text-red-400',
                        e.status === 'retired' && 'bg-slate-500/20 text-slate-300'
                      )}
                    >
                      {e.status_display}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button type="button" title="登记保养" onClick={() => void doMaint(e)} className="text-muted-foreground hover:text-cyan-400">
                      <Wrench className="inline h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => openEdit(e)} className="text-muted-foreground hover:text-cyan-400">
                      <Pencil className="inline h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => void remove(e)} className="text-muted-foreground hover:text-red-400">
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
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium text-white">{modal === 'create' ? '新增装备' : '编辑装备'}</h3>
              <button type="button" onClick={() => setModal(null)}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">编号</label>
                <input className={cn(INPUT, 'mt-1')} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">名称</label>
                <input className={cn(INPUT, 'mt-1')} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">型号</label>
                <input className={cn(INPUT, 'mt-1')} value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">状态</label>
                <select className={cn(INPUT, 'mt-1')} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Form['status'] }))}>
                  <option value="normal">正常</option>
                  <option value="maintain">待保养</option>
                  <option value="fault">故障</option>
                  <option value="retired">报废</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">上次保养</label>
                <input type="date" className={cn(INPUT, 'mt-1')} value={form.last_maint} onChange={(e) => setForm((f) => ({ ...f, last_maint: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">下次保养</label>
                <input type="date" className={cn(INPUT, 'mt-1')} value={form.next_maint} onChange={(e) => setForm((f) => ({ ...f, next_maint: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">位置</label>
                <input className={cn(INPUT, 'mt-1')} value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">保管人</label>
                <input className={cn(INPUT, 'mt-1')} value={form.keeper} onChange={(e) => setForm((f) => ({ ...f, keeper: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">备注</label>
                <input className={cn(INPUT, 'mt-1')} value={form.remark} onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setModal(null)} className="h-9 rounded-lg border border-border px-3 text-sm text-muted-foreground">
                取消
              </button>
              <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex h-9 items-center gap-1 rounded-lg bg-cyan-600 px-3 text-sm text-white disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} 保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
