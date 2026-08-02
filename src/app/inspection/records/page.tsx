import { ClipboardCheck } from 'lucide-react';

export default function InspectionRecordsPage() {
  const records = [
    { id: 'R001', task: '竹林坡日常巡查', inspector: '李四', date: '2026-07-30', points: '5/5', duration: '2h15m', issues: 1, status: '已提交' },
    { id: 'R002', task: '李家坪雨后排查', inspector: '李四', date: '2026-07-29', points: '3/3', duration: '1h30m', issues: 0, status: '已提交' },
    { id: 'R003', task: '王家坎裂缝观测', inspector: '赵六', date: '2026-07-29', points: '2/2', duration: '45m', issues: 2, status: '已提交' },
    { id: 'R004', task: '石桥镇专项排查', inspector: '王五', date: '2026-07-28', points: '12/12', duration: '4h', issues: 3, status: '已提交' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">巡查记录</h1>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">任务名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">巡查人</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">日期</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">检查点</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">时长</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">发现问题</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs text-cyan-400">{r.id}</td>
                <td className="px-4 py-3 text-white">{r.task}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.inspector}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{r.date}</td>
                <td className="px-4 py-3 text-right font-mono text-white">{r.points}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{r.duration}</td>
                <td className="px-4 py-3 text-right"><span className={`font-mono text-xs ${r.issues > 0 ? 'text-yellow-400' : 'text-green-400'}`}>{r.issues}</span></td>
                <td className="px-4 py-3"><span className="rounded bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
