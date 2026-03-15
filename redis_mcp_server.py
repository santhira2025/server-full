"""
RedisNexus MCP Server — Enterprise-Grade Redis Operations Intelligence
======================================================================
The world's first AI-native Redis MCP server that enables LLMs to:
- Query, manage, and monitor Redis instances
- Analyze performance & suggest optimizations  
- Manage multi-tenant cache infrastructure
- Execute intelligent caching strategies
- Real-time anomaly detection & alerting

Author: Santhira (Rajkumar Madhu)
License: MIT
"""

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, List, Dict, Any, Literal
from enum import Enum
from contextlib import asynccontextmanager
import json
import time
import hashlib
import re

# ============================================================
# CONSTANTS
# ============================================================
DEFAULT_REDIS_URL = "redis://localhost:6379"
MAX_SCAN_COUNT = 1000
MAX_KEY_RESULTS = 100
SLOW_QUERY_THRESHOLD_MS = 10
MEMORY_ALERT_PERCENT = 80
CONNECTION_ALERT_PERCENT = 80
DANGEROUS_COMMANDS = {"FLUSHALL", "FLUSHDB", "DEBUG", "SHUTDOWN", "CONFIG SET"}
SUPPORTED_DATA_TYPES = {"string", "hash", "list", "set", "zset", "stream"}

# ============================================================
# LIFESPAN — Persistent Redis Connection Pool
# ============================================================
@asynccontextmanager
async def redis_lifespan():
    """Manage Redis connection pool lifecycle."""
    import redis.asyncio as aioredis

    pool = aioredis.ConnectionPool.from_url(
        DEFAULT_REDIS_URL,
        max_connections=20,
        decode_responses=True,
        socket_timeout=5,
        socket_connect_timeout=5,
        retry_on_timeout=True,
    )
    client = aioredis.Redis(connection_pool=pool)

    try:
        await client.ping()
        yield {"redis": client, "pool": pool}
    finally:
        await client.close()
        await pool.disconnect()


# ============================================================
# MCP SERVER INITIALIZATION
# ============================================================
mcp = FastMCP("redis_nexus_mcp", lifespan=redis_lifespan)


# ============================================================
# SHARED UTILITIES
# ============================================================
def _format_bytes(num_bytes: int) -> str:
    """Convert bytes to human-readable format."""
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if abs(num_bytes) < 1024.0:
            return f"{num_bytes:.2f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.2f} PB"


def _format_seconds(seconds: int) -> str:
    """Convert seconds to human-readable duration."""
    if seconds < 60:
        return f"{seconds}s"
    elif seconds < 3600:
        return f"{seconds // 60}m {seconds % 60}s"
    elif seconds < 86400:
        return f"{seconds // 3600}h {(seconds % 3600) // 60}m"
    else:
        return f"{seconds // 86400}d {(seconds % 86400) // 3600}h"


def _safe_json(data: Any) -> str:
    """Safely serialize data to JSON."""
    try:
        return json.dumps(data, indent=2, default=str)
    except (TypeError, ValueError) as e:
        return json.dumps({"error": f"Serialization failed: {str(e)}"})


def _parse_info_section(info_str: str) -> Dict[str, str]:
    """Parse Redis INFO output into a dictionary."""
    result = {}
    for line in info_str.strip().split("\n"):
        line = line.strip()
        if line and not line.startswith("#"):
            parts = line.split(":", 1)
            if len(parts) == 2:
                result[parts[0]] = parts[1]
    return result


async def _get_redis(ctx):
    """Extract Redis client from context."""
    return ctx.request_context.lifespan_state["redis"]


def _handle_error(e: Exception) -> str:
    """Consistent error formatting."""
    error_type = type(e).__name__
    if "ConnectionError" in error_type:
        return f"Error: Cannot connect to Redis. Check if Redis is running and accessible. Details: {str(e)}"
    elif "TimeoutError" in error_type:
        return f"Error: Redis operation timed out. The server may be overloaded. Details: {str(e)}"
    elif "AuthenticationError" in error_type:
        return f"Error: Authentication failed. Check your Redis password. Details: {str(e)}"
    elif "ResponseError" in error_type:
        return f"Error: Redis command error — {str(e)}"
    return f"Error: {error_type} — {str(e)}"


# ============================================================
# INPUT MODELS
# ============================================================
class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"


class RedisKeyInput(BaseModel):
    """Input for single key operations."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    key: str = Field(..., description="Redis key name (e.g., 'user:1001', 'cache:products')", min_length=1, max_length=512)


class RedisGetInput(BaseModel):
    """Input for GET operations."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    key: str = Field(..., description="Redis key to retrieve", min_length=1, max_length=512)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN, description="Output format")


class RedisSetInput(BaseModel):
    """Input for SET operations."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    key: str = Field(..., description="Redis key to set", min_length=1, max_length=512)
    value: str = Field(..., description="Value to store", max_length=1048576)
    ttl_seconds: Optional[int] = Field(default=None, description="Time-to-live in seconds (None = no expiry)", ge=1, le=2592000)
    only_if_not_exists: bool = Field(default=False, description="Only set if key doesn't already exist (NX flag)")
    only_if_exists: bool = Field(default=False, description="Only set if key already exists (XX flag)")


class RedisHashInput(BaseModel):
    """Input for Hash operations."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    key: str = Field(..., description="Hash key name", min_length=1, max_length=512)
    fields: Dict[str, str] = Field(..., description="Field-value pairs to set (e.g., {'name': 'Raj', 'role': 'CTO'})")
    ttl_seconds: Optional[int] = Field(default=None, description="TTL for the hash key", ge=1, le=2592000)


