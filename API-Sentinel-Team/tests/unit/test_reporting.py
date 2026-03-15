import pytest
from server.modules.test_executor.reporting import build_sarif, build_junit
from server.models.core import TestRun, TestResult


@pytest.mark.asyncio
async def test_sarif_and_junit_generation():
    run = TestRun(id="run-1", account_id=1000000, status="COMPLETED")
    results = [
        TestResult(
            run_id="run-1",
            endpoint_id="endpoint-1",
            template_id="TEMPLATE-1",
            is_vulnerable=True,
            severity="HIGH",
            evidence="evidence",
        )
    ]
    sarif = build_sarif(run, results)
    assert sarif["version"] == "2.1.0"
    junit = build_junit(run, results)
    assert "<testsuite" in junit
