"""
Captures a baseline response from an endpoint before mutation.
Used by ExecutionEngine to feed original_response into percentage_match checks.
"""
import httpx


class BaselineCapturer:
    """Sends the original (unmodified) request to get a baseline response."""

    async def capture(self, endpoint: dict) -> dict:
        url = endpoint.get("url") or f"{endpoint.get('protocol', 'http')}://{endpoint.get('host', '')}{endpoint.get('path', '/')}"
        method = endpoint.get("method", "GET").upper()
        headers = endpoint.get("headers") or {}

        try:
            async with httpx.AsyncClient(timeout=8.0, verify=False) as client:
                resp = await client.request(method=method, url=url, headers=headers)
                return {
                    "status_code": resp.status_code,
                    "headers": dict(resp.headers),
                    "body": resp.text,
                }
        except Exception:
            # Fall back to cached data stored on the endpoint record
            return {
                "status_code": endpoint.get("last_response_code", 200),
                "headers": {},
                "body": endpoint.get("last_response_body") or "",
            }