class RedisHashGetInput(BaseModel):
    """Input for Hash GET operations."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    key: str = Field(..., description="Hash key name", min_length=1, max_length=512)
    fields: Optional[List[str]] = Field(default=None, description="Specific fields to get (None = all fields)")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)


class RedisListInput(BaseModel):
    """Input for List operations."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    key: str = Field(..., description="List key name", min_length=1, max_length=512)
    values: List[str] = Field(..., description="Values to push", min_length=1, max_length=100)
    direction: Literal["left", "right"] = Field(default="left", description="Push direction: 'left' (LPUSH) or 'right' (RPUSH)")
    ttl_seconds: Optional[int] = Field(default=None, ge=1, le=2592000)


class RedisListRangeInput(BaseModel):
    """Input for List range queries."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    key: str = Field(..., description="List key name", min_length=1, max_length=512)
    start: int = Field(default=0, description="Start index (0-based)")
    stop: int = Field(default=-1, description="Stop index (-1 = end)")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)


class RedisSortedSetInput(BaseModel):
    """Input for Sorted Set operations."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    key: str = Field(..., description="Sorted set key name", min_length=1, max_length=512)
    members: Dict[str, float] = Field(..., description="Member-score pairs (e.g., {'trader_A': 95.5, 'trader_B': 87.0})")
    ttl_seconds: Optional[int] = Field(default=None, ge=1, le=2592000)


class RedisSortedSetRangeInput(BaseModel):
    """Input for Sorted Set range queries."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    key: str = Field(..., description="Sorted set key name", min_length=1, max_length=512)
    start: int = Field(default=0, description="Start rank (0-based)")
    stop: int = Field(default=-1, description="Stop rank (-1 = end)")
    reverse: bool = Field(default=False, description="Reverse order (highest scores first)")
    with_scores: bool = Field(default=True, description="Include scores in output")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)


class RedisStreamAddInput(BaseModel):
    """Input for Stream XADD operations."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    key: str = Field(..., description="Stream key name", min_length=1, max_length=512)
    fields: Dict[str, str] = Field(..., description="Field-value pairs for the stream entry")
    max_length: Optional[int] = Field(default=None, description="Maximum stream length (MAXLEN)", ge=1)
    entry_id: str = Field(default="*", description="Entry ID ('*' for auto-generated)")


class RedisStreamReadInput(BaseModel):
    """Input for Stream XRANGE operations."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    key: str = Field(..., description="Stream key name", min_length=1, max_length=512)
    start: str = Field(default="-", description="Start ID ('-' = beginning)")
    end: str = Field(default="+", description="End ID ('+' = latest)")
    count: int = Field(default=10, description="Max entries to return", ge=1, le=1000)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)


class RedisPubSubInput(BaseModel):
    """Input for Pub/Sub PUBLISH operations."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    channel: str = Field(..., description="Channel name to publish to", min_length=1, max_length=256)
    message: str = Field(..., description="Message to publish", max_length=1048576)


class RedisScanInput(BaseModel):
    """Input for key scanning operations."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    pattern: str = Field(default="*", description="Key pattern (e.g., 'user:*', 'cache:products:*')", max_length=256)
    count: int = Field(default=100, description="Max keys to return per scan", ge=1, le=MAX_KEY_RESULTS)
    key_type: Optional[str] = Field(default=None, description="Filter by type: string, hash, list, set, zset, stream")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

    @field_validator("key_type")
    @classmethod
    def validate_key_type(cls, v: Optional[str]) -> Optional[str]:
        if v and v not in SUPPORTED_DATA_TYPES:
            raise ValueError(f"Invalid type. Supported: {', '.join(SUPPORTED_DATA_TYPES)}")
        return v


class RedisDeleteInput(BaseModel):
    """Input for DELETE operations."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    keys: List[str] = Field(..., description="List of keys to delete", min_length=1, max_length=100)
    confirm: bool = Field(default=False, description="Must be True to confirm deletion")


class RedisInfoInput(BaseModel):
    """Input for INFO/monitoring operations."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    section: Optional[str] = Field(default=None, description="INFO section: server, clients, memory, stats, replication, keyspace, all")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)


class RedisHealthCheckInput(BaseModel):
    """Input for comprehensive health check."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    include_slow_log: bool = Field(default=True, description="Include slow query analysis")
    include_memory_analysis: bool = Field(default=True, description="Include memory breakdown")
    include_client_analysis: bool = Field(default=True, description="Include connected client details")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)


class RedisKeyAnalysisInput(BaseModel):
    """Input for key pattern analysis."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    sample_size: int = Field(default=1000, description="Number of keys to sample", ge=100, le=10000)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)


class RedisPipelineInput(BaseModel):
    """Input for batch/pipeline operations."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    commands: List[Dict[str, Any]] = Field(
        ...,
        description="List of commands to execute. Each: {'cmd': 'SET', 'args': ['key', 'value']}",
        min_length=1,
        max_length=50,
    )

    @field_validator("commands")
    @classmethod
    def validate_commands(cls, v: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        for cmd in v:
            if "cmd" not in cmd:
                raise ValueError("Each command must have a 'cmd' field")
            if cmd["cmd"].upper() in DANGEROUS_COMMANDS:
                raise ValueError(f"Dangerous command blocked: {cmd['cmd']}. Use dedicated tools for administrative operations.")
        return v


class RedisCacheStrategyInput(BaseModel):
    """Input for AI-powered cache strategy recommendations."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    use_case: str = Field(..., description="Describe your use case (e.g., 'trading API price cache', 'session storage for 10K users')")
    read_write_ratio: Optional[str] = Field(default=None, description="Approximate read:write ratio (e.g., '90:10', '50:50')")
    data_size: Optional[str] = Field(default=None, description="Approximate data size (e.g., '500MB', '10GB')")
    consistency_requirement: Literal["eventual", "strong", "none"] = Field(
        default="eventual", description="How consistent must cached data be?"
    )
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)


class RedisMultiTenantInput(BaseModel):
    """Input for multi-tenant operations."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    tenant_id: str = Field(..., description="Tenant identifier", min_length=1, max_length=128)
    action: Literal["stats", "keys", "usage", "isolate", "cleanup"] = Field(
        ..., description="Action: stats, keys, usage, isolate (set limits), cleanup (remove tenant data)"
    )
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)


