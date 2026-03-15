"""API Endpoints CRUD — full management of discovered API endpoints."""
import uuid
from fastapi import APIRouter, Depends, Query, Body, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, and_
from server.modules.persistence.database import get_db, get_read_db
from server.models.core import APIEndpoint, EndpointRevision
from server.modules.auth.rbac import RBAC
from server.api.rate_limiter import limiter
from server.modules.cache.redis_cache import get_cache_version, get_json, set_json, bump_cache_version
from server.config import settings

router = APIRouter()


@router.get("/")
@limiter.limit("60/minute")
async def get_endpoints(
    request: Request,
    host: str = Query(None),
    method: str = Query(None),
    collection_id: str = Query(None),
    limit: int = Query(200),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_read_db),
    user: dict = Depends(RBAC.require_auth),
):
    """List all discovered API endpoints with optional filters."""
    account_id = user["account_id"]
    filters = [APIEndpoint.account_id == account_id]
    if host:
        filters.append(APIEndpoint.host == host)
    if method:
        filters.append(APIEndpoint.method == method.upper())
    if collection_id:
        filters.append(APIEndpoint.collection_id == collection_id)

    cache_version = await get_cache_version(account_id)
    cache_key = f"endpoints:{account_id}:{cache_version}:{host}:{method}:{collection_id}:{limit}:{offset}"
    cached = await get_json(cache_key)
    if cached:
        return cached

    result = await db.execute(
        select(APIEndpoint)
        .where(and_(*filters))
        .order_by(APIEndpoint.last_seen.desc())
        .limit(limit)
        .offset(offset)
    )
    endpoints = result.scalars().all()

    response = {
        "total": len(endpoints),
        "endpoints": [
            {
                "id": str(e.id),
                "method": e.method,
                "path": e.path,
                "path_pattern": e.path_pattern,
                "host": e.host,
                "port": e.port,
                "protocol": e.protocol,
                "collection_id": e.collection_id,
                "last_response_code": e.last_response_code,
                "private_variable_count": e.private_variable_count,
                "risk_score": e.risk_score,
                "api_type": e.api_type,
                "last_seen": e.last_seen.isoformat() if e.last_seen else None,
                "created_at": str(e.created_at),
            }
            for e in endpoints
        ],
    }
    await set_json(cache_key, response, ttl_seconds=settings.ENDPOINTS_CACHE_TTL)
    return response


@router.get("/hosts")
async def list_hosts(db: AsyncSession = Depends(get_db), user: dict = Depends(RBAC.require_auth)):
    """Return distinct hosts for grouping into collections."""
    from sqlalchemy import distinct
    account_id = user["account_id"]
    result = await db.execute(
        select(distinct(APIEndpoint.host)).where(APIEndpoint.account_id == account_id)
    )
    hosts = [row[0] for row in result.all() if row[0]]
    return {"hosts": hosts}


@router.get("/{endpoint_id}")
async def get_endpoint(endpoint_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(RBAC.require_auth)):
    account_id = user["account_id"]
    result = await db.execute(select(APIEndpoint).where(
        and_(APIEndpoint.id == endpoint_id, APIEndpoint.account_id == account_id)
    ))
    ep = result.scalar_one_or_none()
    if not ep:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    return {
        "id": ep.id, "method": ep.method, "path": ep.path, "host": ep.host,
        "port": ep.port, "protocol": ep.protocol, "collection_id": ep.collection_id,
        "last_response_code": ep.last_response_code,
        "last_response_body": ep.last_response_body,
        "last_request_body": ep.last_request_body,
        "last_query_string": ep.last_query_string,
        "private_variable_count": ep.private_variable_count,
        "risk_score": ep.risk_score,
        "api_type": ep.api_type,
        "tags": ep.tags,
        "last_seen": str(ep.last_seen) if ep.last_seen else None,
    }


@router.get("/{endpoint_id}/revisions")
async def list_endpoint_revisions(
    endpoint_id: str,
    limit: int = Query(20, le=200),
    db: AsyncSession = Depends(get_read_db),
    user: dict = Depends(RBAC.require_auth),
):
    account_id = user["account_id"]
    result = await db.execute(
        select(EndpointRevision)
        .where(
            EndpointRevision.endpoint_id == endpoint_id,
            EndpointRevision.account_id == account_id,
        )
        .order_by(EndpointRevision.created_at.desc())
        .limit(limit)
    )
    revisions = result.scalars().all()
    return {
        "total": len(revisions),
        "revisions": [
            {
                "id": r.id,
                "version_hash": r.version_hash,
                "created_at": str(r.created_at),
            }
            for r in revisions
        ],
    }


@router.post("/")
async def create_endpoint(
    method: str = Body(...),
    path: str = Body(...),
    host: str = Body(...),
    protocol: str = Body("http"),
    port: int = Body(None),
    collection_id: str = Body(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(RBAC.require_auth),
):
    account_id = user["account_id"]
    ep = APIEndpoint(
        id=str(uuid.uuid4()),
        account_id=account_id,
        method=method.upper(),
        path=path,
        host=host,
        protocol=protocol,
        port=port,
        collection_id=collection_id,
    )
    db.add(ep)
    await db.commit()
    await bump_cache_version(account_id)
    return {"status": "created", "id": ep.id, "method": ep.method, "path": ep.path}


@router.patch("/{endpoint_id}")
async def update_endpoint(
    endpoint_id: str,
    description: str = Body(None),
    tags: dict = Body(None),
    collection_id: str = Body(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(RBAC.require_auth),
):
    account_id = user["account_id"]
    values = {}
    if description is not None:
        values["description"] = description
    if tags is not None:
        values["tags"] = tags
    if collection_id is not None:
        values["collection_id"] = collection_id
    if values:
        await db.execute(update(APIEndpoint).where(
            and_(APIEndpoint.id == endpoint_id, APIEndpoint.account_id == account_id)
        ).values(**values))
        await db.commit()
        await bump_cache_version(account_id)
    return {"status": "updated", "id": endpoint_id}


@router.delete("/{endpoint_id}")
async def delete_endpoint(endpoint_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(RBAC.require_auth)):
    account_id = user["account_id"]
    result = await db.execute(select(APIEndpoint).where(
        and_(APIEndpoint.id == endpoint_id, APIEndpoint.account_id == account_id)
    ))
    ep = result.scalar_one_or_none()
    if not ep:
        raise HTTPException(status_code=404, detail="Endpoint not found")
        
    await db.execute(delete(APIEndpoint).where(
        and_(APIEndpoint.id == endpoint_id, APIEndpoint.account_id == account_id)
    ))
    await db.commit()
    await bump_cache_version(account_id)
    return {"status": "deleted", "id": endpoint_id}
