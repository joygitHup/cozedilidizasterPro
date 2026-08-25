'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { EvacuationGeoJSON } from '@/types';
import { cn } from '@/lib/utils';

type Props = {
  geojson: EvacuationGeoJSON | null;
  highlightTaskId?: number | null;
  className?: string;
  heightClass?: string;
};

const EMPTY: EvacuationGeoJSON = { type: 'FeatureCollection', features: [] };

function boundsFromGeoJSON(data: EvacuationGeoJSON): mapboxgl.LngLatBoundsLike | null {
  const bounds = new mapboxgl.LngLatBounds();
  let has = false;
  for (const f of data.features) {
    const g = f.geometry;
    if (g.type === 'Point') {
      bounds.extend(g.coordinates as [number, number]);
      has = true;
    } else if (g.type === 'LineString') {
      for (const c of g.coordinates) {
        bounds.extend(c as [number, number]);
        has = true;
      }
    }
  }
  return has ? bounds : null;
}

function collectCoords(data: EvacuationGeoJSON): [number, number][] {
  const out: [number, number][] = [];
  for (const f of data.features) {
    const g = f.geometry;
    if (g.type === 'Point') out.push(g.coordinates as [number, number]);
    else if (g.type === 'LineString') {
      for (const c of g.coordinates) out.push(c as [number, number]);
    }
  }
  return out;
}

/** 无 Mapbox Token 时的 SVG 预览（坐标仍来自后端 GeoJSON） */
function GeoPreview({
  data,
  highlightTaskId,
  heightClass,
  className,
}: {
  data: EvacuationGeoJSON;
  highlightTaskId?: number | null;
  heightClass: string;
  className?: string;
}) {
  const coords = collectCoords(data);
  const project = useMemo(() => {
    if (coords.length === 0) return null;
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const pad = 0.08;
    const w = Math.max(maxLng - minLng, 0.01);
    const h = Math.max(maxLat - minLat, 0.01);
    return (lng: number, lat: number) => {
      const x = ((lng - minLng) / w) * (1 - pad * 2) + pad;
      const y = 1 - (((lat - minLat) / h) * (1 - pad * 2) + pad);
      return [x * 1000, y * 560] as const;
    };
  }, [coords]);

  const features =
    highlightTaskId != null
      ? data.features.filter((f) => Number(f.properties?.task_id) === highlightTaskId)
      : data.features;
  const draw = features.length ? features : data.features;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-border bg-slate-950',
        heightClass,
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(6,182,212,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.08) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      {project && draw.length > 0 ? (
        <svg viewBox="0 0 1000 560" className="absolute inset-0 h-full w-full">
          {draw
            .filter((f) => f.geometry.type === 'LineString')
            .map((f, i) => {
              const pts = (f.geometry as { coordinates: [number, number][] }).coordinates
                .map(([lng, lat]) => project(lng, lat).join(','))
                .join(' ');
              const done = f.properties?.status === 'completed';
              return (
                <polyline
                  key={`r-${i}`}
                  points={pts}
                  fill="none"
                  stroke={done ? '#22c55e' : '#06b6d4'}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.9"
                />
              );
            })}
          {draw
            .filter((f) => f.geometry.type === 'Point')
            .map((f, i) => {
              const [lng, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
              const [x, y] = project(lng, lat);
              const shelter = f.properties?.kind === 'shelter';
              return (
                <g key={`p-${i}`}>
                  <circle
                    cx={x}
                    cy={y}
                    r={10}
                    fill={shelter ? '#22c55e' : '#ef4444'}
                    stroke="#e2e8f0"
                    strokeWidth="2"
                  />
                  <text
                    x={x}
                    y={y + 24}
                    textAnchor="middle"
                    fill="#cbd5e1"
                    fontSize="14"
                  >
                    {String(f.properties?.name || '')}
                  </text>
                </g>
              );
            })}
        </svg>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          暂无路线/安置点坐标
        </div>
      )}
      <div className="absolute left-3 top-3 max-w-sm rounded-lg bg-card/90 px-3 py-2 text-xs backdrop-blur">
        <p className="text-white">GIS 预览（后端 GeoJSON）</p>
        <p className="mt-1 text-muted-foreground">
          配置 <code className="text-cyan-400">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> 后切换为
          Mapbox 底图
        </p>
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex gap-3 rounded-lg bg-card/90 px-3 py-2 text-xs backdrop-blur">
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-red-500" /> 隐患点
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-cyan-500" /> 转移路线
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-green-500" /> 安置点
      </span>
    </div>
  );
}

