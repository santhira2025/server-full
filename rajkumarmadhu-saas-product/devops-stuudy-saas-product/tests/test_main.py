import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

class TestMainAPI:
    def test_health_check(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {
            "status": "healthy",
            "service": "troubleshooter-ai"
        }

    def test_root_endpoint(self):
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Santhira Troubleshooter AI"
        assert data["version"] == "1.0.0"
        assert "endpoints" in data
        assert "troubleshoot" in data["endpoints"]

    def test_invalid_endpoint(self):
        response = client.get("/invalid")
        assert response.status_code == 404