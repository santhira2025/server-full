"""Background analytics processor for near-real-time aggregates."""
from __future__ import annotations

import asyncio
import datetime
import logging

from server.modules.persistence.database import AsyncSessionLocal, apply_tenant_context
from server.modules.analytics.aggregator import aggregate_hourly, aggregate_alerts_daily
from server.modules.tenancy.context import set_current_account_id

logger = logging.getLogger(__name__)


class AnalyticsProcessor:
    def __init__(self, interval_sec: int = 60, account_id: int = 1000000):
        self.interval = interval_sec
        self.account_id = account_id
        self._task: asyncio.Task | None = None
        self._running = False

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None

    async def _loop(self) -> None:
        while self._running:
            try:
                await self._process_once()
            except Exception as exc:
                logger.error("analytics_processor_error", error=str(exc))
            await asyncio.sleep(self.interval)

    async def _process_once(self) -> None:
        now = datetime.datetime.now(datetime.timezone.utc)
        hour_end = now.replace(minute=0, second=0, microsecond=0)
        hour_start = hour_end - datetime.timedelta(hours=1)
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + datetime.timedelta(days=1)

        async with AsyncSessionLocal() as db:
            set_current_account_id(self.account_id)
            await apply_tenant_context(db)
            await aggregate_hourly(db, self.account_id, hour_start, hour_end)
            await aggregate_alerts_daily(db, self.account_id, day_start, day_end)
            await db.commit()
