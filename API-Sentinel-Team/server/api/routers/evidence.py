"""Evidence API for policy, PII, and threat artifacts."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from server.models.core import EvidenceRecord
from server.modules.auth.rbac import RBAC
from server.modules.persistence.database import get_read_db

router = APIRouter()


@router.get("/")
async def list_evidence(
    endpoint_id: str | None = Query(None),
    evidence_type: str | None = Query(None),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_read_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    filters = [EvidenceRecord.account_id == account_id]
    if endpoint_id:
        filters.append(EvidenceRecord.endpoint_id == endpoint_id)
    if evidence_type:
        filters.append(EvidenceRecord.evidence_type == evidence_type)

    result = await db.execute(
        select(EvidenceRecord)
        .where(and_(*filters))
        .order_by(EvidenceRecord.created_at.desc())
        .limit(limit)
    )
    records = result.scalars().all()
    return {
        "total": len(records),
        "evidence": [
            {
                "id": r.id,
                "type": r.evidence_type,
                "endpoint_id": r.endpoint_id,
                "severity": r.severity,
                "summary": r.summary,
                "details": r.details,
                "created_at": str(r.created_at),
            }
            for r in records
        ],
    }
