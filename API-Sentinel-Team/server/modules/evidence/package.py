from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from server.config import BASE_DIR, settings
from server.models.core import EvidencePackage


def _resolve_archive_path(account_id: int, detection_type: str, detection_id: str, digest: str) -> Path:
    base_dir = settings.ARCHIVE_DIR or str(BASE_DIR / "data" / "archives")
    base = Path(base_dir)
    archive_dir = base / str(account_id) / detection_type
    archive_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{detection_id}-{digest}.json"
    return archive_dir / filename


async def save_evidence_package(
    db: Any,
    account_id: int,
    detection_type: str,
    detection_id: str,
    payload: Dict[str, Any],
    metadata: Dict[str, Any],
) -> None:
    snapshot = {
        "payload": payload,
        "metadata": metadata,
        "created_at": datetime.utcnow().isoformat(),
    }
    content = json.dumps(snapshot, default=str, separators=(",", ":"))
    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
    path = _resolve_archive_path(account_id, detection_type, detection_id, digest)
    path.write_text(content)
    db.add(EvidencePackage(
        account_id=account_id,
        detection_type=detection_type,
        detection_id=detection_id,
        path=str(path),
        metadata_blob=metadata,
        digest=digest,
    ))
