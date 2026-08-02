import { Radio } from 'lucide-react';

export default function VideoPage() {
  const cameras = [
    { id: 'CAM-001', name: '竹林坡-1号', location: '竹林坡', status: 'online' },
    { id: 'CAM-002', name: '竹林坡-2号', location: '竹林坡', status: 'online' },
    { id: 'CAM-003', name: '石桥崖-1号', location: '石桥崖', status: 'online' },
    { id: 'CAM-004', name: '李家坪-1号', location: '李家坪', status: 'offline' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Radio className="h-4 w-4" />
        <span>监测感知网络</span><span>/</span><span className="text-white">视频监控</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {cameras.map((cam) => (
          <div key={cam.id} className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="relative aspect-video bg-slate-900 flex items-center justify-center">
              <div className="text-center">
                <Radio className={`mx-auto h-10 w-10 ${cam.status === 'online' ? 'text-green-500/50' : 'text-slate-600'}`} />
                <p className="mt-2 text-xs text-muted-foreground">{cam.status === 'online' ? '视频流加载中...' : '设备离线'}</p>
              </div>
              {cam.status === 'online' && (
                <div className="absolute top-2 left-2 flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-[10px] text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> LIVE
                </div>
              )}
            </div>
            <div className="p-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-white">{cam.name}</p>
                <p className="text-xs text-muted-foreground">{cam.location}</p>
              </div>
              <span className={`h-2 w-2 rounded-full ${cam.status === 'online' ? 'bg-green-500' : 'bg-red-500'}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
