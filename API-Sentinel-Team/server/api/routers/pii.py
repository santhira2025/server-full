"""PII detection router — scan endpoints and sample data for sensitive information."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from server.modules.persistence.database import get_db, get_read_db
from server.modules.vulnerability_detector.pii_scanner import PIIScanner
from server.models.core import SampleData, APIEndpoint, SensitiveDataFinding
from server.modules.auth.rbac import RBAC

router = APIRouter()
_scanner = PIIScanner()


@router.get("/")
async def get_pii_findings(
    endpoint_id: str = Query(None),
    limit: int = Query(50),
    db: AsyncSession = Depends(get_read_db),
    payload: dict = Depends(RBAC.require_auth),
):
    """Return persisted PII findings (fast path)."""
    account_id = payload.get("account_id")
    query = select(SensitiveDataFinding).where(SensitiveDataFinding.account_id == account_id).limit(limit)
    if endpoint_id:
        query = query.where(SensitiveDataFinding.endpoint_id == endpoint_id)
    result = await db.execute(query)
    findings = result.scalars().all()
    return {
        "total": len(findings),
        "findings": [
            {
                "endpoint_id": f.endpoint_id,
                "entity_type": f.entity_type,
                "source": f.source,
                "sample_value": f.sample_value,
                "created_at": str(f.created_at),
            }
            for f in findings
        ],
    }


@router.post("/scan-endpoint")
async def scan_endpoint(
    endpoint_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    """Scan all captured traffic for a specific endpoint for PII."""
    account_id = payload.get("account_id")
    result = await db.execute(
        select(SampleData).where(
            SampleData.endpoint_id == endpoint_id,
            SampleData.account_id == account_id,
        )
    )
    samples = result.scalars().all()

    findings = []
    for sample in samples:
        for source, payload_body in [("response", (sample.response or {}).get("body", "")),
                                     ("request", (sample.request or {}).get("body", ""))]:
            for f in _scanner.scan_payload(payload_body):
                findings.append({"source": source, "sample_id": sample.id, **f})

    return {
        "endpoint_id": endpoint_id,
        "samples_scanned": len(samples),
        "findings": findings,
        "has_pii": len(findings) > 0,
    }


@router.post("/scan-text")
async def scan_text(text: str, payload: dict = Depends(RBAC.require_auth)):
    """Scan arbitrary text for PII patterns."""
    findings = _scanner.scan_string(text)
    return {"findings": findings, "has_pii": len(findings) > 0}
