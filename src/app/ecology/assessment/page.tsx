import { TreePine } from 'lucide-react';

export default function AssessmentPage() {
  const assessments = [
    { id: 'EA001', project: '石桥崖排水系统改造', factor: '排水效率', before: '35%', after: '92%', effect: '显著提升', date: '2026-07-15' },
    { id: 'EA002', project: '石桥崖排水系统改造', factor: '边坡稳定性', before: '0.95', after: '1.25', effect: '达标', date: '2026-07-15' },
    { id: 'EA003', project: '竹林坡锚索加固', factor: '锚索预应力', before: '-', after: '850kN', effect: '监测中', date: '2026-07-20' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">效果评估</h1>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">工程名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">评估因子</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">治理前</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">治理后</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">效果</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">评估日期</th>
            </tr>
          </thead>
          <tbody>
            {assessments.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs text-cyan-400">{a.id}</td>
                <td className="px-4 py-3 text-white">{a.project}</td>
                <td className="px-4 py-3 text-muted-foreground">{a.factor}</td>
                <td className="px-4 py-3 text-right text-red-400 font-mono text-xs">{a.before}</td>
                <td className="px-4 py-3 text-right text-green-400 font-mono text-xs">{a.after}</td>
                <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${a.effect === '显著提升' ? 'bg-green-500/20 text-green-400' : a.effect === '达标' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{a.effect}</span></td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{a.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
