from fastapi import APIRouter, Depends, Query, Body, HTTPException, Request
import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, and_, func
from server.modules.persistence.database import get_db
from server.modules.auth.rbac import RBAC
from server.models.core import Vulnerability
from server.api.rate_limiter import limiter

router = APIRouter()


@router.get("/summary/by-severity")
@limiter.limit("30/minute")
async def summary_by_severity(
    request: Request,
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db)
):
    account_id = payload.get("account_id")
    result = await db.execute(
        select(Vulnerability.severity, func.count(Vulnerability.id))
        .where(Vulnerability.account_id == account_id, Vulnerability.status == "OPEN")
        .group_by(Vulnerability.severity)
    )
    return {"summary": [{"severity": row[0], "count": row[1]} for row in result.all()]}


@router.get("/summary/by-type")
async def summary_by_type(
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db)
):
    account_id = payload.get("account_id")
    result = await db.execute(
        select(Vulnerability.type, func.count(Vulnerability.id))
        .where(Vulnerability.account_id == account_id, Vulnerability.status == "OPEN")
        .group_by(Vulnerability.type)
    )
    return {"summary": [{"type": row[0], "count": row[1]} for row in result.all()]}


@router.get("/")
@limiter.limit("60/minute")
async def get_vulnerabilities(
    request: Request,
    severity: str = Query(None, description="CRITICAL | HIGH | MEDIUM | LOW"),
    type: str = Query(None, description="BOLA | BFLA | NO_AUTH | INJECT | ..."),
    status: str = Query(None, description="OPEN | CLOSED | ACCEPTED_RISK"),
    false_positive: bool = Query(None),
    limit: int = Query(100),
    offset: int = Query(0),
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db),
):
    account_id = payload.get("account_id")
    filters = [Vulnerability.account_id == account_id]
    if severity:
        filters.append(Vulnerability.severity == severity.upper())
    if type:
        filters.append(Vulnerability.type == type.upper())
    if status:
        filters.append(Vulnerability.status == status.upper())
    if false_positive is not None:
        filters.append(Vulnerability.false_positive == false_positive)

    result = await db.execute(
        select(Vulnerability)
        .where(and_(*filters))
        .order_by(Vulnerability.created_at.desc())
        .limit(limit).offset(offset)
    )
    vulns = result.scalars().all()
    return {
        "total": len(vulns), "offset": offset,
        "vulnerabilities": [
            {"id": v.id, "template_id": v.template_id, "endpoint_id": v.endpoint_id,
             "url": v.url, "method": v.method, "severity": v.severity, "type": v.type,
             "description": v.description, "status": v.status, "false_positive": v.false_positive,
             "evidence": v.evidence, "created_at": str(v.created_at)}
            for v in vulns
        ],
    }


@router.get("/trend")
async def vulnerability_trend(
    start_ts: int = Query(None),
    end_ts: int = Query(None),
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Returns daily vulnerability counts for the testing trend chart."""
    account_id = payload.get("account_id")
    stmt = select(Vulnerability).where(Vulnerability.account_id == account_id)
    if start_ts:
        dt = datetime.datetime.fromtimestamp(start_ts / 1000)
        stmt = stmt.where(Vulnerability.created_at >= dt)
    if end_ts:
        dt = datetime.datetime.fromtimestamp(end_ts / 1000)
        stmt = stmt.where(Vulnerability.created_at <= dt)

    result = await db.execute(stmt)
    vulns = result.scalars().all()

    buckets = {}
    for v in vulns:
        day_ts = int(datetime.datetime(v.created_at.year, v.created_at.month, v.created_at.day).timestamp() * 1000)
        buckets[day_ts] = buckets.get(day_ts, 0) + 1

    trend = [{"ts": ts, "count": count} for ts, count in buckets.items()]
    trend.sort(key=lambda x: x["ts"])
    return {"issuesTrend": trend}


@router.get("/{vuln_id}")
async def get_vulnerability(
    vuln_id: str,
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db)
):
    account_id = payload.get("account_id")
    result = await db.execute(
        select(Vulnerability).where(
            and_(Vulnerability.id == vuln_id, Vulnerability.account_id == account_id)
        )
    )
    v = result.scalar_one_or_none()
    if not v:
        raise HTTPException(status_code=404, detail="Vulnerability not found")
    return {"id": v.id, "template_id": v.template_id, "endpoint_id": v.endpoint_id,
            "url": v.url, "method": v.method, "severity": v.severity, "type": v.type,
            "description": v.description, "status": v.status, "false_positive": v.false_positive,
            "evidence": v.evidence, "created_at": str(v.created_at)}


@router.post("/{vuln_id}/status")
async def update_vulnerability_status(
    vuln_id: str,
    status: str,
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db)
):
    account_id = payload.get("account_id")
    await db.execute(
        update(Vulnerability)
        .where(and_(Vulnerability.id == vuln_id, Vulnerability.account_id == account_id))
        .values(status=status.upper())
    )
    await db.commit()
    return {"status": "success", "id": vuln_id, "new_status": status.upper()}


@router.post("/{vuln_id}/false-positive")
async def mark_false_positive(
    vuln_id: str, 
    is_fp: bool = True, 
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db)
):
    account_id = payload.get("account_id")
    await db.execute(
        update(Vulnerability).where(
            and_(Vulnerability.id == vuln_id, Vulnerability.account_id == account_id)
        ).values(false_positive=is_fp)
    )
    await db.commit()
    return {"status": "success", "id": vuln_id, "false_positive": is_fp}


@router.delete("/{vuln_id}")
async def delete_vulnerability(
    vuln_id: str,
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db)
):
    account_id = payload.get("account_id")
    await db.execute(
        delete(Vulnerability).where(
            and_(Vulnerability.id == vuln_id, Vulnerability.account_id == account_id)
        )
    )
    await db.commit()
    return {"status": "success", "id": vuln_id}
@router.post("/bulk-status")
async def bulk_update_vulnerability_status(
    issue_ids: list[str] = Body(...),
    status: str = Body(...),
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Update status for multiple vulnerability IDs at once."""
    account_id = payload.get("account_id")
    await db.execute(
        update(Vulnerability)
        .where(Vulnerability.id.in_(issue_ids), Vulnerability.account_id == account_id)
        .values(status=status.upper())
    )
    await db.commit()
    return {"status": "success", "updated_count": len(issue_ids)}


