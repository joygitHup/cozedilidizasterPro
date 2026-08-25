"""SQLAlchemy models for warning microservice (shared Django tables)."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
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
    threat_people: Mapped[int] = mapped_column(Integer, default=0)
    threat_houses: Mapped[int] = mapped_column(Integer, default=0)
    responsible_person: Mapped[str] = mapped_column(String(50), default="")
    contact_phone: Mapped[str] = mapped_column(String(20), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)

    warnings: Mapped[list["WarningRecord"]] = relationship(back_populates="hazard_point")
    devices: Mapped[list["MonitoringDevice"]] = relationship(back_populates="hazard_point")
    evacuation_tasks: Mapped[list["EvacuationTask"]] = relationship(
        back_populates="hazard_point"
    )


class WarningRecord(Base):
    __tablename__ = "warning_record"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True)
    hazard_point_id: Mapped[int] = mapped_column(ForeignKey("hazard_point.id"))
    level: Mapped[str] = mapped_column(String(10))
    trigger_type: Mapped[str] = mapped_column(String(50), default="")
    trigger_value: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    call_status: Mapped[str] = mapped_column(String(20), default="")
    call_detail: Mapped[dict] = mapped_column(JSON, default=dict)
    confirm_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    confirm_user: Mapped[str] = mapped_column(String(50), default="")
    publish_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    publish_user: Mapped[str] = mapped_column(String(50), default="")
    close_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    close_reason: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)

    hazard_point: Mapped[HazardPoint] = relationship(back_populates="warnings")


class WarningModel(Base):
    __tablename__ = "warning_model"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    code: Mapped[str] = mapped_column(String(50), unique=True)
    model_type: Mapped[str] = mapped_column(String(20))
    description: Mapped[str] = mapped_column(Text, default="")
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    yellow_threshold: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    orange_threshold: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    red_threshold: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)


class MonitoringDevice(Base):
    __tablename__ = "monitoring_device"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    code: Mapped[str] = mapped_column(String(50), unique=True)
    device_type: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(10), default="online")
    hazard_point_id: Mapped[int | None] = mapped_column(
        ForeignKey("hazard_point.id"), nullable=True
    )
    battery: Mapped[int] = mapped_column(Integer, default=100)
    last_data_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    hazard_point: Mapped[HazardPoint | None] = relationship(back_populates="devices")
    data_records: Mapped[list["MonitorData"]] = relationship(back_populates="device")


class MonitorData(Base):
    __tablename__ = "monitor_data"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("monitoring_device.id"))
    data_type: Mapped[str] = mapped_column(String(20))
    channel: Mapped[str] = mapped_column(String(16), default="")
    value: Mapped[Decimal] = mapped_column(Numeric(15, 4))
    unit: Mapped[str] = mapped_column(String(10), default="")
    record_time: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime)

    device: Mapped[MonitoringDevice] = relationship(back_populates="data_records")


class EvacuationTask(Base):
    __tablename__ = "evacuation_task"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True)
    warning_id: Mapped[int | None] = mapped_column(
        ForeignKey("warning_record.id"), nullable=True
    )
    hazard_point_id: Mapped[int] = mapped_column(ForeignKey("hazard_point.id"))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    total_people: Mapped[int] = mapped_column(Integer, default=0)
    transferred_people: Mapped[int] = mapped_column(Integer, default=0)
    shelter_name: Mapped[str] = mapped_column(String(100), default="")
    commander: Mapped[str] = mapped_column(String(50), default="")
    grid_worker: Mapped[str] = mapped_column(String(50), default="")
    grid_phone: Mapped[str] = mapped_column(String(20), default="")
    commander_phone: Mapped[str] = mapped_column(String(20), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime)

    hazard_point: Mapped[HazardPoint] = relationship(back_populates="evacuation_tasks")
