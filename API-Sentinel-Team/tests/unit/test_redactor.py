from server.modules.utils.redactor import Redactor


def test_redact_headers_masks_sensitive():
    headers = {
        "Authorization": "Bearer secret-token",
        "Content-Type": "application/json",
        "Cookie": "session=abc123; foo=bar",
    }
    redacted = Redactor.redact_headers(headers)
    assert redacted["Authorization"].startswith("Bearer ")
    assert Redactor.REDACT_VALUE in redacted["Authorization"]
    assert Redactor.REDACT_VALUE in redacted["Cookie"]
    assert redacted["Content-Type"] == "application/json"


def test_redact_json_masks_sensitive_fields():
    payload = {"password": "p@ss", "nested": {"api_key": "secret"}, "ok": "value"}
    redacted = Redactor.redact_json(payload)
    assert redacted["password"] == Redactor.REDACT_VALUE
    assert redacted["nested"]["api_key"] == Redactor.REDACT_VALUE
    assert redacted["ok"] == "value"
