"""
ElasticNexus MCP Server — ELK Stack Intelligence
===================================================
AI-native Elasticsearch management: search, indexing, index lifecycle,
cluster health, log analysis, and intelligent query building.

Author: Santhira (Rajkumar Madhu) | Port: 8011
"""

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any, Literal
from enum import Enum
from contextlib import asynccontextmanager
import json

DEFAULT_ES_URL = "http://localhost:9200"

@asynccontextmanager
async def es_lifespan():
    import httpx
    client = httpx.AsyncClient(base_url=DEFAULT_ES_URL, timeout=15.0, headers={"Content-Type": "application/json"})
    try:
        await client.get("/")
        yield {"http": client}
    finally:
        await client.aclose()

mcp = FastMCP("elastic_nexus_mcp", lifespan=es_lifespan)

class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"

def _safe_json(data): return json.dumps(data, indent=2, default=str)
async def _get_http(ctx): return ctx.request_context.lifespan_state["http"]
def _handle_error(e): return f"Error: {type(e).__name__} — {str(e)}"

# ---- INPUT MODELS ----

class EsSearchInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    index: str = Field(..., description="Index pattern (e.g., 'logs-*', 'orders')")
    query: Optional[str] = Field(default=None, description="Search query string (Lucene syntax)")
    query_dsl: Optional[Dict[str, Any]] = Field(default=None, description="Elasticsearch Query DSL")
    size: int = Field(default=10, ge=1, le=10000)
    sort: Optional[Dict[str, str]] = Field(default=None, description="Sort (e.g., {'@timestamp': 'desc'})")
    aggs: Optional[Dict[str, Any]] = Field(default=None, description="Aggregations")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class EsIndexInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["list", "create", "delete", "stats", "mapping", "reindex", "refresh"] = Field(...)
    index: Optional[str] = Field(default=None)
    mappings: Optional[Dict[str, Any]] = Field(default=None, description="Index mappings")
    settings: Optional[Dict[str, Any]] = Field(default=None, description="Index settings")
    confirm: bool = Field(default=False)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class EsDocumentInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["index", "bulk", "get", "delete", "update"] = Field(...)
    index: str = Field(...)
    doc_id: Optional[str] = Field(default=None)
    document: Optional[Dict[str, Any]] = Field(default=None)
    documents: Optional[List[Dict[str, Any]]] = Field(default=None, description="For bulk indexing")
    confirm: bool = Field(default=False)

class EsClusterInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class EsLogAnalysisInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    index: str = Field(default="logs-*", description="Log index pattern")
    time_range: str = Field(default="1h", description="Time range (1h, 24h, 7d)")
    level: Optional[Literal["error", "warn", "info", "debug"]] = Field(default=None)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class EsILMInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["create_policy", "list_policies", "apply_policy"] = Field(...)
    policy_name: Optional[str] = Field(default=None)
    hot_days: int = Field(default=7)
    warm_days: int = Field(default=30)
    delete_days: int = Field(default=90)
    index_pattern: Optional[str] = Field(default=None)

# ---- TOOLS ----

