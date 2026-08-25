"""主路由配置"""
from django.contrib import admin
from django.urls import path, include
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenRefreshView

from config.dashboard import dashboard_overview
from config.statistics import disaster_statistics, performance_statistics


@api_view(['GET'])
@permission_classes([AllowAny])
def api_root(request):
    """API 根路由"""
    from django.conf import settings

    return Response({
        'name': '边坡地质灾害智能预防管控平台 API',
        'version': '1.0.0',
        'service': getattr(settings, 'SERVICE_NAME', 'monolith'),
        'mode': 'monolith' if settings.ROOT_URLCONF == 'config.urls' else 'split',
        'endpoints': {
            'login': '/api/users/login/',
            'logout': '/api/users/logout/',
            'profile': '/api/users/profile/',
            'token_refresh': '/api/users/token/refresh/',
            'dashboard': '/api/dashboard/overview/',
            'statistics_disaster': '/api/statistics/disaster/',
            'statistics_performance': '/api/statistics/performance/',
            'users': '/api/users/',
            'hazard': '/api/hazard/',
            'monitoring': '/api/monitoring/',
            'warning': '/api/warning/',
            'emergency': '/api/emergency/',
            'ecology': '/api/ecology/',
            'platform': '/api/platform/',
            'admin': '/admin/',
            'gateway_hint': '微服务入口默认 http://127.0.0.1:8088 （scripts/start-microservices.ps1）',
        }
    })


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', api_root, name='api-root'),
    path('api/dashboard/overview/', dashboard_overview, name='dashboard-overview'),
    path('api/statistics/disaster/', disaster_statistics, name='statistics-disaster'),
    path('api/statistics/performance/', performance_statistics, name='statistics-performance'),
    path('api/users/token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('api/users/', include('users.urls')),
    path('api/hazard/', include('hazard.urls')),
    path('api/monitoring/', include('monitoring.urls')),
    path('api/warning/', include('warning.urls')),
    path('api/emergency/', include('emergency.urls')),
    path('api/ecology/', include('ecology.urls')),
    path('api/equipment/', include('equipment.urls')),
    path('api/geology/', include('geology.urls')),
    path('api/platform/', include('syshub.urls')),
]
