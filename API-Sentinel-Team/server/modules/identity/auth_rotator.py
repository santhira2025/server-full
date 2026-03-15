"""
AuthRotator: fetches and applies auth tokens from TestAccount records.
Used by ExecutionEngine to perform BOLA/BFLA cross-role replays.
"""
import copy
from sqlalchemy import select
from server.models.core import TestAccount


AUTH_HEADERS = ["authorization", "x-api-key", "x-auth-token", "cookie", "token", "x-access-token"]


class AuthRotator:

    async def get_auth_headers(self, role: str = "ATTACKER", account_id: int = 1000000, db=None) -> dict:
        """Return auth headers dict for the given role from TestAccount table."""
        if db is None:
            return {}
        try:
            result = await db.execute(
                select(TestAccount).where(
                    TestAccount.account_id == account_id,
                    TestAccount.role == role.upper(),
                )
            )
            acct = result.scalar_one_or_none()
            if acct and acct.auth_headers:
                return acct.auth_headers
        except Exception:
            pass
        return {}

    def apply_auth(self, request: dict, auth_headers: dict) -> dict:
        """Replace existing auth headers on the request with the given ones."""
        if not auth_headers:
            return request
        mutated = copy.deepcopy(request)
        existing = mutated.setdefault("headers", {})
        # Remove old auth headers
        cleaned = {k: v for k, v in existing.items() if k.lower() not in AUTH_HEADERS}
        cleaned.update(auth_headers)
        mutated["headers"] = cleaned
        return mutated
