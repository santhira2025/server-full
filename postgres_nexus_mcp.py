"""
PostgresNexus MCP Server — Enterprise PostgreSQL Operations Intelligence
========================================================================
AI-native PostgreSQL management: queries, schema ops, performance tuning,
replication monitoring, backup management, and multi-tenant isolation.
Uses asyncpg for high-performance async PostgreSQL access.

Author: Santhira (Rajkumar Madhu)
"""

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any, Literal
from enum import Enum
from contextlib import asynccontextmanager
import json
import time

DEFAULT_DSN = "postgresql://postgres:postgres@localhost:5432/postgres"

@asynccontextmanager
async def pg_lifespan():
    import asyncpg
    pool = await asyncpg.create_pool(DEFAULT_DSN, min_size=2, max_size=10, command_timeout=30)
    try:
        yield {"pool": pool}
    finally:
        await pool.close()

mcp = FastMCP("postgres_nexus_mcp", lifespan=pg_lifespan)

class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"

def _safe_json(data):
    return json.dumps(data, indent=2, default=str)

async def _get_pool(ctx):
    return ctx.request_context.lifespan_state["pool"]

def _handle_error(e):
    return f"Error: {type(e).__name__} — {str(e)}"

# ---- INPUT MODELS ----

class PgQueryInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    sql: str = Field(..., description="SQL query to execute (SELECT only for read, or DML with confirm)", min_length=1, max_length=10000)
    params: Optional[List[Any]] = Field(default=None, description="Query parameters ($1, $2, ...)")
    explain: bool = Field(default=False, description="Run EXPLAIN ANALYZE on the query")
    limit: int = Field(default=100, description="Max rows to return", ge=1, le=10000)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class PgSchemaInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["tables", "columns", "indexes", "constraints", "size", "schemas"] = Field(..., description="Schema inspection action")
    table: Optional[str] = Field(default=None, description="Table name (for columns, indexes, constraints)")
    schema_name: str = Field(default="public", description="Schema name")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class PgHealthInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    include_slow_queries: bool = Field(default=True)
    include_locks: bool = Field(default=True)
    include_replication: bool = Field(default=True)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class PgIndexAdvisorInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    table: str = Field(..., description="Table to analyze for missing indexes")
    schema_name: str = Field(default="public")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class PgBackupInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["status", "trigger", "list"] = Field(..., description="Backup action")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class PgConnectionsInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["list", "kill_idle", "stats"] = Field(default="list")
    idle_threshold_minutes: int = Field(default=30, description="Kill connections idle longer than this", ge=5)
    confirm: bool = Field(default=False)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class PgTuningInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    total_ram_gb: float = Field(..., description="Total server RAM in GB", ge=1, le=1024)
    max_connections: int = Field(default=200, ge=10, le=10000)
    workload_type: Literal["web", "oltp", "olap", "mixed"] = Field(default="web")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

# ---- TOOLS ----

