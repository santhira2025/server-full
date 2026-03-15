import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from troubleshooter.models.schemas import TroubleshootingRequest
from troubleshooter.core.troubleshooter import troubleshooter_service


def analyze_error(error_input: str, tool_hint: str = None):
    from troubleshooter.models.schemas import ToolType
    
    tool = None
    if tool_hint and tool_hint != "Auto-detect":
        try:
            tool = ToolType(tool_hint.lower())
        except ValueError:
            pass
    
    request = TroubleshootingRequest(
        error_input=error_input,
        tool_hint=tool
    )
    
    import asyncio
    result = asyncio.run(troubleshooter_service.troubleshoot(request))
    return result


def get_error_catalog():
    from troubleshooter.services.knowledge_base import ERROR_CATALOG
    
    data = []
    for entry in ERROR_CATALOG:
        data.append({
            "Error ID": entry["error_id"],
            "Title": entry["title"],
            "Tool": entry["tool"].value,
            "Category": entry["category"].value,
            "Severity": entry["severity"].value
        })
    
    return data
