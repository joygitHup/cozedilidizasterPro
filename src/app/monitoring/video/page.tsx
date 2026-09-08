'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Maximize2,
  Loader2,
  Video,
  Wifi,
  WifiOff,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
} from 'lucide-react';
import { HlsPlayer } from '@/components/monitoring/hls-player';
import {
  getVideoCameras,
  getVideoHealth,
  type VideoCamera,
} from '@/lib/video-service';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';

/** 宫格窗口数：1 / 4 / 9 / 16 */
const GRID_OPTIONS = [
  { cells: 1, cols: 1, label: '1屏', short: '1' },
  { cells: 4, cols: 2, label: '4分屏', short: '4' },
  { cells: 9, cols: 3, label: '9分屏', short: '9' },
  { cells: 16, cols: 4, label: '16分屏', short: '16' },
] as const;

type GridCells = (typeof GRID_OPTIONS)[number]['cells'];

const GRID_STORAGE_KEY = 'geohazard_video_grid_cells';

function loadGridCells(): GridCells {
  if (typeof window === 'undefined') return 4;
  const raw = Number(localStorage.getItem(GRID_STORAGE_KEY));
  if (GRID_OPTIONS.some((o) => o.cells === raw)) return raw as GridCells;
  return 4;
}

export default function VideoPage() {
  const [cameras, setCameras] = useState<VideoCamera[]>([]);
  const [online, setOnline] = useState(0);
  const [selected, setSelected] = useState<VideoCamera | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [serviceOk, setServiceOk] = useState(false);
  const [mode, setMode] = useState<'grid' | 'focus'>('grid');
  const [gridCells, setGridCells] = useState<GridCells>(4);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setGridCells(loadGridCells());
  }, []);

  const gridMeta = GRID_OPTIONS.find((o) => o.cells === gridCells) ?? GRID_OPTIONS[1];
  const totalPages = Math.max(1, Math.ceil(cameras.length / gridCells));

  useEffect(() => {
    if (page >= totalPages) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  const pageCameras = useMemo(() => {
    const start = page * gridCells;
    return cameras.slice(start, start + gridCells);
  }, [cameras, page, gridCells]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await getVideoHealth();
      setServiceOk(true);
      const data = await getVideoCameras(true);
      setCameras(data.results);
      setOnline(data.online);
      setSelected((prev) => {
        if (prev) {
          const found = data.results.find((c) => c.id === prev.id);
          return found || data.results[0] || null;
        }
        return data.results.find((c) => c.status === 'online') || data.results[0] || null;
      });
    } catch (e) {
      setServiceOk(false);
      setCameras([]);
      setError(
        e instanceof Error
          ? e.message
          : '视频服务未启动。请先运行 scripts/start-video.ps1，并确保 MediaMTX + ffmpeg 推流正常。'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const changeGrid = (cells: GridCells) => {
    setGridCells(cells);
    setPage(0);
    setMode('grid');
    try {
      localStorage.setItem(GRID_STORAGE_KEY, String(cells));
    } catch {
      /* ignore */
    }
  };

  const compact = gridCells >= 9;

  return (
    <div className="space-y-4">
      <PageHeader>
          <span
            className={cn(
              'rounded-lg border px-2.5 py-1 text-xs',
              serviceOk
                ? 'border-green-500/30 text-green-400'
                : 'border-red-500/30 text-red-400'
            )}
          >
            视频服务 {serviceOk ? '已连接' : '离线'}
          </span>
          <span className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground">
            在线 {online}/{cameras.length}
          </span>

          {/* 分屏切换 */}
          <div className="flex h-9 items-center rounded-lg border border-border bg-card p-0.5">
            <span className="hidden items-center gap-1 px-2 text-xs text-muted-foreground sm:flex">
              <LayoutGrid className="h-3.5 w-3.5" /> 分屏
            </span>
            {GRID_OPTIONS.map((opt) => (
              <button
                key={opt.cells}
                type="button"
                title={opt.label}
                onClick={() => changeGrid(opt.cells)}
                className={cn(
                  'min-w-9 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  mode === 'grid' && gridCells === opt.cells
                    ? 'bg-cyan-600 text-white'
                    : 'text-muted-foreground hover:bg-accent hover:text-white'
                )}
              >
                {opt.short}
              </button>
            ))}
          </div>

          <button
            onClick={() => setMode((v) => (v === 'grid' ? 'focus' : 'grid'))}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm',
              mode === 'focus'
                ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
                : 'border-border bg-card hover:bg-accent'
            )}
          >
            <Maximize2 className="h-4 w-4" />
            {mode === 'focus' ? '退出聚焦' : '聚焦'}
          </button>
          <button
            onClick={load}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm hover:bg-accent"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> 刷新
          </button>
      </PageHeader>

      {error && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <p className="font-medium">无法连接视频服务</p>
          <p className="mt-1 text-xs text-amber-200/80">{error}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            1) 确认 MediaMTX 已开（8554/8888）　2) ffmpeg 推流到 rtsp://127.0.0.1:8554/cam1　3)
            在项目根目录执行{' '}
            <code className="text-cyan-400">powershell -File .\scripts\start-video.ps1</code>
            ，并重启前端使代理生效
          </p>
        </div>
      )}

      {loading && cameras.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
        </div>
      ) : mode === 'focus' && selected ? (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="rounded-lg border border-border bg-card p-2">
            <h4 className="mb-2 px-2 text-xs font-semibold uppercase text-muted-foreground">
              通道列表
            </h4>
            <div className="max-h-[70vh] space-y-1 overflow-y-auto">
              {cameras.map((cam) => (
                <button
                  key={cam.id}
                  onClick={() => setSelected(cam)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                    selected.id === cam.id
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'text-slate-300 hover:bg-accent'
                  )}
                >
                  {cam.status === 'online' ? (
                    <Wifi className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 text-red-400" />
                  )}
                  <span className="truncate">{cam.name}</span>
                </button>
              ))}
            </div>
          </div>
          <CameraCard cam={selected} active large compact={false} onSelect={() => undefined} />
        </div>
      ) : (
        <div className="space-y-3">
          <div
            className={cn(
              'grid gap-2 sm:gap-3',
              gridMeta.cols === 1 && 'grid-cols-1',
              gridMeta.cols === 2 && 'grid-cols-1 sm:grid-cols-2',
              gridMeta.cols === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
              gridMeta.cols === 4 && 'grid-cols-2 lg:grid-cols-4'
            )}
          >
            {pageCameras.map((cam) => (
              <CameraCard
                key={cam.id}
                cam={cam}
                active={selected?.id === cam.id}
                compact={compact}
                large={gridCells === 1}
                onSelect={() => {
                  setSelected(cam);
                  setMode('focus');
                }}
              />
            ))}
            {/* 不足一屏时用空位占满宫格，视觉更整齐 */}
            {Array.from({ length: Math.max(0, gridCells - pageCameras.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-border/60 bg-card/40"
              >
                <span className="text-xs text-muted-foreground/50">空闲窗口</span>
              </div>
            ))}
          </div>

          {cameras.length === 0 && !error && (
            <div className="space-y-2 rounded-lg border border-border bg-card py-16 text-center text-sm text-muted-foreground">
              <p>暂无视频通道。</p>
              <p className="mx-auto max-w-md text-xs leading-relaxed">
                视频列表来自实施配置 <code className="text-cyan-400">services/video/cameras.yaml</code>
                （非设备台账）。请在该文件添加摄像头后重启视频服务；可用{' '}
                <code className="text-cyan-400">device_code</code> 关联「设备管理」中的设备编号。
              </p>
            </div>
          )}

          {cameras.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>
                {gridMeta.label} · 第 {page + 1}/{totalPages} 页 · 本页 {pageCameras.length} 路 /
                共 {cameras.length} 路
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="rounded-lg border border-border p-1.5 hover:bg-accent disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPage(i)}
                    className={cn(
                      'min-w-8 rounded-lg border px-2 py-1 text-xs',
                      i === page
                        ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-400'
                        : 'border-border hover:bg-accent'
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  className="rounded-lg border border-border p-1.5 hover:bg-accent disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CameraCard({
  cam,
  active,
  large,
  compact,
  onSelect,
}: {
  cam: VideoCamera;
  active?: boolean;
  large?: boolean;
  compact?: boolean;
  onSelect: () => void;
}) {
  const online = cam.status === 'online';

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border bg-card',
        active ? 'border-cyan-500/50' : 'border-border'
      )}
    >
      <div className="relative">
        {online ? (
          <HlsPlayer src={cam.hls_url} className={large ? 'min-h-[420px]' : undefined} />
        ) : (
          <div
            className={cn(
              'flex aspect-video items-center justify-center bg-slate-900',
              large && 'min-h-[420px]'
            )}
          >
            <div className="text-center px-2">
              <Video className={cn('mx-auto text-slate-600', compact ? 'h-6 w-6' : 'h-10 w-10')} />
              <p className={cn('mt-1 text-muted-foreground', compact ? 'text-[10px]' : 'text-xs')}>
                {cam.status === 'disabled' ? '已禁用' : '离线'}
              </p>
            </div>
          </div>
        )}
        {online && (
          <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-[10px] text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
          </div>
        )}
      </div>
      <div
        className={cn(
          'flex items-center justify-between gap-2',
          compact ? 'px-2 py-1.5' : 'p-3'
        )}
      >
        <button onClick={onSelect} className="min-w-0 text-left">
          <p className={cn('truncate text-white', compact ? 'text-xs' : 'text-sm')}>{cam.name}</p>
          {!compact && (
            <p className="text-xs text-muted-foreground">
              {cam.code} · {cam.location}
              {cam.device_code ? ` · 设备 ${cam.device_code}` : ''}
            </p>
          )}
        </button>
        <span
          className={cn(
            'h-2.5 w-2.5 shrink-0 rounded-full',
            online ? 'bg-green-500' : 'bg-red-500'
          )}
        />
      </div>
    </div>
  );
}
