'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Loader2, Plus, Trash2, X } from 'lucide-react';
import type { RegionLevel, RegionTreeNode } from '@/types';
import { cn } from '@/lib/utils';

export type RegionSelection = {
  cities: string[];
  districts: string[];
  counties: string[];
  villages: string[];
};

/** parent + name + 显式下级类型（区下建村时必传 village） */
export type AddHandler = (
  parent: RegionTreeNode | null,
  name: string,
  level?: RegionLevel
) => Promise<void>;

export type DeleteHandler = (node: RegionTreeNode) => void;

type Props = {
  tree: RegionTreeNode[];
  selection: RegionSelection;
  onSelectionChange: (next: RegionSelection) => void;
  onAddChild: AddHandler;
  onDeleteNode?: DeleteHandler;
  className?: string;
};

function childOptions(node: RegionTreeNode) {
  if (node.child_level_options?.length) return node.child_level_options;
  if (node.child_levels?.length) {
    const map: Record<string, string> = {
      city: '市',
      district: '区',
      county: '县',
      village: '村',
    };
    return node.child_levels.map((level) => ({
      level,
      level_display: map[level] || level,
    }));
  }
  if (node.child_level) {
    return [
      {
        level: node.child_level,
        level_display: node.child_level_display || node.child_level,
      },
    ];
  }
  return [];
}

function collectNames(node: RegionTreeNode): RegionSelection {
  const sel: RegionSelection = {
    cities: [],
    districts: [],
    counties: [],
    villages: [],
  };
  const walk = (n: RegionTreeNode) => {
    if (n.level === 'city') sel.cities.push(n.name);
    if (n.level === 'district') sel.districts.push(n.name);
    if (n.level === 'county') sel.counties.push(n.name);
    if (n.level === 'village') sel.villages.push(n.name);
    n.children.forEach(walk);
  };
  walk(node);
  return sel;
}

function mergeToggleNode(
  selection: RegionSelection,
  node: RegionTreeNode,
  checked: boolean
): RegionSelection {
  const names = collectNames(node);
  const apply = (curr: string[], add: string[]) => {
    if (checked) {
      const set = new Set(curr);
      add.forEach((x) => set.add(x));
      return Array.from(set);
    }
    const drop = new Set(add);
    return curr.filter((x) => !drop.has(x));
  };
  return {
    cities: apply(selection.cities, names.cities),
    districts: apply(selection.districts, names.districts),
    counties: apply(selection.counties, names.counties),
    villages: apply(selection.villages, names.villages),
  };
}

function isChecked(selection: RegionSelection, node: RegionTreeNode) {
  if (node.level === 'city') return selection.cities.includes(node.name);
  if (node.level === 'district') return selection.districts.includes(node.name);
  if (node.level === 'county') return selection.counties.includes(node.name);
  return selection.villages.includes(node.name);
}

