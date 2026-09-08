'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield } from 'lucide-react';
import { login } from '@/lib/services';

const showDemoHint =
  process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === '1' ||
  process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === 'true';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#030712]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(6,182,212,0.15),_transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(6,182,212,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.08)_1px,transparent_1px)] [background-size:48px_48px]" />

      <form
        onSubmit={onSubmit}
        className="relative z-10 w-full max-w-md rounded-2xl border border-cyan-500/20 bg-card/80 p-8 shadow-[0_0_60px_rgba(6,182,212,0.12)] backdrop-blur"
      >
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-wide text-white">
            边坡地质灾害智能预防管控平台
          </h1>
          <p className="text-sm text-muted-foreground">请登录以进入指挥中心</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">用户名</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-cyan-500"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-cyan-500"
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="h-10 w-full rounded-lg bg-cyan-600 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:opacity-60"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </div>

        {showDemoHint && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            开发提示：admin / admin123（生产请关闭 NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS）
          </p>
        )}
      </form>
    </div>
  );
}
