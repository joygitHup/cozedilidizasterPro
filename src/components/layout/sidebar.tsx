'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  AlertTriangle,
  Radio,
  Bell,
  Siren,
  TreePine,
  Package,
  Box,
  ClipboardList,
  BarChart3,
  Settings,
  Mountain,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface MenuItem {
  label: string;
  icon: React.ElementType;
  href?: string;
  children?: { label: string; href: string }[];
}

const menuItems: MenuItem[] = [
  { label: '驾驶舱总览', icon: LayoutDashboard, href: '/dashboard' },
  {
    label: '隐患台账管理',
    icon: AlertTriangle,
    children: [
      { label: '隐患点管理', href: '/hazard/points' },
      { label: '风险斜坡管理', href: '/hazard/slopes' },
      { label: '排查任务管理', href: '/hazard/tasks' },
    ],
  },
  {
    label: '监测感知网络',
    icon: Radio,
    children: [
      { label: '设备管理', href: '/monitoring/devices' },
      { label: '实时监测数据', href: '/monitoring/realtime' },
      { label: '视频监控', href: '/monitoring/video' },
    ],
  },
  {
    label: '智能预警中心',
    icon: Bell,
    children: [
      { label: '实时预警', href: '/warning/current' },
      { label: '预警模型配置', href: '/warning/models' },
      { label: '历史预警', href: '/warning/history' },
    ],
  },
  {
    label: '应急响应处置',
    icon: Siren,
    children: [
      { label: '预案管理', href: '/emergency/plans' },
      { label: '避险转移', href: '/emergency/evacuation' },
      { label: '应急物资', href: '/emergency/supplies' },
    ],
  },
  {
    label: '生态治理工程',
    icon: TreePine,
    children: [
      { label: '工程设计', href: '/ecology/design' },
      { label: '治理进度', href: '/ecology/progress' },
      { label: '效果评估', href: '/ecology/evaluation' },
    ],
  },
  {
    label: '材料装备管理',
    icon: Package,
    children: [
      { label: '材料库存', href: '/materials/inventory' },
      { label: '装备运维', href: '/materials/maintenance' },
    ],
  },
  {
    label: '三维地质建模',
    icon: Box,
    children: [
      { label: '模型管理', href: '/geology/models' },
      { label: '剖面分析', href: '/geology/sections' },
    ],
  },
  {
    label: '巡查巡检',
    icon: ClipboardList,
    children: [
      { label: '任务派发', href: '/patrol/tasks' },
      { label: '巡查记录', href: '/patrol/records' },
    ],
  },
  {
    label: '统计分析',
    icon: BarChart3,
    children: [
      { label: '灾害统计', href: '/statistics/disasters' },
      { label: '效能分析', href: '/statistics/performance' },
    ],
  },
  {
    label: '系统管理',
    icon: Settings,
    children: [
      { label: '用户权限', href: '/system/users' },
      { label: '系统配置', href: '/system/config' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    menuItems.forEach((item) => {
      if (item.children?.some((c) => pathname.startsWith(c.href))) {
        initial.add(item.label);
      }
    });
    return initial;
  });

  const toggleMenu = (label: string) => {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <Mountain className="h-7 w-7 text-cyan-400" />
        <div className="flex flex-col">
          <span className="text-sm font-bold text-white leading-tight">边坡灾害</span>
          <span className="text-[10px] text-slate-400 leading-tight">智能预防管控平台</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin py-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isExpanded = expandedMenus.has(item.label);
          const isActive = item.href
            ? pathname === item.href
            : item.children?.some((c) => pathname.startsWith(c.href));

          if (item.children) {
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleMenu(item.label)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                    isActive
                      ? 'text-cyan-400 bg-sidebar-accent'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-white'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
                {isExpanded && (
                  <div className="bg-sidebar-accent/50">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          'block py-2 pl-11 pr-4 text-sm transition-colors',
                          pathname === child.href
                            ? 'text-cyan-400 font-medium'
                            : 'text-slate-400 hover:text-white'
                        )}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href!}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                pathname === item.href
                  ? 'text-cyan-400 bg-sidebar-accent font-medium'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-2">
          <div className="h-7 w-7 rounded-full bg-cyan-500/20 flex items-center justify-center">
            <span className="text-xs font-bold text-cyan-400">管</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">管理员</p>
            <p className="text-[10px] text-slate-400">值班领导</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
