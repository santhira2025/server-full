"""Tenant retention policy API."""
import uuid
from fastapi import APIRouter, Depends, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from server.models.core import TenantRetentionPolicy
from server.modules.auth.rbac import RBAC
from server.modules.persistence.database import get_db
from server.modules.privacy.retention import invalidate_retention_policy, get_retention_policy

router = APIRouter(tags=["Retention"])


@router.get("/")
async def get_policy(
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    return await get_retention_policy(db, account_id)


@router.put("/")
async def upsert_policy(
    full_payload_retention: bool = Body(default=False),
    retain_request_headers: bool = Body(default=False),
    retain_response_bodies: bool = Body(default=False),
    retention_encryption_key_id: str | None = Body(default=None),
    retention_period_days: int = Body(default=90),
    pii_categories_to_retain: list = Body(default=[]),
    pii_vault_enabled: bool = Body(default=True),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    result = await db.execute(
        select(TenantRetentionPolicy).where(TenantRetentionPolicy.account_id == account_id)
    )
    policy = result.scalar_one_or_none()
    if not policy:
        policy = TenantRetentionPolicy(
            id=str(uuid.uuid4()),
            account_id=account_id,
        )
        db.add(policy)

    policy.full_payload_retention = full_payload_retention
    policy.retain_request_headers = retain_request_headers
    policy.retain_response_bodies = retain_response_bodies
    policy.retention_encryption_key_id = retention_encryption_key_id
    policy.retention_period_days = retention_period_days
    policy.pii_categories_to_retain = pii_categories_to_retain
    policy.pii_vault_enabled = pii_vault_enabled

    await db.commit()
    invalidate_retention_policy(account_id)
    return {"status": "updated", "account_id": account_id}
