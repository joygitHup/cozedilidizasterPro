import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/layout/app-shell';

export const metadata: Metadata = {
  title: '边坡地质灾害智能预防管控平台',
  description: '边坡地质灾害智能预防管控平台 - 实时监控、智能预警、应急响应',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="min-h-screen bg-background antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
