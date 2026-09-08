"""
Django settings for 边坡地质灾害智能预防管控平台
"""

from pathlib import Path
from datetime import timedelta
import os

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
# 优先加载仓库根目录 .env，其次 backend/.env
load_dotenv(BASE_DIR.parent / '.env')
load_dotenv(BASE_DIR / '.env')

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'django-insecure-dev-key-change-in-production')

DEBUG = os.getenv('DEBUG', 'True').lower() == 'true'

ALLOWED_HOSTS = [
    h.strip() for h in os.getenv('ALLOWED_HOSTS', '*').split(',') if h.strip()
]
if not DEBUG and ALLOWED_HOSTS == ['*']:
    # 生产禁止通配；未配置时回退本机
    ALLOWED_HOSTS = [
        h.strip()
        for h in os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')
        if h.strip()
    ]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_filters',
    'users.apps.UsersConfig',
    'hazard.apps.HazardConfig',
    'monitoring.apps.MonitoringConfig',
    'warning.apps.WarningConfig',
    'emergency.apps.EmergencyConfig',
    'ecology.apps.EcologyConfig',
    'equipment.apps.EquipmentConfig',
    'geology.apps.GeologyConfig',
    'syshub.apps.SyshubConfig',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'config.csrf.DisableCSRFForAPIMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    # 网关：鉴权后限流（可按用户）→ 审计
    'config.gateway.ApiRateLimitMiddleware',
    'config.gateway.ApiAuditMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = os.getenv('DJANGO_ROOT_URLCONF', 'config.urls')
# 微服务进程示例：
#   DJANGO_ROOT_URLCONF=config.urls_core     → :8000 核心台账
#   DJANGO_ROOT_URLCONF=config.urls_monitor  → :8001 监测
#   DJANGO_ROOT_URLCONF=config.urls_warning  → :8002 预警
SERVICE_NAME = os.getenv('SERVICE_NAME', 'monolith')

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# ---------- 数据库切换：sqlite | postgres ----------
# 生产（DEBUG=False）默认 postgres，避免 SQLite 并发锁库
_db_default = 'postgres' if not DEBUG else 'sqlite'
DB_ENGINE = os.getenv('DB_ENGINE', _db_default).lower()

if DB_ENGINE == 'postgres':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('DB_NAME', 'geohazard'),
            'USER': os.getenv('DB_USER', 'geohazard_user'),
            'PASSWORD': os.getenv('DB_PASSWORD', 'geohazard_pass'),
            'HOST': os.getenv('DB_HOST', '127.0.0.1'),
            'PORT': os.getenv('DB_PORT', '5432'),
            'CONN_MAX_AGE': int(os.getenv('DB_CONN_MAX_AGE', '60')),
            'OPTIONS': {
                'connect_timeout': int(os.getenv('DB_CONNECT_TIMEOUT', '10')),
            },
        }
    }
else:
    if not DEBUG:
        import warnings

        warnings.warn(
            '生产环境仍使用 SQLite（DB_ENGINE=sqlite），并发 ingest/Celery 易锁库；请改为 DB_ENGINE=postgres',
            RuntimeWarning,
            stacklevel=1,
        )
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
            'OPTIONS': {
                'timeout': int(os.getenv('SQLITE_TIMEOUT', '30')),
            },
        }
    }

# ---------- 缓存：优先 REDIS_URL；未配置则连本机已有 Redis（db3），不再新装 ----------
REDIS_URL = os.getenv('REDIS_URL', '').strip() or os.getenv(
    'REDIS_URL_FALLBACK', 'redis://127.0.0.1:6379/3'
).strip()
# 开发可忽略瞬时异常；生产默认不忽略，避免「假离线」与库不一致被静默吞掉
_redis_ignore = os.getenv(
    'REDIS_IGNORE_EXCEPTIONS',
    'true' if DEBUG else 'false',
).lower() == 'true'
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': REDIS_URL,
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
            'IGNORE_EXCEPTIONS': _redis_ignore,
            'SOCKET_CONNECT_TIMEOUT': int(os.getenv('REDIS_CONNECT_TIMEOUT', '2')),
            'SOCKET_TIMEOUT': int(os.getenv('REDIS_SOCKET_TIMEOUT', '2')),
        },
        'KEY_PREFIX': os.getenv('REDIS_KEY_PREFIX', 'geohazard'),
    }
}
REDIS_IGNORE_EXCEPTIONS = _redis_ignore

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'zh-hans'
TIME_ZONE = 'Asia/Shanghai'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# CORS：开发可全开；生产必须显式白名单
_cors_origins = [
    o.strip() for o in os.getenv('CORS_ALLOWED_ORIGINS', '').split(',') if o.strip()
]
_default_front_origins = [
    'http://localhost:5000',
    'http://127.0.0.1:5000',
]
if DEBUG and os.getenv('CORS_ALLOW_ALL', 'true').lower() == 'true':
    CORS_ALLOW_ALL_ORIGINS = True
    CORS_ALLOWED_ORIGINS = _cors_origins