function InlineAddRow({
  label,
  depth,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  label: string;
  depth: number;
  busy: boolean;
  error: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const submit = () => {
    const name = value.trim();
    if (!name || busy) return;
    onSubmit(name);
  };

  return (
    <div className="py-1" style={{ paddingLeft: depth * 10 + 22 }}>
      <div className="flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/5 px-1.5 py-1">
        <span className="shrink-0 text-[10px] text-cyan-400/80">{label}</span>
        <input
          ref={ref}
          value={value}
          disabled={busy}
          placeholder={`输入${label}名称`}
          className="h-7 min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-muted-foreground"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
        />
        <button
          type="button"
          disabled={busy || !value.trim()}
          onClick={submit}
          className="rounded p-1 text-cyan-400 hover:bg-cyan-500/15 disabled:opacity-40"
          title="确定"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          title="取消"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {error && <p className="mt-1 text-[10px] text-red-400">{error}</p>}
    </div>
  );
}

type AddingState =
  | { key: string; level: RegionLevel; label: string; parentId: number | null }
  | null;

function TreeNodeRow({
  node,
  depth,
  selection,
  onSelectionChange,
  onAddChild,
  onDeleteNode,
  adding,
  setAdding,
  busy,
  addError,
  defaultOpen,
}: {
  node: RegionTreeNode;
  depth: number;
  selection: RegionSelection;
  onSelectionChange: (next: RegionSelection) => void;
  onAddChild: AddHandler;
  onDeleteNode?: DeleteHandler;
  adding: AddingState;
  setAdding: (next: AddingState) => void;
  busy: boolean;
  addError: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [menuOpen, setMenuOpen] = useState(false);
  const options = childOptions(node);
  const hasChildren = node.children.length > 0;
  const canAdd = options.length > 0;
  const checked = isChecked(selection, node);
  const rowKey = `node-${node.id}`;
  const showInline = adding?.key === rowKey;

  const startAdd = (opt: { level: RegionLevel; level_display: string }) => {
    setOpen(true);
    setMenuOpen(false);
    setAdding({
      key: rowKey,
      level: opt.level,
      label: opt.level_display,
      parentId: node.id,
    });
  };

  return (
    <div>
      <div
        className="group flex items-center gap-1 rounded px-0.5 py-0.5 hover:bg-muted/40"
        style={{ paddingLeft: depth * 10 }}
      >
        <button
          type="button"
          className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground"
          onClick={() => setOpen((v) => !v)}
        >
          {hasChildren || canAdd || showInline ? (
            open || showInline ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )
          ) : (
            <span className="h-3.5 w-3.5" />
          )}
        </button>
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            className="accent-cyan-500"
            checked={checked}
            onChange={(e) =>
              onSelectionChange(mergeToggleNode(selection, node, e.target.checked))
            }
          />
          <span
            className={cn(
              'truncate',
              node.level === 'city' && 'font-medium text-white',
              node.level === 'district' && 'text-slate-200',
              node.level === 'county' && 'text-slate-300',
              node.level === 'village' && 'text-slate-400'
            )}
          >
            {node.name}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {node.level_display}
          </span>
        </label>
        {onDeleteNode && !hasChildren && (
          <button
            type="button"
            title="删除区域"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDeleteNode(node);
            }}
            className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        {canAdd && (
          <div className="relative">
            <button
              type="button"
              title="新增下级"
              onClick={() => {
                if (options.length === 1) startAdd(options[0]);
                else setMenuOpen((v) => !v);
              }}
              className="rounded p-0.5 text-cyan-400 opacity-70 hover:bg-cyan-500/10 hover:opacity-100"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            {menuOpen && options.length > 1 && (
              <div className="absolute right-0 top-6 z-20 min-w-[88px] rounded-md border border-border bg-card p-1 shadow-lg">
                {options.map((opt) => (
                  <button
                    key={opt.level}
                    type="button"
                    className="block w-full rounded px-2 py-1 text-left text-[11px] text-cyan-300 hover:bg-muted"
                    onClick={() => startAdd(opt)}
                  >
                    新增{opt.level_display}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {(open || showInline) && (
        <div>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selection={selection}
              onSelectionChange={onSelectionChange}
              onAddChild={onAddChild}
              onDeleteNode={onDeleteNode}
              adding={adding}
              setAdding={setAdding}
              busy={busy}
              addError={addError}
              defaultOpen={depth < 1}
            />
          ))}
          {showInline && adding && (
            <InlineAddRow
              label={adding.label}
              depth={depth + 1}
              busy={busy}
              error={addError}
              onCancel={() => setAdding(null)}
              onSubmit={(name) => {
                void onAddChild(node, name, adding.level);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function findNodeById(tree: RegionTreeNode[], id: number): RegionTreeNode | null {
  for (const n of tree) {
    if (n.id === id) return n;
    const hit = findNodeById(n.children, id);
    if (hit) return hit;
  }
  return null;
}

/** 可作为「村」上级的节点：区 或 县 */
function villageParents(tree: RegionTreeNode[]) {
  const list: Array<{ id: number; label: string; node: RegionTreeNode }> = [];
  for (const city of tree) {
    for (const dist of city.children) {
      list.push({
        id: dist.id,
        label: `${city.name} / ${dist.name}（区下直属村）`,
        node: dist,
      });
      for (const county of dist.children.filter((c) => c.level === 'county')) {
        list.push({
          id: county.id,
          label: `${city.name} / ${dist.name} / ${county.name}`,
          node: county,
        });
      }
    }
  }
  return list;
}

export function RegionFilterTree({
  tree,
  selection,
  onSelectionChange,
  onAddChild,
  onDeleteNode,
  className,
}: Props) {
  const [adding, setAdding] = useState<AddingState>(null);
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState('');
  const [quickParentId, setQuickParentId] = useState<number | ''>('');

  const hasSelection =
    selection.cities.length +
      selection.districts.length +
      selection.counties.length +
      selection.villages.length >
    0;

  const wrapAdd: AddHandler = async (parent, name, level) => {
    setBusy(true);
    setAddError('');
    try {
      await onAddChild(parent, name, level);
      setAdding(null);
      setQuickParentId('');
    } catch (e) {
      setAddError(e instanceof Error ? e.message : '新增失败');
    } finally {
      setBusy(false);
    }
  };

  const cities = tree;
  const districts = tree.flatMap((c) =>
    c.children.map((d) => ({ ...d, cityName: c.name }))
  );
  const vParents = villageParents(tree);

  const startRootCity = () => {
    setAddError('');
    setAdding({ key: 'root-city', level: 'city', label: '市', parentId: null });
  };

  const startQuickDistrict = () => {
    setAddError('');
    if (cities.length === 1) {
      setAdding({
        key: `node-${cities[0].id}`,
        level: 'district',
        label: '区',
        parentId: cities[0].id,
      });
      return;
    }
    setAdding({ key: 'quick-district', level: 'district', label: '区', parentId: null });
    setQuickParentId(cities[0]?.id ?? '');
  };

  const startQuickCounty = () => {
    setAddError('');
    if (districts.length === 1) {
      setAdding({
        key: `node-${districts[0].id}`,
        level: 'county',
        label: '县',
        parentId: districts[0].id,
      });
      return;
    }
    setAdding({ key: 'quick-county', level: 'county', label: '县', parentId: null });
    setQuickParentId(districts[0]?.id ?? '');
  };

  const startQuickVillage = () => {
    setAddError('');
    if (vParents.length === 1) {
      setAdding({
        key: `node-${vParents[0].id}`,
        level: 'village',
        label: '村',
        parentId: vParents[0].id,
      });
      return;
    }
    setAdding({ key: 'quick-village', level: 'village', label: '村', parentId: null });
    setQuickParentId(vParents[0]?.id ?? '');
  };

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">区域筛选</h4>
        {hasSelection && (
          <button
            type="button"
            onClick={() =>
              onSelectionChange({
                cities: [],
                districts: [],
                counties: [],
                villages: [],
              })
            }
            className="text-[10px] text-cyan-400 hover:underline"
          >
            清除
          </button>
        )}
      </div>

      <div className="mb-2 rounded-md border border-border/80 bg-muted/20 p-2">
        <p className="mb-1.5 text-[10px] text-muted-foreground">
          快速新增（区下可无县，直接挂村）
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={startRootCity}
            className="inline-flex h-7 items-center gap-0.5 rounded border border-border bg-background px-2 text-[11px] text-cyan-300 hover:border-cyan-500/50"
          >
            <Plus className="h-3 w-3" /> 市
          </button>
          <button
            type="button"
            disabled={cities.length === 0}
            onClick={startQuickDistrict}
            className="inline-flex h-7 items-center gap-0.5 rounded border border-border bg-background px-2 text-[11px] text-cyan-300 hover:border-cyan-500/50 disabled:opacity-40"
          >
            <Plus className="h-3 w-3" /> 区
          </button>
          <button
            type="button"
            disabled={districts.length === 0}
            onClick={startQuickCounty}
            className="inline-flex h-7 items-center gap-0.5 rounded border border-border bg-background px-2 text-[11px] text-cyan-300 hover:border-cyan-500/50 disabled:opacity-40"
          >
            <Plus className="h-3 w-3" /> 县
          </button>
          <button
            type="button"
            disabled={vParents.length === 0}
            onClick={startQuickVillage}
            className="inline-flex h-7 items-center gap-0.5 rounded border border-border bg-background px-2 text-[11px] text-cyan-300 hover:border-cyan-500/50 disabled:opacity-40"
          >
            <Plus className="h-3 w-3" /> 村
          </button>
        </div>

        {adding?.key === 'root-city' && (
          <div className="mt-2">
            <InlineAddRow
              label="市"
              depth={0}
              busy={busy}
              error={addError}
              onCancel={() => setAdding(null)}
              onSubmit={(name) => {
                void wrapAdd(null, name, 'city');
              }}
            />
          </div>
        )}

        {adding?.key === 'quick-district' && (
          <div className="mt-2 space-y-1.5">
            <select
              className="h-7 w-full rounded border border-border bg-background px-2 text-xs text-foreground"
              value={quickParentId}
              onChange={(e) =>
                setQuickParentId(e.target.value ? Number(e.target.value) : '')
              }
            >
              <option value="">选择所属市</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {quickParentId !== '' && (
              <InlineAddRow
                label="区"
                depth={0}
                busy={busy}
                error={addError}
                onCancel={() => setAdding(null)}
                onSubmit={(name) => {
                  const parent = findNodeById(tree, Number(quickParentId));
                  if (parent) void wrapAdd(parent, name, 'district');
                }}
              />
            )}
          </div>
        )}

        {adding?.key === 'quick-county' && (
          <div className="mt-2 space-y-1.5">
            <select
              className="h-7 w-full rounded border border-border bg-background px-2 text-xs text-foreground"
              value={quickParentId}
              onChange={(e) =>
                setQuickParentId(e.target.value ? Number(e.target.value) : '')
              }
            >
              <option value="">选择所属区</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.cityName} / {d.name}
                </option>
              ))}
            </select>
            {quickParentId !== '' && (
              <InlineAddRow
                label="县"
                depth={0}
                busy={busy}
                error={addError}
                onCancel={() => setAdding(null)}
                onSubmit={(name) => {
                  const parent = findNodeById(tree, Number(quickParentId));
                  if (parent) void wrapAdd(parent, name, 'county');
                }}
              />
            )}
          </div>
        )}

        {adding?.key === 'quick-village' && (
          <div className="mt-2 space-y-1.5">
            <select
              className="h-7 w-full rounded border border-border bg-background px-2 text-xs text-foreground"
              value={quickParentId}
              onChange={(e) =>
                setQuickParentId(e.target.value ? Number(e.target.value) : '')
              }
            >
              <option value="">选择上级（区或县）</option>
              {vParents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {quickParentId !== '' && (
              <InlineAddRow
                label="村"
                depth={0}
                busy={busy}
                error={addError}
                onCancel={() => setAdding(null)}
                onSubmit={(name) => {
                  const parent = findNodeById(tree, Number(quickParentId));
                  if (parent) void wrapAdd(parent, name, 'village');
                }}
              />
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {tree.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无区域，请先在上方新增市</p>
        ) : (
          tree.map((node) => (
            <TreeNodeRow
              key={node.id}
              node={node}
              depth={0}
              selection={selection}
              onSelectionChange={onSelectionChange}
              onAddChild={wrapAdd}
              onDeleteNode={onDeleteNode}
              adding={adding}
              setAdding={(next) => {
                setAddError('');
                setAdding(next);
              }}
              busy={busy}
              addError={addError}
              defaultOpen
            />
          ))
        )}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        区下可建「县」或直接建「村」；树上「+」可选择下级类型；无下级时可删除区域。
      </p>
    </div>
  );
}

/** 表单级联：县可选；村可挂在区下或县下 */
export function RegionCascadeFields({
  tree,
  city,
  district,
  county,
  village,
  onChange,
  onAddChild,
  inputClassName,
}: {
  tree: RegionTreeNode[];
  city: string;
  district: string;
  county: string;
  village: string;
  onChange: (next: {
    city: string;
    district: string;
    county: string;
    village: string;
  }) => void;
  onAddChild: AddHandler;
  inputClassName: string;
}) {
  const [editing, setEditing] = useState<null | RegionLevel>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cityNode = tree.find((c) => c.name === city);
  const districtNode = cityNode?.children.find((d) => d.name === district);
  const countyNode = districtNode?.children.find(
    (c) => c.level === 'county' && c.name === county
  );

  const cities = tree;
  const districts = cityNode?.children ?? [];
  const counties = (districtNode?.children ?? []).filter((c) => c.level === 'county');
  const villages = countyNode
    ? countyNode.children.filter((v) => v.level === 'village')
    : (districtNode?.children ?? []).filter((v) => v.level === 'village');

  // 与外侧树同步时，若当前值暂不在列表中仍展示（避免闪断）
  const cityOptions = city && !cities.some((c) => c.name === city)
    ? [{ id: -1, name: city }, ...cities]
    : cities;
  const districtOptions =
    district && !districts.some((d) => d.name === district)
      ? [{ id: -2, name: district }, ...districts]
      : districts;
  const countyOptions =
    county && !counties.some((c) => c.name === county)
      ? [{ id: -3, name: county, level: 'county' as const }, ...counties]
      : counties;
  const villageOptions =
    village && !villages.some((v) => v.name === village)
      ? [{ id: -4, name: village, level: 'village' as const }, ...villages]
      : villages;

  const submitInline = async () => {
    const trimmed = name.trim();
    if (!trimmed || !editing) return;
    setBusy(true);
    setError('');
    try {
      if (editing === 'city') await onAddChild(null, trimmed, 'city');
      else if (editing === 'district' && cityNode)
        await onAddChild(cityNode, trimmed, 'district');
      else if (editing === 'county' && districtNode)
        await onAddChild(districtNode, trimmed, 'county');
      else if (editing === 'village') {
        const parent = countyNode || districtNode;
        if (!parent) throw new Error('请先选择区（或县）');
        await onAddChild(parent, trimmed, 'village');
      }
      setEditing(null);
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '新增失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="flex items-center justify-between text-xs text-muted-foreground">
            市
            <button
              type="button"
              className="text-cyan-400 hover:underline"
              onClick={() => {
                setEditing('city');
                setName('');
                setError('');
              }}
            >
              +新增市
            </button>
          </span>
          <select
            className={inputClassName}
            value={city}
            onChange={(e) =>
              onChange({ city: e.target.value, district: '', county: '', village: '' })
            }
          >
            <option value="">请选择</option>
            {cityOptions.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="flex items-center justify-between text-xs text-muted-foreground">
            区
            <button
              type="button"
              className="text-cyan-400 hover:underline disabled:opacity-40"
              disabled={!cityNode && !city}
              onClick={() => {
                setEditing('district');
                setName('');
                setError('');
              }}
            >
              +新增区
            </button>
          </span>
          <select
            className={inputClassName}
            value={district}
            disabled={!city}
            onChange={(e) =>
              onChange({ city, district: e.target.value, county: '', village: '' })
            }
          >
            <option value="">请选择</option>
            {districtOptions.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="flex items-center justify-between text-xs text-muted-foreground">
            县（可选）
            <button
              type="button"
              className="text-cyan-400 hover:underline disabled:opacity-40"
              disabled={!districtNode && !district}
              onClick={() => {
                setEditing('county');
                setName('');
                setError('');
              }}
            >
              +新增县
            </button>
          </span>
          <select
            className={inputClassName}
            value={county}
            disabled={!district}
            onChange={(e) =>
              onChange({ city, district, county: e.target.value, village: '' })
            }
          >
            <option value="">无县级 / 不选</option>
            {countyOptions.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="flex items-center justify-between text-xs text-muted-foreground">
            村
            <button
              type="button"
              className="text-cyan-400 hover:underline disabled:opacity-40"
              disabled={!districtNode && !district}
              onClick={() => {
                setEditing('village');
                setName('');
                setError('');
              }}
            >
              +新增村
            </button>
          </span>
          <select
            className={inputClassName}
            value={village}
            disabled={!district}
            onChange={(e) =>
              onChange({ city, district, county, village: e.target.value })
            }
          >
            <option value="">请选择</option>
            {villageOptions.map((v) => (
              <option key={v.id} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-muted-foreground">
            {county
              ? '当前挂在所选县下'
              : '未选县时，村直接挂在区下'}
          </p>
        </label>
      </div>

      {editing && (
        <div className="rounded-md border border-cyan-500/40 bg-cyan-500/5 p-2">
          <p className="mb-1 text-xs text-muted-foreground">
            新增
            {editing === 'city'
              ? '市'
              : editing === 'district'
                ? '区'
                : editing === 'county'
                  ? '县'
                  : county
                    ? '村（挂县下）'
                    : '村（挂区下）'}
          </p>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              className={cn(inputClassName, 'flex-1')}
              value={name}
              disabled={busy}
              placeholder="请输入名称后回车"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submitInline();
                }
                if (e.key === 'Escape') setEditing(null);
              }}
            />
            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={() => void submitInline()}
              className="h-9 rounded-lg bg-cyan-600 px-3 text-sm text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : '确定'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="h-9 rounded-lg border border-border px-3 text-sm"
            >
              取消
            </button>
          </div>
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
