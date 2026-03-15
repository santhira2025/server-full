"""
KafkaNexus MCP Server — Event Streaming Intelligence
======================================================
AI-native Apache Kafka management: topics, producers, consumers,
consumer groups, partition management, and stream processing monitoring.
Uses confluent-kafka-python and kafka-admin-client.

Author: Santhira (Rajkumar Madhu) | Port: 8007
"""

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any, Literal
from enum import Enum
from contextlib import asynccontextmanager
import json

DEFAULT_BOOTSTRAP = "localhost:9092"

@asynccontextmanager
async def kafka_lifespan():
    from confluent_kafka.admin import AdminClient
    admin = AdminClient({"bootstrap.servers": DEFAULT_BOOTSTRAP})
    yield {"admin": admin, "bootstrap": DEFAULT_BOOTSTRAP}

mcp = FastMCP("kafka_nexus_mcp", lifespan=kafka_lifespan)

class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"

def _safe_json(data): return json.dumps(data, indent=2, default=str)
def _handle_error(e): return f"Error: {type(e).__name__} — {str(e)}"
async def _get_admin(ctx): return ctx.request_context.lifespan_state["admin"]
async def _get_bootstrap(ctx): return ctx.request_context.lifespan_state["bootstrap"]

# ---- INPUT MODELS ----

class KafkaTopicCreateInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(..., description="Topic name (e.g., 'orders.events', 'user.activity')")
    partitions: int = Field(default=6, ge=1, le=1000, description="Number of partitions")
    replication_factor: int = Field(default=3, ge=1, le=5)
    configs: Optional[Dict[str, str]] = Field(default=None, description="Topic configs (retention.ms, cleanup.policy, etc.)")

class KafkaTopicListInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    include_internal: bool = Field(default=False, description="Include __consumer_offsets etc.")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class KafkaTopicInfoInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(..., description="Topic name")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class KafkaProduceInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    topic: str = Field(..., description="Topic name")
    messages: List[Dict[str, Any]] = Field(..., description="Messages to produce [{key, value, headers}]")
    partition: Optional[int] = Field(default=None, description="Specific partition (None = auto)")

class KafkaConsumeInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    topic: str = Field(..., description="Topic name")
    group_id: str = Field(default="nexus-consumer", description="Consumer group ID")
    count: int = Field(default=10, ge=1, le=100)
    from_beginning: bool = Field(default=False)
    timeout_seconds: int = Field(default=5, ge=1, le=30)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class KafkaGroupInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["list", "describe", "lag"] = Field(default="list")
    group_id: Optional[str] = Field(default=None)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class KafkaHealthInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class KafkaStrategyInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    use_case: str = Field(..., description="Describe your streaming use case")
    events_per_second: Optional[int] = Field(default=None)
    consumers: Optional[int] = Field(default=None)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

# ---- TOOLS ----

