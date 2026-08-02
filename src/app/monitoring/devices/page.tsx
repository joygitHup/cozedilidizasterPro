'use client';

import { useEffect, useState } from 'react';
import { Radio, Wifi, WifiOff, AlertCircle, Battery, Signal } from 'lucide-react';
import type { MonitoringDevice } from '@/types';
import { getMonitoringDevices } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  npr_anchor: 'NPR锚索', rainfall: '雨量计', fiber_optic: '光纤传感', camera: '摄像头', others: '其他',
};

export default function DevicesPage() {
  const [devices, setDevices] = useState<MonitoringDevice[]>([]);

  useEffect(() => { getMonitoringDevices().then(setDevices); }, []);

  const online = devices.filter((d) => d.status === 'online').length;
  const offline = devices.filter((d) => d.status === 'offline').length;
  const fault = devices.filter((d) => d.status === 'fault').length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">设备管理</h1>
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
          <div className="rounded-lg bg-green-500/10 p-2"><Wifi className="h-5 w-5 text-green-400" /></div>
          <div><p className="text-xs text-muted-foreground">在线设备</p><p className="text-xl font-bold font-mono text-green-400">{online}</p></div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
          <div className="rounded-lg bg-red-500/10 p-2"><WifiOff className="h-5 w-5 text-red-400" /></div>
          <div><p className="text-xs text-muted-foreground">离线设备</p><p className="text-xl font-bold font-mono text-red-400">{offline}</p></div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
          <div className="rounded-lg bg-yellow-500/10 p-2"><AlertCircle className="h-5 w-5 text-yellow-400" /></div>
          <div><p className="text-xs text-muted-foreground">故障设备</p><p className="text-xl font-bold font-mono text-yellow-400">{fault}</p></div>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">设备编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">类型</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">位置</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">电池</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">信号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">最后数据</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs text-cyan-400">{d.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{TYPE_LABELS[d.type]}</td>
                <td className="px-4 py-3 text-white">{d.location.address}</td>
                <td className="px-4 py-3">
                  <span className={`flex items-center gap-1 text-xs ${d.status === 'online' ? 'text-green-400' : d.status === 'offline' ? 'text-red-400' : 'text-yellow-400'}`}>
                    {d.status === 'online' ? <Wifi className="h-3 w-3" /> : d.status === 'offline' ? <WifiOff className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                    {d.status === 'online' ? '在线' : d.status === 'offline' ? '离线' : '故障'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`flex items-center gap-1 text-xs ${d.battery < 20 ? 'text-red-400' : 'text-green-400'}`}>
                    <Battery className="h-3 w-3" /> {d.battery}%
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`flex items-center gap-1 text-xs ${d.signal === 'strong' ? 'text-green-400' : d.signal === 'medium' ? 'text-yellow-400' : 'text-red-400'}`}>
                    <Signal className="h-3 w-3" /> {d.signal === 'strong' ? '强' : d.signal === 'medium' ? '中' : '弱'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{d.lastDataTime}</td>
                <td className="px-4 py-3 text-center"><button className="text-xs text-cyan-400 hover:underline">详情</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
