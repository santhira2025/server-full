import { useState, useEffect, useCallback } from "react";

const COLORS = {
  bg: "#0a0a0f",
  surface: "#12121a",
  surfaceHover: "#1a1a25",
  card: "#16161f",
  border: "#2a2a3a",
  borderActive: "#dc382d",
  primary: "#dc382d",
  primaryDim: "#dc382d33",
  primaryGlow: "#dc382d66",
  text: "#e8e8f0",
  textMuted: "#8888aa",
  textDim: "#55556a",
  green: "#22c55e",
  greenDim: "#22c55e22",
  yellow: "#eab308",
  yellowDim: "#eab30822",
  blue: "#3b82f6",
  blueDim: "#3b82f622",
  purple: "#a855f7",
  purpleDim: "#a855f722",
  cyan: "#06b6d4",
  cyanDim: "#06b6d422",
};

// Simulated real-time data
const generateMetrics = () => ({
  memory: { used: 847 + Math.random() * 30, max: 2048, unit: "MB" },
  clients: { connected: 142 + Math.floor(Math.random() * 20), max: 1000 },
  hitRate: 94.2 + Math.random() * 3,
  opsPerSec: 28400 + Math.floor(Math.random() * 5000),
  uptime: "47d 13h 22m",
  version: "7.2.4",
  role: "master",
  replicas: 2,
  evictedKeys: Math.floor(Math.random() * 5),
  totalKeys: 1247832,
  expiredKeys: 34521,
  inputKbps: 1240 + Math.floor(Math.random() * 500),
  outputKbps: 4820 + Math.floor(Math.random() * 1000),
});

const generateTenants = () => [
  { id: "finspot", name: "Finspot Trading", keys: 342100, memory: "412MB", status: "healthy", hitRate: 97.1, color: COLORS.green },
  { id: "linkedeye", name: "LinkedEye ITSM", keys: 189400, memory: "198MB", status: "healthy", hitRate: 93.4, color: COLORS.blue },
  { id: "voicelead", name: "VoiceLead AI", keys: 87200, memory: "89MB", status: "warning", hitRate: 78.2, color: COLORS.yellow },
  { id: "clinicvoice", name: "ClinicVoice AI", keys: 54800, memory: "62MB", status: "healthy", hitRate: 95.8, color: COLORS.purple },
  { id: "hrassist", name: "HRAssist AI", keys: 41200, memory: "38MB", status: "healthy", hitRate: 91.3, color: COLORS.cyan },
];

const generateAlerts = () => [
  { time: "2m ago", severity: "critical", message: "VoiceLead AI: Cache hit rate dropped below 80%", tenant: "voicelead" },
  { time: "15m ago", severity: "warning", message: "Finspot Trading: Memory usage at 82% threshold", tenant: "finspot" },
  { time: "1h ago", severity: "info", message: "LinkedEye ITSM: Auto-scaled consumer group workers to 4", tenant: "linkedeye" },
  { time: "3h ago", severity: "info", message: "Backup completed successfully (redis-nexus-20260228.rdb)", tenant: "system" },
  { time: "6h ago", severity: "warning", message: "Slow query detected: KEYS tenant:finspot:* (142ms)", tenant: "finspot" },
];

const generateStreamEvents = () => [
  { id: "1709136060-0", stream: "orders:stream", data: { action: "BUY", symbol: "NIFTY", qty: "50", client: "C042" }, time: "0.3s ago" },
  { id: "1709136059-0", stream: "alerts:trading", data: { type: "PRICE_HIGH", symbol: "BANKNIFTY", price: "52100" }, time: "1.1s ago" },
  { id: "1709136058-0", stream: "itsm:incidents", data: { severity: "P2", service: "API Gateway", tenant: "linkedeye" }, time: "2.4s ago" },
  { id: "1709136057-0", stream: "voice:leads", data: { lang: "Tamil", score: "0.87", city: "Coimbatore" }, time: "3.8s ago" },
  { id: "1709136056-0", stream: "orders:stream", data: { action: "SELL", symbol: "NIFTY", qty: "25", client: "C019" }, time: "5.2s ago" },
];

