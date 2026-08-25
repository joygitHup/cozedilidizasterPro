'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  Download,
  Pencil,
  Trash2,
  Loader2,
  X,
  Power,
  FlaskConical,
  Star,
  PlayCircle,
} from 'lucide-react';
import type {
  WarningModelConfig,
  WarningModelPayload,
  WarningModelStats,
  WarningModelTestResult,
  WarningModelType,
} from '@/types';
import {
  activateWarningModel,
  createWarningModel,
  deactivateWarningModel,
  deleteWarningModel,
  exportWarningModels,
  getMonitoringDevices,
  getWarningModel,
  getWarningModelNextCode,
  getWarningModelStats,
  getWarningModels,
  loopDemoWarningModel,
  testWarningModel,
  updateWarningModel,
} from '@/lib/services';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { canWriteModule } from '@/lib/permissions';

const TYPE_LABELS: Record<WarningModelType, string> = {
  threshold: '阈值模型',
  trend: '趋势模型',
  ml: '机器学习',
  fusion: '融合模型',
};

const INPUT_CLS =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500';

type FormState = {
  code: string;
  name: string;
  model_type: WarningModelType;
  description: string;
  yellow_threshold: string;
  orange_threshold: string;
  red_threshold: string;
  accuracy: string;
  params_json: string;
  is_active: boolean;
};

const emptyForm = (): FormState => ({
  code: '',
  name: '',
  model_type: 'threshold',
  description: '',
  yellow_threshold: '50',
  orange_threshold: '70',
  red_threshold: '85',
  accuracy: '',
  params_json: JSON.stringify(
    {
      force: { yellow: 50, orange: 70, red: 85, change_rate_red: 30 },
      rainfall: { yellow: 30, orange: 50, red: 80 },
      displacement: { yellow: 5, orange: 10, red: 20 },
      stress: { yellow: 40, orange: 60, red: 80 },
      strain: { yellow: 200, orange: 400, red: 600 },
      temperature: { yellow: 40, orange: 50, red: 60 },
    },
    null,
    2
  ),
  is_active: true,
});

/** 设备 → 推荐专用阈值模型（页面提示） */
const DEVICE_WARNING_PRESETS: {
  label: string;
  modelCode: string;
  dataType: string;
  sampleValue: string;
  device: string;
}[] = [
  { label: '雨量计', modelCode: 'THRESH-RAIN', dataType: 'rainfall', sampleValue: '65', device: 'RAIN-001' },
  { label: 'NPR锚索', modelCode: 'THRESH-NPR', dataType: 'force', sampleValue: '88', device: 'NPR-001' },
  { label: '光纤光栅', modelCode: 'THRESH-FIBER', dataType: 'strain', sampleValue: '450', device: 'FIB-001' },
  { label: 'GNSS', modelCode: 'THRESH-DISP', dataType: 'displacement', sampleValue: '12', device: 'GNSS-001' },
  { label: '倾角仪', modelCode: 'THRESH-DISP', dataType: 'displacement', sampleValue: '9', device: 'INC-001' },
  { label: '摄像头', modelCode: 'THRESH-TEMP', dataType: 'temperature', sampleValue: '48', device: 'CAM-001' },
];

function modelToForm(m: WarningModelConfig): FormState {
  const params = { ...m.params };
  const accuracy =
    params.accuracy != null ? String(params.accuracy) : m.accuracy != null ? String(m.accuracy) : '';
  delete params.accuracy;
  return {
    code: m.code,
    name: m.name,
    model_type: m.modelType,
    description: m.description,
    yellow_threshold: String(m.yellowThreshold),
    orange_threshold: String(m.orangeThreshold),
    red_threshold: String(m.redThreshold),
    accuracy,
    params_json: JSON.stringify(params, null, 2),
    is_active: m.isActive,
  };
}

