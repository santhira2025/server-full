import json
import datetime
from typing import List
from xml.etree.ElementTree import Element, SubElement, tostring

from server.models.core import TestRun, TestResult


def _sarif_result(result: TestResult) -> dict:
    level = "warning"
    if (result.severity or "").upper() in {"CRITICAL", "HIGH"}:
        level = "error"
    elif (result.severity or "").upper() == "LOW":
        level = "note"
    return {
        "ruleId": result.template_id or "unknown-template",
        "level": level,
        "message": {"text": f"{result.template_id} on {result.endpoint_id}"},
        "locations": [
            {
                "physicalLocation": {
                    "artifactLocation": {"uri": result.endpoint_id or "unknown-endpoint"},
                }
            }
        ],
        "properties": {
            "endpoint_id": result.endpoint_id,
            "severity": result.severity,
            "evidence": result.evidence,
        },
    }


def build_sarif(run: TestRun, results: List[TestResult]) -> dict:
    now = datetime.datetime.utcnow().isoformat() + "Z"
    sarif_results = [_sarif_result(r) for r in results if r.is_vulnerable]
    return {
        "version": "2.1.0",
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "runs": [
            {
                "tool": {
                    "driver": {
                        "name": "API-Sentinel",
                        "version": "1.0",
                        "informationUri": "https://api-sentinel.local",
                        "rules": [
                            {"id": r.template_id or "unknown-template"}
                            for r in results
                            if r.template_id
                        ],
                    }
                },
                "invocations": [
                    {
                        "executionSuccessful": True,
                        "endTimeUtc": now,
                    }
                ],
                "results": sarif_results,
            }
        ],
    }


def build_junit(run: TestRun, results: List[TestResult]) -> str:
    suite = Element("testsuite")
    suite.set("name", f"api-sentinel-run-{run.id}")
    suite.set("tests", str(len(results)))
    suite.set("failures", str(sum(1 for r in results if r.is_vulnerable)))

    for result in results:
        case = SubElement(suite, "testcase")
        case.set("name", result.template_id or "unknown-template")
        case.set("classname", result.endpoint_id or "unknown-endpoint")
        if result.is_vulnerable:
            failure = SubElement(case, "failure")
            failure.set("message", result.severity or "HIGH")
            failure.text = json.dumps({
                "endpoint_id": result.endpoint_id,
                "severity": result.severity,
                "evidence": result.evidence,
            })

    return tostring(suite, encoding="unicode")
