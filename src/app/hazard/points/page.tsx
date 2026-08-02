'use client';

import { useEffect, useState } from 'react';
import {
  Search,
  Plus,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  MapPin,
  AlertTriangle,
  X,
} from 'lucide-react';
import type { HazardPoint } from '@/types';
import { getHazardPoints } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const LEVEL_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  red: { bg: 'bg-red-500/20', text: 'text-red-400', label: '红色' },
  orange: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: '橙色' },
  yellow: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: '黄色' },
  blue: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: '蓝色' },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  stable: { bg: 'bg-green-500/20', text: 'text-green-400', label: '稳定' },
  attention: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: '关注' },
  warning: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: '预警' },
  emergency: { bg: 'bg-red-500/20', text: 'text-red-400', label: '紧急' },
};

const TYPE_LABELS: Record<string, string> = {
  landslide: '滑坡',
  collapse: '崩塌',
  debris_flow: '泥石流',
  others: '其他',
};

const regions = [
  {
    name: '全县',
    children: [
      { name: 'A镇', children: ['竹林村', '李家坪'] },
      { name: 'B镇', children: ['石桥村', '河坝村'] },
      { name: 'C镇', children: ['王家村', '赵家村'] },
    ],
  },
];

export default function HazardPointsPage() {
  const [points, setPoints] = useState<HazardPoint[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedPoint, setSelectedPoint] = useState<HazardPoint | null>(null);
  const [showModal, setShowModal] = useState(false);

  const loadData = async () => {
    const res = await getHazardPoints({ page, pageSize: 10, search, level: levelFilter, status: statusFilter });
    setPoints(res.list);
    setTotal(res.total);
  };

  useEffect(() => { loadData(); }, [page, levelFilter, statusFilter]);

  const handleSearch = () => { setPage(1); loadData(); };
  const totalPages = Math.ceil(total / 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          <span>隐患台账管理</span>
          <span>/</span>
          <span className="text-white">隐患点管理</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 transition-colors">
            <Plus className="h-4 w-4" /> 新增
          </button>
          <button className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors">
            <Upload className="h-4 w-4" /> 导入
          </button>
          <button className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> 导出
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* 左侧区域树 */}
        <div className="w-48 shrink-0 rounded-lg border border-border bg-card p-3">
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">区域筛选</h4>
          {regions.map((region) => (
            <div key={region.name}>
              <label className="flex items-center gap-2 py-1 text-sm text-white cursor-pointer">
                <input type="checkbox" className="accent-cyan-500" defaultChecked /> {region.name}
              </label>
              {region.children.map((town) => (
                <div key={typeof town === 'string' ? town : town.name} className="ml-4">
                  <label className="flex items-center gap-2 py-1 text-sm text-slate-300 cursor-pointer">
                    <input type="checkbox" className="accent-cyan-500" /> {typeof town === 'string' ? town : town.name}
                  </label>
                  {typeof town !== 'string' && town.children.map((village) => (
                    <label key={village} className="ml-4 flex items-center gap-2 py-1 text-sm text-slate-400 cursor-pointer">
                      <input type="checkbox" className="accent-cyan-500" /> {village}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* 右侧列表 */}
        <div className="flex-1 space-y-3">
          {/* 筛选栏 */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="搜索名称、编号..."
                className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
            <select
              value={levelFilter}
              onChange={(e) => { setLevelFilter(e.target.value); setPage(1); }}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="">全部等级</option>
              <option value="red">红色</option>
              <option value="orange">橙色</option>
              <option value="yellow">黄色</option>
              <option value="blue">蓝色</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="">全部状态</option>
              <option value="stable">稳定</option>
              <option value="attention">关注</option>
              <option value="warning">预警</option>
              <option value="emergency">紧急</option>
            </select>
            <button onClick={handleSearch} className="h-9 rounded-lg bg-cyan-600 px-4 text-sm font-medium text-white hover:bg-cyan-700">
              搜索
            </button>
            <button onClick={() => { setSearch(''); setLevelFilter(''); setStatusFilter(''); setPage(1); }} className="h-9 rounded-lg border border-border px-4 text-sm text-muted-foreground hover:bg-accent">
              重置
            </button>
          </div>

          {/* 数据表格 */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">编号</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">名称</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">类型</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">等级</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">威胁人数</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">责任人</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {points.map((point) => (
                  <tr key={point.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-cyan-400">{point.code}</td>
                    <td className="px-4 py-3 text-white font-medium">{point.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{TYPE_LABELS[point.type]}</td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded px-2 py-0.5 text-xs font-medium', LEVEL_STYLES[point.level].bg, LEVEL_STYLES[point.level].text)}>
                        {LEVEL_STYLES[point.level].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded px-2 py-0.5 text-xs font-medium', STATUS_STYLES[point.status].bg, STATUS_STYLES[point.status].text)}>
                        {STATUS_STYLES[point.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-white">{point.threat.people}</td>
                    <td className="px-4 py-3 text-muted-foreground">{point.responsiblePerson}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelectedPoint(point)}
                        className="text-xs text-cyan-400 hover:underline"
                      >
                        详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>共 {total} 条 第 {page}/{totalPages || 1} 页</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="rounded p-1 hover:bg-accent disabled:opacity-50">
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => setPage(p)} className={cn('rounded px-2.5 py-1 text-xs', p === page ? 'bg-cyan-600 text-white' : 'hover:bg-accent')}>
                  {p}
                </button>
              ))}
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="rounded p-1 hover:bg-accent disabled:opacity-50">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 详情侧栏 */}
      {selectedPoint && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedPoint(null)} />
          <div className="relative w-[480px] bg-card border-l border-border overflow-y-auto animate-slide-in-right">
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card p-4">
              <h3 className="text-lg font-bold text-white">{selectedPoint.name}</h3>
              <button onClick={() => setSelectedPoint(null)} className="rounded p-1 hover:bg-accent">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <InfoItem label="编号" value={selectedPoint.code} />
                <InfoItem label="类型" value={TYPE_LABELS[selectedPoint.type]} />
                <InfoItem label="风险等级">
                  <span className={cn('rounded px-2 py-0.5 text-xs font-medium', LEVEL_STYLES[selectedPoint.level].bg, LEVEL_STYLES[selectedPoint.level].text)}>
                    {LEVEL_STYLES[selectedPoint.level].label}
                  </span>
                </InfoItem>
                <InfoItem label="状态">
                  <span className={cn('rounded px-2 py-0.5 text-xs font-medium', STATUS_STYLES[selectedPoint.status].bg, STATUS_STYLES[selectedPoint.status].text)}>
                    {STATUS_STYLES[selectedPoint.status].label}
                  </span>
                </InfoItem>
              </div>

              <div className="rounded-lg border border-border p-3">
                <h4 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">位置信息</h4>
                <p className="text-sm text-white">{selectedPoint.location.address}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  经度 {selectedPoint.location.lng} · 纬度 {selectedPoint.location.lat}
                </p>
              </div>

              <div className="rounded-lg border border-border p-3">
                <h4 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">规模参数</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <InfoItem label="体积" value={`${selectedPoint.scale.volume.toLocaleString()} m³`} />
                  <InfoItem label="长度" value={`${selectedPoint.scale.length} m`} />
                  <InfoItem label="宽度" value={`${selectedPoint.scale.width} m`} />
                  <InfoItem label="高度" value={`${selectedPoint.scale.height} m`} />
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <h4 className="mb-2 text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-orange-400" /> 威胁对象
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <InfoItem label="威胁人数" value={`${selectedPoint.threat.people} 人`} />
                  <InfoItem label="威胁房屋" value={`${selectedPoint.threat.houses} 间`} />
                  <InfoItem label="威胁道路" value={`${selectedPoint.threat.roads} m`} />
                  <InfoItem label="威胁资产" value={`${selectedPoint.threat.assets} 万元`} />
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <h4 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">责任人信息</h4>
                <InfoItem label="责任人" value={selectedPoint.responsiblePerson} />
                <InfoItem label="联系电话" value={selectedPoint.contactPhone} />
                <InfoItem label="稳定性系数" value={selectedPoint.coefficient.toFixed(3)} />
              </div>

              <div className="flex gap-2">
                <button className="flex-1 rounded-lg bg-cyan-600 py-2 text-sm font-medium text-white hover:bg-cyan-700">
                  编辑
                </button>
                <button className="flex-1 rounded-lg border border-border py-2 text-sm text-foreground hover:bg-accent">
                  处置记录
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 新增弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative w-[600px] max-h-[80vh] overflow-y-auto rounded-lg border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">新增隐患点</h3>
              <button onClick={() => setShowModal(false)} className="rounded p-1 hover:bg-accent">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="编号"><input className="form-input" placeholder="HS006" /></FormField>
                <FormField label="名称"><input className="form-input" placeholder="请输入名称" /></FormField>
                <FormField label="类型">
                  <select className="form-input">
                    <option value="landslide">滑坡</option>
                    <option value="collapse">崩塌</option>
                    <option value="debris_flow">泥石流</option>
                    <option value="others">其他</option>
                  </select>
                </FormField>
                <FormField label="风险等级">
                  <select className="form-input">
                    <option value="red">红色</option>
                    <option value="orange">橙色</option>
                    <option value="yellow">黄色</option>
                    <option value="blue">蓝色</option>
                  </select>
                </FormField>
              </div>
              <FormField label="地址"><input className="form-input" placeholder="请输入详细地址" /></FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="经度"><input className="form-input" type="number" placeholder="104.0668" /></FormField>
                <FormField label="纬度"><input className="form-input" type="number" placeholder="30.5728" /></FormField>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="威胁人数"><input className="form-input" type="number" placeholder="0" /></FormField>
                <FormField label="威胁房屋"><input className="form-input" type="number" placeholder="0" /></FormField>
              </div>
              <FormField label="责任人"><input className="form-input" placeholder="请输入责任人" /></FormField>
              <FormField label="联系电话"><input className="form-input" placeholder="请输入联系电话" /></FormField>
              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <button onClick={() => setShowModal(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent">取消</button>
                <button onClick={() => setShowModal(false)} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700">确认新增</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children ?? <p className="text-sm text-white mt-0.5">{value}</p>}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
