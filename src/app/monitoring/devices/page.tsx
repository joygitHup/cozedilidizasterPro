'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Plus,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
  Pencil,
  Trash2,
  Loader2,
  Link2,
  Wifi,
  WifiOff,
  AlertCircle,
  Battery,
  Signal,
} from 'lucide-react';
import type {
  DevicePayload,
  DeviceRelated,
  DeviceStats,
  DeviceType,
  HazardPoint,
  MonitoringDevice,
  RegionTreeNode,
} from '@/types';
import {
  bindDeviceHazard,
  changeDeviceStatus,
  createHazardRegion,
  createMonitoringDevice,
  deleteMonitoringDevice,
  exportMonitoringDevices,
  getDeviceNextCode,
  getDeviceRelated,
  getDeviceStats,
  getHazardPoints,
  getHazardRegions,
  getMonitoringDevice,
  getMonitoringDevices,
  updateMonitoringDevice,
} from '@/lib/services';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { RegionCascadeFields } from '@/components/hazard/region-tree';

const TYPE_LABELS: Record<DeviceType, string> = {
  npr_anchor: 'NPR锚索计',
  rainfall: '雨量计',
  fiber_optic: '光纤光栅',
  camera: '摄像头',
  gnss: 'GNSS位移站',
  inclinometer: '倾角仪',
  others: '其他',
};

const STATUS_STYLES: Record<
  MonitoringDevice['status'],
  { color: string; bg: string; label: string; icon: typeof Wifi }
> = {
  online: { color: 'text-green-400', bg: 'bg-green-500/20', label: '在线', icon: Wifi },
  offline: { color: 'text-red-400', bg: 'bg-red-500/20', label: '离线', icon: WifiOff },
  fault: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: '故障', icon: AlertCircle },
};

const SIGNAL_LABELS: Record<MonitoringDevice['signal'], string> = {
  strong: '强',
  medium: '中',
  weak: '弱',
};

const INPUT_CLS =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500';

type FormState = {
  code: string;
  name: string;
  device_type: DeviceType;
  status: MonitoringDevice['status'];
  address: string;
  city: string;
  district: string;
  county: string;
  village: string;
  hazard_point: string;
  longitude: string;
  latitude: string;
  install_date: string;
  range_value: string;
  accuracy: string;
  power_consumption: string;
  battery: string;
  signal: MonitoringDevice['signal'];
};

const emptyForm = (): FormState => ({
  code: '',
  name: '',
  device_type: 'npr_anchor',
  status: 'offline',
  address: '',
  city: '',
  district: '',
  county: '',
  village: '',
  hazard_point: '',
  longitude: '',
  latitude: '',
  install_date: '',
  range_value: '',
  accuracy: '',
  power_consumption: '0',
  battery: '100',
  signal: 'strong',
});

function deviceToForm(d: MonitoringDevice): FormState {
  return {
    code: d.code,
    name: d.name,
    device_type: d.type,
    status: d.status,
    address: d.location.address,
    city: d.location.city || '',
    district: d.location.district || '',
    county: d.location.county || '',
    village: d.location.village || '',
    hazard_point: d.hazardPointId != null ? String(d.hazardPointId) : '',
    longitude: String(d.location.lng || ''),
    latitude: String(d.location.lat || ''),
    install_date: d.installDate ? d.installDate.slice(0, 10) : '',
    range_value: d.specs.range === '-' ? '' : d.specs.range,
    accuracy: d.specs.accuracy === '-' ? '' : d.specs.accuracy,
    power_consumption: String(d.specs.power || 0),
    battery: String(d.battery ?? 100),
    signal: d.signal,
  };
}

function formToPayload(form: FormState): DevicePayload {
  const payload: DevicePayload = {
    name: form.name.trim(),
    device_type: form.device_type,
    status: form.status,
    address: form.address.trim(),
    city: form.city.trim(),
    district: form.district.trim(),
    county: form.county.trim(),
    village: form.village.trim(),
    town: form.district.trim(),
    range_value: form.range_value.trim(),
    accuracy: form.accuracy.trim(),
    power_consumption: Number(form.power_consumption || 0),
    battery: Number(form.battery || 100),
    signal: form.signal,
  };
  if (form.code.trim()) payload.code = form.code.trim().toUpperCase();
  if (form.hazard_point) {
    payload.hazard_point = Number(form.hazard_point);
  } else {
    payload.hazard_point = null;
  }
  if (form.longitude !== '') payload.longitude = Number(form.longitude);
  if (form.latitude !== '') payload.latitude = Number(form.latitude);
  payload.install_date = form.install_date || null;
  return payload;
}

