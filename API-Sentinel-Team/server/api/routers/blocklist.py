"""Block List — manage blocked IPs, auto-block high-risk actors, export nginx deny list."""
import uuid
import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from server.modules.persistence.database import get_db
from server.models.core import BlockedIP, ThreatActor

router = APIRouter()
ACCOUNT_ID = 1000000


class BlockRequest(BaseModel):
    ip: str
    reason: str | None = None
    expires_in_hours: float | None = None
    risk_score: float = 0.0


@router.get("/")
async def list_blocked(
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BlockedIP)
        .where(BlockedIP.account_id == ACCOUNT_ID)
        .order_by(BlockedIP.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = result.scalars().all()
    now = datetime.datetime.now(datetime.timezone.utc)
    return [
        {
            "id": r.id,
            "ip": r.ip,
            "reason": r.reason,
            "blocked_by": r.blocked_by,
            "risk_score": r.risk_score,
            "event_count": r.event_count,
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            "expired": r.expires_at is not None and r.expires_at < now,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/summary")
async def block_summary(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BlockedIP).where(BlockedIP.account_id == ACCOUNT_ID)
    )
    rows = result.scalars().all()
    now = datetime.datetime.now(datetime.timezone.utc)
    total     = len(rows)
    auto      = sum(1 for r in rows if r.blocked_by == "AUTO")
    manual    = sum(1 for r in rows if r.blocked_by == "MANUAL")
    sensor    = sum(1 for r in rows if r.blocked_by == "SENSOR")
    expiring  = sum(
        1 for r in rows
        if r.expires_at and (r.expires_at - now).total_seconds() < 86400
    )
    return {"total": total, "auto": auto, "manual": manual, "sensor": sensor, "expiring_soon": expiring}


@router.post("/")
async def block_ip(body: BlockRequest, db: AsyncSession = Depends(get_db)):
    # Check if already blocked
    existing = await db.execute(
        select(BlockedIP).where(BlockedIP.ip == body.ip)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"{body.ip} is already blocked")

    expires_at = None
    if body.expires_in_hours:
        expires_at = datetime.datetime.now(datetime.timezone.utc) + \
                     datetime.timedelta(hours=body.expires_in_hours)

    entry = BlockedIP(
        id=str(uuid.uuid4()),
        account_id=ACCOUNT_ID,
        ip=body.ip,
        reason=body.reason or "Manual block",
        blocked_by="MANUAL",
        risk_score=body.risk_score,
        expires_at=expires_at,
    )
    db.add(entry)
    await db.commit()
    return {"status": "blocked", "ip": body.ip}


@router.delete("/{ip}")
async def unblock_ip(ip: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BlockedIP).where(BlockedIP.ip == ip, BlockedIP.account_id == ACCOUNT_ID)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail=f"{ip} not found in block list")
    await db.delete(entry)
    await db.commit()
    return {"status": "unblocked", "ip": ip}


@router.get("/export/nginx", response_class=PlainTextResponse)
async def export_nginx_deny(db: AsyncSession = Depends(get_db)):
    """Export as nginx deny list — paste into nginx.conf or /etc/nginx/blocklist.conf"""
    result = await db.execute(
        select(BlockedIP)
        .where(BlockedIP.account_id == ACCOUNT_ID)
        .order_by(BlockedIP.created_at.desc())
    )
    rows = result.scalars().all()
    lines = [
        "# AppSentinel Block List — auto-generated",
        f"# Generated: {datetime.datetime.utcnow().isoformat()}Z",
        f"# Total: {len(rows)} blocked IPs",
        "",
    ]
    for r in rows:
        comment = f"# {r.reason or 'blocked'} | risk={r.risk_score:.0f} | by={r.blocked_by}"
        lines.append(comment)
        lines.append(f"deny {r.ip};")
    lines.append("")
    lines.append("# End of block list")
    return "\n".join(lines)


@router.post("/auto")
async def auto_block_high_risk(
    threshold: float = Query(80.0, description="Risk score threshold"),
    db: AsyncSession = Depends(get_db),
):
    """Auto-block all ThreatActors with risk_score >= threshold not already blocked."""
    actors_result = await db.execute(
        select(ThreatActor)
        .where(ThreatActor.account_id == ACCOUNT_ID, ThreatActor.risk_score >= threshold)
    )
    actors = actors_result.scalars().all()

    existing_result = await db.execute(
        select(BlockedIP.ip).where(BlockedIP.account_id == ACCOUNT_ID)
    )
    already_blocked = {row for row in existing_result.scalars().all()}

    newly_blocked = []
    for actor in actors:
        if actor.source_ip in already_blocked:
            continue
        entry = BlockedIP(
            id=str(uuid.uuid4()),
            account_id=ACCOUNT_ID,
            ip=actor.source_ip,
            reason=f"Auto-block: risk_score={actor.risk_score:.0f}, events={actor.event_count}",
            blocked_by="AUTO",
            risk_score=actor.risk_score,
            event_count=actor.event_count,
        )
        db.add(entry)
        newly_blocked.append(actor.source_ip)

    await db.commit()
    return {
        "status": "done",
        "newly_blocked": len(newly_blocked),
        "ips": newly_blocked,
        "threshold": threshold,
    }
