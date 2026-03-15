# API-Sentinel-Team
# SKILL: Next-Generation API Security Platform — Production-Ready Backend Plan

> **Classification:** Advanced Cybersecurity Engineering  
> **Scope:** End-to-End Backend Architecture, Detection Engine, Data Pipeline, Agentic AI Security  
> **Research Basis:** Deep competitive analysis of Salt Security, AppSentinels, Traceable AI, Wallarm, Akamai API Security, Noname Security (Akamai acquired), 42Crunch, APISec, Imperva, plus 2025–2026 threat intelligence reports from Wallarm ThreatStats, Traceable State of API Security, SecurityWeek Cyber Insights 2026, Gartner Peer Reviews, and eBPF ecosystem research.  
> **Status:** Production Blueprint — Not a prototype sketch

---

## TABLE OF CONTENTS

1. [Market Intelligence & Competitive Gap Analysis](#1-market-intelligence--competitive-gap-analysis)
2. [Platform Philosophy & Design Principles](#2-platform-philosophy--design-principles)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [Data Plane: Ingestion, Capture & Normalization](#4-data-plane-ingestion-capture--normalization)
5. [Discovery Engine: API Inventory & Shadow Detection](#5-discovery-engine-api-inventory--shadow-detection)
6. [Posture Governance Engine](#6-posture-governance-engine)
7. [Behavioral Intelligence & ML Detection Engine](#7-behavioral-intelligence--ml-detection-engine)
8. [Business Logic Security Engine](#8-business-logic-security-engine)
9. [Agentic AI & MCP Security Layer (Next-Gen Differentiator)](#9-agentic-ai--mcp-security-layer-next-gen-differentiator)
10. [Automated Security Testing Pipeline](#10-automated-security-testing-pipeline)
11. [Sensitive Data & Privacy Engine](#11-sensitive-data--privacy-engine)
12. [Storage Architecture: Hot/Warm/Cold Tiers](#12-storage-architecture-hotwarmcold-tiers)
13. [Stream Processing & Real-Time Analytics](#13-stream-processing--real-time-analytics)
14. [Control Plane: Tenant Isolation, RBAC & Audit](#14-control-plane-tenant-isolation-rbac--audit)
15. [Enforcement & Response Layer](#15-enforcement--response-layer)
16. [Integrations, SIEM/SOAR & Compliance Exports](#16-integrations-siemsoar--compliance-exports)
17. [Public API Surface Design](#17-public-api-surface-design)
18. [Infrastructure & Deployment Architecture](#18-infrastructure--deployment-architecture)
19. [Test Plan: Load, Correctness, Security, Reliability](#19-test-plan-load-correctness-security-reliability)
20. [Phased Delivery Roadmap](#20-phased-delivery-roadmap)
21. [What Every Competitor Gets Wrong — Your Edge](#21-what-every-competitor-gets-wrong--your-edge)

---

## 1. Market Intelligence & Competitive Gap Analysis

### 1.1 The Threat Landscape (2025–2026 Ground Truth)

Based on Wallarm's 2026 API ThreatStats Report and Traceable's 2025 State of API Security:

- APIs now represent **17% of all published security vulnerabilities** (11,053 of 67,058 in 2025)
- **43% of all newly added CISA Known Exploited Vulnerabilities** in 2025 were API-related
- **MCP vulnerabilities grew 270%** from Q2 to Q3 2025 alone — 315 MCP CVEs in year one
- **98% of API vulnerabilities are easy or trivial to exploit**, 99% remotely accessible
- **52% of API breaches** in 2025 traced to broken authentication
- Only **13% of organizations can prevent >50% of API attacks**
- Only **21% report high ability to detect attacks at the API layer**
- AI-related API vulnerabilities grew **400% year over year** (439 → 2,185)

This is the environment your platform must operate in. The bar is not theoretical.

### 1.2 Platform-by-Platform Analysis

#### Salt Security (Illuminate / API Context Engine)
**Architecture:** Cloud-scale big data + patented API Context Engine (ACE). Out-of-band traffic mirroring. Long-window ML analysis (weeks to months).

**Strengths:**
- Best-in-class long-window behavioral analysis for low-and-slow attacks
- True cloud-scale data correlation across billions of calls
- Strong BOLA/BFLA detection through multi-session user profiling
- Recently added MCP/shadow agent discovery
- Strong posture governance with policy authoring engine

**Weaknesses (confirmed from Gartner Peer Reviews 2025):**
- Limited inline enforcement without third-party integrations (WAF/gateway dependency)
- UI performance degrades significantly at large dataset scales
- Inflexible reporting exports — no raw evidence API for SIEM enrichment
- High onboarding friction — complex deployment requiring vendor involvement
- No native automated pen-testing; shift-left is posture-only, not active testing
- ML models require weeks of baseline data before producing accurate detections
- **MCP/agentic protection is very new and not production-hardened**

#### AppSentinels (Full Lifecycle / WAAP)
**Architecture:** 3-tier distributed model (Sensors → Controllers → Servers). Agent-based and agentless options. Inline and out-of-band modes.

**Strengths:**
- Business logic graph — maps workflows, user journeys, application context
- Automated 24x7 AI-driven pen-testing (unique differentiator in market)
- Strong WAAP unification: NG-WAF + Bot + DDoS + API in one platform
- Stateful security testing beyond standard OWASP checks
- 50+ integrations, fast onboarding
- Rated leader in 2025 GigaOm Radar for API Security

**Weaknesses:**
- Business logic graph requires significant tuning per environment
- 3-tier deployment complexity creates ops burden for smaller teams
- ML detection requires calibration — advanced detections need vendor involvement
- No long-window analysis comparable to Salt (shorter behavioral windows)
- Evidence artifacts are less structured — harder to feed SOAR playbooks
- **No deep MCP/agentic AI workflow monitoring**

#### Traceable AI
**Architecture:** Distributed tracing + context-based behavioral analytics. OpenTelemetry native. Out-of-band or inline.

**Strengths:**
- Best distributed tracing integration — full request lineage across microservices
- Strong data sensitivity classification engine
- No-agent deployment (OTel-compatible)
- Good API lineage for compliance reporting

**Weaknesses:**
- Weaker runtime enforcement; primarily a detection and observability tool
- ML models skew toward anomaly flagging — high false positive rates reported
- Limited business logic understanding vs. AppSentinels
- No automated testing component
- Expensive at scale — licensing model punishes API-heavy organizations

#### Wallarm
**Architecture:** NGINX/Envoy module (inline) + cloud analytics. Real-time blocking.

**Strengths:**
- Fastest time-to-block — inline enforcement is genuinely production-hardened
- Strong OWASP Top 10 coverage, injection detection, memory corruption tracking
- Good CI/CD integration for shift-left
- Excellent threat research — ThreatStats reports are market-leading intelligence

**Weaknesses:**
- Behavioral analysis window is short (hours not days) — misses low-and-slow BOLA
- Business logic protection is shallow
- High false positive rate on behavioral rules
- Agent-based deployment creates upgrade maintenance burden
- No native automated pen-testing

#### Akamai API Security (formerly Noname)
**Architecture:** Passive traffic analysis via network tap/mirror + cloud analytics.

**Strengths:**
- 150+ active security tests in CI/CD pipeline
- Strong discovery across hybrid environments
- Deep DSPM integration (data security posture management)
- Enterprise-grade scalability

**Weaknesses:**
- Post-acquisition integration with Akamai is still in progress (as of 2025)
- Noname's original strength was posture; runtime detection lags Salt/Traceable
- Long analysis window not present — misses sophisticated multi-week attacks
- Agentic AI protection is conceptual, not operational

#### 42Crunch
**Architecture:** Contract-first, OpenAPI-centric. Pre-production focus.

**Strengths:**
- Best-in-class OpenAPI contract analysis and enforcement
- Strong CI/CD pipeline native

**Weaknesses:**
- Almost entirely pre-production; minimal runtime capability
- No behavioral analysis
- Not a full-stack platform — must be combined with other tools

### 1.3 The Universal Gaps You Must Fill

The entire market fails on these axes — this is where your platform wins:

| Gap | What Exists | What's Missing |
|-----|-------------|----------------|
| **Agentic AI & MCP security** | Basic MCP server discovery (Salt, 2025) | Deep MCP traffic analysis, agent workflow graph, prompt injection at API layer, A2A trust chain enforcement |
| **Long-window + inline hybrid** | Either long-window OR inline, never both | Unified architecture: long-window ML for detection + inline enforcement hooks at sub-millisecond latency |
| **Business logic graph automation** | AppSentinels manual tuning | Auto-constructed business logic graph from traffic + OpenAPI, continuously updated |
| **Evidence-grade artifacts** | Alert blobs in dashboards | Structured, reproducible, court-quality evidence packages per incident |
| **Multi-tenant SaaS-grade at SMB price** | Enterprise-only platforms | Genuinely multi-tenant with per-tenant cost isolation; SMB-accessible entry tier |
| **AI-native shift-left** | Static OpenAPI linting | AI-reconstructed OpenAPI from traffic, drift detection, LLM-powered remediation suggestions |
| **Zero-instrumentation capture** | Agent required or gateway integration | eBPF-based capture — zero app changes, zero proxy overhead |
| **Revenue-aware risk scoring** | Technical risk scores | Business-context risk scoring: endpoints tied to revenue, PII volume, regulatory exposure |

---

## 2. Platform Philosophy & Design Principles

These are non-negotiable constraints that every engineering decision must satisfy.

### 2.1 Core Principles

**Principle 1: Observe First, Block Second**
The platform captures and understands all API traffic before any enforcement decision is made. Out-of-band detection is the primary mode. Inline blocking is an optional overlay, never a prerequisite.

**Principle 2: Long-Window Behavioral Memory**
A 30-minute detection window catches script kiddies. A 90-day behavioral window catches nation-state actors. All ML models must be designed for long-window correlation. Session state is preserved across days, not minutes.

**Principle 3: Evidence Over Alerts**
Every detection produces a structured evidence artifact: raw request/response pairs (redacted), attack reconstruction timeline, contributing signals, OWASP/MITRE mapping, and automated remediation guidance. Alerts without evidence are noise.

**Principle 4: Business Logic is First-Class**
The platform understands the *intent* of API calls, not just their syntax. A request that is technically valid but logically abusive is detected. This requires a persistent, auto-learned business logic graph.

**Principle 5: Redact by Default, Retain by Choice**
PII and sensitive data are redacted at the capture layer before storage. Per-tenant opt-in for full payload retention with encryption-at-rest and strict access controls.

**Principle 6: Agentic AI is a First-Class Citizen**
MCP servers, LLM-facing APIs, A2A (agent-to-agent) communication, and AI workflow APIs are discovered, inventoried, and monitored with the same rigor as human-facing APIs — with additional controls for prompt injection, context poisoning, and privilege escalation via agent delegation.

**Principle 7: Tenant Isolation is Absolute**
No shared memory, no shared queues, no shared ML models between tenants. Every tenant is a hard namespace boundary.

**Principle 8: Developer Velocity is Sacred**
Security findings must be actionable by developers within their existing workflow (Jira, GitHub, Slack). Findings are expressed in code-level language, not security jargon. Remediation guidance is specific, not generic.

---

## 3. System Architecture Overview

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CAPTURE PLANE                               │
│                                                                     │
│  eBPF Sensor   Log Shipper   Gateway Mirror   DAST Agent   External │
│  (zero-touch)  (syslog/OTel) (traffic copy)  (CI/CD test)  Recon   │
└────────────────────────┬────────────────────────────────────────────┘
                         │ Canonical Event Stream (versioned schema)
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       INGESTION PLANE                               │
│                                                                     │
│   Kafka/Redpanda Cluster  ←──  Backpressure + Per-Tenant Quotas     │
│   Job Queue (async)       ←──  DLQ + Durable Retry                  │
│   Schema Registry         ←──  Avro/Protobuf versioned events       │
└────────────────────────┬────────────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Discovery  │  │   Posture   │  │  Detection  │
│   Engine    │  │  Governance │  │   Engine    │
│             │  │   Engine    │  │  (ML + Rules│
│ Endpoint    │  │ OpenAPI     │  │  + BizLogic)│
│ Inventory   │  │ Reconstruct │  │             │
│ Shadow/Rogue│  │ Risk Score  │  │ BOLA/BFLA   │
│ Versioning  │  │ Policy Eval │  │ Credential  │
│ Drift Track │  │ Compliance  │  │ Stuffing    │
│ MCP/Agent   │  │             │  │ Logic Abuse │
│ Discovery   │  │             │  │ MCP/Agent   │
└─────────────┘  └─────────────┘  └─────────────┘
          │              │              │
          └──────────────┼──────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     EVIDENCE & ANALYTICS PLANE                      │
│                                                                     │
│  Evidence Builder  │  Risk Aggregator  │  Compliance Reporter       │
│  Timeline Recon    │  Trend Analytics  │  Data Flow Mapping         │
└────────────────────┬────────────────────────────────────────────────┘
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
┌──────────────┐ ┌────────┐ ┌──────────────┐
│  Hot Store   │ │  Cache │ │  Cold Store  │
│ (Postgres +  │ │(Redis) │ │(S3/Object +  │
│  TimescaleDB)│ │        │ │  Clickhouse) │
└──────────────┘ └────────┘ └──────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      CONTROL PLANE                                  │
│                                                                     │
│  Multi-Tenant RBAC  │  Audit Log  │  Quota Mgmt  │  Policy CRUD    │
│  Webhook Engine     │  SIEM Push  │  Ticketing   │  Enforcement    │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Deployment Topology

The platform runs as a **modular monolith** with event-driven workers — not microservices. This is intentional:

- Single deployable binary per role (API server, ingestion worker, detection worker, scheduler)
- Workers communicate via internal event bus (in-process for single-node, Kafka for multi-node)
- Domain boundaries enforced at code level via module isolation, not network calls
- Extraction to independent services happens per-module when scale requires it

**Worker Roles:**
- `ingest-worker` — consumes raw events, normalizes, routes to topic lanes
- `discovery-worker` — builds and updates endpoint inventory
- `posture-worker` — runs policy evaluation on endpoint state changes
- `detection-worker` — runs ML inference, rule evaluation, evidence assembly
- `test-worker` — orchestrates automated security test runs
- `analytics-worker` — computes aggregates, risk scores, compliance state
- `notification-worker` — dispatches alerts, webhooks, SIEM events

---

## 4. Data Plane: Ingestion, Capture & Normalization

### 4.1 Capture Methods (Multi-Source)

#### Method 1: eBPF Sensor (Zero-Touch, Highest Fidelity)
The most powerful and differentiating capture method. No agent required, no app changes, no proxy overhead.

**How it works:**
- Deploy a privileged DaemonSet (Kubernetes) or system service (VM/bare-metal)
- Attach eBPF programs via uprobes to TLS library functions (OpenSSL, BoringSSL, GnuTLS) to intercept traffic *before* encryption and *after* decryption
- Capture full request/response pairs with socket metadata (process, container, namespace, user)
- Use BPF ring buffers for zero-copy transfer to userspace agent
- Userspace agent normalizes to canonical schema and forwards to ingestion plane

**Implementation Stack:**
- eBPF programs written in C, compiled with clang/LLVM to BPF bytecode
- Userspace agent in Rust (for memory safety and performance)
- libbpf for kernel interaction
- Minimum kernel version: 5.8 (ring buffer support); 5.15 preferred
- CO-RE (Compile Once, Run Everywhere) for kernel version portability

**Performance budget:**
- < 1% CPU overhead on host
- < 50MB memory footprint per node
- < 200µs latency added to captured packets (async, not in-path)

**Captures:**
- HTTP/1.1, HTTP/2, HTTP/3 (QUIC via socket-level hooks)
- gRPC (HTTP/2 framing)
- GraphQL (HTTP body parsing)
- WebSocket frames
- Internal service mesh traffic (east-west)

#### Method 2: Log Shipper Integration
For environments where eBPF is not viable (legacy, Windows, restrictive security posture).

- OpenTelemetry Collector with HTTP receiver
- Fluentd/Fluent Bit with custom API parser
- Syslog input with structured parser
- Cloud-native: AWS ALB access logs, GCP Cloud Logging, Azure Monitor

Normalization pipeline: raw log → field extraction → canonical schema mapping → type coercion → quality score (completeness rating per field)

#### Method 3: Gateway/Proxy Mirror
For organizations with existing API gateways (Kong, Nginx, Envoy, AWS API Gateway, Apigee).

- Gateway-side plugin/filter that mirrors requests+responses to a sidecar collector
- gRPC streaming from collector to ingestion plane
- Supports mirroring at 1:1 or sampled rates (configurable per tenant)

**Supported integrations:**
- Kong Plugin (Lua)
- Nginx Lua module
- Envoy External Processing filter (ext_proc)
- AWS API Gateway CloudWatch Logs
- Apigee MessageFlow policy

#### Method 4: External/Passive Recon
Agentless discovery from outside the network perimeter.

- DNSDB/passive DNS for subdomain enumeration
- Common crawl + internet scanner data (Shodan, Censys integration)
- Public API catalog indexing (RapidAPI, SwaggerHub)
- Git repository scanning for accidental API endpoint leakage
- OpenAPI spec harvesting from well-known paths (/.well-known/openapi.yaml, /swagger.json, /api-docs)

### 4.2 Canonical Event Schema

All sources produce a normalized `APIEvent` before any processing. Schema is versioned using Avro with a central Schema Registry.

```
APIEvent {
  // Identity
  event_id:        UUID (v7, time-ordered)
  schema_version:  "2.0"
  tenant_id:       string
  source_type:     enum(EBPF | LOG | GATEWAY | DAST | RECON)
  
  // Request
  request {
    timestamp_ns:    int64 (nanoseconds since epoch)
    method:          string
    url:             URL (parsed: scheme, host, path, query_params)
    headers:         map<string, string> (redacted by default)
    body_hash:       string (SHA-256 of original)
    body_tokens:     map<string, TokenizedValue> (tokenized PII)
    body_size_bytes: int64
    protocol:        enum(HTTP1 | HTTP2 | HTTP3 | GRPC | GRAPHQL | WEBSOCKET)
    tls_version:     string
    client_ip:       string (hashed unless full_payload_retention enabled)
    client_ip_geo:   GeoIP (country, asn, is_datacenter, is_vpn, is_tor)
    user_agent:      string
    trace_id:        string (OpenTelemetry trace ID if available)
  }
  
  // Response
  response {
    timestamp_ns:    int64
    status_code:     int
    headers:         map<string, string>
    body_hash:       string
    body_tokens:     map<string, TokenizedValue>
    body_size_bytes: int64
    latency_ms:      float
  }
  
  // Identity & Auth Context
  auth_context {
    auth_type:       enum(NONE | API_KEY | BEARER | BASIC | OAUTH2 | MTLS | CUSTOM)
    actor_id:        string (hashed user/service identifier)
    actor_type:      enum(HUMAN | SERVICE | BOT | AI_AGENT | UNKNOWN)
    scopes:          []string
    token_id:        string (jti or hash for correlation)
  }
  
  // Endpoint Classification
  endpoint {
    endpoint_id:     string (stable hash of method+normalized_path)
    path_template:   string (/users/{id}/orders vs /users/123/orders)
    classification:  EndpointClassification
    sensitivity:     SensitivityLevel
  }
  
  // Capture Quality
  quality {
    completeness_score: float (0.0–1.0)
    missing_fields:     []string
    redaction_applied:  bool
  }
}
```

### 4.3 Ingestion Pipeline

```
Raw Source → Schema Validation → PII Detection & Tokenization 
          → Endpoint Normalization → GeoIP Enrichment 
          → Actor Resolution → Routing to Topic Lanes
```

**Topic Lanes (Kafka topics):**
- `events.raw.{tenant_id}` — raw validated events
- `events.enriched.{tenant_id}` — enriched, normalized events
- `events.high_sensitivity.{tenant_id}` — events touching high-sensitivity endpoints
- `events.test_results` — DAST test run results
- `events.recon` — external discovery events

**Backpressure & Quotas:**
- Per-tenant ingestion rate limits (configurable: default 10k events/sec, hard cap 100k/sec)
- Consumer lag monitoring per tenant — auto-throttle at source when lag exceeds threshold
- Partition-level isolation: each tenant gets dedicated partitions
- DLQ (Dead Letter Queue): failed events routed with full error context, retry with exponential backoff (max 5 retries, 24hr TTL before archival)

---

## 5. Discovery Engine: API Inventory & Shadow Detection

### 5.1 Endpoint Normalization & Deduplication

Raw API calls arrive with concrete paths (`/users/123/orders/456`). The discovery engine must resolve these to abstract path templates (`/users/{userId}/orders/{orderId}`).

**Normalization Algorithm:**
1. Parse raw path into segments
2. Classify each segment: static keyword, numeric ID, UUID, slug, hash
3. Apply learned templates from existing inventory first
4. For new paths, use heuristic template generation:
   - Segments matching UUID pattern → `{id}`
   - Segments matching `[0-9]+` → `{id}`
   - Segments matching known slug patterns → `{slug}`
5. Cluster paths with cosine similarity on segment vectors — group paths that are structurally identical
6. Human-reviewable when confidence < 0.85

### 5.2 Endpoint Inventory (The API Catalog)

Every discovered endpoint becomes an `APIEndpoint` record:

```
APIEndpoint {
  endpoint_id:         string (stable)
  tenant_id:           string
  
  // Identity
  method:              string
  path_template:       string
  host:                string
  protocol:            Protocol
  api_type:            enum(REST | GRAPHQL | GRPC | WEBSOCKET | MCP | UNKNOWN)
  
  // Lifecycle
  first_seen_at:       timestamp
  last_seen_at:        timestamp
  status:              enum(ACTIVE | DEPRECATED | ZOMBIE | SHADOW | ROGUE)
  
  // Classification
  is_authenticated:    bool
  auth_mechanisms:     []AuthType
  sensitivity_level:   enum(PUBLIC | INTERNAL | SENSITIVE | CRITICAL)
  pii_categories:      []PIICategory
  handles_payments:    bool
  is_admin_endpoint:   bool
  is_ai_endpoint:      bool
  is_mcp_endpoint:     bool
  
  // Schema State
  openapi_spec_id:     string (reference to reconstructed spec)
  schema_coverage:     float (% of fields covered by known schema)
  last_schema_drift:   SchemaChange
  
  // Risk State (live)
  risk_score:          float (0.0–100.0, computed)
  risk_factors:        []RiskFactor
  posture_violations:  []PolicyViolation (current, active)
  
  // Change History
  change_log:          []EndpointChange
}
```

### 5.3 Shadow & Rogue API Detection

**Shadow API:** A real API that exists in your infrastructure but is not in any known inventory, documentation, or spec.

**Rogue API:** An API endpoint that is operating outside of policy — either exposed incorrectly, running on wrong infrastructure, or serving unauthorized traffic.

**Detection signals:**
- Traffic observed on paths not present in any registered OpenAPI spec → shadow candidate
- Endpoints responding on unexpected ports or subdomains → rogue candidate
- Endpoints with authentication but no known auth policy → policy gap
- Endpoints that have stopped receiving traffic for >30 days → zombie candidate
- External recon discovers endpoints not in internal inventory → external exposure gap

**Alerting thresholds:** All shadow/rogue/zombie detections are gated by confidence score (>0.9 required for automatic flagging, 0.7–0.9 queued for human review).

### 5.4 API Change Tracking & Drift Detection

Every change to an endpoint's observed behavior is recorded as an `EndpointChange`:

```
EndpointChange {
  change_id:      UUID
  endpoint_id:    string
  detected_at:    timestamp
  change_type:    enum(
    NEW_FIELD_IN_REQUEST | REMOVED_FIELD | FIELD_TYPE_CHANGE |
    NEW_AUTH_REQUIREMENT | AUTH_REMOVED | STATUS_CODE_CHANGE |
    NEW_RESPONSE_FIELD | RATE_LIMIT_CHANGE | NEW_PII_FIELD |
    SCHEMA_BREAKING_CHANGE | ENDPOINT_DELETED | ENDPOINT_RESURRECTED
  )
  before_state:   SchemaSnapshot
  after_state:    SchemaSnapshot
  confidence:     float
  first_traffic:  int64 (event count before flagging)
}
```

Drift detection runs as a continuous stream processor. Changes are diffed against the last known good schema state per endpoint. Breaking changes immediately trigger posture re-evaluation.

### 5.5 GraphQL-Specific Discovery

GraphQL APIs require specialized handling:

- Parse `__schema` introspection responses (when available) to build full type graph
- When introspection is disabled (production best practice), reconstruct schema from observed query/mutation patterns
- Track query complexity drift — sudden increase in max depth may indicate introspection bypass or DoS attempt
- Detect batch query abuse patterns
- Map field resolver coverage against known schema types

### 5.6 MCP Server Discovery

Model Context Protocol servers are a new class of API that must be discovered and inventoried separately.

**Discovery methods:**
- Traffic pattern analysis: MCP uses JSON-RPC 2.0 over HTTP/SSE — detect from Content-Type and body structure
- Port/path heuristics: MCP servers often run on non-standard ports or `/mcp`, `/sse` paths
- External recon: scan known infrastructure for open MCP endpoints
- Agent registry integration: if tenant uses an agent orchestrator, pull server manifest

**MCP Endpoint record extensions:**
- `mcp_tools`: []ToolDefinition (name, description, input schema, permissions)
- `mcp_resources`: []ResourceDefinition
- `connected_agents`: []AgentIdentity (correlated from traffic)
- `permission_surface`: computed surface area of tools x permissions
- `is_shadow_mcp`: bool (not registered with internal orchestrator)

---

## 6. Posture Governance Engine

### 6.1 OpenAPI Reconstruction Pipeline

The platform reconstructs OpenAPI 3.1 specifications from observed traffic. This is a core differentiator — most organizations have incomplete or absent specs.

**Reconstruction pipeline:**

```
Traffic Observations → Field Extraction → Type Inference → Example Collection
→ Schema Synthesis → Conflict Resolution → Spec Assembly → Validation (spectral)
→ Confidence Scoring → Spec Registry
```

**Type inference rules:**
- Integer detection: all observed values are whole numbers → integer
- UUID detection: values match UUID pattern → string/format:uuid
- Enum detection: field has ≤20 distinct values observed across >100 samples → enum
- Date/time detection: values parseable as ISO8601 → string/format:date-time
- Email detection: values match email pattern → string/format:email
- Array detection: field consistently contains JSON arrays → array type

**Confidence scoring:**
- Each reconstructed spec has a field-level confidence score (0.0–1.0)
- Overall spec confidence = weighted average of field confidences
- Low-confidence fields are flagged for human review
- Spec is marked `RECONSTRUCTED` vs `AUTHORITATIVE` (tenant-uploaded)

**Drift validation:**
When an authoritative spec exists, every observed request/response is validated against it. Violations are recorded as `SchemaConformanceEvent` and feed into posture scoring.

### 6.2 Policy Engine

Governance policies are expressed as composable rules evaluated against endpoint state.

**Built-in policy library (day-one):**

| Policy ID | Description | Severity |
|-----------|-------------|----------|
| `AUTH_MISSING` | Endpoint has no authentication requirement | CRITICAL |
| `AUTH_WEAK` | Endpoint uses HTTP Basic or API key without TLS | HIGH |
| `NO_RATE_LIMIT` | Endpoint has no observable rate limiting behavior | HIGH |
| `PII_UNAUTHENTICATED` | Endpoint returns PII data without authentication | CRITICAL |
| `SCHEMA_BREAKING_DRIFT` | Endpoint behavior deviates from authoritative spec | HIGH |
| `SENSITIVE_IN_URL` | PII or credentials observed in URL query parameters | HIGH |
| `EXCESSIVE_DATA` | Response returns significantly more data than expected | MEDIUM |
| `MISSING_CORS` | Cross-origin requests accepted without CORS policy | MEDIUM |
| `INSECURE_TLS` | Endpoint accepts TLS 1.0 or 1.1 | HIGH |
| `ADMIN_EXPOSED` | Admin endpoint accessible from public internet | CRITICAL |
| `ZOMBIE_ENDPOINT` | Endpoint inactive >30 days but still reachable | MEDIUM |
| `SHADOW_ENDPOINT` | Endpoint not in any registered spec or inventory | HIGH |
| `MCP_NO_AUTH` | MCP server accessible without authentication | CRITICAL |
| `MCP_OVER_PERMISSIONED` | MCP tool grants permissions not consistent with use | HIGH |
| `GRAPHQL_INTROSPECTION_PUBLIC` | GraphQL introspection enabled in production | HIGH |
| `BOLA_RISK` | Endpoint pattern matches BOLA-vulnerable structure | HIGH |
| `MASS_ASSIGNMENT_RISK` | PUT/PATCH endpoint accepts undocumented fields | HIGH |

**Custom policy DSL:**

```yaml
policy:
  id: "custom-payment-auth"
  name: "Payment endpoints require OAuth2 with payment scope"
  description: "All endpoints handling payment operations must require OAuth2 bearer tokens with explicit payment:write scope"
  
  selector:
    endpoint_labels:
      - handles_payments: true
    path_pattern: "/payments/*"
  
  conditions:
    - field: auth_mechanisms
      operator: contains
      value: OAUTH2
    - field: required_scopes
      operator: contains
      value: "payment:write"
  
  on_violation:
    severity: CRITICAL
    action: ALERT
    ticket_template: "payment-auth-gap"
    block_if_enforced: true
```

### 6.3 Risk Scoring Model

Risk score is a composite of posture violations, runtime exposure, and business context.

```
RiskScore = (
  posture_component   * 0.40 +
  runtime_component   * 0.35 +
  business_component  * 0.25
)

posture_component = weighted sum of active policy violations (by severity)
runtime_component = function of:
  - attack_attempts_last_7d (normalized)
  - anomaly_rate_last_24h (normalized)
  - data_exfiltration_signals
  - auth_failure_spike
business_component = function of:
  - is_revenue_generating endpoint (tenant-labeled)
  - pii_volume (records/day estimated)
  - regulatory_exposure (GDPR, PCI, HIPAA applicability)
  - external_facing (vs internal-only)
```

Risk scores are recomputed continuously (stream) and stored as time-series for trend analysis.

---

## 7. Behavioral Intelligence & ML Detection Engine

### 7.1 Architecture: Layered Detection

Detection runs in three layers, each with different latency and depth characteristics:

```
Layer 1: Real-time Rules (< 10ms)
  → Deterministic rule evaluation on each event
  → High-confidence, low-FP patterns (known attack signatures, auth failures, rate violations)
  → Produces immediate alert candidates

Layer 2: Sliding Window Analytics (seconds to minutes)
  → Stream processing with 1-min, 5-min, 15-min windows
  → Rate-based anomalies, burst detection, sequence anomalies
  → Actor-level aggregation

Layer 3: Long-Window ML Models (hours to weeks)
  → Actor behavior baselines built over 30–90 day windows
  → Unsupervised anomaly detection on behavioral vectors
  → Supervised classification for known attack patterns
  → Produces high-confidence findings with evidence
```

### 7.2 Actor Modeling

Every API caller is modeled as an `Actor` with a persistent behavioral profile.

**Actor Identity Resolution:**
- Primary key: hashed token identifier (jti, API key hash, session token hash)
- Secondary: IP + User-Agent fingerprint (for unauthenticated actors)
- Tertiary: behavioral fingerprint (timing patterns, endpoint access sequence)
- Actor type classification: HUMAN, SERVICE, BOT, AI_AGENT

**Behavioral vector (per actor, 90-day window):**

```
ActorBehaviorProfile {
  actor_id:                   string
  tenant_id:                  string
  
  // Access patterns
  endpoint_access_set:        HyperLogLog (distinct endpoints accessed)
  access_sequence_model:      MarkovChain (transition probabilities between endpoints)
  temporal_pattern:           []HourlyActivity (24-hour activity histogram)
  typical_request_rate:       PercentileDistribution (p50/p95/p99 req/min)
  
  // Object access patterns (for BOLA detection)
  object_access_ratio:        float (own-objects / other-objects)
  unique_object_ids_accessed: HyperLogLog (per object type)
  object_enumeration_score:   float (0.0–1.0, sequential ID access signal)
  
  // Response patterns
  typical_response_sizes:     PercentileDistribution
  error_rate_baseline:        float
  
  // Identity signals
  ip_diversity:               HyperLogLog (distinct source IPs)
  geo_diversity:              []Country (with timestamps)
  impossible_travel_flag:     bool
  
  // Computed
  bot_probability:            float (0.0–1.0)
  anomaly_score_7d:           float
  last_updated:               timestamp
}
```

### 7.3 Detection Models

#### BOLA/IDOR Detection
**Model:** Object enumeration + access ratio anomaly detection

Key signals:
- Actor accessing object IDs they do not own (cross-account access ratio spike)
- Sequential object ID enumeration (ID++, ID+2, ID+3 pattern)
- Accessing objects across multiple accounts in same session
- Response differences on owned vs. unowned object access (403 vs 200 ratio shift)

Minimum detection window: 72 hours (low-and-slow BOLA requires patience)

#### BFLA (Broken Function Level Authorization) Detection
**Model:** Role-function access graph violation detection

- Build expected function access map per actor role
- Alert on actor accessing functions outside their role's historical access set
- Privilege escalation detection: actor calling admin functions after compromising regular user token

#### Credential Stuffing Detection
**Model:** Auth failure pattern + actor diversity analysis

- Auth failure rate spike per endpoint (sliding 5-min window)
- High IP diversity with low user diversity (many IPs, same usernames)
- Credential combo cycling pattern (username fixed, password cycling)
- Known breached credential list matching (haveibeenpwned-style lookup, hashed)

#### Account Takeover (ATO) Detection
**Model:** Post-auth behavioral shift detection

- Geographic impossibility (IP geo shift > 5000km within 1 hour)
- Device/User-Agent change immediately post-authentication
- Sudden activity in new endpoint clusters not in historical profile
- Bulk data access within short window post-auth

#### Business Logic Abuse Detection
See Section 8 (dedicated).

#### Scraping/Data Harvesting Detection
**Model:** Response volume + sequential enumeration + rate pattern

- Response byte volume per actor-day exceeds baseline by >3 sigma
- Endpoint access sequence matches enumeration pattern (sorted IDs, alphabetical slugs)
- Zero variation in request structure (identical headers, params differ by single variable)
- Consistent inter-request timing (bot signature)

#### API Abuse / Quota Gaming Detection
- Actor consuming resources at rates inconsistent with stated use case
- Bypassing rate limiting via distributed IP rotation
- Token sharing/pooling (one token, many IPs = token distribution abuse)

### 7.4 ML Model Pipeline

```
Training Data → Feature Engineering → Model Training → Validation 
→ Shadow Mode (run without alerting) → A/B Test vs. existing rules 
→ Canary Release (5% of tenants) → Full Rollout
```

**Feature engineering for behavioral models:**

All features are computed per (tenant, actor, endpoint, time_window):

- Request rate percentiles (p50, p95, p99)
- Error rate by status code bucket
- Response size distribution moments (mean, std, skew, kurtosis)
- Endpoint transition entropy (how "random" vs. "systematic" is the access pattern)
- Object ID access diversity (per object type)
- Auth context diversity (how many distinct tokens/sessions in window)
- Temporal entropy (how uniform is activity across hours)

**Model types in production:**

| Detection Target | Model Type | Window | Retrain Frequency |
|-----------------|------------|--------|-------------------|
| Credential Stuffing | Gradient Boosting + Rules | 5m | Weekly |
| BOLA | Isolation Forest + Access Graph | 72h | Weekly |
| ATO | One-Class SVM + Behavioral Shift | 24h | Daily |
| Scraping | Unsupervised Clustering | 1h | Daily |
| Business Logic Abuse | Custom Graph Neural Network | 7d | Bi-weekly |
| MCP Privilege Abuse | Rule-Based + LLM Classifier | 15m | On-demand |

**Explainability requirement:** Every ML-generated alert must include:
- Top 5 contributing features with their values vs. baseline
- "Normal" behavior example for contrast
- Confidence score with calibration note
- MITRE ATT&CK mapping (where applicable)
- OWASP API Security Top 10 mapping

### 7.5 False Positive Management

False positive rates destroy platform adoption. Hard requirements:

- Every alert type has a documented false positive rate measured monthly
- Alert suppression: actor-level allowlisting, endpoint-level exceptions, time-window suppression
- Feedback loop: analyst "false positive" or "true positive" feedback retrains models
- New detection rules must pass shadow-mode for 14 days with <5% FP rate before promotion
- Global suppression rules: known good actors (monitoring, health checks, internal CI)

---

## 8. Business Logic Security Engine

### 8.1 The Business Logic Graph

The core innovation of your platform. Competitors use heuristics; you build a real model of application intent.

**Construction:**
1. Observe all API traffic over initial 14-day learning window
2. Extract actor sessions (group requests by session token)
3. Build session workflows: ordered sequences of API calls within a session
4. Cluster workflows by similarity → discover "normal user journeys"
5. For each journey, extract: entry point, terminal points, permitted transitions, object access patterns
6. Cross-reference with OpenAPI spec to label endpoints with semantic roles
7. Produce the `BusinessLogicGraph` (BLG): directed graph of endpoint transitions with edge weights

```
BusinessLogicGraph {
  graph_id:       string
  tenant_id:      string
  version:        int
  built_at:       timestamp
  
  nodes: []EndpointNode {
    endpoint_id:     string
    semantic_role:   enum(AUTH | DISCOVERY | READ | WRITE | DELETE | PAYMENT | ADMIN)
    entry_frequency: float (% of sessions that start here)
    exit_frequency:  float (% of sessions that end here)
  }
  
  edges: []WorkflowEdge {
    from_endpoint:   string
    to_endpoint:     string
    weight:          float (transition probability)
    min_time_ms:     int (minimum realistic time between calls)
    max_time_ms:     int (maximum realistic time between calls)
    required:        bool (must precede endpoint? e.g., auth before checkout)
  }
  
  forbidden_transitions: []TransitionViolation
  // e.g., accessing /admin/** before /auth/login is always forbidden
}
```

### 8.2 Logic Violation Detection

With the BLG built, violations are detected by comparing observed session behavior to the graph:

**Violation Types:**

- **Prerequisite skip:** Actor accesses `/checkout/complete` without traversing `/cart/add` (step skipping)
- **Forbidden transition:** Actor jumps from public endpoint directly to admin function
- **Impossible timing:** Two sequential API calls with < min_time_ms between them (automation signal)
- **Workflow reversal:** Actor traverses workflow backwards (search → detail → listing = unusual)
- **Role violation:** Actor with USER role triggers ADMIN-classified endpoint
- **Object ownership skip:** Actor references object IDs in their workflow that they never legitimately obtained

### 8.3 Workflow Reconstruction for Evidence

When a logic violation is detected, the engine reconstructs the full workflow sequence as evidence:

```
WorkflowEvidence {
  incident_id:         string
  actor_id:            string
  session_id:          string
  violation_type:      string
  
  observed_sequence:   []WorkflowStep {
    step_index:        int
    timestamp:         int64
    endpoint_id:       string
    request_summary:   RequestSummary (redacted)
    anomaly_flag:      bool
    expected_next:     []string (what the model expected)
  }
  
  normal_comparison:   SimilarNormalSession
  // A real normal session for contrast (anonymized)
  
  attack_hypothesis:   string
  confidence:          float
  owasp_mapping:       string
}
```

---

## 9. Agentic AI & MCP Security Layer (Next-Gen Differentiator)

This is the most critical section for 2025–2026 differentiation. No competitor has a production-ready answer here.

### 9.1 Threat Model for Agentic AI

Based on OWASP Top 10 for Agentic Applications (2026) and real-world MCP breach data:

| Threat | Description | API-Level Indicator |
|--------|-------------|---------------------|
| **Prompt Injection via API** | Malicious prompt embedded in API response consumed by agent | Unusual characters, instruction-like text in response bodies |
| **MCP Tool Privilege Escalation** | Agent invokes MCP tools with permissions beyond its granted scope | Tool calls outside declared permission surface |
| **Shadow MCP Server** | Unauthorized MCP server deployed without security review | Traffic to unregistered MCP endpoints |
| **Agent Memory Poisoning** | Attacker corrupts agent's context/memory via API response manipulation | Anomalous write patterns to memory/state APIs |
| **A2A Trust Chain Abuse** | Compromised agent calls other agents, escalating privileges via delegation | Chained agent calls with token forwarding |
| **Inference API Abuse** | Excessive or adversarial calls to LLM inference endpoints | Rate anomalies, adversarial prompt patterns in requests |
| **Context Window Overflow** | Deliberate injection of large context to override agent instructions | Abnormally large request bodies to AI endpoints |
| **Tool Misuse** | Agent manipulated into using legitimate tools for malicious purposes | Semantic mismatch between agent's stated task and tool invoked |

### 9.2 MCP Traffic Analysis

**MCP-specific detection pipeline:**

1. **Classify MCP traffic:** All JSON-RPC 2.0 traffic analyzed; `method` field extracted
2. **Build tool invocation profile:** Which tools does each agent invoke, with what parameters, how often
3. **Permission surface mapping:** Compare declared tool permissions vs. actual invocation patterns
4. **Cross-agent correlation:** When agent A invokes agent B, track delegated permission chain
5. **Prompt injection scanning:** Analyze `content` fields in tool results for injected instructions

**MCP-specific policies:**
- `MCP_TOOL_NOT_DECLARED`: Agent invokes a tool not in its declared manifest
- `MCP_PERMISSION_DRIFT`: Tool invoking capabilities beyond its declared permission set
- `MCP_INJECTION_DETECTED`: Tool result contains probable prompt injection payload
- `MCP_SHADOW_SERVER`: MCP server not in organizational registry
- `MCP_EXCESSIVE_DATA_READ`: Agent reading orders of magnitude more data than expected for its stated task

### 9.3 Agent Identity & Trust Chain

Every agent interaction must be traceable to a root identity:

```
AgentIdentity {
  agent_id:         string
  agent_type:       enum(ORCHESTRATOR | SUBAGENT | TOOL_AGENT | HUMAN_PROXY)
  parent_agent_id:  string (null if root)
  trust_chain:      []TrustLink (full delegation chain)
  declared_scope:   []Permission
  effective_scope:  []Permission (actual permissions used)
  human_principal:  string (the human user who initiated the chain)
}
```

Trust chain violations: if `effective_scope` exceeds `declared_scope` at any node in the chain → CRITICAL alert.

### 9.4 Prompt Injection Detection at API Layer

Prompt injection attacks arrive via API responses consumed by agents. Detect them before the agent processes them.

**Detection approach:**
- Pattern matching: known injection prefixes ("Ignore previous instructions", "You are now", "SYSTEM:")
- Semantic classifier: fine-tuned classification model on injection vs. normal content
- Structural anomaly: instruction-like text in fields that should contain data (product descriptions, user names, addresses)
- Unicode abuse: homoglyphs, invisible characters, direction override characters in API responses

**Enforcement option:** Block or sanitize responses containing injection patterns before forwarding to agent. This requires inline mode for the MCP traffic.

---

## 10. Automated Security Testing Pipeline

### 10.1 Test Orchestration Architecture

The testing engine runs continuous automated security tests against your tenants' APIs — like having a 24x7 red team.

**Test types:**

| Category | Tests | Frequency |
|----------|-------|-----------|
| Authentication | Missing auth, weak tokens, token fixation, session reuse | Every spec change |
| Authorization | BOLA (automated object enumeration), BFLA (role escalation), privilege drift | Daily |
| Injection | SQLi, NoSQLi, Command injection, SSTI, SSRF | Every spec change |
| Business Logic | Workflow skip, price manipulation, race conditions | Weekly |
| Data Exposure | Excessive data return, PII in response, verbose errors | Daily |
| Rate Limiting | Endpoint flood test, distributed rate bypass | Weekly |
| Schema Conformance | Request fuzzing against spec boundaries | Every spec change |
| MCP-Specific | Tool permission escalation, injection via tool result | On MCP change |

### 10.2 Safe Testing Guarantees

Testing against production APIs requires safety controls:

- All test payloads are marked with a `X-APISecurity-Test-ID` header for easy log exclusion
- Test accounts are provisioned in a dedicated test tenant (tenant-provided or platform-created)
- Destructive operations (DELETE, state-modifying) require explicit opt-in per endpoint
- Payment endpoints: test-mode tokens only, never real payment instruments
- Rate limiting: test concurrency is capped at 10% of endpoint's observed normal traffic
- PII-safe payloads: synthetic data only (faker library, no real PII)
- Rollback hooks: for stateful tests, cleanup step is always defined before test begins

### 10.3 CI/CD Integration

Security testing integrates natively into developer pipelines:

```yaml
# GitHub Actions example
- name: API Security Scan
  uses: apisec-platform/scan-action@v2
  with:
    api_key: ${{ secrets.APISEC_KEY }}
    openapi_spec: ./api/openapi.yaml
    target_url: https://staging.api.example.com
    test_suite: ["auth", "authorization", "injection", "schema"]
    fail_on_severity: HIGH
    report_format: sarif  # GitHub Code Scanning compatible
```

**CI/CD behaviors:**
- SARIF output for GitHub/GitLab Code Scanning integration
- JUnit XML for Jenkins/CircleCI test result integration
- Inline PR comments on discovered vulnerabilities (GitHub App)
- Block merge on CRITICAL findings (configurable)
- Delta scan: only test endpoints changed in this PR (faster CI loops)

---

## 11. Sensitive Data & Privacy Engine

### 11.1 PII Detection & Tokenization

**Detection pipeline (runs at ingestion, before any storage):**

1. Parse request/response body (JSON, form-encoded, XML, multipart)
2. For each field value, run entity detector:
   - Regex patterns: credit card numbers, SSNs, phone numbers, email addresses
   - ML classifier: names, addresses, passport numbers, medical record numbers
   - Context-aware: field name "email" → mark even if value format is unusual
3. Assign PIICategory: `EMAIL | PHONE | SSN | CREDIT_CARD | NAME | ADDRESS | MEDICAL | FINANCIAL | BIOMETRIC | CREDENTIAL`
4. Tokenize: replace detected value with format-preserving token (`PII_EMAIL_a3f2c1`)
5. Store token→value mapping in encrypted PII vault (per-tenant, isolated)

**Format-preserving tokenization:** The tokenized value preserves format structure (e.g., a 16-digit token replacing a 16-digit credit card number) so downstream analytics still work.

### 11.2 PII Inventory & Exposure Map

**PII Inventory:** Continuously maintained map of which endpoints handle which PII categories.

**Exposure Hotspots:** Endpoints where PII:
- Is returned to unauthenticated callers
- Is logged in access logs (visible in URL params)
- Is transmitted without TLS
- Is returned in bulk (>100 records per response)

**Data Flow Reporting:** For compliance reporting (GDPR, CCPA, HIPAA), generate:
- Which endpoints touch which PII categories
- Which actors have accessed which PII
- Retention timeline per PII category
- Third-party API exposure (PII sent to external APIs)

### 11.3 Per-Tenant Retention Policy

```
TenantRetentionPolicy {
  tenant_id:                    string
  
  // Default: redact everything
  full_payload_retention:       bool (default: false)
  retain_request_headers:       bool (default: false; auth headers always stripped)
  retain_response_bodies:       bool (default: false)
  
  // If full retention enabled:
  retention_encryption_key_id:  string (tenant-managed KMS key)
  retention_period_days:        int (default: 90, max: 365)
  
  // PII overrides
  pii_categories_to_retain:     []PIICategory (default: none)
  pii_vault_enabled:            bool (default: true)
}
```

---

## 12. Storage Architecture: Hot/Warm/Cold Tiers

### 12.1 Hot Store (Operational, 0–7 days)

**Technology:** PostgreSQL 16 + TimescaleDB extension

**What lives here:**
- Current endpoint inventory (APIEndpoint records)
- Active policy violations
- Recent alerts and incidents (7 days)
- Actor profiles (current behavioral state)
- Live risk scores
- Recent test results

**Performance requirements:**
- p99 query latency < 50ms for dashboard queries
- Upsert throughput: 50k endpoint state updates/sec
- Index strategy: endpoint_id, tenant_id, risk_score (composite), last_seen_at (BRIN)

**TimescaleDB hypertables for time-series:**
- `api_events_hot` (event metrics, not raw events — aggregated per minute)
- `risk_score_history` (hourly snapshots per endpoint)
- `actor_metrics` (per-actor hourly aggregates)

### 12.2 Warm Store (Analytics, 7–90 days)

**Technology:** ClickHouse (columnar, optimized for analytical queries)

**What lives here:**
- Aggregated event metrics (per endpoint, per actor, per hour)
- Behavioral model feature vectors (per actor)
- Test results history
- Compliance report datasets
- Alert history

**ClickHouse design:**
- Partitioned by `(tenant_id, toYYYYMM(event_time))`
- Compression: ZSTD level 3 for all columns
- Materialized views for pre-computed aggregates (hourly rollups, actor behavior summaries)
- ReplicatedMergeTree for HA

### 12.3 Cold Store (Archival, 90+ days)

**Technology:** S3-compatible object storage (AWS S3, GCP GCS, MinIO for on-prem)

**What lives here:**
- Raw event archives (parquet format, partitioned by tenant/date)
- Full behavioral model snapshots
- Compliance archives (immutable, WORM policy)
- Evidence packages (linked from incident records)

**Format:** Apache Parquet with Snappy compression

**Lifecycle policy:**
- Hot → Warm: automatic at 7 days
- Warm → Cold: automatic at 90 days
- Cold retention: per-tenant policy (default 1 year, configurable to 7 years for regulated industries)

### 12.4 Cache Layer

**Technology:** Redis 7 Cluster

**Cached objects:**
- Endpoint inventory (30s TTL, invalidated on change)
- Actor profiles (5m TTL, write-through on new events)
- Risk scores (60s TTL)
- Policy evaluation results (2m TTL)
- Rate limit counters (no TTL — sliding window counters)
- Authentication token validation cache (token hash → valid/invalid, 5m TTL)

---

## 13. Stream Processing & Real-Time Analytics

### 13.1 Stream Processing Architecture

**Technology:** Apache Flink or Redpanda Transforms (simpler) for stream processing

**Processing topology:**

```
Kafka[events.enriched.{tenant}] 
  → FilterOperator (per-tenant routing)
  → SplitStream:
      │── EndpointMetricsAggregator (tumbling 1-min windows)
      │── ActorBehaviorUpdater (session-aware, keyed by actor_id)
      │── RuleEvaluator (stateless, per-event)
      │── AnomalyScorer (sliding 5-min/15-min windows)
      └── BizLogicSequencer (session graph builder)
  → AlertCandidateStream
  → AlertDeduplicator (suppress duplicate alerts within 5 min)
  → AlertStore + NotificationDispatcher
```

### 13.2 Real-Time Rule Evaluation

Rules are evaluated on each event using a stateless operator. Rule DSL is compiled to executable predicates at policy-save time.

```python
# Example compiled rule: credential stuffing burst
def evaluate_auth_failure_burst(event, state):
    if event.response.status_code not in [401, 403]:
        return None
    
    key = (event.tenant_id, event.endpoint_id, window_1min(event.timestamp))
    state.increment(key)
    
    count = state.get(key)
    distinct_actors = state.hll_count(f"{key}:actors")
    
    if count > 100 and distinct_actors > 50:
        return Alert(
            type="CREDENTIAL_STUFFING",
            severity="HIGH",
            evidence={"auth_failure_count": count, "distinct_actors": distinct_actors},
            window="1m"
        )
```

### 13.3 Pre-Computed Aggregates

Dashboard queries must be fast. All heavy aggregations are pre-computed and stored in ClickHouse materialized views or Redis:

| Aggregate | Granularity | Storage | Refresh |
|-----------|-------------|---------|---------|
| Events per endpoint per hour | Per tenant | ClickHouse MV | Streaming |
| Top 10 risk endpoints | Per tenant | Redis | 60s |
| Auth failure rate by endpoint | Per tenant | ClickHouse MV | Streaming |
| PII exposure summary | Per tenant | ClickHouse MV | 5m |
| Active alerts count by severity | Per tenant | Redis | 30s |
| Actor anomaly leaderboard | Per tenant | Redis | 2m |
| Compliance posture score | Per tenant | PostgreSQL | On change |

---

## 14. Control Plane: Tenant Isolation, RBAC & Audit

### 14.1 Multi-Tenant Isolation

**Isolation guarantees (non-negotiable):**

- All database queries include `WHERE tenant_id = ?` as a mandatory filter — enforced at ORM/query builder level, never by convention
- Separate Kafka topic namespaces per tenant (`events.*.{tenant_id}`)
- Separate Redis keyspace per tenant (prefix: `t:{tenant_id}:*`)
- ML models never share training data across tenants
- Cold store: separate S3 prefix with separate IAM policy per tenant
- Encryption: separate KMS key per tenant for data-at-rest

**Tenant onboarding checklist:**
1. Create tenant record + UUID
2. Provision Kafka topics
3. Create database schema (row-level security policy)
4. Generate KMS data key
5. Initialize Redis keyspace
6. Create S3 prefix + lifecycle policy
7. Set default retention policy
8. Provision initial quota configuration
9. Create default alert channels
10. Run health check

### 14.2 RBAC Model

```
Roles:
  PLATFORM_ADMIN     → full access, cross-tenant visibility
  TENANT_ADMIN       → full access within tenant
  SECURITY_ANALYST   → read alerts, read inventory, read evidence; no config changes
  API_DEVELOPER      → read own team's API inventory, read test results; no alert access
  COMPLIANCE_OFFICER → read compliance reports, read data flow; no operational data
  READONLY_VIEWER    → read dashboard summaries only

Permissions (scoped to resources):
  inventory:read | inventory:write
  alerts:read | alerts:write | alerts:suppress
  policy:read | policy:write | policy:delete
  evidence:read
  tests:read | tests:write | tests:execute
  tenant:config:read | tenant:config:write
  compliance:read | compliance:export
  audit_log:read
```

### 14.3 Audit Log

Every state-changing operation produces an immutable audit record:

```
AuditRecord {
  audit_id:       UUID (v7)
  tenant_id:      string
  timestamp:      int64
  actor:          string (user ID)
  actor_ip:       string
  action:         string (e.g., "policy.create", "alert.suppress", "tenant.config.update")
  resource_type:  string
  resource_id:    string
  before_state:   JSON (null for creates)
  after_state:    JSON (null for deletes)
  result:         enum(SUCCESS | FAILURE | PARTIAL)
  reason:         string (for failures)
}
```

Audit logs are written to an append-only store (PostgreSQL with no-delete policy + S3 mirroring). They feed compliance exports and are queryable by COMPLIANCE_OFFICER role.

### 14.4 Quota Management

```
TenantQuota {
  tenant_id:          string
  
  // Ingestion
  max_events_per_sec: int
  max_events_per_day: int64
  
  // Storage
  hot_store_gb:       int
  cold_store_gb:      int
  
  // Compute
  ml_inference_per_hour: int
  test_runs_per_day:     int
  
  // API
  api_requests_per_min:  int
  
  // Notifications
  alerts_per_hour:       int
  webhooks_per_hour:     int
}
```

Quota enforcement is real-time via Redis counters with sliding windows. Exceeding quota returns HTTP 429 with Retry-After header and triggers quota-exceeded notification to tenant admin.

---

## 15. Enforcement & Response Layer

### 15.1 Out-of-Band Mode (Default)

In out-of-band mode, the platform only produces alerts and evidence. Enforcement is manual or via webhook-triggered WAF rules.

This is the correct default — inline enforcement without confidence is dangerous in production.

### 15.2 Inline Enforcement (Optional, Opt-In)

For tenants who want real-time blocking, the platform provides enforcement hooks:

**Enforcement mechanisms:**

| Mechanism | Latency | Confidence Required | Use Case |
|-----------|---------|---------------------|----------|
| WAF Rule Push (Cloudflare, Akamai, F5) | 2–10s | >0.95 | IP blocking, pattern blocking |
| API Gateway Rate Limit Override | 1–5s | >0.90 | Dynamic rate limiting |
| Token Invalidation (Auth Provider API) | 1–3s | >0.95 | Stolen token, ATO response |
| Deceptive Response (honeypot mode) | < 1ms | >0.80 | Return plausible false data to attacker |
| Circuit Breaker (endpoint suspension) | < 1s | >0.99 | Endpoint under active attack |

**Enforcement governance:**
- Every automated enforcement action is logged to audit trail
- Automated blocking requires minimum confidence threshold (configurable per action type)
- Human-in-the-loop mode: enforcement actions queued for analyst approval if confidence < threshold
- Rollback capability: every block has an expiry and one-click rollback

### 15.3 Response Playbooks

For each alert type, a configurable response playbook defines automatic actions:

```yaml
playbook:
  trigger: CREDENTIAL_STUFFING
  severity_threshold: HIGH
  
  actions:
    - type: NOTIFY
      channels: [slack, pagerduty]
      message_template: "credential-stuffing-alert"
    
    - type: CREATE_TICKET
      system: jira
      project: SEC
      priority: P2
      
    - type: RATE_LIMIT_OVERRIDE
      target: endpoint
      limit: 10  # req/min
      duration_minutes: 60
      requires_confidence: 0.90
      
    - type: BLOCK_IP_LIST
      target: cloudflare
      ips: "{{evidence.source_ips}}"
      duration_hours: 24
      requires_confidence: 0.95
      requires_approval: false  # high confidence → auto-block
```

---

## 16. Integrations, SIEM/SOAR & Compliance Exports

### 16.1 SIEM Integrations

**Push model (recommended):** Platform pushes enriched events and alerts via webhook/Syslog/Kafka.

| SIEM | Integration Method | Format |
|------|--------------------|--------|
| Splunk | HEC (HTTP Event Collector) | JSON |
| Microsoft Sentinel | CEF over Syslog, or Azure Event Hub | CEF/JSON |
| IBM QRadar | Syslog (LEEF format) | LEEF |
| Elastic SIEM | Logstash/Filebeat input or direct ES API | ECS (Elastic Common Schema) |
| Datadog | Log forwarding API | JSON |
| Chronicle (Google) | Ingestion API | UDM |

**Alert enrichment fields added to SIEM events:**
- `api_endpoint_id`: stable endpoint reference
- `actor_behavior_score`: pre-computed anomaly score
- `attack_confidence`: ML confidence
- `owasp_category`: OWASP API Security Top 10 mapping
- `mitre_technique`: MITRE ATT&CK technique ID
- `evidence_url`: deep link to evidence artifact in platform

### 16.2 SOAR Integrations

Pre-built connectors for common SOAR platforms:

- **Palo Alto XSOAR:** Full integration pack with playbook templates
- **Splunk SOAR:** App with action scripts
- **Tines:** Webhook-based automation templates
- **Torq:** Native connector

Each connector exposes platform actions:
- `get_alert_evidence(alert_id)` → structured evidence
- `suppress_alert(alert_id, reason, duration)` → analyst suppression
- `block_actor(actor_id, mechanism, duration)` → enforcement trigger
- `get_actor_history(actor_id, days)` → behavioral context
- `create_test_run(endpoint_ids, test_suite)` → trigger on-demand security test

### 16.3 Compliance Exports

| Framework | Export Type | Frequency |
|-----------|-------------|-----------|
| OWASP API Security Top 10 | Gap report with evidence per category | On-demand + monthly |
| PCI DSS v4.0 (Req 6.2, 6.3, 11.3) | API inventory + test results + anomaly log | Monthly |
| GDPR Article 32 | PII exposure report + data flow map | On-demand |
| SOC 2 Type II | API monitoring evidence + access log | Quarterly |
| NIST SP 800-204C | API security posture against NIST controls | On-demand |
| EU AI Act (Article 9) | AI API risk assessment + MCP inventory | On-demand |

---

## 17. Public API Surface Design

### 17.1 API Design Principles

- RESTful, JSON, OpenAPI 3.1 spec-first
- All APIs versioned under `/api/v2/` (v1 reserved for legacy migration)
- Authentication: JWT bearer (tenant scope) or API key (service scope)
- Pagination: cursor-based (not offset — offset is broken at scale)
- Rate limiting: per-tenant, per-key, expressed via `X-RateLimit-*` headers

### 17.2 Core API Groups

**Ingestion API:**
```
POST /api/v2/ingest/events          → Submit batch of API events (async job)
GET  /api/v2/ingest/jobs/{job_id}   → Check ingestion job status
POST /api/v2/ingest/specs           → Upload OpenAPI spec (authoritative)
```

**Inventory API:**
```
GET  /api/v2/inventory/endpoints              → List endpoints (paginated, filterable)
GET  /api/v2/inventory/endpoints/{id}          → Get endpoint detail + current risk state
GET  /api/v2/inventory/endpoints/{id}/history  → Drift history (paginated)
GET  /api/v2/inventory/endpoints/{id}/schema   → Reconstructed OpenAPI spec fragment
GET  /api/v2/inventory/shadow                  → Shadow/rogue endpoint candidates
GET  /api/v2/inventory/mcp-servers             → MCP server inventory
```

**Policy API:**
```
GET    /api/v2/policies                → List all policies (built-in + custom)
POST   /api/v2/policies                → Create custom policy
GET    /api/v2/policies/{id}           → Get policy detail
PUT    /api/v2/policies/{id}           → Update policy
DELETE /api/v2/policies/{id}           → Delete custom policy
GET    /api/v2/policies/{id}/violations → List current violations for this policy
```

**Alert & Evidence API:**
```
GET  /api/v2/alerts                          → List alerts (filterable, paginated)
GET  /api/v2/alerts/{id}                      → Alert detail
GET  /api/v2/alerts/{id}/evidence             → Structured evidence artifact
POST /api/v2/alerts/{id}/feedback             → Submit TP/FP feedback
POST /api/v2/alerts/{id}/suppress             → Suppress alert
GET  /api/v2/actors/{actor_id}/profile        → Actor behavioral profile
GET  /api/v2/actors/{actor_id}/history        → Actor event history (redacted)
```

**Testing API:**
```
POST /api/v2/tests/runs                      → Create test run
GET  /api/v2/tests/runs/{run_id}             → Get run status + results
GET  /api/v2/tests/runs/{run_id}/findings    → Test findings (SARIF compatible)
GET  /api/v2/tests/history                   → Historical test runs
```

**Compliance API:**
```
GET  /api/v2/compliance/reports                    → List available reports
POST /api/v2/compliance/reports                    → Generate report (async)
GET  /api/v2/compliance/reports/{id}               → Download report
GET  /api/v2/compliance/posture                    → Current posture summary
GET  /api/v2/compliance/data-flows                 → PII data flow map
```

### 17.3 Webhook Events

All platform events are publishable to tenant-configured webhook endpoints:

```
Event types:
  alert.created         → new alert
  alert.severity_changed → escalation/de-escalation
  endpoint.discovered   → new endpoint found
  endpoint.shadow_detected → shadow API found
  endpoint.risk_score_changed → significant risk change (>10 points)
  policy.violation_opened → new policy violation
  policy.violation_resolved → violation resolved
  test.run_completed    → test run finished
  mcp.shadow_server_detected → unregistered MCP server found
  data.pii_exposure_detected → new PII exposure hotspot
```

---

## 18. Infrastructure & Deployment Architecture

### 18.1 Infrastructure Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Application runtime | Rust (detection/ingestion) + Go (control plane API) | Performance + safety |
| Primary DB | PostgreSQL 16 + TimescaleDB | Operational data + time-series |
| Analytical DB | ClickHouse | Columnar, fast aggregations |
| Message bus | Redpanda (Kafka-compatible) | Kafka API, better latency, simpler ops |
| Cache | Redis 7 Cluster | Industry standard, rich data structures |
| Object store | S3-compatible | Cold storage, evidence archives |
| eBPF sensor | C/LLVM + Rust userspace | Zero-overhead capture |
| ML training | Python (PyTorch + scikit-learn) | Ecosystem maturity |
| ML serving | Triton Inference Server or custom Rust ONNX runtime | Low-latency inference |
| Container orchestration | Kubernetes | Industry standard |
| Service mesh | Cilium (eBPF-native) | Consistent with sensor technology |
| Secrets management | HashiCorp Vault or AWS Secrets Manager | Production-grade secret handling |
| Observability | OpenTelemetry + Grafana + Tempo + Loki | Full-stack observability |

### 18.2 Deployment Models

**SaaS (primary):**
- Multi-tenant, managed by platform
- Customer deploys eBPF sensor, log shipper, or gateway plugin
- Traffic mirrors to platform's ingestion endpoints (TLS 1.3, compressed)

**On-Premises (enterprise):**
- Full platform deployed in customer's Kubernetes cluster
- Helm chart with configurable resource limits
- Customer-managed KMS for all encryption
- Air-gapped mode: ML models pre-trained, no external calls

**Hybrid:**
- Sensor and initial processing on-premises
- Analytics and ML in platform cloud
- Sensitive data never leaves customer network (only metadata and hashes transmitted)

### 18.3 High Availability

- All stateful components run with N+1 minimum replicas
- Kafka/Redpanda: 3-broker cluster, replication factor 3
- PostgreSQL: Patroni HA with automatic failover
- Redis: Sentinel or Cluster mode (3+ nodes)
- ClickHouse: Replicated cluster (2 shards, 2 replicas each)
- No single point of failure in any processing path

### 18.4 Disaster Recovery

| Component | RPO | RTO | Strategy |
|-----------|-----|-----|----------|
| PostgreSQL | 5 min | 15 min | Continuous WAL archiving + point-in-time recovery |
| ClickHouse | 1 hour | 30 min | Cross-AZ replication + daily snapshots |
| Kafka | 0 (replicated) | 5 min | Replicated partitions across AZs |
| Redis | 1 min | 5 min | AOF persistence + replicas |
| Cold store | 0 (S3 replicated) | 1 min | S3 cross-region replication |

---

## 19. Test Plan: Load, Correctness, Security, Reliability

### 19.1 Load Testing

**Targets:**
- Sustained ingestion: 1k events/sec (baseline), 10k events/sec (stress), 50k events/sec (spike)
- Multi-tenant: 100 tenants × 100 events/sec simultaneously
- API response times: p99 < 200ms for all dashboard queries, p99 < 50ms for inventory reads
- ML inference: < 100ms per actor behavioral score computation

**Tool:** k6 (load generation) + Prometheus + Grafana (observation)

**Test scenarios:**
1. Ramp test: 0 → 10k events/sec over 10 minutes
2. Sustained test: 10k events/sec for 2 hours (validates no memory leak, no queue backup)
3. Spike test: instant 50k events/sec burst for 60 seconds (validates backpressure)
4. Multi-tenant isolation test: 100 tenants at equal load, validate no cross-tenant interference
5. DLQ recovery test: kill one ingestion worker mid-stream, validate all events eventually processed

### 19.2 Detection Correctness

**BOLA detection accuracy test:**
- Inject synthetic BOLA attack pattern into test tenant (known attacker actor accessing 500 foreign object IDs)
- Validate detection within 72-hour window
- Validate evidence artifact is correctly structured
- Validate no false positives on normal object access patterns

**OpenAPI reconstruction accuracy:**
- Take 10 known APIs with authoritative specs
- Feed only traffic (no spec) to reconstruction pipeline
- Measure field coverage, type accuracy, and enum detection rates
- Target: >85% field coverage, >95% type accuracy

**Credential stuffing detection:**
- Inject 1000 auth failure events from 200 IPs over 5 minutes
- Validate detection fires within 60 seconds
- Validate evidence contains correct IP list and failure count

### 19.3 Security Testing (Platform Self-Testing)

**Tenant isolation:**
- Attempt cross-tenant data access via API with valid but wrong-tenant token
- Validate all queries return empty or 403
- SQL injection attempt on all API parameters
- Validate all inputs are parameterized

**Data redaction:**
- Ingest events containing known PII patterns
- Validate stored records contain tokens, not raw values
- Validate PII vault is not accessible via standard API paths

**RBAC boundary testing:**
- Attempt every API endpoint with each role
- Validate permission model matches documented RBAC matrix
- Token escalation: attempt to use an API-key token to access tenant-admin endpoints

### 19.4 Reliability Testing

**Worker failure recovery:**
- Kill detection-worker mid-processing
- Validate in-flight events are not lost (Kafka consumer group rebalance)
- Validate processing resumes within 30 seconds

**DLQ processing:**
- Inject malformed events (schema violations, unknown fields)
- Validate they route to DLQ
- Validate DLQ metrics are exposed
- Validate retry mechanism processes valid events after malformed events are quarantined

**Kafka lag test:**
- Stop all consumers for 30 minutes (simulate outage)
- Restart consumers
- Validate all events are processed in order, no duplicates

---

## 20. Phased Delivery Roadmap

### Phase 1 — Foundation (Months 1–4)
**Goal:** Ingest traffic, discover APIs, produce posture violations.

- Canonical event schema + schema registry
- Log shipper + gateway mirror ingestion (eBPF sensor deferred to Phase 2)
- Kafka ingestion pipeline with per-tenant quotas
- Endpoint discovery engine (normalization, inventory, shadow detection)
- OpenAPI reconstruction pipeline (v1, confidence-scored)
- Built-in policy library (20 core policies) + policy evaluation engine
- Risk scoring v1 (posture-only)
- PostgreSQL + Redis storage
- Basic REST API (inventory, alerts, policies)
- Multi-tenant RBAC + audit log
- Slack + email notifications

**Exit criteria:** 3 design partners running in production with real traffic. Posture gap discovery working. Zero cross-tenant data leakage confirmed by security test.

### Phase 2 — Detection (Months 5–9)
**Goal:** Behavioral detection, long-window ML, evidence artifacts.

- eBPF sensor v1 (HTTP/HTTPS capture, Kubernetes-native)
- Actor modeling (90-day behavioral profiles)
- Layer 1 rules engine (credential stuffing, auth burst, rate violations)
- Layer 2 sliding window analytics (FLINK stream processing)
- Layer 3 ML models: BOLA, ATO, scraping detection
- Evidence artifact builder
- Risk scoring v2 (posture + runtime signals)
- ClickHouse warm store + cold store (S3)
- SIEM integrations (Splunk, Sentinel)
- Alert feedback loop (TP/FP) → model retraining pipeline

**Exit criteria:** BOLA detection validated on test dataset. False positive rate <5% across all detection rules. ML model shadow-mode passes for 14 days before promotion.

### Phase 3 — Testing & Business Logic (Months 10–14)
**Goal:** Automated security testing, business logic graph, CI/CD integration.

- Automated security testing engine (auth, authorization, injection, schema)
- Business logic graph construction (v1)
- Business logic violation detection
- CI/CD integrations (GitHub Actions, GitLab CI, Jenkins)
- GraphQL-specific discovery + testing
- SOAR integrations (XSOAR, Splunk SOAR)
- Compliance exports (OWASP, PCI, GDPR)
- Enforcement layer v1 (WAF rule push, rate limit override)
- On-premises Helm chart (enterprise tier)

**Exit criteria:** Automated testing catching known-vulnerable API (OWASP crAPI) with >90% detection rate. Business logic graph production-stable for 3 design partners.

### Phase 4 — Agentic AI & Scale (Months 15–20)
**Goal:** MCP security, agentic AI protection, production-grade scale.

- MCP server discovery + inventory
- MCP traffic analysis + tool invocation profiling
- Prompt injection detection at API layer
- Agent identity + trust chain tracking
- A2A privilege escalation detection
- eBPF sensor v2 (gRPC, GraphQL, WebSocket, MCP/SSE)
- Scale validation: 50k events/sec, 1000 tenants
- AI-powered remediation suggestions (LLM-generated, validated)
- EU AI Act compliance export
- Revenue-aware risk scoring (business context integration)
- Deceptive response enforcement (honeypot mode)

**Exit criteria:** Platform operational at 10k events/sec sustained with p99 < 200ms dashboard queries. MCP security validated against real agentic workload.

---

## 21. What Every Competitor Gets Wrong — Your Edge

| Dimension | Market | Your Platform |
|-----------|--------|---------------|
| **Detection window** | Minutes to hours (Wallarm), days (Salt) | 90 days, fully persistent behavioral memory |
| **Business logic** | Manual tuning (AppSentinels), absent (Wallarm/Akamai) | Auto-constructed BLG from traffic, continuously updated |
| **MCP/Agentic security** | Conceptual or very early (Salt 2025, unproven) | Purpose-built: tool invocation profiling, trust chain tracking, prompt injection detection |
| **Evidence quality** | Alert blobs with IP lists | Structured, reproducible evidence packages: full workflow reconstruction, before/after normal comparison, MITRE mapping |
| **Capture method** | Agent or gateway required | eBPF — zero app changes, zero proxy, captures pre-encryption |
| **False positives** | "AI-driven" = many FPs in practice | Shadow-mode gating, feedback loop retraining, multi-layer confidence gating |
| **Developer experience** | Security-team-only dashboards | Native CI/CD, SARIF output, PR comments, code-level remediation |
| **Inline + long-window** | Either one or the other | Both: long-window ML for detection + optional inline enforcement with confidence gating |
| **Revenue-aware risk** | Technical severity only | Business context: revenue exposure, PII volume, regulatory surface in risk score |
| **Tenant isolation** | Claimed, rarely verified | Hard namespace guarantees, security-tested, documented model |

---

## APPENDIX A: Key Technology Decisions Reference

| Decision | Choice | Alternatives Considered | Reason |
|----------|--------|-------------------------|--------|
| eBPF sensor language | C (eBPF) + Rust (userspace) | Go (userspace) | Rust memory safety; C required for kernel programs |
| Message bus | Redpanda | Kafka, Pulsar | Kafka API compatibility, better operational simplicity, lower latency |
| Control plane language | Go | Java, Rust | Fast iteration, good concurrency, strong ecosystem |
| Detection engine language | Rust | Go, C++ | Memory safety critical in security-processing path |
| Primary DB | PostgreSQL + TimescaleDB | CockroachDB, MySQL | TimescaleDB time-series native; PostgreSQL ecosystem maturity |
| Analytical DB | ClickHouse | Druid, Pinot, BigQuery | Best latency for interactive analytical queries at mid-scale |
| ML serving | ONNX Runtime (Rust binding) | Python FastAPI inference | Eliminates Python runtime from critical path; sub-10ms inference |
| Schema format | Avro + Schema Registry | Protobuf, JSON Schema | Strong typing, evolution semantics, good tooling |

---

## APPENDIX B: Critical Anti-Patterns to Avoid

1. **Do not share ML models across tenants.** Even if a model is "anonymized", behavioral fingerprinting across tenants is a privacy violation and creates regulatory liability.

2. **Do not store raw PII in event logs before redaction.** Redaction must happen in the ingestion pipeline before any write. Logs of the ingestion pipeline must also be scrubbed.

3. **Do not use offset-based pagination on event queries.** Offsets are inaccurate on live data and scale poorly. Use cursor-based pagination always.

4. **Do not auto-block without confidence thresholds.** Automated blocking with <90% confidence will cause production outages and destroy platform trust faster than any breach.

5. **Do not alert without evidence.** An alert with no evidence is noise. A platform that creates noise gets ignored. Evidence is not optional.

6. **Do not treat MCP as "just another API".** MCP servers expose tool invocation surfaces that control autonomous agent behavior. They require dedicated security analysis, not just standard API monitoring.

7. **Do not promise ML accuracy you cannot measure.** Every ML-based detection claim must have a documented, reproducible evaluation methodology and a stated false positive rate from real data.

8. **Do not skip the shadow-mode promotion process.** New detection rules that go straight to production alerts without shadow-mode validation will create FP floods and analyst fatigue.

9. **Do not use row-offset tenancy isolation.** Row-level tenancy (all tenants in same table, filtered by tenant_id) is dangerous. Use row-level security (RLS) policies enforced at the PostgreSQL level, not just at the application level.

10. **Do not build inline enforcement before your detection confidence is proven.** Out-of-band detection first is not a compromise — it is a correct sequencing decision. Blocking on unproven detections is worse than not blocking.

---

*This SKILL.md represents the complete production-ready engineering plan for a next-generation API security platform. All competitive analysis is based on publicly available product documentation, Gartner Peer Insights, and 2025–2026 threat intelligence reports. Platform design decisions are original and optimized to exceed existing market capabilities across all dimensions.*

*Last updated: March 2026*
*Research basis: Salt Security ACE architecture docs, AppSentinels GigaOm 2025 report, Wallarm ThreatStats 2025/2026, Traceable State of API Security 2025, SecurityWeek Cyber Insights 2026, Gartner Peer Reviews (API Protection market), eBPF Foundation 2025 Year in Review, OWASP Top 10 for Agentic Applications 2026.*
