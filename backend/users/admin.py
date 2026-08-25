from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import ApiAuditLog, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('username', 'role', 'department', 'phone', 'is_active', 'last_login')
    list_filter = ('role', 'is_active', 'is_staff')
    search_fields = ('username', 'phone', 'department', 'village')
    fieldsets = BaseUserAdmin.fieldsets + (
        ('业务字段', {'fields': ('role', 'phone', 'department', 'village', 'avatar')}),
    )


@admin.register(ApiAuditLog)
class ApiAuditLogAdmin(admin.ModelAdmin):
    list_display = (
        'created_at', 'method', 'path', 'status_code', 'username', 'ip', 'duration_ms', 'request_id',
    )
    list_filter = ('method', 'status_code')
    search_fields = ('path', 'username', 'ip', 'request_id')
    readonly_fields = [f.name for f in ApiAuditLog._meta.fields]
    ordering = ('-created_at',)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
