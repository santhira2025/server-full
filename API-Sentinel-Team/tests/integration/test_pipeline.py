import pytest
from httpx import AsyncClient
from server.api.main import app

@pytest.mark.asyncio
async def test_full_test_run_pipeline(client: AsyncClient):
    # 1. Signup / Auth
    signup_resp = await client.post("/api/auth/signup", json={
        "email": "admin@test.com",
        "password": "testpass123",
        "account_name": "TestCorp"
    })
    assert signup_resp.status_code == 200
    token = signup_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create endpoint
    ep_resp = await client.post("/api/endpoints/", headers=headers, json={
        "method": "GET",
        "path": "/api/users/123",
        "host": "localhost",
        "protocol": "http"
    })
    assert ep_resp.status_code == 200
    endpoint_id = ep_resp.json()["id"]

    # 3. List templates to get one
    templates_resp = await client.get("/api/tests/templates", headers=headers)
    assert templates_resp.status_code == 200
    template_ids = [t["id"] for t in templates_resp.json()["templates"][:1]]

    # 4. Trigger test run
    run_resp = await client.post("/api/tests/run", headers=headers, json={
        "endpoint_ids": [endpoint_id],
        "template_ids": template_ids
    })
    assert run_resp.status_code == 200
    run_id = run_resp.json()["run_id"]

    # 5. Fetch results (might be empty initially as it's background, but let's check structure)
    results_resp = await client.get(f"/api/tests/runs/{run_id}", headers=headers)
    assert results_resp.status_code == 200
    assert "results" in results_resp.json()
