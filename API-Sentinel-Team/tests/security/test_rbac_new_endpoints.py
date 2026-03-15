import pytest

from server.modules.ingestion.schema import EventBatch, APITrafficEvent, APIRequest, APIResponse


@pytest.mark.asyncio
async def test_ingestion_requires_auth(client):
    event = APITrafficEvent(
        account_id=1000000,
        observed_at=1710000000000,
        request=APIRequest(method="GET", path="/health"),
        response=APIResponse(status_code=200),
    )
    payload = EventBatch(events=[event]).model_dump()
    resp = await client.post("/api/ingestion/v2/events", json=payload)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_openapi_requires_auth(client):
    resp = await client.post("/api/openapi/rebuild")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_evidence_requires_auth(client):
    resp = await client.get("/api/evidence")
    assert resp.status_code == 401
