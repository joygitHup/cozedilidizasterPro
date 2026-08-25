'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Plus,
  Download,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
  Pencil,
  Trash2,
  Loader2,
} from 'lucide-react';
import type {
  HazardPoint,
  HazardPointPayload,
  HazardRelated,
  RegionTreeNode,
} from '@/types';
import {
  changeHazardStatus,
  createHazardPoint,
  createHazardRegion,
  deleteHazardPoint,
  deleteHazardRegion,
  exportHazardPoints,
  getHazardNextCode,
  getHazardPoint,
  getHazardPoints,
  getHazardRegions,
  getHazardRelated,
  updateHazardPoint,
} from '@/lib/services';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import {
  RegionCascadeFields,
  RegionFilterTree,
  type RegionSelection,
} from '@/components/hazard/region-tree';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';

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

const INPUT_CLS =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500';

type FormState = {
  code: string;
  name: string;
  type: HazardPoint['type'];
  level: HazardPoint['level'];
  status: HazardPoint['status'];
  address: string;
  city: string;
  district: string;
  village: string;
  town: string;
  county: string;
  longitude: string;
  latitude: string;
  volume: string;
  length: string;
  width: string;
  height: string;
  threat_people: string;
  threat_houses: string;
  threat_roads: string;
  threat_assets: string;
  stability_coefficient: string;
  responsible_person: string;
  contact_phone: string;
};

const emptyForm = (): FormState => ({
  code: '',
  name: '',
  type: 'landslide',
  level: 'yellow',
  status: 'stable',
  address: '',
  city: '示例市',
  district: '示例区',
  village: '',
  town: '示例区',
  county: 'XX县',
  longitude: '104.0668',
  latitude: '30.5728',
  volume: '',
  length: '',
  width: '',
  height: '',
  threat_people: '0',
  threat_houses: '0',
  threat_roads: '0',
  threat_assets: '0',
  stability_coefficient: '1.000',
  responsible_person: '',
  contact_phone: '',
});

function pointToForm(p: HazardPoint): FormState {
  return {
    code: p.code,
    name: p.name,
    type: p.type,
    level: p.level,
    status: p.status,
    address: p.location.address,
    city: p.location.city || '',
    district: p.location.district || p.location.town || '',
    village: p.location.village,
    town: p.location.district || p.location.town || '',
    county: p.location.county || '',
    longitude: String(p.location.lng),
    latitude: String(p.location.lat),
    volume: p.scale.volume ? String(p.scale.volume) : '',
    length: p.scale.length ? String(p.scale.length) : '',
    width: p.scale.width ? String(p.scale.width) : '',
    height: p.scale.height ? String(p.scale.height) : '',
    threat_people: String(p.threat.people || 0),
    threat_houses: String(p.threat.houses || 0),
    threat_roads: String(p.threat.roads || 0),
    threat_assets: String(p.threat.assets || 0),
    stability_coefficient: String(p.coefficient || 1),
    responsible_person: p.responsiblePerson,
    contact_phone: p.contactPhone,
  };
}

function formToPayload(form: FormState, includeCode: boolean): HazardPointPayload {
  const num = (v: string) => (v === '' || v == null ? null : Number(v));
  const payload: HazardPointPayload = {
    name: form.name.trim(),
    type: form.type,
    level: form.level,
    status: form.status,
    longitude: Number(form.longitude),
    latitude: Number(form.latitude),
    address: form.address.trim(),
    city: form.city.trim(),
    district: form.district.trim(),
    village: form.village.trim(),
    town: form.district.trim() || form.town.trim(),
    county: form.county.trim(),
    volume: num(form.volume),
    length: num(form.length),
    width: num(form.width),
    height: num(form.height),
    threat_people: Number(form.threat_people || 0),
    threat_houses: Number(form.threat_houses || 0),
    threat_roads: Number(form.threat_roads || 0),
    threat_assets: Number(form.threat_assets || 0),
    stability_coefficient: Number(form.stability_coefficient || 1),
    responsible_person: form.responsible_person.trim(),
    contact_phone: form.contact_phone.trim(),
  };
  if (includeCode && form.code.trim()) payload.code = form.code.trim().toUpperCase();
  return payload;
}