else:
    CORS_ALLOW_ALL_ORIGINS = False
    CORS_ALLOWED_ORIGINS = _cors_origins or _default_front_origins
CORS_ALLOW_CREDENTIALS = True

# Django 4+：带 Origin 的请求需显式信任前端来源（SessionAuthentication / Cookie 场景）
CSRF_TRUSTED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        'CSRF_TRUSTED_ORIGINS',
        ','.join(_cors_origins or _default_front_origins),
    ).split(',')
    if o.strip()
]
if DEBUG:
    for _o in _default_front_origins:
        if _o not in CSRF_TRUSTED_ORIGINS:
            CSRF_TRUSTED_ORIGINS.append(_o)

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        # SPA / 移动端统一 JWT；不用 Session，避免 CSRF token missing
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
        'users.permissions.RoleActionPermission',
    ],
    'DEFAULT_PAGINATION_CLASS': 'config.pagination.StandardPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DATETIME_FORMAT': '%Y-%m-%d %H:%M:%S',
    'DATE_FORMAT': '%Y-%m-%d',
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=int(os.getenv('JWT_ACCESS_HOURS', '12'))),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=int(os.getenv('JWT_REFRESH_DAYS', '7'))),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

AUTH_USER_MODEL = 'users.User'

# ---------- 时序库：postgres | influxdb | tdengine ----------
# 业务元数据在 Postgres；监测曲线默认走 InfluxDB（Docker）
TSDB_BACKEND = os.getenv('TSDB_BACKEND', 'postgres').lower().strip()
TSDB_DUAL_WRITE = os.getenv('TSDB_DUAL_WRITE', 'true').lower() == 'true'
INFLUXDB_CONFIG = {
    'URL': os.getenv('INFLUXDB_URL', 'http://127.0.0.1:8086'),
    'TOKEN': os.getenv('INFLUXDB_TOKEN', 'geohazard-influx-dev-token'),
    'ORG': os.getenv('INFLUXDB_ORG', 'geohazard'),
    'BUCKET': os.getenv('INFLUXDB_BUCKET', 'monitor'),
    'TIMEOUT_MS': int(os.getenv('INFLUXDB_TIMEOUT_MS', '10000')),
}
TDENGINE_CONFIG = {
    'HOST': os.getenv('TDENGINE_HOST', '127.0.0.1'),
    'PORT': int(os.getenv('TDENGINE_PORT', '6030')),
    'USER': os.getenv('TDENGINE_USER', 'root'),
    'PASSWORD': os.getenv('TDENGINE_PASSWORD', 'taosdata'),
    'DATABASE': os.getenv('TDENGINE_DB', 'geohazard_monitor'),
    'KEEP': int(os.getenv('TDENGINE_KEEP', '365')),
    'DURATION': int(os.getenv('TDENGINE_DURATION', '10')),
    'BUFFER': int(os.getenv('TDENGINE_BUFFER', '16')),
}

# ---------- 网关（限流 / 审计；Nginx 侧见 deploy/nginx） ----------
GATEWAY_TRUST_X_FORWARDED = os.getenv('GATEWAY_TRUST_X_FORWARDED', 'false').lower() == 'true'
GATEWAY_RATE_LIMIT_ENABLED = os.getenv('GATEWAY_RATE_LIMIT_ENABLED', 'true').lower() == 'true'
GATEWAY_API_RATE_LIMIT = int(os.getenv('GATEWAY_API_RATE_LIMIT', '300'))  # 每窗口次数
GATEWAY_API_RATE_WINDOW = int(os.getenv('GATEWAY_API_RATE_WINDOW', '60'))  # 秒
GATEWAY_LOGIN_RATE_LIMIT = int(os.getenv('GATEWAY_LOGIN_RATE_LIMIT', '30'))
GATEWAY_LOGIN_RATE_WINDOW = int(os.getenv('GATEWAY_LOGIN_RATE_WINDOW', '60'))
# 开发环境默认关闭 API 限流（驾驶舱轮询易触发）；生产请保持开启。
# 若开发也要测限流：GATEWAY_RATE_LIMIT_FORCE=true
if DEBUG and os.getenv('GATEWAY_RATE_LIMIT_FORCE', '').lower() not in ('1', 'true', 'yes'):
    GATEWAY_RATE_LIMIT_ENABLED = False