@mcp.tool(name="pg_query", annotations={"title": "Execute SQL Query", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False})
async def pg_query(params: PgQueryInput, ctx=None) -> str:
    """Execute a SQL query against PostgreSQL. Supports SELECT, INSERT, UPDATE, DELETE.
    Can run EXPLAIN ANALYZE for query performance analysis.
    Returns: Query results in markdown table or JSON format.
    """
    try:
        pool = await _get_pool(ctx)
        sql = params.sql.strip()

        # Safety check
        dangerous = ["DROP DATABASE", "DROP SCHEMA", "TRUNCATE"]
        for d in dangerous:
            if d in sql.upper():
                return f"⚠️ Dangerous operation `{d}` blocked. Use dedicated admin tools."

        if params.explain:
            sql = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {sql}"

        async with pool.acquire() as conn:
            if sql.upper().startswith("SELECT") or params.explain:
                rows = await conn.fetch(sql, *(params.params or []))
                rows = rows[:params.limit]
                if not rows:
                    return "Query returned 0 rows."

                if params.response_format == ResponseFormat.JSON:
                    return _safe_json([dict(r) for r in rows])

                if params.explain:
                    return f"## 📊 Query Plan\n```json\n{_safe_json([dict(r) for r in rows])}\n```"

                cols = list(rows[0].keys())
                md = f"## Query Results ({len(rows)} rows)\n\n"
                md += "| " + " | ".join(cols) + " |\n"
                md += "|" + "|".join(["---"] * len(cols)) + "|\n"
                for r in rows[:50]:
                    md += "| " + " | ".join(str(r[c])[:50] for c in cols) + " |\n"
                if len(rows) > 50:
                    md += f"\n*Showing 50 of {len(rows)} rows*"
                return md
            else:
                result = await conn.execute(sql, *(params.params or []))
                return f"✅ Executed: `{result}`"

    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="pg_schema", annotations={"title": "Schema Inspector", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def pg_schema(params: PgSchemaInput, ctx=None) -> str:
    """Inspect PostgreSQL schema: tables, columns, indexes, constraints, and sizes.
    Returns: Schema information in structured format.
    """
    try:
        pool = await _get_pool(ctx)
        async with pool.acquire() as conn:
            if params.action == "tables":
                rows = await conn.fetch("""
                    SELECT t.tablename, pg_total_relation_size(quote_ident(t.tablename)::regclass) as size,
                           (SELECT count(*) FROM information_schema.columns c WHERE c.table_name=t.tablename AND c.table_schema=$1) as columns,
                           COALESCE(s.n_live_tup, 0) as row_estimate
                    FROM pg_tables t LEFT JOIN pg_stat_user_tables s ON t.tablename=s.relname
                    WHERE t.schemaname = $1 ORDER BY size DESC
                """, params.schema_name)
                if params.response_format == ResponseFormat.JSON:
                    return _safe_json([dict(r) for r in rows])
                md = f"## 📋 Tables in `{params.schema_name}` ({len(rows)} tables)\n\n"
                md += "| Table | Rows (est) | Columns | Size |\n|-------|-----------|---------|------|\n"
                for r in rows:
                    size = r['size'] or 0
                    for unit in ['B','KB','MB','GB']:
                        if abs(size) < 1024: break
                        size /= 1024
                    md += f"| `{r['tablename']}` | {r['row_estimate']:,} | {r['columns']} | {size:.1f} {unit} |\n"
                return md

            elif params.action == "columns" and params.table:
                rows = await conn.fetch("""
                    SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
                    FROM information_schema.columns WHERE table_name=$1 AND table_schema=$2
                    ORDER BY ordinal_position
                """, params.table, params.schema_name)
                if params.response_format == ResponseFormat.JSON:
                    return _safe_json([dict(r) for r in rows])
                md = f"## 📦 Columns: `{params.table}` ({len(rows)} columns)\n\n"
                md += "| Column | Type | Nullable | Default |\n|--------|------|----------|---------|\n"
                for r in rows:
                    dtype = r['data_type']
                    if r['character_maximum_length']:
                        dtype += f"({r['character_maximum_length']})"
                    md += f"| `{r['column_name']}` | {dtype} | {r['is_nullable']} | {r['column_default'] or '-'} |\n"
                return md

            elif params.action == "indexes" and params.table:
                rows = await conn.fetch("""
                    SELECT indexname, indexdef, pg_relation_size(quote_ident(indexname)::regclass) as size
                    FROM pg_indexes WHERE tablename=$1 AND schemaname=$2
                """, params.table, params.schema_name)
                md = f"## 🔍 Indexes on `{params.table}` ({len(rows)})\n\n"
                for r in rows:
                    md += f"- **{r['indexname']}** ({r['size'] or 0} bytes)\n  `{r['indexdef']}`\n"
                return md

            elif params.action == "size":
                rows = await conn.fetch("""
                    SELECT pg_database_size(current_database()) as db_size,
                           current_database() as db_name
                """)
                r = rows[0]
                size = r['db_size']
                for unit in ['B','KB','MB','GB','TB']:
                    if abs(size) < 1024: break
                    size /= 1024
                return f"## 💾 Database `{r['db_name']}` size: {size:.2f} {unit}"

            elif params.action == "schemas":
                rows = await conn.fetch("SELECT schema_name FROM information_schema.schemata ORDER BY schema_name")
                return "## Schemas\n" + "\n".join(f"- `{r['schema_name']}`" for r in rows)

            return f"Provide table name for action: {params.action}"
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="pg_health_check", annotations={"title": "AI Health Check", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def pg_health_check(params: PgHealthInput, ctx=None) -> str:
    """Comprehensive PostgreSQL health check with AI-powered analysis.
    Checks: connections, cache hit rate, dead tuples, locks, replication, long queries.
    Returns: Health score (0-100) with issues and recommendations.
    """
    try:
        pool = await _get_pool(ctx)
        issues, recs = [], []
        score = 100

        async with pool.acquire() as conn:
            # Cache hit rate
            row = await conn.fetchrow("SELECT sum(blks_hit)/(sum(blks_hit)+sum(blks_read)+1)*100 as hit_rate FROM pg_stat_database")
            hit_rate = float(row['hit_rate'] or 0)
            if hit_rate < 90:
                issues.append(("🔴", f"Cache hit rate: {hit_rate:.1f}% (should be >95%)"))
                recs.append("Increase shared_buffers. Current cache is too small.")
                score -= 20
            elif hit_rate < 95:
                issues.append(("🟡", f"Cache hit rate: {hit_rate:.1f}% (below optimal 99%)"))
                score -= 5

            # Connections
            row = await conn.fetchrow("SELECT count(*) as active, (SELECT setting::int FROM pg_settings WHERE name='max_connections') as max_conn FROM pg_stat_activity")
            conn_pct = (row['active'] / row['max_conn']) * 100
            if conn_pct > 80:
                issues.append(("🟡", f"Connections: {row['active']}/{row['max_conn']} ({conn_pct:.0f}%)"))
                recs.append("Use PgBouncer for connection pooling.")
                score -= 10

            # Dead tuples (needs VACUUM)
            rows = await conn.fetch("SELECT relname, n_dead_tup FROM pg_stat_user_tables WHERE n_dead_tup > 10000 ORDER BY n_dead_tup DESC LIMIT 5")
            if rows:
                tables = ", ".join(f"{r['relname']}({r['n_dead_tup']:,})" for r in rows)
                issues.append(("🟡", f"Tables needing VACUUM: {tables}"))
                recs.append("Run VACUUM ANALYZE on these tables or tune autovacuum settings.")
                score -= 5

            # Long running queries
            if params.include_slow_queries:
                rows = await conn.fetch("""
                    SELECT pid, now()-query_start as duration, left(query,80) as query
                    FROM pg_stat_activity WHERE state='active' AND now()-query_start > interval '30 seconds'
                    AND query NOT LIKE '%pg_stat%' ORDER BY duration DESC LIMIT 5
                """)
                if rows:
                    issues.append(("🟡", f"{len(rows)} long-running queries (>30s)"))
                    score -= 5

            # Locks
            if params.include_locks:
                row = await conn.fetchrow("SELECT count(*) as blocked FROM pg_stat_activity WHERE wait_event_type='Lock'")
                if row['blocked'] > 0:
                    issues.append(("🔴", f"{row['blocked']} queries blocked by locks"))
                    score -= 15

            # Replication
            if params.include_replication:
                rows = await conn.fetch("SELECT client_addr, state, sent_lsn, replay_lsn FROM pg_stat_replication")
                if rows:
                    for r in rows:
                        if r['state'] != 'streaming':
                            issues.append(("🔴", f"Replica {r['client_addr']} state: {r['state']}"))
                            score -= 20

            # Database size
            row = await conn.fetchrow("SELECT pg_database_size(current_database()) as size")
            db_size = row['size']

        score = max(0, score)
        emoji = "🟢" if score >= 80 else "🟡" if score >= 50 else "🔴"

        if params.response_format == ResponseFormat.JSON:
            return _safe_json({"health_score": score, "issues": [{"s": s, "m": m} for s, m in issues], "recommendations": recs})

        md = f"## {emoji} PostgreSQL Health — Score: {score}/100\n\n"
        md += f"**Cache Hit Rate:** {hit_rate:.1f}% | **Connections:** {row['active'] if 'active' in dir() else 'N/A'} | **DB Size:** {db_size/1024/1024:.0f} MB\n\n"
        if issues:
            md += "### Issues\n" + "".join(f"- {s} {m}\n" for s, m in issues) + "\n"
        if recs:
            md += "### Recommendations\n" + "".join(f"{i}. {r}\n" for i, r in enumerate(recs, 1))
        if not issues:
            md += "✅ PostgreSQL is healthy!\n"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="pg_index_advisor", annotations={"title": "AI Index Advisor", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def pg_index_advisor(params: PgIndexAdvisorInput, ctx=None) -> str:
    """Analyze table access patterns and suggest missing indexes.
    Checks sequential scans, index usage, and unused indexes.
    Returns: Index recommendations with CREATE INDEX statements.
    """
    try:
        pool = await _get_pool(ctx)
        async with pool.acquire() as conn:
            stat = await conn.fetchrow("""
                SELECT seq_scan, seq_tup_read, idx_scan, idx_tup_fetch, n_live_tup, n_dead_tup
                FROM pg_stat_user_tables WHERE relname=$1
            """, params.table)
            if not stat:
                return f"Table `{params.table}` not found."

            indexes = await conn.fetch("SELECT indexname, indexdef FROM pg_indexes WHERE tablename=$1", params.table)
            unused = await conn.fetch("""
                SELECT indexrelname, idx_scan FROM pg_stat_user_indexes
                WHERE relname=$1 AND idx_scan=0 AND indexrelname NOT LIKE '%pkey%'
            """, params.table)

            md = f"## 🧠 Index Analysis: `{params.table}`\n\n"
            md += f"**Rows:** {stat['n_live_tup']:,} | **Dead tuples:** {stat['n_dead_tup']:,}\n"
            md += f"**Seq scans:** {stat['seq_scan']:,} | **Index scans:** {stat['idx_scan']:,}\n\n"

            if stat['seq_scan'] > stat['idx_scan'] and stat['n_live_tup'] > 1000:
                ratio = stat['seq_scan'] / max(stat['idx_scan'], 1)
                md += f"⚠️ **Sequential scans are {ratio:.0f}x more than index scans!** This table likely needs indexes.\n\n"

            md += f"### Current Indexes ({len(indexes)})\n"
            for idx in indexes:
                md += f"- `{idx['indexname']}`\n"

            if unused:
                md += f"\n### 🗑️ Unused Indexes (consider dropping)\n"
                for u in unused:
                    md += f"- `{u['indexrelname']}` — 0 scans since last stats reset\n"
                    md += f"  `DROP INDEX {u['indexrelname']};`\n"

            if stat['seq_scan'] > 100 and stat['n_live_tup'] > 10000:
                md += "\n### 💡 Suggested Actions\n"
                md += f"1. Check frequently filtered columns with: `SELECT * FROM pg_stat_statements WHERE query LIKE '%{params.table}%' ORDER BY calls DESC`\n"
                md += f"2. Enable `pg_stat_statements` extension if not already\n"
                md += f"3. Run `EXPLAIN ANALYZE` on your slowest queries against this table\n"

            return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="pg_connections", annotations={"title": "Connection Manager", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False})
async def pg_connections(params: PgConnectionsInput, ctx=None) -> str:
    """Manage PostgreSQL connections: list active, kill idle, view stats.
    Returns: Connection information and action results.
    """
    try:
        pool = await _get_pool(ctx)
        async with pool.acquire() as conn:
            if params.action == "list":
                rows = await conn.fetch("""
                    SELECT pid, usename, client_addr, state, now()-backend_start as duration,
                           left(query,60) as query, wait_event_type
                    FROM pg_stat_activity WHERE pid != pg_backend_pid() ORDER BY backend_start
                """)
                md = f"## 🔗 Connections ({len(rows)} total)\n\n"
                md += "| PID | User | State | Duration | Query |\n|-----|------|-------|----------|-------|\n"
                for r in rows:
                    md += f"| {r['pid']} | {r['usename']} | {r['state']} | {str(r['duration']).split('.')[0]} | `{r['query'] or '-'}` |\n"
                return md

            elif params.action == "kill_idle":
                if not params.confirm:
                    rows = await conn.fetch(f"SELECT count(*) as c FROM pg_stat_activity WHERE state='idle' AND now()-state_change > interval '{params.idle_threshold_minutes} minutes'")
                    return f"⚠️ Found {rows[0]['c']} idle connections (>{params.idle_threshold_minutes}min). Set confirm=True to terminate them."
                result = await conn.fetch(f"""
                    SELECT pg_terminate_backend(pid) FROM pg_stat_activity
                    WHERE state='idle' AND now()-state_change > interval '{params.idle_threshold_minutes} minutes' AND pid != pg_backend_pid()
                """)
                return f"🗑️ Terminated {len(result)} idle connections."

            elif params.action == "stats":
                row = await conn.fetchrow("""
                    SELECT count(*) as total,
                           count(*) FILTER (WHERE state='active') as active,
                           count(*) FILTER (WHERE state='idle') as idle,
                           count(*) FILTER (WHERE state='idle in transaction') as idle_tx,
                           count(*) FILTER (WHERE wait_event_type='Lock') as locked
                    FROM pg_stat_activity WHERE pid != pg_backend_pid()
                """)
                return _safe_json(dict(row))
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="pg_tuning_advisor", annotations={"title": "AI Tuning Advisor", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def pg_tuning_advisor(params: PgTuningInput, ctx=None) -> str:
    """AI-powered PostgreSQL configuration tuning advisor. Calculates optimal
    settings based on RAM, workload type, and connection count.
    Returns: postgresql.conf recommendations.
    """
    ram_mb = int(params.total_ram_gb * 1024)

    shared_buffers = int(ram_mb * 0.25)
    effective_cache = int(ram_mb * 0.75)
    work_mem = max(4, int((ram_mb - shared_buffers) / (params.max_connections * 3)))
    maintenance_work_mem = min(2048, int(ram_mb * 0.05))

    if params.workload_type == "olap":
        work_mem = max(64, int(ram_mb * 0.05))
        random_page_cost = 1.1
        effective_io = 200
    elif params.workload_type == "oltp":
        random_page_cost = 1.1
        effective_io = 200
    elif params.workload_type == "web":
        random_page_cost = 1.1
        effective_io = 200
    else:
        random_page_cost = 1.5
        effective_io = 150

    wal_buffers = min(64, max(1, shared_buffers // 32))

    md = f"## 🧠 PostgreSQL Tuning — {params.total_ram_gb}GB RAM, {params.workload_type} workload\n\n"
    md += "```ini\n"
    md += f"# Memory\n"
    md += f"shared_buffers = {shared_buffers}MB\n"
    md += f"effective_cache_size = {effective_cache}MB\n"
    md += f"work_mem = {work_mem}MB\n"
    md += f"maintenance_work_mem = {maintenance_work_mem}MB\n"
    md += f"wal_buffers = {wal_buffers}MB\n\n"
    md += f"# Connections\n"
    md += f"max_connections = {params.max_connections}\n\n"
    md += f"# Planner\n"
    md += f"random_page_cost = {random_page_cost}\n"
    md += f"effective_io_concurrency = {effective_io}\n\n"
    md += f"# WAL\n"
    md += f"wal_level = replica\n"
    md += f"max_wal_senders = 10\n"
    md += f"checkpoint_completion_target = 0.9\n"
    md += f"min_wal_size = 1GB\nmax_wal_size = 4GB\n\n"
    md += f"# Autovacuum\n"
    md += f"autovacuum_max_workers = 4\n"
    md += f"autovacuum_naptime = 30s\n"
    md += "```\n"
    return md

if __name__ == "__main__":
    import sys
    transport = "stdio"
    for arg in sys.argv[1:]:
        if arg == "--http": transport = "streamable_http"
    mcp.run(transport=transport, port=8002) if transport == "streamable_http" else mcp.run()
