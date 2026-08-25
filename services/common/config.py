"""Environment configuration shared by microservices."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")
load_dotenv(REPO_ROOT / "backend" / ".env")

DJANGO_SECRET_KEY = os.getenv(
    "DJANGO_SECRET_KEY", "django-insecure-dev-key-change-in-production"
)
INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "geohazard-internal-dev")
REDIS_URL = os.getenv("REDIS_URL", "").strip() or os.getenv(
    "REDIS_URL_FALLBACK", "redis://127.0.0.1:6379/3"
).strip()
REDIS_KEY_PREFIX = os.getenv("REDIS_KEY_PREFIX", "geohazard").strip()
WARNING_PORT = int(os.getenv("WARNING_PORT", "8002"))
MONITOR_PORT = int(os.getenv("MONITOR_PORT", "8001"))


def debug() -> bool:
    return os.getenv("DEBUG", "True").lower() in ("1", "true", "yes")


def build_database_url(service_prefix: str = "WARNING") -> str:
    """Resolve SQLAlchemy URL: service override → DATABASE_URL → env parts → sqlite."""
    override = os.getenv(f"{service_prefix}_DATABASE_URL", "").strip()
    if override:
        return override
    shared = os.getenv("DATABASE_URL", "").strip()
    if shared:
        return shared

    engine = os.getenv("DB_ENGINE", "sqlite").lower().strip()
    if engine == "postgres":
        user = os.getenv("DB_USER", "forest_user")
        password = os.getenv("DB_PASSWORD", "forest_pass")
        host = os.getenv("DB_HOST", "127.0.0.1")
        port = os.getenv("DB_PORT", "5432")
        name = os.getenv("DB_NAME", "geohazard")
        return f"postgresql+psycopg://{user}:{password}@{host}:{port}/{name}"

    sqlite_path = REPO_ROOT / "backend" / "db.sqlite3"
    return f"sqlite:///{sqlite_path.as_posix()}"


def database_url() -> str:
    return build_database_url("CORE")


def monitor_database_url() -> str:
    return build_database_url("MONITOR")


def jwt_secret() -> str:
    return DJANGO_SECRET_KEY


def warning_service_url() -> str:
    return os.getenv("WARNING_SERVICE_URL", "http://127.0.0.1:8002").rstrip("/")


def monitor_port() -> int:
    return MONITOR_PORT


def tsdb_backend() -> str:
    raw = os.getenv("TSDB_BACKEND", "postgres").lower().strip()
    if raw in ("influx", "influxdb2"):
        return "influxdb"
    return raw


def tsdb_dual_write() -> bool:
    if not external_tsdb_enabled():
        return True
    return os.getenv("TSDB_DUAL_WRITE", "true").lower() in ("1", "true", "yes")


def external_tsdb_enabled() -> bool:
    return tsdb_backend() in ("influxdb", "tdengine")


def influxdb_config() -> dict:
    return {
        "URL": os.getenv("INFLUXDB_URL", "http://127.0.0.1:8086"),
        "TOKEN": os.getenv("INFLUXDB_TOKEN", "geohazard-influx-dev-token"),
        "ORG": os.getenv("INFLUXDB_ORG", "geohazard"),
        "BUCKET": os.getenv("INFLUXDB_BUCKET", "monitor"),
        "TIMEOUT_MS": int(os.getenv("INFLUXDB_TIMEOUT_MS", "10000") or "10000"),
    }


def mqtt_ingest_tokens() -> list[str]:
    raw = os.getenv("MQTT_INGEST_TOKENS", "").strip()
    single = os.getenv("MQTT_INGEST_TOKEN", "").strip()
    tokens: list[str] = []
    if raw:
        tokens.extend(t.strip() for t in raw.split(",") if t.strip())
    if single and single not in tokens:
        tokens.append(single)
    return tokens


def mqtt_ingest_allow_ips() -> list[str]:
    raw = os.getenv("MQTT_INGEST_ALLOW_IPS", "")
    return [x.strip() for x in raw.split(",") if x.strip()]


def mqtt_ingest_rate_limit() -> int:
    return int(os.getenv("MQTT_INGEST_RATE_LIMIT", "120") or "0")


def mqtt_ingest_rate_window() -> int:
    return int(os.getenv("MQTT_INGEST_RATE_WINDOW", "60") or "60")


def mqtt_ingest_trust_x_forwarded() -> bool:
    return os.getenv("MQTT_INGEST_TRUST_X_FORWARDED", "false").lower() in ("1", "true", "yes")


def iot_online_ttl() -> int:
    return int(os.getenv("IOT_ONLINE_TTL_SECONDS", "180") or "180")


def iot_latest_ttl() -> int:
    return int(os.getenv("IOT_LATEST_TTL_SECONDS", "86400") or "86400")
