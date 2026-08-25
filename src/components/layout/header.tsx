'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CloudSun, LogOut, Search, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getStoredUser } from '@/lib/auth';
import { logout } from '@/lib/services';
import {
  getNotifications,
  getWeather,
  globalSearch,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type SearchHit,
  type WeatherInfo,
} from '@/lib/platform-api';
import { cn } from '@/lib/utils';

export function Header() {
  const router = useRouter();
  const user = getStoredUser();
  const displayName = user?.first_name || user?.username || '未登录';

  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const loadWeather = useCallback(async () => {
    try {
      setWeather(await getWeather());
    } catch {
      /* ignore */
    }
  }, []);

  const loadNotifs = useCallback(async () => {
    try {
      const res = await getNotifications();
      setNotifs(res.list);
      setUnread(res.list.filter((n) => !n.is_read).length);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadWeather();
    void loadNotifs();
    const t = setInterval(() => void loadNotifs(), 60_000);
    return () => clearInterval(t);
  }, [loadWeather, loadNotifs]);

  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        setHits(await globalSearch(q.trim()));
        setSearchOpen(true);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (searchBoxRef.current && !searchBoxRef.current.contains(t)) setSearchOpen(false);
      if (bellRef.current && !bellRef.current.contains(t)) setBellOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const goHit = (hit: SearchHit) => {
    setSearchOpen(false);
    setQ('');
    router.push(hit.href);
  };

  const openNotif = async (n: AppNotification) => {
    if (!n.is_read) {
      try {
        await markNotificationRead(n.id);
        await loadNotifs();
      } catch {
        /* ignore */
      }
    }
    setBellOpen(false);
    if (n.link) router.push(n.link);
  };

  const readAll = async () => {
    try {
      await markAllNotificationsRead();
      await loadNotifs();
    } catch {
      /* ignore */
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-6 backdrop-blur">
      <div className="flex items-center gap-4">
        <div className="relative" ref={searchBoxRef}>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => hits.length && setSearchOpen(true)}
            placeholder="搜索隐患点、设备、预警..."
            className="h-9 w-72 rounded-lg border border-border bg-card pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          {searchOpen && (q.trim() || searching) && (
            <div className="absolute left-0 top-10 z-50 w-96 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
              {searching && (
                <div className="px-3 py-2 text-xs text-muted-foreground">搜索中…</div>
              )}
              {!searching && hits.length === 0 && (
                <div className="px-3 py-3 text-xs text-muted-foreground">无匹配结果</div>
              )}
              {hits.map((h) => (
                <button
                  key={`${h.type}-${h.id}`}
                  type="button"
                  onClick={() => goHit(h)}
                  className="flex w-full flex-col gap-0.5 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-muted/40"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] text-cyan-400">
                      {h.type_label}
                    </span>
                    <span className="text-sm text-white">{h.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{h.subtitle}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CloudSun className="h-4 w-4 text-yellow-400" />
          <span>
            {weather ? `${weather.text} ${weather.temp_c}°C` : '—'}
          </span>
        </div>

        <div className="relative" ref={bellRef}>
          <button
            type="button"
            onClick={() => {
              setBellOpen((v) => !v);
              void loadNotifs();
            }}
            className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className="absolute right-0 top-10 z-50 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-medium text-white">通知</span>
                <button type="button" onClick={() => void readAll()} className="text-[11px] text-cyan-400 hover:underline">
                  全部已读
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifs.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">暂无通知</div>
                ) : (
                  notifs.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => void openNotif(n)}
                      className={cn(
                        'flex w-full flex-col gap-0.5 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-muted/40',
                        !n.is_read && 'bg-cyan-500/5'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-white">{n.title}</span>
                        {!n.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />}
                      </div>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-card px-3 py-1.5">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-foreground">{displayName}</span>
          {user?.role_display && (
            <span className="text-xs text-muted-foreground">{user.role_display}</span>
          )}
        </div>

        <button
          onClick={handleLogout}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          title="退出登录"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
