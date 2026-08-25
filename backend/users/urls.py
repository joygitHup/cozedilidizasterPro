"""用户路由"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, login_view, logout_view, my_permissions_view, profile_view

router = DefaultRouter()
# 挂在 /api/users/ 下，列表即为 /api/users/（login/logout/profile 优先匹配）
router.register(r'', UserViewSet, basename='user')

urlpatterns = [
    path('login/', login_view, name='user-login'),
    path('logout/', logout_view, name='user-logout'),
    path('profile/', profile_view, name='user-profile'),
    path('permissions/', my_permissions_view, name='user-permissions'),
    path('', include(router.urls)),
]
