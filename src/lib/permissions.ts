import { getStoredUser, type AuthUser } from '@/lib/auth';
import { apiFetch } from '@/lib/api-client';

export type ModulePerm = { view: boolean; write: boolean };
export type PermissionsPayload = {
  role: string;
  modules: Record<string, ModulePerm>;
};

const CACHE_KEY = 'geohazard_permissions';

/** 路径前缀 → 权限模块 */
const PATH_MODULE: { prefix: string; module: string }[] = [
  { prefix: '/system/users', module: 'users' },
  { prefix: '/system/config', module: 'system' },
  { prefix: '/hazard', module: 'hazard' },
  { prefix: '/monitoring', module: 'monitoring' },
  { prefix: '/warning', module: 'warning' },
  { prefix: '/emergency', module: 'emergency' },
  { prefix: '/ecology', module: 'ecology' },
  { prefix: '/equipment', module: 'equipment' },
  { prefix: '/geology', module: 'geology' },
  { prefix: '/inspection', module: 'inspection' },
  { prefix: '/statistics', module: 'statistics' },
  { prefix: '/dashboard', module: 'dashboard' },
  { prefix: '/screen', module: 'dashboard' },
];

export function moduleForPath(path: string): string | null {
  for (const row of PATH_MODULE) {
    if (path === row.prefix || path.startsWith(row.prefix + '/')) return row.module;
  }
  return null;
}

export async function fetchMyPermissions(): Promise<PermissionsPayload> {
  const data = await apiFetch<PermissionsPayload>('/api/users/permissions/');
  if (typeof window !== 'undefined') {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  }
  return data;
}

export function getCachedPermissions(): PermissionsPayload | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PermissionsPayload;
  } catch {
    return null;
  }
}

export function canViewModule(module: string, perms?: PermissionsPayload | null, user?: AuthUser | null): boolean {
  const u = user ?? getStoredUser();
  if (u?.role === 'admin') return true;
  const p = perms ?? getCachedPermissions();
  if (p?.modules?.[module]) return Boolean(p.modules[module].view);
  // 无缓存时按角色保守放行只读业务页
  if (module === 'users') return u?.role === 'admin';
  if (module === 'system') return u?.role === 'admin' || u?.role === 'leader';
  return true;
}

export function canWriteModule(module: string, perms?: PermissionsPayload | null, user?: AuthUser | null): boolean {
  const u = user ?? getStoredUser();
  if (u?.role === 'admin') return true;
  const p = perms ?? getCachedPermissions();
  if (p?.modules?.[module]) return Boolean(p.modules[module].write);
  if (u?.role === 'viewer') return false;
  if (u?.role === 'grid_worker') return module === 'inspection' || module === 'hazard';
  return u?.role === 'leader' || u?.role === 'operator';
}

export function canViewPath(path: string): boolean {
  const mod = moduleForPath(path);
  if (!mod) return true;
  return canViewModule(mod);
}
