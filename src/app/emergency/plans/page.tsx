'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Download,
  Pencil,
  Trash2,
  Loader2,
  X,
  Power,
  Archive,
  Copy,
  Rocket,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type {
  EmergencyPlan,
  EmergencyPlanPayload,
  EmergencyPlanRelated,
  EmergencyPlanStats,
  PlanColorLevel,
  PlanResponseLevel,
  PlanStep,
  PlanStatus,
} from '@/types';
import {
  activateEmergencyPlan,
  archiveEmergencyPlan,
  createEmergencyPlan,
  deleteEmergencyPlan,
  exportEmergencyPlans,
  getEmergencyPlan,
  getEmergencyPlanNextCode,
  getEmergencyPlanRelated,
  getEmergencyPlanStats,
  getEmergencyPlans,
  launchEmergencyPlan,
  reviseEmergencyPlan,
  updateEmergencyPlan,
} from '@/lib/services';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';

const COLOR_STYLES: Record<PlanColorLevel, { color: string; bg: string; label: string }> = {
  red: { color: 'text-red-400', bg: 'bg-red-500/20', label: '红色/一级' },
  orange: { color: 'text-orange-400', bg: 'bg-orange-500/20', label: '橙色/二级' },
  yellow: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: '黄色/三级' },
  blue: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: '蓝色/四级' },
};

const STATUS_STYLES: Record<PlanStatus, { color: string; bg: string; label: string }> = {
  draft: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: '修订中' },
  active: { color: 'text-green-400', bg: 'bg-green-500/20', label: '有效' },
  archived: { color: 'text-muted-foreground', bg: 'bg-muted/40', label: '已归档' },
};

const LEVEL_OPTIONS: { value: PlanResponseLevel; color: PlanColorLevel; label: string }[] = [
  { value: '1', color: 'red', label: '一级（红）' },
  { value: '2', color: 'orange', label: '二级（橙）' },
  { value: '3', color: 'yellow', label: '三级（黄）' },
  { value: '4', color: 'blue', label: '四级（蓝）' },
];

const INPUT_CLS =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500';

type FormState = {
  code: string;
  name: string;
  level: PlanResponseLevel;
  status: PlanStatus;
  description: string;
  target: string;
  commander: string;
  commander_phone: string;
  steps_text: string;
  shelter: string;
};

const emptyForm = (): FormState => ({
  code: '',
  name: '',
  level: '2',
  status: 'draft',
  description: '',
  target: '',
  commander: '',
  commander_phone: '',
  steps_text: [
    '1. 接警确认 — 值班员确认预警信息',
    '2. 启动响应 — 按等级启动应急响应',
    '3. 转移安置 — 组织危险区人员转移',
    '4. 复盘闭环 — 险情解除后评估归档',
  ].join('\n'),
  shelter: '',
});

function parseSteps(text: string): PlanStep[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      const cleaned = line.replace(/^\d+[\.、]\s*/, '');
      const [title, ...rest] = cleaned.split(/[—\-–]/);
      return {
        order: i + 1,
        title: (title || cleaned).trim(),
        desc: rest.join('—').trim(),
      };
    });
}

function stepsToText(steps?: PlanStep[]) {
  if (!steps?.length) return '';
  return steps
    .map((s) => `${s.order}. ${s.title}${s.desc ? ` — ${s.desc}` : ''}`)
    .join('\n');
}

function planToForm(p: EmergencyPlan): FormState {
  return {
    code: p.code,
    name: p.name,
    level: p.level,
    status: p.status,
    description: p.description,
    target: p.applicableScenarios.join('、') || p.targetScope,
    commander: p.commander,
    commander_phone: p.commanderPhone,
    steps_text: stepsToText(p.content?.steps),
    shelter: String(p.content?.default_shelter || ''),
  };
}

function formToPayload(form: FormState): EmergencyPlanPayload {
  const scenarios = form.target
    .replace(/,/g, '、')
    .split('、')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    code: form.code.trim() || undefined,
    name: form.name.trim(),
    level: form.level,
    status: form.status,
    description: form.description.trim(),
    applicable_scenarios: scenarios,
    commander: form.commander.trim(),
    commander_phone: form.commander_phone.trim(),
    content: {
      steps: parseSteps(form.steps_text),
      default_shelter: form.shelter.trim(),
      resources: [],
    },
  };
}

function formatTime(v?: string) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return v;
  }
}

