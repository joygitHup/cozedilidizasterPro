'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Search, Trash2, Pencil, X } from 'lucide-react';
import type { EmergencySupply, EmergencySupplyCategory, EmergencySupplyPayload } from '@/types';
import {
  createEmergencySupply,
  deleteEmergencySupply,
  getEmergencySupplies,
  getEmergencySupplyNextCode,
  getEmergencySupplyStats,
  updateEmergencySupply,
} from '@/lib/services';
import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { cn } from '@/lib/utils';

const CATEGORY_OPTIONS: { value: EmergencySupplyCategory; label: string }[] = [
  { value: 'food', label: '食品' },
  { value: 'water', label: '饮用水' },
  { value: 'tent', label: '帐篷' },
  { value: 'medical', label: '医疗用品' },
  { value: 'tool', label: '工具设备' },
  { value: 'other', label: '其他' },
];

const INPUT =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500';

type FormState = {
  code: string;
  name: string;
  category: EmergencySupplyCategory;
  quantity: string;
  unit: string;
  storage_location: string;
  responsible_person: string;
  contact_phone: string;
};

const emptyForm = (): FormState => ({
  code: '',
  name: '',
  category: 'other',
  quantity: '0',
  unit: '件',
  storage_location: '',
  responsible_person: '',
  contact_phone: '',
});

export default function SuppliesPage() {
  const [list, setList] = useState<EmergencySupply[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<{ total: number; low_stock: number } | null>(null);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<EmergencySupply | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const del = useConfirmDelete<EmergencySupply>();
  const pageSize = 15;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, s] = await Promise.all([
        getEmergencySupplies({
          page,
          pageSize,
          search: search.trim() || undefined,
          category: category || undefined,
        }),
        getEmergencySupplyStats(),
      ]);
      setList(res.list);
      setTotal(res.total);
      setStats({ total: s.total, low_stock: s.low_stock });
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, category]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = async () => {
    const f = emptyForm();
    try {
      f.code = await getEmergencySupplyNextCode();
    } catch {
      /* ignore */
    }
    setEditing(null);
    setForm(f);
    setFormError('');
    setModal('create');
  };

  const openEdit = (item: EmergencySupply) => {
    setEditing(item);
    setForm({
      code: item.code,
      name: item.name,
      category: item.category,
      quantity: String(item.quantity),
      unit: item.unit,
      storage_location: item.storageLocation,
      responsible_person: item.responsiblePerson,
      contact_phone: item.contactPhone,
    });
    setFormError('');
    setModal('edit');
  };

  const toPayload = (): EmergencySupplyPayload => ({
    code: form.code.trim() || undefined,
    name: form.name.trim(),
    category: form.category,
    quantity: Number(form.quantity || 0),
    unit: form.unit.trim() || '件',
    storage_location: form.storage_location.trim(),
    responsible_person: form.responsible_person.trim(),
    contact_phone: form.contact_phone.trim(),
  });

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError('请填写物资名称');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (modal === 'create') {
        await createEmergencySupply(toPayload());
      } else if (editing) {
        await updateEmergencySupply(editing.id, toPayload());
      }
      setModal(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () =>
    del.confirm(async (item) => {
      await deleteEmergencySupply(item.id);
      await load();
    });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <PageHeader>
        <button
          type="button"
          onClick={() => void openCreate()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm text-white hover:bg-cyan-500"
        >
          <Plus className="h-4 w-4" /> 新增物资
        </button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">物资种类</p>
          <p className="mt-1 font-mono text-xl text-white">{stats?.total ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">库存偏低</p>
          <p className="mt-1 font-mono text-xl text-amber-400">{stats?.low_stock ?? '—'}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setPage(1)}
            placeholder="编号 / 名称 / 存放位置"
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border border-border bg-card px-3 text-sm"
        >
          <option value="">全部类别</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setPage(1);
            void load();
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
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">物资名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">类别</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">库存</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">存放位置</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-cyan-400" />
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  暂无物资数据
                </td>
              </tr>
            ) : (
              list.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs text-cyan-400">{s.code}</td>
                  <td className="px-4 py-3 text-white">{s.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.categoryDisplay}</td>
                  <td className="px-4 py-3 text-right font-mono text-white">
                    {s.quantity} {s.unit}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.storageLocation || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded px-2 py-0.5 text-xs font-medium',
                        s.stockStatus === '充足'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      )}
                    >
                      {s.stockStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="text-muted-foreground hover:text-white"
                        title="编辑"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => del.open(s)}
                        className="text-muted-foreground hover:text-red-400"
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          共 {total} 条 第 {page}/{totalPages} 页
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-border px-2 py-1 disabled:opacity-40"
          >
            上一页
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded border border-border px-2 py-1 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={!!del.target}
        title="确认删除应急物资？"
        name={del.target?.name}
        code={del.target?.code}
        error={del.error}
        loading={del.loading}
        onCancel={del.close}
        onConfirm={confirmDelete}
      />

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-white">
                {modal === 'create' ? '新增物资' : '编辑物资'}
              </h3>
              <button type="button" onClick={() => !saving && setModal(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {formError && (
              <div className="mb-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs text-muted-foreground">
                编号
                <input
                  className={INPUT}
                  value={form.code}
                  disabled={modal === 'edit'}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                类别
                <select
                  className={INPUT}
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value as EmergencySupplyCategory })
                  }
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 space-y-1 text-xs text-muted-foreground">
                名称
                <input
                  className={INPUT}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                数量
                <input
                  type="number"
                  className={INPUT}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                单位
                <input
                  className={INPUT}
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </label>
              <label className="col-span-2 space-y-1 text-xs text-muted-foreground">
                存放位置
                <input
                  className={INPUT}
                  value={form.storage_location}
                  onChange={(e) => setForm({ ...form, storage_location: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                负责人
                <input
                  className={INPUT}
                  value={form.responsible_person}
                  onChange={(e) => setForm({ ...form, responsible_person: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                电话
                <input
                  className={INPUT}
                  value={form.contact_phone}
                  onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setModal(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm"
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm text-white"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
