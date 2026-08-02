'use client';

import { useEffect, useState } from 'react';
import { BarChart3, TrendingDown, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { cn } from '@/lib/utils';

export default function DisasterStatsPage() {
  const monthlyData = [
    { month: '1月', count: 2 }, { month: '2月', count: 1 }, { month: '3月', count: 3 },
    { month: '4月', count: 5 }, { month: '5月', count: 8 }, { month: '6月', count: 12 },
    { month: '7月', count: 16 }, { month: '8月', count: 9 }, { month: '9月', count: 4 },
    { month: '10月', count: 2 }, { month: '11月', count: 1 }, { month: '12月', count: 1 },
  ];

  const typeData = [
    { name: '滑坡', value: 45, color: '#ef4444' },
    { name: '崩塌', value: 28, color: '#f97316' },
    { name: '泥石流', value: 18, color: '#eab308' },
    { name: '其他', value: 9, color: '#3b82f6' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">灾害统计</h1>
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">隐患点总数</p>
          <p className="mt-1 text-2xl font-bold font-mono text-white">1,284</p>
          <p className="mt-1 text-xs text-green-400">↑ 3.2%</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">本月新增预警</p>
          <p className="mt-1 text-2xl font-bold font-mono text-white">16</p>
          <p className="mt-1 text-xs text-red-400">↑ 4件</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">已处置预警</p>
          <p className="mt-1 text-2xl font-bold font-mono text-white">12</p>
          <p className="mt-1 text-xs text-green-400">闭环率 75%</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">累计转移人数</p>
          <p className="mt-1 text-2xl font-bold font-mono text-white">328</p>
          <p className="mt-1 text-xs text-muted-foreground">本年度</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-4 text-sm font-medium text-white">月度预警趋势</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-4 text-sm font-medium text-white">灾害类型分布</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={typeData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {typeData.map((entry, index) => (<Cell key={index} fill={entry.color} />))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
