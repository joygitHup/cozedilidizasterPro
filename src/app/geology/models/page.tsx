import { Box } from 'lucide-react';

export default function Geology3DPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Box className="h-4 w-4" />
        <span>三维地质建模</span><span>/</span><span className="text-white">模型管理</span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          { id: '3D001', name: '竹林坡三维地质模型', layers: 4, points: '12,580', size: '256MB', update: '2026-07-25', status: '已发布' },
          { id: '3D002', name: '石桥崖地质结构模型', layers: 3, points: '8,320', size: '128MB', update: '2026-07-20', status: '已发布' },
          { id: '3D003', name: '李家坪地层模型', layers: 5, points: '15,200', size: '312MB', update: '2026-07-15', status: '生成中' },
        ].map((m) => (
          <div key={m.id} className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="aspect-video bg-gradient-to-br from-slate-800 via-cyan-900/20 to-slate-900 flex items-center justify-center">
              <Box className="h-12 w-12 text-cyan-500/30" />
            </div>
            <div className="p-4 space-y-2">
              <h3 className="text-sm font-medium text-white">{m.name}</h3>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><span className="text-muted-foreground">地层:</span> <span className="text-white">{m.layers}</span></div>
                <div><span className="text-muted-foreground">点数:</span> <span className="text-white">{m.points}</span></div>
                <div><span className="text-muted-foreground">大小:</span> <span className="text-white">{m.size}</span></div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">{m.update}</span>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${m.status === '已发布' ? 'bg-green-500/20 text-green-400' : 'bg-cyan-500/20 text-cyan-400'}`}>{m.status}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
