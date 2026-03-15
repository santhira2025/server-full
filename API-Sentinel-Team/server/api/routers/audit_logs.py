"""Audit Logs — immutable trail of all user/system actions for compliance."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.future import select
from sqlalchemy import desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from server.modules.persistence.database import get_db
from server.modules.auth.rbac import RBAC
from server.models.core import AuditLog

router = APIRouter()


@router.get("/")
async def list_audit_logs(
    payload: dict = Depends(RBAC.require_auth),
    action: str = Query(None, description="Filter by action type"),
    resource_type: str = Query(None, description="Filter by resource type"),
    user_id: str = Query(None),
    limit: int = Query(100),
    db: AsyncSession = Depends(get_db),
):
    account_id = payload.get("account_id")
    stmt = (
        select(AuditLog)
        .where(AuditLog.account_id == account_id)
        .order_by(desc(AuditLog.created_at))
        .limit(limit)
    )
    if action:
        stmt = stmt.where(AuditLog.action == action.upper())
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type == resource_type.lower())
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)

    result = await db.execute(stmt)
    logs = result.scalars().all()
    return {
        "total": len(logs),
        "logs": [
            {
                "id": l.id,
                "action": l.action,
                "resource_type": l.resource_type,
                "resource_id": l.resource_id,
                "user_id": l.user_id,
                "details": l.details,
                "ip_address": l.ip_address,
                "created_at": str(l.created_at),
            }
            for l in logs
        ],
    }


@router.get("/actions")
async def list_action_types(
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Return distinct action types seen in audit logs."""
    account_id = payload.get("account_id")
    result = await db.execute(
        select(AuditLog.action, func.count(AuditLog.id))
        .where(AuditLog.account_id == account_id)
        .group_by(AuditLog.action)
        .order_by(desc(func.count(AuditLog.id)))
    )
    return {"actions": [{"action": row[0], "count": row[1]} for row in result.all()]}


@router.get("/stats")
async def audit_stats(
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db),
):
    account_id = payload.get("account_id")
    total = await db.scalar(
        select(func.count(AuditLog.id)).where(AuditLog.account_id == account_id)
    ) or 0
    by_resource = await db.execute(
        select(AuditLog.resource_type, func.count(AuditLog.id))
        .where(AuditLog.account_id == account_id)
        .group_by(AuditLog.resource_type)
    )
    return {
        "total_events": total,
        "by_resource": [{"resource_type": r[0], "count": r[1]} for r in by_resource.all()],
    }


async def log_action(
    db: AsyncSession,
    action: str,
    resource_type: str = None,
    resource_id: str = None,
    user_id: str = None,
    account_id: int = 1000000,
    details: dict = None,
    ip_address: str = None,
) -> None:
    """Helper called by other routers to write audit entries."""
    entry = AuditLog(
        account_id=account_id,
        user_id=user_id,
        action=action.upper(),
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id else None,
        details=details or {},
        ip_address=ip_address,
    )
    db.add(entry)
    # Caller must commit
