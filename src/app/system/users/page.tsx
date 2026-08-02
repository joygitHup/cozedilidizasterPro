import { Shield } from 'lucide-react';

export default function UsersPage() {
  const users = [
    { id: 'U001', name: '张三', role: '系统管理员', dept: '县自然资源局', phone: '138****1234', status: '启用' },
    { id: 'U002', name: '李四', role: '网格员', dept: 'A镇竹林村', phone: '139****5678', status: '启用' },
    { id: 'U003', name: '王五', role: '值班领导', dept: '县应急管理局', phone: '137****9012', status: '启用' },
    { id: 'U004', name: '赵六', role: '技术人员', dept: '县自然资源局', phone: '136****3456', status: '启用' },
    { id: 'U005', name: '孙七', role: '网格员', dept: 'A镇石桥镇', phone: '135****7890', status: '停用' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">用户权限</h1>
        <button className="rounded bg-cyan-600 px-4 py-2 text-sm text-white hover:bg-cyan-500">新增用户</button>
      </div>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">编号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">姓名</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">角色</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">部门</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">联系方式</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs text-cyan-400">{u.id}</td>
                <td className="px-4 py-3 text-white">{u.name}</td>
                <td className="px-4 py-3"><span className="rounded bg-cyan-500/20 px-2 py-0.5 text-xs font-medium text-cyan-400">{u.role}</span></td>
                <td className="px-4 py-3 text-muted-foreground">{u.dept}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{u.phone}</td>
                <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${u.status === '启用' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{u.status}</span></td>
                <td className="px-4 py-3 text-center"><button className="text-xs text-cyan-400 hover:underline">编辑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
