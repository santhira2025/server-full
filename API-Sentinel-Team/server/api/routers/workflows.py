"""API workflow sequences — multi-step chained API testing."""
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from server.modules.persistence.database import get_db
from server.models.core import APIWorkflow, APIWorkflowRun
from server.modules.workflows.executor import WorkflowExecutor

router = APIRouter(tags=["API Workflows"])
_executor = WorkflowExecutor()


@router.get("/")
async def list_workflows(account_id: int = 1000000, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(APIWorkflow).where(APIWorkflow.account_id == account_id))
    wf = result.scalars().all()
    return {"total": len(wf), "workflows": [
        {"id": w.id, "name": w.name, "description": w.description,
         "step_count": len(w.steps or []), "enabled": w.enabled, "created_at": w.created_at}
        for w in wf
    ]}


@router.post("/")
async def create_workflow(
    name: str = Body(...), description: Optional[str] = Body(None),
    steps: List[dict] = Body(...),
    account_id: int = 1000000, db: AsyncSession = Depends(get_db)
):
    """
    Create workflow. Each step: {name, method, url, headers, body, extract, assert, stop_on_failure}
    extract: {"token": "data.access_token"}  — dotted path into response JSON
    assert:  {"status_code": 200, "body_contains": "success"}
    """
    wf = APIWorkflow(id=str(uuid.uuid4()), account_id=account_id, name=name,
                     description=description, steps=steps)
    db.add(wf)
    await db.commit()
    await db.refresh(wf)
    return {"id": wf.id, "name": wf.name, "step_count": len(steps)}


@router.get("/{workflow_id}")
async def get_workflow(workflow_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(APIWorkflow).where(APIWorkflow.id == workflow_id))
    wf = result.scalar_one_or_none()
    if not wf:
        raise HTTPException(404, "Workflow not found")
    return {"id": wf.id, "name": wf.name, "description": wf.description,
            "steps": wf.steps, "enabled": wf.enabled, "created_at": wf.created_at}


@router.post("/{workflow_id}/execute")
async def execute_workflow(
    workflow_id: str,
    auth_headers: Optional[dict] = Body(None),
    account_id: int = 1000000,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(APIWorkflow).where(APIWorkflow.id == workflow_id))
    wf = result.scalar_one_or_none()
    if not wf:
        raise HTTPException(404, "Workflow not found")
    if not wf.enabled:
        raise HTTPException(400, "Workflow is disabled")

    run = APIWorkflowRun(id=str(uuid.uuid4()), workflow_id=workflow_id, account_id=account_id,
                         status="RUNNING", started_at=datetime.now(timezone.utc))
    db.add(run)
    await db.commit()

    try:
        res = await _executor.run(wf.steps or [], auth_headers=auth_headers or {})
        run.status = res["status"]
        run.step_results = res["step_results"]
        run.variables = res.get("variables", {})
        run.error = res.get("error")
    except Exception as e:
        run.status = "FAILED"
        run.error = str(e)
    finally:
        run.completed_at = datetime.now(timezone.utc)
        await db.commit()

    return {"run_id": run.id, "status": run.status, "step_results": run.step_results, "error": run.error}


@router.get("/{workflow_id}/runs")
async def list_runs(workflow_id: str, limit: int = Query(20), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(APIWorkflowRun).where(APIWorkflowRun.workflow_id == workflow_id)
        .order_by(APIWorkflowRun.created_at.desc()).limit(limit)
    )
    runs = result.scalars().all()
    return {"total": len(runs), "runs": [
        {"id": r.id, "status": r.status, "started_at": r.started_at,
         "completed_at": r.completed_at, "error": r.error}
        for r in runs
    ]}


@router.delete("/{workflow_id}")
async def delete_workflow(workflow_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(APIWorkflow).where(APIWorkflow.id == workflow_id))
    wf = result.scalar_one_or_none()
    if not wf:
        raise HTTPException(404, "Workflow not found")
    await db.delete(wf)
    await db.commit()
    return {"deleted": workflow_id}
