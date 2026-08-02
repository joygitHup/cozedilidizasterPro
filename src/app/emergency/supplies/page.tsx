import { Siren } from 'lucide-react';

export default function SuppliesPage() {
  const supplies = [
    { id: 'S001', name: '应急帐篷', category: '安置物资', stock: 50, unit: '顶', location: '县应急仓库', status: '充足' },
    { id: 'S002', name: '救生衣', category: '救援装备', stock: 200, unit: '件', location: '县应急仓库', status: '充足' },
    { id: 'S003', name: '手电筒', category: '照明设备', stock: 150, unit: '支', location: 'A镇分站', status: '充足' },
    { id: 'S004', name: '急救包', category: '医疗物资', stock: 30, unit: '个', location: '县应急仓库', status: '偏低' },
    { id: 'S005', name: '对讲机', category: '通信设备', stock: 45, unit: '台', location: '县应急仓库', status: '充足' },
    { id: 'S006', name: '饮用水', category: '生活物资', stock: 500, unit: '箱', location: '县应急仓库', status: '充足' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">应急物资</h1>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">物资名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">类别</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">库存</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">存放位置</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
            </tr>
          </thead>
          <tbody>
            {supplies.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs text-cyan-400">{s.id}</td>
                <td className="px-4 py-3 text-white">{s.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{s.category}</td>
                <td className="px-4 py-3 text-right font-mono text-white">{s.stock} {s.unit}</td>
                <td className="px-4 py-3 text-muted-foreground">{s.location}</td>
                <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${s.status === '充足' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{s.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
