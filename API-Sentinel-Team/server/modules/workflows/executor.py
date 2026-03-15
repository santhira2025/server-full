"""API workflow executor — chains multi-step API calls with variable extraction."""
import httpx
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


class WorkflowExecutor:
    """
    Executes ordered API steps. Each step can:
    - Send HTTP request (method, url, headers, body)
    - Extract vars from response via dotted path: {"token": "data.access_token"}
    - Pass vars to next steps via {{var}} templating
    - Assert status code or body content
    """

    async def run(self, steps: List[Dict[str, Any]], auth_headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        variables: Dict[str, str] = {}
        step_results = []
        auth_headers = auth_headers or {}

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            for idx, step in enumerate(steps):
                result = await self._execute_step(client, step, variables, auth_headers)
                step_results.append(result)
                if not result["success"] and step.get("stop_on_failure", True):
                    return {"status": "FAILED", "step_results": step_results,
                            "variables": variables, "error": f"Step {idx+1} failed: {result.get('error')}"}
                for var_name, path in step.get("extract", {}).items():
                    val = self._extract(result.get("response_body", {}), path)
                    if val is not None:
                        variables[var_name] = str(val)

        return {"status": "COMPLETED", "step_results": step_results, "variables": variables}

    async def _execute_step(self, client, step, variables, auth_headers):
        method = step.get("method", "GET").upper()
        url = self._render(step.get("url", ""), variables)
        headers = {**auth_headers, **{k: self._render(v, variables) for k, v in step.get("headers", {}).items()}}
        body = step.get("body")
        if isinstance(body, dict):
            body = {k: self._render(str(v), variables) for k, v in body.items()}
        elif isinstance(body, str):
            body = self._render(body, variables)

        try:
            resp = await client.request(
                method, url, headers=headers,
                json=body if isinstance(body, dict) else None,
                content=body.encode() if isinstance(body, str) else None,
            )
            try:
                response_body = resp.json()
            except Exception:
                response_body = {"raw": resp.text[:2000]}

            assertions = step.get("assert", {})
            ok, msg = True, ""
            if "status_code" in assertions and resp.status_code != int(assertions["status_code"]):
                ok, msg = False, f"Expected {assertions['status_code']}, got {resp.status_code}"
            if ok and "body_contains" in assertions and assertions["body_contains"] not in resp.text:
                ok, msg = False, f"Body missing: {assertions['body_contains']}"

            return {
                "step_name": step.get("name", f"Step"),
                "url": url, "method": method, "status_code": resp.status_code,
                "response_body": response_body, "success": resp.is_success and ok,
                "assertion_passed": ok, "error": msg if not ok else None,
            }
        except Exception as e:
            return {"step_name": step.get("name", "Step"), "url": url, "method": method,
                    "success": False, "error": str(e)}

    def _render(self, template: str, variables: Dict[str, str]) -> str:
        for k, v in variables.items():
            template = template.replace(f"{{{{{k}}}}}", v)
        return template

    def _extract(self, body: Any, path: str) -> Any:
        current = body
        for part in path.split("."):
            if isinstance(current, dict):
                current = current.get(part)
            elif isinstance(current, list) and part.isdigit():
                current = current[int(part)]
            else:
                return None
        return current