export function EvacuationMap({
  geojson,
  highlightTaskId,
  className,
  heightClass = 'h-80',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [error, setError] = useState('');
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

  useEffect(() => {
    if (!containerRef.current || !token) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [104.07, 30.58],
      zoom: 11,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('evacuation', {
        type: 'geojson',
        data: EMPTY,
      });

      map.addLayer({
        id: 'evacuation-route-glow',
        type: 'line',
        source: 'evacuation',
        filter: ['==', ['get', 'kind'], 'route'],
        paint: {
          'line-color': '#22d3ee',
          'line-width': 8,
          'line-opacity': 0.25,
          'line-blur': 2,
        },
      });
      map.addLayer({
        id: 'evacuation-route',
        type: 'line',
        source: 'evacuation',
        filter: ['==', ['get', 'kind'], 'route'],
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'status'], 'completed'],
            '#22c55e',
            ['==', ['get', 'status'], 'ongoing'],
            '#06b6d4',
            '#eab308',
          ],
          'line-width': 3.5,
          'line-opacity': 0.95,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: 'evacuation-hazard',
        type: 'circle',
        source: 'evacuation',
        filter: ['==', ['get', 'kind'], 'hazard'],
        paint: {
          'circle-radius': 8,
          'circle-color': '#ef4444',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fecaca',
        },
      });
      map.addLayer({
        id: 'evacuation-shelter',
        type: 'circle',
        source: 'evacuation',
        filter: ['==', ['get', 'kind'], 'shelter'],
        paint: {
          'circle-radius': 8,
          'circle-color': '#22c55e',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#bbf7d0',
        },
      });
      map.addLayer({
        id: 'evacuation-labels',
        type: 'symbol',
        source: 'evacuation',
        filter: ['in', ['get', 'kind'], ['literal', ['hazard', 'shelter']]],
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#e2e8f0',
          'text-halo-color': '#020617',
          'text-halo-width': 1.2,
        },
      });

      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
      const showPopup = (e: mapboxgl.MapLayerMouseEvent) => {
        const f = e.features?.[0];
        const props = (f as { properties?: Record<string, unknown> } | undefined)?.properties;
        if (!props) return;
        const kind = String(props.kind || '');
        const title =
          kind === 'route' ? '转移路线' : kind === 'shelter' ? '安置点' : '隐患点';
        const html = `
          <div style="font:12px/1.4 system-ui;color:#0f172a;min-width:140px">
            <div style="font-weight:600;margin-bottom:4px">${title}</div>
            <div>${String(props.name || '')}</div>
            ${props.distance_km != null ? `<div>距离 ${props.distance_km} km · 约 ${props.estimated_time || '-'} min</div>` : ''}
            ${props.address ? `<div style="color:#64748b">${String(props.address)}</div>` : ''}
            ${props.task_code ? `<div style="color:#0891b2;margin-top:2px">${String(props.task_code)}</div>` : ''}
          </div>
        `;
        popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
      };
      ['evacuation-route', 'evacuation-hazard', 'evacuation-shelter'].forEach((id) => {
        map.on('mouseenter', id, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', id, () => {
          map.getCanvas().style.cursor = '';
          popup.remove();
        });
        map.on('mousemove', id, showPopup);
      });
    });

    map.on('error', (e) => {
      const msg = e.error?.message || 'Mapbox 加载失败';
      if (msg.toLowerCase().includes('access token')) {
        setError('Mapbox Token 无效，请检查 NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN');
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !token) return;
    const data = geojson || EMPTY;

    const apply = () => {
      const source = map.getSource('evacuation') as mapboxgl.GeoJSONSource | undefined;
      if (!source) return;

      let filtered = data;
      if (highlightTaskId != null) {
        filtered = {
          type: 'FeatureCollection',
          features: data.features.filter(
            (f) => Number(f.properties?.task_id) === highlightTaskId
          ),
        };
        if (filtered.features.length === 0) filtered = data;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      source.setData(filtered as any);

      const b = boundsFromGeoJSON(filtered);
      if (b) {
        map.fitBounds(b, { padding: 56, maxZoom: 13, duration: 600 });
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [geojson, highlightTaskId, token]);

  if (!token) {
    return (
      <GeoPreview
        data={geojson || EMPTY}
        highlightTaskId={highlightTaskId}
        heightClass={heightClass}
        className={className}
      />
    );
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-border',
        heightClass,
        className
      )}
    >
      <div ref={containerRef} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-x-0 top-0 z-10 bg-red-500/90 px-3 py-2 text-xs text-white">
          {error}
        </div>
      )}
      <Legend />
    </div>
  );
}
