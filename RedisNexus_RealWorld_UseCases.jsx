import { useState } from "react";

const C = {
  bg: "#06060a", surface: "#0e0e14", card: "#13131b", cardHover: "#1a1a24",
  border: "#222233", borderActive: "#dc382d", primary: "#dc382d", primaryDim: "#dc382d1a",
  text: "#f0f0f5", muted: "#9898b0", dim: "#55556a",
  green: "#22c55e", greenDim: "#22c55e15", blue: "#3b82f6", blueDim: "#3b82f615",
  yellow: "#eab308", yellowDim: "#eab30815", purple: "#a855f7", purpleDim: "#a855f715",
  cyan: "#06b6d4", cyanDim: "#06b6d415", orange: "#f97316", orangeDim: "#f9731615",
  pink: "#ec4899", pinkDim: "#ec489915",
};

const industries = [
  {
    id: "fintech",
    icon: "💹",
    label: "FinTech & Trading",
    color: C.green,
    tagline: "Sub-millisecond trades, zero data loss",
    useCases: [
      {
        title: "Live Price Cache",
        problem: "Stock API gives 100ms response. Traders need <1ms.",
        solution: "Cache prices with 2-5 second TTL. Cache-aside pattern.",
        tools: ["redis_set", "redis_get"],
        commands: `# Cache NIFTY price (5 second freshness)
redis_set(key="price:NIFTY", value='{"price":22850,"vol":1.2M}', ttl_seconds=5)

# Trader requests price → cache HIT in 0.1ms
redis_get(key="price:NIFTY")`,
        impact: "100ms → 0.1ms (1000x faster)",
      },
      {
        title: "Duplicate Order Prevention",
        problem: "Network retry sends same BUY order twice. Double execution = loss.",
        solution: "Distributed lock with SETNX. First request wins, duplicates blocked.",
        tools: ["redis_set"],
        commands: `# First request: lock acquired ✅
redis_set(key="lock:order:ORD001", value="proc_1", 
          ttl_seconds=30, only_if_not_exists=True)

# Duplicate request: lock exists ❌ blocked
redis_set(key="lock:order:ORD001", value="proc_2",
          only_if_not_exists=True)  
# Returns: "Key already exists. SET NX did not overwrite."`,
        impact: "Zero duplicate trades in production",
      },
      {
        title: "Trade Audit Trail",
        problem: "Regulators need complete trade history. DB writes are slow.",
        solution: "Redis Streams = append-only log. Write fast, process async.",
        tools: ["redis_stream_add", "redis_stream_read"],
        commands: `# Every trade → stream (instant)
redis_stream_add(key="trades:audit", fields={
  "order_id": "ORD001", "action": "BUY",
  "symbol": "NIFTY", "qty": "50", 
  "price": "22850", "client": "C042"
}, max_length=100000)

# Auditor reads history
redis_stream_read(key="trades:audit", count=100)`,
        impact: "Complete audit trail, zero lost trades",
      },
      {
        title: "Real-Time Leaderboard",
        problem: "Show top performing traders/stocks. SQL query takes 2 seconds.",
        solution: "Sorted Set with price/P&L as score. O(log N) updates.",
        tools: ["redis_sorted_set_add", "redis_sorted_set_range"],
        commands: `# Update scores as trades happen
redis_sorted_set_add(key="rank:pnl:today", members={
  "trader_raj": 45200, "trader_amit": 38900,
  "trader_priya": 52100
})

# Top 10 traders — instant
redis_sorted_set_range(key="rank:pnl:today", 
  start=0, stop=9, reverse=True)`,
        impact: "2 second SQL → 0.05ms Redis",
      },
    ],
  },
  {
    id: "ecommerce",
    icon: "🛒",
    label: "E-Commerce",
    color: C.blue,
    tagline: "Handle flash sales, cart sessions, inventory",
    useCases: [
      {
        title: "Shopping Cart (Session)",
        problem: "User adds items to cart. Must persist across pages, expire after 30 min.",
        solution: "Hash per cart. Each field = product. TTL = session timeout.",
        tools: ["redis_hash_set", "redis_hash_get"],
        commands: `# User adds items to cart
redis_hash_set(key="cart:user:U1001", fields={
  "SKU_001": '{"name":"iPhone 16","qty":1,"price":79999}',
  "SKU_042": '{"name":"AirPods","qty":2,"price":12999}'
}, ttl_seconds=1800)  # 30 min session

# Checkout page loads cart
redis_hash_get(key="cart:user:U1001")`,
        impact: "Cart loads in 0.2ms, auto-expires abandoned carts",
      },
      {
        title: "Flash Sale Inventory Lock",
        problem: "10,000 users click BUY on 100 items simultaneously. Overselling = disaster.",
        solution: "Atomic DECR on stock counter. When 0, sale over.",
        tools: ["redis_set", "redis_pipeline_execute"],
        commands: `# Before sale: set stock
redis_set(key="stock:FLASH_IPHONE", value="100")

# Each purchase: atomic decrement
redis_pipeline_execute(commands=[
  {"cmd": "DECR", "args": ["stock:FLASH_IPHONE"]},
  {"cmd": "GET", "args": ["stock:FLASH_IPHONE"]}
])
# If result < 0 → SOLD OUT, refund this order`,
        impact: "10K concurrent users, zero overselling",
      },
      {
        title: "Product Search Cache",
        problem: "Elasticsearch query for 'blue shoes size 10' takes 200ms. Same search repeated 1000x/min.",
        solution: "Hash search query → cache key. Cache results with 5 min TTL.",
        tools: ["redis_set", "redis_get", "redis_cache_strategy"],
        commands: `# AI recommends the strategy
redis_cache_strategy(
  use_case="product search results caching",
  read_write_ratio="95:5",
  consistency_requirement="eventual"
)

# Cache search results
redis_set(key="search:hash_abc123", 
  value='[{product results}]', ttl_seconds=300)`,
        impact: "95% cache hit rate, search feels instant",
      },
      {
        title: "Rate Limiting (API Protection)",
        problem: "Bot sends 10,000 requests/second to your checkout API.",
        solution: "INCR counter per IP per second. Block if > threshold.",
        tools: ["redis_pipeline_execute"],
        commands: `# For each API request:
redis_pipeline_execute(commands=[
  {"cmd": "INCR", "args": ["ratelimit:IP:192.168.1.1:1709136000"]},
  {"cmd": "EXPIRE", "args": ["ratelimit:IP:192.168.1.1:1709136000", "1"]}
])
# If count > 100 → HTTP 429 Too Many Requests`,
        impact: "Bots blocked, real users unaffected",
      },
    ],
  },
  {
    id: "saas",
    icon: "☁️",
    label: "SaaS Platforms",
    color: C.purple,
    tagline: "Multi-tenant isolation, feature flags, sessions",
    useCases: [
      {
        title: "Multi-Tenant Data Isolation",
        problem: "50 customers share one Redis. Tenant A must never see Tenant B's data.",
        solution: "Prefix-based namespacing + tenant_ops tool for management.",
        tools: ["redis_tenant_ops", "redis_scan_keys"],
        commands: `# Check tenant resource usage
redis_tenant_ops(tenant_id="acme_corp", action="stats")
# → Total keys: 14,200 | Memory: 89MB | Hit rate: 94%

# Set per-tenant limits
redis_tenant_ops(tenant_id="acme_corp", action="isolate")
# → max_keys: 10000, max_memory: 256MB

# Offboard a customer — clean removal
redis_tenant_ops(tenant_id="churned_co", action="cleanup")
# → 3,400 keys deleted`,
        impact: "Complete tenant isolation, easy onboarding/offboarding",
      },
      {
        title: "Feature Flags (Instant Toggle)",
        problem: "Deploy new feature to 10% of users. Roll back instantly if broken.",
        solution: "Hash stores flag config. Apps check Redis on every request.",
        tools: ["redis_hash_set", "redis_hash_get"],
        commands: `# Set feature flags
redis_hash_set(key="flags:global", fields={
  "new_dashboard": '{"enabled":true,"rollout":10}',
  "ai_chat": '{"enabled":true,"rollout":100}',
  "dark_mode": '{"enabled":false,"rollout":0}'
})

# App checks on every request (0.1ms)
redis_hash_get(key="flags:global", 
  fields=["new_dashboard"])

# Instant rollback: just update the hash
redis_hash_set(key="flags:global", fields={
  "new_dashboard": '{"enabled":false,"rollout":0}'
})`,
        impact: "Deploy/rollback in <1 second, no redeploy needed",
      },
      {
        title: "User Session Management",
        problem: "100K concurrent users. Sessions must survive server restarts.",
        solution: "Hash per session. User profile + permissions + state all in one key.",
        tools: ["redis_hash_set", "redis_hash_get", "redis_delete"],
        commands: `# Login → create session
redis_hash_set(key="sess:S_abc123", fields={
  "user_id": "U1001",
  "name": "Rajkumar",
  "role": "admin",
  "tenant": "santhira",
  "permissions": "read,write,admin",
  "login_time": "1709136000"
}, ttl_seconds=3600)  # 1 hour

# Every API request → validate session (0.1ms)
redis_hash_get(key="sess:S_abc123", 
  fields=["user_id", "role", "permissions"])

# Logout → destroy
redis_delete(keys=["sess:S_abc123"], confirm=True)`,
        impact: "100K sessions, 0.1ms auth check, auto-expire",
      },
      {
        title: "Real-Time Notifications",
        problem: "When admin changes settings, all 50 app servers need to know instantly.",
        solution: "Pub/Sub — publish event, all subscribers get it in <1ms.",
        tools: ["redis_publish"],
        commands: `# Admin updates config
redis_publish(channel="config:updates", message='{
  "event": "CONFIG_CHANGED",
  "key": "pricing_plans",
  "changed_by": "admin@santhira.com",
  "timestamp": 1709136000
}')
# → "Message delivered to 50 subscribers"

# All 50 app servers update their local config instantly`,
        impact: "Config propagation: minutes → milliseconds",
      },
    ],
  },
  {
    id: "ai",
    icon: "🤖",
    label: "AI & ML Applications",
    color: C.cyan,
    tagline: "LLM caching, embedding store, inference queues",
    useCases: [
      {
        title: "LLM Response Cache (Semantic)",
        problem: "Same question asked 100 times. Each GPT/Claude call = $0.01 + 2 seconds.",
        solution: "Hash the prompt → cache response. Save 99% of LLM costs.",
        tools: ["redis_set", "redis_get"],
        commands: `# Hash the user prompt
# prompt_hash = md5("What is Redis?")

# Cache the LLM response
redis_set(key="llm:cache:abc123hash", value='{
  "response": "Redis is an in-memory data store...",
  "model": "claude-sonnet-4-20250514",
  "tokens": 250,
  "cached_at": 1709136000
}', ttl_seconds=86400)  # 24 hour cache

# Next time same question → cache HIT
redis_get(key="llm:cache:abc123hash")
# 0.1ms instead of 2000ms, $0 instead of $0.01`,
        impact: "$500/month LLM bill → $50/month (90% savings)",
      },
      {
        title: "AI Job Queue (Inference Pipeline)",
        problem: "100 users upload images for AI processing simultaneously. GPU can handle 5 at a time.",
        solution: "Redis List as job queue. Workers BRPOP jobs, process, return results.",
        tools: ["redis_list_push", "redis_list_range", "redis_hash_set"],
        commands: `# User submits AI job → queue
redis_list_push(key="queue:ai:image_process", 
  values=['{"job_id":"J001","image":"s3://bucket/img.jpg","task":"classify"}'],
  direction="left")

# GPU worker pops jobs (blocks until available)
# BRPOP queue:ai:image_process 30

# Worker stores result
redis_hash_set(key="job:J001", fields={
  "status": "completed",
  "result": "cat (confidence: 0.97)",
  "processing_time": "1.2s"
})`,
        impact: "No lost jobs, GPU 100% utilized, auto-backpressure",
      },
      {
        title: "Rate Limiting AI APIs",
        problem: "Free tier: 10 requests/minute. Pro tier: 1000/minute. Must enforce per-user.",
        solution: "Sliding window counter with INCR + TTL per user.",
        tools: ["redis_pipeline_execute", "redis_get"],
        commands: `# Each API call: increment user's counter
redis_pipeline_execute(commands=[
  {"cmd": "INCR", "args": ["ratelimit:user:U1001:minute"]},
  {"cmd": "EXPIRE", "args": ["ratelimit:user:U1001:minute", "60"]}
])

# Check limit before processing
redis_get(key="ratelimit:user:U1001:minute")
# If > user's plan limit → HTTP 429`,
        impact: "Fair usage enforced, no abuse, zero overhead",
      },
      {
        title: "Chatbot Conversation State",
        problem: "AI chatbot needs to remember last 10 messages. Stateless server can't store this.",
        solution: "List per conversation. LPUSH new messages, LTRIM to keep last N.",
        tools: ["redis_list_push", "redis_list_range"],
        commands: `# User sends message → append to history
redis_list_push(key="chat:conv:C001", values=[
  '{"role":"user","content":"Book appointment for tomorrow"}'
], direction="left")

# Keep only last 20 messages
# LTRIM chat:conv:C001 0 19

# Load context for AI → last 20 messages
redis_list_range(key="chat:conv:C001", start=0, stop=19)
# Feed this to LLM as conversation history`,
        impact: "Stateless servers + stateful conversations",
      },
    ],
  },
  {
    id: "iot",
    icon: "📡",
    label: "IoT & Real-Time",
    color: C.orange,
    tagline: "Sensor data, device state, geo-tracking",
    useCases: [
      {
        title: "Device State Dashboard",
        problem: "10,000 IoT sensors sending data every 5 seconds. Dashboard shows current state.",
        solution: "Hash per device. Update fields on each reading. Dashboard reads latest.",
        tools: ["redis_hash_set", "redis_hash_get", "redis_scan_keys"],
        commands: `# Sensor pushes update every 5 seconds
redis_hash_set(key="device:SENS_001", fields={
  "temperature": "42.5",
  "humidity": "68",
  "battery": "87",
  "last_seen": "1709136000",
  "location": "Chennai_Factory_Floor_3"
}, ttl_seconds=60)  # If no update in 60s → device offline

# Dashboard loads any device instantly
redis_hash_get(key="device:SENS_001")

# Find all devices on factory floor 3
redis_scan_keys(pattern="device:SENS_*")`,
        impact: "10K devices, real-time dashboard, auto-offline detection",
      },
      {
        title: "Alert Stream Processing",
        problem: "When temperature > 80°C, alert must reach operators in <1 second.",
        solution: "Pub/Sub for instant alerts + Stream for persistent alert history.",
        tools: ["redis_publish", "redis_stream_add"],
        commands: `# Sensor detects critical temperature
redis_publish(channel="alerts:critical", message='{
  "device": "SENS_001",
  "type": "TEMP_HIGH",
  "value": 85.2,
  "threshold": 80,
  "location": "Factory_Floor_3"
}')  # Instant to all operator dashboards

# Also log to stream for history
redis_stream_add(key="alerts:history", fields={
  "device": "SENS_001", "type": "TEMP_HIGH",
  "value": "85.2", "timestamp": "1709136000"
}, max_length=50000)`,
        impact: "Alert delivery <1ms, full history for analysis",
      },
    ],
  },
  {
    id: "gaming",
    icon: "🎮",
    label: "Gaming & Social",
    color: C.pink,
    tagline: "Leaderboards, matchmaking, live presence",
    useCases: [
      {
        title: "Global Leaderboard",
        problem: "1 million players, real-time rankings, top 100 shown on homepage.",
        solution: "Sorted Set. Score = player points. ZREVRANGE for top N.",
        tools: ["redis_sorted_set_add", "redis_sorted_set_range"],
        commands: `# Player scores update in real-time
redis_sorted_set_add(key="leaderboard:global", members={
  "player_ninja42": 98500,
  "player_dragon99": 87200,
  "player_shadow": 105300
})

# Top 100 — instant even with 1M players
redis_sorted_set_range(key="leaderboard:global",
  start=0, stop=99, reverse=True, with_scores=True)

# "What's my rank?" — O(log N)
# ZREVRANK leaderboard:global player_ninja42`,
        impact: "1M players ranked in O(log N), top-100 in 0.05ms",
      },
      {
        title: "Online Presence (Who's Online)",
        problem: "Show which friends are online. 500K concurrent users.",
        solution: "Set of online user IDs. SADD on connect, SREM on disconnect.",
        tools: ["redis_pipeline_execute", "redis_scan_keys"],
        commands: `# User comes online
redis_pipeline_execute(commands=[
  {"cmd": "SADD", "args": ["online:users", "user_42"]},
  {"cmd": "SADD", "args": ["online:game:fortnite", "user_42"]}
])

# Check if friend is online
# SISMEMBER online:users friend_99

# How many playing Fortnite right now?
# SCARD online:game:fortnite → 12,847`,
        impact: "500K users tracked, presence check in 0.05ms",
      },
    ],
  },
  {
    id: "healthcare",
    icon: "🏥",
    label: "Healthcare",
    color: C.green,
    tagline: "Patient sessions, appointment queues, cache prescriptions",
    useCases: [
      {
        title: "Appointment Queue System",
        problem: "Clinic has 50 patients/day. Need FIFO queue with priority for emergencies.",
        solution: "Sorted Set: score = priority + timestamp. Emergencies get lowest score (first).",
        tools: ["redis_sorted_set_add", "redis_sorted_set_range"],
        commands: `# Regular appointment (score = timestamp)
redis_sorted_set_add(key="queue:clinic:DR_001", members={
  "patient_P001": 1709136000,  # 10:00 AM regular
  "patient_P002": 1709136060,  # 10:01 AM regular
})

# EMERGENCY — score = 0 (always first)
redis_sorted_set_add(key="queue:clinic:DR_001", members={
  "patient_P003": 0  # Emergency → top of queue
})

# Doctor sees next patient
redis_sorted_set_range(key="queue:clinic:DR_001",
  start=0, stop=0, with_scores=True)`,
        impact: "Fair queue + emergency priority, zero wait confusion",
      },
      {
        title: "Patient Data Cache",
        problem: "Doctor opens patient file. DB query = 500ms. Opens 50 files/day.",
        solution: "Cache patient summary in Hash. TTL = doctor's session.",
        tools: ["redis_hash_set", "redis_hash_get"],
        commands: `# On first access: cache patient data
redis_hash_set(key="patient:P001:summary", fields={
  "name": "Tamil Patient Name",
  "age": "45",
  "blood_group": "O+",
  "allergies": "Penicillin",
  "last_visit": "2026-02-15",
  "active_prescriptions": "Metformin 500mg"
}, ttl_seconds=3600)  # Cache for doctor's shift

# Every subsequent access: 0.1ms
redis_hash_get(key="patient:P001:summary")`,
        impact: "500ms → 0.1ms per patient file open",
      },
    ],
  },
];

