export default function HazardTasksPage() {
  const tasks = [
    { id: 'PT001', name: '竹林坡日常巡查', assignee: '李四', date: '2026-07-30', status: '进行中', type: '日常巡查' },
    { id: 'PT002', name: '石桥镇专项排查', assignee: '赵六', date: '2026-07-31', status: '待开始', type: '专项排查' },
    { id: 'PT003', name: '李家坪雨后检查', assignee: '王五', date: '2026-07-29', status: '已完成', type: '应急排查' },
    { id: 'PT004', name: '全县月度巡检', assignee: '张三', date: '2026-08-01', status: '待开始', type: '定期巡检' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">排查任务管理</h1>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">任务编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">任务名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">类型</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">负责人</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">计划日期</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs text-cyan-400">{t.id}</td>
                <td className="px-4 py-3 text-white">{t.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{t.type}</td>
                <td className="px-4 py-3 text-white">{t.assignee}</td>
                <td className="px-4 py-3 text-muted-foreground">{t.date}</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${t.status === '已完成' ? 'bg-green-500/20 text-green-400' : t.status === '进行中' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    {t.status}
                  </span>
                </td>
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
