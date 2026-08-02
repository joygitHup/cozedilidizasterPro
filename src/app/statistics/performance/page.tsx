'use client';

import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

export default function PerformancePage() {
  const efficiencyData = [
    { month: '1月', response: 2.5, closure: 4.2 },
    { month: '2月', response: 2.1, closure: 3.8 },
    { month: '3月', response: 1.8, closure: 3.5 },
    { month: '4月', response: 2.0, closure: 3.2 },
    { month: '5月', response: 1.5, closure: 2.8 },
    { month: '6月', response: 1.2, closure: 2.5 },
    { month: '7月', response: 1.0, closure: 2.3 },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">效能分析</h1>
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">平均响应时间</p>
          <p className="mt-1 text-2xl font-bold font-mono text-cyan-400">1.0<span className="text-sm text-muted-foreground ml-1">分钟</span></p>
          <p className="mt-1 text-xs text-green-400">↓ 较上月优化 17%</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">平均处置时长</p>
          <p className="mt-1 text-2xl font-bold font-mono text-cyan-400">2.3<span className="text-sm text-muted-foreground ml-1">小时</span></p>
          <p className="mt-1 text-xs text-green-400">↓ 较上月优化 8%</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">闭环率</p>
          <p className="mt-1 text-2xl font-bold font-mono text-green-400">92.3%</p>
          <p className="mt-1 text-xs text-green-400">↑ 2.1%</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">巡查覆盖率</p>
          <p className="mt-1 text-2xl font-bold font-mono text-cyan-400">87.5%</p>
          <p className="mt-1 text-xs text-green-400">↑ 5.3%</p>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-4 text-sm font-medium text-white">响应效率趋势（分钟）</h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={efficiencyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }} />
            <Area type="monotone" dataKey="response" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.1} name="响应时间" />
            <Area type="monotone" dataKey="closure" stroke="#10b981" fill="#10b981" fillOpacity={0.1} name="处置时长" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
