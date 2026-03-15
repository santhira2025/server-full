"""MCP Endpoint Shield — protect Model Context Protocol endpoints from abuse."""
import re
import uuid
import time
from collections import defaultdict
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from server.modules.persistence.database import get_db
from server.models.core import MCPEndpoint, WAFEvent

router = APIRouter(tags=["MCP Shield"])

# In-memory RPM tracker: {endpoint_id: [timestamp, ...]}
# Timestamps older than 60 seconds are pruned on each request.
_rpm_tracker: dict = defaultdict(list)


@router.get("/endpoints")
async def list_mcp_endpoints(account_id: int = 1000000, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MCPEndpoint).where(MCPEndpoint.account_id == account_id))
    eps = result.scalars().all()
    return {"total": len(eps), "endpoints": [
        {"id": e.id, "name": e.name, "url": e.url, "shield_enabled": e.shield_enabled,
         "allowed_tools": e.allowed_tools, "blocked_patterns": e.blocked_patterns,
         "rate_limit_rpm": e.rate_limit_rpm, "created_at": e.created_at}
        for e in eps
    ]}


@router.post("/endpoints")
async def register_mcp_endpoint(
    name: str = Body(...), url: str = Body(...),
    allowed_tools: List[str] = Body(default=[]),
    blocked_patterns: List[str] = Body(default=[]),
    rate_limit_rpm: int = Body(60),
    account_id: int = 1000000,
    db: AsyncSession = Depends(get_db)
):
    ep = MCPEndpoint(id=str(uuid.uuid4()), account_id=account_id, name=name, url=url,
                     allowed_tools=allowed_tools, blocked_patterns=blocked_patterns,
                     rate_limit_rpm=rate_limit_rpm)
    db.add(ep)
    await db.commit()
    return {"id": ep.id, "name": name, "url": url}


@router.post("/endpoints/{endpoint_id}/inspect")
async def inspect_mcp_request(
    endpoint_id: str,
    tool_name: str = Body(...),
    parameters: dict = Body(default={}),
    source_ip: str = Body("unknown"),
    db: AsyncSession = Depends(get_db)
):
    """Inspect an MCP tool call for policy violations. Returns ALLOW/BLOCK."""
    result = await db.execute(select(MCPEndpoint).where(MCPEndpoint.id == endpoint_id))
    ep = result.scalar_one_or_none()
    if not ep:
        raise HTTPException(404, "MCP endpoint not found")

    if not ep.shield_enabled:
        return {"action": "ALLOW", "reason": "Shield disabled"}

    # ── Rate limit enforcement ─────────────────────────────────────────────
    now = time.time()
    window = _rpm_tracker[endpoint_id]
    # Prune timestamps older than 60 seconds
    _rpm_tracker[endpoint_id] = [t for t in window if now - t < 60]
    _rpm_tracker[endpoint_id].append(now)
    if len(_rpm_tracker[endpoint_id]) > ep.rate_limit_rpm:
        db.add(WAFEvent(id=str(uuid.uuid4()), source_ip=source_ip, endpoint_id=endpoint_id,
                        rule_id="MCP_RATE_LIMIT_EXCEEDED", action="BLOCKED", method="MCP",
                        path=f"/mcp/{tool_name}", payload_snippet="rate_limit", severity="MEDIUM"))
        await db.commit()
        return {"action": "BLOCK", "reason": f"Rate limit exceeded ({ep.rate_limit_rpm} rpm)",
                "retry_after_seconds": 60}

    if ep.allowed_tools and tool_name not in ep.allowed_tools:
        db.add(WAFEvent(id=str(uuid.uuid4()), source_ip=source_ip, endpoint_id=endpoint_id,
                        rule_id="MCP_TOOL_NOT_ALLOWED", action="BLOCKED", method="MCP",
                        path=f"/mcp/{tool_name}", payload_snippet=str(parameters)[:200], severity="HIGH"))
        await db.commit()
        return {"action": "BLOCK", "reason": f"Tool '{tool_name}' not in allowed list",
                "allowed_tools": ep.allowed_tools}

    param_str = str(parameters)
    for pattern in (ep.blocked_patterns or []):
        try:
            if re.search(pattern, param_str, re.IGNORECASE):
                db.add(WAFEvent(id=str(uuid.uuid4()), source_ip=source_ip, endpoint_id=endpoint_id,
                                rule_id="MCP_BLOCKED_PATTERN", action="BLOCKED", method="MCP",
                                path=f"/mcp/{tool_name}", payload_snippet=param_str[:200], severity="CRITICAL"))
                await db.commit()
                return {"action": "BLOCK", "reason": f"Parameters match blocked pattern: {pattern}"}
        except re.error:
            pass

    return {"action": "ALLOW", "tool_name": tool_name, "endpoint_id": endpoint_id}


@router.patch("/endpoints/{endpoint_id}")
async def update_mcp_endpoint(
    endpoint_id: str,
    shield_enabled: Optional[bool] = Body(None),
    allowed_tools: Optional[List[str]] = Body(None),
    blocked_patterns: Optional[List[str]] = Body(None),
    rate_limit_rpm: Optional[int] = Body(None),
    db: AsyncSession = Depends(get_db)
):
    updates = {}
    if shield_enabled is not None:    updates["shield_enabled"] = shield_enabled
    if allowed_tools is not None:     updates["allowed_tools"] = allowed_tools
    if blocked_patterns is not None:  updates["blocked_patterns"] = blocked_patterns
    if rate_limit_rpm is not None:    updates["rate_limit_rpm"] = rate_limit_rpm
    if not updates:
        raise HTTPException(400, "No updates provided")
    await db.execute(update(MCPEndpoint).where(MCPEndpoint.id == endpoint_id).values(**updates))
    await db.commit()
    return {"endpoint_id": endpoint_id, "updated": list(updates.keys())}


@router.delete("/endpoints/{endpoint_id}")
async def delete_mcp_endpoint(endpoint_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MCPEndpoint).where(MCPEndpoint.id == endpoint_id))
    ep = result.scalar_one_or_none()
    if not ep:
        raise HTTPException(404, "Not found")
    await db.delete(ep)
    await db.commit()
    return {"deleted": endpoint_id}
