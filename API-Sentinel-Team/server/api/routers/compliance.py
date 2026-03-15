from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from server.modules.persistence.database import get_db
from server.modules.compliance.report_generator import ComplianceReportGenerator
from server.modules.compliance.mapper import ComplianceMapper
from server.modules.compliance.pdf_renderer import PDFRenderer
from server.modules.auth.rbac import RBAC
from fastapi.responses import HTMLResponse

router = APIRouter()
_generator = ComplianceReportGenerator()
_renderer = PDFRenderer()
_mapper = ComplianceMapper()


@router.get("/reports")
async def get_compliance_report(payload: dict = Depends(RBAC.require_auth)):
    """Aggregate open vulnerabilities into OWASP / GDPR / HIPAA compliance report."""
    return await _generator.generate(payload["account_id"], "OWASP_API_2023")


@router.get("/reports/{framework}")
async def get_framework_report(framework: str = "OWASP_API_2023", payload: dict = Depends(RBAC.require_auth)):
    """Return compliance status for a specific framework (OWASP_API_2023 | GDPR)."""
    report = await _generator.generate(payload["account_id"], framework.upper())
    return report
 
 
@router.get("/reports/{framework}/export")
async def export_framework_report(
    framework: str = "OWASP_API_2023", 
    format: str = "json",
    payload: dict = Depends(RBAC.require_auth)
):
    """Export compliance report as JSON or HTML."""
    report = await _generator.generate(payload["account_id"], framework.upper())
    if format.lower() == "html":
        html = _renderer.generate_html(report)
        return HTMLResponse(content=html)
    return report


@router.get("/map/{category}")
async def map_category(category: str, payload: dict = Depends(RBAC.require_auth)):
    """Map a vulnerability category to compliance frameworks."""
    return _mapper.map_category(category)


@router.post("/export")
async def export_report(
    format: str = "json", 
    payload: dict = Depends(RBAC.require_auth), 
    db: AsyncSession = Depends(get_db)
):
    """Securely export the compliance report for the authenticated account."""
    account_id = payload["account_id"]
    report = await _mapper.generate_report(account_id, db)
    return {"status": "ok", "format": format, "report": report}
