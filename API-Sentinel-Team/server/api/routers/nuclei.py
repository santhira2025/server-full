"""Nuclei vulnerability scanner integration."""
import uuid
import os
import tempfile
import shutil
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete

from server.modules.persistence.database import get_db
from server.models.core import NucleiScan, NucleiTemplate
from server.modules.nuclei.runner import NucleiRunner

router = APIRouter(tags=["Nuclei Scanner"])


@router.get("/status")
async def nuclei_status():
    available = NucleiRunner.is_available()
    return {"nuclei_available": available, "mode": "live" if available else "simulation",
            "install_docs": "https://github.com/projectdiscovery/nuclei" if not available else None}


@router.post("/scan")
async def start_scan(
    target: str = Body(..., description="Base URL to scan, e.g. https://api.example.com"),
    template_ids: List[str] = Body(default=[]),
    custom_template_ids: List[str] = Body(default=[], description="IDs from /nuclei/templates"),
    tags: List[str] = Body(default=[]),
    severity: List[str] = Body(default=[]),
    account_id: int = 1000000,
    db: AsyncSession = Depends(get_db)
):
    scan = NucleiScan(id=str(uuid.uuid4()), account_id=account_id, target=target,
                      template_ids=template_ids, custom_template_ids=custom_template_ids,
                      tags=tags, severity_filter=severity,
                      status="RUNNING", started_at=datetime.now(timezone.utc))
    db.add(scan)
    await db.commit()

    # Write custom templates to a temp directory and pass as extra paths
    custom_template_dir = None
    extra_template_paths = []
    if custom_template_ids:
        cust_result = await db.execute(
            select(NucleiTemplate).where(
                NucleiTemplate.id.in_(custom_template_ids),
                NucleiTemplate.account_id == account_id,
                NucleiTemplate.enabled == True,
            )
        )
        custom_templates = cust_result.scalars().all()
        if custom_templates:
            custom_template_dir = tempfile.mkdtemp(prefix="nuclei_custom_")
            for ct in custom_templates:
                fname = f"{ct.template_id or ct.id}.yaml"
                fpath = os.path.join(custom_template_dir, fname)
                with open(fpath, "w", encoding="utf-8") as f:
                    f.write(ct.yaml_content)
                extra_template_paths.append(fpath)

    result = await NucleiRunner.run_scan(
        target,
        template_ids=template_ids or None,
        tags=tags or None,
        severity=severity or None,
        extra_template_paths=extra_template_paths or None,
    )

    if custom_template_dir:
        shutil.rmtree(custom_template_dir, ignore_errors=True)

    scan.status = result["status"]
    scan.findings = result["findings"]
    scan.total_found = result["total_found"]
    scan.completed_at = datetime.now(timezone.utc)
    await db.commit()

    return {"scan_id": scan.id, "status": scan.status, "total_found": scan.total_found,
            "findings": scan.findings[:10], "note": result.get("note")}


@router.get("/scans")
async def list_scans(account_id: int = 1000000, limit: int = Query(50), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(NucleiScan).where(NucleiScan.account_id == account_id)
        .order_by(NucleiScan.created_at.desc()).limit(limit)
    )
    scans = result.scalars().all()
    return {"total": len(scans), "scans": [
        {"id": s.id, "target": s.target, "status": s.status, "total_found": s.total_found,
         "tags": s.tags, "severity_filter": s.severity_filter,
         "started_at": s.started_at, "completed_at": s.completed_at}
        for s in scans
    ]}


@router.get("/scans/{scan_id}")
async def get_scan(scan_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(NucleiScan).where(NucleiScan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(404, "Scan not found")
    return {"id": scan.id, "target": scan.target, "status": scan.status,
            "total_found": scan.total_found, "findings": scan.findings,
            "started_at": scan.started_at, "completed_at": scan.completed_at}


# ── Custom template management ────────────────────────────────────────────────

@router.get("/templates")
async def list_custom_templates(account_id: int = 1000000, db: AsyncSession = Depends(get_db)):
    """List all custom Nuclei templates uploaded for this account."""
    result = await db.execute(
        select(NucleiTemplate).where(NucleiTemplate.account_id == account_id)
        .order_by(NucleiTemplate.created_at.desc())
    )
    templates = result.scalars().all()
    return {"total": len(templates), "templates": [
        {"id": t.id, "name": t.name, "template_id": t.template_id,
         "severity": t.severity, "tags": t.tags, "enabled": t.enabled,
         "description": t.description, "created_at": t.created_at}
        for t in templates
    ]}


@router.post("/templates")
async def create_custom_template(
    name: str = Body(...),
    yaml_content: str = Body(..., description="Full Nuclei YAML template content"),
    description: Optional[str] = Body(None),
    account_id: int = 1000000,
    db: AsyncSession = Depends(get_db),
):
    """Upload a custom Nuclei YAML template. Parses id/severity/tags from the content."""
    import yaml as _yaml
    template_id = None
    severity = "medium"
    tags = []
    try:
        parsed = _yaml.safe_load(yaml_content)
        if parsed:
            template_id = parsed.get("id")
            info = parsed.get("info", {})
            severity = info.get("severity", "medium")
            tags = info.get("tags", [])
            if isinstance(tags, str):
                tags = [t.strip() for t in tags.split(",")]
    except Exception:
        pass

    t = NucleiTemplate(
        id=str(uuid.uuid4()), account_id=account_id, name=name,
        template_id=template_id, description=description,
        severity=severity, tags=tags, yaml_content=yaml_content,
    )
    db.add(t)
    await db.commit()
    return {"id": t.id, "name": name, "template_id": template_id,
            "severity": severity, "status": "created"}


@router.patch("/templates/{template_id}")
async def toggle_custom_template(
    template_id: str,
    enabled: bool = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
):
    """Enable or disable a custom Nuclei template."""
    await db.execute(
        update(NucleiTemplate).where(NucleiTemplate.id == template_id).values(enabled=enabled)
    )
    await db.commit()
    return {"template_id": template_id, "enabled": enabled}


@router.delete("/templates/{template_id}")
async def delete_custom_template(template_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a custom Nuclei template."""
    await db.execute(delete(NucleiTemplate).where(NucleiTemplate.id == template_id))
    await db.commit()
    return {"deleted": template_id}


@router.get("/templates/{template_id}/content")
async def get_template_content(template_id: str, db: AsyncSession = Depends(get_db)):
    """Return the raw YAML content of a custom template."""
    result = await db.execute(select(NucleiTemplate).where(NucleiTemplate.id == template_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Template not found")
    return {"id": t.id, "name": t.name, "yaml_content": t.yaml_content}
