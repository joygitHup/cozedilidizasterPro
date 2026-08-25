'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getCrossSections, type CrossSection } from '@/lib/platform-api';
import { PageHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';

function ProfileSvg({ section }: { section: CrossSection }) {
  const pts = section.profile_points || [];
  const layers = section.layers?.length
    ? section.layers
    : [
        { key: 'cover', label: '第四系', color: '#a16207' },
        { key: 'weathered', label: '强风化', color: '#c2410c' },
        { key: 'mid', label: '中风化', color: '#b91c1c' },
        { key: 'bedrock', label: '基岩', color: '#475569' },
      ];

  const { surfacePath, strata } = useMemo(() => {
    if (!pts.length) {
      return { surfacePath: '', strata: [] as { d: string; color: string; label: string }[] };
    }
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys) + 8;
    const w = 640;
    const h = 360;
    const pad = 24;
    const sx = (x: number) => pad + ((x - minX) / Math.max(maxX - minX, 1)) * (w - pad * 2);
    const sy = (y: number) => pad + ((maxY - y) / Math.max(maxY - minY, 1)) * (h - pad * 2);

    const surface = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`)
      .join(' ');

    // 分层：地表线 → 向下偏移形成地层填充
    const offsets = [0, 4, 9, 16];
    const built = layers.map((layer, idx) => {
      const off = offsets[idx] ?? idx * 5;
      const top = pts.map((p) => ({ x: sx(p.x), y: sy(p.y - off * (idx === 0 ? 0 : 0.35)) }));
      const nextOff = offsets[idx + 1] ?? off + 6;
      const bottom = [...pts]
        .reverse()
        .map((p) => ({ x: sx(p.x), y: sy(p.y - nextOff * 0.45) }));
      const d = [
        ...top.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
        ...bottom.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
        'Z',
      ].join(' ');
      return { d, color: layer.color, label: layer.label };
    });

    return { surfacePath: surface, strata: built };
  }, [pts, layers]);

  if (!pts.length) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded border border-border bg-slate-900 text-xs text-muted-foreground">
        暂无剖面点数据
      </div>
    );
  }

  return (
    <svg viewBox="0 0 640 360" className="w-full rounded border border-border bg-slate-950">
      {strata.map((s) => (
        <path key={s.label} d={s.d} fill={s.color} fillOpacity={0.55} stroke="none" />
      ))}
      <path d={surfacePath} fill="none" stroke="#22d3ee" strokeWidth={2.5} />
      <text x="24" y="20" fill="#94a3b8" fontSize="11">
        地表线
      </text>
      <text x="560" y="348" fill="#64748b" fontSize="10">
        水平距离 →
      </text>
    </svg>
  );
}

export default function CrossSectionPage() {
  const [list, setList] = useState<CrossSection[]>([]);
  const [selected, setSelected] = useState<CrossSection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getCrossSections();
      setList(res.list);
      setSelected((prev) => {
        if (prev) {
          const found = res.list.find((x) => x.id === prev.id);
          return found || res.list[0] || null;
        }
        return res.list[0] || null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader />
      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium text-white">剖面列表</h3>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {list.map((cs) => (
                <button
                  key={cs.id}
                  type="button"
                  onClick={() => setSelected(cs)}
                  className={cn(
                    'w-full rounded border p-3 text-left transition-colors',
                    selected?.id === cs.id
                      ? 'border-cyan-500/60 bg-cyan-500/10'
                      : 'border-border bg-muted/30 hover:border-cyan-500/40'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white">{cs.name}</span>
                    <span className="text-xs text-cyan-400">{cs.length_m}m</span>
                  </div>
                  <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                    <span>{cs.location}</span>
                    <span>{cs.direction}</span>
                    {cs.hazard_point_name && <span>{cs.hazard_point_name}</span>}
                  </div>
                </button>
              ))}
              {list.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">暂无剖面，请先初始化数据</p>
              )}
            </div>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium text-white">
            {selected ? selected.name : '剖面图'}
          </h3>
          {selected ? <ProfileSvg section={selected} /> : (
            <div className="flex aspect-[4/3] items-center justify-center rounded border border-border bg-slate-900 text-xs text-muted-foreground">
              请选择左侧剖面
            </div>
          )}
          {selected && (
            <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
              {(selected.layers || []).map((l) => (
                <div
                  key={l.key}
                  className="rounded p-2 text-center"
                  style={{ backgroundColor: `${l.color}33`, color: l.color }}
                >
                  {l.label}
                </div>
              ))}
            </div>
          )}
          {selected?.description && (
            <p className="mt-2 text-xs text-muted-foreground">{selected.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
