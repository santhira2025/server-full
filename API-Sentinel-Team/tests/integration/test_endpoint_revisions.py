import pytest
from sqlalchemy import select

from server.models.core import APIEndpoint, EndpointRevision


@pytest.mark.asyncio
async def test_endpoint_revisions_api(client, auth_headers, db_session):
    endpoint = APIEndpoint(
        account_id=1000000,
        method="GET",
        path="/users/1",
        path_pattern="/users/{id}",
        host="example.com",
        protocol="https",
    )
    db_session.add(endpoint)
    await db_session.commit()

    rev = EndpointRevision(
        account_id=1000000,
        endpoint_id=endpoint.id,
        version_hash="abc123",
        schema_json={"type": "object"},
    )
    db_session.add(rev)
    await db_session.commit()

    resp = await client.get(f"/api/endpoints/{endpoint.id}/revisions", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
