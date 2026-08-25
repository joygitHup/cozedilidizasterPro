'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { isLoggedIn } from '@/lib/auth';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const isLogin = pathname === '/login';
  // 独立大屏 / 三维全屏：无侧栏壳层
  const isFullscreen =
    pathname === '/screen' ||
    pathname.startsWith('/geology/viewer');

  useEffect(() => {
    if (isLogin) {
      if (isLoggedIn()) router.replace('/dashboard');
      setReady(true);
      return;
    }
    if (!isLoggedIn()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [isLogin, pathname, router]);

  if (isLogin || isFullscreen) {
    return <>{children}</>;
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        加载中...
      </div>
    );
  }

  return (
    <>
      <Sidebar />
      <div className="pl-60">
        <Header />
        <main className="p-6">{children}</main>
      </div>
    </>
  );
}
