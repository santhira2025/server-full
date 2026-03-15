import pytest
from sqlalchemy import select

from server.models.core import ResponsePlaybook, ResponseActionLog, Alert
from server.modules.response.playbook_executor import execute_playbooks


@pytest.mark.asyncio
async def test_execute_playbooks_logs_actions(db_session):
    playbook = ResponsePlaybook(
        id="pb-1",
        account_id=1000000,
        name="Test Playbook",
        trigger="alert.created",
        severity_threshold="LOW",
        enabled=True,
        actions=[{"type": "RATE_LIMIT_OVERRIDE"}],
    )
    alert = Alert(
        id="alert-1",
        account_id=1000000,
        title="Test Alert",
        message="Test",
        severity="HIGH",
        category="TEST",
        source_ip="1.2.3.4",
        endpoint="/test",
    )
    db_session.add(playbook)
    db_session.add(alert)
    await db_session.commit()

    logs = await execute_playbooks(db_session, alert, evidence={"source_ips": ["1.2.3.4"]})
    await db_session.commit()

    assert logs
    result = await db_session.execute(select(ResponseActionLog))
    rows = result.scalars().all()
    assert rows
    assert rows[0].status in {"SKIPPED", "SUCCESS"}
