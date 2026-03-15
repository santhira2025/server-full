"""
APScheduler-based test scheduler for automated security scans.
Stores schedule configs in the test_schedules SQLite table.
"""
import asyncio
import datetime
import uuid

try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger
    APScheduler_AVAILABLE = True
except ImportError:
    APScheduler_AVAILABLE = False

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from server.models.core import TestSchedule


class TestScheduler:
    """
    Manages cron-based scheduling of security test runs.
    Falls back gracefully if APScheduler is not installed.
    """

    def __init__(self):
        self._scheduler = None
        if APScheduler_AVAILABLE:
            self._scheduler = AsyncIOScheduler()

    def start(self):
        if self._scheduler:
            self._scheduler.start()
            print("[Scheduler] APScheduler started.")

    def stop(self):
        if self._scheduler and self._scheduler.running:
            self._scheduler.shutdown()

    async def schedule(
        self,
        name: str,
        cron_expression: str,
        template_ids: list,
        endpoint_ids: list,
        db: AsyncSession,
    ) -> str:
        """
        Persist a schedule and register with APScheduler.
        cron_expression: e.g. "0 0 * * *" (daily at midnight)
        Returns the schedule id.
        """
        schedule_id = str(uuid.uuid4())
        record = TestSchedule(
            id=schedule_id,
            name=name,
            cron_expression=cron_expression,
            template_ids=template_ids,
            endpoint_ids=endpoint_ids,
            enabled=True,
            created_at=datetime.datetime.utcnow(),
        )
        db.add(record)
        await db.commit()

        self._register_job(schedule_id, cron_expression, template_ids, endpoint_ids)
        return schedule_id

    def _register_job(self, schedule_id: str, cron_expr: str, template_ids: list, endpoint_ids: list):
        if not self._scheduler:
            print(f"[Scheduler] APScheduler not available — schedule {schedule_id} not registered.")
            return
        parts = cron_expr.split()
        if len(parts) == 5:
            minute, hour, day, month, day_of_week = parts
        else:
            minute, hour, day, month, day_of_week = "0", "0", "*", "*", "*"

        trigger = CronTrigger(
            minute=minute, hour=hour, day=day,
            month=month, day_of_week=day_of_week,
        )
        self._scheduler.add_job(
            self._trigger_run,
            trigger=trigger,
            id=schedule_id,
            args=[template_ids, endpoint_ids],
            replace_existing=True,
        )

    async def _trigger_run(self, template_ids: list, endpoint_ids: list):
        """Called by APScheduler — import here to avoid circular imports."""
        from server.api.routers.tests import _run_security_tasks
        await _run_security_tasks("scheduled", template_ids, endpoint_ids)

    async def cancel(self, schedule_id: str, db: AsyncSession) -> None:
        if self._scheduler:
            try:
                self._scheduler.remove_job(schedule_id)
            except Exception:
                pass
        record = await db.get(TestSchedule, schedule_id)
        if record:
            record.enabled = False
            await db.commit()

    async def list_schedules(self, db: AsyncSession) -> list:
        result = await db.execute(select(TestSchedule).where(TestSchedule.enabled == True))
        return result.scalars().all()


# Singleton
_scheduler_instance: TestScheduler = None


def get_scheduler() -> TestScheduler:
    global _scheduler_instance
    if _scheduler_instance is None:
        _scheduler_instance = TestScheduler()
    return _scheduler_instance