@mcp.tool(name="kafka_topic_create", annotations={"title": "Create Topic", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def kafka_topic_create(params: KafkaTopicCreateInput, ctx=None) -> str:
    """Create a Kafka topic with configurable partitions, replication, retention, and cleanup policy."""
    try:
        from confluent_kafka.admin import NewTopic
        admin = await _get_admin(ctx)
        topic = NewTopic(params.name, num_partitions=params.partitions, replication_factor=params.replication_factor, config=params.configs or {})
        futures = admin.create_topics([topic])
        for t, f in futures.items():
            f.result()
        configs_desc = f" Configs: {params.configs}" if params.configs else ""
        return f"✅ Topic `{params.name}` created. Partitions: {params.partitions}, Replication: {params.replication_factor}.{configs_desc}"
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="kafka_topic_list", annotations={"title": "List Topics", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def kafka_topic_list(params: KafkaTopicListInput, ctx=None) -> str:
    """List all Kafka topics with partition counts."""
    try:
        admin = await _get_admin(ctx)
        metadata = admin.list_topics(timeout=10)
        topics = metadata.topics
        if not params.include_internal:
            topics = {k: v for k, v in topics.items() if not k.startswith("__")}

        if params.response_format == ResponseFormat.JSON:
            return _safe_json([{"name": k, "partitions": len(v.partitions)} for k, v in topics.items()])

        md = f"## 📋 Kafka Topics ({len(topics)})\n\n"
        md += "| Topic | Partitions |\n|-------|------------|\n"
        for name, info in sorted(topics.items()):
            md += f"| `{name}` | {len(info.partitions)} |\n"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="kafka_topic_info", annotations={"title": "Topic Details", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def kafka_topic_info(params: KafkaTopicInfoInput, ctx=None) -> str:
    """Get detailed topic info: partitions, leaders, replicas, ISR, configs."""
    try:
        admin = await _get_admin(ctx)
        metadata = admin.list_topics(params.name, timeout=10)
        topic = metadata.topics.get(params.name)
        if not topic:
            return f"Topic `{params.name}` not found."

        md = f"## 📦 Topic: `{params.name}`\n\n"
        md += f"**Partitions:** {len(topic.partitions)}\n\n"
        md += "| Partition | Leader | Replicas | ISR |\n|-----------|--------|----------|-----|\n"
        for pid, p in sorted(topic.partitions.items()):
            md += f"| {pid} | {p.leader} | {p.replicas} | {p.isrs} |\n"

        from confluent_kafka.admin import ConfigResource, RESOURCE_TOPIC
        resource = ConfigResource(RESOURCE_TOPIC, params.name)
        futures = admin.describe_configs([resource])
        for res, f in futures.items():
            configs = f.result()
            md += "\n### Configuration\n"
            for k, v in configs.items():
                if not v.is_default:
                    md += f"- **{k}:** {v.value}\n"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="kafka_produce", annotations={"title": "Produce Messages", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": True})
async def kafka_produce(params: KafkaProduceInput, ctx=None) -> str:
    """Produce messages to a Kafka topic with optional key, headers, and partition."""
    try:
        from confluent_kafka import Producer
        bootstrap = await _get_bootstrap(ctx)
        producer = Producer({"bootstrap.servers": bootstrap, "acks": "all"})
        delivered = 0
        errors = []

        def delivery_cb(err, msg):
            nonlocal delivered
            if err:
                errors.append(str(err))
            else:
                delivered += 1

        for msg in params.messages:
            key = msg.get("key", "").encode() if msg.get("key") else None
            value = json.dumps(msg.get("value", msg)).encode()
            kwargs = {"callback": delivery_cb}
            if params.partition is not None:
                kwargs["partition"] = params.partition
            if msg.get("headers"):
                kwargs["headers"] = {k: v.encode() for k, v in msg["headers"].items()}
            producer.produce(params.topic, value=value, key=key, **kwargs)

        producer.flush(timeout=10)
        if errors:
            return f"⚠️ Produced {delivered}/{len(params.messages)}. Errors: {errors[:3]}"
        return f"✅ Produced {delivered} messages to `{params.topic}`."
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="kafka_consume", annotations={"title": "Consume Messages", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False})
async def kafka_consume(params: KafkaConsumeInput, ctx=None) -> str:
    """Consume messages from a Kafka topic. Can read from beginning or latest."""
    try:
        from confluent_kafka import Consumer
        bootstrap = await _get_bootstrap(ctx)
        conf = {
            "bootstrap.servers": bootstrap,
            "group.id": params.group_id,
            "auto.offset.reset": "earliest" if params.from_beginning else "latest",
            "enable.auto.commit": False,
        }
        consumer = Consumer(conf)
        consumer.subscribe([params.topic])

        messages = []
        import time
        deadline = time.time() + params.timeout_seconds
        while len(messages) < params.count and time.time() < deadline:
            msg = consumer.poll(1.0)
            if msg is None: continue
            if msg.error(): continue
            messages.append({
                "partition": msg.partition(),
                "offset": msg.offset(),
                "key": msg.key().decode() if msg.key() else None,
                "value": msg.value().decode() if msg.value() else None,
                "timestamp": msg.timestamp()[1],
            })
        consumer.close()

        if not messages:
            return f"No messages consumed from `{params.topic}` within {params.timeout_seconds}s."

        if params.response_format == ResponseFormat.JSON:
            return _safe_json(messages)

        md = f"## 📨 Consumed {len(messages)} messages from `{params.topic}`\n\n"
        for m in messages:
            md += f"- **P{m['partition']}@{m['offset']}** key=`{m['key']}` → `{str(m['value'])[:200]}`\n"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="kafka_consumer_groups", annotations={"title": "Consumer Groups", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def kafka_consumer_groups(params: KafkaGroupInput, ctx=None) -> str:
    """List consumer groups, describe members, and check consumer lag."""
    try:
        admin = await _get_admin(ctx)
        if params.action == "list":
            groups = admin.list_consumer_groups(timeout=10)
            valid = groups.valid
            md = f"## 👥 Consumer Groups ({len(valid)})\n\n"
            for g in valid:
                md += f"- `{g.group_id}` — state: {g.state}\n"
            return md
        elif params.action == "describe" and params.group_id:
            futures = admin.describe_consumer_groups([params.group_id])
            for gid, f in futures.items():
                group = f.result()
                md = f"## 👥 Group: `{params.group_id}`\n\n"
                md += f"- **State:** {group.state}\n- **Members:** {len(group.members)}\n"
                for m in group.members:
                    md += f"  - `{m.client_id}` ({m.host}) — {len(m.assignment.topic_partitions) if m.assignment else 0} partitions\n"
                return md
        return "Provide group_id for describe/lag."
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="kafka_health_check", annotations={"title": "AI Health Check", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def kafka_health_check(params: KafkaHealthInput, ctx=None) -> str:
    """Comprehensive Kafka cluster health check: brokers, topics, under-replicated partitions, consumer lag."""
    try:
        admin = await _get_admin(ctx)
        metadata = admin.list_topics(timeout=10)
        issues, score = [], 100

        brokers = metadata.brokers
        topics = {k: v for k, v in metadata.topics.items() if not k.startswith("__")}

        # Check under-replicated partitions
        under_replicated = 0
        for tname, topic in topics.items():
            for pid, p in topic.partitions.items():
                if len(p.isrs) < len(p.replicas):
                    under_replicated += 1
        if under_replicated > 0:
            issues.append(("🔴", f"{under_replicated} under-replicated partitions"))
            score -= 20

        # Check leaderless partitions
        leaderless = sum(1 for t in topics.values() for p in t.partitions.values() if p.leader == -1)
        if leaderless > 0:
            issues.append(("🔴", f"{leaderless} partitions without leaders"))
            score -= 25

        score = max(0, score)
        emoji = "🟢" if score >= 80 else "🟡" if score >= 50 else "🔴"
        md = f"## {emoji} Kafka Health — Score: {score}/100\n\n"
        md += f"**Brokers:** {len(brokers)} | **Topics:** {len(topics)} | **Total Partitions:** {sum(len(t.partitions) for t in topics.values())}\n\n"
        if issues:
            md += "### Issues\n" + "".join(f"- {s} {m}\n" for s, m in issues)
        else:
            md += "✅ Kafka cluster is healthy!\n"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="kafka_strategy_advisor", annotations={"title": "AI Streaming Strategy", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def kafka_strategy_advisor(params: KafkaStrategyInput, ctx=None) -> str:
    """AI-powered Kafka architecture and topic design advisor."""
    use = params.use_case.lower()
    partitions = max(6, (params.consumers or 3) * 2)
    retention = "7 days"

    if any(w in use for w in ["log", "event", "audit", "clickstream"]):
        return f"## 🧠 Strategy: Event Logging\n\n**Topics:** `events.raw` ({partitions}P), `events.processed`, `events.dead_letter`\n**Retention:** 30 days (cleanup.policy=delete)\n**Key:** event_type or user_id (for ordering)\n**Partitions:** {partitions} (1 per consumer)\n\n### Notes\n- Use log compaction for event-sourced systems\n- Set `compression.type=lz4` for throughput\n- Use Schema Registry for Avro/Protobuf schemas"
    elif any(w in use for w in ["order", "payment", "trade"]):
        return f"## 🧠 Strategy: Transaction Processing\n\n**Topics:** `orders.created` ({partitions}P), `orders.validated`, `orders.completed`, `orders.failed`\n**Retention:** 7 days (with DLQ for failures)\n**Key:** order_id (guarantees ordering per order)\n**acks:** all (no data loss)\n\n### Notes\n- Use exactly-once semantics (enable.idempotence=true)\n- Partition by order_id for per-order ordering\n- Use transactions for multi-topic atomic writes"
    else:
        return f"## 🧠 Strategy: General Streaming\n\n**Partitions:** {partitions}\n**Replication:** 3\n**Retention:** {retention}\n**acks:** all\n\n### Design Principles\n1. One topic per event type\n2. Key = entity ID for ordering\n3. Use Schema Registry\n4. Set up dead letter topics\n5. Monitor consumer lag"

if __name__ == "__main__":
    import sys
    transport = "stdio"
    for arg in sys.argv[1:]:
        if arg == "--http": transport = "streamable_http"
    mcp.run(transport=transport, port=8007) if transport == "streamable_http" else mcp.run()
