"""Real-time log stream ingestion + WebSocket live feed — AppSentinel sensor gateway."""
import datetime
import uuid
from fastapi import APIRouter, Depends, Header, HTTPException, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from server.api.websocket.manager import ws_manager
from server.config import settings
from server.models.core import IngestionJob, MaliciousEventRecord, RequestLog, Sensor
from server.modules.auth.rbac import RBAC
from server.modules.ingestion.queue import ingestion_queue, IngestionJobItem
from server.modules.persistence.database import get_db, AsyncSessionLocal
from server.modules.quotas.tenant_quota import check_ingest_quota
from server.modules.auth.audit import log_action

router = APIRouter()


class IngestPayload(BaseModel):
    lines: list[str]
    sensor_key: str | None = None


@router.post("/ingest")
async def ingest_lines(
    body: IngestPayload,
    x_sensor_key: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Receive log lines from log_shipper agent. Queue for async processing."""
    sensor_key = body.sensor_key or x_sensor_key
    if len(body.lines) > settings.INGESTION_MAX_LINES:
        raise HTTPException(status_code=413, detail="Too many lines in one request")
    for line in body.lines:
        if len(line.encode("utf-8")) > settings.INGESTION_MAX_LINE_BYTES:
            raise HTTPException(status_code=413, detail="Log line exceeds size limit")

    account_id = settings.DEFAULT_ACCOUNT_ID
    if sensor_key:
        result = await db.execute(select(Sensor).where(Sensor.sensor_key == sensor_key))
        sensor = result.scalar_one_or_none()
        if not sensor:
            raise HTTPException(status_code=403, detail="Invalid sensor key")
        account_id = sensor.account_id

    quota = await check_ingest_quota(account_id, cost=len(body.lines))
    if not quota.allowed:
        raise HTTPException(
            status_code=429,
            detail="Ingestion rate limit exceeded",
            headers={"Retry-After": str(max(1, quota.reset_at - int(datetime.datetime.now().timestamp())))},
        )

    job_id = str(uuid.uuid4())
    job = IngestionJob(
        id=job_id,
        account_id=account_id,
        job_type="stream_lines",
        status="QUEUED",
        accepted_count=len(body.lines),
        job_metadata={"sensor_key": sensor_key},
    )
    db.add(job)
    await db.commit()

    queued = await ingestion_queue.enqueue(
        IngestionJobItem(
            job_id=job_id,
            account_id=account_id,
            job_type="stream_lines",
            payload={"lines": body.lines, "sensor_key": sensor_key},
        )
    )
    if not queued:
        job.status = "FAILED"
        job.error_message = "Queue full"
        await db.commit()
        raise HTTPException(status_code=429, detail="Ingestion queue is full")

    await log_action(
        db=db,
        account_id=account_id,
        action="INGESTION_STREAM_ENQUEUED",
        resource_type="ingestion_job",
        resource_id=job_id,
        details={"accepted": len(body.lines), "sensor_key": sensor_key or ""},
    )
    await db.commit()

    return {
        "status": "queued",
        "job_id": job_id,
        "lines_processed": len(body.lines),
        "threats_detected": 0,
    }


@router.get("/recent")
async def recent_events(
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    """REST fallback — last N request logs with any attack records."""
    account_id = payload.get("account_id")
    logs_result = await db.execute(
        select(RequestLog)
        .where(RequestLog.account_id == account_id)
        .order_by(RequestLog.created_at.desc())
        .limit(limit)
    )
    logs = logs_result.scalars().all()

    evt_result = await db.execute(
        select(MaliciousEventRecord)
        .where(MaliciousEventRecord.account_id == account_id)
        .order_by(MaliciousEventRecord.created_at.desc())
        .limit(200)
    )
    events = evt_result.scalars().all()
    threat_ips = {e.ip: {"category": e.category, "severity": e.severity} for e in events if e.ip}

    return [
        {
            "ip":        r.source_ip,
            "method":    r.method,
            "path":      r.path,
            "status":    r.response_code,
            "timestamp": r.created_at.isoformat() if r.created_at else None,
            "attacks":   [threat_ips[r.source_ip]] if r.source_ip in threat_ips else [],
        }
        for r in logs
    ]


@router.websocket("/live")
async def websocket_live(websocket: WebSocket):
    """WebSocket endpoint — push live log events to connected dashboard clients."""
    token = websocket.query_params.get("token")
    if not token:
        auth_header = websocket.headers.get("authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()
    if not token:
        token = websocket.cookies.get("access_token")

    connected = await ws_manager.connect(websocket, token=token)
    if not connected:
        return
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(RequestLog)
                .order_by(RequestLog.created_at.desc())
                .limit(20)
            )
            recent = result.scalars().all()

            evt_result = await db.execute(
                select(MaliciousEventRecord)
                .order_by(MaliciousEventRecord.created_at.desc())
                .limit(100)
            )
            events = evt_result.scalars().all()
            threat_ips = {e.ip: {"category": e.category, "severity": e.severity} for e in events if e.ip}

        for r in reversed(recent):
            await websocket.send_json({
                "type": "log_entry",
                "data": {
                    "ip":        r.source_ip,
                    "method":    r.method,
                    "path":      r.path,
                    "status":    r.response_code,
                    "timestamp": r.created_at.isoformat() if r.created_at else None,
                    "attacks":   [threat_ips[r.source_ip]] if r.source_ip in threat_ips else [],
                    "blocked":   False,
                },
            })

        while True:
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect(websocket)
