# RabbitNexus — AI-Powered RabbitMQ Operations Intelligence Platform

> The world's first AI-native RabbitMQ MCP server. Let AI manage your message queues.

## What Is This?

RabbitNexus gives AI assistants (Claude, GPT, etc.) full control over RabbitMQ through 18 enterprise-grade MCP tools. Just tell AI what you need in plain English.

## 18 MCP Tools

### Queue Management
| Tool | Type | Description |
|------|------|-------------|
| `rmq_queue_create` | Write | Create queue with TTL, max-length, DLQ, quorum/stream type |
| `rmq_queue_list` | Read | List all queues with message counts, consumer counts, rates |
| `rmq_queue_info` | Read | Detailed queue metrics — rates, memory, arguments, policy |
| `rmq_queue_delete` | Write | Delete or purge queue (with confirmation gate) |

### Exchange & Binding
| Tool | Type | Description |
|------|------|-------------|
| `rmq_exchange_create` | Write | Create exchange — direct, fanout, topic, headers |
| `rmq_exchange_list` | Read | List exchanges with types and durability |
| `rmq_binding_create` | Write | Bind exchange → queue with routing key patterns |
| `rmq_binding_list` | Read | View message flow paths between exchanges and queues |

### Messaging
| Tool | Type | Description |
|------|------|-------------|
| `rmq_publish` | Write | Publish message with headers, priority, TTL, persistence |
| `rmq_consume` | Read | Peek or consume messages (ack/nack/requeue modes) |

### Multi-Tenant (Vhost)
| Tool | Type | Description |
|------|------|-------------|
| `rmq_vhost_manage` | Write | Create/delete/inspect vhosts for tenant isolation |
| `rmq_vhost_list` | Read | List all virtual hosts with message counts |

### Operations Intelligence
| Tool | Type | Description |
|------|------|-------------|
| `rmq_server_overview` | Read | Cluster status, message rates, connection counts |
| `rmq_health_check` | Intel | AI-scored health analysis (0-100) with recommendations |
| `rmq_dead_letter` | Write | DLQ setup, inspection, message replay, purge |
| `rmq_routing_strategy` | Intel | AI advisor for messaging architecture |
| `rmq_policy_set` | Write | Create HA, TTL, max-length policies |
| `rmq_policy_list` | Read | View all policies and their definitions |

## Quick Start

```bash
# Local
pip install -r requirements.txt
python rabbitmq_mcp_server.py

# HTTP mode
python rabbitmq_mcp_server.py --http --port=8001

# Docker
docker build -t santhira/rabbit-nexus-mcp .
docker run -p 8001:8001 -e RABBITMQ_HOST=your-rabbitmq santhira/rabbit-nexus-mcp

# Kubernetes (3-node cluster + MCP server + monitoring)
kubectl apply -f k8s/rabbit-nexus-full.yaml
```

## AI Conversation Examples

```
You: "Create an order processing queue with dead letter support"
AI:  Uses rmq_queue_create + rmq_dead_letter(setup) → full DLQ infrastructure

You: "What's the best architecture for sending notifications to email, SMS, and Slack?"
AI:  Uses rmq_routing_strategy → recommends fanout exchange + 3 independent queues

You: "Check if RabbitMQ is healthy"
AI:  Uses rmq_health_check → score 87/100, warns about unacked messages

You: "Show me dead letters from the orders queue and replay 5 back"
AI:  Uses rmq_dead_letter(inspect) then rmq_dead_letter(replay, count=5)

You: "Set up a new tenant for LinkedEye"
AI:  Uses rmq_vhost_manage(create) → isolated vhost with permissions
```

## Kubernetes Stack

- 3-node RabbitMQ cluster (StatefulSet with peer discovery)
- Erlang cookie-based clustering
- Quorum queue support
- Prometheus metrics (rabbitmq_prometheus plugin)
- PrometheusRule alerts (down, memory alarm, disk alarm, backlog, partitions)
- HPA for MCP server (2-10 replicas)
- NetworkPolicy isolation
- TLS Ingress

## Combined with RedisNexus

Run both together for the ultimate infrastructure:
- **Redis** for caching, sessions, real-time data
- **RabbitMQ** for async messaging, job queues, event routing
- Both controlled through AI via MCP

```
redis-nexus.santhira.com/mcp   → Redis MCP (port 8000)
rabbit-nexus.santhira.com/mcp  → RabbitMQ MCP (port 8001)
```

## Built By

**Santhira** (Rajkumar Madhu) — Founder & CTO
