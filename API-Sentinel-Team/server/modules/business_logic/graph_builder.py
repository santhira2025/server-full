"""Business logic graph construction and anomaly detection."""
from __future__ import annotations

import datetime
from collections import defaultdict
from typing import Optional

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from server.models.core import (
    RequestLog,
    BusinessLogicGraph,
    BusinessLogicViolation,
    EvidenceRecord,
)


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


async def get_latest_graph(db: AsyncSession, account_id: int) -> Optional[BusinessLogicGraph]:
    result = await db.execute(
        select(BusinessLogicGraph)
        .where(BusinessLogicGraph.account_id == account_id)
        .order_by(BusinessLogicGraph.built_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def build_graph(
    db: AsyncSession,
    account_id: int,
    window_days: int = 14,
    min_transitions: int = 3,
) -> BusinessLogicGraph:
    since = _now() - datetime.timedelta(days=window_days)
    logs_result = await db.execute(
        select(RequestLog)
        .where(RequestLog.account_id == account_id, RequestLog.created_at >= since)
        .order_by(RequestLog.source_ip, RequestLog.created_at)
    )
    logs = logs_result.scalars().all()

    # Group by actor to build ordered sequences.
    sequences: dict[str, list[RequestLog]] = defaultdict(list)
    for log in logs:
        sequences[log.source_ip or "unknown"].append(log)

    edge_counts: dict[tuple[str, str], list[int]] = defaultdict(list)
    node_counts: dict[str, int] = defaultdict(int)

    for _, seq in sequences.items():
        for idx, entry in enumerate(seq):
            if not entry.path:
                continue
            node_counts[entry.path] += 1
            if idx == 0:
                continue
            prev = seq[idx - 1]
            if not prev.path:
                continue
            delta_ms = int((entry.created_at - prev.created_at).total_seconds() * 1000)
            edge_counts[(prev.path, entry.path)].append(delta_ms)

    edges = []
    total_transitions = sum(len(v) for v in edge_counts.values()) or 1
    for (src, dst), deltas in edge_counts.items():
        if len(deltas) < min_transitions:
            continue
        edges.append({
            "from": src,
            "to": dst,
            "count": len(deltas),
            "weight": len(deltas) / total_transitions,
            "min_time_ms": min(deltas),
            "max_time_ms": max(deltas),
        })

    nodes = [{"path": path, "count": count} for path, count in node_counts.items()]

    prev_graph = await get_latest_graph(db, account_id)
    next_version = (prev_graph.version + 1) if prev_graph else 1
    graph = BusinessLogicGraph(
        account_id=account_id,
        version=next_version,
        nodes_json=nodes,
        edges_json=edges,
    )
    db.add(graph)
    await db.flush()
    return graph


async def detect_transition_violation(
    db: AsyncSession,
    account_id: int,
    actor_id: str,
    prev_path: Optional[str],
    curr_path: Optional[str],
) -> Optional[BusinessLogicViolation]:
    if not prev_path or not curr_path:
        return None

    graph = await get_latest_graph(db, account_id)
    if not graph or not graph.edges_json:
        return None

    allowed_edges = {
        (e.get("from"), e.get("to")): e
        for e in graph.edges_json
        if e.get("count", 0) >= 3
    }
    edge = allowed_edges.get((prev_path, curr_path))
    if edge:
        return None

    violation = BusinessLogicViolation(
        account_id=account_id,
        actor_id=actor_id,
        from_path=prev_path,
        to_path=curr_path,
        violation_type="FORBIDDEN_TRANSITION",
        confidence=0.7,
        details={"graph_version": graph.version},
    )
    db.add(violation)
    await db.flush()

    db.add(EvidenceRecord(
        account_id=account_id,
        evidence_type="bizlogic",
        ref_id=violation.id,
        severity="HIGH",
        summary=f"Unexpected transition {prev_path} -> {curr_path}",
        details={
            "actor_id": actor_id,
            "from_path": prev_path,
            "to_path": curr_path,
            "violation_type": violation.violation_type,
        },
    ))
    return violation
