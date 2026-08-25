"""Device CRUD and actions."""
from __future__ import annotations

import csv
import io
from datetime import timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from common.auth import require_user
from common.pagination import build_page_links, parse_page_params
from constants import DEVICE_TYPE, DEVICE_TYPE_VALUES, STATUS
from models import HazardPoint, MonitorData, MonitoringDevice
from schemas import BindHazardBody, ChangeStatusBody, DeviceCreate, DeviceUpdate
from utils import (
    apply_device_filters,
    device_to_dict,
    get_device_or_404,
    next_device_code,
    open_warnings_for_hazard,
    hazard_summary,
    naive_utc,
    utcnow,
    validate_device_payload,
)

router = APIRouter(prefix="/devices", tags=["devices"])


def get_db():
    from common.db import SessionLocal

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/")
def list_devices(
    request: Request,
    db: Session = Depends(get_db),
    _user: Annotated[int, Depends(require_user)] = 0,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    search: str | None = None,
    device_type: str | None = None,
    status: str | None = None,
    hazard_point: str | None = None,
    signal: str | None = None,
    low_battery: str | None = None,
    stale: str | None = None,
    unlinked: str | None = None,
    ordering: str | None = Query(None),
):
    page, page_size = parse_page_params(page, page_size)
    qs = db.query(MonitoringDevice).options(joinedload(MonitoringDevice.hazard_point))
    qs = apply_device_filters(
        qs,
        search=search,
        device_type=device_type,
        status=status,
        hazard_point=hazard_point,
        signal=signal,
        low_battery=low_battery,
        stale=stale,
        unlinked=unlinked,
    )

    order_map = {
        "created_at": MonitoringDevice.created_at,
        "-created_at": MonitoringDevice.created_at.desc(),
        "updated_at": MonitoringDevice.updated_at,
        "-updated_at": MonitoringDevice.updated_at.desc(),
        "battery": MonitoringDevice.battery,
        "-battery": MonitoringDevice.battery.desc(),
        "last_data_time": MonitoringDevice.last_data_time,
        "-last_data_time": MonitoringDevice.last_data_time.desc(),
        "code": MonitoringDevice.code,
        "-code": MonitoringDevice.code.desc(),
        "status": MonitoringDevice.status,
        "-status": MonitoringDevice.status.desc(),
    }
    qs = qs.order_by(order_map.get(ordering or "-updated_at", MonitoringDevice.updated_at.desc()))

    total = qs.count()
    items = qs.offset((page - 1) * page_size).limit(page_size).all()
    base = str(request.url.replace(query="")).split("?")[0]
    extra = {k: v for k, v in request.query_params.items() if k not in ("page", "page_size")}
    nxt, prev = build_page_links(base_url=base, page=page, page_size=page_size, total=total, extra_params=extra)

    return {
        "count": total,
        "next": nxt,
        "previous": prev,
        "results": [device_to_dict(d) for d in items],
    }