export default function PlansPage() {
  const [list, setList] = useState<EmergencyPlan[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<EmergencyPlanStats | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [selected, setSelected] = useState<EmergencyPlan | null>(null);
  const [related, setRelated] = useState<EmergencyPlanRelated | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [acting, setActing] = useState('');
  const del = useConfirmDelete<EmergencyPlan>();

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadStats = useCallback(async () => {
    try {
      setStats(await getEmergencyPlanStats());
    } catch {
      setStats(null);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getEmergencyPlans({
        page,
        pageSize,
        search,
        status: statusFilter || undefined,
        colorLevel: colorFilter || undefined,
      });
      setList(res.list);
      setTotal(res.total);
      setSelected((prev) => {
        if (!res.list.length) return null;
        if (prev && res.list.some((p) => p.id === prev.id)) {
          return res.list.find((p) => p.id === prev.id) || res.list[0];
        }
        return res.list[0];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, colorFilter]);

  const loadDetail = useCallback(async (plan: EmergencyPlan) => {
    try {
      const [detail, rel] = await Promise.all([
        getEmergencyPlan(plan.id),
        getEmergencyPlanRelated(plan.id),
      ]);
      setSelected(detail);
      setRelated(rel);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载详情失败');
    }
  }, []);

  useEffect(() => {
    loadList();
    loadStats();
  }, [loadList, loadStats]);

  useEffect(() => {
    if (selected) loadDetail(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const openCreate = async () => {
    const f = emptyForm();
    try {
      f.code = await getEmergencyPlanNextCode();
    } catch {
      /* ignore */
    }
    setForm(f);
    setFormError('');
    setModalMode('create');
  };

  const openEdit = async (plan: EmergencyPlan) => {
    try {
      setForm(planToForm(await getEmergencyPlan(plan.id)));
    } catch {
      setForm(planToForm(plan));
    }
    setFormError('');
    setModalMode('edit');
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError('请填写预案名称');
      return;
    }
    if (!parseSteps(form.steps_text).length) {
      setFormError('请至少配置一条处置步骤');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = formToPayload(form);
      if (modalMode === 'create') {
        const created = await createEmergencyPlan(payload);
        setModalMode(null);
        await loadList();
        await loadStats();
        setSelected(created);
      } else if (modalMode === 'edit' && selected) {
        const updated = await updateEmergencyPlan(selected.id, payload);
        setModalMode(null);
        setSelected(updated);
        await loadList();
        await loadStats();
        setRelated(await getEmergencyPlanRelated(updated.id));
      }
      setMsg('预案已保存');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    if (!selected) return;
    setActing(key);
    setMsg('');
    try {
      await fn();
      setMsg(ok);
      await loadList();
      await loadStats();
      const detail = await getEmergencyPlan(selected.id);
      setSelected(detail);
      setRelated(await getEmergencyPlanRelated(detail.id));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '操作失败');
    } finally {
      setActing('');
    }
  };

  const confirmDelete = () =>
    del.confirm(async (plan) => {
      await deleteEmergencyPlan(plan.id);
      if (selected?.id === plan.id) {
        setSelected(null);
        setRelated(null);
      }
      await loadList();
      await loadStats();
    });

  const handleLaunch = async (warningId: number) => {
    if (!selected) return;
    if (
      !window.confirm(
        '确认启动该预案？将推进预警进入处置，并自动创建转移任务（若尚无进行中任务）。'
      )
    ) {
      return;
    }
    setActing('launch');
    setMsg('');
    try {
      const result = await launchEmergencyPlan(selected.id, warningId, true);
      setMsg(
        `${result.message}${
          result.evacuation ? ` · 转移任务 ${result.evacuation.code}` : ''
        }`
      );
      setRelated(await getEmergencyPlanRelated(selected.id));
      await loadStats();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '启动失败');
    } finally {
      setActing('');
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700"
          >
            <Plus className="h-4 w-4" /> 新增预案
          </button>
          <button
            onClick={() =>
              exportEmergencyPlans({
                status: statusFilter || undefined,
                colorLevel: colorFilter || undefined,
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
          <StatCard label="预案总数" value={stats.total} />
          <StatCard label="有效" value={stats.active} accent="text-green-400" />
          <StatCard label="修订中" value={stats.draft} accent="text-yellow-400" />
          <StatCard label="已归档" value={stats.archived} accent="text-muted-foreground" />
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">筛选条件</h3>
          <button
            onClick={() => {
              setSearch('');
              setStatusFilter('');
              setColorFilter('');
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
                onKeyDown={(e) => e.key === 'Enter' && (setPage(1), loadList())}
                placeholder="编号 / 名称 / 指挥人"
                className={cn(INPUT_CLS, 'pl-9')}
              />
            </div>
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-xs text-muted-foreground">响应等级</label>
            <select
              value={colorFilter}
              onChange={(e) => {
                setColorFilter(e.target.value);
                setPage(1);
              }}
              className={INPUT_CLS}
            >
              <option value="">全部</option>
              <option value="red">红色/一级</option>
              <option value="orange">橙色/二级</option>
              <option value="yellow">黄色/三级</option>
              <option value="blue">蓝色/四级</option>
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-xs text-muted-foreground">状态</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className={INPUT_CLS}
            >
              <option value="">全部</option>
              <option value="active">有效</option>
              <option value="draft">修订中</option>
              <option value="archived">已归档</option>
            </select>
          </div>
          <div className="flex items-end lg:col-span-3">
            <button
              onClick={() => {
                setPage(1);
                loadList();
              }}
              className="h-9 w-full rounded-lg bg-cyan-600 text-sm font-medium text-white hover:bg-cyan-700"
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
      {msg && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300">
          {msg}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">预案编号</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">预案名称</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">响应等级</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">适用对象</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">更新日期</th>
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
                      暂无预案，点击「新增预案」
                    </td>
                  </tr>
                ) : (
                  list.map((p) => {
                    const lc = COLOR_STYLES[p.colorLevel];
                    const sc = STATUS_STYLES[p.status];
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelected(p)}
                        className={cn(
                          'cursor-pointer border-b border-border last:border-0 hover:bg-muted/30',
                          selected?.id === p.id && 'bg-cyan-500/5'
                        )}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-cyan-400">{p.code}</td>
                        <td className="px-4 py-3 text-white">{p.name}</td>
                        <td className="px-4 py-3">
                          <span className={cn('rounded px-2 py-0.5 text-xs font-medium', lc.bg, lc.color)}>
                            {lc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.targetScope || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {formatTime(p.updatedAt).slice(0, 10)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('rounded px-2 py-0.5 text-xs font-medium', sc.bg, sc.color)}>
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => {
                                setSelected(p);
                              }}
                              className="text-xs text-cyan-400 hover:underline"
                            >
                              查看
                            </button>
                            <button
                              onClick={() => openEdit(p)}
                              className="text-muted-foreground hover:text-white"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => del.open(p)}
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
        </div>

        {/* 详情 */}
        <div className="space-y-4">
          {selected ? (
            <>
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{selected.name}</h3>
                    <p className="font-mono text-xs text-cyan-400">{selected.code}</p>
                  </div>
                  <span
                    className={cn(
                      'rounded px-2 py-0.5 text-xs font-medium',
                      STATUS_STYLES[selected.status].bg,
                      STATUS_STYLES[selected.status].color
                    )}
                  >
                    {STATUS_STYLES[selected.status].label}
                  </span>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  {selected.description || '暂无描述'}
                </p>
                <div className="space-y-2 text-sm">
                  <Row
                    label="响应等级"
                    value={COLOR_STYLES[selected.colorLevel].label}
                    valueClass={COLOR_STYLES[selected.colorLevel].color}
                  />
                  <Row label="适用对象" value={selected.targetScope || '—'} />
                  <Row
                    label="指挥人"
                    value={
                      selected.commander
                        ? `${selected.commander}${
                            selected.commanderPhone ? `(${selected.commanderPhone})` : ''
                          }`
                        : '—'
                    }
                  />
                  <Row label="步骤数" value={String(selected.stepCount)} />
                  <Row label="更新" value={formatTime(selected.updatedAt)} />
                </div>

                <div className="mt-3 space-y-1.5">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">处置步骤</p>
                  {(selected.content?.steps || []).map((s) => (
                    <div
                      key={s.order}
                      className="rounded border border-border/60 bg-muted/30 px-2 py-1.5 text-xs"
                    >
                      <span className="font-mono text-cyan-400">{s.order}.</span>{' '}
                      <span className="text-white">{s.title}</span>
                      {s.desc ? (
                        <span className="text-muted-foreground"> — {s.desc}</span>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {selected.status !== 'active' && (
                    <button
                      disabled={!!acting}
                      onClick={() =>
                        runAction(
                          'activate',
                          () => activateEmergencyPlan(selected.id),
                          '预案已生效'
                        )
                      }
                      className="flex items-center justify-center gap-1 rounded-lg bg-green-600 py-2 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {acting === 'activate' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Power className="h-3.5 w-3.5" />
                      )}
                      生效
                    </button>
                  )}
                  {selected.status !== 'archived' && (
                    <button
                      disabled={!!acting}
                      onClick={() =>
                        runAction(
                          'archive',
                          () => archiveEmergencyPlan(selected.id),
                          '预案已归档'
                        )
                      }
                      className="flex items-center justify-center gap-1 rounded-lg border border-border py-2 text-xs hover:bg-accent disabled:opacity-50"
                    >
                      <Archive className="h-3.5 w-3.5" /> 归档
                    </button>
                  )}
                  <button
                    disabled={!!acting}
                    onClick={async () => {
                      setActing('revise');
                      try {
                        const draft = await reviseEmergencyPlan(selected.id);
                        setMsg(`已生成修订草案 ${draft.code}`);
                        await loadList();
                        await loadStats();
                        setSelected(draft);
                      } catch (e) {
                        setMsg(e instanceof Error ? e.message : '修订失败');
                      } finally {
                        setActing('');
                      }
                    }}
                    className="flex items-center justify-center gap-1 rounded-lg border border-border py-2 text-xs hover:bg-accent disabled:opacity-50"
                  >
                    <Copy className="h-3.5 w-3.5" /> 修订副本
                  </button>
                  <button
                    onClick={() => openEdit(selected)}
                    className="flex items-center justify-center gap-1 rounded-lg border border-border py-2 text-xs hover:bg-accent"
                  >
                    <Pencil className="h-3.5 w-3.5" /> 编辑
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-white">
                  <Rocket className="h-4 w-4 text-cyan-400" />
                  匹配未闭环预警 · 启动响应
                </h4>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  闭环：预警触发 → 匹配同色标生效预案 → 启动响应 → 预警进入处置并生成转移任务
                </p>
                {!related?.open_warnings?.length ? (
                  <p className="text-xs text-muted-foreground">
                    当前无同等级（{COLOR_STYLES[selected.colorLevel].label}）未闭环预警
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {related.open_warnings.map((w) => (
                      <li
                        key={w.id}
                        className="rounded border border-border/60 bg-muted/30 px-2 py-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-cyan-400">{w.code}</span>
                          <span className="text-muted-foreground">{w.status}</span>
                        </div>
                        <p className="mt-0.5 text-white">
                          {w.hazard_point__name}（{w.hazard_point__code}）
                        </p>
                        <button
                          disabled={selected.status !== 'active' || !!acting}
                          onClick={() => handleLaunch(w.id)}
                          className="mt-2 flex w-full items-center justify-center gap-1 rounded bg-orange-600 py-1.5 text-[11px] text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {acting === 'launch' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Rocket className="h-3 w-3" />
                          )}
                          启动本预案
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {related?.evacuations?.length ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="mb-1 text-xs text-muted-foreground">关联转移任务</p>
                    {related.evacuations.map((e) => (
                      <p key={e.id} className="text-xs text-white">
                        {e.code} · {e.status} · {e.transferred_people}/{e.total_people}人
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
              选择左侧预案查看详情
            </div>
          )}
        </div>
      </div>

      <ConfirmDeleteDialog
        open={!!del.target}
        title="确认删除应急预案？"
        name={del.target?.name}
        code={del.target?.code}
        error={del.error}
        loading={del.loading}
        onCancel={del.close}
        onConfirm={confirmDelete}
      />

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => !saving && setModalMode(null)}
          />
          <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {modalMode === 'create' ? '新增预案' : '编辑预案'}
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
              <Field label="预案编号">
                <input
                  className={INPUT_CLS}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </Field>
              <Field label="响应等级">
                <select
                  className={INPUT_CLS}
                  value={form.level}
                  onChange={(e) =>
                    setForm({ ...form, level: e.target.value as PlanResponseLevel })
                  }
                >
                  {LEVEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="预案名称" className="col-span-2">
                <input
                  className={INPUT_CLS}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="适用对象（顿号分隔）" className="col-span-2">
                <input
                  className={INPUT_CLS}
                  value={form.target}
                  onChange={(e) => setForm({ ...form, target: e.target.value })}
                  placeholder="如：竹园村、橙色预警"
                />
              </Field>
              <Field label="指挥人">
                <input
                  className={INPUT_CLS}
                  value={form.commander}
                  onChange={(e) => setForm({ ...form, commander: e.target.value })}
                />
              </Field>
              <Field label="联系电话">
                <input
                  className={INPUT_CLS}
                  value={form.commander_phone}
                  onChange={(e) => setForm({ ...form, commander_phone: e.target.value })}
                />
              </Field>
              <Field label="默认安置点" className="col-span-2">
                <input
                  className={INPUT_CLS}
                  value={form.shelter}
                  onChange={(e) => setForm({ ...form, shelter: e.target.value })}
                />
              </Field>
              <Field label="描述" className="col-span-2">
                <textarea
                  className={cn(INPUT_CLS, 'h-16 py-2')}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
              <Field label="处置步骤（每行一步：标题 — 说明）" className="col-span-2">
                <textarea
                  className={cn(INPUT_CLS, 'h-36 py-2 font-mono text-xs')}
                  value={form.steps_text}
                  onChange={(e) => setForm({ ...form, steps_text: e.target.value })}
                />
              </Field>
              {modalMode === 'create' && (
                <Field label="初始状态">
                  <select
                    className={INPUT_CLS}
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as PlanStatus })
                    }
                  >
                    <option value="draft">修订中/草稿</option>
                    <option value="active">直接生效</option>
                  </select>
                </Field>
              )}
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

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn('text-right text-white', valueClass)}>{value}</span>
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
