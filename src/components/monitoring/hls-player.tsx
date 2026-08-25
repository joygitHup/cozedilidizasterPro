'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Loader2, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  src: string;
  className?: string;
  poster?: string;
  muted?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  onError?: (message: string) => void;
};

export function HlsPlayer({
  src,
  className,
  poster,
  muted = true,
  onPlayingChange,
  onError,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'loading' | 'playing' | 'error'>('loading');
  const [err, setErr] = useState('');

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let hls: Hls | null = null;
    let disposed = false;
    setState('loading');
    setErr('');
    onPlayingChange?.(false);

    const onPlay = () => {
      if (disposed) return;
      setState('playing');
      onPlayingChange?.(true);
    };
    const fail = (msg: string) => {
      if (disposed) return;
      setState('error');
      setErr(msg);
      onPlayingChange?.(false);
      onError?.(msg);
    };

    video.addEventListener('playing', onPlay);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.play().catch(() => {
        /* autoplay may be blocked; muted should allow */
      });
    } else if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        liveDurationInfinity: true,
        backBufferLength: 30,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => undefined);
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls?.startLoad();
          return;
        }
        fail(data.details || '视频流播放失败');
      });
    } else {
      fail('当前浏览器不支持 HLS 播放');
    }

    return () => {
      disposed = true;
      video.removeEventListener('playing', onPlay);
      if (hls) {
        hls.destroy();
        hls = null;
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [src, onPlayingChange, onError]);

  return (
    <div className={cn('relative aspect-video bg-slate-950', className)}>
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        muted={muted}
        playsInline
        controls
        poster={poster}
      />
      {state === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-slate-950/50">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          <p className="mt-2 text-xs text-muted-foreground">视频流加载中...</p>
        </div>
      )}
      {state === 'error' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80">
          <WifiOff className="h-8 w-8 text-slate-500" />
          <p className="mt-2 text-xs text-red-400">{err || '离线或无法拉流'}</p>
        </div>
      )}
    </div>
  );
}