const CategoryPill = ({ label, color, active, onClick }) => (
  <button onClick={onClick} style={{
    padding: "8px 16px",
    borderRadius: 20,
    border: `1px solid ${active ? color : C.border}`,
    background: active ? `${color}18` : "transparent",
    color: active ? color : C.muted,
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    transition: "all 0.2s",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  }}>
    {label}
  </button>
);

export default function RealWorldUseCases() {
  const [activeIndustry, setActiveIndustry] = useState("fintech");
  const [expandedUseCase, setExpandedUseCase] = useState(null);

  const industry = industries.find(i => i.id === activeIndustry);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Hero */}
      <div style={{
        padding: "40px 24px 32px",
        textAlign: "center",
        borderBottom: `1px solid ${C.border}`,
        background: `radial-gradient(ellipse at 50% 0%, ${C.primaryDim} 0%, transparent 60%)`,
      }}>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 16px",
          borderRadius: 20,
          background: C.primaryDim,
          border: `1px solid ${C.primary}33`,
          marginBottom: 16,
        }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: `linear-gradient(135deg, ${C.primary}, #ff6b5a)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "white", fontFamily: "monospace" }}>R</div>
          <span style={{ color: C.primary, fontSize: 12, fontWeight: 600 }}>RedisNexus MCP</span>
        </div>
        <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.2 }}>
          Real-World Use Cases
        </h1>
        <p style={{ margin: "0 auto", color: C.muted, fontSize: 14, maxWidth: 550 }}>
          Every industry, every scale. See exactly which MCP tools to use, the Redis commands behind them, and the performance impact.
        </p>

        {/* Stats */}
        <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 24 }}>
          {[
            { n: "7", l: "Industries" },
            { n: "22", l: "Use Cases" },
            { n: "16", l: "MCP Tools" },
            { n: "<1ms", l: "Avg Latency" },
          ].map(s => (
            <div key={s.l}>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: C.primary }}>{s.n}</div>
              <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Industry Selector */}
      <div style={{
        padding: "14px 24px",
        borderBottom: `1px solid ${C.border}`,
        background: `${C.surface}dd`,
        backdropFilter: "blur(12px)",
        position: "sticky",
        top: 0,
        zIndex: 100,
        display: "flex",
        gap: 8,
        overflowX: "auto",
        justifyContent: "center",
        flexWrap: "wrap",
      }}>
        {industries.map(ind => (
          <CategoryPill
            key={ind.id}
            label={`${ind.icon} ${ind.label}`}
            color={ind.color}
            active={activeIndustry === ind.id}
            onClick={() => { setActiveIndustry(ind.id); setExpandedUseCase(null); }}
          />
        ))}
      </div>

      {/* Content */}
      <main style={{ padding: 24, maxWidth: 920, margin: "0 auto" }}>
        {/* Industry Header */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 36 }}>{industry.icon}</span>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{industry.label}</h2>
            <p style={{ margin: "4px 0 0", color: industry.color, fontSize: 13, fontWeight: 500 }}>{industry.tagline}</p>
          </div>
        </div>

        {/* Use Cases */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {industry.useCases.map((uc, i) => {
            const isExpanded = expandedUseCase === `${activeIndustry}-${i}`;
            return (
              <div key={i} style={{
                background: C.card,
                border: `1px solid ${isExpanded ? industry.color + "66" : C.border}`,
                borderRadius: 12,
                overflow: "hidden",
                transition: "border-color 0.2s",
              }}>
                {/* Header — always visible */}
                <div
                  onClick={() => setExpandedUseCase(isExpanded ? null : `${activeIndustry}-${i}`)}
                  style={{
                    padding: "16px 20px",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: `${industry.color}22`,
                        color: industry.color,
                        fontFamily: "monospace",
                      }}>
                        #{i + 1}
                      </span>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>{uc.title}</h3>
                    </div>
                    <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>
                      <span style={{ color: C.primary, fontWeight: 600 }}>Problem:</span> {uc.problem}
                    </p>
                  </div>
                  <span style={{
                    fontSize: 18,
                    color: C.dim,
                    transition: "transform 0.2s",
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                    flexShrink: 0,
                    marginLeft: 12,
                  }}>▾</span>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div style={{
                    padding: "0 20px 20px",
                    borderTop: `1px solid ${C.border}`,
                  }}>
                    {/* Solution */}
                    <div style={{
                      margin: "16px 0",
                      padding: "12px 16px",
                      background: `${C.greenDim}`,
                      borderLeft: `3px solid ${C.green}`,
                      borderRadius: "0 8px 8px 0",
                    }}>
                      <span style={{ color: C.green, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Solution</span>
                      <p style={{ color: C.text, fontSize: 13, margin: "4px 0 0", lineHeight: 1.5 }}>{uc.solution}</p>
                    </div>

                    {/* Tools Used */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                      <span style={{ color: C.dim, fontSize: 11, fontWeight: 600, marginRight: 4 }}>MCP Tools:</span>
                      {uc.tools.map(t => (
                        <span key={t} style={{
                          fontSize: 10,
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: C.primaryDim,
                          color: C.primary,
                          fontFamily: "'JetBrains Mono', monospace",
                          fontWeight: 600,
                        }}>{t}</span>
                      ))}
                    </div>

                    {/* Code */}
                    <div style={{
                      borderRadius: 8,
                      overflow: "hidden",
                      border: `1px solid ${C.border}`,
                    }}>
                      <div style={{
                        padding: "6px 12px",
                        background: C.surface,
                        borderBottom: `1px solid ${C.border}`,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ff5f57" }} />
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#febc2e" }} />
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#28c840" }} />
                        <span style={{ color: C.dim, fontSize: 10, fontFamily: "monospace", marginLeft: 6 }}>RedisNexus MCP Commands</span>
                      </div>
                      <pre style={{
                        margin: 0,
                        padding: 14,
                        background: "#0a0a0e",
                        color: "#d4d4d8",
                        fontSize: 11.5,
                        lineHeight: 1.65,
                        fontFamily: "'JetBrains Mono', monospace",
                        overflowX: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}>
                        {uc.commands}
                      </pre>
                    </div>

                    {/* Impact */}
                    <div style={{
                      marginTop: 12,
                      padding: "10px 14px",
                      background: `${industry.color}12`,
                      border: `1px solid ${industry.color}33`,
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}>
                      <span style={{ fontSize: 16 }}>⚡</span>
                      <div>
                        <span style={{ color: C.dim, fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>Impact</span>
                        <p style={{ color: industry.color, fontSize: 13, margin: "2px 0 0", fontWeight: 600 }}>{uc.impact}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div style={{
          marginTop: 32,
          padding: 24,
          background: C.card,
          border: `1px solid ${C.primary}33`,
          borderRadius: 12,
          textAlign: "center",
        }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>🚀 Works for Any Application</h3>
          <p style={{ color: C.muted, fontSize: 13, margin: "0 0 16px", maxWidth: 500, marginLeft: "auto", marginRight: "auto" }}>
            RedisNexus MCP Server works with any app that needs fast data. Just connect the MCP endpoint and let AI handle the Redis complexity.
          </p>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: C.cyan }}>
            python redis_mcp_server.py --http --port=8000
          </div>
        </div>
      </main>
    </div>
  );
}
