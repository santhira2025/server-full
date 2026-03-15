import { useState } from "react";

const COLORS = {
  bg: "#09090b",
  surface: "#111116",
  card: "#16161d",
  border: "#27272a",
  primary: "#dc382d",
  primaryDim: "#dc382d22",
  text: "#fafafa",
  textMuted: "#a1a1aa",
  textDim: "#52525b",
  green: "#22c55e",
  greenDim: "#22c55e18",
  blue: "#3b82f6",
  blueDim: "#3b82f618",
  yellow: "#eab308",
  yellowDim: "#eab30818",
  purple: "#a855f7",
  purpleDim: "#a855f718",
  cyan: "#06b6d4",
  cyanDim: "#06b6d418",
  orange: "#f97316",
};

const CodeBlock = ({ title, children, lang = "bash" }) => (
  <div style={{ marginBottom: 16, borderRadius: 10, overflow: "hidden", border: `1px solid ${COLORS.border}` }}>
    {title && (
      <div style={{
        padding: "8px 14px",
        background: COLORS.surface,
        borderBottom: `1px solid ${COLORS.border}`,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <div style={{ display: "flex", gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff5f57" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#febc2e" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#28c840" }} />
        </div>
        <span style={{ color: COLORS.textMuted, fontSize: 11, fontFamily: "monospace" }}>{title}</span>
      </div>
    )}
    <pre style={{
      margin: 0,
      padding: 14,
      background: "#0c0c10",
      color: "#e4e4e7",
      fontSize: 12,
      lineHeight: 1.7,
      fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
      overflowX: "auto",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    }}>
      {children}
    </pre>
  </div>
);

const StepCard = ({ number, title, description, children, color = COLORS.primary }) => (
  <div style={{
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: 24,
    marginBottom: 20,
    position: "relative",
    borderLeft: `3px solid ${color}`,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
      <div style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: `${color}22`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        fontWeight: 800,
        color: color,
        fontFamily: "monospace",
        flexShrink: 0,
      }}>{number}</div>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: COLORS.text }}>{title}</h3>
    </div>
    {description && <p style={{ color: COLORS.textMuted, fontSize: 13, margin: "0 0 16px", lineHeight: 1.6 }}>{description}</p>}
    {children}
  </div>
);

const FlowArrow = ({ label }) => (
  <div style={{ textAlign: "center", padding: "8px 0" }}>
    <div style={{ color: COLORS.primary, fontSize: 18 }}>↓</div>
    {label && <span style={{ color: COLORS.textDim, fontSize: 10 }}>{label}</span>}
  </div>
);

const UseCaseCard = ({ icon, product, scenario, tools, result }) => (
  <div style={{
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    padding: 16,
    transition: "border-color 0.2s",
  }}
    onMouseEnter={e => e.currentTarget.style.borderColor = COLORS.primary}
    onMouseLeave={e => e.currentTarget.style.borderColor = COLORS.border}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ color: COLORS.cyan, fontSize: 12, fontWeight: 600 }}>{product}</span>
    </div>
    <p style={{ color: COLORS.text, fontSize: 13, margin: "0 0 10px", fontWeight: 500 }}>{scenario}</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
      {tools.map(t => (
        <span key={t} style={{
          fontSize: 10,
          padding: "2px 8px",
          borderRadius: 4,
          background: COLORS.primaryDim,
          color: COLORS.primary,
          fontFamily: "monospace",
          fontWeight: 600,
        }}>{t}</span>
      ))}
    </div>
    <p style={{ color: COLORS.green, fontSize: 11, margin: 0, fontStyle: "italic" }}>→ {result}</p>
  </div>
);

const sections = [
  { id: "setup", label: "1. Setup", icon: "🔧" },
  { id: "connect", label: "2. Connect", icon: "🔌" },
  { id: "daily", label: "3. Daily Use", icon: "💡" },
  { id: "products", label: "4. Your Products", icon: "🏢" },
  { id: "architecture", label: "5. Architecture", icon: "🏗️" },
];

