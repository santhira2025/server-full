"""
RabbitNexus MCP Server — Enterprise-Grade RabbitMQ Operations Intelligence
==========================================================================
The world's first AI-native RabbitMQ MCP server that enables LLMs to:
- Manage queues, exchanges, bindings, and vhosts
- Publish and consume messages
- Monitor cluster health with AI-powered analysis
- Multi-tenant vhost isolation for SaaS
- Intelligent routing strategy recommendations
- Dead letter queue management & recovery

Uses RabbitMQ Management HTTP API (port 15672) + AMQP (port 5672)

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
import base64

# ============================================================
# CONSTANTS
# ============================================================
DEFAULT_RABBITMQ_HOST = "localhost"
DEFAULT_MANAGEMENT_PORT = 15672
DEFAULT_AMQP_PORT = 5672
DEFAULT_USER = "guest"
DEFAULT_PASSWORD = "guest"
DEFAULT_VHOST = "/"

EXCHANGE_TYPES = {"direct", "fanout", "topic", "headers"}
QUEUE_DANGEROUS_OPS = {"purge", "delete"}

# ============================================================
# LIFESPAN — Persistent HTTP Client for Management API
# ============================================================
@asynccontextmanager
async def rabbitmq_lifespan():
    """Manage RabbitMQ Management API client lifecycle."""
    import httpx

    base_url = f"http://{DEFAULT_RABBITMQ_HOST}:{DEFAULT_MANAGEMENT_PORT}/api"
    auth = (DEFAULT_USER, DEFAULT_PASSWORD)

    client = httpx.AsyncClient(
        base_url=base_url,
        auth=auth,
        timeout=10.0,
        headers={"Content-Type": "application/json"},
    )

    try:
        # Test connection
        resp = await client.get("/overview")
        resp.raise_for_status()
        yield {"http": client, "base_url": base_url}
    finally:
        await client.aclose()


# ============================================================
# MCP SERVER
# ============================================================
mcp = FastMCP("rabbitmq_nexus_mcp", lifespan=rabbitmq_lifespan)


# ============================================================
# SHARED UTILITIES
# ============================================================
def _format_bytes(num_bytes: int) -> str:
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if abs(num_bytes) < 1024.0:
            return f"{num_bytes:.2f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.2f} PB"


def _format_rate(rate: float) -> str:
    if rate < 1:
        return f"{rate:.2f}/s"
    elif rate < 1000:
        return f"{rate:.0f}/s"
    else:
        return f"{rate / 1000:.1f}K/s"


def _safe_json(data: Any) -> str:
    try:
        return json.dumps(data, indent=2, default=str)
    except (TypeError, ValueError) as e:
        return json.dumps({"error": f"Serialization failed: {str(e)}"})


def _encode_vhost(vhost: str) -> str:
    """URL-encode vhost (/ → %2F)."""
    if vhost == "/":
        return "%2F"
    return vhost.replace("/", "%2F")


async def _get_http(ctx):
    return ctx.request_context.lifespan_state["http"]


def _handle_error(e: Exception) -> str:
    error_type = type(e).__name__
    if "ConnectError" in error_type:
        return f"Error: Cannot connect to RabbitMQ Management API. Check if RabbitMQ is running and management plugin is enabled (rabbitmq-plugins enable rabbitmq_management). Details: {str(e)}"
    elif "HTTPStatusError" in error_type:
        status = getattr(getattr(e, "response", None), "status_code", "unknown")
        body = getattr(getattr(e, "response", None), "text", "")
        if status == 401:
            return "Error: Authentication failed. Check RabbitMQ username/password."
        elif status == 404:
            return f"Error: Resource not found. The queue, exchange, or vhost may not exist. Details: {body}"
        elif status == 405:
            return f"Error: Operation not allowed. Check permissions. Details: {body}"
        return f"Error: RabbitMQ API returned status {status}. Details: {body}"
    elif "TimeoutException" in error_type:
        return "Error: Request timed out. RabbitMQ may be overloaded."
    return f"Error: {error_type} — {str(e)}"


# ============================================================
# RESPONSE FORMAT
# ============================================================
class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"


# ============================================================
# INPUT MODELS
# ============================================================

# --- Queue Operations ---
class RmqQueueCreateInput(BaseModel):
    """Create a new RabbitMQ queue."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(..., description="Queue name (e.g., 'orders.processing', 'alerts.critical')", min_length=1, max_length=255)
    vhost: str = Field(default="/", description="Virtual host (default: /)")
    durable: bool = Field(default=True, description="Survive broker restart (True for production)")
    auto_delete: bool = Field(default=False, description="Delete when last consumer disconnects")
    arguments: Optional[Dict[str, Any]] = Field(default=None, description="Extra args: x-message-ttl, x-max-length, x-dead-letter-exchange, x-queue-type (quorum/stream)")


class RmqQueueListInput(BaseModel):
    """List queues."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    vhost: Optional[str] = Field(default=None, description="Filter by vhost (None = all vhosts)")
    name_filter: Optional[str] = Field(default=None, description="Filter by name pattern (e.g., 'orders.*')")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)


class RmqQueueInfoInput(BaseModel):
    """Get detailed queue info."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(..., description="Queue name", min_length=1)
    vhost: str = Field(default="/", description="Virtual host")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)


class RmqQueueDeleteInput(BaseModel):
    """Delete or purge a queue."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(..., description="Queue name", min_length=1)
    vhost: str = Field(default="/")
    action: Literal["delete", "purge"] = Field(default="delete", description="'delete' removes queue entirely, 'purge' empties messages only")
    confirm: bool = Field(default=False, description="Must be True to confirm destructive action")


# --- Exchange Operations ---
class RmqExchangeCreateInput(BaseModel):
    """Create a new exchange."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(..., description="Exchange name (e.g., 'orders.events', 'notifications')", min_length=1, max_length=255)
    exchange_type: Literal["direct", "fanout", "topic", "headers"] = Field(default="topic", description="Exchange type: direct (exact key match), fanout (broadcast to all), topic (pattern match), headers (header match)")
    vhost: str = Field(default="/")
    durable: bool = Field(default=True, description="Survive broker restart")
    auto_delete: bool = Field(default=False)
    arguments: Optional[Dict[str, Any]] = Field(default=None, description="Extra args: alternate-exchange, etc.")


class RmqExchangeListInput(BaseModel):
    """List exchanges."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    vhost: Optional[str] = Field(default=None)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)


# --- Binding Operations ---
class RmqBindingCreateInput(BaseModel):
    """Create a binding between exchange and queue."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    source_exchange: str = Field(..., description="Source exchange name", min_length=1)
    destination: str = Field(..., description="Destination queue or exchange name", min_length=1)
    routing_key: str = Field(default="", description="Routing key pattern (e.g., 'order.created', 'alert.#', '*.critical')")
    destination_type: Literal["queue", "exchange"] = Field(default="queue")
    vhost: str = Field(default="/")
    arguments: Optional[Dict[str, Any]] = Field(default=None, description="Headers for headers exchange type")


