"""Dashboard statistics endpoint — aggregated view of the security posture."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from server.modules.persistence.database import get_read_db
from server.models.core import (
    Vulnerability, TestRun, APIEndpoint, RequestLog, WAFEvent, TestResult
)
from server.modules.auth.rbac import RBAC
from server.modules.cache.redis_cache import get_cache_version, get_json, set_json
from server.config import settings

router = APIRouter()


@router.get("/")
async def get_dashboard(
    db: AsyncSession = Depends(get_read_db),
    payload: dict = Depends(RBAC.require_auth),
):
    """Returns all dashboard statistics in a single call."""
    account_id = payload.get("account_id")
    cache_version = await get_cache_version(account_id)
    cache_key = f"dashboard:{account_id}:{cache_version}"
    cached = await get_json(cache_key)
    if cached:
        return cached

    # Total endpoints
    ep_count = await db.scalar(
        select(func.count(APIEndpoint.id)).where(APIEndpoint.account_id == account_id)
    ) or 0

    # Vulnerabilities by severity
    vuln_by_severity = await db.execute(
        select(Vulnerability.severity, func.count(Vulnerability.id))
        .where(Vulnerability.account_id == account_id, Vulnerability.status == "OPEN")
        .group_by(Vulnerability.severity)
    )
    severity_counts = {row[0]: row[1] for row in vuln_by_severity.all()}
    total_open_vulns = sum(severity_counts.values())

    # Vulnerabilities by type
    vuln_by_type = await db.execute(
        select(Vulnerability.type, func.count(Vulnerability.id))
        .where(Vulnerability.account_id == account_id, Vulnerability.status == "OPEN")
        .group_by(Vulnerability.type)
        .order_by(func.count(Vulnerability.id).desc())
        .limit(10)
    )
    type_counts = [{"type": row[0], "count": row[1]} for row in vuln_by_type.all()]

    # Recent test runs
    recent_runs = await db.execute(
        select(TestRun)
        .where(TestRun.account_id == account_id)
        .order_by(desc(TestRun.created_at))
        .limit(5)
    )
    runs = [
        {"id": r.id, "status": r.status, "vulnerable_count": r.vulnerable_count,
         "total_tests": r.total_tests, "created_at": str(r.created_at)}
        for r in recent_runs.scalars().all()
    ]

    # WAF events last 24h
    from datetime import datetime, timedelta
    cutoff = datetime.utcnow() - timedelta(hours=24)
    waf_count = await db.scalar(
        select(func.count(WAFEvent.id)).where(WAFEvent.created_at >= cutoff)
    ) or 0

    # Request volume last hour
    hour_ago = datetime.utcnow() - timedelta(hours=1)
    req_count = await db.scalar(
        select(func.count(RequestLog.id)).where(RequestLog.created_at >= hour_ago)
    ) or 0

    # Risk score summary
    critical = severity_counts.get("CRITICAL", 0)
    high = severity_counts.get("HIGH", 0)
    medium = severity_counts.get("MEDIUM", 0)
    risk_score = min(100, critical * 20 + high * 10 + medium * 3)

    response = {
        "account_id": account_id,
        "summary": {
            "total_endpoints": ep_count,
            "total_open_vulnerabilities": total_open_vulns,
            "risk_score": risk_score,
            "waf_events_24h": waf_count,
            "requests_last_hour": req_count,
        },
        "vulnerabilities_by_severity": {
            "CRITICAL": severity_counts.get("CRITICAL", 0),
            "HIGH": severity_counts.get("HIGH", 0),
            "MEDIUM": severity_counts.get("MEDIUM", 0),
            "LOW": severity_counts.get("LOW", 0),
        },
        "top_vulnerability_types": type_counts,
        "recent_test_runs": runs,
    }
    await set_json(cache_key, response, ttl_seconds=settings.DASHBOARD_CACHE_TTL)
    return response


@router.get("/activity")
async def get_activity(
    limit: int = 20,
    db: AsyncSession = Depends(get_read_db),
    payload: dict = Depends(RBAC.require_auth),
):
    """Recent activity feed: vulnerabilities + WAF events + test runs."""
    account_id = payload.get("account_id")
    vulns = await db.execute(
        select(Vulnerability)
        .where(Vulnerability.account_id == account_id)
        .order_by(desc(Vulnerability.created_at))
        .limit(limit // 2)
    )
    waf = await db.execute(
        select(WAFEvent)
        .where(WAFEvent.account_id == account_id)
        .order_by(desc(WAFEvent.created_at))
        .limit(limit // 2)
    )

    activity = []
    for v in vulns.scalars().all():
        activity.append({
            "type": "vulnerability",
            "severity": v.severity,
            "message": f"{v.type} found at {v.url}",
            "created_at": str(v.created_at),
        })
    for e in waf.scalars().all():
        activity.append({
            "type": "waf_event",
            "severity": e.severity,
            "message": f"{e.action}: {e.rule_id} from {e.source_ip}",
            "created_at": str(e.created_at),
        })

    activity.sort(key=lambda x: x["created_at"], reverse=True)
    return {"activity": activity[:limit]}