const MiniChart = ({ data, color, height = 40 }) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} 100,${height}`}
        fill={`url(#grad-${color.replace("#", "")})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

const MetricCard = ({ label, value, unit, subtext, color, chartData, icon }) => (
  <div style={{
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: "18px 20px",
    position: "relative",
    overflow: "hidden",
    transition: "border-color 0.2s",
  }}
    onMouseEnter={(e) => e.currentTarget.style.borderColor = color || COLORS.borderActive}
    onMouseLeave={(e) => e.currentTarget.style.borderColor = COLORS.border}
  >
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
      <span style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase" }}>
        {icon} {label}
      </span>
      {subtext && (
        <span style={{
          fontSize: 10,
          padding: "2px 8px",
          borderRadius: 6,
          background: subtext.includes("↑") || subtext.includes("healthy") ? COLORS.greenDim : subtext.includes("↓") ? COLORS.yellowDim : COLORS.primaryDim,
          color: subtext.includes("↑") || subtext.includes("healthy") ? COLORS.green : subtext.includes("↓") ? COLORS.yellow : COLORS.primary,
          fontWeight: 600,
        }}>
          {subtext}
        </span>
      )}
    </div>
    <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.text, fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>
      {value}<span style={{ fontSize: 14, color: COLORS.textMuted, marginLeft: 4, fontWeight: 400 }}>{unit}</span>
    </div>
    {chartData && (
      <div style={{ marginTop: 8, marginLeft: -20, marginRight: -20, marginBottom: -18 }}>
        <MiniChart data={chartData} color={color || COLORS.primary} />
      </div>
    )}
  </div>
);

const TenantRow = ({ tenant, index }) => (
  <div style={{
    display: "grid",
    gridTemplateColumns: "1fr 100px 80px 90px 70px",
    gap: 12,
    padding: "12px 16px",
    background: index % 2 === 0 ? "transparent" : COLORS.surface,
    borderRadius: 8,
    alignItems: "center",
    transition: "background 0.15s",
    cursor: "pointer",
  }}
    onMouseEnter={(e) => e.currentTarget.style.background = COLORS.surfaceHover}
    onMouseLeave={(e) => e.currentTarget.style.background = index % 2 === 0 ? "transparent" : COLORS.surface}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: tenant.color, boxShadow: `0 0 8px ${tenant.color}66` }} />
      <span style={{ color: COLORS.text, fontWeight: 500, fontSize: 13 }}>{tenant.name}</span>
    </div>
    <span style={{ color: COLORS.textMuted, fontSize: 12, fontFamily: "monospace" }}>{(tenant.keys / 1000).toFixed(0)}K</span>
    <span style={{ color: COLORS.textMuted, fontSize: 12, fontFamily: "monospace" }}>{tenant.memory}</span>
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        width: 50,
        height: 4,
        borderRadius: 2,
        background: COLORS.border,
        overflow: "hidden",
      }}>
        <div style={{
          width: `${tenant.hitRate}%`,
          height: "100%",
          borderRadius: 2,
          background: tenant.hitRate > 90 ? COLORS.green : tenant.hitRate > 80 ? COLORS.yellow : COLORS.primary,
        }} />
      </div>
      <span style={{ color: COLORS.textMuted, fontSize: 11, fontFamily: "monospace" }}>{tenant.hitRate}%</span>
    </div>
    <span style={{
      fontSize: 10,
      padding: "3px 8px",
      borderRadius: 6,
      background: tenant.status === "healthy" ? COLORS.greenDim : COLORS.yellowDim,
      color: tenant.status === "healthy" ? COLORS.green : COLORS.yellow,
      fontWeight: 600,
      textAlign: "center",
    }}>
      {tenant.status}
    </span>
  </div>
);

const StreamEvent = ({ event }) => (
  <div style={{
    padding: "10px 14px",
    borderLeft: `2px solid ${COLORS.primary}`,
    marginBottom: 6,
    background: `${COLORS.surface}`,
    borderRadius: "0 6px 6px 0",
    transition: "background 0.15s",
  }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
      <span style={{ color: COLORS.cyan, fontSize: 11, fontFamily: "monospace", fontWeight: 600 }}>{event.stream}</span>
      <span style={{ color: COLORS.textDim, fontSize: 10 }}>{event.time}</span>
    </div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {Object.entries(event.data).map(([k, v]) => (
        <span key={k} style={{
          fontSize: 11,
          color: COLORS.textMuted,
          background: COLORS.card,
          padding: "2px 6px",
          borderRadius: 4,
          fontFamily: "monospace",
        }}>
          <span style={{ color: COLORS.textDim }}>{k}:</span> <span style={{ color: COLORS.text }}>{v}</span>
        </span>
      ))}
    </div>
  </div>
);

const AlertItem = ({ alert }) => {
  const sevColors = {
    critical: COLORS.primary,
    warning: COLORS.yellow,
    info: COLORS.blue,
  };
  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      padding: "10px 0",
      borderBottom: `1px solid ${COLORS.border}22`,
    }}>
      <div style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: sevColors[alert.severity],
        boxShadow: `0 0 6px ${sevColors[alert.severity]}88`,
        marginTop: 5,
        flexShrink: 0,
      }} />
      <div>
        <p style={{ color: COLORS.text, fontSize: 12, margin: 0, lineHeight: 1.4 }}>{alert.message}</p>
        <span style={{ color: COLORS.textDim, fontSize: 10 }}>{alert.time}</span>
      </div>
    </div>
  );
};

