'use client';

import { Bell, CloudSun, Search, User } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 backdrop-blur px-6">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索隐患点、设备、预警..."
            className="h-9 w-72 rounded-lg border border-border bg-card pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CloudSun className="h-4 w-4 text-yellow-400" />
          <span>晴 25°C</span>
        </div>

        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">预警状态：</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse-warning" />
            <span className="text-red-400 font-mono font-medium">1</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            <span className="text-orange-400 font-mono font-medium">3</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-yellow-500" />
            <span className="text-yellow-400 font-mono font-medium">12</span>
          </span>
        </div>

        <button className="relative rounded-lg p-2 text-muted-foreground hover:bg-card hover:text-foreground transition-colors">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
        </button>

        <div className="flex items-center gap-2 rounded-lg bg-card px-3 py-1.5">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-foreground">张值班</span>
        </div>
      </div>
    </header>
  );
}
