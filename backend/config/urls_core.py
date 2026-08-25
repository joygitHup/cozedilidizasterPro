"""核心域 URL：用户/隐患/应急/生态/驾驶舱（不含监测与预警）"""
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
    return Response({
        'name': '边坡灾害平台 · Core Service',
        'service': 'core',
        'version': '1.0.0',
        'endpoints': {
            'login': '/api/users/login/',
            'users': '/api/users/',
            'hazard': '/api/hazard/',
            'emergency': '/api/emergency/',
            'ecology': '/api/ecology/',
            'equipment': '/api/equipment/',
            'geology': '/api/geology/',
            'platform': '/api/platform/',
            'dashboard': '/api/dashboard/overview/',
        },
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
    path('api/emergency/', include('emergency.urls')),
    path('api/ecology/', include('ecology.urls')),
    path('api/equipment/', include('equipment.urls')),
    path('api/geology/', include('geology.urls')),
    path('api/platform/', include('syshub.urls')),
]