const McpToolCard = ({ name, desc, badge, annotations }) => (
  <div style={{
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    padding: "14px 16px",
    transition: "all 0.2s",
    cursor: "pointer",
  }}
    onMouseEnter={(e) => {
      e.currentTarget.style.borderColor = COLORS.primary;
      e.currentTarget.style.transform = "translateY(-2px)";
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.borderColor = COLORS.border;
      e.currentTarget.style.transform = "translateY(0)";
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
      <span style={{ color: COLORS.text, fontSize: 13, fontWeight: 600, fontFamily: "monospace" }}>{name}</span>
      <span style={{
        fontSize: 9,
        padding: "2px 6px",
        borderRadius: 4,
        background: badge === "read" ? COLORS.greenDim : badge === "write" ? COLORS.yellowDim : COLORS.purpleDim,
        color: badge === "read" ? COLORS.green : badge === "write" ? COLORS.yellow : COLORS.purple,
        fontWeight: 600,
        textTransform: "uppercase",
      }}>{badge}</span>
    </div>
    <p style={{ color: COLORS.textMuted, fontSize: 11, margin: 0, lineHeight: 1.4 }}>{desc}</p>
  </div>
);

export default function RedisNexusDashboard() {
  const [metrics, setMetrics] = useState(generateMetrics());
  const [activeTab, setActiveTab] = useState("overview");
  const [memHistory, setMemHistory] = useState(Array.from({ length: 20 }, () => 820 + Math.random() * 60));
  const [opsHistory, setOpsHistory] = useState(Array.from({ length: 20 }, () => 25000 + Math.random() * 8000));
  const [hitHistory, setHitHistory] = useState(Array.from({ length: 20 }, () => 92 + Math.random() * 5));
  const [clientHistory, setClientHistory] = useState(Array.from({ length: 20 }, () => 130 + Math.random() * 30));

  useEffect(() => {
    const interval = setInterval(() => {
      const newMetrics = generateMetrics();
      setMetrics(newMetrics);
      setMemHistory((prev) => [...prev.slice(1), newMetrics.memory.used]);
      setOpsHistory((prev) => [...prev.slice(1), newMetrics.opsPerSec]);
      setHitHistory((prev) => [...prev.slice(1), newMetrics.hitRate]);
      setClientHistory((prev) => [...prev.slice(1), newMetrics.clients.connected]);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "tenants", label: "Tenants" },
    { id: "streams", label: "Live Streams" },
    { id: "mcp", label: "MCP Tools" },
    { id: "alerts", label: "Alerts" },
  ];

  const mcpTools = [
    { name: "redis_get", desc: "Auto-detect type and retrieve any key value", badge: "read" },
    { name: "redis_set", desc: "Set string with TTL, NX/XX flags for locks", badge: "write" },
    { name: "redis_hash_set", desc: "Set multiple hash fields atomically", badge: "write" },
    { name: "redis_hash_get", desc: "Retrieve hash fields with selective filtering", badge: "read" },
    { name: "redis_list_push", desc: "LPUSH/RPUSH to lists for queue patterns", badge: "write" },
    { name: "redis_sorted_set_add", desc: "Add scored members for leaderboards", badge: "write" },
    { name: "redis_stream_add", desc: "Append to streams with MAXLEN trimming", badge: "write" },
    { name: "redis_stream_read", desc: "Read stream entries by ID range", badge: "read" },
    { name: "redis_publish", desc: "Publish Pub/Sub messages to channels", badge: "write" },
    { name: "redis_scan_keys", desc: "Production-safe key scanning with SCAN", badge: "read" },
    { name: "redis_pipeline_execute", desc: "Batch execute 50+ commands atomically", badge: "write" },
    { name: "redis_health_check", desc: "AI-powered health analysis with scoring", badge: "intel" },
    { name: "redis_key_analysis", desc: "Keyspace pattern & memory profiling", badge: "intel" },
    { name: "redis_cache_strategy", desc: "AI advisor for caching architecture", badge: "intel" },
    { name: "redis_tenant_ops", desc: "Multi-tenant isolation & management", badge: "intel" },
    { name: "redis_server_info", desc: "Comprehensive server metrics & stats", badge: "read" },
  ];

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
        borderBottom: `1px solid ${COLORS.border}`,
        padding: "14px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: `${COLORS.surface}cc`,
        backdropFilter: "blur(12px)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `linear-gradient(135deg, ${COLORS.primary}, #ff6b5a)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 14,
            color: "white",
            fontFamily: "'JetBrains Mono', monospace",
          }}>R</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>
              RedisNexus
            </h1>
            <span style={{ fontSize: 10, color: COLORS.textMuted }}>AI-Powered Redis Operations Intelligence</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 8,
            background: COLORS.greenDim,
            border: `1px solid ${COLORS.green}33`,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.green, animation: "pulse 2s infinite" }} />
            <span style={{ color: COLORS.green, fontSize: 11, fontWeight: 600 }}>Connected</span>
          </div>
          <span style={{
            fontSize: 10,
            color: COLORS.textDim,
            fontFamily: "monospace",
            padding: "4px 8px",
            background: COLORS.card,
            borderRadius: 6,
          }}>v{metrics.version} • {metrics.role}</span>
        </div>
      </header>

      {/* Tabs */}
      <nav style={{
        display: "flex",
        gap: 2,
        padding: "8px 24px",
        borderBottom: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: activeTab === tab.id ? 600 : 400,
              background: activeTab === tab.id ? COLORS.primaryDim : "transparent",
              color: activeTab === tab.id ? COLORS.primary : COLORS.textMuted,
              transition: "all 0.15s",
              fontFamily: "inherit",
            }}
          >
            {tab.label}
            {tab.id === "alerts" && (
              <span style={{
                marginLeft: 6,
                fontSize: 9,
                padding: "1px 5px",
                borderRadius: 10,
                background: COLORS.primary,
                color: "white",
                fontWeight: 700,
              }}>2</span>
            )}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <>
            {/* Metric Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
              <MetricCard
                label="Memory Usage"
                icon="💾"
                value={`${metrics.memory.used.toFixed(0)}`}
                unit={`/ ${metrics.memory.max} MB`}
                subtext={`${(metrics.memory.used / metrics.memory.max * 100).toFixed(0)}% used`}
                color={COLORS.primary}
                chartData={memHistory}
              />
              <MetricCard
                label="Operations/sec"
                icon="⚡"
                value={`${(metrics.opsPerSec / 1000).toFixed(1)}K`}
                unit="ops/s"
                subtext="↑ 12%"
                color={COLORS.green}
                chartData={opsHistory}
              />
              <MetricCard
                label="Cache Hit Rate"
                icon="🎯"
                value={`${metrics.hitRate.toFixed(1)}`}
                unit="%"
                subtext="healthy"
                color={COLORS.blue}
                chartData={hitHistory}
              />
              <MetricCard
                label="Connected Clients"
                icon="🔗"
                value={`${metrics.clients.connected}`}
                unit={`/ ${metrics.clients.max}`}
                subtext={`${metrics.replicas} replicas`}
                color={COLORS.purple}
                chartData={clientHistory}
              />
            </div>

            {/* Two Column Layout */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Quick Stats */}
              <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: COLORS.textMuted }}>📊 Server Quick Stats</h3>
                {[
                  ["Uptime", metrics.uptime],
                  ["Total Keys", `${(metrics.totalKeys / 1000000).toFixed(2)}M`],
                  ["Expired Keys", `${(metrics.expiredKeys / 1000).toFixed(1)}K`],
                  ["Evicted Keys", `${metrics.evictedKeys}`],
                  ["Network In", `${(metrics.inputKbps / 1024).toFixed(1)} MB/s`],
                  ["Network Out", `${(metrics.outputKbps / 1024).toFixed(1)} MB/s`],
                  ["Persistence", "AOF + RDB"],
                  ["Max Memory Policy", "allkeys-lru"],
                ].map(([label, value]) => (
                  <div key={label} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: `1px solid ${COLORS.border}22`,
                  }}>
                    <span style={{ color: COLORS.textMuted, fontSize: 12 }}>{label}</span>
                    <span style={{ color: COLORS.text, fontSize: 12, fontFamily: "monospace", fontWeight: 500 }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Recent Alerts */}
              <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: COLORS.textMuted }}>🔔 Recent Alerts</h3>
                {generateAlerts().map((alert, i) => (
                  <AlertItem key={i} alert={alert} />
                ))}
              </div>
            </div>
          </>
        )}

        {/* Tenants Tab */}
        {activeTab === "tenants" && (
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>🏢 Multi-Tenant Redis Instances</h3>
              <span style={{ color: COLORS.textMuted, fontSize: 12 }}>{generateTenants().length} active tenants</span>
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 100px 80px 90px 70px",
              gap: 12,
              padding: "8px 16px",
              marginBottom: 4,
            }}>
              {["Tenant", "Keys", "Memory", "Hit Rate", "Status"].map((h) => (
                <span key={h} style={{ color: COLORS.textDim, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</span>
              ))}
            </div>
            {generateTenants().map((tenant, i) => (
              <TenantRow key={tenant.id} tenant={tenant} index={i} />
            ))}

            <div style={{
              marginTop: 20,
              padding: 16,
              background: COLORS.surface,
              borderRadius: 10,
              border: `1px solid ${COLORS.border}`,
            }}>
              <h4 style={{ margin: "0 0 12px", fontSize: 13, color: COLORS.textMuted }}>💡 Tenant Insights</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "monospace", color: COLORS.green }}>799MB</div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted }}>Total Memory</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "monospace", color: COLORS.blue }}>714.7K</div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted }}>Total Keys</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "monospace", color: COLORS.purple }}>91.2%</div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted }}>Avg Hit Rate</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Live Streams Tab */}
        {activeTab === "streams" && (
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>📡 Live Stream Events</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.green, animation: "pulse 1.5s infinite" }} />
                <span style={{ color: COLORS.green, fontSize: 11, fontWeight: 600 }}>Real-time</span>
              </div>
            </div>
            {generateStreamEvents().map((event, i) => (
              <StreamEvent key={i} event={event} />
            ))}
            <div style={{ marginTop: 16, padding: 12, background: COLORS.surface, borderRadius: 8, fontFamily: "monospace", fontSize: 11, color: COLORS.textDim }}>
              <span style={{ color: COLORS.cyan }}>XREADGROUP GROUP</span> dashboard worker-1 <span style={{ color: COLORS.yellow }}>COUNT</span> 10 <span style={{ color: COLORS.yellow }}>BLOCK</span> 5000 <span style={{ color: COLORS.cyan }}>STREAMS</span> orders:stream alerts:trading itsm:incidents &gt;
            </div>
          </div>
        )}

        {/* MCP Tools Tab */}
        {activeTab === "mcp" && (
          <>
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>🔌 MCP Tool Registry</h3>
              <p style={{ margin: 0, color: COLORS.textMuted, fontSize: 13 }}>
                16 enterprise-grade tools available via the <span style={{ fontFamily: "monospace", color: COLORS.cyan }}>redis_nexus_mcp</span> server.
                Connect via stdio or HTTP transport.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {mcpTools.map((tool) => (
                <McpToolCard key={tool.name} {...tool} />
              ))}
            </div>
            <div style={{
              marginTop: 20,
              padding: 16,
              background: COLORS.card,
              border: `1px solid ${COLORS.primary}33`,
              borderRadius: 10,
            }}>
              <h4 style={{ margin: "0 0 10px", fontSize: 13, color: COLORS.primary }}>🚀 Quick Connect</h4>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.textMuted, lineHeight: 1.8 }}>
                <div><span style={{ color: COLORS.textDim }}># stdio (local)</span></div>
                <div style={{ color: COLORS.text }}>python redis_mcp_server.py</div>
                <div style={{ marginTop: 8 }}><span style={{ color: COLORS.textDim }}># HTTP (remote / Kubernetes)</span></div>
                <div style={{ color: COLORS.text }}>python redis_mcp_server.py --http --port=8000</div>
                <div style={{ marginTop: 8 }}><span style={{ color: COLORS.textDim }}># MCP endpoint</span></div>
                <div style={{ color: COLORS.cyan }}>https://redis-nexus.santhira.com/mcp</div>
              </div>
            </div>
          </>
        )}

        {/* Alerts Tab */}
        {activeTab === "alerts" && (
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>🔔 Alert History</h3>
            {generateAlerts().map((alert, i) => (
              <AlertItem key={i} alert={alert} />
            ))}
          </div>
        )}
      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
