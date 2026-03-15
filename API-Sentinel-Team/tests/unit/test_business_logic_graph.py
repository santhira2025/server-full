import datetime
import pytest
from sqlalchemy import select

from server.models.core import RequestLog, BusinessLogicGraph
from server.modules.business_logic.graph_builder import build_graph


@pytest.mark.asyncio
async def test_build_graph_creates_edges(db_session):
    now = datetime.datetime.now(datetime.timezone.utc)
    logs = [
        RequestLog(
            account_id=1000000,
            source_ip="1.1.1.1",
            path="/login",
            created_at=now,
        ),
        RequestLog(
            account_id=1000000,
            source_ip="1.1.1.1",
            path="/orders",
            created_at=now + datetime.timedelta(seconds=1),
        ),
    ]
    for log in logs:
        db_session.add(log)
    await db_session.commit()

    graph = await build_graph(db_session, account_id=1000000, window_days=1, min_transitions=1)
    await db_session.commit()

    result = await db_session.execute(select(BusinessLogicGraph))
    stored = result.scalars().all()
    assert stored
    assert graph.edges_json
