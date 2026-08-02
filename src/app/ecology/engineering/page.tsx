import { TreePine } from 'lucide-react';

export default function EngineeringPage() {
  const projects = [
    { id: 'GE001', name: '竹林坡锚索加固工程', type: '锚索加固', location: 'A镇竹林村', progress: 85, budget: '¥280万', status: '施工中' },
    { id: 'GE002', name: '石桥崖排水系统改造', type: '排水工程', location: 'A镇石桥镇', progress: 100, budget: '¥120万', status: '已完工' },
    { id: 'GE003', name: '李家坪植被恢复工程', type: '生态恢复', location: 'A镇李家坪', progress: 45, budget: '¥85万', status: '施工中' },
    { id: 'GE004', name: '王家坎挡土墙建设', type: '挡土墙', location: 'B镇王家坎', progress: 0, budget: '¥150万', status: '设计中' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">工程设计</h1>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">工程名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">类型</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">位置</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">进度</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">预算</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs text-cyan-400">{p.id}</td>
                <td className="px-4 py-3 text-white">{p.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.type}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.location}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${p.progress}%` }} /></div>
                    <span className="text-xs text-white font-mono">{p.progress}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-white font-mono text-xs">{p.budget}</td>
                <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${p.status === '已完工' ? 'bg-green-500/20 text-green-400' : p.status === '施工中' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{p.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
