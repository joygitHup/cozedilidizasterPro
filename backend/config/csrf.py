"""API 使用 JWT，不依赖 Session CSRF。"""


class DisableCSRFForAPIMiddleware:
    """对 /api/ 路径跳过 CSRF 校验（admin 等仍受保护）。"""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith('/api/'):
            setattr(request, '_dont_enforce_csrf_checks', True)
        return self.get_response(request)
