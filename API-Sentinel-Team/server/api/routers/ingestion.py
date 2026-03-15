"""Ingestion status + job tracking endpoints."""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from server.api.rate_limiter import limiter
from server.models.core import IngestionJob
from server.modules.auth.rbac import RBAC
from server.modules.ingestion.queue import ingestion_queue
from server.modules.persistence.database import get_read_db
from server.modules.quotas.tenant_quota import peek_ingest_quota, check_ingest_quota
from server.config import settings
from server.modules.ingestion.schema import EventBatch
from server.modules.ingestion.queue import IngestionJobItem
from server.modules.persistence.database import get_db
from server.modules.auth.audit import log_action

router = APIRouter()


@router.get("/status")
@limiter.limit("60/minute")
async def get_ingestion_status(
    request: Request,
    db: AsyncSession = Depends(get_read_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    quota = await peek_ingest_quota(account_id)

    recent = await db.execute(
        select(IngestionJob)
        .where(IngestionJob.account_id == account_id)
        .order_by(IngestionJob.created_at.desc())
        .limit(5)
    )
    jobs = recent.scalars().all()

    return {
        "queue": {
            "size": ingestion_queue.size(),
            "max_size": ingestion_queue.max_size(),
        },
        "quota": {
            "limit_per_minute": settings.INGESTION_RATE_LIMIT_RPM,
            "used": max(0, settings.INGESTION_RATE_LIMIT_RPM - quota.remaining),
            "remaining": quota.remaining,
            "reset_at": quota.reset_at,
        },
        "recent_jobs": [
            {
                "id": j.id,
                "type": j.job_type,
                "status": j.status,
                "accepted": j.accepted_count,
                "processed": j.processed_count,
                "threats_detected": j.threats_detected,
                "created_at": str(j.created_at),
            }
            for j in jobs
        ],
    }


@router.get("/jobs/{job_id}")
@limiter.limit("120/minute")
async def get_ingestion_job(
    request: Request,
    job_id: str,
    db: AsyncSession = Depends(get_read_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    result = await db.execute(
        select(IngestionJob).where(
            IngestionJob.id == job_id,
            IngestionJob.account_id == account_id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "id": job.id,
        "type": job.job_type,
        "status": job.status,
        "accepted": job.accepted_count,
        "processed": job.processed_count,
        "threats_detected": job.threats_detected,
        "error_count": job.error_count,
        "error_message": job.error_message,
        "created_at": str(job.created_at),
        "started_at": str(job.started_at) if job.started_at else None,
        "completed_at": str(job.completed_at) if job.completed_at else None,
    }


@router.post("/v2/events")
@limiter.limit("60/minute")
async def ingest_events_v2(
    request: Request,
    batch: EventBatch,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    """Canonical event ingestion (v2). Returns a job id."""
    account_id = payload.get("account_id")
    if not batch.events:
        raise HTTPException(status_code=400, detail="No events provided")
    if len(batch.events) > settings.INGESTION_MAX_EVENTS:
        raise HTTPException(status_code=413, detail="Too many events in one batch")

    quota = await check_ingest_quota(account_id, cost=len(batch.events))
    if not quota.allowed:
        raise HTTPException(status_code=429, detail="Ingestion rate limit exceeded")

    for ev in batch.events:
        if ev.account_id != account_id:
            raise HTTPException(status_code=403, detail="Event account_id mismatch")

    job_id = str(uuid.uuid4())
    job = IngestionJob(
        id=job_id,
        account_id=account_id,
        job_type="event_batch",
        status="QUEUED",
        accepted_count=len(batch.events),
        job_metadata={"schema_version": batch.version},
    )
    db.add(job)
    await db.commit()

    queued = await ingestion_queue.enqueue(
        IngestionJobItem(
            job_id=job_id,
            account_id=account_id,
            job_type="event_batch",
            payload={"events": [e.model_dump() for e in batch.events]},
        )
    )
    if not queued:
        job.status = "FAILED"
        job.error_message = "Queue full"
        await db.commit()
        raise HTTPException(status_code=429, detail="Ingestion queue is full")

    await log_action(
        db=db,
        account_id=account_id,
        action="INGESTION_V2_ENQUEUED",
        user_id=payload.get("user_id"),
        resource_type="ingestion_job",
        resource_id=job_id,
        details={"accepted": len(batch.events), "schema_version": batch.version},
    )
    await db.commit()

    return {"status": "queued", "job_id": job_id, "accepted": len(batch.events)}
