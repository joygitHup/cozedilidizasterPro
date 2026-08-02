import { cn } from '@/lib/utils';

const LEVEL_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  red: { color: 'text-red-400', bg: 'bg-red-500/20', label: '红色' },
  orange: { color: 'text-orange-400', bg: 'bg-orange-500/20', label: '橙色' },
  yellow: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: '黄色' },
  blue: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: '蓝色' },
};

export default function HazardSlopesPage() {
  const slopes = [
    { id: 'RS001', name: 'A镇北坡', level: 'red', area: '2.5km²', risk: '高', monitor: '已覆盖' },
    { id: 'RS002', name: 'B镇东山', level: 'orange', area: '1.8km²', risk: '中高', monitor: '部分覆盖' },
    { id: 'RS003', name: 'C镇西沟', level: 'yellow', area: '3.2km²', risk: '中', monitor: '已覆盖' },
    { id: 'RS004', name: 'A镇南岭', level: 'blue', area: '1.2km²', risk: '低', monitor: '待部署' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">风险斜坡管理</h1>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">风险等级</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">面积</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">风险程度</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">监测覆盖</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {slopes.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs text-cyan-400">{s.id}</td>
                <td className="px-4 py-3 text-white">{s.name}</td>
                <td className="px-4 py-3">
                  <span className={cn('rounded px-2 py-0.5 text-xs font-medium', LEVEL_STYLES[s.level].bg, LEVEL_STYLES[s.level].color)}>
                    {LEVEL_STYLES[s.level].label}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{s.area}</td>
                <td className="px-4 py-3 text-white">{s.risk}</td>
                <td className="px-4 py-3 text-muted-foreground">{s.monitor}</td>
                <td className="px-4 py-3 text-center">
                  <button className="text-xs text-cyan-400 hover:underline">详情</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
