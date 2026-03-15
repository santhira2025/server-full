import pytest
import json
from server.modules.test_executor.request_mutator import RequestMutator

def test_add_body_param():
    mutator = RequestMutator()
    req = {"body": json.dumps({"user_id": "123"})}
    rule = {"add_body_param": {"evil": "' OR 1=1"}}
    mutated = mutator.mutate(req, rule)
    
    mutated_body = json.loads(mutated["body"])
    assert mutated_body["evil"] == "' OR 1=1"
    assert mutated_body["user_id"] == "123"

def test_path_traversal_mutation():
    mutator = RequestMutator()
    req = {"url": "http://example.com/api/files/report.pdf"}
    # modify_url replaces path or appends. 
    # In Akto, modify_url: "../../../etc/passwd" would append to path
    rule = {"modify_url": "../../../etc/passwd"}
    mutated = mutator.mutate(req, rule)
    assert "../../../etc/passwd" in mutated["url"]

def test_modify_method():
    mutator = RequestMutator()
    req = {"method": "GET"}
    rule = {"modify_method": "POST"}
    mutated = mutator.mutate(req, rule)
    assert mutated["method"] == "POST"
