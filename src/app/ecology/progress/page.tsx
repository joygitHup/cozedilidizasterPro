import { TreePine } from 'lucide-react';

export default function ProgressPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">治理进度</h1>
      <div className="grid grid-cols-2 gap-4">
        {[
          { name: '竹林坡锚索加固', progress: 85, total: 120, done: 102, milestone: '锚索张拉完成，进入防护网安装' },
          { name: '石桥崖排水改造', progress: 100, total: 90, done: 90, milestone: '已完工验收' },
          { name: '李家坪植被恢复', progress: 45, total: 60, done: 27, milestone: '客土喷播完成，进入养护期' },
          { name: '王家坎挡土墙', progress: 0, total: 80, done: 0, milestone: '设计方案评审中' },
        ].map((p) => (
          <div key={p.name} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-white">{p.name}</h3>
              <span className={`text-lg font-bold font-mono ${p.progress === 100 ? 'text-green-400' : 'text-cyan-400'}`}>{p.progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden mb-3">
              <div className={`h-full rounded-full ${p.progress === 100 ? 'bg-green-500' : 'bg-cyan-500'}`} style={{ width: `${p.progress}%` }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>完成: {p.done}天</span><span>总工期: {p.total}天</span>
            </div>
            <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">{p.milestone}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