type RegionPath = { city: string; district: string; county: string; village: string };

/** 根据外侧筛选勾选，解析一条完整路径（优先最深勾选） */
function pathFromSelection(tree: RegionTreeNode[], sel: RegionSelection): RegionPath | null {
  for (const city of tree) {
    for (const dist of city.children) {
      // 村挂在县下
      for (const county of dist.children.filter((c) => c.level === 'county')) {
        for (const v of county.children.filter((x) => x.level === 'village')) {
          if (sel.villages.includes(v.name)) {
            return {
              city: city.name,
              district: dist.name,
              county: county.name,
              village: v.name,
            };
          }
        }
        if (sel.counties.includes(county.name)) {
          return {
            city: city.name,
            district: dist.name,
            county: county.name,
            village: '',
          };
        }
      }
      // 村直接挂区下
      for (const v of dist.children.filter((x) => x.level === 'village')) {
        if (sel.villages.includes(v.name)) {
          return {
            city: city.name,
            district: dist.name,
            county: '',
            village: v.name,
          };
        }
      }
      if (sel.districts.includes(dist.name)) {
        return { city: city.name, district: dist.name, county: '', village: '' };
      }
    }
    if (sel.cities.includes(city.name)) {
      return { city: city.name, district: '', county: '', village: '' };
    }
  }
  return null;
}

/** 树默认路径：首个市→区→（县可选） */
function defaultPathFromTree(tree: RegionTreeNode[]): RegionPath {
  const city = tree[0];
  const district = city?.children[0];
  const county = district?.children.find((c) => c.level === 'county');
  return {
    city: city?.name || '',
    district: district?.name || '',
    county: county?.name || '',
    village: '',
  };
}

/** 校验表单区域是否仍在树中，不存在则回退到合法父级 */
function clampPathToTree(tree: RegionTreeNode[], path: RegionPath): RegionPath {
  const city = tree.find((c) => c.name === path.city);
  if (!city) return defaultPathFromTree(tree);
  const district = city.children.find((d) => d.name === path.district);
  if (!district) {
    return { city: city.name, district: '', county: '', village: '' };
  }
  const county = path.county
    ? district.children.find((c) => c.level === 'county' && c.name === path.county)
    : undefined;
  if (path.county && !county) {
    // 县已删：保留区，村若仍挂区下则保留
    const villageOnDistrict = district.children.find(
      (v) => v.level === 'village' && v.name === path.village
    );
    return {
      city: city.name,
      district: district.name,
      county: '',
      village: villageOnDistrict?.name || '',
    };
  }
  if (path.village) {
    const ok = county
      ? county.children.some((v) => v.level === 'village' && v.name === path.village)
      : district.children.some((v) => v.level === 'village' && v.name === path.village);
    if (!ok) {
      return {
        city: city.name,
        district: district.name,
        county: county?.name || '',
        village: '',
      };
    }
  }
  return {
    city: city.name,
    district: district.name,
    county: county?.name || '',
    village: path.village || '',
  };
}

function applyPathToForm(form: FormState, path: RegionPath): FormState {
  return {
    ...form,
    city: path.city,
    district: path.district,
    county: path.county,
    village: path.village,
    town: path.district,
  };
}