export default function UsageGuide() {
  const [activeSection, setActiveSection] = useState("setup");

  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.bg,
      color: COLORS.text,
      fontFamily: "'DM Sans', -apple-system, sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <header style={{
        padding: "20px 24px",
        borderBottom: `1px solid ${COLORS.border}`,
        background: `${COLORS.surface}ee`,
        backdropFilter: "blur(12px)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: `linear-gradient(135deg, ${COLORS.primary}, #ff6b5a)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: 15, color: "white", fontFamily: "monospace",
          }}>R</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>RedisNexus Usage Guide</h1>
            <span style={{ fontSize: 11, color: COLORS.textMuted }}>How to use it — from zero to production</span>
          </div>
        </div>

        <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {sections.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: activeSection === s.id ? 600 : 400,
              background: activeSection === s.id ? COLORS.primaryDim : "transparent",
              color: activeSection === s.id ? COLORS.primary : COLORS.textMuted,
              fontFamily: "inherit",
              transition: "all 0.15s",
            }}>
              {s.icon} {s.label}
            </button>
          ))}
        </nav>
      </header>

      <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>

        {/* ===== SETUP ===== */}
        {activeSection === "setup" && (
          <>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700 }}>🔧 Setup RedisNexus</h2>
              <p style={{ color: COLORS.textMuted, fontSize: 13, margin: 0 }}>3 ways to run — pick what fits your setup</p>
            </div>

            <StepCard number="A" title="Local Development (Your Laptop)" color={COLORS.green}
              description="Fastest way to start. Needs Redis running locally + Python 3.10+">
              <CodeBlock title="terminal — setup">
{`# 1. Make sure Redis is running
redis-cli ping   # Should return PONG

# 2. Install dependencies
cd redis_nexus_mcp/
pip install -r requirements.txt

# 3. Start MCP Server (stdio mode — for Claude Desktop)
python redis_mcp_server.py

# OR start as HTTP server (for remote access)
python redis_mcp_server.py --http --port=8000`}
              </CodeBlock>
            </StepCard>

            <StepCard number="B" title="Docker (Self-Hosted Server)" color={COLORS.blue}
              description="Run on any server with Docker. Best for staging/testing.">
              <CodeBlock title="terminal — docker">
{`# 1. Build the container
docker build -t santhira/redis-nexus-mcp .

# 2. Run with your Redis
docker run -d \\
  --name redis-nexus \\
  -p 8000:8000 \\
  -e REDIS_URL=redis://your-redis-host:6379 \\
  santhira/redis-nexus-mcp

# 3. Test it
curl http://localhost:8000/health`}
              </CodeBlock>
            </StepCard>

            <StepCard number="C" title="Kubernetes (Production)" color={COLORS.purple}
              description="Full production stack with HA Redis, auto-scaling, monitoring, backups.">
              <CodeBlock title="terminal — kubernetes">
{`# 1. Deploy entire stack (Redis + MCP Server + Monitoring)
kubectl apply -f k8s/redis-nexus-full.yaml

# 2. Check everything is running
kubectl get pods -n redis-nexus
# Expected:
#   redis-master-0          2/2   Running   (redis + exporter)
#   redis-nexus-mcp-xxx     1/1   Running   (mcp server)
#   redis-nexus-mcp-yyy     1/1   Running   (mcp server replica)

# 3. Check Redis is healthy
kubectl exec -it redis-master-0 -n redis-nexus \\
  -- redis-cli -a $REDIS_PASSWORD INFO server

# 4. MCP endpoint is live at:
# https://redis-nexus.santhira.com/mcp`}
              </CodeBlock>
            </StepCard>
          </>
        )}

        {/* ===== CONNECT ===== */}
        {activeSection === "connect" && (
          <>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700 }}>🔌 Connect AI to Redis</h2>
              <p style={{ color: COLORS.textMuted, fontSize: 13, margin: 0 }}>The magic — AI assistants can now control Redis directly</p>
            </div>

            <StepCard number="1" title="Connect to Claude Desktop" color={COLORS.primary}
              description="Add RedisNexus as an MCP server in Claude Desktop config.">
              <CodeBlock title="~/.config/claude/claude_desktop_config.json">
{`{
  "mcpServers": {
    "redis-nexus": {
      "command": "python",
      "args": ["/path/to/redis_mcp_server.py"],
      "env": {
        "REDIS_URL": "redis://localhost:6379"
      }
    }
  }
}`}
              </CodeBlock>
              <p style={{ color: COLORS.textMuted, fontSize: 12 }}>After saving, restart Claude Desktop. You'll see RedisNexus tools available.</p>
            </StepCard>

            <StepCard number="2" title="Connect via HTTP (Remote / Claude.ai)" color={COLORS.blue}
              description="For Kubernetes deployment or remote access.">
              <CodeBlock title="MCP endpoint URL">
{`# Your MCP endpoint (after K8s deployment):
https://redis-nexus.santhira.com/mcp

# Or local HTTP:
http://localhost:8000/mcp

# Test with curl:
curl -X POST http://localhost:8000/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"tool": "redis_server_info", "params": {}}'`}
              </CodeBlock>
            </StepCard>

            <StepCard number="3" title="Connect from Python Code (Direct API)" color={COLORS.green}
              description="Use RedisNexus tools programmatically in your apps.">
              <CodeBlock title="python — direct integration">
{`from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import json

async def use_redis_nexus():
    server = StdioServerParameters(
        command="python",
        args=["redis_mcp_server.py"]
    )
    
    async with stdio_client(server) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            
            # List all available tools
            tools = await session.list_tools()
            print(f"Available: {len(tools.tools)} tools")
            
            # Use any tool
            result = await session.call_tool(
                "redis_health_check",
                {"include_slow_log": True}
            )
            print(result.content[0].text)`}
              </CodeBlock>
            </StepCard>

            <StepCard number="4" title="Connect from n8n Workflow" color={COLORS.orange}
              description="Integrate with your existing n8n automation workflows.">
              <CodeBlock title="n8n — HTTP Request node">
{`// n8n HTTP Request Node Configuration:
// Method: POST
// URL: http://redis-nexus-mcp:8000/mcp
// Body (JSON):
{
  "tool": "redis_cache_strategy",
  "params": {
    "use_case": "API rate limiting for NOREN trading",
    "read_write_ratio": "90:10",
    "consistency_requirement": "eventual"
  }
}

// Use the response in next n8n nodes
// to auto-configure your Redis caching`}
              </CodeBlock>
            </StepCard>
          </>
        )}

        {/* ===== DAILY USE ===== */}
        {activeSection === "daily" && (
          <>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700 }}>💡 Daily Usage — Talk to Redis in English</h2>
              <p style={{ color: COLORS.textMuted, fontSize: 13, margin: 0 }}>Just tell Claude what you need. It picks the right Redis tool automatically.</p>
            </div>

            <div style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: COLORS.cyan }}>💬 Example Conversations with Claude</h3>

              {[
                {
                  you: "Check if our Redis is healthy",
                  claude: "Uses redis_health_check → gives you score, issues, recommendations",
                  tool: "redis_health_check",
                },
                {
                  you: "How much memory is each tenant using?",
                  claude: "Uses redis_tenant_ops for each tenant → shows memory breakdown",
                  tool: "redis_tenant_ops",
                },
                {
                  you: "What's the best caching strategy for our NOREN price feed?",
                  claude: "Uses redis_cache_strategy → recommends cache-aside with 5s TTL",
                  tool: "redis_cache_strategy",
                },
                {
                  you: "Show me all keys related to trading sessions",
                  claude: "Uses redis_scan_keys with pattern 'session:*' → lists keys with memory",
                  tool: "redis_scan_keys",
                },
                {
                  you: "Store this alert config for NIFTY: high=23000, low=22000",
                  claude: "Uses redis_hash_set → HSET alert:config:NIFTY high_threshold 23000 ...",
                  tool: "redis_hash_set",
                },
                {
                  you: "Push 3 orders to the processing queue",
                  claude: "Uses redis_list_push with LPUSH → adds to queue:orders",
                  tool: "redis_list_push",
                },
                {
                  you: "Show me the latest 10 trade events from the stream",
                  claude: "Uses redis_stream_read → XRANGE orders:stream - + COUNT 10",
                  tool: "redis_stream_read",
                },
                {
                  you: "Which keys are using the most memory? Any optimization ideas?",
                  claude: "Uses redis_key_analysis → samples keys, finds patterns, suggests fixes",
                  tool: "redis_key_analysis",
                },
                {
                  you: "Run these 20 SET commands in one batch for speed",
                  claude: "Uses redis_pipeline_execute → pipelines all 20 in one round trip",
                  tool: "redis_pipeline_execute",
                },
              ].map((example, i) => (
                <div key={i} style={{
                  padding: "12px 0",
                  borderBottom: i < 8 ? `1px solid ${COLORS.border}22` : "none",
                }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <span style={{ color: COLORS.green, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>You:</span>
                    <span style={{ color: COLORS.text, fontSize: 13 }}>"{example.you}"</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ color: COLORS.blue, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>AI:</span>
                    <div>
                      <span style={{ color: COLORS.textMuted, fontSize: 12 }}>{example.claude}</span>
                      <span style={{
                        marginLeft: 8,
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: COLORS.primaryDim,
                        color: COLORS.primary,
                        fontFamily: "monospace",
                      }}>{example.tool}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              background: `${COLORS.greenDim}`,
              border: `1px solid ${COLORS.green}33`,
              borderRadius: 10,
              padding: 16,
            }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, color: COLORS.green }}>✨ The Key Insight</h4>
              <p style={{ color: COLORS.textMuted, fontSize: 12, margin: 0, lineHeight: 1.6 }}>
                You never write Redis commands manually. You describe what you need in plain English (or Tamil!). 
                Claude automatically picks the right MCP tool, formats the command, executes it, and gives you 
                formatted results. It's like having a Redis expert on your team 24/7.
              </p>
            </div>
          </>
        )}

        {/* ===== PRODUCTS ===== */}
        {activeSection === "products" && (
          <>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700 }}>🏢 Your Products + RedisNexus</h2>
              <p style={{ color: COLORS.textMuted, fontSize: 13, margin: 0 }}>How each Santhira product uses Redis through RedisNexus</p>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <UseCaseCard
                icon="📈"
                product="Finspot Trading (NOREN)"
                scenario="Cache live stock prices, manage trading sessions, queue order execution, track real-time alerts"
                tools={["redis_set", "redis_hash_set", "redis_stream_add", "redis_publish", "redis_sorted_set_add"]}
                result="Sub-millisecond price lookups, zero duplicate orders via SETNX locks, full trade audit via Streams"
              />
              <UseCaseCard
                icon="🔧"
                product="LinkedEye ITSM"
                scenario="Incident priority queue, unique user tracking per tenant, session management, real-time alert routing"
                tools={["redis_sorted_set_add", "redis_scan_keys", "redis_tenant_ops", "redis_publish"]}
                result="P1 incidents surface instantly via Sorted Sets, per-tenant isolation with namespace prefixes"
              />
              <UseCaseCard
                icon="🎤"
                product="VoiceLead AI"
                scenario="Cache Tamil voice transcriptions, queue lead scoring jobs, track unique callers, rate-limit API calls"
                tools={["redis_set", "redis_list_push", "redis_hash_set", "redis_pipeline_execute"]}
                result="Voice responses cached for 60s (repeat callers get instant replies), lead queue never loses data"
              />
              <UseCaseCard
                icon="🏥"
                product="ClinicVoice AI"
                scenario="Patient appointment cache, clinic session tracking, prescription lookup cache, appointment reminders queue"
                tools={["redis_hash_set", "redis_list_push", "redis_set", "redis_stream_add"]}
                result="Patient data cached with 30-min TTL, appointment streams with consumer groups for parallel processing"
              />
              <UseCaseCard
                icon="👥"
                product="HRAssist AI"
                scenario="Employee profile cache, leave balance tracking, onboarding task queues, chatbot session state"
                tools={["redis_hash_set", "redis_set", "redis_list_push", "redis_cache_strategy"]}
                result="Employee lookups from cache (0.1ms vs 50ms from DB), chatbot sessions persist across page refreshes"
              />
            </div>

            <div style={{
              marginTop: 20,
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              padding: 16,
            }}>
              <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>🔑 Key Naming Convention Across Products</h4>
              <CodeBlock title="Redis key patterns">
{`# Pattern: tenant:{product}:{entity}:{id}

# Finspot Trading
tenant:finspot:price:NIFTY          → "22850.50"
tenant:finspot:session:TR001        → {broker, status, heartbeat}
tenant:finspot:orders:stream        → Stream of trade events

# LinkedEye ITSM  
tenant:linkedeye:incident:INC001    → {severity, status, assignee}
tenant:linkedeye:active:users       → Set of online user IDs

# VoiceLead AI
tenant:voicelead:lead:L001          → {name, phone, score, city}
tenant:voicelead:queue:scoring      → List of leads to score

# ClinicVoice AI
tenant:clinicvoice:patient:P001     → {name, appointments, history}
tenant:clinicvoice:reminders:stream → Stream of reminder events

# HRAssist AI
tenant:hrassist:employee:E001       → {name, dept, leave_balance}
tenant:hrassist:chatbot:sess:S001   → Chat session state`}
              </CodeBlock>
            </div>
          </>
        )}

        {/* ===== ARCHITECTURE ===== */}
        {activeSection === "architecture" && (
          <>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700 }}>🏗️ How It All Fits Together</h2>
              <p style={{ color: COLORS.textMuted, fontSize: 13, margin: 0 }}>The complete flow from user request to Redis response</p>
            </div>

            {/* Architecture Flow */}
            <div style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 12,
              padding: 24,
              marginBottom: 20,
            }}>
              <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 600, textAlign: "center" }}>Request Flow</h3>
              
              {[
                { icon: "👤", label: "You (or your app)", desc: "\"Check Redis health\" or API call", color: COLORS.green },
                { icon: "🤖", label: "AI (Claude / GPT / n8n)", desc: "Picks the right MCP tool automatically", color: COLORS.blue },
                { icon: "🔌", label: "RedisNexus MCP Server", desc: "Validates input, executes Redis command", color: COLORS.primary },
                { icon: "💾", label: "Redis 7.2 (Sentinel HA)", desc: "Sub-ms execution, auto-failover", color: COLORS.purple },
                { icon: "📊", label: "Response back to you", desc: "Formatted markdown or JSON with insights", color: COLORS.cyan },
              ].map((step, i) => (
                <div key={i}>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "12px 16px",
                    background: COLORS.surface,
                    borderRadius: 10,
                    border: `1px solid ${step.color}33`,
                  }}>
                    <span style={{ fontSize: 24, flexShrink: 0 }}>{step.icon}</span>
                    <div>
                      <div style={{ color: step.color, fontSize: 13, fontWeight: 600 }}>{step.label}</div>
                      <div style={{ color: COLORS.textMuted, fontSize: 11 }}>{step.desc}</div>
                    </div>
                  </div>
                  {i < 4 && <FlowArrow />}
                </div>
              ))}
            </div>

            {/* Three Modes */}
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>3 Ways RedisNexus Integrates</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
              {[
                {
                  title: "Mode 1: AI Chat",
                  desc: "Talk to Claude, it uses Redis tools behind the scenes. Best for: DevOps tasks, debugging, monitoring.",
                  icon: "💬",
                  color: COLORS.green,
                },
                {
                  title: "Mode 2: App Backend",
                  desc: "Your Python/Node app calls MCP tools via HTTP API. Best for: SaaS products, microservices.",
                  icon: "⚙️",
                  color: COLORS.blue,
                },
                {
                  title: "Mode 3: Automation",
                  desc: "n8n / StackStorm triggers MCP tools on events. Best for: Alerts, auto-scaling, self-healing.",
                  icon: "🔄",
                  color: COLORS.purple,
                },
              ].map(mode => (
                <div key={mode.title} style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 10,
                  padding: 16,
                  borderTop: `3px solid ${mode.color}`,
                }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{mode.icon}</div>
                  <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: mode.color }}>{mode.title}</h4>
                  <p style={{ color: COLORS.textMuted, fontSize: 11, margin: 0, lineHeight: 1.5 }}>{mode.desc}</p>
                </div>
              ))}
            </div>

            {/* Production Infra */}
            <div style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 12,
              padding: 20,
            }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>☸️ Kubernetes Production Layout</h3>
              <CodeBlock title="namespace: redis-nexus">
{`┌─────────────── redis-nexus namespace ───────────────┐
│                                                       │
│  ┌──────────────┐    ┌──────────────────────────┐    │
│  │ redis-master │    │ redis-nexus-mcp (x2-10)  │    │
│  │ StatefulSet  │◄───│ Deployment + HPA          │    │
│  │ + Exporter   │    │ Auto-scales on CPU/Memory │    │
│  │ 10Gi PVC     │    └──────────┬───────────────┘    │
│  └──────┬───────┘               │                     │
│         │                       │                     │
│  ┌──────▼───────┐    ┌─────────▼────────────┐        │
│  │ ServiceMon   │    │ Ingress (TLS)        │        │
│  │ Prometheus   │    │ redis-nexus.santhira  │        │
│  │ + AlertRules │    │ .com/mcp             │        │
│  └──────────────┘    └──────────────────────┘        │
│                                                       │
│  ┌──────────────┐    ┌──────────────────────┐        │
│  │ CronJob      │    │ NetworkPolicy        │        │
│  │ Backup/6hrs  │    │ Namespace isolation   │        │
│  └──────────────┘    └──────────────────────┘        │
└───────────────────────────────────────────────────────┘`}
              </CodeBlock>

              <div style={{
                marginTop: 16,
                padding: 12,
                background: `${COLORS.greenDim}`,
                border: `1px solid ${COLORS.green}33`,
                borderRadius: 8,
              }}>
                <p style={{ color: COLORS.green, fontSize: 12, margin: 0, fontWeight: 500 }}>
                  ✅ Total cost: ~$15-25/month on self-hosted K8s (no cloud vendor lock-in)
                </p>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
