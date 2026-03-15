from server.modules.persistence.database import AsyncSessionLocal
from server.models.core import Vulnerability
from server.api.websocket.manager import ws_manager
from server.api.websocket.event_types import WSEventType

class ResultAggregator:
    """
    Saves test results as persistent vulnerabilities in the database.
    """
    async def add_vulnerability(self, test_result: dict, endpoint: dict):
        """
        Processes a raw ExecutionEngine result and stores it if vulnerable.
        """
        if not test_result.get("is_vulnerable"):
            return

        async with AsyncSessionLocal() as db:
            vuln = Vulnerability(
                template_id=test_result["template_id"],
                endpoint_id=endpoint.get("id"),
                url=endpoint.get("path"),
                method=endpoint.get("method"),
                severity=test_result.get("severity", "MEDIUM"),
                status="OPEN",
                evidence={
                    "results": test_result["results"],
                    "context": test_result.get("context_variables", [])
                }
            )
            db.add(vuln)
            await db.commit()
            
            # Broadcast to all connected Dashboard clients
            await ws_manager.broadcast({
                "type": WSEventType.VULNERABILITY_FOUND,
                "data": {
                    "id": vuln.id,
                    "template_id": vuln.template_id,
                    "severity": vuln.severity,
                    "url": vuln.url,
                    "method": vuln.method,
                    "timestamp": vuln.created_at.isoformat() if vuln.created_at else None
                }
            })
            
            print(f"Recorded vulnerability: {test_result['template_id']} on {endpoint['path']}")
