import { Box } from 'lucide-react';

export default function CrossSectionPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Box className="h-4 w-4" />
        <span>三维地质建模</span><span>/</span><span className="text-white">剖面分析</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium text-white">剖面列表</h3>
          <div className="space-y-2">
            {[
              { id: 'CS-A', name: 'A-A\' 剖面', location: '竹林坡', direction: 'NE-SW', length: '320m' },
              { id: 'CS-B', name: 'B-B\' 剖面', location: '石桥崖', direction: 'NW-SE', length: '280m' },
              { id: 'CS-C', name: 'C-C\' 剖面', location: '李家坪', direction: 'E-W', length: '200m' },
            ].map((cs) => (
              <div key={cs.id} className="rounded border border-border bg-muted/30 p-3 hover:border-cyan-500/50 cursor-pointer">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white">{cs.name}</span>
                  <span className="text-xs text-cyan-400">{cs.length}</span>
                </div>
                <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                  <span>{cs.location}</span><span>{cs.direction}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium text-white">A-A&apos; 剖面图</h3>
          <div className="aspect-[4/3] rounded bg-slate-900 flex items-center justify-center border border-border">
            <div className="text-center">
              <Box className="mx-auto h-16 w-16 text-cyan-500/20" />
              <p className="mt-2 text-xs text-muted-foreground">剖面图渲染区域</p>
              <p className="text-xs text-muted-foreground">地层: 第四系覆盖层 → 强风化岩 → 中风化岩 → 基岩</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
            <div className="rounded bg-yellow-800/30 p-2 text-center"><span className="text-yellow-400">第四系</span></div>
            <div className="rounded bg-orange-800/30 p-2 text-center"><span className="text-orange-400">强风化</span></div>
            <div className="rounded bg-red-800/30 p-2 text-center"><span className="text-red-400">中风化</span></div>
            <div className="rounded bg-slate-700/50 p-2 text-center"><span className="text-slate-300">基岩</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
