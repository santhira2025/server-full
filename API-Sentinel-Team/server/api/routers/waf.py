"""WAF events router — log and query security events."""
from fastapi import APIRouter, Depends, Body, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from server.modules.persistence.database import get_db
from server.models.core import WAFEvent

router = APIRouter()


@router.get("/")
async def get_waf_events(
    limit: int = Query(50),
    action: str = Query(None, description="BLOCKED | LOGGED | ALLOWED"),
    severity: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Returns security events blocked or logged by the WAF."""
    query = select(WAFEvent).order_by(desc(WAFEvent.created_at)).limit(limit)
    if action:
        query = query.where(WAFEvent.action == action.upper())
    if severity:
        query = query.where(WAFEvent.severity == severity.upper())

    result = await db.execute(query)
    events = result.scalars().all()
    return {
        "total": len(events),
        "events": [
            {"id": e.id, "source_ip": e.source_ip, "rule_id": e.rule_id,
             "action": e.action, "method": e.method, "path": e.path,
             "severity": e.severity, "payload_snippet": e.payload_snippet,
             "created_at": str(e.created_at)}
            for e in events
        ],
    }


@router.post("/events")
async def log_waf_event(
    source_ip: str = Body(...),
    rule_id: str = Body(...),
    action: str = Body("BLOCKED"),
    method: str = Body(None),
    path: str = Body(None),
    payload_snippet: str = Body(None),
    severity: str = Body("MEDIUM"),
    endpoint_id: str = Body(None),
    db: AsyncSession = Depends(get_db),
):
    """Ingest a WAF security event."""
    event = WAFEvent(
        source_ip=source_ip,
        rule_id=rule_id,
        action=action.upper(),
        method=method,
        path=path,
        payload_snippet=payload_snippet,
        severity=severity.upper(),
        endpoint_id=endpoint_id,
    )
    db.add(event)
    await db.commit()
    return {"status": "logged", "id": event.id}


@router.post("/rules/reload")
async def reload_waf_rules():
    """Signal WAF to reload its ruleset (Coraza / ModSecurity hook point)."""
    return {"status": "rules_reloaded"}
