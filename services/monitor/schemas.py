"""Pydantic schemas matching DRF serializer field names."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DeviceBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str | None = None
    name: str
    device_type: str
    status: str = "online"
    longitude: Decimal | float | None = None
    latitude: Decimal | float | None = None
    address: str = ""
    city: str = ""
    district: str = ""
    county: str = ""
    village: str = ""
    town: str = ""
    hazard_point: int | None = Field(None, alias="hazard_point_id")
    install_date: date | None = None
    range_value: str = ""
    accuracy: str = ""
    power_consumption: Decimal | float = 0
    battery: int = 100
    signal: str = "strong"


class DeviceCreate(DeviceBase):
    pass


class DeviceUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str | None = None
    name: str | None = None
    device_type: str | None = None
    status: str | None = None
    longitude: Decimal | float | None = None
    latitude: Decimal | float | None = None
    address: str | None = None
    city: str | None = None
    district: str | None = None
    county: str | None = None
    village: str | None = None
    town: str | None = None
    hazard_point: int | None = None
    install_date: date | None = None
    range_value: str | None = None
    accuracy: str | None = None
    power_consumption: Decimal | float | None = None
    battery: int | None = None
    signal: str | None = None


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    device_type: str
    device_type_display: str
    status: str
    status_display: str
    longitude: Decimal | float
    latitude: Decimal | float
    address: str
    city: str
    district: str
    county: str
    village: str
    town: str
    hazard_point: int | None
    hazard_point_name: str | None = None
    hazard_point_code: str | None = None
    install_date: date | None = None
    range_value: str = ""
    accuracy: str = ""
    power_consumption: Decimal | float = 0
    battery: int = 100
    signal: str = "strong"
    signal_display: str = ""
    last_data_time: datetime | None = None
    data_count: int | None = None
    is_stale: bool = False
    low_battery: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DeviceListOut(DeviceOut):
    data_count: int | None = None


class ChangeStatusBody(BaseModel):
    status: str


class BindHazardBody(BaseModel):
    hazard_point: int | None = None
    sync_coords: bool = True


class MonitorDataCreate(BaseModel):
    device: int
    data_type: str
    channel: str = ""
    value: Decimal | float
    unit: str = ""
    record_time: datetime | None = None

    @field_validator("value")
    @classmethod
    def validate_value(cls, v: Any) -> Decimal | float:
        try:
            float(v)
        except (TypeError, ValueError) as exc:
            raise ValueError("数值无效") from exc
        return v


class MonitorDataOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device: int
    device_code: str
    device_name: str
    data_type: str
    data_type_display: str
    channel: str = ""
    value: Decimal | float
    unit: str = ""
    record_time: datetime
    hazard_point_id: int | None = None
    hazard_point_code: str | None = None
    created_at: datetime | None = None


class IngestPayload(BaseModel):
    topic: str = ""
    async_mode: bool = Field(True, alias="async")
    trace_id: str | None = None
    traceId: str | None = None

    model_config = ConfigDict(extra="allow", populate_by_name=True)
