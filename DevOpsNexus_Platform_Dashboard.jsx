import { useState, useMemo } from "react";

const SERVERS = [
  {
    id: "redis", name: "RedisNexus", port: 8000, icon: "⚡", color: "#DC382D",
    category: "Database", tagline: "Cache & Real-Time Data Intelligence",
    tools: 16, status: "ready",
    toolList: [
      "redis_set", "redis_get", "redis_delete", "redis_keys", "redis_hash_set", "redis_hash_get",
      "redis_list_push", "redis_list_range", "redis_sorted_set_add", "redis_sorted_set_range",
      "redis_publish", "redis_subscribe", "redis_stream_add", "redis_health_check",
      "redis_cache_strategy", "redis_tenant_ops"
    ],
    deps: "Redis 7.2"
  },
  {
    id: "rabbit", name: "RabbitNexus", port: 8001, icon: "🐰", color: "#FF6600",
    category: "Messaging", tagline: "Message Queue Operations Intelligence",
    tools: 18, status: "ready",
    toolList: [
      "rmq_queue_create", "rmq_queue_list", "rmq_queue_info", "rmq_queue_delete",
      "rmq_exchange_create", "rmq_exchange_list", "rmq_binding_create", "rmq_binding_list",
      "rmq_publish", "rmq_consume", "rmq_vhost_manage", "rmq_vhost_list",
      "rmq_server_overview", "rmq_health_check", "rmq_dead_letter", "rmq_routing_strategy",
      "rmq_policy_set", "rmq_policy_list"
    ],
    deps: "RabbitMQ 3.13"
  },
  {
    id: "postgres", name: "PostgresNexus", port: 8002, icon: "🐘", color: "#336791",
    category: "Database", tagline: "PostgreSQL Operations Intelligence",
    tools: 6, status: "ready",
    toolList: ["pg_query", "pg_schema", "pg_health_check", "pg_index_advisor", "pg_connections", "pg_tuning_advisor"],
    deps: "PostgreSQL 16"
  },
  {
    id: "k8s", name: "K8sNexus", port: 8003, icon: "☸️", color: "#326CE5",
    category: "Orchestration", tagline: "Kubernetes Cluster Intelligence",
    tools: 7, status: "ready",
    toolList: ["k8s_pods", "k8s_deployment", "k8s_logs", "k8s_services", "k8s_nodes", "k8s_cluster_health", "k8s_resources"],
    deps: "Kubernetes API"
  },
  {
    id: "docker", name: "DockerNexus", port: 8004, icon: "🐳", color: "#2496ED",
    category: "Container", tagline: "Container Operations Intelligence",
    tools: 8, status: "ready",
    toolList: [
      "docker_containers", "docker_container_action", "docker_logs", "docker_images",
      "docker_networks", "docker_volumes", "docker_system", "docker_health_check"
    ],
    deps: "Docker Engine"
  },
  {
    id: "nginx", name: "NginxNexus", port: 8005, icon: "🌐", color: "#009639",
    category: "Networking", tagline: "Reverse Proxy & Load Balancer Intelligence",
    tools: 7, status: "ready",
    toolList: [
      "nginx_config_generate", "nginx_test_config", "nginx_status", "nginx_ssl_manage",
      "nginx_security_headers", "nginx_upstream_advisor", "nginx_health_check"
    ],
    deps: "Nginx"
  },
  {
    id: "mongo", name: "MongoNexus", port: 8006, icon: "🍃", color: "#47A248",
    category: "Database", tagline: "MongoDB Operations Intelligence",
    tools: 5, status: "ready",
    toolList: ["mongo_query", "mongo_collection", "mongo_databases", "mongo_health_check", "mongo_schema_advisor"],
    deps: "MongoDB 7.0"
  },
  {
    id: "kafka", name: "KafkaNexus", port: 8007, icon: "📡", color: "#231F20",
    category: "Streaming", tagline: "Event Streaming Intelligence",
    tools: 8, status: "ready",
    toolList: [
      "kafka_topic_create", "kafka_topic_list", "kafka_topic_info", "kafka_produce",
      "kafka_consume", "kafka_consumer_groups", "kafka_health_check", "kafka_strategy_advisor"
    ],
    deps: "Apache Kafka"
  },
  {
    id: "prometheus", name: "PrometheusNexus", port: 8008, icon: "🔥", color: "#E6522C",
    category: "Monitoring", tagline: "Monitoring & Alerting Intelligence",
    tools: 7, status: "ready",
    toolList: [
      "prom_query", "prom_targets", "prom_alerts", "prom_alert_rule_generate",
      "prom_metrics_explore", "prom_dashboard_generate", "prom_health_check"
    ],
    deps: "Prometheus"
  },
  {
    id: "terraform", name: "TerraformNexus", port: 8009, icon: "🏗️", color: "#7B42BC",
    category: "IaC", tagline: "Infrastructure as Code Intelligence",
    tools: 6, status: "ready",
    toolList: ["tf_state", "tf_plan", "tf_apply", "tf_module_generate", "tf_validate", "tf_workspaces"],
    deps: "Terraform CLI"
  },
  {
    id: "vault", name: "VaultNexus", port: 8010, icon: "🔐", color: "#FFEC6E",
    category: "Security", tagline: "Secrets Management Intelligence",
    tools: 6, status: "ready",
    toolList: ["vault_secret", "vault_pki", "vault_policy", "vault_auth", "vault_health_check", "vault_rotate_secret"],
    deps: "HashiCorp Vault"
  },
  {
    id: "elastic", name: "ElasticNexus", port: 8011, icon: "🔍", color: "#FEC514",
    category: "Search", tagline: "ELK Stack Intelligence",
    tools: 5, status: "ready",
    toolList: ["es_search", "es_index", "es_document", "es_cluster_health", "es_log_analysis"],
    deps: "Elasticsearch 8"
  },
  {
    id: "git", name: "GitNexus", port: 8012, icon: "🔀", color: "#F05032",
    category: "CI/CD", tagline: "Git & CI/CD Operations Intelligence",
    tools: 6, status: "ready",
    toolList: ["git_repo", "git_branch", "git_commit_msg_generate", "git_cicd_generate", "git_hook_generate", "git_analysis"],
    deps: "Git CLI"
  },
  {
    id: "linux", name: "LinuxNexus", port: 8013, icon: "🐧", color: "#FCC624",
    category: "System", tagline: "System Administration Intelligence",
    tools: 8, status: "ready",
    toolList: [
      "sys_info", "sys_process", "sys_disk", "sys_memory",
      "sys_network", "sys_service", "sys_cron", "sys_health_check"
    ],
    deps: "Linux OS"
  }
];

