import uuid
import datetime
from fastapi import APIRouter, Depends, BackgroundTasks, Query, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, and_
from server.modules.persistence.database import get_db, AsyncSessionLocal
from server.modules.auth.rbac import RBAC
from server.modules.test_executor.wordlist_manager import WordlistManager
from server.modules.test_executor.execution_engine import ExecutionEngine
from server.modules.test_executor.result_aggregator import ResultAggregator
from server.modules.test_executor.reporting import build_sarif, build_junit
from server.models.core import APIEndpoint, TestRun, TestResult, Vulnerability
from server.api.websocket.manager import ws_manager
from server.api.websocket.event_types import WSEventType
from server.api.rate_limiter import limiter

router = APIRouter()


async def _run_security_tasks(run_id: str, template_ids: list[str], endpoint_ids: list[str], account_id: int):
    """Background task: execute templates against endpoints, persist results."""
    wm = WordlistManager.get_instance()
    engine = ExecutionEngine(test_id=run_id)
    aggregator = ResultAggregator()
    total = 0
    vuln_count = 0
    err_count = 0

    async with AsyncSessionLocal() as db:
        # Mark run as RUNNING
        await db.execute(
            update(TestRun).where(TestRun.id == run_id).values(
                status="RUNNING", started_at=datetime.datetime.utcnow()
            )
        )
        await db.commit()

        await ws_manager.broadcast({
            "type": WSEventType.SCAN_STARTED,
            "data": {"run_id": run_id, "total": len(template_ids) * len(endpoint_ids)}
        })

        result = await db.execute(
            select(APIEndpoint).where(
                and_(APIEndpoint.id.in_(endpoint_ids), APIEndpoint.account_id == account_id)
            )
        )
        endpoints = result.scalars().all()

        for t_id in template_ids:
            template = next((t for t in wm.templates if t["id"] == t_id), None)
            if not template:
                continue
            for ep in endpoints:
                ep_dict = {
                    "id": ep.id,
                    "method": ep.method,
                    "url": f"{ep.protocol or 'http'}://{ep.host}{ep.path}",
                    "path": ep.path,
                    "host": ep.host or "",
                    "protocol": ep.protocol or "http",
                    "last_response_body": ep.last_response_body,
                    "last_request_body": ep.last_request_body,
                    "last_query_string": ep.last_query_string,
                    "last_response_code": ep.last_response_code,
                    "last_response_headers": ep.last_response_headers or {},
                    "auth_types_found": ep.auth_types_found or [],
                    "private_variable_count": ep.private_variable_count or 0,
                    "account_id": account_id,
                }
                try:
                    test_result = await engine.execute_test(ep_dict, template)
                    is_vuln = test_result.get("is_vulnerable", False)
                    total += 1
                    if is_vuln:
                        vuln_count += 1
                        await aggregator.add_vulnerability(test_result, ep_dict)

                    # Persist individual result
                    tr = TestResult(
                        run_id=run_id,
                        endpoint_id=ep.id,
                        template_id=t_id,
                        is_vulnerable=is_vuln,
                        severity=test_result.get("severity"),
                        sent_request=test_result.get("sent_request"),
                        received_response=test_result.get("received_response"),
                        evidence=str(test_result.get("evidence", "")),
                    )
                    db.add(tr)
                except Exception as exc:
                    err_count += 1
                    tr = TestResult(
                        run_id=run_id, endpoint_id=ep.id, template_id=t_id,
                        is_vulnerable=False, error=str(exc)
                    )
                    db.add(tr)
 
                # Broadcast progress for each test combination
                await ws_manager.broadcast({
                    "type": WSEventType.SCAN_PROGRESS,
                    "data": {
                        "run_id": run_id,
                        "current": total,
                        "vulnerable": vuln_count,
                        "errors": err_count
                    }
                })

        await db.execute(
            update(TestRun).where(TestRun.id == run_id).values(
                status="COMPLETED",
                completed_at=datetime.datetime.utcnow(),
                total_tests=total,
                vulnerable_count=vuln_count,
                error_count=err_count,
            )
        )
        await db.commit()

        await ws_manager.broadcast({
            "type": WSEventType.SCAN_COMPLETED,
            "data": {
                "run_id": run_id,
                "total": total,
                "vulnerable": vuln_count,
                "errors": err_count
            }
        })