class RmqBindingListInput(BaseModel):
    """List bindings."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    queue: Optional[str] = Field(default=None, description="Filter bindings for specific queue")
    exchange: Optional[str] = Field(default=None, description="Filter bindings for specific exchange")
    vhost: str = Field(default="/")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)


# --- Message Operations ---
class RmqPublishInput(BaseModel):
    """Publish a message to an exchange."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    exchange: str = Field(default="", description="Exchange name (empty string = default exchange, routes by queue name)")
    routing_key: str = Field(..., description="Routing key (for default exchange, this is the queue name)", min_length=1)
    payload: str = Field(..., description="Message body (string or JSON)", max_length=1048576)
    vhost: str = Field(default="/")
    content_type: str = Field(default="application/json", description="Content type header")
    headers: Optional[Dict[str, str]] = Field(default=None, description="Custom message headers")
    priority: Optional[int] = Field(default=None, description="Message priority (0-9)", ge=0, le=9)
    persistent: bool = Field(default=True, description="Message survives broker restart (delivery_mode=2)")
    expiration: Optional[str] = Field(default=None, description="Per-message TTL in milliseconds (e.g., '60000' = 1 min)")


class RmqConsumeInput(BaseModel):
    """Get messages from a queue (non-destructive peek or consume)."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    queue: str = Field(..., description="Queue name", min_length=1)
    vhost: str = Field(default="/")
    count: int = Field(default=1, description="Number of messages to get", ge=1, le=100)
    ack_mode: Literal["ack_requeue_true", "ack_requeue_false", "reject_requeue_true"] = Field(
        default="ack_requeue_true",
        description="ack_requeue_true = peek (put back), ack_requeue_false = consume (remove), reject_requeue_true = reject and requeue"
    )
    encoding: Literal["auto", "base64"] = Field(default="auto")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)


# --- Vhost Operations (Multi-Tenant) ---
class RmqVhostInput(BaseModel):
    """Manage virtual hosts (multi-tenant isolation)."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(..., description="Vhost name (e.g., 'finspot', 'linkedeye')", min_length=1, max_length=128)
    action: Literal["create", "delete", "info", "permissions"] = Field(..., description="Action to perform")
    description: Optional[str] = Field(default=None, description="Vhost description (for create)")
    confirm: bool = Field(default=False, description="Required for delete")


class RmqVhostListInput(BaseModel):
    """List virtual hosts."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)


# --- Monitoring ---
class RmqHealthCheckInput(BaseModel):
    """Comprehensive health check."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    include_queue_details: bool = Field(default=True, description="Include per-queue metrics")
    include_connection_details: bool = Field(default=True, description="Include connection info")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)


class RmqOverviewInput(BaseModel):
    """Server overview and stats."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)


# --- Dead Letter Management ---
class RmqDeadLetterInput(BaseModel):
    """Manage dead letter queues."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    source_queue: str = Field(..., description="Original queue name (DLQ will be {name}.dlq)", min_length=1)
    vhost: str = Field(default="/")
    action: Literal["setup", "inspect", "replay", "purge"] = Field(
        ..., description="setup = create DLQ infrastructure, inspect = view dead letters, replay = move back to original queue, purge = clear DLQ"
    )
    replay_count: Optional[int] = Field(default=None, description="Number of messages to replay (for replay action)", ge=1, le=1000)
    confirm: bool = Field(default=False, description="Required for purge")


# --- Routing Strategy Advisor ---
class RmqRoutingStrategyInput(BaseModel):
    """AI-powered routing strategy advisor."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    use_case: str = Field(..., description="Describe your messaging use case (e.g., 'order processing with multiple payment providers')")
    message_volume: Optional[str] = Field(default=None, description="Approximate messages/second (e.g., '100/s', '10K/s')")
    consumers: Optional[int] = Field(default=None, description="Number of consumer applications")
    reliability: Literal["at-most-once", "at-least-once", "exactly-once"] = Field(
        default="at-least-once", description="Delivery guarantee level"
    )
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)


# --- Policy Management ---
class RmqPolicyInput(BaseModel):
    """Create or manage policies."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(..., description="Policy name", min_length=1)
    vhost: str = Field(default="/")
    pattern: str = Field(default=".*", description="Queue/exchange name regex pattern")
    definition: Dict[str, Any] = Field(..., description="Policy definition (e.g., {'ha-mode': 'all', 'message-ttl': 86400000})")
    apply_to: Literal["queues", "exchanges", "all"] = Field(default="queues")
    priority: int = Field(default=0, description="Policy priority (higher wins)", ge=0, le=999)


