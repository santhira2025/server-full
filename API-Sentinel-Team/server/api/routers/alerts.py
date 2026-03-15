"""Alert management — create, acknowledge, resolve, dismiss security alerts."""
import uuid
import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from server.modules.persistence.database import get_db
from server.models.core import Alert
from server.modules.integrations.dispatcher import dispatch_event
from server.modules.response.playbook_executor import execute_playbooks

router = APIRouter()
ACCOUNT_ID = 1000000


class AlertCreate(BaseModel):
    title: str
    message: str | None = None
    severity: str = "MEDIUM"      # CRITICAL|HIGH|MEDIUM|LOW
    category: str | None = None   # SQL_INJECTION|XSS|BOLA|SCANNING etc
    source_ip: str | None = None
    endpoint: str | None = None


@router.get("/")
async def list_alerts(
    status: str | None = Query(None),
    severity: str | None = Query(None),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
):
    q = select(Alert).where(Alert.account_id == ACCOUNT_ID)
    if status:
        q = q.where(Alert.status == status.upper())
    if severity:
        q = q.where(Alert.severity == severity.upper())
    q = q.order_by(Alert.created_at.desc()).limit(limit)
    result = await db.execute(q)
    rows = result.scalars().all()
    return [_serialize(r) for r in rows]


@router.get("/summary")
async def alert_summary(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Alert).where(Alert.account_id == ACCOUNT_ID)
    )
    rows = result.scalars().all()
    return {
        "total":        len(rows),
        "open":         sum(1 for r in rows if r.status == "OPEN"),
        "acknowledged": sum(1 for r in rows if r.status == "ACKNOWLEDGED"),
        "resolved":     sum(1 for r in rows if r.status == "RESOLVED"),
        "critical":     sum(1 for r in rows if r.severity == "CRITICAL"),
        "high":         sum(1 for r in rows if r.severity == "HIGH"),
        "medium":       sum(1 for r in rows if r.severity == "MEDIUM"),
        "low":          sum(1 for r in rows if r.severity == "LOW"),
    }


@router.post("/")
async def create_alert(body: AlertCreate, db: AsyncSession = Depends(get_db)):
    alert = Alert(
        id=str(uuid.uuid4()),
        account_id=ACCOUNT_ID,
        title=body.title,
        message=body.message,
        severity=body.severity.upper(),
        category=body.category,
        source_ip=body.source_ip,
        endpoint=body.endpoint,
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    await dispatch_event(
        "alert.created",
        {
            "id": alert.id,
            "title": alert.title,
            "description": alert.message,
            "severity": alert.severity,
            "category": alert.category,
            "source_ip": alert.source_ip,
            "endpoint": alert.endpoint,
        },
        ACCOUNT_ID,
        db,
    )
    await execute_playbooks(db, alert, evidence={"summary": alert.message or ""})
    await db.commit()
    return _serialize(alert)


@router.patch("/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    by: str = Query("analyst"),
    db: AsyncSession = Depends(get_db),
):
    alert = await _get_alert(alert_id, db)
    alert.status = "ACKNOWLEDGED"
    alert.acknowledged_by = by
    await db.commit()
    return {"status": "acknowledged", "id": alert_id}


@router.patch("/{alert_id}/resolve")
async def resolve_alert(alert_id: str, db: AsyncSession = Depends(get_db)):
    alert = await _get_alert(alert_id, db)
    alert.status = "RESOLVED"
    alert.resolved_at = datetime.datetime.now(datetime.timezone.utc)
    await db.commit()
    return {"status": "resolved", "id": alert_id}


@router.delete("/{alert_id}")
async def dismiss_alert(alert_id: str, db: AsyncSession = Depends(get_db)):
    alert = await _get_alert(alert_id, db)
    await db.delete(alert)
    await db.commit()
    return {"status": "dismissed", "id": alert_id}


async def _get_alert(alert_id: str, db: AsyncSession) -> Alert:
    result = await db.execute(
        select(Alert).where(Alert.id == alert_id, Alert.account_id == ACCOUNT_ID)
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


def _serialize(r: Alert) -> dict:
    return {
        "id":              r.id,
        "title":           r.title,
        "message":         r.message,
        "severity":        r.severity,
        "category":        r.category,
        "source_ip":       r.source_ip,
        "endpoint":        r.endpoint,
        "status":          r.status,
        "acknowledged_by": r.acknowledged_by,
        "resolved_at":     r.resolved_at.isoformat() if r.resolved_at else None,
        "created_at":      r.created_at.isoformat() if r.created_at else None,
    }
