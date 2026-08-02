import { Bell } from 'lucide-react';

export default function WarningHistoryPage() {
  const history = [
    { id: 'W202607301023', point: '竹林坡', level: '红色', trigger: '牛顿力突降+降雨', time: '2026-07-30 10:23', status: '已闭环', duration: '2h30m' },
    { id: 'W202607300945', point: '石桥镇', level: '橙色', trigger: '位移超阈值', time: '2026-07-30 09:45', status: '处置中', duration: '-' },
    { id: 'W202607300812', point: '李家坪', level: '黄色', trigger: '降雨量预警', time: '2026-07-30 08:12', status: '已闭环', duration: '3h' },
    { id: 'W202607291530', point: '王家坎', level: '黄色', trigger: '含水量升高', time: '2026-07-29 15:30', status: '已闭环', duration: '5h' },
    { id: 'W202607290900', point: '赵家崖', level: '蓝色', trigger: '常规监测', time: '2026-07-29 09:00', status: '已闭环', duration: '1h' },
    { id: 'W202607281400', point: '竹林坡', level: '橙色', trigger: '牛顿力异常', time: '2026-07-28 14:00', status: '已闭环', duration: '4h' },
  ];

  const levelColors: Record<string, string> = { '红色': 'bg-red-500/20 text-red-400', '橙色': 'bg-orange-500/20 text-orange-400', '黄色': 'bg-yellow-500/20 text-yellow-400', '蓝色': 'bg-blue-500/20 text-blue-400' };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">历史预警</h1>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">预警编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">隐患点</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">等级</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">触发条件</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">触发时间</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">处置时长</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs text-cyan-400">{h.id}</td>
                <td className="px-4 py-3 text-white">{h.point}</td>
                <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${levelColors[h.level]}`}>{h.level}</span></td>
                <td className="px-4 py-3 text-muted-foreground">{h.trigger}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{h.time}</td>
                <td className="px-4 py-3 text-white font-mono text-xs">{h.duration}</td>
                <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${h.status === '已闭环' ? 'bg-green-500/20 text-green-400' : 'bg-cyan-500/20 text-cyan-400'}`}>{h.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
