"""API Collections — group endpoints by host/service."""
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.future import select
from sqlalchemy import update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from server.modules.persistence.database import get_db
from server.modules.auth.rbac import RBAC
from server.models.core import APICollection, APIEndpoint, SampleData
from server.modules.parsers.postman import PostmanParser

router = APIRouter()


@router.get("/")
async def list_collections(
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db)
):
    account_id = payload.get("account_id")
    result = await db.execute(select(APICollection).where(APICollection.account_id == account_id))
    collections = result.scalars().all()
    count_result = await db.execute(
        select(APIEndpoint.collection_id, func.count(APIEndpoint.id))
        .where(APIEndpoint.collection_id.isnot(None))
        .group_by(APIEndpoint.collection_id)
    )
    counts = {row[0]: row[1] for row in count_result.all()}
    return {
        "total": len(collections),
        "collections": [
            {"id": c.id, "name": c.name, "host": c.host, "type": c.type,
             "endpoint_count": counts.get(c.id, 0), "created_at": str(c.created_at)}
            for c in collections
        ],
    }


@router.post("/")
async def create_collection(
    name: str = Body(...),
    host: str = Body(None),
    type: str = Body("MIRRORING"),
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db),
):
    account_id = payload.get("account_id")
    coll = APICollection(account_id=account_id, name=name, host=host, type=type.upper())
    db.add(coll)
    await db.commit()
    assigned = 0
    if host:
        r = await db.execute(
            update(APIEndpoint)
            .where(APIEndpoint.host == host, APIEndpoint.collection_id.is_(None))
            .values(collection_id=coll.id)
        )
        assigned = r.rowcount or 0
        await db.commit()
    return {"status": "created", "id": coll.id, "name": coll.name, "auto_assigned_endpoints": assigned}


@router.get("/{coll_id}/endpoints")
async def get_collection_endpoints(coll_id: str, limit: int = Query(200), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(APIEndpoint).where(APIEndpoint.collection_id == coll_id).limit(limit)
    )
    endpoints = result.scalars().all()
    return {
        "collection_id": coll_id,
        "total": len(endpoints),
        "endpoints": [
            {"id": e.id, "method": e.method, "path": e.path, "host": e.host,
             "last_response_code": e.last_response_code}
            for e in endpoints
        ],
    }


@router.post("/{coll_id}/add-endpoint/{ep_id}")
async def add_to_collection(coll_id: str, ep_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(APIEndpoint).where(APIEndpoint.id == ep_id))
    ep = result.scalar_one_or_none()
    if not ep:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    ep.collection_id = coll_id
    await db.commit()
    return {"status": "added", "endpoint_id": ep_id, "collection_id": coll_id}


@router.delete("/{coll_id}")
async def delete_collection(coll_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(update(APIEndpoint).where(APIEndpoint.collection_id == coll_id).values(collection_id=None))
    await db.execute(delete(APICollection).where(APICollection.id == coll_id))
    await db.commit()
    return {"status": "deleted", "id": coll_id}
@router.post("/postman-import")
async def import_postman_collection(
    collection_json: str = Body(..., media_type="application/json"),
    payload: dict = Depends(RBAC.require_auth),
    db: AsyncSession = Depends(get_db)
):
    account_id = payload.get("account_id")
    try:
        parser = PostmanParser(collection_json)
        requests = parser.fetch_apis_recursively()
        
        # Create a default collection for this import if one doesn't exist
        collection_name = parser.data.get("info", {}).get("name", "Postman Import")
        coll = APICollection(account_id=account_id, name=collection_name, type="POSTMAN")
        db.add(coll)
        await db.commit()
        await db.refresh(coll)
        
        imported_count = 0
        for item in requests:
            endpoint_meta, sample_data = parser.convert_to_akto_format(item)
            
            # Save Endpoint
            ep = APIEndpoint(
                account_id=account_id,
                collection_id=coll.id,
                method=endpoint_meta["method"],
                path=endpoint_meta["path"],
                api_type=endpoint_meta["api_type"]
            )
            db.add(ep)
            await db.commit()
            await db.refresh(ep)
            
            # Save Sample Data
            sample = SampleData(
                endpoint_id=ep.id,
                request=sample_data["request"],
                response=sample_data["response"]
            )
            db.add(sample)
            imported_count += 1
            
        await db.commit()
        return {"status": "success", "collection_id": coll.id, "imported_endpoints": imported_count}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to parse Postman collection: {str(e)}")
