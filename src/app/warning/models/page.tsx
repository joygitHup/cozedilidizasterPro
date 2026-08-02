import { Bell } from 'lucide-react';

export default function WarningModelsPage() {
  const models = [
    { id: 'M001', name: '牛顿力突变模型', type: '力学模型', threshold: '85MPa', accuracy: '87.3%', status: '启用' },
    { id: 'M002', name: '降雨-位移耦合模型', type: '耦合模型', threshold: '位移>10mm', accuracy: '78.5%', status: '启用' },
    { id: 'M003', name: '含水量预警模型', type: '水文模型', threshold: '含水量>30%', accuracy: '65.2%', status: '启用' },
    { id: 'M004', name: 'AI综合判别模型', type: 'AI模型', threshold: '置信度>80%', accuracy: '91.2%', status: '调试中' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">预警模型配置</h1>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">模型名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">类型</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">触发阈值</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">准确率</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs text-cyan-400">{m.id}</td>
                <td className="px-4 py-3 text-white">{m.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{m.type}</td>
                <td className="px-4 py-3 text-white font-mono text-xs">{m.threshold}</td>
                <td className="px-4 py-3 text-cyan-400 font-mono">{m.accuracy}</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${m.status === '启用' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    {m.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center"><button className="text-xs text-cyan-400 hover:underline">配置</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
