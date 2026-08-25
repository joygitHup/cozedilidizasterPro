'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/** 路径 → [一级模块, 子模块] */
const CRUMBS: Record<string, [string, string]> = {
  '/hazard/points': ['隐患台账管理', '隐患点管理'],
  '/hazard/slopes': ['隐患台账管理', '风险斜坡管理'],
  '/hazard/tasks': ['隐患台账管理', '排查任务管理'],
  '/monitoring/devices': ['监测感知网络', '设备管理'],
  '/monitoring/realtime': ['监测感知网络', '实时监测数据'],
  '/monitoring/video': ['监测感知网络', '视频监控'],
  '/warning/current': ['智能预警中心', '实时预警'],
  '/warning/models': ['智能预警中心', '预警模型配置'],
  '/warning/history': ['智能预警中心', '历史预警'],
  '/emergency/plans': ['应急响应处置', '预案管理'],
  '/emergency/evacuation': ['应急响应处置', '避险转移'],
  '/emergency/supplies': ['应急响应处置', '应急物资'],
  '/ecology/engineering': ['生态治理工程', '工程设计'],
  '/ecology/progress': ['生态治理工程', '治理进度'],
  '/ecology/assessment': ['生态治理工程', '效果评估'],
  '/equipment/inventory': ['材料装备管理', '材料库存'],
  '/equipment/maintenance': ['材料装备管理', '装备运维'],
  '/geology/models': ['三维地质建模', '模型管理'],
  '/geology/cross-section': ['三维地质建模', '剖面分析'],
  '/inspection/dispatch': ['巡查巡检', '任务派发'],
  '/inspection/records': ['巡查巡检', '巡查记录'],
  '/statistics/disaster': ['统计分析', '灾害统计'],
  '/statistics/performance': ['统计分析', '效能分析'],
  '/system/users': ['系统管理', '用户权限'],
  '/system/config': ['系统管理', '系统配置'],
};

type Props = {
  /** 右侧筛选 / 操作区，与面包屑同一行并排 */
  children?: React.ReactNode;
  className?: string;
  /** 覆盖自动面包屑（可选） */
  parent?: string;
  current?: string;
};

export function PageHeader({ children, className, parent, current }: Props) {
  const pathname = usePathname();
  const auto = CRUMBS[pathname];
  const p = parent ?? auto?.[0];
  const c = current ?? auto?.[1];

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {(p || c) && (
        <nav
          aria-label="面包屑"
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm"
        >
          {p && <span className="text-muted-foreground">{p}</span>}
          {p && c && <span className="text-muted-foreground/40">/</span>}
          {c && <span className="font-medium text-white">{c}</span>}
        </nav>
      )}
      {children != null && children !== false && (
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          {children}
        </div>
      )}
    </div>
  );
}