const CATEGORIES = ["All", "Database", "Messaging", "Streaming", "Orchestration", "Container", "Networking", "Monitoring", "IaC", "Security", "Search", "CI/CD", "System"];

const TOTAL_TOOLS = SERVERS.reduce((sum, s) => sum + s.tools, 0);
const TOTAL_LINES = 4085 + 1524 + 1286; // New + RabbitNexus + RedisNexus (approx)

export default function DevOpsNexusDashboard() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedServer, setSelectedServer] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState("grid");

  const filtered = useMemo(() => {
    let result = SERVERS;
    if (selectedCategory !== "All") {
      result = result.filter(s => s.category === selectedCategory);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.tagline.toLowerCase().includes(q) ||
        s.toolList.some(t => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [selectedCategory, searchQuery]);

  const selected = selectedServer ? SERVERS.find(s => s.id === selectedServer) : null;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0f",
      color: "#e0e0e8",
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
      padding: "0"
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #0f0f1a 100%)",
        borderBottom: "1px solid #2a2a3e",
        padding: "32px 40px 24px"
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: -1 }}>
              <span style={{ color: "#00ff88" }}>DevOps</span>
              <span style={{ color: "#888" }}>Nexus</span>
              <span style={{ fontSize: 14, color: "#555", marginLeft: 12, fontWeight: 400 }}>by Santhira</span>
            </h1>
            <p style={{ color: "#666", margin: "6px 0 0", fontSize: 13 }}>
              The World's First AI-Native DevOps Operations Platform
            </p>
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[
              { label: "MCP Servers", value: SERVERS.length, color: "#00ff88" },
              { label: "AI Tools", value: TOTAL_TOOLS, color: "#00aaff" },
              { label: "Lines of Code", value: `${(TOTAL_LINES / 1000).toFixed(1)}K`, color: "#ff6600" },
              { label: "Categories", value: CATEGORIES.length - 1, color: "#aa66ff" }
            ].map(stat => (
              <div key={stat.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 1 }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Search + Filters */}
        <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search servers, tools..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              background: "#1a1a2e",
              border: "1px solid #2a2a3e",
              borderRadius: 8,
              padding: "8px 14px",
              color: "#e0e0e8",
              fontSize: 13,
              width: 220,
              outline: "none",
              fontFamily: "inherit"
            }}
          />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  background: selectedCategory === cat ? "#00ff8822" : "transparent",
                  border: `1px solid ${selectedCategory === cat ? "#00ff88" : "#2a2a3e"}`,
                  borderRadius: 6,
                  padding: "5px 10px",
                  color: selectedCategory === cat ? "#00ff88" : "#888",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.2s"
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ display: "flex", minHeight: "calc(100vh - 180px)" }}>
        {/* Grid */}
        <div style={{ flex: 1, padding: "24px 24px" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16
          }}>
            {filtered.map(server => (
              <div
                key={server.id}
                onClick={() => setSelectedServer(selectedServer === server.id ? null : server.id)}
                style={{
                  background: selectedServer === server.id
                    ? `linear-gradient(135deg, ${server.color}15, ${server.color}08)`
                    : "#12121e",
                  border: `1px solid ${selectedServer === server.id ? server.color + "66" : "#1e1e30"}`,
                  borderRadius: 12,
                  padding: "20px",
                  cursor: "pointer",
                  transition: "all 0.25s ease",
                  position: "relative",
                  overflow: "hidden"
                }}
              >
                {/* Glow effect */}
                <div style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  width: 80,
                  height: 80,
                  background: `radial-gradient(circle at top right, ${server.color}15, transparent)`,
                  borderRadius: "0 12px 0 0"
                }} />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: 24, marginRight: 8 }}>{server.icon}</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{server.name}</span>
                  </div>
                  <span style={{
                    background: "#00ff8822",
                    color: "#00ff88",
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 600
                  }}>
                    :{server.port}
                  </span>
                </div>

                <p style={{ fontSize: 12, color: "#888", margin: "0 0 14px", lineHeight: 1.4 }}>
                  {server.tagline}
                </p>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    <span style={{ fontSize: 11, color: "#aaa" }}>
                      <span style={{ color: server.color, fontWeight: 700 }}>{server.tools}</span> tools
                    </span>
                    <span style={{ fontSize: 11, color: "#666" }}>
                      {server.category}
                    </span>
                  </div>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#00ff88",
                    boxShadow: "0 0 8px #00ff8866"
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detail Panel */}
        {selected && (
          <div style={{
            width: 360,
            borderLeft: "1px solid #1e1e30",
            background: "#0e0e18",
            padding: "24px",
            overflowY: "auto"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
                {selected.icon} {selected.name}
              </h2>
              <button
                onClick={() => setSelectedServer(null)}
                style={{ background: "transparent", border: "none", color: "#666", cursor: "pointer", fontSize: 18 }}
              >✕</button>
            </div>

            <div style={{
              background: `${selected.color}11`,
              border: `1px solid ${selected.color}33`,
              borderRadius: 8,
              padding: 14,
              marginBottom: 20
            }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>MCP Endpoint</div>
              <code style={{ fontSize: 12, color: selected.color, wordBreak: "break-all" }}>
                http://localhost:{selected.port}/mcp
              </code>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                {selected.tools} Tools
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {selected.toolList.map(tool => (
                  <div key={tool} style={{
                    background: "#1a1a2a",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "#ccc",
                    borderLeft: `3px solid ${selected.color}66`
                  }}>
                    {tool}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ fontSize: 12, color: "#666" }}>
              <div><strong style={{ color: "#888" }}>Category:</strong> {selected.category}</div>
              <div><strong style={{ color: "#888" }}>Backend:</strong> {selected.deps}</div>
              <div><strong style={{ color: "#888" }}>Transport:</strong> stdio / HTTP</div>
            </div>

            <div style={{
              marginTop: 20,
              padding: 14,
              background: "#0a0a14",
              borderRadius: 8,
              border: "1px solid #1e1e30"
            }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>Quick Start</div>
              <code style={{ fontSize: 10, color: "#00ff88", display: "block", lineHeight: 1.8 }}>
                pip install -r requirements.txt{"\n"}
                python {selected.id === "rabbit" ? "rabbit_nexus_mcp" : selected.id === "redis" ? "redis_nexus_mcp" : `${selected.id}_nexus_mcp`}.py --http
              </code>
            </div>
          </div>
        )}
      </div>

      {/* Architecture Flow */}
      <div style={{
        borderTop: "1px solid #1e1e30",
        padding: "24px 40px",
        background: "#0c0c14"
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#888", marginBottom: 16 }}>
          Architecture Flow
        </h3>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
          flexWrap: "wrap",
          fontSize: 12
        }}>
          {[
            { label: "User / App", bg: "#1a1a2e", color: "#fff" },
            { label: "→", bg: "transparent", color: "#444" },
            { label: "AI (Claude / GPT / n8n)", bg: "#00ff8822", color: "#00ff88" },
            { label: "→", bg: "transparent", color: "#444" },
            { label: "DevOps Nexus MCP (14 Servers)", bg: "#00aaff22", color: "#00aaff" },
            { label: "→", bg: "transparent", color: "#444" },
            { label: "Infrastructure (Redis, K8s, AWS...)", bg: "#ff660022", color: "#ff6600" },
          ].map((item, i) => (
            <div key={i} style={{
              background: item.bg,
              border: item.bg !== "transparent" ? `1px solid ${item.color}33` : "none",
              borderRadius: 8,
              padding: item.bg !== "transparent" ? "10px 18px" : "0 8px",
              color: item.color,
              fontWeight: item.bg !== "transparent" ? 600 : 400,
              fontSize: item.bg === "transparent" ? 18 : 12,
              whiteSpace: "nowrap"
            }}>
              {item.label}
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 20, color: "#444", fontSize: 11 }}>
          {SERVERS.length} MCP Servers · {TOTAL_TOOLS} AI Tools · Ports 8000-8013 · Built by Santhira (Rajkumar Madhu)
        </div>
      </div>
    </div>
  );
}
