"""CRUD endpoints for test schedules (cron-based)."""
from fastapi import APIRouter, Depends, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from server.modules.persistence.database import get_db
from server.modules.scheduler.test_scheduler import TestScheduler
from server.models.core import TestSchedule

router = APIRouter()
_scheduler = TestScheduler()


@router.get("/")
async def list_schedules(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TestSchedule).order_by(TestSchedule.created_at.desc()))
    schedules = result.scalars().all()
    return {
        "total": len(schedules),
        "schedules": [
            {"id": s.id, "name": s.name, "cron_expression": s.cron_expression,
             "template_ids": s.template_ids, "endpoint_ids": s.endpoint_ids,
             "enabled": s.enabled, "created_at": str(s.created_at)}
            for s in schedules
        ],
    }


@router.post("/")
async def create_schedule(
    name: str = Body(...),
    cron_expression: str = Body(..., example="0 2 * * *"),
    template_ids: list[str] = Body(...),
    endpoint_ids: list[str] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    schedule_id = await _scheduler.schedule(name, cron_expression, template_ids, endpoint_ids, db)
    return {"status": "created", "id": schedule_id, "name": name, "cron": cron_expression}


@router.patch("/{schedule_id}/toggle")
async def toggle_schedule(schedule_id: str, enabled: bool = True, db: AsyncSession = Depends(get_db)):
    await db.execute(update(TestSchedule).where(TestSchedule.id == schedule_id).values(enabled=enabled))
    await db.commit()
    return {"status": "updated", "id": schedule_id, "enabled": enabled}


@router.delete("/{schedule_id}")
async def delete_schedule(schedule_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(TestSchedule).where(TestSchedule.id == schedule_id))
    await db.commit()
    return {"status": "deleted", "id": schedule_id}
