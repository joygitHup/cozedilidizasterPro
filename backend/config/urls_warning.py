"""预警域 URL（微服务进程专用）"""
from django.contrib import admin
from django.urls import path, include
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(['GET'])
@permission_classes([AllowAny])
def health(request):
    return Response({'ok': True, 'service': 'warning'})


urlpatterns = [
    path('health/', health),
    path('admin/', admin.site.urls),
    path('api/warning/', include('warning.urls')),
]
