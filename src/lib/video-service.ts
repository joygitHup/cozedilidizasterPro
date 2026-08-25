export type VideoCamera = {
  id: string;
  code: string;
  name: string;
  location: string;
  description?: string;
  device_code?: string | null;
  enabled: boolean;
  status: 'online' | 'offline' | 'disabled';
  rtsp_url: string;
  hls_url: string;
  hls_direct_url?: string;
  whep_url?: string;
  rtsp_path: string;
};

export type VideoCameraList = {
  count: number;
  online: number;
  offline: number;
  results: VideoCamera[];
};

export async function getVideoCameras(probe = true): Promise<VideoCameraList> {
  const res = await fetch(`/video-api/api/video/cameras/?probe=${probe ? 'true' : 'false'}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = await res.json();
      detail = err.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === 'string' ? detail : '视频服务不可用');
  }
  return res.json();
}

export async function getVideoCamera(id: string): Promise<VideoCamera> {
  const res = await fetch(`/video-api/api/video/cameras/${id}/`, { cache: 'no-store' });
  if (!res.ok) throw new Error('摄像头不存在或视频服务不可用');
  return res.json();
}

export async function getVideoHealth(): Promise<{ ok: boolean; mediamtx_hls?: string }> {
  const res = await fetch('/video-api/health', { cache: 'no-store' });
  if (!res.ok) throw new Error('视频服务不可用');
  return res.json();
}
