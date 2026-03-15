from typing import Dict, Any, List, Optional
from sqlalchemy.future import select
from server.models.core import Vulnerability
from server.modules.persistence.database import AsyncSessionLocal
import logging

logger = logging.getLogger(__name__)

class ComplianceReportGenerator:
    """
    Groups vulnerabilities into industry standard compliance frameworks.
    """
    FRAMEWORKS = {
        "OWASP_API_2023": {
            "BOLA": ["API1:2023 - Broken Object Level Authorization"],
            "BFLA": ["API5:2023 - Broken Function Level Authorization"],
            "MASS_ASSIGNMENT": ["API3:2023 - Broken Object Property Level Authorization"],
            "PII": ["API2:2023 - Broken Authentication"], # Often results in data leaks
            "RATE_LIMITING": ["API4:2023 - Unrestricted Resource Consumption"]
        },
        "GDPR": {
            "PII": ["Article 32 - Security of processing"],
            "BOLA": ["Article 25 - Data protection by design/default"]
        }
    }

    async def generate(self, account_id: int, framework: str = "OWASP_API_2023") -> Dict[str, Any]:
        """
        Gathers OPEN vulnerabilities for the given account and maps them to framework categories.
        """
        async with AsyncSessionLocal() as session:
            stmt = select(Vulnerability).where(
                Vulnerability.account_id == account_id,
                Vulnerability.status == "OPEN"
            )
            result = await session.execute(stmt)
            vulns = result.scalars().all()

            mapping = self.FRAMEWORKS.get(framework, {})
            report = {
                "framework": framework,
                "total_open": len(vulns),
                "sections": {}
            }

            for vuln in vulns:
                # Find which category this vuln type maps to
                found_category = "Miscellaneous"
                for category, types in mapping.items():
                    if any(t in vuln.type for t in types) or category in vuln.type:
                        found_category = types[0] # Take the formal framework name
                        break
                
                report["sections"].setdefault(found_category, []).append({
                    "id": vuln.id,
                    "title": vuln.template_id,
                    "severity": vuln.severity,
                    "endpoint": f"{vuln.method} {vuln.url}"
                })

            return report
