"""CI/CD pipeline integration — webhook receivers + manual trigger + status badge."""
import hashlib
import hmac
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Header, Body, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from server.modules.persistence.database import get_db
from server.models.core import CICDTrigger
from server.modules.auth.rbac import RBAC, can_trigger_cicd

router = APIRouter(tags=["CI/CD Integration"])


@router.post("/webhook/github")
async def github_webhook(
    request: Request,
    x_hub_signature_256: Optional[str] = Header(None),
    x_github_event: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    """Receives GitHub push/PR webhooks; verifies HMAC-SHA256 signature."""
    body = await request.body()
    try:
        from server.config import settings
        secret = settings.GITHUB_WEBHOOK_SECRET
    except Exception:
        secret = ""
    if secret:
        expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(x_hub_signature_256 or "", expected):
            raise HTTPException(401, "Invalid webhook signature")

    payload = await request.json()
    branch = payload.get("ref", "").replace("refs/heads/", "")
    commit_sha = payload.get("after", "") or payload.get("pull_request", {}).get("head", {}).get("sha", "")
    repo = payload.get("repository", {}).get("full_name", "")

    trigger = CICDTrigger(id=str(uuid.uuid4()), source="github",
                          commit_sha=commit_sha, branch=branch, repo=repo,
                          status="QUEUED", webhook_payload=payload)
    db.add(trigger)
    await db.commit()
    return {"trigger_id": trigger.id, "status": "QUEUED", "event": x_github_event}


@router.post("/webhook/gitlab")
async def gitlab_webhook(
    request: Request,
    x_gitlab_token: Optional[str] = Header(None),
    x_gitlab_event: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    """Receives GitLab push/MR webhooks."""
    try:
        from server.config import settings
        secret = settings.GITLAB_WEBHOOK_SECRET
    except Exception:
        secret = ""
    if secret and x_gitlab_token != secret:
        raise HTTPException(401, "Invalid GitLab token")

    payload = await request.json()
    trigger = CICDTrigger(id=str(uuid.uuid4()), source="gitlab",
                          commit_sha=payload.get("checkout_sha", ""),
                          branch=payload.get("ref", "").replace("refs/heads/", ""),
                          repo=payload.get("project", {}).get("path_with_namespace", ""),
                          status="QUEUED", webhook_payload=payload)
    db.add(trigger)
    await db.commit()
    return {"trigger_id": trigger.id, "status": "QUEUED", "event": x_gitlab_event}


@router.post("/trigger")
async def manual_trigger(
    target_url: str = Body(...), template_ids: list = Body(default=[]),
    collection_id: Optional[str] = Body(None), branch: str = Body("main"),
    source: str = Body("manual"), commit_sha: str = Body(""),
    payload: dict = Depends(can_trigger_cicd), db: AsyncSession = Depends(get_db)
):
    """Manually queue a CI/CD security test run."""
    account_id = payload["account_id"]
    trigger = CICDTrigger(
        id=str(uuid.uuid4()), account_id=account_id, source=source,
        commit_sha=commit_sha, branch=branch, status="QUEUED",
        webhook_payload={"target_url": target_url, "template_ids": template_ids, "collection_id": collection_id},
    )
    db.add(trigger)
    await db.commit()
    return {"trigger_id": trigger.id, "status": "QUEUED"}


@router.get("/triggers")
async def list_triggers(
    payload: dict = Depends(RBAC.require_auth),
    source: Optional[str] = Query(None),
    limit: int = Query(50), db: AsyncSession = Depends(get_db)
):
    account_id = payload["account_id"]
    q = select(CICDTrigger).where(CICDTrigger.account_id == account_id)
    if source:
        q = q.where(CICDTrigger.source == source)
    result = await db.execute(q.order_by(CICDTrigger.created_at.desc()).limit(limit))
    triggers = result.scalars().all()
    return {"total": len(triggers), "triggers": [
        {"id": t.id, "source": t.source, "repo": t.repo, "branch": t.branch,
         "commit_sha": t.commit_sha, "status": t.status, "test_run_id": t.test_run_id,
         "created_at": t.created_at}
        for t in triggers
    ]}


@router.get("/triggers/{trigger_id}")
async def get_trigger(trigger_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CICDTrigger).where(CICDTrigger.id == trigger_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Trigger not found")
    return {"id": t.id, "source": t.source, "repo": t.repo, "branch": t.branch,
            "commit_sha": t.commit_sha, "status": t.status, "created_at": t.created_at}


@router.get("/badge/{account_id}", response_class=Response)
async def security_badge(account_id: int, db: AsyncSession = Depends(get_db)):
    """SVG badge for README embedding (green=PASSED, red=FAILED)."""
    result = await db.execute(
        select(CICDTrigger).where(CICDTrigger.account_id == account_id)
        .order_by(CICDTrigger.created_at.desc()).limit(1)
    )
    t = result.scalar_one_or_none()
    status = t.status if t else "unknown"
    fill = "#4c1" if status == "PASSED" else "#e05d44" if status == "FAILED" else "#9f9f9f"
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="130" height="20">'
           f'<rect width="130" height="20" rx="3" fill="#555"/>'
           f'<rect x="75" width="55" height="20" rx="3" fill="{fill}"/>'
           f'<text x="37" y="14" fill="#fff" font-size="11" font-family="sans-serif">API Security</text>'
           f'<text x="102" y="14" fill="#fff" font-size="11" font-family="sans-serif" text-anchor="middle">{status}</text>'
           f'</svg>')
    return Response(content=svg, media_type="image/svg+xml")
