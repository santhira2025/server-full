import pytest
from fastapi.testclient import TestClient
from backend.troubleshooter.api.routes import router

client = TestClient(router)

class TestTroubleshooterRoutes:
    def test_troubleshoot_endpoint_exists(self):
        response = client.post("/api/v1/troubleshoot")
        assert response.status_code == 422  # Missing required data

    def test_troubleshoot_stream_endpoint_exists(self):
        response = client.post("/api/v1/troubleshoot/stream")
        assert response.status_code == 422  # Missing required data

    def test_stats_endpoint_exists(self):
        response = client.get("/api/v1/troubleshoot/stats")
        assert response.status_code == 200

    def test_search_endpoint_exists(self):
        response = client.get("/api/v1/troubleshoot/errors/search")
        assert response.status_code == 200

    def test_invalid_route(self):
        response = client.get("/api/v1/invalid")
        assert response.status_code == 404