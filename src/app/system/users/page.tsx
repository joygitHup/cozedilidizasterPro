'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Search, Trash2, Pencil, X } from 'lucide-react';
import type { SystemUser, SystemUserPayload, SystemUserRole } from '@/types';
import {
  createSystemUser,
  deleteSystemUser,
  getSystemUsers,
  updateSystemUser,
} from '@/lib/services';
import { getStoredUser } from '@/lib/auth';
import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { cn } from '@/lib/utils';

const ROLE_OPTIONS: { value: SystemUserRole; label: string }[] = [
  { value: 'admin', label: '系统管理员' },
  { value: 'leader', label: '值班领导' },
  { value: 'operator', label: '值班员' },
  { value: 'grid_worker', label: '网格员' },
  { value: 'viewer', label: '查看者' },
];

const INPUT =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500';

type FormState = {
  username: string;
  password: string;
  first_name: string;
  phone: string;
  role: SystemUserRole;
  department: string;
  village: string;
  is_active: boolean;
};

const emptyForm = (): FormState => ({
  username: '',
  password: '',
  first_name: '',
  phone: '',
  role: 'viewer',
  department: '',
  village: '',
  is_active: true,
});

export default function UsersPage() {
  const [list, setList] = useState<SystemUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<SystemUser | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const del = useConfirmDelete<SystemUser>();
  const me = getStoredUser();
  const pageSize = 15;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getSystemUsers({
        page,
        pageSize,
        search: search.trim() || undefined,
        role: role || undefined,
      });
      setList(res.list);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, role]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError('');
    setModal('create');
  };

  const openEdit = (u: SystemUser) => {
    setEditing(u);
    setForm({
      username: u.username,
      password: '',
      first_name: u.firstName || u.displayName,
      phone: u.phone,
      role: (u.role as SystemUserRole) || 'viewer',
      department: u.department,
      village: u.village,
      is_active: u.isActive,
    });
    setFormError('');
    setModal('edit');
  };

  const toPayload = (): SystemUserPayload => {
    const payload: SystemUserPayload = {
      username: form.username.trim(),
      first_name: form.first_name.trim(),
      phone: form.phone.trim(),
      role: form.role,
      department: form.department.trim(),
      village: form.village.trim(),
      is_active: form.is_active,
    };
    if (form.password.trim()) payload.password = form.password.trim();
    return payload;
  };

  const handleSave = async () => {
    if (!form.username.trim()) {
      setFormError('请填写用户名');
      return;
    }
    if (modal === 'create' && !form.password.trim()) {
      setFormError('请设置初始密码');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (modal === 'create') {
        await createSystemUser(toPayload());
      } else if (editing) {
        const payload = toPayload();
        delete (payload as { username?: string }).username;
        await updateSystemUser(editing.id, payload);
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
    del.confirm(async (u) => {
      await deleteSystemUser(u.id);
      await load();
    });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <PageHeader>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm text-white hover:bg-cyan-500"
        >
          <span className="inline-flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> 新增用户
          </span>
        </button>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setPage(1)}
            placeholder="用户名 / 姓名 / 电话 / 部门"
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border border-border bg-card px-3 text-sm"
        >
          <option value="">全部角色</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
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
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">用户名</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">姓名</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">角色</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">部门</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">联系方式</th>
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
                  暂无用户
                </td>
              </tr>
            ) : (
              list.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs text-cyan-400">{u.username}</td>
                  <td className="px-4 py-3 text-white">{u.displayName}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-xs font-medium text-cyan-400">
                      {u.roleDisplay}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.department || '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{u.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded px-2 py-0.5 text-xs font-medium',
                        u.isActive
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      )}
                    >
                      {u.isActive ? '启用' : '停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(u)}
                        className="text-xs text-cyan-400 hover:underline"
                      >
                        <Pencil className="inline h-3.5 w-3.5" /> 编辑
                      </button>
                      <button
                        type="button"
                        disabled={me?.id === u.id || u.username === 'admin'}
                        onClick={() => del.open(u)}
                        className="text-xs text-red-300 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="inline h-3.5 w-3.5" /> 删除
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
        title="确认删除用户？"
        name={del.target?.displayName}
        code={del.target?.username}
        hint="不能删除当前登录账号与内置 admin；至少保留一名管理员。"
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
                {modal === 'create' ? '新增用户' : '编辑用户'}
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
                用户名
                <input
                  className={INPUT}
                  value={form.username}
                  disabled={modal === 'edit'}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                {modal === 'create' ? '初始密码' : '重置密码（可选）'}
                <input
                  type="password"
                  className={INPUT}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={modal === 'edit' ? '留空则不修改' : ''}
                />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                姓名
                <input
                  className={INPUT}
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                角色
                <select
                  className={INPUT}
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as SystemUserRole })}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                电话
                <input
                  className={INPUT}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                状态
                <select
                  className={INPUT}
                  value={form.is_active ? '1' : '0'}
                  onChange={(e) => setForm({ ...form, is_active: e.target.value === '1' })}
                >
                  <option value="1">启用</option>
                  <option value="0">停用</option>
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                部门
                <input
                  className={INPUT}
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                负责村
                <input
                  className={INPUT}
                  value={form.village}
                  onChange={(e) => setForm({ ...form, village: e.target.value })}
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
