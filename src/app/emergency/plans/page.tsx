import { Siren } from 'lucide-react';

export default function PlansPage() {
  const plans = [
    { id: 'EP001', name: '红色预警应急预案', level: '红色', target: '全县范围', update: '2026-06-15', status: '有效' },
    { id: 'EP002', name: '滑坡灾害专项预案', level: '橙色', target: 'A镇竹林村', update: '2026-05-20', status: '有效' },
    { id: 'EP003', name: '泥石流应急方案', level: '黄色', target: 'A镇李家坪', update: '2026-04-10', status: '有效' },
    { id: 'EP004', name: '暴雨灾害综合预案', level: '橙色', target: 'B镇全域', update: '2026-03-01', status: '修订中' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">预案管理</h1>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">预案编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">预案名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">响应等级</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">适用对象</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">更新日期</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs text-cyan-400">{p.id}</td>
                <td className="px-4 py-3 text-white">{p.name}</td>
                <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${p.level === '红色' ? 'bg-red-500/20 text-red-400' : p.level === '橙色' ? 'bg-orange-500/20 text-orange-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{p.level}</span></td>
                <td className="px-4 py-3 text-muted-foreground">{p.target}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{p.update}</td>
                <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${p.status === '有效' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{p.status}</span></td>
                <td className="px-4 py-3 text-center"><button className="text-xs text-cyan-400 hover:underline">查看</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
