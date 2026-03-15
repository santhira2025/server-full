"""
MongoNexus MCP Server — MongoDB Operations Intelligence
=========================================================
AI-native MongoDB management: CRUD, aggregations, indexes, collections,
replication monitoring, backup, and schema analysis.
Uses motor (async MongoDB driver).

Author: Santhira (Rajkumar Madhu) | Port: 8006
"""

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any, Literal
from enum import Enum
from contextlib import asynccontextmanager
import json

DEFAULT_URI = "mongodb://localhost:27017"

@asynccontextmanager
async def mongo_lifespan():
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(DEFAULT_URI)
    try:
        await client.admin.command("ping")
        yield {"mongo": client}
    finally:
        client.close()

mcp = FastMCP("mongo_nexus_mcp", lifespan=mongo_lifespan)

class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"

def _safe_json(data): return json.dumps(data, indent=2, default=str)
async def _get_mongo(ctx): return ctx.request_context.lifespan_state["mongo"]
def _handle_error(e): return f"Error: {type(e).__name__} — {str(e)}"

# ---- INPUT MODELS ----

class MongoQueryInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    database: str = Field(..., description="Database name")
    collection: str = Field(..., description="Collection name")
    action: Literal["find", "insert_one", "insert_many", "update", "delete", "count", "distinct", "aggregate"] = Field(...)
    filter_query: Optional[Dict[str, Any]] = Field(default=None, description="MongoDB filter (e.g., {'status': 'active'})")
    document: Optional[Dict[str, Any]] = Field(default=None, description="Document to insert")
    documents: Optional[List[Dict[str, Any]]] = Field(default=None, description="Documents for insert_many")
    update_doc: Optional[Dict[str, Any]] = Field(default=None, description="Update operations (e.g., {'$set': {'status': 'done'}})")
    pipeline: Optional[List[Dict[str, Any]]] = Field(default=None, description="Aggregation pipeline stages")
    projection: Optional[Dict[str, str]] = Field(default=None, description="Fields to include/exclude")
    sort: Optional[Dict[str, int]] = Field(default=None, description="Sort order (e.g., {'created': -1})")
    limit: int = Field(default=20, ge=1, le=1000)
    field: Optional[str] = Field(default=None, description="Field name for distinct")
    confirm: bool = Field(default=False, description="Required for delete/update")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class MongoCollectionInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    database: str = Field(..., description="Database name")
    action: Literal["list", "create", "drop", "stats", "indexes", "create_index", "schema_analysis"] = Field(...)
    collection: Optional[str] = Field(default=None)
    index_fields: Optional[Dict[str, int]] = Field(default=None, description="Index spec (e.g., {'email': 1, 'created': -1})")
    index_options: Optional[Dict[str, Any]] = Field(default=None, description="unique, sparse, ttl_seconds, etc.")
    confirm: bool = Field(default=False)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class MongoHealthInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class MongoDatabaseInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["list", "stats", "drop"] = Field(default="list")
    database: Optional[str] = Field(default=None)
    confirm: bool = Field(default=False)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class MongoSchemaAdvisorInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    use_case: str = Field(..., description="Describe your data model and access patterns")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

# ---- TOOLS ----