export default function HazardPointsPage() {
  const [points, setPoints] = useState<HazardPoint[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [regionSel, setRegionSel] = useState<RegionSelection>({
    cities: [],
    districts: [],
    counties: [],
    villages: [],
  });
  const [regions, setRegions] = useState<RegionTreeNode[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPoint, setSelectedPoint] = useState<HazardPoint | null>(null);
  const [related, setRelated] = useState<HazardRelated | null>(null);

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const del = useConfirmDelete<HazardPoint>();
  const delRegion = useConfirmDelete<RegionTreeNode>();

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getHazardPoints({
        page,
        pageSize,
        search,
        level: levelFilter,
        status: statusFilter,
        cities: regionSel.cities,
        districts: regionSel.districts,
        counties: regionSel.counties,
        villages: regionSel.villages,
      });
      setPoints(res.list);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setPoints([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, levelFilter, statusFilter, regionSel]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const reloadRegions = useCallback(async () => {
    try {
      const tree = await getHazardRegions();
      setRegions(tree);
      return tree;
    } catch {
      setRegions([]);
      return [] as RegionTreeNode[];
    }
  }, []);

  useEffect(() => {
    void reloadRegions();
  }, [reloadRegions]);

  // 外侧区域树变更时，表单内市区县村与之同步校正
  useEffect(() => {
    if (!modalMode || regions.length === 0) return;
    setForm((f) => {
      const clamped = clampPathToTree(regions, {
        city: f.city,
        district: f.district,
        county: f.county,
        village: f.village,
      });
      if (
        clamped.city === f.city &&
        clamped.district === f.district &&
        clamped.county === f.county &&
        clamped.village === f.village
      ) {
        return f;
      }
      return applyPathToForm(f, clamped);
    });
  }, [regions, modalMode]);

  const openDetail = async (point: HazardPoint) => {
    setSelectedPoint(point);
    setRelated(null);
    try {
      const [detail, rel] = await Promise.all([
        getHazardPoint(point.id),
        getHazardRelated(point.id),
      ]);
      setSelectedPoint(detail);
      setRelated(rel);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载详情失败');
    }
  };

  const openCreate = async () => {
    const tree = await reloadRegions();
    const f = emptyForm();
    // 与外侧区域筛选同步：优先用勾选路径，否则用树默认路径
    const path =
      pathFromSelection(tree, regionSel) || defaultPathFromTree(tree);
    const withPath = applyPathToForm(f, path);
    try {
      withPath.code = await getHazardNextCode();
    } catch {
      /* 自动编号失败时留空，后端仍会生成 */
    }
    setForm(withPath);
    setFormError('');
    setModalMode('create');
  };

  const openEdit = async (point: HazardPoint) => {
    await reloadRegions();
    setForm(pointToForm(point));
    setFormError('');
    setModalMode('edit');
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError('请填写名称');
      return;
    }
    if (!form.longitude || !form.latitude) {
      setFormError('请填写经纬度');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (modalMode === 'create') {
        const created = await createHazardPoint(formToPayload(form, true));
        setModalMode(null);
        await loadData();
        await openDetail(created);
      } else if (modalMode === 'edit' && selectedPoint) {
        const updated = await updateHazardPoint(
          selectedPoint.id,
          formToPayload(form, true)
        );
        setModalMode(null);
        setSelectedPoint(updated);
        await loadData();
        const rel = await getHazardRelated(updated.id);
        setRelated(rel);
      }
      // 刷新区域树
      getHazardRegions().then(setRegions).catch(() => undefined);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () =>
    del.confirm(async (point) => {
      await deleteHazardPoint(point.id);
      if (selectedPoint?.id === point.id) {
        setSelectedPoint(null);
        setRelated(null);
      }
      await loadData();
      getHazardRegions().then(setRegions).catch(() => undefined);
    });

  const confirmDeleteRegion = () =>
    delRegion.confirm(async (node) => {
      await deleteHazardRegion(node.id);
      await reloadRegions();
      await loadData();
    });

  const handleStatusChange = async (status: HazardPoint['status']) => {
    if (!selectedPoint) return;
    try {
      const updated = await changeHazardStatus(selectedPoint.id, status);
      setSelectedPoint(updated);
      await loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : '状态变更失败');
    }
  };

  const handleExport = async () => {
    try {
      await exportHazardPoints({
        level: levelFilter,
        status: statusFilter,
        search,
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : '导出失败');
    }
  };

  const clearRegion = () => {
    setRegionSel({ cities: [], districts: [], counties: [], villages: [] });
    setPage(1);
  };

  const handleAddRegion = async (
    parent: RegionTreeNode | null,
    name: string,
    level?: string
  ) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('请填写名称');
    const created = await createHazardRegion({
      name: trimmed,
      parent_id: parent?.id ?? null,
      level,
    });
    const tree = await reloadRegions();

    // 解析上级完整路径，保证内外表单一致选中
    const resolveParentPath = (): RegionPath => {
      if (!parent) {
        return { city: created.name, district: '', county: '', village: '' };
      }
      for (const city of tree) {
        if (city.id === parent.id) {
          return {
            city: created.level === 'district' ? city.name : created.name,
            district: created.level === 'district' ? created.name : '',
            county: '',
            village: '',
          };
        }
        for (const dist of city.children) {
          if (dist.id === parent.id) {
            if (created.level === 'county') {
              return {
                city: city.name,
                district: dist.name,
                county: created.name,
                village: '',
              };
            }
            // 区下直属村
            return {
              city: city.name,
              district: dist.name,
              county: '',
              village: created.level === 'village' ? created.name : '',
            };
          }
          for (const county of dist.children.filter((c) => c.level === 'county')) {
            if (county.id === parent.id) {
              return {
                city: city.name,
                district: dist.name,
                county: county.name,
                village: created.level === 'village' ? created.name : '',
              };
            }
          }
        }
      }
      return {
        city: '',
        district: '',
        county: '',
        village: created.name,
      };
    };

    const path = resolveParentPath();
    // 表单打开时写入；外侧筛选也可同步勾选到新增节点便于联动
    if (modalMode) {
      setForm((f) => applyPathToForm(f, path));
    }
    if (created.level === 'city') {
      setRegionSel((s) => ({ ...s, cities: Array.from(new Set([...s.cities, created.name])) }));
    } else if (created.level === 'district') {
      setRegionSel((s) => ({
        ...s,
        cities: path.city ? Array.from(new Set([...s.cities, path.city])) : s.cities,
        districts: Array.from(new Set([...s.districts, created.name])),
      }));
    } else if (created.level === 'county') {
      setRegionSel((s) => ({
        ...s,
        cities: path.city ? Array.from(new Set([...s.cities, path.city])) : s.cities,
        districts: path.district
          ? Array.from(new Set([...s.districts, path.district]))
          : s.districts,
        counties: Array.from(new Set([...s.counties, created.name])),
      }));
    } else if (created.level === 'village') {
      setRegionSel((s) => ({
        ...s,
        cities: path.city ? Array.from(new Set([...s.cities, path.city])) : s.cities,
        districts: path.district
          ? Array.from(new Set([...s.districts, path.district]))
          : s.districts,
        counties: path.county
          ? Array.from(new Set([...s.counties, path.county]))
          : s.counties,
        villages: Array.from(new Set([...s.villages, created.name])),
      }));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> 新增
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
          >
            <Download className="h-4 w-4" /> 导出
          </button>
      </PageHeader>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex gap-4">
        {/* 左侧区域树：市→区→县→村，可伸缩 + 分级新增 */}
        <div className="flex w-60 shrink-0 flex-col rounded-lg border border-border bg-card p-3">
          <RegionFilterTree
            tree={regions}
            selection={regionSel}
            onSelectionChange={(next) => {
              setRegionSel(next);
              setPage(1);
            }}
            onAddChild={handleAddRegion}
            onDeleteNode={(node) => delRegion.open(node)}
            className="max-h-[70vh]"
          />
        </div>

        <div className="flex-1 space-y-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-white">筛选条件</h3>
              <button
                onClick={() => {
                  setSearch('');
                  setLevelFilter('');
                  setStatusFilter('');
                  clearRegion();
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
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setPage(1);
                        loadData();
                      }
                    }}
                    placeholder="名称 / 编号 / 责任人"
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
                  <option value="red">红色</option>
                  <option value="orange">橙色</option>
                  <option value="yellow">黄色</option>
                  <option value="blue">蓝色</option>
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
                  <option value="stable">稳定</option>
                  <option value="attention">关注</option>
                  <option value="warning">预警</option>
                  <option value="emergency">紧急</option>
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
                    setStatusFilter('');
                    clearRegion();
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
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">类型</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">等级</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">威胁人数</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">责任人</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                ) : points.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      暂无隐患点，点击「新增」创建
                    </td>
                  </tr>
                ) : (
                  points.map((point) => (
                    <tr
                      key={point.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-cyan-400">{point.code}</td>
                      <td className="px-4 py-3 font-medium text-white">{point.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {TYPE_LABELS[point.type] || point.type}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'rounded px-2 py-0.5 text-xs font-medium',
                            LEVEL_STYLES[point.level]?.bg,
                            LEVEL_STYLES[point.level]?.text
                          )}
                        >
                          {LEVEL_STYLES[point.level]?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'rounded px-2 py-0.5 text-xs font-medium',
                            STATUS_STYLES[point.status]?.bg,
                            STATUS_STYLES[point.status]?.text
                          )}
                        >
                          {STATUS_STYLES[point.status]?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-white">
                        {point.threat.people}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {point.responsiblePerson || '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openDetail(point)}
                            className="text-xs text-cyan-400 hover:underline"
                          >
                            详情
                          </button>
                          <button
                            onClick={() => {
                              setSelectedPoint(point);
                              openEdit(point);
                            }}
                            className="text-xs text-muted-foreground hover:text-white"
                            title="编辑"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => del.open(point)}
                            className="text-xs text-muted-foreground hover:text-red-400"
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
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p = start + i;
                if (p > totalPages) return null;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={cn(
                      'rounded px-2.5 py-1 text-xs',
                      p === page ? 'bg-cyan-600 text-white' : 'hover:bg-accent'
                    )}
                  >
                    {p}
                  </button>
                );
              })}
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
      </div>

      {/* 详情侧栏 */}
      {selectedPoint && !modalMode && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedPoint(null)} />
          <div className="relative w-[480px] overflow-y-auto border-l border-border bg-card animate-slide-in-right">
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card p-4">
              <h3 className="text-lg font-bold text-white">{selectedPoint.name}</h3>
              <button onClick={() => setSelectedPoint(null)} className="rounded p-1 hover:bg-accent">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-3">
                <InfoItem label="编号" value={selectedPoint.code} />
                <InfoItem label="类型" value={TYPE_LABELS[selectedPoint.type]} />
                <InfoItem label="风险等级">
                  <span
                    className={cn(
                      'rounded px-2 py-0.5 text-xs font-medium',
                      LEVEL_STYLES[selectedPoint.level]?.bg,
                      LEVEL_STYLES[selectedPoint.level]?.text
                    )}
                  >
                    {LEVEL_STYLES[selectedPoint.level]?.label}
                  </span>
                </InfoItem>
                <InfoItem label="状态">
                  <span
                    className={cn(
                      'rounded px-2 py-0.5 text-xs font-medium',
                      STATUS_STYLES[selectedPoint.status]?.bg,
                      STATUS_STYLES[selectedPoint.status]?.text
                    )}
                  >
                    {STATUS_STYLES[selectedPoint.status]?.label}
                  </span>
                </InfoItem>
              </div>

              <div className="rounded-lg border border-border p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  位置信息
                </h4>
                <p className="text-sm text-white">
                  {[
                    selectedPoint.location.city,
                    selectedPoint.location.district || selectedPoint.location.town,
                    selectedPoint.location.county,
                    selectedPoint.location.village,
                  ]
                    .filter(Boolean)
                    .join(' / ')}
                </p>
                <p className="mt-1 text-sm text-white">{selectedPoint.location.address || '—'}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  经度 {selectedPoint.location.lng} · 纬度 {selectedPoint.location.lat}
                </p>
              </div>

              <div className="rounded-lg border border-border p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  规模参数
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <InfoItem label="体积" value={`${selectedPoint.scale.volume.toLocaleString()} m³`} />
                  <InfoItem label="长度" value={`${selectedPoint.scale.length} m`} />
                  <InfoItem label="宽度" value={`${selectedPoint.scale.width} m`} />
                  <InfoItem label="高度" value={`${selectedPoint.scale.height} m`} />
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <h4 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
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
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  责任人信息
                </h4>
                <InfoItem label="责任人" value={selectedPoint.responsiblePerson || '—'} />
                <InfoItem label="联系电话" value={selectedPoint.contactPhone || '—'} />
                <InfoItem
                  label="稳定性系数"
                  value={(selectedPoint.coefficient || 0).toFixed(3)}
                />
              </div>

              {/* 关联业务 */}
              <div className="rounded-lg border border-border p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  关联业务
                </h4>
                <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded bg-muted/40 p-2">
                    <p className="font-mono text-lg text-cyan-400">
                      {selectedPoint.deviceCount ?? related?.devices.length ?? 0}
                    </p>
                    <p className="text-muted-foreground">监测设备</p>
                  </div>
                  <div className="rounded bg-muted/40 p-2">
                    <p className="font-mono text-lg text-orange-400">
                      {selectedPoint.openWarningCount ?? related?.warnings.length ?? 0}
                    </p>
                    <p className="text-muted-foreground">未闭环预警</p>
                  </div>
                  <div className="rounded bg-muted/40 p-2">
                    <p className="font-mono text-lg text-yellow-400">
                      {selectedPoint.inspectionPendingCount ??
                        related?.inspection_tasks.filter((t) =>
                          ['pending', 'in_progress'].includes(t.status)
                        ).length ??
                        0}
                    </p>
                    <p className="text-muted-foreground">待排查</p>
                  </div>
                </div>
                {related?.warnings?.length ? (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">最近未闭环预警</p>
                    {related.warnings.slice(0, 3).map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center justify-between rounded border border-border/60 px-2 py-1.5 text-xs"
                      >
                        <span className="font-mono text-cyan-400">{w.code}</span>
                        <span className={LEVEL_STYLES[w.level]?.text}>
                          {LEVEL_STYLES[w.level]?.label}
                        </span>
                        <span className="text-muted-foreground">
                          {STATUS_STYLES[w.status]?.label || w.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">暂无未闭环预警</p>
                )}
              </div>

              <div className="rounded-lg border border-border p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  状态处置
                </h4>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(STATUS_STYLES) as HazardPoint['status'][]).map((s) => (
                    <button
                      key={s}
                      disabled={selectedPoint.status === s}
                      onClick={() => handleStatusChange(s)}
                      className={cn(
                        'rounded-lg border px-2.5 py-1 text-xs',
                        selectedPoint.status === s
                          ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
                          : 'border-border text-muted-foreground hover:bg-accent'
                      )}
                    >
                      {STATUS_STYLES[s].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => openEdit(selectedPoint)}
                  className="flex-1 rounded-lg bg-cyan-600 py-2 text-sm font-medium text-white hover:bg-cyan-700"
                >
                  编辑
                </button>
                <button
                  onClick={() => del.open(selectedPoint)}
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
        title="确认删除隐患点？"
        name={del.target?.name}
        code={del.target?.code}
        hint="若存在未闭环预警或在线监测设备，系统将拒绝删除。"
        error={del.error}
        loading={del.loading}
        onCancel={del.close}
        onConfirm={confirmDelete}
      />

      <ConfirmDeleteDialog
        open={!!delRegion.target}
        title="确认删除区域？"
        name={delRegion.target?.name}
        code={delRegion.target?.level_display}
        hint="仅可删除无下级的区域节点。"
        error={delRegion.error}
        loading={delRegion.loading}
        onCancel={delRegion.close}
        onConfirm={confirmDeleteRegion}
      />

      {/* 新增/编辑弹窗 */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !saving && setModalMode(null)}
          />
          <div className="relative max-h-[85vh] w-[640px] overflow-y-auto rounded-lg border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {modalMode === 'create' ? '新增隐患点' : '编辑隐患点'}
              </h3>
              <button
                onClick={() => setModalMode(null)}
                disabled={saving}
                className="rounded p-1 hover:bg-accent"
              >
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
                <FormField label="编号">
                  <input
                    className={INPUT_CLS}
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="留空自动生成"
                    disabled={modalMode === 'edit'}
                  />
                </FormField>
                <FormField label="名称 *">
                  <input
                    className={INPUT_CLS}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="请输入名称"
                  />
                </FormField>
                <FormField label="类型 *">
                  <select
                    className={INPUT_CLS}
                    value={form.type}
                    onChange={(e) =>
                      setForm({ ...form, type: e.target.value as HazardPoint['type'] })
                    }
                  >
                    <option value="landslide">滑坡</option>
                    <option value="collapse">崩塌</option>
                    <option value="debris_flow">泥石流</option>
                    <option value="others">其他</option>
                  </select>
                </FormField>
                <FormField label="风险等级 *">
                  <select
                    className={INPUT_CLS}
                    value={form.level}
                    onChange={(e) =>
                      setForm({ ...form, level: e.target.value as HazardPoint['level'] })
                    }
                  >
                    <option value="red">红色</option>
                    <option value="orange">橙色</option>
                    <option value="yellow">黄色</option>
                    <option value="blue">蓝色</option>
                  </select>
                </FormField>
                <FormField label="状态">
                  <select
                    className={INPUT_CLS}
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as HazardPoint['status'] })
                    }
                  >
                    <option value="stable">稳定</option>
                    <option value="attention">关注</option>
                    <option value="warning">预警</option>
                    <option value="emergency">紧急</option>
                  </select>
                </FormField>
                <FormField label="稳定性系数">
                  <input
                    className={INPUT_CLS}
                    type="number"
                    step="0.001"
                    value={form.stability_coefficient}
                    onChange={(e) => setForm({ ...form, stability_coefficient: e.target.value })}
                  />
                </FormField>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">所属区域（市 / 区 / 县 / 村）</p>
                <RegionCascadeFields
                  tree={regions}
                  city={form.city}
                  district={form.district}
                  county={form.county}
                  village={form.village}
                  inputClassName={INPUT_CLS}
                  onChange={(next) =>
                    setForm({
                      ...form,
                      city: next.city,
                      district: next.district,
                      county: next.county,
                      village: next.village,
                      town: next.district,
                    })
                  }
                  onAddChild={handleAddRegion}
                />
              </div>

              <FormField label="详细地址">
                <input
                  className={INPUT_CLS}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="请输入详细地址"
                />
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="经度 *">
                  <input
                    className={INPUT_CLS}
                    type="number"
                    step="any"
                    value={form.longitude}
                    onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                  />
                </FormField>
                <FormField label="纬度 *">
                  <input
                    className={INPUT_CLS}
                    type="number"
                    step="any"
                    value={form.latitude}
                    onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <FormField label="体积(m³)">
                  <input
                    className={INPUT_CLS}
                    type="number"
                    value={form.volume}
                    onChange={(e) => setForm({ ...form, volume: e.target.value })}
                  />
                </FormField>
                <FormField label="长度(m)">
                  <input
                    className={INPUT_CLS}
                    type="number"
                    value={form.length}
                    onChange={(e) => setForm({ ...form, length: e.target.value })}
                  />
                </FormField>
                <FormField label="宽度(m)">
                  <input
                    className={INPUT_CLS}
                    type="number"
                    value={form.width}
                    onChange={(e) => setForm({ ...form, width: e.target.value })}
                  />
                </FormField>
                <FormField label="高度(m)">
                  <input
                    className={INPUT_CLS}
                    type="number"
                    value={form.height}
                    onChange={(e) => setForm({ ...form, height: e.target.value })}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="威胁人数">
                  <input
                    className={INPUT_CLS}
                    type="number"
                    value={form.threat_people}
                    onChange={(e) => setForm({ ...form, threat_people: e.target.value })}
                  />
                </FormField>
                <FormField label="威胁房屋">
                  <input
                    className={INPUT_CLS}
                    type="number"
                    value={form.threat_houses}
                    onChange={(e) => setForm({ ...form, threat_houses: e.target.value })}
                  />
                </FormField>
                <FormField label="威胁道路(m)">
                  <input
                    className={INPUT_CLS}
                    type="number"
                    value={form.threat_roads}
                    onChange={(e) => setForm({ ...form, threat_roads: e.target.value })}
                  />
                </FormField>
                <FormField label="威胁资产(万元)">
                  <input
                    className={INPUT_CLS}
                    type="number"
                    value={form.threat_assets}
                    onChange={(e) => setForm({ ...form, threat_assets: e.target.value })}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="责任人">
                  <input
                    className={INPUT_CLS}
                    value={form.responsible_person}
                    onChange={(e) => setForm({ ...form, responsible_person: e.target.value })}
                  />
                </FormField>
                <FormField label="联系电话">
                  <input
                    className={INPUT_CLS}
                    value={form.contact_phone}
                    onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                  />
                </FormField>
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <button
                  onClick={() => setModalMode(null)}
                  disabled={saving}
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

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
