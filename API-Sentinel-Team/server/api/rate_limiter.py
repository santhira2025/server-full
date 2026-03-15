from slowapi import Limiter
from slowapi.util import get_remote_address
from typing import Optional
from fastapi import Request

def get_rate_limit_key(request: Request) -> str:
    """
    Enhanced rate limit key that combines IP + account_id when available.
    Falls back to IP-only for unauthenticated requests.
    """
    client_ip = get_remote_address(request)
    account_id = None
    
    try:
        if hasattr(request.state, "account_id"):
            account_id = request.state.account_id
        elif hasattr(request.app.state, "account_id"):
            account_id = request.app.state.account_id
        
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            from server.modules.auth.jwt_issuer import JWTIssuer
            try:
                token = auth_header[7:]
                payload = JWTIssuer.verify_token(token)
                account_id = payload.get("account_id")
            except Exception:
                pass
    except Exception:
        pass
    
    if account_id:
        return f"{client_ip}:{account_id}"
    return client_ip

limiter = Limiter(key_func=get_rate_limit_key)
