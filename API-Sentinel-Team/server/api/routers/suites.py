"""Test suite endpoints — list and execute built-in suites."""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from server.modules.persistence.database import get_db, AsyncSessionLocal
from server.modules.suites.suite_manager import SuiteManager
from server.modules.test_executor.execution_engine import ExecutionEngine
from server.modules.test_executor.result_aggregator import ResultAggregator
from server.models.core import APIEndpoint
from sqlalchemy import select, and_
from server.modules.auth.rbac import RBAC

router = APIRouter()
_suite_manager = SuiteManager()


async def _run_suite(suite_name: str, endpoint_ids: list[str], account_id: int):
    templates = _suite_manager.get_suite_templates(suite_name)
    engine = ExecutionEngine()
    aggregator = ResultAggregator()

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(APIEndpoint).where(
                and_(APIEndpoint.id.in_(endpoint_ids), APIEndpoint.account_id == account_id)
            )
        )
        endpoints = result.scalars().all()

    for template in templates:
        for ep in endpoints:
            ep_dict = {
                "id": ep.id,
                "method": ep.method,
                "url": f"{ep.protocol or 'http'}://{ep.host}{ep.path}",
                "path": ep.path,
                "account_id": ep.account_id,
            }
            test_result = await engine.execute_test(ep_dict, template)
            if test_result.get("is_vulnerable"):
                await aggregator.add_vulnerability(test_result, ep_dict)


@router.get("/")
async def list_suites(payload: dict = Depends(RBAC.require_auth)):
    """List all built-in test suites with template counts."""
    return {"suites": _suite_manager.list_suites()}


@router.get("/{suite_name}/templates")
async def get_suite_templates(suite_name: str, payload: dict = Depends(RBAC.require_auth)):
    """List templates in a suite."""
    templates = _suite_manager.get_suite_templates(suite_name)
    return {
        "suite": suite_name,
        "count": len(templates),
        "templates": [
            {"id": t.get("id"), "name": t.get("info", {}).get("name"),
             "severity": t.get("info", {}).get("severity"),
             "category": t.get("info", {}).get("category", {}).get("name")}
            for t in templates
        ],
    }


@router.post("/{suite_name}/run")
async def run_suite(
    suite_name: str,
    endpoint_ids: list[str],
    background_tasks: BackgroundTasks,
    payload: dict = Depends(RBAC.require_auth)
):
    """Execute all templates in a suite against given endpoints."""
    account_id = payload["account_id"]
    templates = _suite_manager.get_suite_templates(suite_name)
    if not templates:
        raise HTTPException(status_code=404, detail=f"Suite '{suite_name}' not found or has no templates")
    background_tasks.add_task(_run_suite, suite_name, endpoint_ids, account_id)
    return {
        "status": "started",
        "suite": suite_name,
        "template_count": len(templates),
        "endpoint_count": len(endpoint_ids),
    }