function formatRegion(d: MonitoringDevice) {
  const parts = [
    d.location.city,
    d.location.district,
    d.location.county,
    d.location.village,
  ].filter(Boolean);
  return parts.length ? parts.join(' / ') : d.location.address || '—';
}

function formatTime(v: string) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return v;
  }
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<MonitoringDevice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [flagFilter, setFlagFilter] = useState('');
  const [stats, setStats] = useState<DeviceStats | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<MonitoringDevice | null>(null);
  const [related, setRelated] = useState<DeviceRelated | null>(null);

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [hazardOptions, setHazardOptions] = useState<HazardPoint[]>([]);
  const [regions, setRegions] = useState<RegionTreeNode[]>([]);
  const del = useConfirmDelete<MonitoringDevice>();

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadStats = useCallback(async () => {
    try {
      setStats(await getDeviceStats());
    } catch {
      setStats(null);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getMonitoringDevices({
        page,
        pageSize,
        search,
        status: statusFilter,
        deviceType: typeFilter,
        lowBattery: flagFilter === 'low_battery',
        stale: flagFilter === 'stale',
        unlinked: flagFilter === 'unlinked',
      });
      setDevices(res.list);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setDevices([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, typeFilter, flagFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    getHazardPoints({ page: 1, pageSize: 100 })
      .then((res) => setHazardOptions(res.list))
      .catch(() => setHazardOptions([]));
    getHazardRegions()
      .then(setRegions)
      .catch(() => setRegions([]));
  }, []);

  const openDetail = async (device: MonitoringDevice) => {
    setSelected(device);
    setRelated(null);
    try {
      const [detail, rel] = await Promise.all([
        getMonitoringDevice(device.id),
        getDeviceRelated(device.id),
      ]);
      setSelected(detail);
      setRelated(rel);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载详情失败');
    }
  };

  const refreshSelected = async (id: string) => {
    const [detail, rel] = await Promise.all([getMonitoringDevice(id), getDeviceRelated(id)]);
    setSelected(detail);
    setRelated(rel);
  };

  const openCreate = async () => {
    const f = emptyForm();
    try {
      f.code = await getDeviceNextCode(f.device_type);
    } catch {
      /* ignore */
    }
    setForm(f);
    setFormError('');
    setModalMode('create');
  };

  const openEdit = (device: MonitoringDevice) => {
    setForm(deviceToForm(device));
    setFormError('');
    setModalMode('edit');
  };

  const onTypeChange = async (deviceType: DeviceType) => {
    setForm((prev) => ({ ...prev, device_type: deviceType }));
    if (modalMode === 'create') {
      try {
        const code = await getDeviceNextCode(deviceType);
        setForm((prev) => ({ ...prev, device_type: deviceType, code }));
      } catch {
        /* ignore */
      }
    }
  };

  const onHazardSelectInForm = (hazardId: string) => {
    const hp = hazardOptions.find((h) => String(h.id) === hazardId);
    setForm((prev) => ({
      ...prev,
      hazard_point: hazardId,
      longitude: hp ? String(hp.location.lng) : prev.longitude,
      latitude: hp ? String(hp.location.lat) : prev.latitude,
      address: hp ? hp.location.address || hp.name : prev.address,
      city: hp ? hp.location.city || prev.city : prev.city,
      district: hp ? hp.location.district || hp.location.town || prev.district : prev.district,
      county: hp ? hp.location.county || prev.county : prev.county,
      village: hp ? hp.location.village || prev.village : prev.village,
    }));
  };

  const handleAddRegion = async (
    parent: RegionTreeNode | null,
    name: string,
    level?: string
  ) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('请填写名称');
    await createHazardRegion({
      name: trimmed,
      parent_id: parent?.id ?? null,
      level,
    });
    setRegions(await getHazardRegions());
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError('请填写设备名称');
      return;
    }
    if (!form.hazard_point && (form.longitude === '' || form.latitude === '')) {
      setFormError('未关联隐患点时请填写经纬度');
      return;
    }
    const bat = Number(form.battery);
    if (Number.isNaN(bat) || bat < 0 || bat > 100) {
      setFormError('电量须在 0–100 之间');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (modalMode === 'create') {
        const created = await createMonitoringDevice(formToPayload(form));
        setModalMode(null);
        await loadData();
        await loadStats();
        await openDetail(created);
      } else if (modalMode === 'edit' && selected) {
        const updated = await updateMonitoringDevice(selected.id, formToPayload(form));
        setModalMode(null);
        setSelected(updated);
        await loadData();
        await loadStats();
        setRelated(await getDeviceRelated(updated.id));
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () =>
    del.confirm(async (device) => {
      await deleteMonitoringDevice(device.id);
      if (selected?.id === device.id) {
        setSelected(null);
        setRelated(null);
      }
      await loadData();
      await loadStats();
    });

  const handleChangeStatus = async (status: MonitoringDevice['status']) => {
    if (!selected) return;
    try {
      await changeDeviceStatus(selected.id, status);
      await refreshSelected(selected.id);
      await loadData();
      await loadStats();
    } catch (e) {
      alert(e instanceof Error ? e.message : '状态变更失败');
    }
  };

  const handleBind = async (hazardId: string) => {
    if (!selected) return;
    try {
      const id = hazardId ? Number(hazardId) : null;
      await bindDeviceHazard(selected.id, id, true);
      await refreshSelected(selected.id);
      await loadData();
      await loadStats();
    } catch (e) {
      alert(e instanceof Error ? e.message : '绑定失败');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setTypeFilter('');
    setFlagFilter('');
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <PageHeader>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700"
          >
            <Plus className="h-4 w-4" /> 新增
          </button>
          <button
            onClick={() =>
              exportMonitoringDevices({
                status: statusFilter,
                deviceType: typeFilter,
                search,
              }).catch((e) => alert(e instanceof Error ? e.message : '导出失败'))
            }
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
          >
            <Download className="h-4 w-4" /> 导出
          </button>
      </PageHeader>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <StatCard label="设备总数" value={stats.total} />
          <StatCard label="在线" value={stats.online} accent="text-green-400" />
          <StatCard label="离线" value={stats.offline} accent="text-red-400" />
          <StatCard label="故障" value={stats.fault} accent="text-yellow-400" />
          <StatCard label="低电量" value={stats.low_battery} accent="text-orange-400" />
          <StatCard label="数据滞后" value={stats.stale} accent="text-amber-400" />
          <StatCard label="未关联隐患点" value={stats.unlinked} accent="text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">筛选条件</h3>
          <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-cyan-400">
            清空条件
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <label className="mb-1.5 block text-xs text-muted-foreground">关键词</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (setPage(1), loadData())}
                placeholder="编号 / 名称 / 位置 / 隐患点"
                className={cn(INPUT_CLS, 'pl-9')}
              />
            </div>
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-xs text-muted-foreground">设备类型</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className={INPUT_CLS}
            >
              <option value="">全部</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-xs text-muted-foreground">运行状态</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className={INPUT_CLS}
            >
              <option value="">全部</option>
              <option value="online">在线</option>
              <option value="offline">离线</option>
              <option value="fault">故障</option>
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-xs text-muted-foreground">运维标记</label>
            <select
              value={flagFilter}
              onChange={(e) => {
                setFlagFilter(e.target.value);
                setPage(1);
              }}
              className={INPUT_CLS}
            >
              <option value="">全部</option>
              <option value="low_battery">低电量(&lt;20%)</option>
              <option value="stale">数据滞后(在线超24h无数据)</option>
              <option value="unlinked">未关联隐患点</option>
            </select>
          </div>
          <div className="flex items-end gap-2 lg:col-span-2">
            <button
              onClick={() => {
                setPage(1);
                loadData();
              }}
              className="h-9 flex-1 rounded-lg bg-cyan-600 px-4 text-sm font-medium text-white hover:bg-cyan-700"
            >
              查询
            </button>
            <button
              onClick={clearFilters}
              className="h-9 rounded-lg border border-border px-4 text-sm text-muted-foreground hover:bg-accent"
            >
              重置
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">类型</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">关联隐患点</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">电量</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">信号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">最后数据</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : devices.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  暂无设备，点击「新增」入库
                </td>
              </tr>
            ) : (
              devices.map((d) => {
                const st = STATUS_STYLES[d.status];
                const Icon = st.icon;
                return (
                  <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs text-cyan-400">{d.code}</td>
                    <td className="px-4 py-3 text-white">
                      {d.name}
                      {d.isStale && (
                        <span className="ml-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-400">
                          滞后
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {d.typeDisplay || TYPE_LABELS[d.type]}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium',
                          st.bg,
                          st.color
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {d.hazardPointCode
                        ? `${d.hazardPointName} (${d.hazardPointCode})`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-xs',
                          d.battery < 20 ? 'text-red-400' : 'text-green-400'
                        )}
                      >
                        <Battery className="h-3 w-3" /> {d.battery}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-xs',
                          d.signal === 'strong'
                            ? 'text-green-400'
                            : d.signal === 'medium'
                              ? 'text-yellow-400'
                              : 'text-red-400'
                        )}
                      >
                        <Signal className="h-3 w-3" /> {SIGNAL_LABELS[d.signal]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatTime(d.lastDataTime)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openDetail(d)}
                          className="text-xs text-cyan-400 hover:underline"
                        >
                          详情
                        </button>
                        <button
                          onClick={() => {
                            setSelected(d);
                            openEdit(d);
                          }}
                          className="text-muted-foreground hover:text-white"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => del.open(d)}
                          className="text-muted-foreground hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          共 {total} 条 第 {page}/{totalPages} 页
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="rounded p-1 hover:bg-accent disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="rounded p-1 hover:bg-accent disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 详情抽屉 */}
      {selected && !modalMode && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} />
          <div className="relative w-[480px] overflow-y-auto border-l border-border bg-card">
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card p-4">
              <div>
                <h3 className="text-lg font-bold text-white">{selected.name}</h3>
                <p className="font-mono text-xs text-cyan-400">{selected.code}</p>
              </div>
              <button onClick={() => setSelected(null)} className="rounded p-1 hover:bg-accent">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-3">
                <InfoItem label="类型" value={selected.typeDisplay || TYPE_LABELS[selected.type]} />
                <InfoItem label="安装区域" value={formatRegion(selected)} />
                <InfoItem label="详细地址" value={selected.location.address || '—'} />
                <InfoItem label="量程" value={selected.specs.range} />
                <InfoItem label="精度" value={selected.specs.accuracy} />
                <InfoItem label="电量" value={`${selected.battery}%`} />
                <InfoItem label="信号" value={SIGNAL_LABELS[selected.signal]} />
                <InfoItem label="安装日期" value={selected.installDate || '—'} />
                <InfoItem label="最后数据" value={formatTime(selected.lastDataTime)} />
              </div>

              <div className="rounded-lg border border-border p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  运行状态
                </h4>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(STATUS_STYLES) as MonitoringDevice['status'][]).map((s) => {
                    const conf = STATUS_STYLES[s];
                    return (
                      <button
                        key={s}
                        onClick={() => handleChangeStatus(s)}
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                          selected.status === s
                            ? cn(conf.bg, conf.color, 'border-current')
                            : 'border-border text-muted-foreground hover:bg-accent'
                        )}
                      >
                        {conf.label}
                      </button>
                    );
                  })}
                </div>
                {selected.status === 'online' && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    在线设备不可删除；上报监测数据会刷新最后时间并可能触发预警。
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-border p-3">
                <h4 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
                  <Link2 className="h-3 w-3" /> 关联隐患点
                </h4>
                {selected.hazardPointId ? (
                  <p className="text-sm text-white">
                    {selected.hazardPointName}{' '}
                    <span className="font-mono text-cyan-400">({selected.hazardPointCode})</span>
                  </p>
                ) : (
                  <p className="mb-2 text-sm text-muted-foreground">未关联 — 斜坡监测覆盖将受影响</p>
                )}
                <select
                  className={cn(INPUT_CLS, 'mt-2')}
                  value={selected.hazardPointId != null ? String(selected.hazardPointId) : ''}
                  onChange={(e) => handleBind(e.target.value)}
                >
                  <option value="">解除绑定</option>
                  {hazardOptions.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.code} - {h.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-lg border border-border p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  监测-预警闭环
                </h4>
                <div className="mb-3 grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="rounded bg-muted/40 p-2">
                    <p className="font-mono text-lg text-cyan-400">
                      {selected.dataCount ?? related?.latest_data.length ?? 0}
                    </p>
                    <p className="text-muted-foreground">监测记录(详情计数)</p>
                  </div>
                  <div className="rounded bg-muted/40 p-2">
                    <p className="font-mono text-lg text-orange-400">
                      {related?.open_warnings.length ?? 0}
                    </p>
                    <p className="text-muted-foreground">未闭环预警</p>
                  </div>
                </div>
                {related?.latest_data?.length ? (
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                    {related.latest_data.slice(0, 8).map((row) => (
                      <li
                        key={row.id}
                        className="flex justify-between gap-2 border-b border-border/50 py-1 text-muted-foreground last:border-0"
                      >
                        <span>
                          {row.data_type} {row.value}
                          {row.unit}
                        </span>
                        <span className="shrink-0">{formatTime(String(row.record_time))}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">暂无监测数据</p>
                )}
                {related?.open_warnings?.length ? (
                  <ul className="mt-3 space-y-1 text-xs">
                    {related.open_warnings.map((w) => (
                      <li key={w.id} className="text-orange-400">
                        {w.code} · {w.level} · {w.status}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => openEdit(selected)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border py-2 text-sm hover:bg-accent"
                >
                  <Pencil className="h-3.5 w-3.5" /> 编辑
                </button>
                <button
                  onClick={() => del.open(selected)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-500/40 py-2 text-sm text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> 删除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!del.target}
        title="确认删除监测设备？"
        name={del.target?.name}
        code={del.target?.code}
        hint="在线设备或近 24 小时有数据上报时将无法删除。"
        error={del.error}
        loading={del.loading}
        onCancel={del.close}
        onConfirm={confirmDelete}
      />

      {/* 新增/编辑弹窗 */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !saving && setModalMode(null)} />
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {modalMode === 'create' ? '新建设备' : '编辑设备'}
              </h3>
              <button
                disabled={saving}
                onClick={() => setModalMode(null)}
                className="rounded p-1 hover:bg-accent"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {formError && (
              <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="设备编号">
                <input
                  className={INPUT_CLS}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="可空，自动生成"
                />
              </Field>
              <Field label="设备类型">
                <select
                  className={INPUT_CLS}
                  value={form.device_type}
                  onChange={(e) => onTypeChange(e.target.value as DeviceType)}
                  disabled={modalMode === 'edit'}
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="设备名称" className="col-span-2">
                <input
                  className={INPUT_CLS}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="运行状态">
                <select
                  className={INPUT_CLS}
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value as MonitoringDevice['status'] })
                  }
                >
                  <option value="online">在线</option>
                  <option value="offline">离线</option>
                  <option value="fault">故障</option>
                </select>
              </Field>
              <Field label="信号强度">
                <select
                  className={INPUT_CLS}
                  value={form.signal}
                  onChange={(e) =>
                    setForm({ ...form, signal: e.target.value as MonitoringDevice['signal'] })
                  }
                >
                  <option value="strong">强</option>
                  <option value="medium">中</option>
                  <option value="weak">弱</option>
                </select>
              </Field>
              <Field label="关联隐患点" className="col-span-2">
                <select
                  className={INPUT_CLS}
                  value={form.hazard_point}
                  onChange={(e) => onHazardSelectInForm(e.target.value)}
                >
                  <option value="">不关联（需手填经纬度）</option>
                  {hazardOptions.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.code} - {h.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="经度">
                <input
                  className={INPUT_CLS}
                  value={form.longitude}
                  onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                />
              </Field>
              <Field label="纬度">
                <input
                  className={INPUT_CLS}
                  value={form.latitude}
                  onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                />
              </Field>
              <div className="col-span-2 space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  安装区域（市 / 区 / 县 / 村）— 用于实时监测设备树分组统计
                </p>
                <RegionCascadeFields
                  tree={regions}
                  city={form.city}
                  district={form.district}
                  county={form.county}
                  village={form.village}
                  onChange={(next) =>
                    setForm((prev) => ({
                      ...prev,
                      city: next.city,
                      district: next.district,
                      county: next.county,
                      village: next.village,
                    }))
                  }
                  onAddChild={handleAddRegion}
                  inputClassName={INPUT_CLS}
                />
              </div>
              <Field label="详细地址" className="col-span-2">
                <input
                  className={INPUT_CLS}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="门牌/边坡具体位置等"
                />
              </Field>
              <Field label="安装日期">
                <input
                  type="date"
                  className={INPUT_CLS}
                  value={form.install_date}
                  onChange={(e) => setForm({ ...form, install_date: e.target.value })}
                />
              </Field>
              <Field label="电量(%)">
                <input
                  className={INPUT_CLS}
                  value={form.battery}
                  onChange={(e) => setForm({ ...form, battery: e.target.value })}
                />
              </Field>
              <Field label="量程">
                <input
                  className={INPUT_CLS}
                  value={form.range_value}
                  onChange={(e) => setForm({ ...form, range_value: e.target.value })}
                />
              </Field>
              <Field label="精度">
                <input
                  className={INPUT_CLS}
                  value={form.accuracy}
                  onChange={(e) => setForm({ ...form, accuracy: e.target.value })}
                />
              </Field>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                disabled={saving}
                onClick={() => setModalMode(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent"
              >
                取消
              </button>
              <button
                disabled={saving}
                onClick={handleSave}
                className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = 'text-white',
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-mono text-xl font-bold', accent)}>{value}</p>
    </div>
  );
}

function InfoItem({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {children ?? <p className="mt-0.5 text-sm text-white">{value}</p>}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
