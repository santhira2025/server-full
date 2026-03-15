"""Enforcement APIs for inline/out-of-band response actions."""
import uuid
import datetime
from fastapi import APIRouter, Depends, Body, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from server.modules.auth.rbac import RBAC
from server.modules.persistence.database import get_db
from server.models.core import EndpointBlock, RateLimitOverride
from server.modules.enforcement.engine import (
    push_waf_rule,
    rate_limit_override,
    token_invalidate,
    circuit_breaker,
)

router = APIRouter(tags=["Enforcement"])


@router.post("/waf-rule")
async def waf_rule_push(
    rule_id: str = Body(default="auto-block"),
    source_ips: list = Body(default=[]),
    path: str | None = Body(default=None),
    severity: str = Body(default="HIGH"),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    result = await push_waf_rule(db, account_id, rule_id, source_ips, path, severity)
    await db.commit()
    return result


@router.post("/rate-limit")
async def apply_rate_limit(
    endpoint_id: str = Body(...),
    limit_rpm: int = Body(default=60),
    duration_minutes: int = Body(default=60),
    reason: str | None = Body(default=None),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    result = await rate_limit_override(db, account_id, endpoint_id, limit_rpm, duration_minutes, reason)
    await db.commit()
    return result


@router.get("/rate-limit")
async def list_rate_limits(
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    result = await db.execute(
        select(RateLimitOverride).where(RateLimitOverride.account_id == account_id)
        .order_by(RateLimitOverride.created_at.desc())
    )
    rows = result.scalars().all()
    return {"total": len(rows), "overrides": [
        {
            "id": r.id,
            "endpoint_id": r.endpoint_id,
            "limit_rpm": r.limit_rpm,
            "duration_minutes": r.duration_minutes,
            "reason": r.reason,
            "expires_at": r.expires_at,
            "created_at": r.created_at,
        } for r in rows
    ]}


@router.delete("/rate-limit/{override_id}")
async def delete_rate_limit(
    override_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    result = await db.execute(
        delete(RateLimitOverride).where(
            RateLimitOverride.id == override_id,
            RateLimitOverride.account_id == account_id,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Override not found")
    await db.commit()
    return {"deleted": override_id}


@router.post("/token-invalidate")
async def invalidate_token(
    token_jti: str = Body(...),
    expires_minutes: int = Body(default=1440),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    result = await token_invalidate(db, account_id, token_jti=token_jti, expires_minutes=expires_minutes)
    await db.commit()
    return result


@router.post("/endpoint-block")
async def block_endpoint(
    endpoint_id: str = Body(...),
    duration_minutes: int = Body(default=60),
    reason: str | None = Body(default=None),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    result = await circuit_breaker(db, account_id, endpoint_id, duration_minutes, reason, blocked_by="MANUAL")
    await db.commit()
    return result


@router.get("/endpoint-block")
async def list_endpoint_blocks(
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    result = await db.execute(
        select(EndpointBlock).where(EndpointBlock.account_id == account_id)
        .order_by(EndpointBlock.created_at.desc())
    )
    rows = result.scalars().all()
    return {"total": len(rows), "blocks": [
        {
            "id": r.id,
            "endpoint_id": r.endpoint_id,
            "reason": r.reason,
            "blocked_by": r.blocked_by,
            "expires_at": r.expires_at,
            "created_at": r.created_at,
        } for r in rows
    ]}


@router.delete("/endpoint-block/{block_id}")
async def delete_endpoint_block(
    block_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    result = await db.execute(
        delete(EndpointBlock).where(
            EndpointBlock.id == block_id,
            EndpointBlock.account_id == account_id,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Block not found")
    await db.commit()
    return {"deleted": block_id}
