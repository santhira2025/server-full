"""Storage and archival endpoints."""
import os
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from server.modules.auth.rbac import RBAC
from server.modules.persistence.database import get_db
from server.modules.storage.archiver import archive_once
from server.config import settings

router = APIRouter(tags=["Storage"])


@router.post("/archive")
async def run_archive(
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    return await archive_once(account_id)


@router.get("/archives")
async def list_archives(
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload.get("account_id")
    base = os.path.join(settings.ARCHIVE_DIR, f"account_{account_id}")
    results = []
    if not os.path.isdir(base):
        return {"total": 0, "archives": []}
    for root, _, files in os.walk(base):
        for f in files:
            if f.endswith(".jsonl.gz"):
                path = os.path.join(root, f)
                results.append({"path": path, "size": os.path.getsize(path)})
    return {"total": len(results), "archives": results}
