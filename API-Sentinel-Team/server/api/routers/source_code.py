"""Source code analysis — repos CRUD + scan trigger + findings."""
import uuid
import asyncio
import tempfile
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse, urlunparse
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, and_

from server.modules.persistence.database import get_db
from server.models.core import SourceCodeRepo, SourceCodeFinding
from server.modules.source_code_analyzer.scanner import scan_directory
from server.modules.auth.rbac import RBAC
from server.modules.auth.encryption import Encryption

router = APIRouter(tags=["Source Code Analysis"])


async def _clone_repo(repo_url: str, branch: str, access_token: Optional[str], dest: str) -> bool:
    """Clone a git repo into dest, embedding the access_token into the HTTPS URL."""
    clone_url = repo_url
    if access_token:
        # Decrypt token before use if it looks encrypted or just always decrypt if we expect it encrypted
        try:
            token = Encryption.decrypt(access_token)
        except Exception:
            token = access_token
        parsed = urlparse(repo_url)
        clone_url = urlunparse(parsed._replace(netloc=f"{token}@{parsed.netloc}"))
    cmd = ["git", "clone", "--depth", "1", "--branch", branch, clone_url, dest]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        await asyncio.wait_for(proc.communicate(), timeout=120)
        return proc.returncode == 0
    except Exception:
        return False


@router.get("/repos")
async def list_repos(
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db)
):
    account_id = payload["account_id"]
    result = await db.execute(select(SourceCodeRepo).where(SourceCodeRepo.account_id == account_id))
    repos = result.scalars().all()
    return {"total": len(repos), "repos": [
        {"id": r.id, "name": r.name, "repo_type": r.repo_type, "repo_url": r.repo_url,
         "local_path": r.local_path, "branch": r.branch, "languages": r.languages,
         "last_scanned_at": r.last_scanned_at, "finding_count": r.finding_count, "created_at": r.created_at}
        for r in repos
    ]}


@router.post("/repos")
async def create_repo(
    name: str = Body(...),
    repo_type: str = Body("LOCAL"),
    repo_url: Optional[str] = Body(None),
    local_path: Optional[str] = Body(None),
    branch: str = Body("main"),
    languages: list = Body(default=[]),
    access_token: Optional[str] = Body(None, description="GitHub/GitLab Personal Access Token for private repos"),
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db)
):
    account_id = payload["account_id"]
    encrypted_token = Encryption.encrypt(access_token) if access_token else None
    
    repo = SourceCodeRepo(id=str(uuid.uuid4()), account_id=account_id, name=name,
                          repo_type=repo_type, repo_url=repo_url, local_path=local_path,
                          branch=branch, languages=languages, access_token=encrypted_token)
    db.add(repo)
    await db.commit()
    await db.refresh(repo)
    return {"id": repo.id, "name": repo.name, "status": "created"}


@router.post("/repos/{repo_id}/scan")
async def trigger_scan(
    repo_id: str,
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db)
):
    account_id = payload["account_id"]
    result = await db.execute(select(SourceCodeRepo).where(
        and_(SourceCodeRepo.id == repo_id, SourceCodeRepo.account_id == account_id)
    ))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(404, "Repo not found")

    # For remote repos (GITHUB/GITLAB), clone into a temp directory first
    tmp_dir = None
    scan_path = repo.local_path
    if repo.repo_type in ("GITHUB", "GITLAB") and repo.repo_url:
        tmp_dir = tempfile.mkdtemp(prefix="soc_scan_")
        cloned = await _clone_repo(repo.repo_url, repo.branch or "main", repo.access_token, tmp_dir)
        if not cloned:
            if tmp_dir:
                import shutil
                shutil.rmtree(tmp_dir, ignore_errors=True)
            raise HTTPException(500, f"Failed to clone repo: {repo.repo_url}. Check repo_url and access_token.")
        scan_path = tmp_dir

    if not scan_path:
        raise HTTPException(400, "No local_path or repo_url configured for scanning")

    findings = scan_directory(scan_path, account_id=account_id, repo_id=repo_id)

    for f in findings:
        db.add(SourceCodeFinding(id=str(uuid.uuid4()), **f))

    await db.execute(
        update(SourceCodeRepo).where(SourceCodeRepo.id == repo_id)
        .values(last_scanned_at=datetime.now(timezone.utc), finding_count=len(findings))
    )
    await db.commit()

    # Clean up temp clone
    if tmp_dir:
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)

    return {"repo_id": repo_id, "findings_found": len(findings), "status": "scan_complete"}


@router.get("/findings")
async def list_findings(
    repo_id: Optional[str] = Query(None),
    finding_type: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(100),
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db)
):
    account_id = payload["account_id"]
    q = select(SourceCodeFinding).where(SourceCodeFinding.account_id == account_id)
    if repo_id:      q = q.where(SourceCodeFinding.repo_id == repo_id)
    if finding_type: q = q.where(SourceCodeFinding.finding_type == finding_type)
    if severity:     q = q.where(SourceCodeFinding.severity == severity)
    if status:       q = q.where(SourceCodeFinding.status == status)
    result = await db.execute(q.limit(limit))
    findings = result.scalars().all()
    return {"total": len(findings), "findings": [
        {"id": f.id, "file_path": f.file_path, "line_number": f.line_number,
         "finding_type": f.finding_type, "severity": f.severity, "title": f.title,
         "description": f.description, "code_snippet": f.code_snippet,
         "remediation": f.remediation, "status": f.status, "created_at": f.created_at}
        for f in findings
    ]}


@router.patch("/findings/{finding_id}")
async def update_finding(
    finding_id: str,
    status: str = Body(..., embed=True),
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db)
):
    account_id = payload["account_id"]
    allowed = {"OPEN", "FALSE_POSITIVE", "FIXED", "WONT_FIX"}
    if status not in allowed:
        raise HTTPException(400, f"status must be one of {allowed}")
    
    # Check ownership
    result = await db.execute(select(SourceCodeFinding).where(
        and_(SourceCodeFinding.id == finding_id, SourceCodeFinding.account_id == account_id)
    ))
    finding = result.scalar_one_or_none()
    if not finding:
        raise HTTPException(404, "Finding not found")

    await db.execute(update(SourceCodeFinding).where(SourceCodeFinding.id == finding_id).values(status=status))
    await db.commit()
    return {"finding_id": finding_id, "status": status}


@router.get("/summary")
async def findings_summary(
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db)
):
    account_id = payload["account_id"]
    result = await db.execute(
        select(SourceCodeFinding.finding_type, SourceCodeFinding.severity, func.count())
        .where(SourceCodeFinding.account_id == account_id)
        .group_by(SourceCodeFinding.finding_type, SourceCodeFinding.severity)
    )
    return {"summary": [{"finding_type": r[0], "severity": r[1], "count": r[2]} for r in result.all()]}
