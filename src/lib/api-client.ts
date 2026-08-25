import {
  clearAuth,
  getAccessToken,
  getRefreshToken,
  setAuth,
  type AuthUser,
} from '@/lib/auth';

type RequestOptions = RequestInit & {
  auth?: boolean;
  skipRefresh?: boolean;
};

async function refreshAccessToken(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  const res = await fetch('/api/users/token/refresh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) {
    clearAuth();
    return null;
  }
  const data = await res.json();
  const userRaw = localStorage.getItem('geohazard_user');
  const user = userRaw ? (JSON.parse(userRaw) as AuthUser) : ({} as AuthUser);
  setAuth(data.access, data.refresh || refresh, user);
  return data.access as string;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { auth = true, skipRefresh = false, headers, ...rest } = options;
  const finalHeaders = new Headers(headers || {});
  if (!finalHeaders.has('Content-Type') && rest.body) {
    finalHeaders.set('Content-Type', 'application/json');
  }
  if (auth) {
    const token = getAccessToken();
    if (token) finalHeaders.set('Authorization', `Bearer ${token}`);
  }

  let res = await fetch(path, { ...rest, headers: finalHeaders });

  if (res.status === 401 && auth && !skipRefresh) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      finalHeaders.set('Authorization', `Bearer ${newToken}`);
      res = await fetch(path, { ...rest, headers: finalHeaders });
    } else if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
      throw new Error('未登录');
    }
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = await res.json();
      detail = err.detail || err.message || JSON.stringify(err);
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === 'string' ? detail : '请求失败');
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};
