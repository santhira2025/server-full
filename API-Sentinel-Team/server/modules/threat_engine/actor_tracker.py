from sqlalchemy.future import select
from sqlalchemy import update, func
from server.models.core import ThreatActor, MaliciousEvent
from server.modules.persistence.database import AsyncSessionLocal
import logging

logger = logging.getLogger(__name__)

class ActorTracker:
    """
    Identifies and profiles threat actors based on their activity logs.
    """
    async def track_activity(self, source_ip: str, event_type: str = None, severity: str = "LOW"):
        """
        Updates an actor's profile and potentially flags them.
        """
        async with AsyncSessionLocal() as session:
            # 1. Find or create actor
            stmt = select(ThreatActor).where(ThreatActor.source_ip == source_ip)
            result = await session.execute(stmt)
            actor = result.scalar_one_or_none()

            if not actor:
                actor = ThreatActor(source_ip=source_ip, event_count=1)
                session.add(actor)
            else:
                actor.event_count += 1
                
            # 2. Add Malicious Event if provided
            if event_type:
                new_event = MaliciousEvent(
                    actor_id=actor.id,
                    event_type=event_type,
                    severity=severity
                )
                session.add(new_event)
                
                # Simple risk scoring logic: severity-based weight
                weights = {"LOW": 1, "MEDIUM": 5, "HIGH": 20, "CRITICAL": 100}
                actor.risk_score += weights.get(severity, 1)

            # 3. Handle Status Transitions
            if actor.risk_score > 500:
                actor.status = "BLOCKED"
            elif actor.risk_score > 100:
                actor.status = "FLAGGED"

            await session.commit()
            return actor
