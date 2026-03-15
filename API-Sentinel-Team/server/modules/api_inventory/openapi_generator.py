import json
from typing import Dict, Any, List
from server.models.core import APIEndpoint, SampleData
from sqlalchemy.future import select
from server.modules.persistence.database import AsyncSessionLocal
import logging

logger = logging.getLogger(__name__)

class OpenAPIGenerator:
    """
    Generates a full OpenAPI 3.0.0 specification from the inventory.
    """
    async def generate_spec(self, collection_name: str = "Discovered API", account_id: int | None = None) -> Dict[str, Any]:
        """
        Gathers all endpoints and structured data to build the final spec.
        """
        spec = {
            "openapi": "3.0.0",
            "info": {
                "title": collection_name,
                "version": "1.0.0",
                "description": "Auto-generated specification based on observed traffic"
            },
            "paths": {},
            "components": {"schemas": {}}
        }

        async with AsyncSessionLocal() as session:
            stmt = select(APIEndpoint)
            if account_id is not None:
                stmt = stmt.where(APIEndpoint.account_id == account_id)
            result = await session.execute(stmt)
            endpoints = result.scalars().all()

            for ep in endpoints:
                if ep.path not in spec["paths"]:
                    spec["paths"][ep.path] = {}

                spec["paths"][ep.path][ep.method.lower()] = {
                    "summary": f"Observed {ep.method} on {ep.path}",
                    "responses": {
                        "200": {
                            "description": "Successful response observed",
                            "content": {
                                "application/json": {
                                    "schema": self._infer_json_schema(ep.last_response_body)
                                }
                            }
                        }
                    }
                }

        return spec

    def _infer_json_schema(self, body_str: str) -> Dict[str, Any]:
        """
        Infers a basic JSON schema from a response body string.
        """
        if not body_str:
            return {"type": "object"}
            
        try:
            data = json.loads(body_str)
            return self._build_schema(data)
        except:
            return {"type": "string"}

    def _build_schema(self, data: Any) -> Dict[str, Any]:
        if isinstance(data, dict):
            properties = {k: self._build_schema(v) for k, v in data.items()}
            return {"type": "object", "properties": properties}
        elif isinstance(data, list):
            item_schema = self._build_schema(data[0]) if data else {"type": "object"}
            return {"type": "array", "items": item_schema}
        elif isinstance(data, str): return {"type": "string"}
        elif isinstance(data, (int, float)): return {"type": "number"}
        elif isinstance(data, bool): return {"type": "boolean"}
        else: return {"type": "object"}
