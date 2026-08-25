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
} from 'lucide-react';
import type {
  HazardPoint,
  RiskLevel,
  RiskSlope,
  RiskSlopePayload,
  RiskSlopeRelated,
  RiskSlopeStats,
} from '@/types';
import {
  bindRiskSlopeHazard,
  changeRiskSlopeLevel,
  createRiskSlope,
  deleteRiskSlope,
  exportRiskSlopes,
  getHazardPoints,
  getRiskSlope,
  getRiskSlopeNextCode,
  getRiskSlopeRelated,
  getRiskSlopeStats,
  getRiskSlopes,
  updateRiskSlope,
} from '@/lib/services';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';

const LEVEL_STYLES: Record<RiskLevel, { color: string; bg: string; label: string }> = {
  high: { color: 'text-red-400', bg: 'bg-red-500/20', label: '高风险' },
  medium: { color: 'text-orange-400', bg: 'bg-orange-500/20', label: '中风险' },
  low: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: '低风险' },
};

const COVERAGE_STYLES: Record<string, { color: string; bg: string }> = {
  full: { color: 'text-green-400', bg: 'bg-green-500/20' },
  partial: { color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  pending: { color: 'text-slate-300', bg: 'bg-slate-500/20' },
  offline: { color: 'text-red-400', bg: 'bg-red-500/20' },
  unlinked: { color: 'text-muted-foreground', bg: 'bg-muted/40' },
};

const INPUT_CLS =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500';

type FormState = {
  code: string;
  name: string;
  risk_level: RiskLevel;
  area: string;
  slope_angle: string;
  description: string;
  hazard_point: string;
  longitude: string;
  latitude: string;
};

const emptyForm = (): FormState => ({
  code: '',
  name: '',
  risk_level: 'medium',
  area: '',
  slope_angle: '0',
  description: '',
  hazard_point: '',
  longitude: '',
  latitude: '',
});

function slopeToForm(s: RiskSlope): FormState {
  return {
    code: s.code,
    name: s.name,
    risk_level: s.riskLevel,
    area: String(s.area || ''),
    slope_angle: String(s.slopeAngle || 0),
    description: s.description,
    hazard_point: s.hazardPointId != null ? String(s.hazardPointId) : '',
    longitude: String(s.longitude || ''),
    latitude: String(s.latitude || ''),
  };
}

function formToPayload(form: FormState): RiskSlopePayload {
  const payload: RiskSlopePayload = {
    name: form.name.trim(),
    risk_level: form.risk_level,
    area: Number(form.area),
    slope_angle: Number(form.slope_angle || 0),
    description: form.description.trim(),
  };
  if (form.code.trim()) payload.code = form.code.trim().toUpperCase();
  if (form.hazard_point) {
    payload.hazard_point = Number(form.hazard_point);
  } else {
    payload.hazard_point = null;
  }
  if (form.longitude !== '') payload.longitude = Number(form.longitude);
  if (form.latitude !== '') payload.latitude = Number(form.latitude);
  return payload;
}

export default function HazardSlopesPage() {
  const [slopes, setSlopes] = useState<RiskSlope[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [coverageFilter, setCoverageFilter] = useState('');
  const [stats, setStats] = useState<RiskSlopeStats | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<RiskSlope | null>(null);
  const [related, setRelated] = useState<RiskSlopeRelated | null>(null);

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [hazardOptions, setHazardOptions] = useState<HazardPoint[]>([]);
  const del = useConfirmDelete<RiskSlope>();

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadStats = useCallback(async () => {
    try {
      setStats(await getRiskSlopeStats());
    } catch {
      setStats(null);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getRiskSlopes({
        page,
        pageSize,
        search,
        riskLevel: levelFilter,
        monitorCoverage: coverageFilter,
      });
      setSlopes(res.list);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setSlopes([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, levelFilter, coverageFilter]);

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
  }, []);

  const openDetail = async (slope: RiskSlope) => {
    setSelected(slope);
    setRelated(null);
    try {
      const [detail, rel] = await Promise.all([
        getRiskSlope(slope.id),
        getRiskSlopeRelated(slope.id),
      ]);
      setSelected(detail);
      setRelated(rel);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载详情失败');
    }
  };

  const openCreate = async () => {
    const f = emptyForm();
    try {
      f.code = await getRiskSlopeNextCode();
    } catch {
      /* ignore */
    }
    setForm(f);
    setFormError('');
    setModalMode('create');
  };

  const openEdit = (slope: RiskSlope) => {
    setForm(slopeToForm(slope));
    setFormError('');
    setModalMode('edit');
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError('请填写名称');
      return;
    }
    if (!form.area || Number(form.area) <= 0) {
      setFormError('面积必须大于 0');
      return;
    }
    if (form.risk_level === 'high' && !form.hazard_point) {
      setFormError('高风险斜坡必须关联隐患点');
      return;
    }
    if (!form.hazard_point && (form.longitude === '' || form.latitude === '')) {
      setFormError('未关联隐患点时请填写经纬度');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (modalMode === 'create') {
        const created = await createRiskSlope(formToPayload(form));
        setModalMode(null);
        await loadData();
        await loadStats();
        await openDetail(created);
      } else if (modalMode === 'edit' && selected) {
        const updated = await updateRiskSlope(selected.id, formToPayload(form));
        setModalMode(null);
        setSelected(updated);
        await loadData();
        await loadStats();
        setRelated(await getRiskSlopeRelated(updated.id));
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () =>
    del.confirm(async (slope) => {
      await deleteRiskSlope(slope.id);
      if (selected?.id === slope.id) {
        setSelected(null);
        setRelated(null);
      }
      await loadData();
      await loadStats();
    });

  const handleChangeLevel = async (level: RiskLevel) => {
    if (!selected) return;
    try {
      const updated = await changeRiskSlopeLevel(selected.id, level);
      setSelected(updated);
      await loadData();
      await loadStats();
    } catch (e) {
      alert(e instanceof Error ? e.message : '等级变更失败');
    }
  };

  const handleBind = async (hazardId: string) => {
    if (!selected || !hazardId) return;
    try {
      const updated = await bindRiskSlopeHazard(selected.id, Number(hazardId), true);
      setSelected(updated);
      setRelated(await getRiskSlopeRelated(updated.id));
      await loadData();
      await loadStats();
    } catch (e) {
      alert(e instanceof Error ? e.message : '绑定失败');
    }
  };

  const onHazardSelectInForm = (hazardId: string) => {
    const hp = hazardOptions.find((h) => h.id === hazardId);
    setForm((prev) => ({
      ...prev,
      hazard_point: hazardId,
      longitude: hp ? String(hp.location.lng) : prev.longitude,
      latitude: hp ? String(hp.location.lat) : prev.latitude,
    }));
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
              exportRiskSlopes({ riskLevel: levelFilter, search }).catch((e) =>
                alert(e instanceof Error ? e.message : '导出失败')
              )
            }
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
          >
            <Download className="h-4 w-4" /> 导出
          </button>
      </PageHeader>

      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="斜坡总数" value={stats.total} />
          <StatCard label="高风险" value={stats.by_level.high} accent="text-red-400" />
          <StatCard label="已关联隐患点" value={stats.linked} accent="text-cyan-400" />
          <StatCard
            label="总面积(km²)"
            value={Number(stats.total_area.toFixed(2))}
            accent="text-white"
          />
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
          <button
            onClick={() => {
              setSearch('');
              setLevelFilter('');
              setCoverageFilter('');
              setPage(1);
            }}
            className="text-xs text-muted-foreground hover:text-cyan-400"
          >
            清空条件
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <label className="mb-1.5 block text-xs text-muted-foreground">关键词</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (setPage(1), loadData())}
                placeholder="编号 / 名称 / 关联隐患点"
                className={cn(INPUT_CLS, 'pl-9')}
              />
            </div>
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-xs text-muted-foreground">风险等级</label>
            <select
              value={levelFilter}
              onChange={(e) => {
                setLevelFilter(e.target.value);
                setPage(1);
              }}
              className={INPUT_CLS}
            >
              <option value="">全部</option>
              <option value="high">高风险</option>
              <option value="medium">中风险</option>
              <option value="low">低风险</option>
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-xs text-muted-foreground">监测覆盖</label>
            <select
              value={coverageFilter}
              onChange={(e) => {
                setCoverageFilter(e.target.value);
                setPage(1);
              }}
              className={INPUT_CLS}
            >
              <option value="">全部</option>
              <option value="full">已覆盖</option>
              <option value="partial">部分覆盖</option>
              <option value="pending">待部署</option>
              <option value="offline">设备离线</option>
              <option value="unlinked">未关联隐患点</option>
            </select>
          </div>
          <div className="flex items-end gap-2 lg:col-span-3">
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
              onClick={() => {
                setSearch('');
                setLevelFilter('');
                setCoverageFilter('');
                setPage(1);
              }}
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
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">风险等级</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">面积</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">关联隐患点</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">监测覆盖</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : slopes.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  暂无风险斜坡，点击「新增」创建
                </td>
              </tr>
            ) : (
              slopes.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs text-cyan-400">{s.code}</td>
                  <td className="px-4 py-3 text-white">{s.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded px-2 py-0.5 text-xs font-medium',
                        LEVEL_STYLES[s.riskLevel].bg,
                        LEVEL_STYLES[s.riskLevel].color
                      )}
                    >
                      {LEVEL_STYLES[s.riskLevel].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.area} km²</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {s.hazardPointCode
                      ? `${s.hazardPointName} (${s.hazardPointCode})`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded px-2 py-0.5 text-xs font-medium',
                        COVERAGE_STYLES[s.monitorCoverage]?.bg,
                        COVERAGE_STYLES[s.monitorCoverage]?.color
                      )}
                    >
                      {s.monitorCoverageDisplay}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openDetail(s)}
                        className="text-xs text-cyan-400 hover:underline"
                      >
                        详情
                      </button>
                      <button
                        onClick={() => {
                          setSelected(s);
                          openEdit(s);
                        }}
                        className="text-muted-foreground hover:text-white"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => del.open(s)}
                        className="text-muted-foreground hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
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

      {/* 详情 */}
      {selected && !modalMode && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} />
          <div className="relative w-[480px] overflow-y-auto border-l border-border bg-card">
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card p-4">
              <h3 className="text-lg font-bold text-white">{selected.name}</h3>
              <button onClick={() => setSelected(null)} className="rounded p-1 hover:bg-accent">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-3">
                <InfoItem label="编号" value={selected.code} />
                <InfoItem label="面积" value={`${selected.area} km²`} />
                <InfoItem label="坡度" value={`${selected.slopeAngle}°`} />
                <InfoItem label="风险等级">
                  <span
                    className={cn(
                      'rounded px-2 py-0.5 text-xs font-medium',
                      LEVEL_STYLES[selected.riskLevel].bg,
                      LEVEL_STYLES[selected.riskLevel].color
                    )}
                  >
                    {LEVEL_STYLES[selected.riskLevel].label}
                  </span>
                </InfoItem>
              </div>

              <div className="rounded-lg border border-border p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">位置</h4>
                <p className="text-sm text-white">
                  经度 {selected.longitude} · 纬度 {selected.latitude}
                </p>
                {selected.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{selected.description}</p>
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
                  <p className="mb-2 text-sm text-muted-foreground">未关联</p>
                )}
                <select
                  className={cn(INPUT_CLS, 'mt-2')}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) handleBind(e.target.value);
                  }}
                >
                  <option value="">绑定 / 换绑隐患点...</option>
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
                <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded bg-muted/40 p-2">
                    <p className="font-mono text-lg text-cyan-400">
                      {selected.deviceCount ?? related?.devices.length ?? 0}
                    </p>
                    <p className="text-muted-foreground">设备</p>
                  </div>
                  <div className="rounded bg-muted/40 p-2">
                    <p className="font-mono text-lg text-orange-400">
                      {selected.openWarningCount ?? related?.warnings.length ?? 0}
                    </p>
                    <p className="text-muted-foreground">未闭环预警</p>
                  </div>
                  <div className="rounded bg-muted/40 p-2">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        COVERAGE_STYLES[selected.monitorCoverage]?.color
                      )}
                    >
                      {selected.monitorCoverageDisplay}
                    </p>
                    <p className="text-muted-foreground">覆盖</p>
                  </div>
                </div>
                {related?.warnings?.length ? (
                  <div className="space-y-1">
                    {related.warnings.slice(0, 3).map((w) => (
                      <div
                        key={w.id}
                        className="flex justify-between rounded border border-border/60 px-2 py-1.5 text-xs"
                      >
                        <span className="font-mono text-cyan-400">{w.code}</span>
                        <span className="text-muted-foreground">{w.level}</span>
                        <span className="text-muted-foreground">{w.status}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {related?.message || '暂无未闭环预警'}
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-border p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  风险等级调整
                </h4>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(LEVEL_STYLES) as RiskLevel[]).map((lv) => (
                    <button
                      key={lv}
                      disabled={selected.riskLevel === lv}
                      onClick={() => handleChangeLevel(lv)}
                      className={cn(
                        'rounded-lg border px-2.5 py-1 text-xs',
                        selected.riskLevel === lv
                          ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
                          : 'border-border text-muted-foreground hover:bg-accent'
                      )}
                    >
                      {LEVEL_STYLES[lv].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => openEdit(selected)}
                  className="flex-1 rounded-lg bg-cyan-600 py-2 text-sm font-medium text-white hover:bg-cyan-700"
                >
                  编辑
                </button>
                <button
                  onClick={() => del.open(selected)}
                  className="flex-1 rounded-lg border border-red-500/40 py-2 text-sm text-red-400 hover:bg-red-500/10"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!del.target}
        title="确认删除风险斜坡？"
        name={del.target?.name}
        code={del.target?.code}
        hint="高风险且存在未闭环预警时将无法删除。"
        error={del.error}
        loading={del.loading}
        onCancel={del.close}
        onConfirm={confirmDelete}
      />

      {/* 表单 */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !saving && setModalMode(null)}
          />
          <div className="relative max-h-[85vh] w-[600px] overflow-y-auto rounded-lg border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {modalMode === 'create' ? '新增风险斜坡' : '编辑风险斜坡'}
              </h3>
              <button onClick={() => setModalMode(null)} className="rounded p-1 hover:bg-accent">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            {formError && (
              <div className="mb-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {formError}
              </div>
            )}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="编号">
                  <input
                    className={INPUT_CLS}
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    disabled={modalMode === 'edit'}
                    placeholder="留空自动生成"
                  />
                </Field>
                <Field label="名称 *">
                  <input
                    className={INPUT_CLS}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="风险等级 *">
                  <select
                    className={INPUT_CLS}
                    value={form.risk_level}
                    onChange={(e) =>
                      setForm({ ...form, risk_level: e.target.value as RiskLevel })
                    }
                  >
                    <option value="high">高风险</option>
                    <option value="medium">中风险</option>
                    <option value="low">低风险</option>
                  </select>
                </Field>
                <Field label="面积 km² *">
                  <input
                    className={INPUT_CLS}
                    type="number"
                    step="0.01"
                    value={form.area}
                    onChange={(e) => setForm({ ...form, area: e.target.value })}
                  />
                </Field>
                <Field label="坡度 °">
                  <input
                    className={INPUT_CLS}
                    type="number"
                    step="0.1"
                    value={form.slope_angle}
                    onChange={(e) => setForm({ ...form, slope_angle: e.target.value })}
                  />
                </Field>
                <Field label="关联隐患点">
                  <select
                    className={INPUT_CLS}
                    value={form.hazard_point}
                    onChange={(e) => onHazardSelectInForm(e.target.value)}
                  >
                    <option value="">不关联</option>
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
                    type="number"
                    step="any"
                    value={form.longitude}
                    onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                    placeholder="关联隐患点可自动带入"
                  />
                </Field>
                <Field label="纬度">
                  <input
                    className={INPUT_CLS}
                    type="number"
                    step="any"
                    value={form.latitude}
                    onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="描述">
                <textarea
                  className={cn(INPUT_CLS, 'h-20 py-2')}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
              <p className="text-xs text-muted-foreground">
                业务规则：高风险斜坡必须关联隐患点；监测覆盖由关联隐患点下设备在线情况自动计算。
              </p>
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <button
                  onClick={() => setModalMode(null)}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {modalMode === 'create' ? '确认新增' : '保存修改'}
                </button>
              </div>
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
      <p className={cn('mt-1 font-mono text-xl font-semibold', accent)}>{value}</p>
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
      <span className="text-xs text-muted-foreground">{label}</span>
      {children ?? <p className="mt-0.5 text-sm text-white">{value}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
