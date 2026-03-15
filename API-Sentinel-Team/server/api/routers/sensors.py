"""Sensor management — register nginx log-shipper agents, heartbeat, status monitoring."""
import uuid
import secrets
import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from server.modules.persistence.database import get_db
from server.models.core import Sensor

router = APIRouter()
ACCOUNT_ID   = 1000000
OFFLINE_SECS = 120   # mark OFFLINE if no heartbeat in 2 min


class SensorRegister(BaseModel):
    name: str
    host: str | None = None
    log_path: str | None = "/var/log/nginx/access.log"
    version: str | None = "1.0.0"


class HeartbeatBody(BaseModel):
    lines_shipped:   int | None = None
    events_detected: int | None = None


async def _mark_stale_offline(db: AsyncSession):
    """Background: mark sensors OFFLINE if no heartbeat in OFFLINE_SECS seconds."""
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=OFFLINE_SECS)
    result = await db.execute(
        select(Sensor).where(
            Sensor.account_id == ACCOUNT_ID,
            Sensor.status == "ONLINE",
            Sensor.last_heartbeat < cutoff,
        )
    )
    stale = result.scalars().all()
    for s in stale:
        s.status = "OFFLINE"
    if stale:
        await db.commit()


@router.get("/")
async def list_sensors(db: AsyncSession = Depends(get_db)):
    await _mark_stale_offline(db)
    result = await db.execute(
        select(Sensor).where(Sensor.account_id == ACCOUNT_ID).order_by(Sensor.created_at.desc())
    )
    rows = result.scalars().all()
    return [_serialize(r) for r in rows]


@router.get("/summary")
async def sensor_summary(db: AsyncSession = Depends(get_db)):
    await _mark_stale_offline(db)
    result = await db.execute(
        select(Sensor).where(Sensor.account_id == ACCOUNT_ID)
    )
    rows = result.scalars().all()
    return {
        "total":          len(rows),
        "online":         sum(1 for r in rows if r.status == "ONLINE"),
        "offline":        sum(1 for r in rows if r.status == "OFFLINE"),
        "degraded":       sum(1 for r in rows if r.status == "DEGRADED"),
        "total_lines":    sum(r.lines_shipped for r in rows),
        "total_events":   sum(r.events_detected for r in rows),
    }


@router.post("/register")
async def register_sensor(body: SensorRegister, db: AsyncSession = Depends(get_db)):
    sensor_key = secrets.token_hex(32)
    sensor = Sensor(
        id=str(uuid.uuid4()),
        account_id=ACCOUNT_ID,
        name=body.name,
        host=body.host,
        log_path=body.log_path,
        version=body.version,
        sensor_key=sensor_key,
        status="OFFLINE",   # ONLINE only after first heartbeat
    )
    db.add(sensor)
    await db.commit()
    await db.refresh(sensor)
    return {
        "sensor_id":    sensor.id,
        "sensor_key":   sensor_key,
        "ingest_url":   "/api/stream/ingest",
        "heartbeat_url": f"/api/sensors/{sensor_key}/heartbeat",
        "usage": (
            f"python log_shipper.py --key {sensor_key} "
            f"--log {body.log_path} --endpoint http://YOUR_SOC_HOST/api/stream/ingest"
        ),
    }


@router.post("/{sensor_key}/heartbeat")
async def heartbeat(
    sensor_key: str,
    body: HeartbeatBody,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Sensor).where(Sensor.sensor_key == sensor_key)
    )
    sensor = result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")

    sensor.status = "ONLINE"
    sensor.last_heartbeat = datetime.datetime.now(datetime.timezone.utc)
    if body.lines_shipped is not None:
        sensor.lines_shipped = body.lines_shipped
    if body.events_detected is not None:
        sensor.events_detected = body.events_detected

    await db.commit()

    # Background: stale check
    background_tasks.add_task(_mark_stale_offline, db)

    return {"status": "ok", "sensor_id": sensor.id}


@router.get("/{sensor_key}/status")
async def sensor_status(sensor_key: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Sensor).where(Sensor.sensor_key == sensor_key)
    )
    sensor = result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    return _serialize(sensor)


@router.delete("/{sensor_id}")
async def deregister_sensor(sensor_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Sensor).where(Sensor.id == sensor_id, Sensor.account_id == ACCOUNT_ID)
    )
    sensor = result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    await db.delete(sensor)
    await db.commit()
    return {"status": "deregistered", "id": sensor_id}


def _serialize(r: Sensor) -> dict:
    return {
        "id":               r.id,
        "name":             r.name,
        "host":             r.host,
        "log_path":         r.log_path,
        "version":          r.version,
        "status":           r.status,
        "lines_shipped":    r.lines_shipped,
        "events_detected":  r.events_detected,
        "last_heartbeat":   r.last_heartbeat.isoformat() if r.last_heartbeat else None,
        "created_at":       r.created_at.isoformat() if r.created_at else None,
    }
