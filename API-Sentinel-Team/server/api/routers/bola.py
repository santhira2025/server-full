"""BOLA (Broken Object Level Authorization) — testing logic and playground."""
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
import httpx
import json
import uuid
from datetime import datetime

from server.modules.persistence.database import get_db
from server.models.core import APIEndpoint, TestAccount, SampleData, TestRun, TestResult, Vulnerability
from server.modules.test_executor.request_mutator import RequestMutator

router = APIRouter()
mutator = RequestMutator()

@router.post("/scan-endpoint/{ep_id}")
async def scan_endpoint_for_bola(
    ep_id: str,
    attacker_role_id: str = Body(...),
    account_id: int = 1000000,
    db: AsyncSession = Depends(get_db)
):
    """
    Perform a BOLA test on a specific endpoint by swapping tokens.
    1. Get the endpoint and its sample data (Victim's request).
    2. Get the Attacker's token from TestAccount.
    3. Send the mutated request (Victim's ID, Attacker's Token).
    4. Detect BOLA if the response is 2xx.
    """
    # 1. Fetch Endpoint & Sample Data
    ep_result = await db.execute(select(APIEndpoint).where(APIEndpoint.id == ep_id))
    ep = ep_result.scalar_one_or_none()
    if not ep:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    sample_result = await db.execute(
        select(SampleData).where(SampleData.endpoint_id == ep_id).order_by(SampleData.created_at.desc()).limit(1)
    )
    sample = sample_result.scalar_one_or_none()
    if not sample:
        raise HTTPException(status_code=400, detail="No sample data found for this endpoint. Cannot replay.")

    # 2. Fetch Attacker Context
    attacker_result = await db.execute(select(TestAccount).where(TestAccount.id == attacker_role_id))
    attacker = attacker_result.scalar_one_or_none()
    if not attacker:
        raise HTTPException(status_code=400, detail="Attacker role not found")

    attacker_token = attacker.auth_headers.get("Authorization") or attacker.auth_headers.get("authorization")
    if not attacker_token:
        # Fallback to plain token if headers not mapped
        attacker_token = f"Bearer {attacker.auth_token}"

    # 3. Mutate Request (Swap Token)
    original_req = sample.request
    rule = {"replace_auth_header": True}
    auth_ctx = {"attacker_token": attacker_token, "auth_header": "Authorization"}
    mutated_req = mutator.mutate(original_req, rule, auth_ctx)

    # 4. Execute Test
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            method = mutated_req.get("method", "GET").upper()
            url = mutated_req.get("url")
            headers = mutated_req.get("headers", {})
            body = mutated_req.get("body", "")

            start_time = datetime.utcnow()
            resp = await client.request(
                method=method,
                url=url,
                headers=headers,
                content=body if isinstance(body, str) else json.dumps(body)
            )
            end_time = datetime.utcnow()

            # 5. Analysis
            is_vulnerable = resp.status_code in (200, 201, 204)
            
            # Create Test Result
            test_res = TestResult(
                endpoint_id=ep_id,
                template_id="BOLA_AUTH_SWAP",
                is_vulnerable=is_vulnerable,
                severity="HIGH" if is_vulnerable else "INFO",
                sent_request=mutated_req,
                received_response={
                    "status_code": resp.status_code,
                    "body": resp.text[:2000],  # Truncate large responses
                    "headers": dict(resp.headers)
                },
                evidence=f"Access granted to {url} with Attacker token (Status: {resp.status_code})" if is_vulnerable else "Access Denied / Status Correct"
            )
            db.add(test_res)

            if is_vulnerable:
                # Log as Vulnerability
                vuln = Vulnerability(
                    account_id=account_id,
                    template_id="BOLA_AUTH_SWAP",
                    endpoint_id=ep_id,
                    url=url,
                    method=method,
                    severity="HIGH",
                    type="BOLA",
                    description=f"Endpoint permits access to data using an unauthorized token (Attacker: {attacker.name})",
                    confidence="HIGH",
                    remediation="Implement robust object-level authorization checks. Ensure the authenticated user has permission to access the specific resource ID requested.",
                    evidence=test_res.received_response
                )
                db.add(vuln)

            await db.commit()
            return {
                "status": "vulnerable" if is_vulnerable else "secured",
                "response_code": resp.status_code,
                "test_id": test_res.id
            }

        except Exception as e:
            await db.rollback()
            raise HTTPException(status_code=500, detail=f"BOLA Replay failed: {str(e)}")

@router.get("/vulnerabilities")
async def list_bola_vulns(account_id: int = 1000000, db: AsyncSession = Depends(get_db)):
    """List all found BOLA vulnerabilities."""
    result = await db.execute(
        select(Vulnerability).where(Vulnerability.type == "BOLA", Vulnerability.account_id == account_id)
    )
    vulns = result.scalars().all()
    return [
        {"id": v.id, "endpoint_id": v.endpoint_id, "url": v.url, "method": v.method,
         "severity": v.severity, "description": v.description, "confidence": v.confidence,
         "status": v.status, "created_at": str(v.created_at)}
        for v in vulns
    ]
