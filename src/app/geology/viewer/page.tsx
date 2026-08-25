'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CesiumViewer } from '@/components/geology/cesium-viewer';
import { getGeologySite, type GeologySite } from '@/lib/platform-api';

function ViewerInner() {
  const sp = useSearchParams();
  const siteId = sp.get('site');
  const [site, setSite] = useState<GeologySite | null>(null);
  const [err, setErr] = useState('');

  const lon = Number(sp.get('lon') || site?.longitude || 104.06);
  const lat = Number(sp.get('lat') || site?.latitude || 30.67);
  const height = Number(sp.get('h') || site?.height || 2500);
  const tileset = sp.get('tileset') || site?.tileset_url || undefined;
  const ion = sp.get('ion') || site?.ion_asset_id || undefined;
  const glb = sp.get('glb') || site?.glb_url || undefined;

  useEffect(() => {
    if (!siteId) return;
    void getGeologySite(Number(siteId))
      .then(setSite)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [siteId]);

  const title = site?.name || '三维地质场景';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex h-12 items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4">
        <div className="flex items-center gap-3">
          <Link
            href="/geology/models"
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回站点库
          </Link>
          <span className="text-sm font-medium text-white">{title}</span>
          {site?.code && (
            <span className="font-mono text-[10px] text-cyan-400">{site.code}</span>
          )}
        </div>
        <span className="text-[10px] text-slate-500">
          {lon.toFixed(4)}, {lat.toFixed(4)} · h={height}
          {ion ? ' · Ion' : ''}
          {tileset ? ' · 3D Tiles' : ''}
          {glb ? ' · GLB' : ''}
          {!ion && !tileset && !glb ? ' · OSM 底图' : ''}
        </span>
      </div>
      {err && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1 text-xs text-amber-300">
          {err}
        </div>
      )}
      <div className="relative flex-1">
        <CesiumViewer
          longitude={Number.isFinite(lon) ? lon : 104.06}
          latitude={Number.isFinite(lat) ? lat : 30.67}
          height={Number.isFinite(height) ? height : 2500}
          tilesetUrl={tileset || undefined}
          ionAssetId={ion || undefined}
          glbUrl={glb || undefined}
        />
      </div>
    </div>
  );
}

export default function GeologyViewerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-slate-400">
          加载场景…
        </div>
      }
    >
      <ViewerInner />
    </Suspense>
  );
}