class RmqPolicyListInput(BaseModel):
    """List policies."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    vhost: Optional[str] = Field(default=None)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)


# ============================================================
# QUEUE TOOLS
# ============================================================

@mcp.tool(
    name="rmq_queue_create",
    annotations={"title": "Create Queue", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
)
async def rmq_queue_create(params: RmqQueueCreateInput, ctx=None) -> str:
    """Create a new RabbitMQ queue with configurable durability, TTL, max-length,
    dead letter exchange, and queue type (classic, quorum, or stream).

    Returns:
        str: Confirmation with queue details
    """
    try:
        http = await _get_http(ctx)
        body = {
            "durable": params.durable,
            "auto_delete": params.auto_delete,
        }
        if params.arguments:
            body["arguments"] = params.arguments

        vhost = _encode_vhost(params.vhost)
        resp = await http.put(f"/queues/{vhost}/{params.name}", json=body)
        resp.raise_for_status()

        # Describe what was created
        args_desc = ""
        if params.arguments:
            if "x-message-ttl" in params.arguments:
                args_desc += f" TTL: {params.arguments['x-message-ttl']}ms."
            if "x-max-length" in params.arguments:
                args_desc += f" Max length: {params.arguments['x-max-length']}."
            if "x-dead-letter-exchange" in params.arguments:
                args_desc += f" DLX: {params.arguments['x-dead-letter-exchange']}."
            if "x-queue-type" in params.arguments:
                args_desc += f" Type: {params.arguments['x-queue-type']}."

        return f"✅ Queue `{params.name}` created in vhost `{params.vhost}`. Durable: {params.durable}.{args_desc}"

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="rmq_queue_list",
    annotations={"title": "List Queues", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
)
async def rmq_queue_list(params: RmqQueueListInput, ctx=None) -> str:
    """List all queues with message counts, consumer counts, and rates.
    Optionally filter by vhost or name pattern.

    Returns:
        str: Queue listing with key metrics
    """
    try:
        http = await _get_http(ctx)
        if params.vhost:
            vhost = _encode_vhost(params.vhost)
            resp = await http.get(f"/queues/{vhost}")
        else:
            resp = await http.get("/queues")
        resp.raise_for_status()
        queues = resp.json()

        if params.name_filter:
            import re
            pattern = params.name_filter.replace(".", r"\.").replace("*", ".*")
            queues = [q for q in queues if re.search(pattern, q.get("name", ""))]

        if params.response_format == ResponseFormat.JSON:
            return _safe_json([{
                "name": q.get("name"), "vhost": q.get("vhost"),
                "messages": q.get("messages", 0), "consumers": q.get("consumers", 0),
                "state": q.get("state"), "type": q.get("type", "classic"),
                "memory": q.get("memory", 0),
            } for q in queues])

        if not queues:
            return "No queues found."

        md = f"## 📋 Queues ({len(queues)} total)\n\n"
        md += "| Queue | Msgs | Ready | Unacked | Consumers | State | Type |\n"
        md += "|-------|------|-------|---------|-----------|-------|------|\n"
        for q in sorted(queues, key=lambda x: x.get("messages", 0), reverse=True):
            state_emoji = "🟢" if q.get("state") == "running" else "🔴"
            md += f"| `{q.get('name')}` | {q.get('messages', 0):,} | {q.get('messages_ready', 0):,} | {q.get('messages_unacknowledged', 0):,} | {q.get('consumers', 0)} | {state_emoji} {q.get('state', 'unknown')} | {q.get('type', 'classic')} |\n"
        return md

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="rmq_queue_info",
    annotations={"title": "Queue Details", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
)
async def rmq_queue_info(params: RmqQueueInfoInput, ctx=None) -> str:
    """Get detailed information about a specific queue including message rates,
    memory usage, consumer details, arguments, and policy.

    Returns:
        str: Comprehensive queue info
    """
    try:
        http = await _get_http(ctx)
        vhost = _encode_vhost(params.vhost)
        resp = await http.get(f"/queues/{vhost}/{params.name}")
        resp.raise_for_status()
        q = resp.json()

        if params.response_format == ResponseFormat.JSON:
            return _safe_json(q)

        md = f"## 📦 Queue: `{q.get('name')}`\n\n"
        md += f"**Vhost:** {q.get('vhost')} | **State:** {q.get('state')} | **Type:** {q.get('type', 'classic')}\n\n"

        md += "### Messages\n"
        md += f"- **Total:** {q.get('messages', 0):,}\n"
        md += f"- **Ready:** {q.get('messages_ready', 0):,} (waiting for consumer)\n"
        md += f"- **Unacked:** {q.get('messages_unacknowledged', 0):,} (delivered, not confirmed)\n"

        rates = q.get("message_stats", {})
        if rates:
            pub_rate = rates.get("publish_details", {}).get("rate", 0)
            deliver_rate = rates.get("deliver_get_details", {}).get("rate", 0)
            ack_rate = rates.get("ack_details", {}).get("rate", 0)
            md += f"- **Publish Rate:** {_format_rate(pub_rate)}\n"
            md += f"- **Deliver Rate:** {_format_rate(deliver_rate)}\n"
            md += f"- **Ack Rate:** {_format_rate(ack_rate)}\n"

        md += f"\n### Configuration\n"
        md += f"- **Durable:** {q.get('durable', False)}\n"
        md += f"- **Auto-delete:** {q.get('auto_delete', False)}\n"
        md += f"- **Consumers:** {q.get('consumers', 0)}\n"
        md += f"- **Memory:** {_format_bytes(q.get('memory', 0))}\n"
        md += f"- **Policy:** {q.get('policy', 'none')}\n"

        args = q.get("arguments", {})
        if args:
            md += "\n### Arguments\n"
            for k, v in args.items():
                md += f"- **{k}:** {v}\n"

        return md

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="rmq_queue_delete",
    annotations={"title": "Delete/Purge Queue", "readOnlyHint": False, "destructiveHint": True, "idempotentHint": True, "openWorldHint": False},
)
async def rmq_queue_delete(params: RmqQueueDeleteInput, ctx=None) -> str:
    """Delete a queue entirely or purge all its messages. Requires confirmation.

    Returns:
        str: Confirmation of action
    """
    try:
        if not params.confirm:
            return f"⚠️ {params.action.upper()} requires confirmation. Set confirm=True to {params.action} queue `{params.name}`."

        http = await _get_http(ctx)
        vhost = _encode_vhost(params.vhost)

        if params.action == "purge":
            resp = await http.delete(f"/queues/{vhost}/{params.name}/contents")
            resp.raise_for_status()
            return f"🗑️ Queue `{params.name}` purged — all messages removed."
        else:
            resp = await http.delete(f"/queues/{vhost}/{params.name}")
            resp.raise_for_status()
            return f"🗑️ Queue `{params.name}` deleted from vhost `{params.vhost}`."

    except Exception as e:
        return _handle_error(e)


# ============================================================
# EXCHANGE TOOLS
# ============================================================

@mcp.tool(
    name="rmq_exchange_create",
    annotations={"title": "Create Exchange", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
)
async def rmq_exchange_create(params: RmqExchangeCreateInput, ctx=None) -> str:
    """Create a new exchange. Types: direct (exact routing key match), fanout (broadcast),
    topic (pattern match with * and #), headers (match on headers).

    Returns:
        str: Confirmation with exchange details
    """
    try:
        http = await _get_http(ctx)
        body = {
            "type": params.exchange_type,
            "durable": params.durable,
            "auto_delete": params.auto_delete,
        }
        if params.arguments:
            body["arguments"] = params.arguments

        vhost = _encode_vhost(params.vhost)
        resp = await http.put(f"/exchanges/{vhost}/{params.name}", json=body)
        resp.raise_for_status()

        type_desc = {
            "direct": "exact routing key match",
            "fanout": "broadcasts to ALL bound queues",
            "topic": "pattern match (* = one word, # = zero or more)",
            "headers": "matches on message headers",
        }

        return f"✅ Exchange `{params.name}` created. Type: **{params.exchange_type}** ({type_desc[params.exchange_type]}). Durable: {params.durable}."

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="rmq_exchange_list",
    annotations={"title": "List Exchanges", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
)
async def rmq_exchange_list(params: RmqExchangeListInput, ctx=None) -> str:
    """List all exchanges with type, durability, and binding count.

    Returns:
        str: Exchange listing
    """
    try:
        http = await _get_http(ctx)
        if params.vhost:
            vhost = _encode_vhost(params.vhost)
            resp = await http.get(f"/exchanges/{vhost}")
        else:
            resp = await http.get("/exchanges")
        resp.raise_for_status()
        exchanges = resp.json()

        # Filter out default AMQP exchanges for cleaner output
        user_exchanges = [e for e in exchanges if e.get("name") and not e["name"].startswith("amq.")]

        if params.response_format == ResponseFormat.JSON:
            return _safe_json(user_exchanges)

        md = f"## 🔀 Exchanges ({len(user_exchanges)} user-defined)\n\n"
        md += "| Exchange | Type | Durable | Vhost |\n"
        md += "|----------|------|---------|-------|\n"
        for e in user_exchanges:
            md += f"| `{e.get('name')}` | {e.get('type')} | {'✅' if e.get('durable') else '❌'} | {e.get('vhost')} |\n"

        # Also mention built-in exchanges
        builtin = [e for e in exchanges if e.get("name", "").startswith("amq.") or e.get("name") == ""]
        md += f"\n*Plus {len(builtin)} built-in exchanges (amq.direct, amq.fanout, amq.topic, amq.headers, default)*"
        return md

    except Exception as e:
        return _handle_error(e)


# ============================================================
# BINDING TOOLS
# ============================================================

@mcp.tool(
    name="rmq_binding_create",
    annotations={"title": "Create Binding", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
)
async def rmq_binding_create(params: RmqBindingCreateInput, ctx=None) -> str:
    """Create a binding between an exchange and a queue (or another exchange).
    The routing key determines which messages flow through this binding.

    For topic exchanges:  'order.*' matches 'order.created', 'order.#' matches 'order.payment.failed'
    For direct exchanges: exact match only
    For fanout exchanges: routing key is ignored

    Returns:
        str: Confirmation with binding details
    """
    try:
        http = await _get_http(ctx)
        vhost = _encode_vhost(params.vhost)

        body = {"routing_key": params.routing_key}
        if params.arguments:
            body["arguments"] = params.arguments

        if params.destination_type == "queue":
            endpoint = f"/bindings/{vhost}/e/{params.source_exchange}/q/{params.destination}"
        else:
            endpoint = f"/bindings/{vhost}/e/{params.source_exchange}/e/{params.destination}"

        resp = await http.post(endpoint, json=body)
        resp.raise_for_status()

        return f"✅ Binding created: `{params.source_exchange}` → `{params.destination}` (routing_key: `{params.routing_key or '<empty>'}`)"

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="rmq_binding_list",
    annotations={"title": "List Bindings", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
)
async def rmq_binding_list(params: RmqBindingListInput, ctx=None) -> str:
    """List all bindings, optionally filtered by queue or exchange.

    Returns:
        str: Binding listing showing message flow paths
    """
    try:
        http = await _get_http(ctx)
        vhost = _encode_vhost(params.vhost)

        if params.queue:
            resp = await http.get(f"/queues/{vhost}/{params.queue}/bindings")
        elif params.exchange:
            resp = await http.get(f"/exchanges/{vhost}/{params.exchange}/bindings/source")
        else:
            resp = await http.get(f"/bindings/{vhost}")
        resp.raise_for_status()
        bindings = resp.json()

        if params.response_format == ResponseFormat.JSON:
            return _safe_json(bindings)

        md = f"## 🔗 Bindings ({len(bindings)} total)\n\n"
        for b in bindings:
            src = b.get("source") or "(default)"
            dst = b.get("destination")
            rk = b.get("routing_key") or "(none)"
            md += f"- `{src}` → `{dst}` | routing_key: `{rk}`\n"
        return md

    except Exception as e:
        return _handle_error(e)


# ============================================================
# MESSAGE TOOLS
# ============================================================

@mcp.tool(
    name="rmq_publish",
    annotations={"title": "Publish Message", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": True},
)
async def rmq_publish(params: RmqPublishInput, ctx=None) -> str:
    """Publish a message to an exchange with routing key. The exchange routes
    the message to bound queues based on exchange type and routing key.

    To send directly to a queue, use exchange="" and routing_key="queue_name".

    Returns:
        str: Confirmation with routing info
    """
    try:
        http = await _get_http(ctx)
        vhost = _encode_vhost(params.vhost)

        properties = {
            "content_type": params.content_type,
            "delivery_mode": 2 if params.persistent else 1,
        }
        if params.headers:
            properties["headers"] = params.headers
        if params.priority is not None:
            properties["priority"] = params.priority
        if params.expiration:
            properties["expiration"] = params.expiration

        body = {
            "routing_key": params.routing_key,
            "payload": params.payload,
            "payload_encoding": "string",
            "properties": properties,
        }

        exchange_name = params.exchange if params.exchange else "amq.default"
        resp = await http.post(f"/exchanges/{vhost}/{params.exchange or 'amq.default'}/publish", json=body)
        resp.raise_for_status()
        result = resp.json()

        routed = result.get("routed", False)
        if routed:
            return f"✅ Message published → exchange `{params.exchange or '(default)'}` → routing_key `{params.routing_key}`. Routed: ✅. Persistent: {params.persistent}."
        else:
            return f"⚠️ Message published but NOT ROUTED. No queue is bound with routing key `{params.routing_key}` on exchange `{params.exchange or '(default)'}`. Check bindings."

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="rmq_consume",
    annotations={"title": "Get Messages", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False},
)
async def rmq_consume(params: RmqConsumeInput, ctx=None) -> str:
    """Get messages from a queue. Can peek (requeue) or consume (remove).

    ack_requeue_true = peek (message stays in queue)
    ack_requeue_false = consume (message removed permanently)
    reject_requeue_true = reject and put back

    Returns:
        str: Messages with payload, headers, and routing info
    """
    try:
        http = await _get_http(ctx)
        vhost = _encode_vhost(params.vhost)

        body = {
            "count": params.count,
            "ackmode": params.ack_mode,
            "encoding": params.encoding,
        }

        resp = await http.post(f"/queues/{vhost}/{params.queue}/get", json=body)
        resp.raise_for_status()
        messages = resp.json()

        if not messages:
            return f"Queue `{params.queue}` is empty — no messages available."

        if params.response_format == ResponseFormat.JSON:
            return _safe_json(messages)

        action = "Peeked" if params.ack_mode == "ack_requeue_true" else "Consumed"
        md = f"## 📨 {action} {len(messages)} message(s) from `{params.queue}`\n\n"
        for i, msg in enumerate(messages):
            md += f"### Message {i + 1}\n"
            md += f"- **Exchange:** {msg.get('exchange') or '(default)'}\n"
            md += f"- **Routing Key:** {msg.get('routing_key')}\n"
            md += f"- **Redelivered:** {msg.get('redelivered', False)}\n"

            props = msg.get("properties", {})
            if props.get("headers"):
                md += f"- **Headers:** {_safe_json(props['headers'])}\n"
            if props.get("priority"):
                md += f"- **Priority:** {props['priority']}\n"

            payload = msg.get("payload", "")
            md += f"- **Payload:**\n```json\n{payload}\n```\n\n"
        return md

    except Exception as e:
        return _handle_error(e)


# ============================================================
# VHOST TOOLS (MULTI-TENANT)
# ============================================================

@mcp.tool(
    name="rmq_vhost_manage",
    annotations={"title": "Manage Virtual Hosts", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
)
async def rmq_vhost_manage(params: RmqVhostInput, ctx=None) -> str:
    """Manage RabbitMQ virtual hosts for multi-tenant isolation.
    Each vhost has its own set of queues, exchanges, bindings, and permissions.

    Returns:
        str: Vhost operation result
    """
    try:
        http = await _get_http(ctx)
        vhost = _encode_vhost(params.name)

        if params.action == "create":
            body = {}
            if params.description:
                body["description"] = params.description
            resp = await http.put(f"/vhosts/{vhost}", json=body)
            resp.raise_for_status()

            # Grant default user permissions
            perm_body = {"configure": ".*", "write": ".*", "read": ".*"}
            await http.put(f"/permissions/{vhost}/{DEFAULT_USER}", json=perm_body)

            return f"✅ Vhost `{params.name}` created with full permissions for user `{DEFAULT_USER}`."

        elif params.action == "delete":
            if not params.confirm:
                return f"⚠️ Delete vhost `{params.name}` requires confirm=True. This removes ALL queues, exchanges, and data in this vhost!"
            resp = await http.delete(f"/vhosts/{vhost}")
            resp.raise_for_status()
            return f"🗑️ Vhost `{params.name}` deleted with all its queues, exchanges, and bindings."

        elif params.action == "info":
            resp = await http.get(f"/vhosts/{vhost}")
            resp.raise_for_status()
            info = resp.json()
            md = f"## 🏢 Vhost: `{params.name}`\n\n"
            md += f"- **Messages:** {info.get('messages', 0):,}\n"
            md += f"- **Recv Rate:** {_format_rate(info.get('recv_oct_details', {}).get('rate', 0))}\n"
            md += f"- **Send Rate:** {_format_rate(info.get('send_oct_details', {}).get('rate', 0))}\n"
            return md

        elif params.action == "permissions":
            resp = await http.get(f"/vhosts/{vhost}/permissions")
            resp.raise_for_status()
            perms = resp.json()
            md = f"## 🔐 Permissions for vhost `{params.name}`\n\n"
            for p in perms:
                md += f"- **{p.get('user')}:** configure={p.get('configure')}, write={p.get('write')}, read={p.get('read')}\n"
            return md

        return f"Unknown action: {params.action}"

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="rmq_vhost_list",
    annotations={"title": "List Virtual Hosts", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
)
async def rmq_vhost_list(params: RmqVhostListInput, ctx=None) -> str:
    """List all virtual hosts with message counts.

    Returns:
        str: Vhost listing
    """
    try:
        http = await _get_http(ctx)
        resp = await http.get("/vhosts")
        resp.raise_for_status()
        vhosts = resp.json()

        if params.response_format == ResponseFormat.JSON:
            return _safe_json(vhosts)

        md = f"## 🏢 Virtual Hosts ({len(vhosts)} total)\n\n"
        md += "| Vhost | Messages | Description |\n"
        md += "|-------|----------|-------------|\n"
        for v in vhosts:
            md += f"| `{v.get('name')}` | {v.get('messages', 0):,} | {v.get('description', '-')} |\n"
        return md

    except Exception as e:
        return _handle_error(e)


# ============================================================
# MONITORING & HEALTH
# ============================================================

@mcp.tool(
    name="rmq_server_overview",
    annotations={"title": "Server Overview", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
)
async def rmq_server_overview(params: RmqOverviewInput, ctx=None) -> str:
    """Get comprehensive RabbitMQ server overview including version, cluster status,
    message rates, connections, channels, queues, and exchange counts.

    Returns:
        str: Server overview with key metrics
    """
    try:
        http = await _get_http(ctx)
        resp = await http.get("/overview")
        resp.raise_for_status()
        overview = resp.json()

        if params.response_format == ResponseFormat.JSON:
            return _safe_json(overview)

        mv = overview.get("management_version", "N/A")
        rv = overview.get("rabbitmq_version", "N/A")
        ev = overview.get("erlang_version", "N/A")
        cn = overview.get("cluster_name", "N/A")

        obj_totals = overview.get("object_totals", {})
        queue_totals = overview.get("queue_totals", {})
        msg_stats = overview.get("message_stats", {})

        md = f"## 🐰 RabbitMQ Server Overview\n\n"
        md += f"**Version:** {rv} | **Erlang:** {ev} | **Cluster:** {cn}\n\n"

        md += "### Object Counts\n"
        md += f"- **Queues:** {obj_totals.get('queues', 0):,}\n"
        md += f"- **Exchanges:** {obj_totals.get('exchanges', 0):,}\n"
        md += f"- **Connections:** {obj_totals.get('connections', 0):,}\n"
        md += f"- **Channels:** {obj_totals.get('channels', 0):,}\n"
        md += f"- **Consumers:** {obj_totals.get('consumers', 0):,}\n"

        md += "\n### Message Totals\n"
        md += f"- **Total Messages:** {queue_totals.get('messages', 0):,}\n"
        md += f"- **Ready:** {queue_totals.get('messages_ready', 0):,}\n"
        md += f"- **Unacked:** {queue_totals.get('messages_unacknowledged', 0):,}\n"

        if msg_stats:
            pub_rate = msg_stats.get("publish_details", {}).get("rate", 0)
            deliver_rate = msg_stats.get("deliver_get_details", {}).get("rate", 0)
            ack_rate = msg_stats.get("ack_details", {}).get("rate", 0)
            md += f"\n### Message Rates\n"
            md += f"- **Publish:** {_format_rate(pub_rate)}\n"
            md += f"- **Deliver:** {_format_rate(deliver_rate)}\n"
            md += f"- **Acknowledge:** {_format_rate(ack_rate)}\n"

        # Node info
        nodes = overview.get("listeners", [])
        if nodes:
            md += "\n### Listeners\n"
            for n in nodes:
                md += f"- **{n.get('protocol')}** on {n.get('ip_address', '0.0.0.0')}:{n.get('port')}\n"

        return md

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="rmq_health_check",
    annotations={"title": "AI Health Check", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
)
async def rmq_health_check(params: RmqHealthCheckInput, ctx=None) -> str:
    """Perform a comprehensive RabbitMQ health check with AI-powered analysis.
    Identifies issues, bottlenecks, and provides actionable recommendations.

    Checks: node health, memory/disk alarms, queue backlogs, unacked messages,
    consumer balance, connection leaks, and cluster partition risks.

    Returns:
        str: Health report with severity ratings and recommendations
    """
    try:
        http = await _get_http(ctx)

        # Gather data
        overview_resp = await http.get("/overview")
        overview_resp.raise_for_status()
        overview = overview_resp.json()

        nodes_resp = await http.get("/nodes")
        nodes_resp.raise_for_status()
        nodes = nodes_resp.json()

        issues = []
        recommendations = []
        health_score = 100

        # 1. Node Health
        for node in nodes:
            if not node.get("running", False):
                issues.append(("🔴 CRITICAL", f"Node `{node.get('name')}` is NOT running!"))
                health_score -= 30

            # Memory alarm
            if node.get("mem_alarm", False):
                issues.append(("🔴 CRITICAL", f"Memory alarm active on `{node.get('name')}`! RabbitMQ is blocking publishers."))
                recommendations.append("Increase memory limit or reduce queue backlogs. Check for memory leaks in consumers.")
                health_score -= 25

            # Disk alarm
            if node.get("disk_free_alarm", False):
                issues.append(("🔴 CRITICAL", f"Disk free alarm on `{node.get('name')}`! RabbitMQ is blocking publishers."))
                recommendations.append("Free disk space or increase disk_free_limit. Check if log files are growing unchecked.")
                health_score -= 25

            # Memory usage
            mem_used = node.get("mem_used", 0)
            mem_limit = node.get("mem_limit", 1)
            if mem_limit > 0:
                mem_pct = (mem_used / mem_limit) * 100
                if mem_pct > 80:
                    issues.append(("🟡 WARNING", f"Memory at {mem_pct:.1f}% on `{node.get('name')}`"))
                    health_score -= 10

            # File descriptors
            fd_used = node.get("fd_used", 0)
            fd_total = node.get("fd_total", 1)
            if fd_total > 0 and (fd_used / fd_total) > 0.8:
                issues.append(("🟡 WARNING", f"File descriptors at {fd_used}/{fd_total} ({fd_used/fd_total*100:.0f}%)"))
                recommendations.append("Increase file descriptor limit or reduce connections.")
                health_score -= 10

        # 2. Queue Backlogs
        queue_totals = overview.get("queue_totals", {})
        total_msgs = queue_totals.get("messages", 0)
        unacked = queue_totals.get("messages_unacknowledged", 0)

        if total_msgs > 100000:
            issues.append(("🟡 WARNING", f"Total message backlog: {total_msgs:,}"))
            recommendations.append("Check if consumers are processing fast enough. Consider adding more consumers.")
            health_score -= 10

        if unacked > 10000:
            issues.append(("🔴 CRITICAL", f"Unacknowledged messages: {unacked:,} — consumers may be stuck"))
            recommendations.append("Check consumer health. Unacked messages hold memory. Set prefetch count to limit this.")
            health_score -= 15

        # 3. Connection/Channel analysis
        obj_totals = overview.get("object_totals", {})
        connections = obj_totals.get("connections", 0)
        channels = obj_totals.get("channels", 0)

        if connections > 0 and channels / connections > 10:
            issues.append(("🟡 WARNING", f"High channel/connection ratio: {channels}/{connections} ({channels/connections:.1f} channels per connection)"))
            recommendations.append("Reuse channels instead of creating new ones per operation.")
            health_score -= 5

        if connections > 1000:
            issues.append(("🟡 WARNING", f"High connection count: {connections:,}"))
            recommendations.append("Use connection pooling. Each connection uses ~100KB+ of memory.")
            health_score -= 5

        # 4. Queue-specific issues
        if params.include_queue_details:
            queues_resp = await http.get("/queues")
            queues_resp.raise_for_status()
            queues = queues_resp.json()

            no_consumer_queues = [q["name"] for q in queues if q.get("consumers", 0) == 0 and q.get("messages", 0) > 0]
            if no_consumer_queues:
                issues.append(("🟡 WARNING", f"{len(no_consumer_queues)} queue(s) with messages but no consumers: {', '.join(no_consumer_queues[:5])}"))
                recommendations.append("Attach consumers to these queues or set up dead-letter handling.")
                health_score -= 5

            high_backlog_queues = [q["name"] for q in queues if q.get("messages", 0) > 10000]
            if high_backlog_queues:
                issues.append(("🟡 WARNING", f"High backlog queues (>10K msgs): {', '.join(high_backlog_queues[:5])}"))
                health_score -= 5

        # 5. Cluster partitions
        for node in nodes:
            partitions = node.get("partitions", [])
            if partitions:
                issues.append(("🔴 CRITICAL", f"Network partition detected on `{node.get('name')}`! Partitions: {partitions}"))
                recommendations.append("Resolve network partition immediately. This can cause data loss. Check: rabbitmqctl cluster_status")
                health_score -= 30

        health_score = max(0, health_score)
        health_emoji = "🟢" if health_score >= 80 else "🟡" if health_score >= 50 else "🔴"

        if params.response_format == ResponseFormat.JSON:
            return _safe_json({
                "health_score": health_score,
                "status": "healthy" if health_score >= 80 else "warning" if health_score >= 50 else "critical",
                "issues": [{"severity": s, "message": m} for s, m in issues],
                "recommendations": recommendations,
                "nodes": len(nodes),
                "total_messages": total_msgs,
                "connections": connections,
            })

        md = f"## {health_emoji} RabbitMQ Health Check — Score: {health_score}/100\n\n"

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

        if not issues:
            md += "✅ All systems nominal. RabbitMQ is healthy!\n\n"

        md += f"**Nodes:** {len(nodes)} | **Messages:** {total_msgs:,} | **Connections:** {connections:,} | **Channels:** {channels:,}"
        return md

    except Exception as e:
        return _handle_error(e)


# ============================================================
# DEAD LETTER QUEUE MANAGEMENT
# ============================================================

@mcp.tool(
    name="rmq_dead_letter",
    annotations={"title": "Dead Letter Queue Manager", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False},
)
async def rmq_dead_letter(params: RmqDeadLetterInput, ctx=None) -> str:
    """Manage dead letter queues (DLQ). Set up DLQ infrastructure, inspect
    failed messages, replay them back to the original queue, or purge.

    Returns:
        str: DLQ operation result
    """
    try:
        http = await _get_http(ctx)
        vhost = _encode_vhost(params.vhost)
        dlx_name = f"{params.source_queue}.dlx"
        dlq_name = f"{params.source_queue}.dlq"

        if params.action == "setup":
            # 1. Create dead letter exchange
            await http.put(f"/exchanges/{vhost}/{dlx_name}", json={
                "type": "fanout", "durable": True,
            })

            # 2. Create dead letter queue
            await http.put(f"/queues/{vhost}/{dlq_name}", json={
                "durable": True,
                "arguments": {"x-message-ttl": 604800000},  # 7 day retention
            })

            # 3. Bind DLQ to DLX
            await http.post(f"/bindings/{vhost}/e/{dlx_name}/q/{dlq_name}", json={
                "routing_key": "",
            })

            # 4. Update source queue to use DLX (via policy)
            await http.put(f"/policies/{vhost}/dlx-{params.source_queue}", json={
                "pattern": f"^{params.source_queue}$",
                "definition": {
                    "dead-letter-exchange": dlx_name,
                    "dead-letter-routing-key": "",
                },
                "apply-to": "queues",
                "priority": 10,
            })

            return (
                f"✅ Dead Letter infrastructure created for `{params.source_queue}`:\n"
                f"- DL Exchange: `{dlx_name}` (fanout)\n"
                f"- DL Queue: `{dlq_name}` (7-day retention)\n"
                f"- Policy: `dlx-{params.source_queue}` applied\n\n"
                f"Failed/rejected messages from `{params.source_queue}` will now flow to `{dlq_name}`."
            )

        elif params.action == "inspect":
            # Get DLQ info + peek messages
            resp = await http.get(f"/queues/{vhost}/{dlq_name}")
            resp.raise_for_status()
            q = resp.json()

            msg_count = q.get("messages", 0)
            md = f"## 💀 Dead Letter Queue: `{dlq_name}`\n\n"
            md += f"- **Dead Messages:** {msg_count:,}\n"
            md += f"- **Memory:** {_format_bytes(q.get('memory', 0))}\n\n"

            if msg_count > 0:
                # Peek at first few
                peek_resp = await http.post(f"/queues/{vhost}/{dlq_name}/get", json={
                    "count": min(5, msg_count), "ackmode": "ack_requeue_true", "encoding": "auto",
                })
                peek_resp.raise_for_status()
                msgs = peek_resp.json()

                md += "### Sample Dead Messages\n"
                for i, msg in enumerate(msgs):
                    headers = msg.get("properties", {}).get("headers", {})
                    death = headers.get("x-death", [{}])
                    reason = death[0].get("reason", "unknown") if death else "unknown"
                    original_queue = death[0].get("queue", "unknown") if death else "unknown"

                    md += f"\n**Message {i + 1}**\n"
                    md += f"- Reason: `{reason}`\n"
                    md += f"- Original Queue: `{original_queue}`\n"
                    md += f"- Routing Key: `{msg.get('routing_key')}`\n"
                    md += f"- Payload: `{msg.get('payload', '')[:200]}`\n"

            return md

        elif params.action == "replay":
            count = params.replay_count or 10
            # Get messages from DLQ and republish to original queue
            get_resp = await http.post(f"/queues/{vhost}/{dlq_name}/get", json={
                "count": count, "ackmode": "ack_requeue_false", "encoding": "auto",
            })
            get_resp.raise_for_status()
            msgs = get_resp.json()

            replayed = 0
            for msg in msgs:
                pub_body = {
                    "routing_key": params.source_queue,
                    "payload": msg.get("payload", ""),
                    "payload_encoding": "string",
                    "properties": {"delivery_mode": 2, "content_type": msg.get("properties", {}).get("content_type", "application/json")},
                }
                pub_resp = await http.post(f"/exchanges/{vhost}/amq.default/publish", json=pub_body)
                if pub_resp.status_code == 200:
                    replayed += 1

            return f"🔄 Replayed {replayed}/{len(msgs)} messages from `{dlq_name}` back to `{params.source_queue}`."

        elif params.action == "purge":
            if not params.confirm:
                return f"⚠️ Purge DLQ requires confirm=True. This permanently deletes all dead messages in `{dlq_name}`!"
            resp = await http.delete(f"/queues/{vhost}/{dlq_name}/contents")
            resp.raise_for_status()
            return f"🗑️ DLQ `{dlq_name}` purged — all dead messages removed."

        return f"Unknown action: {params.action}"

    except Exception as e:
        return _handle_error(e)


# ============================================================
# AI ROUTING STRATEGY ADVISOR
# ============================================================

@mcp.tool(
    name="rmq_routing_strategy",
    annotations={"title": "AI Routing Strategy Advisor", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
)
async def rmq_routing_strategy(params: RmqRoutingStrategyInput, ctx=None) -> str:
    """AI-powered messaging strategy recommendation engine. Analyzes your use case
    and provides a tailored RabbitMQ architecture with exchange types, queue patterns,
    routing key conventions, and reliability settings.

    Returns:
        str: Comprehensive routing architecture recommendation
    """
    use_case = params.use_case.lower()

    strategy = {
        "exchange_type": "topic",
        "queue_pattern": "durable",
        "reliability": params.reliability,
        "use_case_type": "general messaging",
    }

    # Pattern matching for use case
    if any(w in use_case for w in ["order", "payment", "transaction", "trade", "purchase"]):
        strategy.update({
            "exchange_type": "topic",
            "use_case_type": "Order/Transaction Processing",
            "architecture": {
                "exchange": "orders.events (topic)",
                "queues": [
                    "orders.processing — main processing",
                    "orders.payment — payment handling",
                    "orders.notification — email/SMS notifications",
                    "orders.audit — compliance logging",
                    "orders.processing.dlq — dead letters",
                ],
                "routing_keys": [
                    "order.created → orders.processing + orders.audit",
                    "order.paid → orders.notification + orders.audit",
                    "order.failed → orders.processing.dlq",
                    "order.# → orders.audit (catch-all for compliance)",
                ],
            },
            "notes": [
                "Use topic exchange for flexible routing — add new consumers without changing publishers",
                "Set prefetch_count=1 for fair dispatch across workers",
                "Enable publisher confirms for guaranteed delivery",
                "Set up dead letter exchanges for failed messages",
                "Use quorum queues for data safety (replicated across nodes)",
                "Message TTL: 24h for processing, 7 days for DLQ",
            ],
        })
    elif any(w in use_case for w in ["notification", "alert", "email", "sms", "push"]):
        strategy.update({
            "exchange_type": "fanout",
            "use_case_type": "Notification Broadcasting",
            "architecture": {
                "exchange": "notifications.broadcast (fanout)",
                "queues": [
                    "notifications.email — email service",
                    "notifications.sms — SMS gateway",
                    "notifications.push — mobile push",
                    "notifications.slack — Slack webhook",
                ],
                "routing_keys": ["N/A — fanout ignores routing keys, broadcasts to ALL bound queues"],
            },
            "notes": [
                "Fanout = broadcast — every bound queue gets every message",
                "Each notification channel is an independent consumer",
                "If SMS service is down, email still works (independent queues)",
                "Add new channels by just binding a new queue — no publisher changes",
                "Consider message priority for urgent alerts",
            ],
        })
    elif any(w in use_case for w in ["log", "event", "audit", "tracking", "analytics"]):
        strategy.update({
            "exchange_type": "topic",
            "use_case_type": "Event Logging & Analytics",
            "architecture": {
                "exchange": "events.log (topic)",
                "queues": [
                    "events.all — catch-all for storage (bind: #)",
                    "events.errors — error-only stream (bind: *.error)",
                    "events.analytics — for real-time dashboards",
                ],
                "routing_keys": [
                    "app.auth.login → events.all + events.analytics",
                    "app.payment.error → events.all + events.errors",
                    "app.*.error → events.errors (wildcard catch)",
                    "# → events.all (everything for storage)",
                ],
            },
            "notes": [
                "Topic exchange with hierarchical routing keys: service.module.action",
                "# wildcard for catch-all logging, * for single-level matching",
                "Use lazy queues for log storage (pages to disk, saves RAM)",
                "Set message TTL on analytics queue (short-lived) vs long retention on storage",
                "Consider stream queue type for replay capability",
            ],
        })
    elif any(w in use_case for w in ["task", "job", "worker", "background", "async", "queue"]):
        strategy.update({
            "exchange_type": "direct",
            "use_case_type": "Background Job Processing",
            "architecture": {
                "exchange": "(default exchange)",
                "queues": [
                    "jobs.high — priority jobs",
                    "jobs.default — normal jobs",
                    "jobs.low — batch/bulk jobs",
                    "jobs.failed — DLQ for retries",
                ],
                "routing_keys": [
                    "jobs.high → high priority queue (routing_key = queue name)",
                    "jobs.default → standard processing",
                    "jobs.low → background batch jobs",
                ],
            },
            "notes": [
                "Use default exchange — routing_key = queue name for simplest pattern",
                "Set prefetch_count based on job duration (long jobs = 1, short = 10-50)",
                "Implement retry with DLQ + TTL: failed → DLQ (wait 60s) → retry queue",
                "Use message priority (0-9) for urgent jobs within same queue",
                "Track job progress in Redis (complement RabbitMQ with Redis for state)",
            ],
        })
    elif any(w in use_case for w in ["iot", "sensor", "device", "telemetry", "mqtt"]):
        strategy.update({
            "exchange_type": "topic",
            "use_case_type": "IoT / Sensor Data Pipeline",
            "architecture": {
                "exchange": "iot.telemetry (topic)",
                "queues": [
                    "iot.storage — time-series database ingest",
                    "iot.alerts — threshold monitoring",
                    "iot.dashboard — real-time UI updates",
                ],
                "routing_keys": [
                    "device.SENS_001.temperature → iot.storage + iot.alerts",
                    "device.*.temperature → iot.alerts (all temp sensors)",
                    "device.# → iot.storage (everything for history)",
                ],
            },
            "notes": [
                "Enable MQTT plugin for direct device connectivity",
                "Topic exchange for hierarchical device addressing",
                "Use lazy queues for storage (high volume, paged to disk)",
                "Set message TTL on dashboard queue (only latest matters)",
                "Consider at-most-once for telemetry (acceptable loss) vs at-least-once for alerts",
            ],
        })
    else:
        strategy.update({
            "architecture": {
                "exchange": "app.events (topic)",
                "queues": ["app.processing", "app.notifications", "app.processing.dlq"],
                "routing_keys": ["event.type.action pattern"],
            },
            "notes": [
                "Start with topic exchange — most flexible, can mimic direct and fanout",
                "Use durable queues and persistent messages for production",
                "Set up dead letter exchanges from day one",
                "Keep routing keys hierarchical: service.entity.action",
                "Monitor queue depths — growing backlog = consumer too slow",
            ],
        })

    # Reliability adjustments
    if params.reliability == "exactly-once":
        strategy["notes"].insert(0, "⚠️ Exactly-once is hard in distributed systems. Use publisher confirms + consumer acks + idempotent processing + deduplication IDs")
    elif params.reliability == "at-most-once":
        strategy["notes"].insert(0, "At-most-once: use auto-ack, no publisher confirms. Fast but may lose messages on failure.")

    if params.response_format == ResponseFormat.JSON:
        return _safe_json(strategy)

    arch = strategy.get("architecture", {})
    md = f"## 🧠 AI Routing Strategy: {strategy['use_case_type']}\n\n"
    md += f"**Exchange Type:** {strategy['exchange_type']}\n"
    md += f"**Reliability:** {params.reliability}\n"
    if params.message_volume:
        md += f"**Volume:** {params.message_volume}\n"
    if params.consumers:
        md += f"**Consumers:** {params.consumers}\n"

    md += f"\n### Architecture\n"
    md += f"**Exchange:** `{arch.get('exchange', 'N/A')}`\n\n"
    md += "**Queues:**\n"
    for q in arch.get("queues", []):
        md += f"- `{q}`\n"
    md += "\n**Routing Keys:**\n"
    for rk in arch.get("routing_keys", []):
        md += f"- `{rk}`\n"

    md += "\n### Implementation Notes\n"
    for note in strategy.get("notes", []):
        md += f"- {note}\n"

    return md


# ============================================================
# POLICY MANAGEMENT
# ============================================================

@mcp.tool(
    name="rmq_policy_set",
    annotations={"title": "Set Policy", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
)
async def rmq_policy_set(params: RmqPolicyInput, ctx=None) -> str:
    """Create or update a RabbitMQ policy. Policies apply configurations to
    queues/exchanges matching a name pattern — like HA mode, TTL, max-length.

    Returns:
        str: Policy creation confirmation
    """
    try:
        http = await _get_http(ctx)
        vhost = _encode_vhost(params.vhost)

        body = {
            "pattern": params.pattern,
            "definition": params.definition,
            "apply-to": params.apply_to,
            "priority": params.priority,
        }

        resp = await http.put(f"/policies/{vhost}/{params.name}", json=body)
        resp.raise_for_status()

        return f"✅ Policy `{params.name}` set on vhost `{params.vhost}`. Pattern: `{params.pattern}`. Applied to: {params.apply_to}. Definition: {_safe_json(params.definition)}"

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="rmq_policy_list",
    annotations={"title": "List Policies", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
)
async def rmq_policy_list(params: RmqPolicyListInput, ctx=None) -> str:
    """List all policies with their patterns and definitions.

    Returns:
        str: Policy listing
    """
    try:
        http = await _get_http(ctx)
        if params.vhost:
            vhost = _encode_vhost(params.vhost)
            resp = await http.get(f"/policies/{vhost}")
        else:
            resp = await http.get("/policies")
        resp.raise_for_status()
        policies = resp.json()

        if params.response_format == ResponseFormat.JSON:
            return _safe_json(policies)

        if not policies:
            return "No policies defined."

        md = f"## 📜 Policies ({len(policies)} total)\n\n"
        for p in policies:
            md += f"### `{p.get('name')}`\n"
            md += f"- **Vhost:** {p.get('vhost')}\n"
            md += f"- **Pattern:** `{p.get('pattern')}`\n"
            md += f"- **Apply to:** {p.get('apply-to')}\n"
            md += f"- **Priority:** {p.get('priority', 0)}\n"
            md += f"- **Definition:** `{_safe_json(p.get('definition', {}))}`\n\n"
        return md

    except Exception as e:
        return _handle_error(e)


# ============================================================
# ENTRYPOINT
# ============================================================

if __name__ == "__main__":
    import sys

    transport = "stdio"
    port = 8001

    for arg in sys.argv[1:]:
        if arg == "--http":
            transport = "streamable_http"
        elif arg.startswith("--port="):
            port = int(arg.split("=")[1])

    if transport == "streamable_http":
        mcp.run(transport="streamable_http", port=port)
    else:
        mcp.run()
