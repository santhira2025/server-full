"""OpenAPI spec management and validation."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from server.models.core import APIEndpoint, OpenAPISpec, PolicyViolation, EvidenceRecord
from server.modules.auth.rbac import RBAC
from server.modules.api_inventory.openapi_generator import OpenAPIGenerator
from server.modules.persistence.database import get_db

router = APIRouter()
_gen = OpenAPIGenerator()


@router.post("/rebuild")
async def rebuild_openapi(
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db),
):
    account_id = payload.get("account_id")
    spec = await _gen.generate_spec(collection_name="Discovered API", account_id=account_id)
    record = OpenAPISpec(account_id=account_id, spec_json=spec)
    db.add(record)
    await db.commit()
    return {"status": "created", "id": record.id}


@router.get("/latest")
async def get_latest_openapi(
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db),
):
    account_id = payload.get("account_id")
    result = await db.execute(
        select(OpenAPISpec)
        .where(OpenAPISpec.account_id == account_id)
        .order_by(OpenAPISpec.created_at.desc())
        .limit(1)
    )
    spec = result.scalar_one_or_none()
    if not spec:
        raise HTTPException(status_code=404, detail="No OpenAPI spec found")
    return {"id": spec.id, "spec": spec.spec_json}


@router.post("/validate")
async def validate_against_openapi(
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Validate discovered endpoints against the latest OpenAPI spec."""
    account_id = payload.get("account_id")
    spec_result = await db.execute(
        select(OpenAPISpec)
        .where(OpenAPISpec.account_id == account_id)
        .order_by(OpenAPISpec.created_at.desc())
        .limit(1)
    )
    spec = spec_result.scalar_one_or_none()
    if not spec:
        raise HTTPException(status_code=404, detail="No OpenAPI spec found")

    paths = (spec.spec_json or {}).get("paths", {})
    eps_result = await db.execute(
        select(APIEndpoint).where(APIEndpoint.account_id == account_id)
    )
    endpoints = eps_result.scalars().all()

    violations = []
    for ep in endpoints:
        path_entry = paths.get(ep.path or "")
        if not path_entry or ep.method.lower() not in path_entry:
            v = PolicyViolation(
                account_id=account_id,
                endpoint_id=ep.id,
                rule_type="SCHEMA",
                severity="HIGH",
                message=f"Endpoint {ep.method} {ep.path} missing from OpenAPI spec",
            )
            db.add(v)
            violations.append(v)

    await db.flush()
    for v in violations:
        db.add(EvidenceRecord(
            account_id=account_id,
            evidence_type="policy",
            ref_id=v.id,
            endpoint_id=v.endpoint_id,
            severity=v.severity,
            summary=v.message,
        ))

    await db.commit()
    return {"violations_found": len(violations)}
