import pytest
from server.modules.test_executor.selection_filter import SelectionFilterEngine

def test_method_filter_matches_correctly():
    engine = SelectionFilterEngine()
    template = {
        "api_selection_filters": {
            "method": {"eq": "GET"}
        }
    }
    endpoint = {"method": "GET", "path": "/api/users/123"}
    should_run, _ = engine.should_run(template, endpoint)
    assert should_run is True

def test_wrong_method_filtered_out():
    engine = SelectionFilterEngine()
    template = {
        "api_selection_filters": {
            "method": {"eq": "GET"}
        }
    }
    endpoint = {"method": "DELETE", "path": "/api/users/123"}
    should_run, _ = engine.should_run(template, endpoint)
    assert should_run is False

def test_url_extraction():
    engine = SelectionFilterEngine()
    template = {
        "api_selection_filters": {
            "url": {"extract": "urlVar"}
        }
    }
    endpoint = {"url": "http://example.com/api/v1"}
    should_run, extracted = engine.should_run(template, endpoint)
    assert should_run is True
    assert extracted["urlVar"] == "http://example.com/api/v1"
