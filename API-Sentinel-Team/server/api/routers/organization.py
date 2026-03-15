"""Organization — manage tenant accounts, plan tiers, and workspace settings."""
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.future import select
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from server.modules.persistence.database import get_db
from server.models.core import Account, User, APIEndpoint, Vulnerability, TestRun

router = APIRouter()

PLAN_TIERS = {"FREE", "STARTER", "PRO", "ENTERPRISE"}


@router.get("/")
async def list_organizations(db: AsyncSession = Depends(get_db)):
    """List all tenant accounts."""
    result = await db.execute(select(Account))
    accounts = result.scalars().all()
    return {
        "total": len(accounts),
        "organizations": [
            {"id": a.id, "name": a.name, "plan_tier": a.plan_tier, "created_at": str(a.created_at)}
            for a in accounts
        ],
    }


@router.get("/{account_id}")
async def get_organization(account_id: int, db: AsyncSession = Depends(get_db)):
    """Get organization details including usage stats."""
    result = await db.execute(select(Account).where(Account.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Organization not found")

    user_count = await db.scalar(
        select(func.count(User.id)).where(User.account_id == account_id)
    ) or 0
    endpoint_count = await db.scalar(
        select(func.count(APIEndpoint.id)).where(APIEndpoint.account_id == account_id)
    ) or 0
    open_vulns = await db.scalar(
        select(func.count(Vulnerability.id)).where(
            Vulnerability.account_id == account_id,
            Vulnerability.status == "OPEN",
        )
    ) or 0
    test_runs = await db.scalar(
        select(func.count(TestRun.id)).where(TestRun.account_id == account_id)
    ) or 0

    return {
        "id": account.id,
        "name": account.name,
        "plan_tier": account.plan_tier,
        "created_at": str(account.created_at),
        "usage": {
            "users": user_count,
            "endpoints": endpoint_count,
            "open_vulnerabilities": open_vulns,
            "test_runs": test_runs,
        },
    }


@router.patch("/{account_id}")
async def update_organization(
    account_id: int,
    name: str = Body(None),
    plan_tier: str = Body(None),
    db: AsyncSession = Depends(get_db),
):
    """Update organization name or plan tier."""
    result = await db.execute(select(Account).where(Account.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Organization not found")

    if name:
        account.name = name
    if plan_tier:
        if plan_tier.upper() not in PLAN_TIERS:
            raise HTTPException(status_code=400, detail=f"plan_tier must be one of: {PLAN_TIERS}")
        account.plan_tier = plan_tier.upper()

    await db.commit()
    return {"status": "updated", "id": account_id, "name": account.name, "plan_tier": account.plan_tier}


@router.get("/{account_id}/members")
async def list_members(account_id: int, db: AsyncSession = Depends(get_db)):
    """List all users belonging to an organization."""
    result = await db.execute(select(User).where(User.account_id == account_id))
    users = result.scalars().all()
    return {
        "account_id": account_id,
        "total": len(users),
        "members": [
            {"id": u.id, "email": u.email, "role": u.role, "created_at": str(u.created_at)}
            for u in users
        ],
    }


@router.post("/{account_id}/invite")
async def invite_member(
    account_id: int,
    email: str = Body(...),
    role: str = Body("MEMBER", description="ADMIN | MEMBER | VIEWER"),
    db: AsyncSession = Depends(get_db),
):
    """
    Invite a new member to the organization.
    Creates a placeholder User record (no password — user sets it on first login).
    """
    result = await db.execute(select(Account).where(Account.id == account_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Organization not found")

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        account_id=account_id,
        email=email,
        password_hash="INVITE_PENDING",
        role=role.upper(),
    )
    db.add(user)
    await db.commit()
    return {
        "status": "invited",
        "user_id": user.id,
        "email": email,
        "role": user.role,
        "note": "User must set password on first login",
    }


@router.delete("/{account_id}/members/{user_id}")
async def remove_member(account_id: int, user_id: str, db: AsyncSession = Depends(get_db)):
    """Remove a member from the organization."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.account_id == account_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found in this organization")
    await db.delete(user)
    await db.commit()
    return {"status": "removed", "user_id": user_id}
