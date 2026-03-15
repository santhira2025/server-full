# RedisNexus — AI-Powered Redis Operations Intelligence Platform

> The world's first AI-native Redis MCP server + SaaS platform. Nobody has built this before.

## What Is This?

RedisNexus is an enterprise-grade platform that makes Redis operations intelligent by combining:

1. **Redis MCP Server** — 16 enterprise tools that let AI assistants (Claude, GPT, etc.) talk directly to Redis
2. **Multi-Tenant SaaS Dashboard** — Real-time monitoring for all your Redis instances across products
3. **AI-Powered Intelligence** — Cache strategy advisor, health scoring, anomaly detection
4. **Kubernetes-Native** — Production-ready with HA, auto-scaling, backups, Prometheus alerts

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    RedisNexus Platform                    │
├─────────────┬──────────────┬────────────┬───────────────┤
│  MCP Server │  Dashboard   │ AI Engine  │ Multi-Tenant  │
│  (16 tools) │  (React SPA) │ (Advisor)  │ (Isolation)   │
├─────────────┴──────────────┴────────────┴───────────────┤
│                    Redis 7.2 (Sentinel HA)               │
│              Master → Replica 1 → Replica 2              │
├─────────────────────────────────────────────────────────┤
│                    Kubernetes (K8s)                       │
│    HPA │ NetworkPolicy │ ServiceMonitor │ CronJob Backup │
└─────────────────────────────────────────────────────────┘
```

## MCP Server — 16 Enterprise Tools

### Core Data Operations
| Tool | Type | Description |
|------|------|-------------|
| `redis_get` | Read | Auto-detect type, retrieve any key with metadata |
| `redis_set` | Write | SET with TTL, NX/XX flags for distributed locks |
| `redis_hash_set` | Write | Atomic multi-field hash operations |
| `redis_hash_get` | Read | Selective hash field retrieval |
| `redis_list_push` | Write | LPUSH/RPUSH for queue/stack patterns |
| `redis_list_range` | Read | Range queries on lists |
| `redis_sorted_set_add` | Write | Scored members for leaderboards |
| `redis_sorted_set_range` | Read | Rank-based range queries |
| `redis_stream_add` | Write | Append to streams with MAXLEN |
| `redis_stream_read` | Read | Read stream entries by ID range |
| `redis_publish` | Write | Pub/Sub channel publishing |

### Operations & Intelligence
| Tool | Type | Description |
|------|------|-------------|
| `redis_scan_keys` | Read | Production-safe SCAN (never KEYS) |
| `redis_pipeline_execute` | Write | Batch 50+ commands atomically |
| `redis_health_check` | Intel | AI-scored health analysis with recommendations |
| `redis_key_analysis` | Intel | Keyspace pattern & memory profiling |
| `redis_cache_strategy` | Intel | AI advisor for caching architecture |
| `redis_tenant_ops` | Intel | Multi-tenant isolation & management |
| `redis_server_info` | Read | Comprehensive server metrics |
| `redis_delete` | Write | Safe deletion with confirmation gate |

## Quick Start

### 1. Local Development (stdio)
```bash
cd redis_nexus_mcp/
pip install -r requirements.txt
python redis_mcp_server.py
```

### 2. HTTP Server (remote/production)
```bash
python redis_mcp_server.py --http --port=8000
```

### 3. Docker
```bash
docker build -t santhira/redis-nexus-mcp .
docker run -p 8000:8000 \
  -e REDIS_URL=redis://your-redis:6379 \
  santhira/redis-nexus-mcp
```

### 4. Kubernetes (Production)
```bash
# Deploy entire stack
kubectl apply -f k8s/redis-nexus-full.yaml

# Verify
kubectl get pods -n redis-nexus
kubectl logs -f deployment/redis-nexus-mcp -n redis-nexus
```

## Multi-Tenant SaaS Architecture

RedisNexus supports multiple products sharing the same Redis infrastructure with isolation:

```
tenant:finspot:*        → Finspot Trading (NOREN)
tenant:linkedeye:*      → LinkedEye ITSM
tenant:voicelead:*      → VoiceLead AI
tenant:clinicvoice:*    → ClinicVoice AI
tenant:hrassist:*       → HRAssist AI
```

Each tenant gets:
- **Key isolation** via prefix-based namespacing
- **Usage tracking** (API calls, memory, key count)
- **Resource limits** (max keys, max memory, rate limiting)
- **Independent health monitoring**

## AI Intelligence Features

### Cache Strategy Advisor
```
Use case: "trading API price cache for NOREN"
→ Recommends: Cache-aside with 1-5s TTL
→ Suggests: Sorted Sets for rankings, Streams for audit
→ Warns: Enable stampede prevention with SETNX locks
```

### Health Check Scoring
```
Health Score: 87/100
🟡 WARNING: Memory at 82% — plan capacity increase
🟡 WARNING: 3 slow queries detected (>10ms)
✅ Cache hit rate: 94.2% (healthy)
✅ Replication: 2 replicas connected
```

## Production Checklist

- [x] Redis 7.2 with Sentinel HA (auto-failover)
- [x] AOF + RDB persistence (dual durability)
- [x] Prometheus metrics + Grafana dashboard
- [x] PrometheusRule alerts (memory, latency, replication)
- [x] HPA auto-scaling (2-10 replicas)
- [x] NetworkPolicy (namespace isolation)
- [x] CronJob backups (every 6 hours)
- [x] TLS termination via Ingress
- [x] Rate limiting (100 req/min)
- [x] Non-root container execution
- [x] Health checks (readiness + liveness)

## Files

```
redis_nexus_mcp/
├── redis_mcp_server.py      # MCP Server (16 enterprise tools)
├── requirements.txt          # Python dependencies
├── Dockerfile                # Production container
├── k8s/
│   └── redis-nexus-full.yaml # Complete K8s deployment
└── README.md                 # This file

RedisNexus_Dashboard.jsx      # React SaaS Dashboard (artifact)
```

## Built By

**Santhira** (Rajkumar Madhu) — Founder & CTO
Self-hosted, cost-effective, enterprise-grade.

---

*RedisNexus: Because your Redis deserves intelligence, not just commands.*
