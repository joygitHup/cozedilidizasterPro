"""SQLAlchemy models matching Django tables."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from common.db import Base


class HazardPoint(Base):
    __tablename__ = "hazard_point"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[str] = mapped_column(String(20))
    level: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(20), default="stable")
    longitude: Mapped[Decimal] = mapped_column(Numeric(12, 8))
    latitude: Mapped[Decimal] = mapped_column(Numeric(12, 8))
    address: Mapped[str] = mapped_column(String(200), default="")
    city: Mapped[str] = mapped_column(String(50), default="")
    district: Mapped[str] = mapped_column(String(50), default="")
    village: Mapped[str] = mapped_column(String(50), default="")
    town: Mapped[str] = mapped_column(String(50), default="")
    county: Mapped[str] = mapped_column(String(50), default="")


class WarningRecord(Base):
    __tablename__ = "warning_record"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True)
    hazard_point_id: Mapped[int] = mapped_column(ForeignKey("hazard_point.id"))
    level: Mapped[str] = mapped_column(String(10))
    trigger_type: Mapped[str] = mapped_column(String(50), default="")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime)


class MonitoringDevice(Base):
    __tablename__ = "monitoring_device"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    code: Mapped[str] = mapped_column(String(50), unique=True)
    device_type: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(10), default="online")
    longitude: Mapped[Decimal] = mapped_column(Numeric(12, 8))
    latitude: Mapped[Decimal] = mapped_column(Numeric(12, 8))
    address: Mapped[str] = mapped_column(String(200), default="")
    city: Mapped[str] = mapped_column(String(50), default="")
    district: Mapped[str] = mapped_column(String(50), default="")
    county: Mapped[str] = mapped_column(String(50), default="")
    village: Mapped[str] = mapped_column(String(50), default="")
    town: Mapped[str] = mapped_column(String(50), default="")
    hazard_point_id: Mapped[int | None] = mapped_column(
        ForeignKey("hazard_point.id"), nullable=True
    )
    install_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    range_value: Mapped[str] = mapped_column(String(50), default="")
    accuracy: Mapped[str] = mapped_column(String(50), default="")
    power_consumption: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=0)
    battery: Mapped[int] = mapped_column(Integer, default=100)
    signal: Mapped[str] = mapped_column(String(10), default="strong")
    last_data_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)

    hazard_point: Mapped[HazardPoint | None] = relationship(
        HazardPoint, foreign_keys=[hazard_point_id], lazy="joined"
    )
    data_records: Mapped[list["MonitorData"]] = relationship(
        "MonitorData", back_populates="device", lazy="select"
    )

    __table_args__ = (
        Index("monitoring_device_device_type_idx", "device_type"),
        Index("monitoring_device_status_idx", "status"),
    )


class MonitorData(Base):
    __tablename__ = "monitor_data"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("monitoring_device.id"))
    data_type: Mapped[str] = mapped_column(String(20))
    channel: Mapped[str] = mapped_column(String(16), default="", index=True)
    value: Mapped[Decimal] = mapped_column(Numeric(15, 4))
    unit: Mapped[str] = mapped_column(String(10), default="")
    record_time: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime)

    device: Mapped[MonitoringDevice] = relationship(
        MonitoringDevice, back_populates="data_records", lazy="joined"
    )

    __table_args__ = (
        Index("monitor_data_device_id_record_time_idx", "device_id", "record_time"),
        Index("monitor_data_data_type_record_time_idx", "data_type", "record_time"),
    )


class MonitorDailyAgg(Base):
    __tablename__ = "monitor_daily_agg"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("monitoring_device.id"))
    data_type: Mapped[str] = mapped_column(String(20))
    channel: Mapped[str] = mapped_column(String(16), default="")
    day: Mapped[date] = mapped_column(Date)
    count: Mapped[int] = mapped_column(Integer, default=0)
    min_value: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    max_value: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    avg_value: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)

    __table_args__ = (
        UniqueConstraint(
            "device_id", "data_type", "channel", "day", name="uniq_monitor_daily_agg"
        ),
    )


class MqttIngestLog(Base):
    __tablename__ = "mqtt_ingest_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    topic: Mapped[str] = mapped_column(String(200), default="")
    device_code: Mapped[str] = mapped_column(String(50), default="", index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="accepted")
    error: Mapped[str] = mapped_column(String(300), default="")
    monitor_data_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    trace_id: Mapped[str] = mapped_column(String(64), default="", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)

    __table_args__ = (
        Index("mqtt_ingest_log_created_at_idx", "created_at"),
    )