GATEWAY_RATE_LIMIT_SKIP_PREFIXES = [
    p.strip()
    for p in os.getenv(
        'GATEWAY_RATE_LIMIT_SKIP_PREFIXES',
        '/api/monitoring/ingest/',
    ).split(',')
    if p.strip()
]
GATEWAY_AUDIT_ENABLED = os.getenv('GATEWAY_AUDIT_ENABLED', 'true').lower() == 'true'
GATEWAY_AUDIT_DB = os.getenv('GATEWAY_AUDIT_DB', 'true').lower() == 'true'
GATEWAY_AUDIT_ALL = os.getenv('GATEWAY_AUDIT_ALL', 'false').lower() == 'true'
GATEWAY_AUDIT_SKIP_PREFIXES = [
    p.strip()
    for p in os.getenv(
        'GATEWAY_AUDIT_SKIP_PREFIXES',
        '/api/monitoring/ingest/',
    ).split(',')
    if p.strip()
]

# ---------- IoT / MQTT 接入 ----------
MQTT_INGEST_TOKEN = os.getenv('MQTT_INGEST_TOKEN', 'dev-mqtt-ingest-token')
# 支持多 Token 轮换：逗号分隔（优先于单 Token 合并去重）
MQTT_INGEST_TOKENS = os.getenv('MQTT_INGEST_TOKENS', '')
# 仅 DEBUG：无 Token 时是否放行（默认否；本地桥接联调可 true）
MQTT_INGEST_ALLOW_DEBUG_BYPASS = (
    os.getenv('MQTT_INGEST_ALLOW_DEBUG_BYPASS', 'false').lower() in ('1', 'true', 'yes')
)
# 可选来源 IP/CIDR 白名单，逗号分隔；空=不限制（生产建议限制到 bridge 主机）
MQTT_INGEST_ALLOW_IPS = os.getenv('MQTT_INGEST_ALLOW_IPS', '')
MQTT_INGEST_TRUST_X_FORWARDED = os.getenv('MQTT_INGEST_TRUST_X_FORWARDED', 'false').lower() == 'true'
MQTT_INGEST_RATE_LIMIT = int(os.getenv('MQTT_INGEST_RATE_LIMIT', '120'))
MQTT_INGEST_RATE_WINDOW = int(os.getenv('MQTT_INGEST_RATE_WINDOW', '60'))
IOT_ONLINE_TTL_SECONDS = int(os.getenv('IOT_ONLINE_TTL_SECONDS', '180'))
IOT_LATEST_TTL_SECONDS = int(os.getenv('IOT_LATEST_TTL_SECONDS', '86400'))

if not DEBUG and MQTT_INGEST_TOKEN == 'dev-mqtt-ingest-token' and not MQTT_INGEST_TOKENS:
    import warnings

    warnings.warn(
        '生产环境仍使用默认 MQTT_INGEST_TOKEN，ingest 接口将拒绝请求，请在 .env 更换',
        RuntimeWarning,
        stacklevel=1,
    )

# Celery：默认复用本机 Redis db4（避免 RabbitMQ guest/vhost AccessRefused）
# 若本机 RabbitMQ 已授权，可在 .env 设 CELERY_BROKER_URL=amqp://...
CELERY_BROKER_URL = os.getenv(
    'CELERY_BROKER_URL',
    os.getenv('CELERY_BROKER', 'redis://127.0.0.1:6379/4'),
)
CELERY_RESULT_BACKEND = os.getenv(
    'CELERY_RESULT_BACKEND', 'redis://127.0.0.1:6379/4'
).strip()
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 60 * 10
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TASK_ALWAYS_EAGER = os.getenv('CELERY_TASK_ALWAYS_EAGER', 'False').lower() == 'true'

# IoT 链路日志：格式含 trace_id，便于 grep
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'filters': {
        'trace_id': {
            '()': 'monitoring.iot.tracing.TraceIdFilter',
        },
    },
    'formatters': {
        'iot': {
            'format': '%(asctime)s [%(levelname)s] [trace=%(trace_id)s] %(name)s %(message)s',
        },
        'gateway': {
            'format': '%(asctime)s [%(levelname)s] %(name)s %(message)s',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'filters': ['trace_id'],
            'formatter': 'iot',
        },
        'gateway_console': {
            'class': 'logging.StreamHandler',
            'formatter': 'gateway',
        },
    },
    'loggers': {
        'iot.trace': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'monitoring': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'gateway.audit': {
            'handlers': ['gateway_console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}
