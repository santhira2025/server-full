"""Response playbooks API."""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Body, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete

from server.models.core import ResponsePlaybook, ResponseActionLog
from server.modules.auth.rbac import RBAC
from server.modules.persistence.database import get_db

router = APIRouter(tags=["Response Playbooks"])


@router.get("/")
async def list_playbooks(
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    result = await db.execute(select(ResponsePlaybook).where(ResponsePlaybook.account_id == account_id))
    items = result.scalars().all()
    return {
        "total": len(items),
        "playbooks": [
            {
                "id": p.id,
                "name": p.name,
                "trigger": p.trigger,
                "severity_threshold": p.severity_threshold,
                "enabled": p.enabled,
                "actions": p.actions,
                "created_at": p.created_at,
            }
            for p in items
        ],
    }


@router.post("/")
async def create_playbook(
    name: str = Body(...),
    trigger: str = Body(default="alert.created"),
    severity_threshold: str = Body(default="MEDIUM"),
    enabled: bool = Body(default=True),
    actions: List[dict] = Body(default=[]),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    pb = ResponsePlaybook(
        id=str(uuid.uuid4()),
        account_id=account_id,
        name=name,
        trigger=trigger,
        severity_threshold=severity_threshold.upper(),
        enabled=enabled,
        actions=actions,
    )
    db.add(pb)
    await db.commit()
    await db.refresh(pb)
    return {"id": pb.id, "status": "created"}


@router.get("/{playbook_id}")
async def get_playbook(
    playbook_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    result = await db.execute(
        select(ResponsePlaybook).where(ResponsePlaybook.id == playbook_id,
                                       ResponsePlaybook.account_id == account_id)
    )
    pb = result.scalar_one_or_none()
    if not pb:
        raise HTTPException(404, "Playbook not found")
    return {
        "id": pb.id,
        "name": pb.name,
        "trigger": pb.trigger,
        "severity_threshold": pb.severity_threshold,
        "enabled": pb.enabled,
        "actions": pb.actions,
        "created_at": pb.created_at,
    }


@router.patch("/{playbook_id}")
async def update_playbook(
    playbook_id: str,
    name: Optional[str] = Body(None),
    trigger: Optional[str] = Body(None),
    severity_threshold: Optional[str] = Body(None),
    enabled: Optional[bool] = Body(None),
    actions: Optional[List[dict]] = Body(None),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    updates = {}
    if name is not None:
        updates["name"] = name
    if trigger is not None:
        updates["trigger"] = trigger
    if severity_threshold is not None:
        updates["severity_threshold"] = severity_threshold.upper()
    if enabled is not None:
        updates["enabled"] = enabled
    if actions is not None:
        updates["actions"] = actions
    if not updates:
        raise HTTPException(400, "No updates provided")

    result = await db.execute(
        update(ResponsePlaybook)
        .where(ResponsePlaybook.id == playbook_id, ResponsePlaybook.account_id == account_id)
        .values(**updates)
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Playbook not found")
    await db.commit()
    return {"id": playbook_id, "updated": list(updates.keys())}


@router.delete("/{playbook_id}")
async def delete_playbook(
    playbook_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    result = await db.execute(
        delete(ResponsePlaybook).where(ResponsePlaybook.id == playbook_id,
                                       ResponsePlaybook.account_id == account_id)
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Playbook not found")
    await db.commit()
    return {"deleted": playbook_id}


@router.get("/actions/logs")
async def list_action_logs(
    playbook_id: str | None = Query(None),
    alert_id: str | None = Query(None),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    q = select(ResponseActionLog).where(ResponseActionLog.account_id == account_id)
    if playbook_id:
        q = q.where(ResponseActionLog.playbook_id == playbook_id)
    if alert_id:
        q = q.where(ResponseActionLog.alert_id == alert_id)
    q = q.order_by(ResponseActionLog.created_at.desc()).limit(limit)
    result = await db.execute(q)
    rows = result.scalars().all()
    return {
        "total": len(rows),
        "logs": [
            {
                "id": r.id,
                "playbook_id": r.playbook_id,
                "alert_id": r.alert_id,
                "action_type": r.action_type,
                "status": r.status,
                "details": r.details,
                "created_at": r.created_at,
            }
            for r in rows
        ],
    }
