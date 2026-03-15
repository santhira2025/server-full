"""
Tests for the WhatsApp webhook endpoint.
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]


def test_webhook_verification_success():
    """Test Meta's webhook verification handshake."""
    response = client.get("/api/webhook", params={
        "hub.mode": "subscribe",
        "hub.verify_token": "finspot-verify-2024",
        "hub.challenge": "test_challenge_string",
    })
    assert response.status_code == 200
    assert response.text == "test_challenge_string"


def test_webhook_verification_failure():
    """Test webhook rejects wrong verify token."""
    response = client.get("/api/webhook", params={
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong_token",
        "hub.challenge": "test_challenge_string",
    })
    assert response.status_code == 403


def test_webhook_post_non_message():
    """Test webhook handles non-message payloads gracefully."""
    response = client.post("/api/webhook", json={
        "object": "whatsapp_business_account",
        "entry": [{"changes": [{"value": {"statuses": []}}]}],
    })
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_whatsapp_message_extraction():
    """Test that we correctly extract message data from Meta's payload."""
    from app.services.whatsapp_service import WhatsAppService

    payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "changes": [{
                "value": {
                    "messages": [{
                        "id": "msg_123",
                        "from": "919876543210",
                        "timestamp": "1700000000",
                        "type": "text",
                        "text": {"body": "Hi, I need pricing info"},
                    }],
                    "contacts": [{
                        "profile": {"name": "Test User"},
                    }],
                },
            }],
        }],
    }

    result = WhatsAppService.extract_message_data(payload)
    assert result is not None
    assert result["from_number"] == "919876543210"
    assert result["text"] == "Hi, I need pricing info"
    assert result["contact_name"] == "Test User"


def test_ai_response_parsing():
    """Test that the AI response parser handles various formats."""
    from app.services.ai_engine import _parse_ai_response
    import json

    valid_response = json.dumps({
        "reply_text": "Hello! How can I help you today?",
        "intent_detected": "greeting",
        "sentiment": "positive",
        "lead_score_delta": 5,
        "suggested_stage": "engaged",
        "confidence": 0.9,
        "should_escalate": False,
        "extracted_name": "John",
    })

    result = _parse_ai_response(valid_response)
    assert result.reply_text == "Hello! How can I help you today?"
    assert result.intent_detected == "greeting"
    assert result.lead_score_delta == 5
    assert result.extracted_name == "John"


def test_ai_response_parsing_fallback():
    """Test parser handles invalid JSON gracefully."""
    from app.services.ai_engine import _parse_ai_response

    result = _parse_ai_response("Just a plain text response")
    assert result.reply_text == "Just a plain text response"
    assert result.confidence == 0.3