@mcp.tool(name="es_search", annotations={"title": "Search & Query", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def es_search(params: EsSearchInput, ctx=None) -> str:
    """Search Elasticsearch with query string or full Query DSL. Supports aggregations."""
    try:
        http = await _get_http(ctx)
        body = {"size": params.size}
        if params.query:
            body["query"] = {"query_string": {"query": params.query}}
        elif params.query_dsl:
            body["query"] = params.query_dsl
        if params.sort:
            body["sort"] = [{k: {"order": v}} for k, v in params.sort.items()]
        if params.aggs:
            body["aggs"] = params.aggs

        resp = await http.post(f"/{params.index}/_search", json=body)
        resp.raise_for_status()
        data = resp.json()
        hits = data.get("hits", {})
        total = hits.get("total", {}).get("value", 0)
        docs = hits.get("hits", [])

        if params.response_format == ResponseFormat.JSON:
            return _safe_json(data)

        md = f"## 🔍 Search: `{params.index}` ({total:,} total hits)\n\n"
        for i, doc in enumerate(docs[:10]):
            src = doc.get("_source", {})
            md += f"### Hit {i+1} (score: {doc.get('_score', '-')})\n```json\n{_safe_json(src)[:500]}\n```\n"
        aggs = data.get("aggregations", {})
        if aggs:
            md += f"\n### Aggregations\n```json\n{_safe_json(aggs)[:1000]}\n```"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="es_index", annotations={"title": "Index Manager", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False})
async def es_index(params: EsIndexInput, ctx=None) -> str:
    """Manage Elasticsearch indexes: list, create, delete, stats, mappings."""
    try:
        http = await _get_http(ctx)
        if params.action == "list":
            resp = await http.get("/_cat/indices?format=json&s=store.size:desc")
            resp.raise_for_status()
            indices = resp.json()
            md = f"## 📋 Indices ({len(indices)})\n\n"
            md += "| Index | Docs | Size | Status | Health |\n|-------|------|------|--------|--------|\n"
            for idx in indices[:30]:
                health_emoji = {"green": "🟢", "yellow": "🟡", "red": "🔴"}.get(idx.get("health"), "⚪")
                md += f"| `{idx.get('index')}` | {idx.get('docs.count', 0)} | {idx.get('store.size', '?')} | {idx.get('status')} | {health_emoji} |\n"
            return md
        elif params.action == "create" and params.index:
            body = {}
            if params.mappings: body["mappings"] = params.mappings
            if params.settings: body["settings"] = params.settings
            resp = await http.put(f"/{params.index}", json=body)
            resp.raise_for_status()
            return f"✅ Index `{params.index}` created."
        elif params.action == "delete" and params.index:
            if not params.confirm: return f"⚠️ Delete `{params.index}` requires confirm=True."
            resp = await http.delete(f"/{params.index}")
            return f"🗑️ Index `{params.index}` deleted."
        elif params.action == "stats" and params.index:
            resp = await http.get(f"/{params.index}/_stats")
            resp.raise_for_status()
            stats = resp.json()
            total = stats.get("_all", {}).get("total", {})
            return f"## 📊 Stats: `{params.index}`\n\n- **Docs:** {total.get('docs', {}).get('count', 0):,}\n- **Size:** {total.get('store', {}).get('size_in_bytes', 0)/1024/1024:.1f} MB\n- **Indexing:** {total.get('indexing', {}).get('index_total', 0):,}\n- **Search:** {total.get('search', {}).get('query_total', 0):,}"
        elif params.action == "mapping" and params.index:
            resp = await http.get(f"/{params.index}/_mapping")
            resp.raise_for_status()
            return f"## 📦 Mapping: `{params.index}`\n```json\n{_safe_json(resp.json())[:2000]}\n```"
        return "Provide index name."
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="es_document", annotations={"title": "Document CRUD", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False})
async def es_document(params: EsDocumentInput, ctx=None) -> str:
    """Index, get, update, delete individual documents or bulk index."""
    try:
        http = await _get_http(ctx)
        if params.action == "index" and params.document:
            path = f"/{params.index}/_doc"
            if params.doc_id: path += f"/{params.doc_id}"
            resp = await http.post(path, json=params.document)
            resp.raise_for_status()
            return f"✅ Document indexed. ID: `{resp.json().get('_id')}`"
        elif params.action == "bulk" and params.documents:
            lines = []
            for doc in params.documents:
                lines.append(json.dumps({"index": {"_index": params.index}}))
                lines.append(json.dumps(doc))
            body = "\n".join(lines) + "\n"
            resp = await http.post("/_bulk", content=body, headers={"Content-Type": "application/x-ndjson"})
            resp.raise_for_status()
            result = resp.json()
            return f"✅ Bulk indexed {len(params.documents)} documents. Errors: {result.get('errors', False)}"
        elif params.action == "get" and params.doc_id:
            resp = await http.get(f"/{params.index}/_doc/{params.doc_id}")
            resp.raise_for_status()
            return f"## Document `{params.doc_id}`\n```json\n{_safe_json(resp.json().get('_source', {}))}\n```"
        elif params.action == "delete" and params.doc_id:
            if not params.confirm: return "⚠️ Set confirm=True."
            resp = await http.delete(f"/{params.index}/_doc/{params.doc_id}")
            return f"🗑️ Document `{params.doc_id}` deleted."
        return "Provide required fields."
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="es_cluster_health", annotations={"title": "AI Cluster Health", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def es_cluster_health(params: EsClusterInput, ctx=None) -> str:
    """Comprehensive Elasticsearch cluster health check."""
    try:
        http = await _get_http(ctx)
        issues, score = [], 100

        health = await http.get("/_cluster/health")
        h = health.json()

        if h.get("status") == "red":
            issues.append(("🔴", "Cluster is RED — data loss possible"))
            score -= 30
        elif h.get("status") == "yellow":
            issues.append(("🟡", "Cluster is YELLOW — replicas unassigned"))
            score -= 10

        if h.get("unassigned_shards", 0) > 0:
            issues.append(("🟡", f"{h['unassigned_shards']} unassigned shards"))
            score -= 5

        stats = await http.get("/_cluster/stats")
        s = stats.json()
        nodes = s.get("nodes", {}).get("count", {})

        score = max(0, score)
        emoji = {"green": "🟢", "yellow": "🟡", "red": "🔴"}.get(h.get("status"), "⚪")
        md = f"## {emoji} Elasticsearch Health — Score: {score}/100\n\n"
        md += f"**Cluster:** {h.get('cluster_name')} | **Status:** {h.get('status')} | **Nodes:** {h.get('number_of_nodes')}\n"
        md += f"**Shards:** {h.get('active_shards')} active, {h.get('unassigned_shards', 0)} unassigned\n"
        md += f"**Indices:** {s.get('indices', {}).get('count', 0)} | **Docs:** {s.get('indices', {}).get('docs', {}).get('count', 0):,}\n\n"
        if issues:
            md += "### Issues\n" + "".join(f"- {sv} {m}\n" for sv, m in issues)
        else:
            md += "✅ Cluster is healthy!\n"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="es_log_analysis", annotations={"title": "AI Log Analysis", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def es_log_analysis(params: EsLogAnalysisInput, ctx=None) -> str:
    """Analyze logs: error patterns, frequency, top sources, timeline."""
    try:
        http = await _get_http(ctx)
        range_map = {"1h": "now-1h", "6h": "now-6h", "24h": "now-1d", "7d": "now-7d"}
        gte = range_map.get(params.time_range, f"now-{params.time_range}")

        query = {"bool": {"must": [{"range": {"@timestamp": {"gte": gte}}}]}}
        if params.level:
            query["bool"]["must"].append({"match": {"level": params.level}})

        body = {
            "size": 5,
            "query": query,
            "sort": [{"@timestamp": "desc"}],
            "aggs": {
                "by_level": {"terms": {"field": "level.keyword", "size": 10}},
                "by_service": {"terms": {"field": "service.keyword", "size": 10}},
                "timeline": {"date_histogram": {"field": "@timestamp", "fixed_interval": "5m"}},
            }
        }
        resp = await http.post(f"/{params.index}/_search", json=body)
        resp.raise_for_status()
        data = resp.json()

        total = data.get("hits", {}).get("total", {}).get("value", 0)
        aggs = data.get("aggregations", {})

        md = f"## 📊 Log Analysis: `{params.index}` (last {params.time_range})\n\n"
        md += f"**Total Logs:** {total:,}\n\n"

        by_level = aggs.get("by_level", {}).get("buckets", [])
        if by_level:
            md += "### By Level\n"
            for b in by_level:
                emoji = {"error": "🔴", "warn": "🟡", "info": "🔵", "debug": "⚪"}.get(b["key"], "📝")
                md += f"- {emoji} **{b['key']}:** {b['doc_count']:,}\n"

        by_service = aggs.get("by_service", {}).get("buckets", [])
        if by_service:
            md += "\n### By Service\n"
            for b in by_service[:5]:
                md += f"- `{b['key']}`: {b['doc_count']:,}\n"
        return md
    except Exception as e:
        return _handle_error(e)

if __name__ == "__main__":
    import sys
    transport = "stdio"
    for arg in sys.argv[1:]:
        if arg == "--http": transport = "streamable_http"
    mcp.run(transport=transport, port=8011) if transport == "streamable_http" else mcp.run()
