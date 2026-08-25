const TOKEN_KEY = 'geohazard_access';
const REFRESH_KEY = 'geohazard_refresh';
const USER_KEY = 'geohazard_user';

export type AuthUser = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  role: string;
  role_display?: string;
  department: string;
  phone: string;
  village: string;
  avatar: string;
};

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setAuth(access: string, refresh: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('geohazard_permissions');
}

export function isLoggedIn(): boolean {
  return Boolean(getAccessToken());
}
