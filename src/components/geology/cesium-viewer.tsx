'use client';

import { useEffect, useRef, useState } from 'react';

type CesiumViewerProps = {
  longitude?: number;
  latitude?: number;
  height?: number;
  tilesetUrl?: string;
  ionAssetId?: string;
  glbUrl?: string;
  className?: string;
};

declare global {
  interface Window {
    Cesium?: any;
  }
}

const CESIUM_CSS = 'https://cesium.com/downloads/cesiumjs/releases/1.125/Build/Cesium/Widgets/widgets.css';
const CESIUM_JS = 'https://cesium.com/downloads/cesiumjs/releases/1.125/Build/Cesium/Cesium.js';

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function loadCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

export function CesiumViewer({
  longitude = 104.06,
  latitude = 30.67,
  height = 2500,
  tilesetUrl,
  ionAssetId,
  glbUrl,
  className,
}: CesiumViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        loadCss(CESIUM_CSS);
        await loadScript(CESIUM_JS);
        if (cancelled || !containerRef.current || !window.Cesium) return;
        const Cesium = window.Cesium;
        const ionToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN || '';
        if (ionToken) Cesium.Ion.defaultAccessToken = ionToken;

        const viewer = new Cesium.Viewer(containerRef.current, {
          animation: false,
          timeline: false,
          baseLayerPicker: true,
          geocoder: false,
          homeButton: true,
          sceneModePicker: true,
          navigationHelpButton: false,
          fullscreenButton: true,
          imageryProvider: false,
        });
        viewer.imageryLayers.removeAll();
        viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            credit: '© OpenStreetMap',
          })
        );
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
          duration: 1.2,
        });

        const notes: string[] = [];

        if (ionAssetId && ionToken) {
          try {
            const assetId = Number(ionAssetId);
            const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(assetId);
            viewer.scene.primitives.add(tileset);
            await viewer.zoomTo(tileset);
            notes.push(`Ion #${ionAssetId}`);
          } catch (e) {
            notes.push(`Ion 加载失败: ${e instanceof Error ? e.message : 'error'}`);
          }
        } else if (ionAssetId && !ionToken) {
          notes.push('已配置 Ion Asset，但缺少 NEXT_PUBLIC_CESIUM_ION_TOKEN');
        }

        if (tilesetUrl) {
          try {
            const tileset = await Cesium.Cesium3DTileset.fromUrl(tilesetUrl);
            viewer.scene.primitives.add(tileset);
            await viewer.zoomTo(tileset);
            notes.push('3D Tiles');
          } catch (e) {
            notes.push(`Tileset 失败: ${e instanceof Error ? e.message : 'error'}`);
          }
        }

        if (glbUrl) {
          try {
            const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, 0);
            const model = await Cesium.Model.fromGltfAsync({
              url: glbUrl,
              modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(position),
              scale: 1.0,
            });
            viewer.scene.primitives.add(model);
            notes.push('GLB');
          } catch (e) {
            notes.push(`GLB 失败: ${e instanceof Error ? e.message : 'error'}`);
          }
        }

        if (!notes.length) notes.push('OSM 底图');
        setHint(notes.join(' · '));
        viewerRef.current = viewer;
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
      }
      viewerRef.current = null;
    };
  }, [longitude, latitude, height, tilesetUrl, ionAssetId, glbUrl]);

  return (
    <div className={className || 'relative h-full w-full min-h-[480px]'}>
      <div ref={containerRef} className="absolute inset-0" />
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 text-sm text-cyan-400">
          正在加载 Cesium 三维引擎…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950 p-4 text-sm text-red-400">
          Cesium 加载失败：{error}
        </div>
      )}
      {ready && hint && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded border border-cyan-500/30 bg-slate-950/80 px-2 py-1 text-[10px] text-cyan-300">
          {hint}
        </div>
      )}
    </div>
  );
}