@router.post("/", status_code=201)
def create_device(
    body: DeviceCreate,
    db: Session = Depends(get_db),
    _user: Annotated[int, Depends(require_user)] = 0,
):
    data = body.model_dump(exclude_unset=True)
    if "hazard_point" in data:
        data["hazard_point_id"] = data.pop("hazard_point")
    validate_device_payload(data, db)

    code = (data.get("code") or "").strip().upper()
    if not code:
        code = next_device_code(db, data.get("device_type", "others"))
    data["code"] = code

    now = naive_utc(utcnow())
    device = MonitoringDevice(
        name=data["name"],
        code=code,
        device_type=data["device_type"],
        status=data.get("status", "online"),
        longitude=data["longitude"],
        latitude=data["latitude"],
        address=data.get("address") or "",
        city=data.get("city") or "",
        district=data.get("district") or "",
        county=data.get("county") or "",
        village=data.get("village") or "",
        town=data.get("town") or data.get("district") or "",
        hazard_point_id=data.get("hazard_point_id"),
        install_date=data.get("install_date"),
        range_value=data.get("range_value") or "",
        accuracy=data.get("accuracy") or "",
        power_consumption=data.get("power_consumption") or 0,
        battery=data.get("battery", 100),
        signal=data.get("signal", "strong"),
        created_at=now,
        updated_at=now,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return device_to_dict(device, db=db, include_data_count=True)


@router.get("/statistics/")
def device_statistics(
    db: Session = Depends(get_db),
    _user: Annotated[int, Depends(require_user)] = 0,
    search: str | None = None,
    device_type: str | None = None,
    status: str | None = None,
    hazard_point: str | None = None,
    signal: str | None = None,
    low_battery: str | None = None,
    stale: str | None = None,
    unlinked: str | None = None,
):
    qs = db.query(MonitoringDevice)
    qs = apply_device_filters(
        qs,
        search=search,
        device_type=device_type,
        status=status,
        hazard_point=hazard_point,
        signal=signal,
        low_battery=low_battery,
        stale=stale,
        unlinked=unlinked,
    )
    cutoff = naive_utc(utcnow()) - timedelta(hours=24)
    stale_count = qs.filter(
        or_(MonitoringDevice.last_data_time < cutoff, MonitoringDevice.last_data_time.is_(None)),
        MonitoringDevice.status == "online",
    ).count()
    return {
        "total": qs.count(),
        "online": qs.filter(MonitoringDevice.status == "online").count(),
        "offline": qs.filter(MonitoringDevice.status == "offline").count(),
        "fault": qs.filter(MonitoringDevice.status == "fault").count(),
        "low_battery": qs.filter(MonitoringDevice.battery < 20).count(),
        "stale": stale_count,
        "unlinked": qs.filter(MonitoringDevice.hazard_point_id.is_(None)).count(),
        "by_type": {t: qs.filter(MonitoringDevice.device_type == t).count() for t in DEVICE_TYPE_VALUES},
    }


@router.get("/next_code/")
def get_next_code(
    device_type: str = Query("others"),
    db: Session = Depends(get_db),
    _user: Annotated[int, Depends(require_user)] = 0,
):
    return {"code": next_device_code(db, device_type)}


@router.get("/device_tree/")
def device_tree(
    db: Session = Depends(get_db),
    _user: Annotated[int, Depends(require_user)] = 0,
    search: str | None = None,
    device_type: str | None = None,
    status: str | None = None,
    hazard_point: str | None = None,
    signal: str | None = None,
    low_battery: str | None = None,
    stale: str | None = None,
    unlinked: str | None = None,
):
    """按市→区→县→村层级分组；未绑定市的设备归入「未分配区域」。"""
    qs = db.query(MonitoringDevice).options(joinedload(MonitoringDevice.hazard_point))
    qs = apply_device_filters(
        qs,
        search=search,
        device_type=device_type,
        status=status,
        hazard_point=hazard_point,
        signal=signal,
        low_battery=low_battery,
        stale=stale,
        unlinked=unlinked,
    )
    devices = qs.all()

    def device_node(device: MonitoringDevice) -> dict:
        return {
            "id": device.id,
            "code": device.code,
            "name": device.name,
            "type": device.device_type,
            "status": device.status,
            "city": device.city or "",
            "district": device.district or device.town or "",
            "county": device.county or "",
            "village": device.village or "",
            "address": device.address or "",
        }

    def empty_group(name: str, level: str, key: str) -> dict:
        return {
            "key": key,
            "name": name,
            "level": level,
            "count": 0,
            "online": 0,
            "children": [],
            "devices": [],
        }

    root_children: dict[str, dict] = {}
    unassigned = empty_group("未分配区域", "unassigned", "unassigned")

    for device in devices:
        city = (device.city or "").strip()
        district = (device.district or device.town or "").strip()
        county = (device.county or "").strip()
        village = (device.village or "").strip()
        node = device_node(device)
        is_online = device.status == "online"

        if not city:
            unassigned["devices"].append(node)
            unassigned["count"] += 1
            if is_online:
                unassigned["online"] += 1
            continue

        city_node = root_children.get(city)
        if not city_node:
            city_node = empty_group(city, "city", f"city:{city}")
            root_children[city] = city_node

        path = [("district", district), ("county", county), ("village", village)]
        current = city_node
        path_prefix = city
        for level, name in path:
            if not name:
                continue
            path_prefix = f"{path_prefix}/{name}"
            key = f"{level}:{path_prefix}"
            child_map = {c["name"]: c for c in current["children"]}
            child = child_map.get(name)
            if not child:
                child = empty_group(name, level, key)
                current["children"].append(child)
            current = child

        current["devices"].append(node)
        walk = [city_node]
        cur = city_node
        for level, name in path:
            if not name:
                break
            cur = next(c for c in cur["children"] if c["name"] == name)
            walk.append(cur)
        for g in walk:
            g["count"] += 1
            if is_online:
                g["online"] += 1

    nodes = sorted(root_children.values(), key=lambda x: x["name"])
    if unassigned["count"]:
        nodes.append(unassigned)

    legacy: dict[str, list] = {}
    for d in devices:
        label = (
            (d.village or "").strip()
            or (d.county or "").strip()
            or (d.district or d.town or "").strip()
            or (d.city or "").strip()
            or "未分配区域"
        )
        legacy.setdefault(label, []).append(device_node(d))

    return {
        "nodes": nodes,
        "total": len(devices),
        "online": sum(1 for d in devices if d.status == "online"),
        "groups": legacy,
    }


@router.get("/export/")
def export_devices(
    db: Session = Depends(get_db),
    _user: Annotated[int, Depends(require_user)] = 0,
    search: str | None = None,
    device_type: str | None = None,
    status: str | None = None,
    hazard_point: str | None = None,
    signal: str | None = None,
    low_battery: str | None = None,
    stale: str | None = None,
    unlinked: str | None = None,
):
    qs = db.query(MonitoringDevice).options(joinedload(MonitoringDevice.hazard_point))
    qs = apply_device_filters(
        qs,
        search=search,
        device_type=device_type,
        status=status,
        hazard_point=hazard_point,
        signal=signal,
        low_battery=low_battery,
        stale=stale,
        unlinked=unlinked,
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "编号", "名称", "类型", "状态", "安装位置",
        "关联隐患点编号", "关联隐患点名称",
        "电量", "信号", "最后数据时间", "经度", "纬度",
    ])
    for d in qs.all():
        writer.writerow([
            d.code,
            d.name,
            DEVICE_TYPE.get(d.device_type, d.device_type),
            STATUS.get(d.status, d.status),
            d.address,
            d.hazard_point.code if d.hazard_point else "",
            d.hazard_point.name if d.hazard_point else "",
            d.battery,
            d.signal,
            d.last_data_time,
            d.longitude,
            d.latitude,
        ])
    content = "\ufeff" + buffer.getvalue()
    return Response(
        content=content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="monitoring_devices.csv"'},
    )


