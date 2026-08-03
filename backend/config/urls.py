"""主路由配置"""
from django.contrib import admin
from django.urls import path, include
from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(['GET'])
def api_root(request):
    """API 根路由"""
    return Response({
        'name': '边坡地质灾害智能预防管控平台 API',
        'version': '1.0.0',
        'endpoints': {
            'users': '/api/users/',
            'hazard': '/api/hazard/',
            'monitoring': '/api/monitoring/',
            'warning': '/api/warning/',
            'emergency': '/api/emergency/',
            'admin': '/admin/',
        }
    })


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', api_root, name='api-root'),
    path('api/users/', include('users.urls')),
    path('api/hazard/', include('hazard.urls')),
    path('api/monitoring/', include('monitoring.urls')),
    path('api/warning/', include('warning.urls')),
    path('api/emergency/', include('emergency.urls')),
]
