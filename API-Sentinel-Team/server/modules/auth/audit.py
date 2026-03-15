from sqlalchemy.ext.asyncio import AsyncSession
from server.models.core import AuditLog
from server.modules.auth.encryption import Encryption
from typing import Optional, Dict, Any
import json

SENSITIVE_KEYS = {"password", "token", "secret", "api_key", "authorization", "bearer", "credential"}

def _contains_sensitive_data(data: Any) -> bool:
    """Check if data contains potentially sensitive information."""
    if isinstance(data, dict):
        data_str = json.dumps(data).lower()
    elif isinstance(data, str):
        data_str = data.lower()
    else:
        return False
    return any(sensitive in data_str for sensitive in SENSITIVE_KEYS)

async def log_action(
    db: AsyncSession,
    account_id: int,
    action: str,
    user_id: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None
):
    """Immutable trail of user/system actions for security & compliance.
    Sensitive fields are encrypted."""
    details_encrypted = None
    ip_encrypted = None
    
    if details and _contains_sensitive_data(details):
        details_encrypted = Encryption.encrypt(json.dumps(details))
        details = None
    
    if ip_address:
        ip_encrypted = Encryption.encrypt(ip_address)
    
    log = AuditLog(
        account_id=account_id,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
        details_encrypted=details_encrypted,
        ip_address=ip_address if not ip_encrypted else None,
        ip_address_encrypted=ip_encrypted
    )
    db.add(log)
    await db.flush()
