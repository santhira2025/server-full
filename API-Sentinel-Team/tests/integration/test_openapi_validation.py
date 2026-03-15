import pytest


@pytest.mark.asyncio
async def test_openapi_rebuild_and_validate(client, auth_headers):
    rebuild = await client.post("/api/openapi/rebuild", headers=auth_headers)
    assert rebuild.status_code == 200
    spec_id = rebuild.json().get("id")
    assert spec_id

    latest = await client.get("/api/openapi/latest", headers=auth_headers)
    assert latest.status_code == 200
    assert "spec" in latest.json()

    validate = await client.post("/api/openapi/validate", headers=auth_headers)
    assert validate.status_code == 200
    assert "violations_found" in validate.json()
