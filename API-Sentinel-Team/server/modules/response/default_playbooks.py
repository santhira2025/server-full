"""Seed default response playbooks for recon/lifecycle events."""
from __future__ import annotations

from typing import List, Dict, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from server.models.core import ResponsePlaybook


DEFAULT_PLAYBOOKS: List[Dict[str, Any]] = [
    {
        "name": "Shadow Endpoint Notify",
        "trigger": "endpoint.shadow_detected",
        "severity_threshold": "HIGH",
        "actions": [{"type": "NOTIFY"}],
    },
    {
        "name": "Shadow Endpoint Ticket",
        "trigger": "endpoint.shadow_detected",
        "severity_threshold": "HIGH",
        "enabled": False,
        "actions": [{"type": "CREATE_TICKET", "system": "jira"}],
    },
    {
        "name": "Zombie Endpoint Notify",
        "trigger": "endpoint.zombie_detected",
        "severity_threshold": "MEDIUM",
        "actions": [{"type": "NOTIFY"}],
    },
    {
        "name": "Zombie Endpoint Ticket",
        "trigger": "endpoint.zombie_detected",
        "severity_threshold": "MEDIUM",
        "enabled": False,
        "actions": [{"type": "CREATE_TICKET", "system": "jira"}],
    },
    {
        "name": "Zombie Revived Notify",
        "trigger": "endpoint.zombie_revived",
        "severity_threshold": "LOW",
        "actions": [{"type": "NOTIFY"}],
    },
]


async def ensure_default_playbooks(db: AsyncSession, account_id: int) -> int:
    """Ensure default playbooks exist; returns count created."""
    created = 0
    for pb in DEFAULT_PLAYBOOKS:
        exists = await db.scalar(
            select(ResponsePlaybook).where(
                ResponsePlaybook.account_id == account_id,
                ResponsePlaybook.name == pb["name"],
                ResponsePlaybook.trigger == pb["trigger"],
            )
        )
        if exists:
            continue
        db.add(
            ResponsePlaybook(
                account_id=account_id,
                name=pb["name"],
                trigger=pb["trigger"],
                severity_threshold=pb["severity_threshold"],
                enabled=pb.get("enabled", True),
                actions=pb["actions"],
            )
        )
        created += 1
    return created