@router.get("/{device_id}/")
def get_device(
    device_id: int,
    db: Session = Depends(get_db),
    _user: Annotated[int, Depends(require_user)] = 0,
):
    device = get_device_or_404(db, device_id)
    return device_to_dict(device, db=db, include_data_count=True)


@router.patch("/{device_id}/")
@router.put("/{device_id}/")
def update_device(
    device_id: int,
    body: DeviceUpdate,
    db: Session = Depends(get_db),
    _user: Annotated[int, Depends(require_user)] = 0,
):
    device = get_device_or_404(db, device_id)
    data = body.model_dump(exclude_unset=True)
    if "hazard_point" in data:
        data["hazard_point_id"] = data.pop("hazard_point")
    validate_device_payload({**data, "name": data.get("name", device.name)}, db, instance=device)

    for key, val in data.items():
        if key == "hazard_point_id":
            setattr(device, "hazard_point_id", val)
        elif hasattr(device, key):
            setattr(device, key, val)
    if data.get("district") and not data.get("town"):
        device.town = data["district"]
    elif data.get("town") and not data.get("district"):
        device.district = data["town"]
    device.updated_at = naive_utc(utcnow())
    db.commit()
    db.refresh(device)
    return device_to_dict(device, db=db, include_data_count=True)


@router.delete("/{device_id}/")
def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    _user: Annotated[int, Depends(require_user)] = 0,
):
    device = get_device_or_404(db, device_id)
    if device.status == "online":
        raise HTTPException(status_code=400, detail="在线设备不可删除，请先标记为离线或故障")
    cutoff = naive_utc(utcnow()) - timedelta(hours=24)
    recent = (
        db.query(MonitorData.id)
        .filter(MonitorData.device_id == device.id, MonitorData.record_time >= cutoff)
        .first()
    )
    if recent:
        raise HTTPException(status_code=400, detail="近 24 小时仍有监测数据上报，不能删除")
    code = device.code
    db.delete(device)
    db.commit()
    return {"detail": f"已删除设备 {code}"}


