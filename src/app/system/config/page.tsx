import { Settings } from 'lucide-react';

export default function ConfigPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">系统配置</h1>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-4 text-sm font-medium text-white">基本设置</h3>
          <div className="space-y-3">
            <div><label className="text-xs text-muted-foreground">系统名称</label><input className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm text-white" defaultValue="边坡地质灾害智能预防管控平台" /></div>
            <div><label className="text-xs text-muted-foreground">预警阈值(牛顿力)</label><input className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm text-white font-mono" defaultValue="85 MPa" /></div>
            <div><label className="text-xs text-muted-foreground">自动呼叫超时(秒)</label><input className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm text-white font-mono" defaultValue="120" /></div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-4 text-sm font-medium text-white">通知设置</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">短信通知</span><div className="h-5 w-9 rounded-full bg-cyan-600 p-0.5 cursor-pointer"><div className="h-4 w-4 rounded-full bg-white ml-auto" /></div></div>
            <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">电话呼叫</span><div className="h-5 w-9 rounded-full bg-cyan-600 p-0.5 cursor-pointer"><div className="h-4 w-4 rounded-full bg-white ml-auto" /></div></div>
            <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">APP推送</span><div className="h-5 w-9 rounded-full bg-cyan-600 p-0.5 cursor-pointer"><div className="h-4 w-4 rounded-full bg-white ml-auto" /></div></div>
            <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">邮件通知</span><div className="h-5 w-9 rounded-full bg-slate-700 p-0.5 cursor-pointer"><div className="h-4 w-4 rounded-full bg-slate-400" /></div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
