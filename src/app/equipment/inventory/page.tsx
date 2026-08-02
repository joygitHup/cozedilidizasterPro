import { Package } from 'lucide-react';

export default function InventoryPage() {
  const materials = [
    { id: 'M001', name: '锚索钢绞线', spec: 'φ15.2mm', stock: 2500, unit: '米', location: '县仓库', minStock: 1000, status: '充足' },
    { id: 'M002', name: '水泥 P.O42.5', spec: '50kg/袋', stock: 80, unit: '袋', location: 'A镇分站', minStock: 100, status: '偏低' },
    { id: 'M003', name: '钢筋 HRB400', spec: 'φ20mm', stock: 5000, unit: '千克', location: '县仓库', minStock: 2000, status: '充足' },
    { id: 'M004', name: '防护网', spec: '2m×5m', stock: 120, unit: '片', location: '县仓库', minStock: 50, status: '充足' },
    { id: 'M005', name: '排水管 PVC', spec: 'φ110mm', stock: 15, unit: '根', location: 'A镇分站', minStock: 30, status: '不足' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">材料库存</h1>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">材料名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">规格</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">库存</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">存放位置</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs text-cyan-400">{m.id}</td>
                <td className="px-4 py-3 text-white">{m.name}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{m.spec}</td>
                <td className="px-4 py-3 text-right font-mono text-white">{m.stock} {m.unit}</td>
                <td className="px-4 py-3 text-muted-foreground">{m.location}</td>
                <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${m.status === '充足' ? 'bg-green-500/20 text-green-400' : m.status === '偏低' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>{m.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