@router.post("/{device_id}/change_status/")
def change_status(
    device_id: int,
    body: ChangeStatusBody,
    db: Session = Depends(get_db),
    _user: Annotated[int, Depends(require_user)] = 0,
):
    device = get_device_or_404(db, device_id)
    valid = set(STATUS.keys())
    if body.status not in valid:
        raise HTTPException(
            status_code=400,
            detail=f"无效状态，可选: {', '.join(sorted(valid))}",
        )
    device.status = body.status
    device.updated_at = naive_utc(utcnow())
    db.commit()
    db.refresh(device)
    return device_to_dict(device, db=db, include_data_count=True)


@router.post("/{device_id}/bind_hazard/")
def bind_hazard(
    device_id: int,
    body: BindHazardBody,
    db: Session = Depends(get_db),
    _user: Annotated[int, Depends(require_user)] = 0,
):
    device = get_device_or_404(db, device_id)
    if body.hazard_point in (None, ""):
        device.hazard_point_id = None
        device.updated_at = naive_utc(utcnow())
        db.commit()
        db.refresh(device)
        return device_to_dict(device, db=db, include_data_count=True)

    point = db.query(HazardPoint).filter(HazardPoint.id == body.hazard_point).first()
    if not point:
        raise HTTPException(status_code=404, detail="隐患点不存在")
    device.hazard_point_id = point.id
    if body.sync_coords:
        device.longitude = point.longitude
        device.latitude = point.latitude
        if not device.address:
            device.address = point.address or point.name
    device.updated_at = naive_utc(utcnow())
    db.commit()
    db.refresh(device)
    return device_to_dict(device, db=db, include_data_count=True)


@router.get("/{device_id}/related/")
def related_data(
    device_id: int,
    db: Session = Depends(get_db),
    _user: Annotated[int, Depends(require_user)] = 0,
):
    device = get_device_or_404(db, device_id)
    latest = (
        db.query(MonitorData)
        .filter(MonitorData.device_id == device.id)
        .order_by(MonitorData.record_time.desc())
        .limit(20)
        .all()
    )
    warnings = []
    hazard = None
    if device.hazard_point_id:
        hazard = hazard_summary(device.hazard_point)
        warnings = open_warnings_for_hazard(db, device.hazard_point_id)
    return {
        "device": device_to_dict(device, db=db, include_data_count=True),
        "latest_data": [
            {
                "id": r.id,
                "data_type": r.data_type,
                "value": float(r.value),
                "unit": r.unit,
                "record_time": r.record_time.isoformat() if r.record_time else None,
            }
            for r in latest
        ],
        "hazard_point": hazard,
        "open_warnings": warnings,
    }
