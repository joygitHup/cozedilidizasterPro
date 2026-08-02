import { MapPin, Route } from 'lucide-react';

export default function InspectionDispatchPage() {
  const tasks = [
    { id: 'T001', title: '竹林坡日常巡查', route: '竹林坡→石桥崖→李家坪', points: 5, assignee: '李四', date: '2026-07-30', status: '进行中' },
    { id: 'T002', title: '石桥镇专项排查', route: '石桥镇全域', points: 12, assignee: '王五', date: '2026-07-30', status: '待开始' },
    { id: 'T003', title: '李家坪雨后排查', route: '李家坪周边', points: 3, assignee: '李四', date: '2026-07-29', status: '已完成' },
    { id: 'T004', title: '王家坎裂缝观测', route: '王家坎', points: 2, assignee: '赵六', date: '2026-07-29', status: '已完成' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">任务派发</h1>
        <button className="rounded bg-cyan-600 px-4 py-2 text-sm text-white hover:bg-cyan-500">新建任务</button>
      </div>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">任务编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">任务名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">路线</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">检查点</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">执行人</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">日期</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs text-cyan-400">{t.id}</td>
                <td className="px-4 py-3 text-white">{t.title}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{t.route}</td>
                <td className="px-4 py-3 text-right font-mono text-white">{t.points}</td>
                <td className="px-4 py-3 text-muted-foreground">{t.assignee}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{t.date}</td>
                <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${t.status === '已完成' ? 'bg-green-500/20 text-green-400' : t.status === '进行中' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{t.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
