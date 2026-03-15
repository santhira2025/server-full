"""Endpoint lifecycle processor for shadow/zombie status updates."""
from __future__ import annotations

import asyncio
import datetime
import logging

from sqlalchemy import update, and_, select, func

from server.config import settings
from server.modules.persistence.database import AsyncSessionLocal
from server.models.core import APIEndpoint
from server.modules.integrations.dispatcher import dispatch_event
from server.models.core import EvidenceRecord, PolicyViolation
from server.models.core import Alert
from server.modules.response.playbook_executor import execute_playbooks

logger = logging.getLogger(__name__)


class EndpointLifecycleProcessor:
    def __init__(self, interval_sec: int = 3600) -> None:
        self.interval = interval_sec
        self._running = False
        self._task: asyncio.Task | None = None

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
                await self._sweep()
            except Exception as exc:
                logger.error("lifecycle_sweep_error", error=str(exc))
            await asyncio.sleep(self.interval)

    async def _sweep(self) -> None:
        threshold = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(
            days=settings.ZOMBIE_ENDPOINT_DAYS
        )
        async with AsyncSessionLocal() as db:
            zombie_counts = await db.execute(
                select(APIEndpoint.account_id, func.count(APIEndpoint.id))
                .where(
                    and_(
                        APIEndpoint.last_seen.isnot(None),
                        APIEndpoint.last_seen < threshold,
                        APIEndpoint.status != "ZOMBIE",
                        APIEndpoint.status != "DEPRECATED",
                    )
                )
                .group_by(APIEndpoint.account_id)
            )
            zombie_map = {row[0]: row[1] for row in zombie_counts.all()}

            revive_counts = await db.execute(
                select(APIEndpoint.account_id, func.count(APIEndpoint.id))
                .where(
                    and_(
                        APIEndpoint.last_seen.isnot(None),
                        APIEndpoint.last_seen >= threshold,
                        APIEndpoint.status == "ZOMBIE",
                    )
                )
                .group_by(APIEndpoint.account_id)
            )
            revive_map = {row[0]: row[1] for row in revive_counts.all()}

            # Mark inactive endpoints as zombie
            result = await db.execute(
                update(APIEndpoint)
                .where(
                    and_(
                        APIEndpoint.last_seen.isnot(None),
                        APIEndpoint.last_seen < threshold,
                        APIEndpoint.status != "ZOMBIE",
                        APIEndpoint.status != "DEPRECATED",
                    )
                )
                .values(status="ZOMBIE")
            )
            zombie_count = result.rowcount or 0

            if zombie_count:
                # Add evidence records for newly zombified endpoints (sampled by threshold)
                candidates = await db.execute(
                    select(APIEndpoint).where(
                        and_(
                            APIEndpoint.last_seen.isnot(None),
                            APIEndpoint.last_seen < threshold,
                            APIEndpoint.status == "ZOMBIE",
                        )
                    ).limit(200)
                )
                for ep in candidates.scalars().all():
                    db.add(EvidenceRecord(
                        account_id=ep.account_id,
                        evidence_type="lifecycle",
                        ref_id=ep.id,
                        endpoint_id=ep.id,
                        severity="MEDIUM",
                        summary="Endpoint marked as ZOMBIE due to inactivity",
                        details={
                            "endpoint": ep.path_pattern or ep.path,
                            "host": ep.host,
                            "last_seen": ep.last_seen.isoformat() if ep.last_seen else None,
                        },
                    ))
                    existing = await db.scalar(
                        select(PolicyViolation).where(
                            PolicyViolation.account_id == ep.account_id,
                            PolicyViolation.endpoint_id == ep.id,
                            PolicyViolation.rule_type == "ZOMBIE_ENDPOINT",
                            PolicyViolation.status == "OPEN",
                        )
                    )
                    if not existing:
                        db.add(PolicyViolation(
                            account_id=ep.account_id,
                            endpoint_id=ep.id,
                            rule_type="ZOMBIE_ENDPOINT",
                            severity="MEDIUM",
                            status="OPEN",
                            message="Endpoint marked as ZOMBIE due to inactivity",
                            violation_metadata={
                                "last_seen": ep.last_seen.isoformat() if ep.last_seen else None,
                            },
                        ))

            # Revive zombie endpoints if traffic resumes
            result = await db.execute(
                update(APIEndpoint)
                .where(
                    and_(
                        APIEndpoint.last_seen.isnot(None),
                        APIEndpoint.last_seen >= threshold,
                        APIEndpoint.status == "ZOMBIE",
                    )
                )
                .values(status="ACTIVE")
            )
            revived_count = result.rowcount or 0

            await db.commit()

            for account_id, count in zombie_map.items():
                if count:
                    alert = Alert(
                        account_id=account_id,
                        title="Zombie endpoints detected",
                        message=f"{count} endpoints marked as ZOMBIE due to inactivity",
                        severity="MEDIUM",
                        category="ZOMBIE_ENDPOINT",
                        endpoint=None,
                    )
                    db.add(alert)
                    await db.flush()
                    await execute_playbooks(
                        db,
                        alert,
                        evidence={"count": count},
                        trigger="endpoint.zombie_detected",
                    )
                    await dispatch_event(
                        "endpoint.zombie_detected",
                        {
                            "type": "ZOMBIE_ENDPOINT",
                            "severity": "MEDIUM",
                            "description": f"{count} endpoints marked as ZOMBIE",
                            "count": count,
                        },
                        account_id,
                        db,
                    )
            for account_id, count in revive_map.items():
                if count:
                    alert = Alert(
                        account_id=account_id,
                        title="Zombie endpoints revived",
                        message=f"{count} endpoints revived from ZOMBIE status",
                        severity="LOW",
                        category="ZOMBIE_REVIVED",
                        endpoint=None,
                    )
                    db.add(alert)
                    await db.flush()
                    await execute_playbooks(
                        db,
                        alert,
                        evidence={"count": count},
                        trigger="endpoint.zombie_revived",
                    )
                    await dispatch_event(
                        "endpoint.zombie_revived",
                        {
                            "type": "ZOMBIE_REVIVED",
                            "severity": "LOW",
                            "description": f"{count} endpoints revived from ZOMBIE",
                            "count": count,
                        },
                        account_id,
                        db,
                    )
                    await db.execute(
                        PolicyViolation.__table__.update()
                        .where(
                            PolicyViolation.account_id == account_id,
                            PolicyViolation.rule_type == "ZOMBIE_ENDPOINT",
                            PolicyViolation.status == "OPEN",
                        )
                        .values(status="RESOLVED")
                    )

        if zombie_count or revived_count:
            logger.info(
                "lifecycle_sweep",
                zombie_marked=zombie_count,
                zombie_revived=revived_count,
            )
