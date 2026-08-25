from django.db.models import Q
from django.urls import include, path
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.routers import DefaultRouter

from .models import Notification
from .views import (
    NotificationViewSet,
    channels_status_view,
    global_search_view,
    system_config_view,
    weather_view,
)

router = DefaultRouter()
router.register(r'notifications', NotificationViewSet, basename='notification')


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_all_read(request):
    updated = Notification.objects.filter(
        Q(user__isnull=True) | Q(user=request.user),
        is_read=False,
    ).update(is_read=True)
    return Response({'updated': updated})


urlpatterns = [
    path('config/', system_config_view, name='platform-config'),
    path('weather/', weather_view, name='platform-weather'),
    path('channels/', channels_status_view, name='platform-channels'),
    path('search/', global_search_view, name='platform-search'),
    path('notifications/mark-all-read/', mark_all_read, name='notifications-mark-all-read'),
    path('', include(router.urls)),
]
