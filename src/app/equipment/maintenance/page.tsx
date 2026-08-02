import { Wrench } from 'lucide-react';

export default function MaintenancePage() {
  const equipment = [
    { id: 'EQ001', name: '全站仪', model: 'Leica TS16', location: 'A镇竹林村', lastMaint: '2026-07-15', nextMaint: '2026-10-15', status: '正常' },
    { id: 'EQ002', name: '无人机', model: 'DJI M300 RTK', location: '县应急中心', lastMaint: '2026-07-01', nextMaint: '2026-08-01', status: '待保养' },
    { id: 'EQ003', name: '地质雷达', model: 'GSSI SIR-4000', location: '县应急中心', lastMaint: '2026-06-20', nextMaint: '2026-09-20', status: '正常' },
    { id: 'EQ004', name: '裂缝计', model: 'SBB-50', location: 'A镇石桥镇', lastMaint: '2026-07-10', nextMaint: '2026-10-10', status: '正常' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">装备运维</h1>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">装备名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">型号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">存放位置</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">上次保养</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">下次保养</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
            </tr>
          </thead>
          <tbody>
            {equipment.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs text-cyan-400">{e.id}</td>
                <td className="px-4 py-3 text-white">{e.name}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{e.model}</td>
                <td className="px-4 py-3 text-muted-foreground">{e.location}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{e.lastMaint}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{e.nextMaint}</td>
                <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${e.status === '正常' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{e.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
