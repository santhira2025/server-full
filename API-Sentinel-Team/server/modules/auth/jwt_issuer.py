import jwt
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional
import logging
import uuid

class JWTError(Exception): pass
class TokenExpiredError(JWTError): pass
class InvalidTokenError(JWTError): pass
class TokenRevokedError(JWTError): pass

logger = logging.getLogger(__name__)

from server.config import settings
SECRET_KEY = settings.JWT_SECRET
ALGORITHM = settings.JWT_ALGORITHM

from server.modules.cache.redis_cache import set_json, get_json

class JWTIssuer:
    """
    Handles generation and verification of JWTs for user sessions.
    Supports token revocation using Redis.
    """
    @staticmethod
    def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None, expires_in: Optional[int] = None) -> str:
        to_encode = data.copy()
        if expires_in is not None:
            expire = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        elif expires_delta:
            expire = datetime.now(timezone.utc) + expires_delta
        else:
            expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
        
        jti = str(uuid.uuid4())
        to_encode.update({
            "exp": expire,
            "jti": jti,
            "iat": datetime.now(timezone.utc)
        })
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt

    @staticmethod
    async def verify_token(token: str, db_session=None) -> Dict[str, Any]:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            jti = payload.get("jti")
            if jti:
                revoked_at = await get_json(f"revoked_token:{jti}")
                if revoked_at:
                    logger.warning(f"JWT revoked: {jti}")
                    raise TokenRevokedError("Token has been revoked")
            return payload
        except jwt.ExpiredSignatureError:
            logger.warning("JWT expired")
            raise TokenExpiredError("Token has expired")
        except TokenRevokedError:
            raise
        except jwt.PyJWTError as e:
            logger.warning(f"JWT decode error: {e}")
            raise InvalidTokenError(str(e))

    @staticmethod
    async def revoke_token(token: str, account_id: int = None, user_id: str = None) -> bool:
        """Revoke a token by adding its JTI to Redis with an expiration matching the token's lifetime."""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False})
            jti = payload.get("jti")
            exp = payload.get("exp")
            if jti and exp:
                now = datetime.now(timezone.utc).timestamp()
                ttl = int(exp - now)
                if ttl > 0:
                    await set_json(f"revoked_token:{jti}", datetime.now(timezone.utc).isoformat(), ttl_seconds=ttl)
                logger.info("token_revoked", extra={"jti": jti, "account_id": account_id, "user_id": user_id})
                return True
            return False
        except jwt.PyJWTError as e:
            logger.error(f"Failed to revoke token: {e}")
            return False

    @staticmethod
    def cleanup_expired_revoked():
        """No-op as Redis handles TTL automatically."""
        pass
