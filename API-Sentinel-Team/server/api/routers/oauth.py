"""OAuth2 SSO endpoints — GitHub OAuth flow + provider management."""
import secrets
import uuid
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from server.modules.persistence.database import get_db
from server.models.core import User, OAuthProvider
from server.modules.auth.jwt_issuer import JWTIssuer
from server.modules.auth.oauth_github import GitHubOAuth

router = APIRouter(tags=["OAuth SSO"])
logger = logging.getLogger(__name__)

# ── OAuth CSRF state store ────────────────────────────────────────────────────
# Uses Redis (REDIS_URL) for multi-instance production deployments.
# Automatically falls back to in-memory dict for single-instance / dev.
_STATE_TTL = 600  # 10 minutes
_oauth_states_fallback: dict = {}
_redis_client = None


def _get_redis():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        from server.config import settings
        if settings.REDIS_URL:
            import redis.asyncio as aioredis
            _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            return _redis_client
    except Exception as e:
        logger.warning("Redis unavailable for OAuth state store, using in-memory fallback: %s", e)
    return None


async def _state_set(state: str, account_id: int) -> None:
    r = _get_redis()
    if r:
        try:
            await r.setex(f"oauth_state:{state}", _STATE_TTL, str(account_id))
            return
        except Exception:
            pass
    _oauth_states_fallback[state] = account_id


async def _state_pop(state: str) -> int:
    r = _get_redis()
    if r:
        try:
            val = await r.getdel(f"oauth_state:{state}")
            if val is not None:
                return int(val)
        except Exception:
            pass
    return _oauth_states_fallback.pop(state, 1000000)


def _make_github_oauth(provider: OAuthProvider) -> GitHubOAuth:
    try:
        from server.config import settings
        base = settings.OAUTH_REDIRECT_BASE_URL
    except Exception:
        base = "http://localhost:8000"
    return GitHubOAuth(
        client_id=provider.client_id or "",
        client_secret=provider.client_secret_enc or "",
        redirect_uri=f"{base}/api/oauth/github/callback",
    )


@router.get("/providers")
async def list_providers(account_id: int = 1000000, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(OAuthProvider).where(OAuthProvider.account_id == account_id))
    providers = result.scalars().all()
    return {"providers": [
        {"id": p.id, "provider": p.provider, "enabled": p.enabled,
         "allowed_domains": p.allowed_domains, "created_at": p.created_at}
        for p in providers
    ]}


@router.post("/providers")
async def create_provider(
    provider: str = Body(..., description="github | google | okta | saml"),
    client_id: str = Body(...),
    client_secret: str = Body(...),
    allowed_domains: list = Body(default=[]),
    scopes: list = Body(default=[]),
    account_id: int = 1000000,
    db: AsyncSession = Depends(get_db)
):
    """Register OAuth provider. client_secret stored as-is (encrypt in production)."""
    op = OAuthProvider(id=str(uuid.uuid4()), account_id=account_id, provider=provider,
                       client_id=client_id, client_secret_enc=client_secret,
                       allowed_domains=allowed_domains, scopes=scopes)
    db.add(op)
    await db.commit()
    return {"id": op.id, "provider": provider, "status": "created"}


@router.delete("/providers/{provider_id}")
async def delete_provider(provider_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(OAuthProvider).where(OAuthProvider.id == provider_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Provider not found")
    await db.delete(p)
    await db.commit()
    return {"deleted": provider_id}


@router.get("/github/authorize")
async def github_authorize(account_id: int = 1000000, db: AsyncSession = Depends(get_db)):
    """Step 1: Returns GitHub authorization URL."""
    result = await db.execute(
        select(OAuthProvider).where(OAuthProvider.account_id == account_id,
                                    OAuthProvider.provider == "github",
                                    OAuthProvider.enabled == True)
    )
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(404, "GitHub OAuth provider not configured for this account")
    state = secrets.token_urlsafe(16)
    await _state_set(state, account_id)
    oauth = _make_github_oauth(provider)
    return {"authorization_url": oauth.get_authorization_url(state=state), "state": state}


@router.get("/github/callback")
async def github_callback(code: str = Query(...), state: str = Query(""),
                          db: AsyncSession = Depends(get_db)):
    """Step 2: Exchange code for token, upsert user, return JWT."""
    account_id = await _state_pop(state)
    result = await db.execute(
        select(OAuthProvider).where(OAuthProvider.account_id == account_id, OAuthProvider.provider == "github")
    )
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(400, "GitHub OAuth not configured")

    oauth = _make_github_oauth(provider)
    access_token = await oauth.exchange_code_for_token(code)
    if not access_token:
        raise HTTPException(400, "Failed to exchange OAuth code for token")

    user_info = await oauth.get_user_info(access_token)
    if not user_info or not user_info.get("email"):
        raise HTTPException(400, "Could not retrieve user email from GitHub")

    email = user_info["email"]
    if provider.allowed_domains:
        domain = email.split("@")[-1]
        if domain not in provider.allowed_domains:
            raise HTTPException(403, f"Email domain '{domain}' is not allowed")

    user_result = await db.execute(select(User).where(User.email == email))
    user = user_result.scalar_one_or_none()
    if not user:
        user = User(id=str(uuid.uuid4()), account_id=account_id,
                    email=email, password_hash="oauth_github", role="MEMBER")
        db.add(user)
        await db.commit()
        await db.refresh(user)

    token = JWTIssuer.create_access_token({"sub": user.id, "email": email,
                                           "role": user.role, "account_id": account_id})
    return {"access_token": token, "token_type": "bearer", "email": email,
            "provider": "github", "name": user_info.get("name")}
