"""用户视图"""
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from .models import ApiAuditLog, User
from .serializers import UserSerializer, UserListSerializer, LoginSerializer


class UserViewSet(viewsets.ModelViewSet):
    """用户视图集"""
    queryset = User.objects.all().order_by('-date_joined', '-id')
    serializer_class = UserSerializer
    search_fields = ['username', 'first_name', 'last_name', 'phone', 'department']
    filterset_fields = ['role', 'is_active']

    def get_serializer_class(self):
        if self.action == 'list':
            return UserListSerializer
        return UserSerializer

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        if user.id == request.user.id:
            return Response(
                {'detail': '不能删除当前登录账号'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.username == 'admin':
            return Response(
                {'detail': '系统内置管理员账号不可删除'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.role == User.Role.ADMIN:
            admin_count = User.objects.filter(role=User.Role.ADMIN, is_active=True).count()
            if admin_count <= 1:
                return Response(
                    {'detail': '至少保留一名系统管理员'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        username = user.username
        self.perform_destroy(user)
        return Response({'detail': f'已删除用户 {username}'})

    @action(detail=False, methods=['get'])
    def current(self, request):
        """获取当前用户"""
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='audit-logs')
    def audit_logs(self, request):
        """管理员查看 API 审计日志"""
        if not (
            request.user.is_superuser
            or getattr(request.user, 'role', '') == User.Role.ADMIN
        ):
            return Response({'detail': '仅管理员可查看审计日志'}, status=status.HTTP_403_FORBIDDEN)
        qs = ApiAuditLog.objects.all()
        path = request.query_params.get('path')
        username = request.query_params.get('username')
        method = request.query_params.get('method')
        status_code = request.query_params.get('status_code')
        if path:
            qs = qs.filter(path__icontains=path)
        if username:
            qs = qs.filter(username__icontains=username)
        if method:
            qs = qs.filter(method=method.upper())
        if status_code:
            qs = qs.filter(status_code=int(status_code))
        limit = min(int(request.query_params.get('limit', 50)), 200)
        rows = list(qs[:limit])
        return Response({
            'count': len(rows),
            'results': [
                {
                    'id': r.id,
                    'request_id': r.request_id,
                    'username': r.username,
                    'ip': r.ip,
                    'method': r.method,
                    'path': r.path,
                    'query': r.query,
                    'status_code': r.status_code,
                    'duration_ms': r.duration_ms,
                    'created_at': r.created_at,
                }
                for r in rows
            ],
        })


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """POST /api/users/login/"""
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.validated_data['user']
    refresh = RefreshToken.for_user(user)
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': UserSerializer(user).data,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """POST /api/users/logout/ — 刷新令牌加入黑名单"""
    refresh_token = request.data.get('refresh')
    if not refresh_token:
        return Response({'detail': '缺少 refresh token'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        token = RefreshToken(refresh_token)
        token.blacklist()
    except TokenError:
        return Response({'detail': '无效的 refresh token'}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'detail': '已退出登录'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def profile_view(request):
    """GET /api/users/profile/"""
    return Response(UserSerializer(request.user).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_permissions_view(request):
    """GET /api/users/permissions/ — 前端菜单与写权限"""
    from .permissions import permissions_payload

    role = getattr(request.user, 'role', '') or 'viewer'
    return Response(permissions_payload(role))
