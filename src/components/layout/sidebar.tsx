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
  ClipboardList,
  BarChart3,
  Settings,
  Mountain,
  ChevronDown,
  ChevronRight,
  Box,
  MonitorPlay,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { canViewPath, fetchMyPermissions } from '@/lib/permissions';

interface MenuItem {
  label: string;
  icon: React.ElementType;
  href?: string;
  children?: { label: string; href: string }[];
}

const menuItems: MenuItem[] = [
  { label: '驾驶舱总览', icon: LayoutDashboard, href: '/dashboard' },
  { label: '指挥大屏', icon: MonitorPlay, href: '/screen' },
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
      { label: '工程设计', href: '/ecology/engineering' },
      { label: '治理进度', href: '/ecology/progress' },
      { label: '效果评估', href: '/ecology/assessment' },
    ],
  },
  {
    label: '材料装备管理',
    icon: Package,
    children: [
      { label: '材料库存', href: '/equipment/inventory' },
      { label: '装备运维', href: '/equipment/maintenance' },
    ],
  },
  {
    label: '三维地质建模',
    icon: Box,
    children: [
      { label: '模型管理', href: '/geology/models' },
      { label: '三维场景', href: '/geology/viewer' },
      { label: '剖面分析', href: '/geology/cross-section' },
    ],
  },
  {
    label: '巡查巡检',
    icon: ClipboardList,
    children: [
      { label: '任务派发', href: '/inspection/dispatch' },
      { label: '巡查记录', href: '/inspection/records' },
    ],
  },
  {
    label: '统计分析',
    icon: BarChart3,
    children: [
      { label: '灾害统计', href: '/statistics/disaster' },
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
  const [permReady, setPermReady] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    menuItems.forEach((item) => {
      if (item.children?.some((c) => pathname.startsWith(c.href))) {
        initial.add(item.label);
      }
    });
    return initial;
  });

  useEffect(() => {
    void fetchMyPermissions()
      .catch(() => null)
      .finally(() => setPermReady(true));
  }, []);

  const visibleMenus = useMemo(() => {
    return menuItems
      .map((item) => {
        if (item.href) {
          return canViewPath(item.href) ? item : null;
        }
        const children = (item.children || []).filter((c) => canViewPath(c.href));
        if (!children.length) return null;
        return { ...item, children };
      })
      .filter(Boolean) as MenuItem[];
  }, [permReady, pathname]);

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
        {visibleMenus.map((item) => {
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

          const href = item.href!;
          if (href === '/screen') {
            return (
              <a
                key={item.label}
                href={href}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'text-cyan-400 bg-sidebar-accent'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-white'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </a>
            );
          }
          return (
            <Link
              key={item.label}
              href={href}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                isActive
                  ? 'text-cyan-400 bg-sidebar-accent'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
