"""AuthMechanism CRUD — configure how auth tokens are sent per host."""
from fastapi import APIRouter, Depends, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update, and_
from server.modules.persistence.database import get_db
from server.modules.auth.rbac import RBAC
from server.models.core import AuthMechanism

router = APIRouter()


@router.get("/")
async def list_auth_mechanisms(
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db),
):
    account_id = payload.get("account_id")
    result = await db.execute(
        select(AuthMechanism).where(AuthMechanism.account_id == account_id)
    )
    mechs = result.scalars().all()
    return {
        "total": len(mechs),
        "mechanisms": [
            {"id": m.id, "name": m.name, "header_key": m.header_key,
             "prefix": m.prefix, "token_type": m.token_type,
             "created_at": str(m.created_at)}
            for m in mechs
        ],
    }


@router.post("/")
async def create_auth_mechanism(
    name: str = Body(...),
    header_key: str = Body("Authorization"),
    prefix: str = Body("Bearer "),
    token_type: str = Body("BEARER", description="BEARER | API_KEY | BASIC"),
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db),
):
    account_id = payload.get("account_id")
    mech = AuthMechanism(
        account_id=account_id,
        name=name,
        header_key=header_key,
        prefix=prefix,
        token_type=token_type.upper(),
    )
    db.add(mech)
    await db.commit()
    return {"status": "created", "id": mech.id, "name": mech.name}


@router.patch("/{mech_id}")
async def update_auth_mechanism(
    mech_id: str,
    header_key: str = Body(None),
    prefix: str = Body(None),
    token_type: str = Body(None),
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db),
):
    account_id = payload.get("account_id")
    values = {}
    if header_key is not None:
        values["header_key"] = header_key
    if prefix is not None:
        values["prefix"] = prefix
    if token_type is not None:
        values["token_type"] = token_type.upper()
    if values:
        await db.execute(
            update(AuthMechanism).where(
                and_(AuthMechanism.id == mech_id, AuthMechanism.account_id == account_id)
            ).values(**values)
        )
        await db.commit()
    return {"status": "updated", "id": mech_id}


@router.delete("/{mech_id}")
async def delete_auth_mechanism(
    mech_id: str,
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db),
):
    account_id = payload.get("account_id")
    await db.execute(
        delete(AuthMechanism).where(
            and_(AuthMechanism.id == mech_id, AuthMechanism.account_id == account_id)
        )
    )
    await db.commit()
    return {"status": "deleted", "id": mech_id}