@router.get("/templates")
@limiter.limit("30/minute")
async def list_templates(
    request: Request,
    category: str = Query(None),
    severity: str = Query(None),
    search: str = Query(None),
    payload: dict = Depends(RBAC.require_auth)
):
    wm = WordlistManager.get_instance()
    templates = wm.templates

    if category:
        templates = [t for t in templates if t.get("info", {}).get("category", {}).get("name", "").upper() == category.upper()]
    if severity:
        templates = [t for t in templates if t.get("info", {}).get("severity", "").upper() == severity.upper()]
    if search:
        term = search.lower()
        templates = [t for t in templates if term in (t.get("info", {}).get("name") or "").lower()]

    return {
        "count": len(templates),
        "templates": [
            {
                "id": t["id"],
                "name": t.get("info", {}).get("name"),
                "severity": t.get("info", {}).get("severity"),
                "category": t.get("info", {}).get("category", {}).get("name"),
                "description": t.get("info", {}).get("description"),
            }
            for t in templates
        ],
    }


@router.get("/templates/{template_id}")
async def get_template(template_id: str, payload: dict = Depends(RBAC.require_auth)):
    wm = WordlistManager.get_instance()
    template = next((t for t in wm.templates if t["id"] == template_id), None)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.post("/run")
@limiter.limit("10/minute")
async def run_scan(
    request: Request,
    template_ids: list[str],
    endpoint_ids: list[str],
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload["account_id"]
    # Verify all endpoint_ids belong to this account
    result = await db.execute(
        select(APIEndpoint.id).where(
            and_(APIEndpoint.id.in_(endpoint_ids), APIEndpoint.account_id == account_id)
        )
    )
    valid_ids = [str(r) for r in result.scalars().all()]
    if len(valid_ids) < len(endpoint_ids):
        raise HTTPException(status_code=403, detail="Some endpoints do not belong to your account")

    run_id = str(uuid.uuid4())
    run = TestRun(
        id=run_id,
        account_id=account_id,
        status="PENDING",
        template_ids=template_ids,
        endpoint_ids=endpoint_ids,
    )
    db.add(run)
    await db.commit()
    background_tasks.add_task(_run_security_tasks, run_id, template_ids, endpoint_ids, account_id)
    return {"status": "scan_started", "run_id": run_id, "templates": len(template_ids), "endpoints": len(endpoint_ids)}


@router.get("/runs")
async def list_runs(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth)
):
    account_id = payload["account_id"]
    result = await db.execute(
        select(TestRun).where(TestRun.account_id == account_id)
        .order_by(TestRun.created_at.desc()).limit(limit)
    )
    runs = result.scalars().all()
    return {
        "total": len(runs),
        "runs": [
            {"id": r.id, "status": r.status, "total_tests": r.total_tests,
             "vulnerable_count": r.vulnerable_count, "error_count": r.error_count,
             "started_at": str(r.started_at), "completed_at": str(r.completed_at),
             "created_at": str(r.created_at)}
            for r in runs
        ],
    }


@router.get("/runs/{run_id}")
async def get_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth)
):
    account_id = payload["account_id"]
    result = await db.execute(
        select(TestRun).where(and_(TestRun.id == run_id, TestRun.account_id == account_id))
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    results_q = await db.execute(select(TestResult).where(TestResult.run_id == run_id))
    results = results_q.scalars().all()

    return {
        "id": run.id, "status": run.status,
        "total_tests": run.total_tests, "vulnerable_count": run.vulnerable_count,
        "error_count": run.error_count,
        "started_at": str(run.started_at), "completed_at": str(run.completed_at),
        "results": [
            {"endpoint_id": r.endpoint_id, "template_id": r.template_id,
             "is_vulnerable": r.is_vulnerable, "severity": r.severity,
             "evidence": r.evidence, "error": r.error}
            for r in results
        ],
    }


@router.get("/runs/{run_id}/findings")
@limiter.limit("30/minute")
async def get_run_findings(
    request: Request,
    run_id: str,
    format: str = Query("sarif"),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload["account_id"]
    result = await db.execute(
        select(TestRun).where(and_(TestRun.id == run_id, TestRun.account_id == account_id))
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    results_q = await db.execute(select(TestResult).where(TestResult.run_id == run_id))
    results = results_q.scalars().all()

    fmt = format.lower()
    if fmt == "sarif":
        sarif = build_sarif(run, results)
        return JSONResponse(content=sarif, media_type="application/sarif+json")
    if fmt == "junit":
        xml = build_junit(run, results)
        return PlainTextResponse(content=xml, media_type="application/xml")
    return {"error": "unsupported format", "supported": ["sarif", "junit"]}
