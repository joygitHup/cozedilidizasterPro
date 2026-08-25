"""基于角色的细粒度权限"""
from __future__ import annotations

from rest_framework.permissions import BasePermission, SAFE_METHODS

# 模块 → 允许写操作的角色
WRITE_ROLES = {
    'users': {'admin'},
    'hazard': {'admin', 'leader', 'operator'},
    'monitoring': {'admin', 'leader', 'operator'},
    'warning': {'admin', 'leader', 'operator'},
    'emergency': {'admin', 'leader', 'operator'},
    'ecology': {'admin', 'leader', 'operator'},
    'equipment': {'admin', 'leader', 'operator'},
    'geology': {'admin', 'leader', 'operator'},
    'platform': {'admin', 'leader'},
    'inspection': {'admin', 'leader', 'operator', 'grid_worker'},
    'dashboard': {'admin', 'leader', 'operator', 'grid_worker', 'viewer'},
    'statistics': {'admin', 'leader', 'operator', 'viewer'},
}

# 菜单/模块可见角色
VIEW_ROLES = {
    'users': {'admin'},
    'hazard': {'admin', 'leader', 'operator', 'grid_worker', 'viewer'},
    'monitoring': {'admin', 'leader', 'operator', 'viewer'},
    'warning': {'admin', 'leader', 'operator', 'viewer'},
    'emergency': {'admin', 'leader', 'operator', 'viewer'},
    'ecology': {'admin', 'leader', 'operator', 'viewer'},
    'equipment': {'admin', 'leader', 'operator', 'viewer'},
    'geology': {'admin', 'leader', 'operator', 'viewer'},
    'platform': {'admin', 'leader', 'operator', 'viewer'},
    'inspection': {'admin', 'leader', 'operator', 'grid_worker', 'viewer'},
    'dashboard': {'admin', 'leader', 'operator', 'grid_worker', 'viewer'},
    'statistics': {'admin', 'leader', 'operator', 'viewer'},
    'system': {'admin', 'leader'},
}


def resolve_module(path: str) -> str | None:
    p = path or ''
    mapping = (
        ('/api/users', 'users'),
        ('/api/hazard', 'hazard'),
        ('/api/monitoring', 'monitoring'),
        ('/api/warning', 'warning'),
        ('/api/emergency', 'emergency'),
        ('/api/ecology', 'ecology'),
        ('/api/equipment', 'equipment'),
        ('/api/geology', 'geology'),
        ('/api/platform', 'platform'),
        ('/api/dashboard', 'dashboard'),
        ('/api/statistics', 'statistics'),
    )
    for prefix, mod in mapping:
        if p.startswith(prefix):
            return mod
    return None


def role_can_view(role: str, module: str) -> bool:
    if role == 'admin':
        return True
    return role in VIEW_ROLES.get(module, set())


def role_can_write(role: str, module: str) -> bool:
    if role == 'admin':
        return True
    return role in WRITE_ROLES.get(module, set())


def permissions_payload(role: str) -> dict:
    modules = sorted(set(VIEW_ROLES) | set(WRITE_ROLES))
    return {
        'role': role,
        'modules': {
            m: {
                'view': role_can_view(role, m),
                'write': role_can_write(role, m),
            }
            for m in modules
        },
    }


class RoleActionPermission(BasePermission):
    """
    已登录可读（按模块可见性）；写操作校验 WRITE_ROLES。
    ingest 等 AllowAny 视图不受影响。
    """

    message = '当前角色无权执行此操作'

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        role = getattr(user, 'role', '') or 'viewer'
        if role == 'admin' or user.is_superuser:
            return True

        module = resolve_module(request.path)
        if not module:
            return True  # 未知模块保持登录即可

        if request.method in SAFE_METHODS:
            return role_can_view(role, module)

        # 部分只读动作
        action = getattr(view, 'action', None)
        if action in (
            'export', 'statistics', 'next_code', 'latest', 'related',
            'map_geojson', 'shelters', 'permissions',
        ):
            return role_can_view(role, module)

        return role_can_write(role, module)
