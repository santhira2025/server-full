from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import json
import asyncio
from troubleshooter.models.schemas import (
    TroubleshootingRequest,
    TroubleshootingResponse,
    FeedbackRequest,
    ToolType,
    ErrorCategory,
    Severity
)
from troubleshooter.core.troubleshooter import troubleshooter_service

router = APIRouter(prefix="/api/v1/troubleshoot", tags=["troubleshoot"])


@router.post("", response_model=TroubleshootingResponse)
async def troubleshoot(request: TroubleshootingRequest):
    result = await troubleshooter_service.troubleshoot(request)
    return result


@router.post("/stream")
async def troubleshoot_stream(request: TroubleshootingRequest):
    async def event_generator():
        result = await troubleshooter_service.troubleshoot(request)
        
        yield f"data: {json.dumps({'step': 'parse', 'tool': result.parse.tool, 'code': result.parse.error_code})}\n\n"
        await asyncio.sleep(0.1)
        
        yield f"data: {json.dumps({'step': 'classify', 'category': result.classify.category, 'confidence': result.classify.confidence})}\n\n"
        await asyncio.sleep(0.1)
        
        yield f"data: {json.dumps({'step': 'matches', 'count': len(result.matches)})}\n\n"
        await asyncio.sleep(0.1)
        
        if result.rca:
            yield f"data: {json.dumps({'step': 'rca', 'analysis': result.rca.analysis, 'causes': [c.dict() for c in result.rca.causes]})}\n\n"
            await asyncio.sleep(0.1)
        
        if result.fix:
            yield f"data: {json.dumps({'step': 'fix', 'steps': [s.dict() for s in result.fix.steps]})}\n\n"
            await asyncio.sleep(0.1)
        
        yield f"data: {json.dumps({'step': 'complete', 'total_time_ms': result.total_time_ms})}\n\n"
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/stats")
async def get_stats():
    return troubleshooter_service.get_catalog_stats()


@router.get("/errors/search")
async def search_errors(
    query: str = "",
    tool: ToolType = None,
    category: ErrorCategory = None,
    limit: int = 10
):
    from troubleshooter.services.knowledge_base import search_knowledge_base
    
    matches = search_knowledge_base(
        error_code=query,
        tool=tool,
        category=category or ErrorCategory.STATE,
        limit=limit
    )
    
    return {
        "query": query,
        "results": [m.dict() for m in matches],
        "count": len(matches)
    }


@router.get("/errors/{error_id}")
async def get_error_details(error_id: str):
    from troubleshooter.services.knowledge_base import ERROR_CATALOG
    
    for entry in ERROR_CATALOG:
        if entry["error_id"] == error_id:
            return entry
    
    raise HTTPException(status_code=404, detail="Error not found")


@router.post("/errors/{error_id}/feedback")
async def submit_feedback(error_id: str, feedback: FeedbackRequest):
    return {
        "status": "received",
        "error_id": error_id,
        "feedback": feedback.dict()
    }