function formToPayload(form: FormState): WarningModelPayload {
  let params: Record<string, unknown> = {};
  try {
    params = JSON.parse(form.params_json || '{}');
  } catch {
    throw new Error('参数 JSON 格式无效');
  }
  if (form.accuracy.trim() !== '') {
    params.accuracy = Number(form.accuracy);
  }
  const payload: WarningModelPayload = {
    name: form.name.trim(),
    model_type: form.model_type,
    description: form.description.trim(),
    params,
    yellow_threshold: Number(form.yellow_threshold),
    orange_threshold: Number(form.orange_threshold),
    red_threshold: Number(form.red_threshold),
    is_active: form.is_active,
  };
  if (form.code.trim()) payload.code = form.code.trim().toUpperCase();
  return payload;
}

export default function WarningModelsPage() {
  const [list, setList] = useState<WarningModelConfig[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<WarningModelStats | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<WarningModelConfig | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [testType, setTestType] = useState('force');
  const [testValue, setTestValue] = useState('72');
  const [testDeviceId, setTestDeviceId] = useState<number | ''>('');
  const [devices, setDevices] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [testResult, setTestResult] = useState<WarningModelTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [looping, setLooping] = useState(false);
  const [loopResult, setLoopResult] = useState<{
    message: string;
    warning_id?: number | null;
    warning_code?: string | null;
    trace_id?: string;
    model_code?: string;
  } | null>(null);
  const del = useConfirmDelete<WarningModelConfig>();
  const canWrite = canWriteModule('warning');

  useEffect(() => {
    void getMonitoringDevices({ pageSize: 100 })
      .then((res) => {
        const rows = res.list.map((d) => ({
          id: Number(d.dbId ?? d.id),
          code: String(d.id),
          name: d.name,
        }));
        setDevices(rows);
        if (rows[0]) setTestDeviceId(rows[0].id);
      })
      .catch(() => setDevices([]));
  }, []);

  const loadStats = useCallback(async () => {
    try {
      setStats(await getWarningModelStats());
    } catch {
      setStats(null);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getWarningModels({
        page: 1,
        pageSize: 100,
        search,
        modelType: typeFilter || undefined,
        isActive:
          activeFilter === '1' ? true : activeFilter === '0' ? false : undefined,
      });
      setList(res.list);
      setTotal(res.total);
      setSelected((prev) => {
        if (!res.list.length) return null;
        if (prev && res.list.some((m) => m.id === prev.id)) {
          return res.list.find((m) => m.id === prev.id) || res.list[0];
        }
        return res.list[0];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, activeFilter]);

  useEffect(() => {
    loadList();
    loadStats();
  }, [loadList, loadStats]);

  const openCreate = async () => {
    const f = emptyForm();
    try {
      f.code = await getWarningModelNextCode(f.model_type);
    } catch {
      /* ignore */
    }
    setForm(f);
    setFormError('');
    setModalMode('create');
  };

  const openEdit = async (m: WarningModelConfig) => {
    try {
      const detail = await getWarningModel(m.id);
      setForm(modelToForm(detail));
      setSelected(detail);
    } catch {
      setForm(modelToForm(m));
    }
    setFormError('');
    setModalMode('edit');
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError('请填写模型名称');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = formToPayload(form);
      if (modalMode === 'create') {
        const created = await createWarningModel(payload);
        setModalMode(null);
        await loadList();
        await loadStats();
        setSelected(created);
      } else if (modalMode === 'edit' && selected) {
        const updated = await updateWarningModel(selected.id, payload);
        setModalMode(null);
        setSelected(updated);
        await loadList();
        await loadStats();
      }
      setTestResult(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () =>
    del.confirm(async (m) => {
      await deleteWarningModel(m.id);
      if (selected?.id === m.id) {
        setSelected(null);
        setTestResult(null);
      }
      await loadList();
      await loadStats();
    });

  const handleToggle = async (m: WarningModelConfig) => {
    try {
      if (m.isActive) {
        await deactivateWarningModel(m.id);
      } else {
        const exclusive = m.modelType === 'threshold';
        if (
          exclusive &&
          !window.confirm(
            '启用该阈值模型将停用其他阈值模型，确保监测引擎只采用一套阈值。是否继续？'
          )
        ) {
          return;
        }
        await activateWarningModel(m.id, exclusive);
      }
      await loadList();
      await loadStats();
      if (selected?.id === m.id) {
        setSelected(await getWarningModel(m.id));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '状态变更失败');
    }
  };

  const handleTest = async () => {
    if (!selected) return;
    const needsDevice = ['trend', 'ml', 'fusion'].includes(selected.modelType);
    if (needsDevice && !testDeviceId) {
      alert('趋势 / ML / 融合试算需要选择监测设备（读取历史样本）');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testWarningModel(
        selected.id,
        testType,
        Number(testValue),
        {
          deviceId: testDeviceId === '' ? undefined : Number(testDeviceId),
        }
      );
      setTestResult(result);
    } catch (e) {
      alert(e instanceof Error ? e.message : '试算失败');
    } finally {
      setTesting(false);
    }
  };

  const handleLoopDemo = async () => {
    if (!selected) return;
    if (!canWrite) {
      alert('当前角色无写权限');
      return;
    }
    if (selected.modelType !== 'threshold') {
      alert('闭环建单演示仅支持阈值模型；趋势/ML/融合请用上方「试算」验证推理，实际上报时规则引擎会自动并联研判');
      return;
    }
    if (
      !window.confirm(
        `将独占启用「${selected.code}」，并模拟设备上报超阈值数据建预警单。是否继续？`
      )
    ) {
      return;
    }
    setLooping(true);
    setLoopResult(null);
    try {
      const preset = DEVICE_WARNING_PRESETS.find((p) => p.modelCode === selected.code);
      const result = await loopDemoWarningModel(
        selected.id,
        preset
          ? {
              device_code: preset.device,
              data_type: preset.dataType,
              value: Number(preset.sampleValue),
            }
          : undefined
      );
      setLoopResult({
        message: result.message,
        warning_id: result.warning_id,
        warning_code: result.warning_code,
        trace_id: result.trace_id,
        model_code: result.model_code,
      });
      await loadList();
      await loadStats();
      setSelected(await getWarningModel(selected.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : '闭环联调失败');
    } finally {
      setLooping(false);
    }
  };

  const onTypeChangeCreate = async (modelType: WarningModelType) => {
    setForm((prev) => ({ ...prev, model_type: modelType }));
    if (modalMode === 'create') {
      try {
        const code = await getWarningModelNextCode(modelType);
        setForm((prev) => ({ ...prev, model_type: modelType, code }));
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader>
          {canWrite && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700"
          >
            <Plus className="h-4 w-4" /> 新增模型
          </button>
          )}
          <button
            onClick={() =>
              exportWarningModels({
                modelType: typeFilter || undefined,
                search: search || undefined,
              }).catch((e) => alert(e instanceof Error ? e.message : '导出失败'))
            }
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
          >
            <Download className="h-4 w-4" /> 导出
          </button>
      </PageHeader>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="模型总数" value={stats.total} />
          <StatCard label="已启用" value={stats.active} accent="text-green-400" />
          <StatCard label="已停用" value={stats.inactive} accent="text-muted-foreground" />
          <StatCard
            label="引擎主阈值模型"
            value={
              list.find((m) => m.id === stats.primary_threshold_id)?.code || '—'
            }
            accent="text-cyan-400"
            text
          />
        </div>
      )}

      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
        <h3 className="mb-2 text-sm font-medium text-cyan-300">设备 × 专用阈值模型（标准报文联调）</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          通用标准格式：device_code + data_type + value。启用专用模型请点列表「启用并切换」(exclusive)。
          MQTT.fx 完整示例见 services/mqtt_bridge/MQTT_FX.txt
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DEVICE_WARNING_PRESETS.map((p) => {
            const m = list.find((x) => x.code === p.modelCode);
            return (
              <button
                key={`${p.device}-${p.modelCode}`}
                type="button"
                onClick={() => {
                  setTestType(p.dataType);
                  setTestValue(p.sampleValue);
                  if (m) setSelected(m);
                  const row = list.find((x) => x.code === p.modelCode);
                  if (row) {
                    setSearch(row.code);
                  }
                }}
                className="rounded-md border border-border bg-card/80 px-3 py-2 text-left text-xs hover:border-cyan-500/50"
              >
                <div className="font-medium text-foreground">
                  {p.label} · {p.device}
                </div>
                <div className="mt-0.5 text-muted-foreground">
                  {p.modelCode} · {p.dataType}={p.sampleValue}
                  {m ? (m.isActive ? ' · 已启用' : ' · 未启用') : ' · 待初始化'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">筛选条件</h3>
          <button
            onClick={() => {
              setSearch('');
              setTypeFilter('');
              setActiveFilter('');
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
                onKeyDown={(e) => e.key === 'Enter' && loadList()}
                placeholder="编号 / 名称 / 描述"
                className={cn(INPUT_CLS, 'pl-9')}
              />
            </div>
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-xs text-muted-foreground">类型</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
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
            <label className="mb-1.5 block text-xs text-muted-foreground">启用状态</label>
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className={INPUT_CLS}
            >
              <option value="">全部</option>
              <option value="1">启用</option>
              <option value="0">停用</option>
            </select>
          </div>
          <div className="flex items-end lg:col-span-3">
            <button
              onClick={loadList}
              className="h-9 w-full rounded-lg bg-cyan-600 px-4 text-sm font-medium text-white hover:bg-cyan-700"
            >
              查询
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">编号</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">名称</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">类型</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">触发阈值</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">准确率</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-cyan-400" />
                  </td>
                </tr>
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    暂无模型，点击「新增模型」
                  </td>
                </tr>
              ) : (
                list.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => {
                      setSelected(m);
                      setTestResult(null);
                    }}
                    className={cn(
                      'cursor-pointer border-b border-border last:border-0 hover:bg-muted/30',
                      selected?.id === m.id && 'bg-cyan-500/5'
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-cyan-400">
                      <span className="inline-flex items-center gap-1">
                        {m.code}
                        {m.isPrimary && (
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-label="引擎主模型" />
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white">{m.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {m.modelTypeDisplay || TYPE_LABELS[m.modelType]}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-white">
                      {m.thresholdSummary ||
                        `黄${m.yellowThreshold}/橙${m.orangeThreshold}/红${m.redThreshold}`}
                    </td>
                    <td className="px-4 py-3 font-mono text-cyan-400">
                      {m.accuracy != null ? `${m.accuracy}%` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded px-2 py-0.5 text-xs font-medium',
                          m.isActive
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        )}
                      >
                        {m.isActive ? '启用' : '停用'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEdit(m)}
                          className="text-muted-foreground hover:text-white"
                          title="配置"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggle(m)}
                          className="text-muted-foreground hover:text-cyan-400"
                          title={m.isActive ? '停用' : '启用'}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => del.open(m)}
                          className="text-muted-foreground hover:text-red-400"
                          title="删除"
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
          <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            共 {total} 个模型 · 阈值模型启用后将被监测预警引擎采用
          </div>
        </div>

        {/* 详情 + 试算 */}
        <div className="space-y-4">
          {selected ? (
            <>
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{selected.name}</h3>
                    <p className="font-mono text-xs text-cyan-400">{selected.code}</p>
                  </div>
                  {selected.isPrimary && (
                    <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-400">
                      引擎主模型
                    </span>
                  )}
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  {selected.description || '暂无描述'}
                </p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded bg-yellow-500/10 p-2">
                    <p className="text-muted-foreground">黄</p>
                    <p className="font-mono text-yellow-400">{selected.yellowThreshold}</p>
                  </div>
                  <div className="rounded bg-orange-500/10 p-2">
                    <p className="text-muted-foreground">橙</p>
                    <p className="font-mono text-orange-400">{selected.orangeThreshold}</p>
                  </div>
                  <div className="rounded bg-red-500/10 p-2">
                    <p className="text-muted-foreground">红</p>
                    <p className="font-mono text-red-400">{selected.redThreshold}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => openEdit(selected)}
                    className="flex-1 rounded-lg border border-border py-2 text-xs hover:bg-accent"
                  >
                    编辑配置
                  </button>
                  <button
                    onClick={() => handleToggle(selected)}
                    className={cn(
                      'flex-1 rounded-lg py-2 text-xs text-white',
                      selected.isActive
                        ? 'bg-yellow-600 hover:bg-yellow-700'
                        : 'bg-green-600 hover:bg-green-700'
                    )}
                  >
                    {selected.isActive ? '停用' : '启用并切换'}
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <h4 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-white">
                  <FlaskConical className="h-4 w-4 text-cyan-400" />
                  {selected.modelType === 'threshold'
                    ? '阈值试算（不落库）'
                    : `${TYPE_LABELS[selected.modelType]}试算（不落库）`}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={testType}
                    onChange={(e) => setTestType(e.target.value)}
                    className={INPUT_CLS}
                  >
                    <option value="force">牛顿力</option>
                    <option value="rainfall">降雨</option>
                    <option value="displacement">位移</option>
                    <option value="stress">应力</option>
                    <option value="strain">应变</option>
                    <option value="temperature">温度</option>
                  </select>
                  <input
                    value={testValue}
                    onChange={(e) => setTestValue(e.target.value)}
                    className={INPUT_CLS}
                    placeholder="监测值"
                  />
                </div>
                {['trend', 'ml', 'fusion'].includes(selected.modelType) && (
                  <select
                    value={testDeviceId}
                    onChange={(e) =>
                      setTestDeviceId(e.target.value ? Number(e.target.value) : '')
                    }
                    className={cn(INPUT_CLS, 'mt-2')}
                  >
                    <option value="">选择设备（读历史样本）</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} · {d.name}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-cyan-600 text-sm text-white hover:bg-cyan-700 disabled:opacity-60"
                >
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  试算推理（不落库）
                </button>
                <button
                  onClick={handleLoopDemo}
                  disabled={looping || selected.modelType !== 'threshold' || !canWrite}
                  className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-500/10 text-sm text-orange-100 hover:bg-orange-500/20 disabled:opacity-60"
                >
                  {looping ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlayCircle className="h-4 w-4" />
                  )}
                  跑通闭环（启用→上报→建单）
                </button>
                {testResult && (
                  <div
                    className={cn(
                      'mt-3 rounded-lg border px-3 py-2 text-xs',
                      testResult.triggered
                        ? 'border-orange-500/40 bg-orange-500/10 text-orange-200'
                        : 'border-border bg-muted/40 text-muted-foreground'
                    )}
                  >
                    <p className="font-medium text-white">
                      {testResult.message ||
                        testResult.reason ||
                        (testResult.triggered
                          ? `触发 ${testResult.level || ''}（${testResult.engine || selected.modelType}）`
                          : '未触发')}
                    </p>
                    {testResult.thresholds && (
                      <p className="mt-1">
                        阈值 黄{testResult.thresholds.yellow} / 橙
                        {testResult.thresholds.orange} / 红{testResult.thresholds.red}
                      </p>
                    )}
                    {(testResult.slope != null ||
                      testResult.z_score != null ||
                      testResult.score != null) && (
                      <p className="mt-1 text-cyan-300">
                        {testResult.slope != null && `斜率 ${testResult.slope} `}
                        {testResult.delta != null && `Δ ${testResult.delta} `}
                        {testResult.z_score != null && `z=${testResult.z_score} `}
                        {testResult.score != null && `融合分 ${testResult.score} `}
                        {testResult.sample_size != null && `样本 ${testResult.sample_size}`}
                      </p>
                    )}
                    {!testResult.engine_primary && selected.modelType === 'threshold' && (
                      <p className="mt-1 text-amber-300">
                        提示：当前模型不是引擎主模型，实际上报仍使用已启用的主阈值模型；可点「启用并切换」或直接「跑通闭环」。
                      </p>
                    )}
                  </div>
                )}
                {loopResult && (
                  <div className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
                    <p className="font-medium text-white">{loopResult.message}</p>
                    {loopResult.trace_id && (
                      <p className="mt-1 text-muted-foreground">trace: {loopResult.trace_id}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link
                        href="/warning/current"
                        className="rounded bg-cyan-600 px-2 py-1 text-white hover:bg-cyan-700"
                      >
                        去实时预警处置 →
                      </Link>
                      {loopResult.warning_code && (
                        <span className="rounded border border-border px-2 py-1 text-muted-foreground">
                          {loopResult.warning_code}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  监测上报时规则引擎会并联阈值 + 已启用的趋势/ML/融合模型。阈值闭环演示仅阈值模型可用；高级模型请用试算验证。
                </p>
              </div>
            </>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
              选择左侧模型查看详情
            </div>
          )}
        </div>
      </div>

      <ConfirmDeleteDialog
        open={!!del.target}
        title="确认删除预警模型？"
        name={del.target?.name}
        code={del.target?.code}
        error={del.error}
        loading={del.loading}
        onCancel={del.close}
        onConfirm={confirmDelete}
      />

      {/* 编辑弹窗 */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => !saving && setModalMode(null)}
          />
          <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {modalMode === 'create' ? '新增预警模型' : '编辑预警模型'}
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
              <Field label="模型编号">
                <input
                  className={INPUT_CLS}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="可空自动生成"
                />
              </Field>
              <Field label="模型类型">
                <select
                  className={INPUT_CLS}
                  value={form.model_type}
                  onChange={(e) => onTypeChangeCreate(e.target.value as WarningModelType)}
                  disabled={modalMode === 'edit'}
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="模型名称" className="col-span-2">
                <input
                  className={INPUT_CLS}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="黄色阈值">
                <input
                  className={INPUT_CLS}
                  value={form.yellow_threshold}
                  onChange={(e) => setForm({ ...form, yellow_threshold: e.target.value })}
                />
              </Field>
              <Field label="橙色阈值">
                <input
                  className={INPUT_CLS}
                  value={form.orange_threshold}
                  onChange={(e) => setForm({ ...form, orange_threshold: e.target.value })}
                />
              </Field>
              <Field label="红色阈值">
                <input
                  className={INPUT_CLS}
                  value={form.red_threshold}
                  onChange={(e) => setForm({ ...form, red_threshold: e.target.value })}
                />
              </Field>
              <Field label="准确率(%)">
                <input
                  className={INPUT_CLS}
                  value={form.accuracy}
                  onChange={(e) => setForm({ ...form, accuracy: e.target.value })}
                  placeholder="可选"
                />
              </Field>
              <Field label="描述" className="col-span-2">
                <textarea
                  className={cn(INPUT_CLS, 'h-20 py-2')}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
              <Field label="分类型参数 JSON" className="col-span-2">
                <textarea
                  className={cn(INPUT_CLS, 'h-40 py-2 font-mono text-xs')}
                  value={form.params_json}
                  onChange={(e) => setForm({ ...form, params_json: e.target.value })}
                />
              </Field>
              <label className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="accent-cyan-500"
                />
                保存后启用
              </label>
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
  text,
}: {
  label: string;
  value: number | string;
  accent?: string;
  text?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-bold', text ? 'truncate font-mono text-sm' : 'font-mono text-xl', accent)}>
        {value}
      </p>
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