# ============================================================
# CORE DATA OPERATION TOOLS
# ============================================================

@mcp.tool(
    name="redis_get",
    annotations={
        "title": "Get Value by Key",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def redis_get(params: RedisGetInput, ctx=None) -> str:
    """Get a value from Redis by key. Automatically detects the data type and returns
    the appropriate representation (string, hash, list, set, sorted set, or stream).

    Returns:
        str: The value stored at the key with type info and TTL
    """
    try:
        r = await _get_redis(ctx)
        key_type = await r.type(params.key)

        if key_type == "none":
            return f"Key '{params.key}' does not exist."

        ttl = await r.ttl(params.key)
        ttl_str = "no expiry" if ttl == -1 else f"{ttl}s remaining" if ttl > 0 else "expired"
        memory = await r.memory_usage(params.key) or 0

        result = {"key": params.key, "type": key_type, "ttl": ttl_str, "memory": _format_bytes(memory)}

        if key_type == "string":
            result["value"] = await r.get(params.key)
        elif key_type == "hash":
            result["value"] = await r.hgetall(params.key)
        elif key_type == "list":
            result["value"] = await r.lrange(params.key, 0, 99)
            result["length"] = await r.llen(params.key)
        elif key_type == "set":
            result["value"] = list(await r.smembers(params.key))
            result["cardinality"] = await r.scard(params.key)
        elif key_type == "zset":
            result["value"] = await r.zrange(params.key, 0, 99, withscores=True)
            result["cardinality"] = await r.zcard(params.key)
        elif key_type == "stream":
            result["value"] = await r.xrange(params.key, count=10)
            result["length"] = await r.xlen(params.key)

        if params.response_format == ResponseFormat.JSON:
            return _safe_json(result)

        # Markdown format
        md = f"## 🔑 `{params.key}`\n"
        md += f"**Type:** {key_type} | **TTL:** {ttl_str} | **Memory:** {result['memory']}\n\n"
        md += f"**Value:**\n```json\n{_safe_json(result['value'])}\n```"
        return md

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="redis_set",
    annotations={
        "title": "Set Key-Value",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def redis_set(params: RedisSetInput, ctx=None) -> str:
    """Set a string value in Redis with optional TTL and conditional flags.

    Supports:
    - Simple SET with value
    - SET with TTL (auto-expiry)
    - SETNX (only if not exists — for distributed locks)
    - SETXX (only if exists — for updates)

    Returns:
        str: Confirmation with key details
    """
    try:
        r = await _get_redis(ctx)

        kwargs = {}
        if params.ttl_seconds:
            kwargs["ex"] = params.ttl_seconds
        if params.only_if_not_exists:
            kwargs["nx"] = True
        if params.only_if_exists:
            kwargs["xx"] = True

        result = await r.set(params.key, params.value, **kwargs)

        if result is None:
            if params.only_if_not_exists:
                return f"Key '{params.key}' already exists. SET NX did not overwrite."
            elif params.only_if_exists:
                return f"Key '{params.key}' does not exist. SET XX requires existing key."

        ttl_msg = f" (TTL: {params.ttl_seconds}s)" if params.ttl_seconds else " (no expiry)"
        return f"✅ SET `{params.key}` = `{params.value[:100]}{'...' if len(params.value) > 100 else ''}`{ttl_msg}"

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="redis_hash_set",
    annotations={
        "title": "Set Hash Fields",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def redis_hash_set(params: RedisHashInput, ctx=None) -> str:
    """Set multiple fields in a Redis Hash. Hashes are ideal for storing structured
    objects like user profiles, session data, or configuration.

    Returns:
        str: Confirmation with fields set
    """
    try:
        r = await _get_redis(ctx)
        await r.hset(params.key, mapping=params.fields)
        if params.ttl_seconds:
            await r.expire(params.key, params.ttl_seconds)

        ttl_msg = f" (TTL: {params.ttl_seconds}s)" if params.ttl_seconds else ""
        fields_preview = ", ".join(f"{k}={v[:50]}" for k, v in list(params.fields.items())[:5])
        return f"✅ HSET `{params.key}` — {len(params.fields)} fields set: {fields_preview}{ttl_msg}"

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="redis_hash_get",
    annotations={
        "title": "Get Hash Fields",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def redis_hash_get(params: RedisHashGetInput, ctx=None) -> str:
    """Get fields from a Redis Hash. Retrieve specific fields or all fields.

    Returns:
        str: Hash field-value pairs
    """
    try:
        r = await _get_redis(ctx)

        if params.fields:
            values = await r.hmget(params.key, params.fields)
            result = dict(zip(params.fields, values))
        else:
            result = await r.hgetall(params.key)

        if not result or all(v is None for v in result.values()):
            return f"Hash '{params.key}' is empty or does not exist."

        if params.response_format == ResponseFormat.JSON:
            return _safe_json({"key": params.key, "fields": result})

        md = f"## 📦 Hash: `{params.key}`\n"
        for field, value in result.items():
            md += f"- **{field}:** {value}\n"
        return md

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="redis_list_push",
    annotations={
        "title": "Push to List",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": False,
    },
)
async def redis_list_push(params: RedisListInput, ctx=None) -> str:
    """Push values to a Redis List. Use 'left' for LPUSH (stack/queue head)
    or 'right' for RPUSH (queue tail).

    Returns:
        str: Confirmation with new list length
    """
    try:
        r = await _get_redis(ctx)
        if params.direction == "left":
            length = await r.lpush(params.key, *params.values)
        else:
            length = await r.rpush(params.key, *params.values)

        if params.ttl_seconds:
            await r.expire(params.key, params.ttl_seconds)

        return f"✅ {'L' if params.direction == 'left' else 'R'}PUSH `{params.key}` — {len(params.values)} values added. List length: {length}"

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="redis_list_range",
    annotations={
        "title": "Get List Range",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def redis_list_range(params: RedisListRangeInput, ctx=None) -> str:
    """Get a range of elements from a Redis List.

    Returns:
        str: List elements within the specified range
    """
    try:
        r = await _get_redis(ctx)
        values = await r.lrange(params.key, params.start, params.stop)
        length = await r.llen(params.key)

        if params.response_format == ResponseFormat.JSON:
            return _safe_json({"key": params.key, "values": values, "total_length": length})

        md = f"## 📋 List: `{params.key}` (total: {length})\n"
        for i, v in enumerate(values):
            md += f"{params.start + i}. `{v}`\n"
        return md

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="redis_sorted_set_add",
    annotations={
        "title": "Add to Sorted Set",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def redis_sorted_set_add(params: RedisSortedSetInput, ctx=None) -> str:
    """Add members with scores to a Redis Sorted Set. Ideal for leaderboards,
    priority queues, and time-series data.

    Returns:
        str: Confirmation with members added
    """
    try:
        r = await _get_redis(ctx)
        added = await r.zadd(params.key, params.members)
        if params.ttl_seconds:
            await r.expire(params.key, params.ttl_seconds)

        total = await r.zcard(params.key)
        return f"✅ ZADD `{params.key}` — {added} new members added. Total members: {total}"

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="redis_sorted_set_range",
    annotations={
        "title": "Get Sorted Set Range",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def redis_sorted_set_range(params: RedisSortedSetRangeInput, ctx=None) -> str:
    """Get members from a Sorted Set by rank range. Supports ascending/descending order.

    Returns:
        str: Members with optional scores
    """
    try:
        r = await _get_redis(ctx)

        if params.reverse:
            values = await r.zrevrange(params.key, params.start, params.stop, withscores=params.with_scores)
        else:
            values = await r.zrange(params.key, params.start, params.stop, withscores=params.with_scores)

        total = await r.zcard(params.key)

        if params.response_format == ResponseFormat.JSON:
            return _safe_json({"key": params.key, "members": values, "total": total})

        md = f"## 🏆 Sorted Set: `{params.key}` (total: {total})\n"
        if params.with_scores:
            for rank, (member, score) in enumerate(values):
                md += f"{rank + 1}. **{member}** — score: {score}\n"
        else:
            for rank, member in enumerate(values):
                md += f"{rank + 1}. {member}\n"
        return md

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="redis_stream_add",
    annotations={
        "title": "Add to Stream",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": False,
    },
)
async def redis_stream_add(params: RedisStreamAddInput, ctx=None) -> str:
    """Add an entry to a Redis Stream. Streams are append-only logs ideal for
    event sourcing, audit trails, and message queues.

    Returns:
        str: Entry ID of the added message
    """
    try:
        r = await _get_redis(ctx)
        kwargs = {}
        if params.max_length:
            kwargs["maxlen"] = params.max_length

        entry_id = await r.xadd(params.key, params.fields, id=params.entry_id, **kwargs)
        length = await r.xlen(params.key)

        return f"✅ XADD `{params.key}` — Entry ID: {entry_id}. Stream length: {length}"

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="redis_stream_read",
    annotations={
        "title": "Read Stream Entries",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def redis_stream_read(params: RedisStreamReadInput, ctx=None) -> str:
    """Read entries from a Redis Stream within an ID range.

    Returns:
        str: Stream entries with IDs and field-value pairs
    """
    try:
        r = await _get_redis(ctx)
        entries = await r.xrange(params.key, min=params.start, max=params.end, count=params.count)
        total = await r.xlen(params.key)

        if params.response_format == ResponseFormat.JSON:
            return _safe_json({"key": params.key, "entries": entries, "total": total})

        md = f"## 📡 Stream: `{params.key}` (total: {total}, showing: {len(entries)})\n\n"
        for entry_id, fields in entries:
            md += f"**{entry_id}**\n"
            for field, value in fields.items():
                md += f"  - {field}: {value}\n"
            md += "\n"
        return md

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="redis_publish",
    annotations={
        "title": "Publish Message",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": True,
    },
)
async def redis_publish(params: RedisPubSubInput, ctx=None) -> str:
    """Publish a message to a Redis Pub/Sub channel. Subscribers listening on
    the channel will receive the message in real-time.

    Returns:
        str: Number of subscribers that received the message
    """
    try:
        r = await _get_redis(ctx)
        receivers = await r.publish(params.channel, params.message)
        return f"✅ PUBLISH `{params.channel}` — Message delivered to {receivers} subscriber(s)"

    except Exception as e:
        return _handle_error(e)


# ============================================================
# KEY MANAGEMENT TOOLS
# ============================================================

@mcp.tool(
    name="redis_scan_keys",
    annotations={
        "title": "Scan Keys by Pattern",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def redis_scan_keys(params: RedisScanInput, ctx=None) -> str:
    """Safely scan Redis keys matching a pattern using SCAN (not KEYS).
    Production-safe — never blocks the Redis server.

    Returns:
        str: List of matching keys with types and memory usage
    """
    try:
        r = await _get_redis(ctx)
        keys = []
        cursor = 0

        while len(keys) < params.count:
            cursor, batch = await r.scan(cursor=cursor, match=params.pattern, count=MAX_SCAN_COUNT)
            keys.extend(batch)
            if cursor == 0:
                break

        keys = keys[: params.count]

        # Enrich with type info
        results = []
        for key in keys:
            key_type = await r.type(key)
            if params.key_type and key_type != params.key_type:
                continue
            ttl = await r.ttl(key)
            memory = await r.memory_usage(key) or 0
            results.append({
                "key": key,
                "type": key_type,
                "ttl": ttl,
                "memory": _format_bytes(memory),
                "memory_bytes": memory,
            })

        if params.response_format == ResponseFormat.JSON:
            return _safe_json({"pattern": params.pattern, "count": len(results), "keys": results})

        md = f"## 🔍 Keys matching `{params.pattern}` ({len(results)} found)\n\n"
        md += "| Key | Type | TTL | Memory |\n|-----|------|-----|--------|\n"
        for r_item in sorted(results, key=lambda x: x["memory_bytes"], reverse=True):
            ttl_str = "∞" if r_item["ttl"] == -1 else f"{r_item['ttl']}s"
            md += f"| `{r_item['key']}` | {r_item['type']} | {ttl_str} | {r_item['memory']} |\n"
        return md

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="redis_delete",
    annotations={
        "title": "Delete Keys",
        "readOnlyHint": False,
        "destructiveHint": True,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def redis_delete(params: RedisDeleteInput, ctx=None) -> str:
    """Delete one or more Redis keys. Requires explicit confirmation (confirm=True).

    Returns:
        str: Number of keys deleted
    """
    try:
        if not params.confirm:
            return f"⚠️ Deletion requires confirmation. Set confirm=True to delete: {', '.join(params.keys)}"

        r = await _get_redis(ctx)
        deleted = await r.delete(*params.keys)
        return f"🗑️ Deleted {deleted} key(s) out of {len(params.keys)} requested."

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="redis_pipeline_execute",
    annotations={
        "title": "Execute Pipeline (Batch)",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": False,
    },
)
async def redis_pipeline_execute(params: RedisPipelineInput, ctx=None) -> str:
    """Execute multiple Redis commands in a single pipeline for maximum performance.
    10-100x faster than individual commands for batch operations.

    Returns:
        str: Results of all commands in the pipeline
    """
    try:
        r = await _get_redis(ctx)
        pipe = r.pipeline(transaction=True)

        for cmd_spec in params.commands:
            cmd = cmd_spec["cmd"].upper()
            args = cmd_spec.get("args", [])
            func = getattr(pipe, cmd.lower(), None)
            if func is None:
                return f"Error: Unknown Redis command '{cmd}'"
            func(*args)

        results = await pipe.execute()

        output = []
        for i, (cmd_spec, result) in enumerate(zip(params.commands, results)):
            output.append({
                "command": f"{cmd_spec['cmd']} {' '.join(str(a) for a in cmd_spec.get('args', []))}",
                "result": str(result),
            })

        return _safe_json({"pipeline_results": output, "total_commands": len(output)})

    except Exception as e:
        return _handle_error(e)


# ============================================================
# MONITORING & INTELLIGENCE TOOLS
# ============================================================

@mcp.tool(
    name="redis_server_info",
    annotations={
        "title": "Server Information",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def redis_server_info(params: RedisInfoInput, ctx=None) -> str:
    """Get comprehensive Redis server information including version, memory,
    clients, replication status, and keyspace statistics.

    Returns:
        str: Server info in markdown or JSON format
    """
    try:
        r = await _get_redis(ctx)

        if params.section:
            info = await r.info(params.section)
        else:
            info = await r.info()

        if params.response_format == ResponseFormat.JSON:
            return _safe_json(info)

        md = "## 🖥️ Redis Server Info\n\n"

        # Key metrics
        md += "### Core Metrics\n"
        md += f"- **Version:** {info.get('redis_version', 'N/A')}\n"
        md += f"- **Uptime:** {_format_seconds(info.get('uptime_in_seconds', 0))}\n"
        md += f"- **Connected Clients:** {info.get('connected_clients', 'N/A')}\n"
        md += f"- **Used Memory:** {_format_bytes(info.get('used_memory', 0))}\n"
        md += f"- **Peak Memory:** {_format_bytes(info.get('used_memory_peak', 0))}\n"
        md += f"- **Max Memory:** {info.get('maxmemory_human', 'unlimited')}\n"
        md += f"- **Memory Policy:** {info.get('maxmemory_policy', 'N/A')}\n"
        md += f"- **Role:** {info.get('role', 'N/A')}\n"
        md += f"- **Connected Replicas:** {info.get('connected_slaves', 0)}\n"

        # Hit rate
        hits = info.get("keyspace_hits", 0)
        misses = info.get("keyspace_misses", 0)
        total = hits + misses
        hit_rate = (hits / total * 100) if total > 0 else 0
        md += f"- **Cache Hit Rate:** {hit_rate:.1f}% ({hits:,} hits / {misses:,} misses)\n"

        # Keyspace
        keyspace = {k: v for k, v in info.items() if k.startswith("db")}
        if keyspace:
            md += "\n### Keyspace\n"
            for db, stats in keyspace.items():
                if isinstance(stats, dict):
                    md += f"- **{db}:** {stats.get('keys', 0):,} keys, {stats.get('expires', 0):,} with TTL\n"

        return md

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="redis_health_check",
    annotations={
        "title": "Comprehensive Health Check",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def redis_health_check(params: RedisHealthCheckInput, ctx=None) -> str:
    """Perform a comprehensive Redis health check with AI-powered analysis.
    Identifies issues, bottlenecks, and provides actionable recommendations.

    Checks: memory pressure, client connections, hit rate, slow queries,
    replication lag, eviction rate, and persistence status.

    Returns:
        str: Health report with severity ratings and recommendations
    """
    try:
        r = await _get_redis(ctx)
        info = await r.info()
        issues = []
        recommendations = []
        health_score = 100

        # 1. Memory Analysis
        used_mem = info.get("used_memory", 0)
        max_mem = info.get("maxmemory", 0)
        if max_mem > 0:
            mem_pct = (used_mem / max_mem) * 100
            if mem_pct > 90:
                issues.append(("🔴 CRITICAL", f"Memory at {mem_pct:.1f}% — evictions imminent"))
                recommendations.append("Increase maxmemory or optimize key storage. Consider Redis Cluster for sharding.")
                health_score -= 30
            elif mem_pct > MEMORY_ALERT_PERCENT:
                issues.append(("🟡 WARNING", f"Memory at {mem_pct:.1f}%"))
                recommendations.append("Monitor memory trend. Plan capacity increase if growing.")
                health_score -= 15
        else:
            issues.append(("🟡 WARNING", "maxmemory not set — Redis can consume all available RAM"))
            recommendations.append("Set maxmemory in production to prevent OOM kills.")
            health_score -= 10

        # 2. Cache Hit Rate
        hits = info.get("keyspace_hits", 0)
        misses = info.get("keyspace_misses", 0)
        total = hits + misses
        if total > 100:
            hit_rate = (hits / total) * 100
            if hit_rate < 50:
                issues.append(("🔴 CRITICAL", f"Cache hit rate: {hit_rate:.1f}% — cache is ineffective"))
                recommendations.append("Review key naming patterns. Ensure your app checks cache before DB.")
                health_score -= 25
            elif hit_rate < 80:
                issues.append(("🟡 WARNING", f"Cache hit rate: {hit_rate:.1f}% — below optimal"))
                recommendations.append("Analyze miss patterns. Consider pre-warming cache for hot keys.")
                health_score -= 10

        # 3. Connected Clients
        clients = info.get("connected_clients", 0)
        max_clients = info.get("maxclients", 10000)
        if max_clients > 0:
            client_pct = (clients / max_clients) * 100
            if client_pct > CONNECTION_ALERT_PERCENT:
                issues.append(("🟡 WARNING", f"Client connections at {client_pct:.1f}% ({clients}/{max_clients})"))
                recommendations.append("Implement connection pooling. Check for connection leaks.")
                health_score -= 15

        # 4. Evicted Keys
        evicted = info.get("evicted_keys", 0)
        if evicted > 0:
            issues.append(("🟡 WARNING", f"{evicted:,} keys evicted — memory pressure detected"))
            recommendations.append("Increase memory or reduce TTL values. Review which keys don't need caching.")
            health_score -= 10

        # 5. Replication Lag
        role = info.get("role", "master")
        if role == "slave":
            lag = info.get("master_repl_offset", 0) - info.get("slave_repl_offset", 0)
            if lag > 1000:
                issues.append(("🔴 CRITICAL", f"Replication lag: {lag} bytes behind master"))
                health_score -= 20

        # 6. Persistence
        rdb_status = info.get("rdb_last_bgsave_status", "ok")
        aof_enabled = info.get("aof_enabled", 0)
        if rdb_status != "ok":
            issues.append(("🔴 CRITICAL", "Last RDB save failed!"))
            health_score -= 20
        if not aof_enabled:
            recommendations.append("Enable AOF (appendonly yes) for better durability in production.")

        # 7. Slow Log
        slow_entries = []
        if params.include_slow_log:
            try:
                slow_log = await r.slowlog_get(10)
                if slow_log:
                    for entry in slow_log[:5]:
                        duration_ms = entry.get("duration", 0) / 1000
                        cmd = " ".join(str(a) for a in entry.get("command", [])[:3])
                        slow_entries.append(f"{cmd} ({duration_ms:.1f}ms)")
                    if len(slow_log) > 5:
                        issues.append(("🟡 WARNING", f"{len(slow_log)} slow queries detected"))
                        health_score -= 5
            except Exception:
                pass

        health_score = max(0, health_score)
        health_emoji = "🟢" if health_score >= 80 else "🟡" if health_score >= 50 else "🔴"

        if params.response_format == ResponseFormat.JSON:
            return _safe_json({
                "health_score": health_score,
                "status": "healthy" if health_score >= 80 else "warning" if health_score >= 50 else "critical",
                "issues": [{"severity": s, "message": m} for s, m in issues],
                "recommendations": recommendations,
                "slow_queries": slow_entries,
            })

        md = f"## {health_emoji} Redis Health Check — Score: {health_score}/100\n\n"

        if issues:
            md += "### Issues Found\n"
            for severity, message in issues:
                md += f"- {severity}: {message}\n"
            md += "\n"

        if recommendations:
            md += "### Recommendations\n"
            for i, rec in enumerate(recommendations, 1):
                md += f"{i}. {rec}\n"
            md += "\n"

        if slow_entries:
            md += "### Slow Queries (Top 5)\n"
            for entry in slow_entries:
                md += f"- `{entry}`\n"

        if not issues and not recommendations:
            md += "✅ All systems nominal. Redis is healthy!\n"

        md += f"\n**Server:** {info.get('redis_version', 'N/A')} | "
        md += f"**Uptime:** {_format_seconds(info.get('uptime_in_seconds', 0))} | "
        md += f"**Memory:** {_format_bytes(used_mem)} | "
        md += f"**Clients:** {clients}"

        return md

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="redis_key_analysis",
    annotations={
        "title": "Key Pattern & Memory Analysis",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def redis_key_analysis(params: RedisKeyAnalysisInput, ctx=None) -> str:
    """Analyze Redis keyspace to identify patterns, memory usage distribution,
    and optimization opportunities. Samples keys to build a statistical profile.

    Returns:
        str: Analysis report with key patterns, memory distribution, and optimization tips
    """
    try:
        r = await _get_redis(ctx)

        pattern_stats: Dict[str, Dict[str, Any]] = {}
        type_stats: Dict[str, int] = {}
        ttl_stats = {"with_ttl": 0, "without_ttl": 0, "expired": 0}
        total_memory = 0
        sampled = 0

        cursor = 0
        while sampled < params.sample_size:
            cursor, keys = await r.scan(cursor=cursor, count=500)
            for key in keys:
                if sampled >= params.sample_size:
                    break

                key_type = await r.type(key)
                memory = await r.memory_usage(key) or 0
                ttl = await r.ttl(key)

                # Extract pattern (replace numeric segments)
                pattern = re.sub(r':\d+', ':*', key)
                pattern = re.sub(r'\d{10,}', '*', pattern)  # timestamps

                if pattern not in pattern_stats:
                    pattern_stats[pattern] = {"count": 0, "memory": 0, "type": key_type, "sample_key": key}
                pattern_stats[pattern]["count"] += 1
                pattern_stats[pattern]["memory"] += memory

                type_stats[key_type] = type_stats.get(key_type, 0) + 1
                total_memory += memory

                if ttl > 0:
                    ttl_stats["with_ttl"] += 1
                elif ttl == -1:
                    ttl_stats["without_ttl"] += 1
                else:
                    ttl_stats["expired"] += 1

                sampled += 1

            if cursor == 0:
                break

        if params.response_format == ResponseFormat.JSON:
            return _safe_json({
                "sampled_keys": sampled,
                "total_memory": _format_bytes(total_memory),
                "patterns": sorted(pattern_stats.values(), key=lambda x: x["memory"], reverse=True),
                "type_distribution": type_stats,
                "ttl_distribution": ttl_stats,
            })

        md = f"## 📊 Key Analysis ({sampled} keys sampled)\n\n"
        md += f"**Total Memory Sampled:** {_format_bytes(total_memory)}\n\n"

        # Top patterns by memory
        md += "### Top Key Patterns (by memory)\n"
        md += "| Pattern | Count | Memory | Type |\n|---------|-------|--------|------|\n"
        sorted_patterns = sorted(pattern_stats.items(), key=lambda x: x[1]["memory"], reverse=True)
        for pattern, stats in sorted_patterns[:15]:
            md += f"| `{pattern}` | {stats['count']} | {_format_bytes(stats['memory'])} | {stats['type']} |\n"

        # Type distribution
        md += "\n### Type Distribution\n"
        for key_type, count in sorted(type_stats.items(), key=lambda x: x[1], reverse=True):
            pct = (count / sampled * 100) if sampled > 0 else 0
            md += f"- **{key_type}:** {count} ({pct:.1f}%)\n"

        # TTL distribution
        md += "\n### TTL Distribution\n"
        md += f"- **With TTL:** {ttl_stats['with_ttl']} ({ttl_stats['with_ttl'] / max(sampled, 1) * 100:.1f}%)\n"
        md += f"- **No TTL (permanent):** {ttl_stats['without_ttl']} ({ttl_stats['without_ttl'] / max(sampled, 1) * 100:.1f}%)\n"

        # Optimization tips
        if ttl_stats["without_ttl"] > sampled * 0.5:
            md += "\n### ⚠️ Optimization Alert\n"
            md += f"Over {ttl_stats['without_ttl'] / sampled * 100:.0f}% of keys have no TTL. "
            md += "This can lead to memory leaks. Consider setting TTL on cache keys.\n"

        return md

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="redis_cache_strategy",
    annotations={
        "title": "AI Cache Strategy Advisor",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def redis_cache_strategy(params: RedisCacheStrategyInput, ctx=None) -> str:
    """AI-powered cache strategy recommendation engine. Analyzes your use case
    and provides a tailored caching architecture with:
    - Recommended pattern (cache-aside, write-through, write-behind)
    - Key naming conventions
    - TTL strategies
    - Eviction policies
    - Implementation code samples

    Returns:
        str: Comprehensive caching strategy recommendation
    """
    use_case = params.use_case.lower()

    # Determine pattern based on use case analysis
    is_read_heavy = params.read_write_ratio and int(params.read_write_ratio.split(":")[0]) > 70
    is_write_heavy = params.read_write_ratio and int(params.read_write_ratio.split(":")[1]) > 40

    strategy = {
        "pattern": "cache-aside",
        "ttl_strategy": "adaptive",
        "eviction_policy": "allkeys-lru",
        "key_prefix": "cache",
    }

    # Pattern selection logic
    if any(word in use_case for word in ["trading", "price", "stock", "market", "ticker"]):
        strategy.update({
            "pattern": "cache-aside with aggressive TTL",
            "ttl_strategy": "short (1-10 seconds)",
            "eviction_policy": "allkeys-lru",
            "key_prefix": "price",
            "use_case_type": "real-time financial data",
            "notes": [
                "Use very short TTL (1-5s) for live prices",
                "Longer TTL (60-300s) for historical data",
                "Consider Sorted Sets for price rankings",
                "Use Streams for trade event logs with consumer groups",
                "Implement cache stampede prevention with distributed locks",
            ],
        })
    elif any(word in use_case for word in ["session", "auth", "login", "user"]):
        strategy.update({
            "pattern": "write-through",
            "ttl_strategy": "match session timeout (30-60 min)",
            "eviction_policy": "volatile-lru",
            "key_prefix": "sess",
            "use_case_type": "session management",
            "notes": [
                "Use Hashes to store session data (fields are independently accessible)",
                "Set TTL equal to your session timeout",
                "Use SETNX for distributed session locks",
                "Consider keyspace notifications for session expiry events",
            ],
        })
    elif any(word in use_case for word in ["api", "response", "endpoint", "rest", "graphql"]):
        strategy.update({
            "pattern": "cache-aside",
            "ttl_strategy": "variable by endpoint (30s-1h)",
            "eviction_policy": "allkeys-lru",
            "key_prefix": "api",
            "use_case_type": "API response caching",
            "notes": [
                "Hash request params to create unique cache keys",
                "Use different TTLs per endpoint based on data freshness needs",
                "Implement cache warming for frequently accessed endpoints",
                "Add jitter to TTL to prevent cache stampede",
            ],
        })
    elif any(word in use_case for word in ["queue", "job", "worker", "task", "background"]):
        strategy.update({
            "pattern": "Streams with Consumer Groups",
            "ttl_strategy": "stream maxlen for auto-trimming",
            "eviction_policy": "noeviction",
            "key_prefix": "queue",
            "use_case_type": "job/task queue",
            "notes": [
                "Use XADD with MAXLEN for bounded queues",
                "Consumer Groups for parallel processing with acknowledgment",
                "XAUTOCLAIM for recovering stale/failed jobs",
                "Separate streams per job type for isolation",
            ],
        })
    elif any(word in use_case for word in ["leaderboard", "ranking", "score", "top"]):
        strategy.update({
            "pattern": "write-through with Sorted Sets",
            "ttl_strategy": "periodic rebuild (1-24h depending on use case)",
            "eviction_policy": "allkeys-lru",
            "key_prefix": "rank",
            "use_case_type": "leaderboard/ranking",
            "notes": [
                "Sorted Sets give O(log N) insert and O(log N + M) range queries",
                "Use ZINCRBY for atomic score updates",
                "ZREVRANGE for top-N queries",
                "Consider separate leaderboards per time window (daily, weekly, all-time)",
            ],
        })
    else:
        strategy.update({
            "use_case_type": "general caching",
            "notes": [
                "Start with cache-aside pattern — most flexible",
                "Set TTL on ALL cache keys to prevent memory leaks",
                "Use allkeys-lru eviction for pure cache use cases",
                "Monitor hit rate — below 80% means the cache needs tuning",
            ],
        })

    # Adjust for consistency requirements
    if params.consistency_requirement == "strong":
        strategy["pattern"] = "write-through"
        strategy["notes"].insert(0, "⚠️ Strong consistency: Write to cache AND database synchronously")
    elif params.consistency_requirement == "none":
        strategy["notes"].insert(0, "Fire-and-forget cache — acceptable to serve stale data")

    if params.response_format == ResponseFormat.JSON:
        return _safe_json(strategy)

    md = f"## 🧠 AI Cache Strategy: {strategy['use_case_type']}\n\n"
    md += f"**Recommended Pattern:** {strategy['pattern']}\n"
    md += f"**TTL Strategy:** {strategy['ttl_strategy']}\n"
    md += f"**Eviction Policy:** {strategy['eviction_policy']}\n"
    md += f"**Key Prefix:** `{strategy['key_prefix']}:`\n"
    md += f"**Consistency:** {params.consistency_requirement}\n\n"

    md += "### Implementation Notes\n"
    for note in strategy.get("notes", []):
        md += f"- {note}\n"

    md += f"\n### Key Naming Convention\n"
    md += f"```\n{strategy['key_prefix']}:{{entity}}:{{id}}\n"
    md += f"Example: {strategy['key_prefix']}:user:1001\n```\n"

    return md


# ============================================================
# MULTI-TENANT OPERATIONS
# ============================================================

@mcp.tool(
    name="redis_tenant_ops",
    annotations={
        "title": "Multi-Tenant Operations",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def redis_tenant_ops(params: RedisMultiTenantInput, ctx=None) -> str:
    """Multi-tenant Redis operations for SaaS platforms. Manages per-tenant
    key isolation, usage tracking, and resource limits.

    Supports: stats, keys, usage, isolate, cleanup

    Returns:
        str: Tenant operation results
    """
    try:
        r = await _get_redis(ctx)
        tenant_prefix = f"tenant:{params.tenant_id}:"

        if params.action == "stats":
            cursor = 0
            key_count = 0
            total_memory = 0
            type_counts: Dict[str, int] = {}

            while True:
                cursor, keys = await r.scan(cursor=cursor, match=f"{tenant_prefix}*", count=500)
                for key in keys:
                    key_count += 1
                    mem = await r.memory_usage(key) or 0
                    total_memory += mem
                    ktype = await r.type(key)
                    type_counts[ktype] = type_counts.get(ktype, 0) + 1
                if cursor == 0:
                    break

            result = {
                "tenant_id": params.tenant_id,
                "total_keys": key_count,
                "total_memory": _format_bytes(total_memory),
                "type_distribution": type_counts,
            }

            if params.response_format == ResponseFormat.JSON:
                return _safe_json(result)

            md = f"## 🏢 Tenant: `{params.tenant_id}`\n\n"
            md += f"- **Total Keys:** {key_count:,}\n"
            md += f"- **Memory Used:** {_format_bytes(total_memory)}\n"
            for t, c in type_counts.items():
                md += f"- **{t}:** {c} keys\n"
            return md

        elif params.action == "keys":
            cursor = 0
            keys = []
            while len(keys) < 50:
                cursor, batch = await r.scan(cursor=cursor, match=f"{tenant_prefix}*", count=200)
                keys.extend(batch)
                if cursor == 0:
                    break

            if params.response_format == ResponseFormat.JSON:
                return _safe_json({"tenant_id": params.tenant_id, "keys": keys[:50]})

            md = f"## 🔑 Tenant Keys: `{params.tenant_id}` (showing up to 50)\n\n"
            for key in keys[:50]:
                md += f"- `{key}`\n"
            return md

        elif params.action == "usage":
            # Track usage metrics
            now = int(time.time())
            usage_key = f"tenant:{params.tenant_id}:usage"
            await r.hincrby(usage_key, "api_calls", 1)
            await r.hset(usage_key, "last_access", str(now))
            usage = await r.hgetall(usage_key)
            return _safe_json({"tenant_id": params.tenant_id, "usage": usage})

        elif params.action == "isolate":
            # Set per-tenant limits metadata
            limits_key = f"tenant:{params.tenant_id}:limits"
            await r.hset(limits_key, mapping={
                "max_keys": "10000",
                "max_memory_mb": "256",
                "rate_limit_per_sec": "100",
                "created_at": str(int(time.time())),
            })
            return f"✅ Tenant `{params.tenant_id}` isolation limits configured."

        elif params.action == "cleanup":
            cursor = 0
            deleted = 0
            while True:
                cursor, keys = await r.scan(cursor=cursor, match=f"{tenant_prefix}*", count=500)
                if keys:
                    deleted += await r.delete(*keys)
                if cursor == 0:
                    break
            return f"🗑️ Tenant `{params.tenant_id}` cleanup: {deleted} keys deleted."

        return f"Unknown action: {params.action}"

    except Exception as e:
        return _handle_error(e)


# ============================================================
# ENTRYPOINT
# ============================================================

if __name__ == "__main__":
    import sys

    transport = "stdio"
    port = 8000

    for arg in sys.argv[1:]:
        if arg == "--http":
            transport = "streamable_http"
        elif arg.startswith("--port="):
            port = int(arg.split("=")[1])

    if transport == "streamable_http":
        mcp.run(transport="streamable_http", port=port)
    else:
        mcp.run()
