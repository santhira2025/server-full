import time
import uuid
from typing import Optional
from troubleshooter.models.schemas import (
    TroubleshootingRequest,
    TroubleshootingResponse,
    ToolType,
    ErrorCategory
)
from troubleshooter.services.parser import parse_error, classify_error
from troubleshooter.services.knowledge_base import (
    search_knowledge_base,
    generate_rca,
    generate_fix_steps,
    generate_prevention
)


class TroubleshooterService:
    def __init__(self):
        self.request_count = 0
    
    async def troubleshoot(self, request: TroubleshootingRequest) -> TroubleshootingResponse:
        start_time = time.time()
        request_id = str(uuid.uuid4())
        
        tool_hint = request.tool_hint
        
        parse_result = parse_error(request.error_input)
        if tool_hint and not parse_result.tool:
            parse_result.tool = tool_hint
        
        classification = classify_error(parse_result)
        
        matches = search_knowledge_base(
            error_code=parse_result.error_code or "",
            tool=parse_result.tool,
            category=classification.category,
            limit=5
        )
        
        rca = None
        if matches and matches[0].similarity_score > 0.5:
            rca = generate_rca(parse_result, classification, matches)
        
        fix = generate_fix_steps(matches)
        
        prevention = generate_prevention(matches, classification.category)
        
        self.request_count += 1
        
        total_time_ms = (time.time() - start_time) * 1000
        
        return TroubleshootingResponse(
            request_id=request_id,
            parse=parse_result,
            classify=classification,
            matches=matches,
            rca=rca,
            fix=fix,
            prevention=prevention,
            total_time_ms=total_time_ms
        )
    
    def get_catalog_stats(self) -> dict:
        from troubleshooter.services.knowledge_base import ERROR_CATALOG
        
        by_tool = {}
        by_category = {}
        
        for entry in ERROR_CATALOG:
            tool = entry["tool"].value
            category = entry["category"].value
            
            by_tool[tool] = by_tool.get(tool, 0) + 1
            by_category[category] = by_category.get(category, 0) + 1
        
        return {
            "total_errors": len(ERROR_CATALOG),
            "by_tool": by_tool,
            "by_category": by_category
        }


troubleshooter_service = TroubleshooterService()