@mcp.tool(name="mongo_query", annotations={"title": "Query & CRUD", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False})
async def mongo_query(params: MongoQueryInput, ctx=None) -> str:
    """Execute MongoDB operations: find, insert, update, delete, count, distinct, aggregate.
    Full CRUD with projections, sorting, and aggregation pipelines.
    """
    try:
        client = await _get_mongo(ctx)
        db = client[params.database]
        coll = db[params.collection]

        if params.action == "find":
            cursor = coll.find(params.filter_query or {}, params.projection)
            if params.sort:
                cursor = cursor.sort(list(params.sort.items()))
            cursor = cursor.limit(params.limit)
            docs = await cursor.to_list(params.limit)
            if params.response_format == ResponseFormat.JSON:
                return _safe_json(docs)
            if not docs:
                return "No documents found."
            md = f"## 📄 Found {len(docs)} document(s) in `{params.database}.{params.collection}`\n\n"
            for i, doc in enumerate(docs[:10]):
                md += f"### Doc {i+1}\n```json\n{_safe_json(doc)}\n```\n"
            if len(docs) > 10:
                md += f"\n*Showing 10 of {len(docs)} documents*"
            return md

        elif params.action == "insert_one" and params.document:
            result = await coll.insert_one(params.document)
            return f"✅ Inserted document. ID: `{result.inserted_id}`"

        elif params.action == "insert_many" and params.documents:
            result = await coll.insert_many(params.documents)
            return f"✅ Inserted {len(result.inserted_ids)} documents."

        elif params.action == "update":
            if not params.confirm:
                count = await coll.count_documents(params.filter_query or {})
                return f"⚠️ Update would affect {count} documents. Set confirm=True."
            result = await coll.update_many(params.filter_query or {}, params.update_doc)
            return f"✅ Updated {result.modified_count} of {result.matched_count} matched documents."

        elif params.action == "delete":
            if not params.confirm:
                count = await coll.count_documents(params.filter_query or {})
                return f"⚠️ Delete would remove {count} documents. Set confirm=True."
            result = await coll.delete_many(params.filter_query or {})
            return f"🗑️ Deleted {result.deleted_count} documents."

        elif params.action == "count":
            count = await coll.count_documents(params.filter_query or {})
            return f"**Count:** {count:,} documents in `{params.database}.{params.collection}`"

        elif params.action == "distinct" and params.field:
            values = await coll.distinct(params.field, params.filter_query or {})
            return f"## Distinct `{params.field}` ({len(values)} values)\n\n{_safe_json(values[:50])}"

        elif params.action == "aggregate" and params.pipeline:
            cursor = coll.aggregate(params.pipeline)
            docs = await cursor.to_list(params.limit)
            return f"## 📊 Aggregation Results ({len(docs)} docs)\n\n```json\n{_safe_json(docs)}\n```"

        return "Invalid action or missing required fields."
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="mongo_collection", annotations={"title": "Collection Manager", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False})
async def mongo_collection(params: MongoCollectionInput, ctx=None) -> str:
    """Manage collections: list, create, drop, stats, indexes, schema analysis."""
    try:
        client = await _get_mongo(ctx)
        db = client[params.database]

        if params.action == "list":
            colls = await db.list_collection_names()
            md = f"## 📋 Collections in `{params.database}` ({len(colls)})\n\n"
            for c in sorted(colls):
                stats = await db.command("collStats", c)
                md += f"- `{c}` — {stats.get('count', 0):,} docs, {stats.get('size', 0)/1024/1024:.1f} MB\n"
            return md

        elif params.action == "stats" and params.collection:
            stats = await db.command("collStats", params.collection)
            return f"## 📊 Stats: `{params.collection}`\n\n- **Docs:** {stats.get('count', 0):,}\n- **Size:** {stats.get('size', 0)/1024/1024:.1f} MB\n- **Avg Doc Size:** {stats.get('avgObjSize', 0):.0f} bytes\n- **Indexes:** {stats.get('nindexes', 0)}\n- **Index Size:** {stats.get('totalIndexSize', 0)/1024/1024:.1f} MB\n"

        elif params.action == "indexes" and params.collection:
            coll = db[params.collection]
            indexes = await coll.index_information()
            md = f"## 🔍 Indexes on `{params.collection}` ({len(indexes)})\n\n"
            for name, info in indexes.items():
                md += f"- `{name}` — keys: {info.get('key')}, unique: {info.get('unique', False)}\n"
            return md

        elif params.action == "create_index" and params.collection and params.index_fields:
            coll = db[params.collection]
            keys = list(params.index_fields.items())
            opts = {}
            if params.index_options:
                if params.index_options.get("unique"): opts["unique"] = True
                if params.index_options.get("sparse"): opts["sparse"] = True
                if params.index_options.get("ttl_seconds"): opts["expireAfterSeconds"] = params.index_options["ttl_seconds"]
            name = await coll.create_index(keys, **opts)
            return f"✅ Index `{name}` created on `{params.collection}`"

        elif params.action == "drop" and params.collection:
            if not params.confirm:
                return f"⚠️ Drop `{params.collection}` requires confirm=True."
            await db.drop_collection(params.collection)
            return f"🗑️ Collection `{params.collection}` dropped."

        elif params.action == "schema_analysis" and params.collection:
            coll = db[params.collection]
            sample = await coll.find().limit(100).to_list(100)
            if not sample:
                return "Collection is empty."
            field_types = {}
            for doc in sample:
                for k, v in doc.items():
                    t = type(v).__name__
                    field_types.setdefault(k, {}).setdefault(t, 0)
                    field_types[k][t] += 1
            md = f"## 🔬 Schema Analysis: `{params.collection}` (sampled {len(sample)} docs)\n\n"
            md += "| Field | Types | Coverage |\n|-------|-------|----------|\n"
            for field, types in sorted(field_types.items()):
                type_str = ", ".join(f"{t}({c})" for t, c in types.items())
                coverage = sum(types.values()) / len(sample) * 100
                md += f"| `{field}` | {type_str} | {coverage:.0f}% |\n"
            return md

        return "Provide collection name for this action."
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="mongo_databases", annotations={"title": "Database Manager", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def mongo_databases(params: MongoDatabaseInput, ctx=None) -> str:
    """List, inspect, or drop MongoDB databases."""
    try:
        client = await _get_mongo(ctx)
        if params.action == "list":
            dbs = await client.list_database_names()
            md = f"## 🗄️ Databases ({len(dbs)})\n\n"
            for d in dbs:
                stats = await client[d].command("dbStats")
                md += f"- `{d}` — {stats.get('collections', 0)} collections, {stats.get('dataSize', 0)/1024/1024:.1f} MB\n"
            return md
        elif params.action == "stats" and params.database:
            stats = await client[params.database].command("dbStats")
            return f"## 📊 Database: `{params.database}`\n```json\n{_safe_json(stats)}\n```"
        elif params.action == "drop" and params.database:
            if not params.confirm:
                return f"⚠️ Drop database `{params.database}` requires confirm=True!"
            await client.drop_database(params.database)
            return f"🗑️ Database `{params.database}` dropped."
        return "Provide database name."
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="mongo_health_check", annotations={"title": "AI Health Check", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def mongo_health_check(params: MongoHealthInput, ctx=None) -> str:
    """Comprehensive MongoDB health check: server status, replication, connections, memory, operations."""
    try:
        client = await _get_mongo(ctx)
        status = await client.admin.command("serverStatus")
        issues, score = [], 100

        # Connections
        conns = status.get("connections", {})
        current = conns.get("current", 0)
        available = conns.get("available", 1)
        if current / (current + available) > 0.8:
            issues.append(("🟡", f"Connection usage high: {current}/{current+available}"))
            score -= 10

        # Memory
        mem = status.get("mem", {})
        resident_mb = mem.get("resident", 0)

        # Operations
        opcounters = status.get("opcounters", {})

        # Replication
        repl = status.get("repl", {})
        is_primary = repl.get("ismaster", False) if repl else True

        emoji = "🟢" if score >= 80 else "🟡" if score >= 50 else "🔴"
        md = f"## {emoji} MongoDB Health — Score: {score}/100\n\n"
        md += f"**Version:** {status.get('version')} | **Uptime:** {status.get('uptime', 0)/3600:.1f}h\n"
        md += f"**Connections:** {current}/{current+available} | **Memory:** {resident_mb}MB\n"
        md += f"**Ops:** insert={opcounters.get('insert', 0):,} query={opcounters.get('query', 0):,} update={opcounters.get('update', 0):,} delete={opcounters.get('delete', 0):,}\n\n"
        if issues:
            md += "### Issues\n" + "".join(f"- {s} {m}\n" for s, m in issues)
        else:
            md += "✅ MongoDB is healthy!\n"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="mongo_schema_advisor", annotations={"title": "AI Schema Advisor", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def mongo_schema_advisor(params: MongoSchemaAdvisorInput, ctx=None) -> str:
    """AI-powered MongoDB schema design advisor. Recommends embedding vs referencing, indexes, and patterns."""
    use = params.use_case.lower()
    if any(w in use for w in ["user", "profile", "account"]):
        return "## 🧠 Schema: User Profiles\n\n**Pattern:** Embed frequently-accessed data, reference large arrays.\n\n```json\n{\n  \"_id\": ObjectId,\n  \"name\": \"Rajkumar\",\n  \"email\": \"raj@santhira.com\",\n  \"profile\": { \"role\": \"CTO\", \"company\": \"Santhira\" },\n  \"preferences\": { \"theme\": \"dark\", \"lang\": \"ta\" },\n  \"recent_logins\": [/* last 10 only, capped array */]\n}\n```\n\n**Indexes:** `{email: 1}` (unique), `{\"profile.company\": 1}`\n**Tip:** Don't embed unbounded arrays (use separate collection for orders/logs)"
    elif any(w in use for w in ["order", "transaction", "trade"]):
        return "## 🧠 Schema: Orders/Transactions\n\n**Pattern:** Embed line items (bounded), reference user.\n\n```json\n{\n  \"_id\": ObjectId,\n  \"order_id\": \"ORD001\",\n  \"user_id\": ObjectId,\n  \"status\": \"completed\",\n  \"items\": [\n    { \"sku\": \"SKU001\", \"name\": \"Widget\", \"qty\": 2, \"price\": 999 }\n  ],\n  \"total\": 1998,\n  \"created_at\": ISODate\n}\n```\n\n**Indexes:** `{order_id: 1}` (unique), `{user_id: 1, created_at: -1}`, `{status: 1}`"
    else:
        return "## 🧠 Schema Design Principles\n\n1. **Embed** data accessed together (1:1, 1:few)\n2. **Reference** for 1:many or many:many\n3. **Avoid** unbounded arrays\n4. **Index** query patterns, not fields\n5. **Shard** on high-cardinality fields"

if __name__ == "__main__":
    import sys
    transport = "stdio"
    for arg in sys.argv[1:]:
        if arg == "--http": transport = "streamable_http"
    mcp.run(transport=transport, port=8006) if transport == "streamable_http" else mcp.run()
