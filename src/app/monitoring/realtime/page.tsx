'use client';

import { useEffect, useState } from 'react';
import {
  Radio,
  Battery,
  Signal,
  Wifi,
  WifiOff,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { MonitoringDevice } from '@/types';
import { getMonitoringDevices } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  npr_anchor: 'NPR锚索',
  rainfall: '雨量计',
  fiber_optic: '光纤传感',
  camera: '摄像头',
  others: '其他',
};

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  online: { icon: Wifi, color: 'text-green-400', label: '在线' },
  offline: { icon: WifiOff, color: 'text-red-400', label: '离线' },
  fault: { icon: AlertCircle, color: 'text-yellow-400', label: '故障' },
};

export default function MonitoringRealtimePage() {
  const [devices, setDevices] = useState<MonitoringDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<MonitoringDevice | null>(null);
  const [dataType, setDataType] = useState<string>('force');

  useEffect(() => {
    getMonitoringDevices().then((data) => {
      setDevices(data);
      if (data.length > 0) setSelectedDevice(data[0]);
    });
  }, []);

  const chartData = selectedDevice?.data.map((d) => ({
    time: new Date(d.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    value: d.value,
  })) ?? [];

  const statusConfig = selectedDevice ? STATUS_CONFIG[selectedDevice.status] : null;
  const StatusIcon = statusConfig?.icon ?? Wifi;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Radio className="h-4 w-4" />
          <span>监测感知网络</span>
          <span>/</span>
          <span className="text-white">实时监测数据</span>
        </div>
        <div className="flex items-center gap-3">
          <select className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground">
            <option>实时</option>
            <option>近1小时</option>
            <option>近24小时</option>
            <option>近7天</option>
          </select>
          <select className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground">
            <option value="">全部类型</option>
            <option value="npr_anchor">NPR锚索</option>
            <option value="rainfall">雨量计</option>
            <option value="fiber_optic">光纤传感</option>
            <option value="camera">摄像头</option>
          </select>
          <button className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-accent">
            <RefreshCw className="h-4 w-4" /> 刷新
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* 左侧设备树 */}
        <div className="w-52 shrink-0 rounded-lg border border-border bg-card p-3">
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">设备列表</h4>
          <div className="space-y-1">
            {['全县', 'A镇', 'B镇', 'C镇'].map((area, i) => (
              <div key={area}>
                <p className={cn('py-1 text-sm', i === 0 ? 'text-white font-medium' : 'text-slate-400 ml-3')}>
                  {i === 0 ? '☑' : '☐'} {area}
                </p>
                {i > 0 && devices.filter((d) => d.location.address.includes(area === 'A镇' ? '竹林' : area === 'B镇' ? '石桥' : '王')).slice(0, 2).map((device) => {
                  const sc = STATUS_CONFIG[device.status];
                  const SI = sc.icon;
                  return (
                    <button
                      key={device.id}
                      onClick={() => setSelectedDevice(device)}
                      className={cn(
                        'ml-6 flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors',
                        selectedDevice?.id === device.id
                          ? 'bg-cyan-500/20 text-cyan-400'
                          : 'text-slate-400 hover:bg-accent hover:text-white'
                      )}
                    >
                      <SI className={cn('h-3 w-3', sc.color)} />
                      {device.name}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* 中间图表区 */}
        <div className="flex-1 space-y-4">
          {selectedDevice && (
            <>
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="mb-1 text-sm font-semibold text-white">
                  📊 {selectedDevice.name} - {selectedDevice.type === 'npr_anchor' ? '牛顿力变化曲线' : '数据变化曲线'}
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                    />
                    {selectedDevice.data[0]?.threshold && (
                      <>
                        <ReferenceLine y={selectedDevice.data[0].threshold.red} stroke="#ef4444" strokeDasharray="3 3" label={{ value: '红色', fill: '#ef4444', fontSize: 10 }} />
                        <ReferenceLine y={selectedDevice.data[0].threshold.orange} stroke="#f97316" strokeDasharray="3 3" label={{ value: '橙色', fill: '#f97316', fontSize: 10 }} />
                        <ReferenceLine y={selectedDevice.data[0].threshold.yellow} stroke="#eab308" strokeDasharray="3 3" label={{ value: '黄色', fill: '#eab308', fontSize: 10 }} />
                      </>
                    )}
                    <Area type="monotone" dataKey="value" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="mt-2 flex gap-2">
                  {['位移', '降雨', '应力'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setDataType(tab)}
                      className={cn(
                        'rounded px-3 py-1 text-xs transition-colors',
                        dataType === tab ? 'bg-cyan-600 text-white' : 'bg-muted text-muted-foreground hover:text-white'
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* 多参数联动 */}
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold text-white">多参数联动展示</h3>
                <div className="space-y-3">
                  <ParamBar label="降雨量" value={45} max={100} unit="mm" color="bg-blue-500" />
                  <ParamBar label="位移" value={12.3} max={50} unit="mm" color="bg-orange-500" />
                  <ParamBar label="含水量" value={32} max={100} unit="%" color="bg-cyan-500" />
                  <ParamBar label="牛顿力" value={68} max={100} unit="MPa" color="bg-purple-500" />
                </div>
              </div>
            </>
          )}
        </div>

        {/* 右侧设备信息 */}
        {selectedDevice && statusConfig && (
          <div className="w-64 shrink-0 space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">设备信息</h4>
                <span className={cn('flex items-center gap-1 text-xs', statusConfig.color)}>
                  <StatusIcon className="h-3 w-3" /> {statusConfig.label}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">设备名称</span>
                  <span className="font-mono text-white">{selectedDevice.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">安装位置</span>
                  <span className="text-white">{selectedDevice.location.address}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">设备类型</span>
                  <span className="text-white">{TYPE_LABELS[selectedDevice.type]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">量程</span>
                  <span className="text-white">{selectedDevice.specs.range}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">精度</span>
                  <span className="text-white">{selectedDevice.specs.accuracy}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">电池</span>
                  <span className="flex items-center gap-1 text-white">
                    <Battery className={cn('h-3.5 w-3.5', selectedDevice.battery < 20 ? 'text-red-400' : 'text-green-400')} />
                    {selectedDevice.battery}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">信号</span>
                  <span className={cn('flex items-center gap-1', selectedDevice.signal === 'strong' ? 'text-green-400' : selectedDevice.signal === 'medium' ? 'text-yellow-400' : 'text-red-400')}>
                    <Signal className="h-3.5 w-3.5" />
                    {selectedDevice.signal === 'strong' ? '强' : selectedDevice.signal === 'medium' ? '中' : '弱'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">数据更新</span>
                  <span className="text-xs text-white">{selectedDevice.lastDataTime}</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h4 className="mb-3 text-sm font-semibold text-white">历史统计</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">最大值</span>
                  <span className="font-mono text-red-400">
                    {Math.max(...selectedDevice.data.map((d) => d.value)).toFixed(1)} {selectedDevice.data[0]?.unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">最小值</span>
                  <span className="font-mono text-green-400">
                    {Math.min(...selectedDevice.data.map((d) => d.value)).toFixed(1)} {selectedDevice.data[0]?.unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">平均值</span>
                  <span className="font-mono text-white">
                    {(selectedDevice.data.reduce((s, d) => s + d.value, 0) / selectedDevice.data.length).toFixed(1)} {selectedDevice.data[0]?.unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">报警次数</span>
                  <span className="font-mono text-orange-400">3次</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ParamBar({ label, value, max, unit, color }: { label: string; value: number; max: number; unit: string; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-xs text-muted-foreground">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 text-right text-xs font-mono text-white">{value}{unit}</span>
    </div>
  );
}
