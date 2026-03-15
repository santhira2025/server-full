"""
PrometheusNexus MCP Server — Monitoring & Alerting Intelligence
=================================================================
AI-native Prometheus/Grafana management: PromQL queries, alert rules,
targets, metric analysis, and intelligent threshold recommendations.
Uses Prometheus HTTP API.

Author: Santhira (Rajkumar Madhu) | Port: 8008
"""

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any, Literal
from enum import Enum
from contextlib import asynccontextmanager
import json

DEFAULT_PROM_URL = "http://localhost:9090"

@asynccontextmanager
async def prom_lifespan():
    import httpx
    client = httpx.AsyncClient(base_url=DEFAULT_PROM_URL, timeout=15.0)
    try:
        await client.get("/api/v1/status/config")
        yield {"http": client}
    finally:
        await client.aclose()

mcp = FastMCP("prometheus_nexus_mcp", lifespan=prom_lifespan)

class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"

def _safe_json(data): return json.dumps(data, indent=2, default=str)
async def _get_http(ctx): return ctx.request_context.lifespan_state["http"]
def _handle_error(e): return f"Error: {type(e).__name__} — {str(e)}"

# ---- INPUT MODELS ----

class PromQueryInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    query: str = Field(..., description="PromQL query (e.g., 'up', 'rate(http_requests_total[5m])')", min_length=1)
    time: Optional[str] = Field(default=None, description="Evaluation timestamp (RFC3339 or Unix)")
    start: Optional[str] = Field(default=None, description="Range start (for range queries)")
    end: Optional[str] = Field(default=None, description="Range end")
    step: Optional[str] = Field(default="15s", description="Query step (e.g., '15s', '1m')")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class PromTargetsInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    state: Optional[Literal["active", "dropped", "any"]] = Field(default="active")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class PromAlertsInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class PromRuleGenInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    metric: str = Field(..., description="Metric name to alert on")
    condition: Literal["above", "below", "absent", "rate_increase"] = Field(...)
    threshold: Optional[float] = Field(default=None)
    duration: str = Field(default="5m", description="How long condition must be true")
    severity: Literal["critical", "warning", "info"] = Field(default="warning")
    service: Optional[str] = Field(default=None, description="Service name for labels")

class PromMetricExploreInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    search: Optional[str] = Field(default=None, description="Search metric names")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class PromHealthInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class PromDashboardGenInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    service: str = Field(..., description="Service name to generate dashboard for")
    dashboard_type: Literal["web_app", "database", "messaging", "kubernetes", "custom"] = Field(default="web_app")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

# ---- TOOLS ----

@mcp.tool(name="prom_query", annotations={"title": "PromQL Query", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def prom_query(params: PromQueryInput, ctx=None) -> str:
    """Execute instant or range PromQL queries against Prometheus.
    Supports all PromQL: rate(), increase(), histogram_quantile(), aggregations, etc.
    """
    try:
        http = await _get_http(ctx)
        if params.start and params.end:
            resp = await http.get("/api/v1/query_range", params={"query": params.query, "start": params.start, "end": params.end, "step": params.step})
        else:
            qp = {"query": params.query}
            if params.time: qp["time"] = params.time
            resp = await http.get("/api/v1/query", params=qp)
        resp.raise_for_status()
        data = resp.json()

        if data.get("status") != "success":
            return f"❌ Query error: {data.get('error', 'Unknown')}"

        result = data.get("data", {})
        result_type = result.get("resultType", "")
        results = result.get("result", [])

        if params.response_format == ResponseFormat.JSON:
            return _safe_json(results)

        md = f"## 📊 PromQL: `{params.query}`\n\n"
        md += f"**Type:** {result_type} | **Results:** {len(results)}\n\n"

        if result_type == "vector":
            md += "| Metric | Value |\n|--------|-------|\n"
            for r in results[:30]:
                labels = r.get("metric", {})
                label_str = ", ".join(f"{k}={v}" for k, v in labels.items() if k != "__name__")
                name = labels.get("__name__", "")
                val = r.get("value", [0, ""])[1]
                md += f"| `{name}`{{{label_str}}} | {val} |\n"
        elif result_type == "matrix":
            for r in results[:5]:
                labels = r.get("metric", {})
                name = labels.get("__name__", "series")
                values = r.get("values", [])
                md += f"### {name} ({len(values)} points)\n"
                for ts, val in values[-5:]:
                    md += f"  {ts} → {val}\n"
        elif result_type == "scalar":
            md += f"**Value:** {results[1] if len(results) > 1 else results}\n"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="prom_targets", annotations={"title": "Scrape Targets", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def prom_targets(params: PromTargetsInput, ctx=None) -> str:
    """List Prometheus scrape targets with health status and last scrape time."""
    try:
        http = await _get_http(ctx)
        resp = await http.get("/api/v1/targets", params={"state": params.state} if params.state != "any" else {})
        resp.raise_for_status()
        data = resp.json().get("data", {})
        actives = data.get("activeTargets", [])

        md = f"## 🎯 Scrape Targets ({len(actives)} active)\n\n"
        md += "| Job | Instance | Health | Last Scrape |\n|-----|----------|--------|-------------|\n"
        for t in actives:
            emoji = "🟢" if t.get("health") == "up" else "🔴"
            md += f"| `{t.get('labels', {}).get('job', '?')}` | {t.get('labels', {}).get('instance', '?')} | {emoji} {t.get('health')} | {t.get('lastScrape', '?')[:19]} |\n"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="prom_alerts", annotations={"title": "Active Alerts", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def prom_alerts(params: PromAlertsInput, ctx=None) -> str:
    """List all active and pending alerts with severity and annotations."""
    try:
        http = await _get_http(ctx)
        resp = await http.get("/api/v1/alerts")
        resp.raise_for_status()
        alerts = resp.json().get("data", {}).get("alerts", [])

        firing = [a for a in alerts if a.get("state") == "firing"]
        pending = [a for a in alerts if a.get("state") == "pending"]

        md = f"## 🚨 Alerts — {len(firing)} firing, {len(pending)} pending\n\n"
        for a in firing:
            labels = a.get("labels", {})
            annotations = a.get("annotations", {})
            md += f"- 🔴 **{labels.get('alertname')}** [{labels.get('severity', '?')}] — {annotations.get('summary', annotations.get('description', ''))}\n"
        for a in pending:
            labels = a.get("labels", {})
            md += f"- 🟡 **{labels.get('alertname')}** [{labels.get('severity', '?')}] (pending)\n"
        if not alerts:
            md += "✅ No active alerts.\n"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="prom_alert_rule_generate", annotations={"title": "Generate Alert Rule", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def prom_alert_rule_generate(params: PromRuleGenInput, ctx=None) -> str:
    """Generate PrometheusRule YAML for common alert patterns."""
    if params.condition == "above":
        expr = f"{params.metric} > {params.threshold}"
        summary = f"{params.metric} is above {params.threshold}"
    elif params.condition == "below":
        expr = f"{params.metric} < {params.threshold}"
        summary = f"{params.metric} is below {params.threshold}"
    elif params.condition == "absent":
        expr = f"absent({params.metric})"
        summary = f"{params.metric} is not being reported"
    elif params.condition == "rate_increase":
        expr = f"rate({params.metric}[5m]) > {params.threshold}"
        summary = f"{params.metric} rate exceeds {params.threshold}/s"

    rule = f"""# Generated by PrometheusNexus
groups:
- name: {params.service or 'custom'}.rules
  rules:
  - alert: {params.metric.replace('_', ' ').title().replace(' ', '')}Alert
    expr: {expr}
    for: {params.duration}
    labels:
      severity: {params.severity}
      service: {params.service or 'unknown'}
    annotations:
      summary: "{summary}"
      description: "{{{{ $labels.instance }}}} — current value: {{{{ $value }}}}"
      runbook: "https://wiki.santhira.com/alerts/{params.metric}"
"""
    return f"## 📝 Alert Rule: `{params.metric}`\n\n```yaml\n{rule}\n```\n\nSave to: `/etc/prometheus/rules/{params.service or 'custom'}.yml`"

@mcp.tool(name="prom_metrics_explore", annotations={"title": "Explore Metrics", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def prom_metrics_explore(params: PromMetricExploreInput, ctx=None) -> str:
    """Browse available Prometheus metrics. Search by name pattern."""
    try:
        http = await _get_http(ctx)
        resp = await http.get("/api/v1/label/__name__/values")
        resp.raise_for_status()
        metrics = resp.json().get("data", [])

        if params.search:
            metrics = [m for m in metrics if params.search.lower() in m.lower()]

        md = f"## 📊 Metrics ({len(metrics)} {'matching' if params.search else 'total'})\n\n"
        for m in sorted(metrics)[:50]:
            md += f"- `{m}`\n"
        if len(metrics) > 50:
            md += f"\n*Showing 50 of {len(metrics)} metrics*"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="prom_dashboard_generate", annotations={"title": "AI Dashboard Generator", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def prom_dashboard_generate(params: PromDashboardGenInput, ctx=None) -> str:
    """Generate PromQL queries for a Grafana dashboard based on service type."""
    panels = {
        "web_app": [
            ("Request Rate", f'sum(rate(http_requests_total{{service="{params.service}"}}[5m])) by (method, status)'),
            ("Error Rate %", f'sum(rate(http_requests_total{{service="{params.service}",status=~"5.."}}[5m])) / sum(rate(http_requests_total{{service="{params.service}"}}[5m])) * 100'),
            ("P99 Latency", f'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{{service="{params.service}"}}[5m])) by (le))'),
            ("P50 Latency", f'histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket{{service="{params.service}"}}[5m])) by (le))'),
            ("Active Connections", f'sum({params.service}_active_connections)'),
            ("Memory Usage", f'process_resident_memory_bytes{{service="{params.service}"}}'),
            ("CPU Usage", f'rate(process_cpu_seconds_total{{service="{params.service}"}}[5m])'),
            ("Goroutines/Threads", f'go_goroutines{{service="{params.service}"}}'),
        ],
        "database": [
            ("Queries/sec", f'rate(pg_stat_statements_calls_total{{service="{params.service}"}}[5m])'),
            ("Active Connections", f'pg_stat_activity_count{{service="{params.service}"}}'),
            ("Cache Hit Rate", f'pg_stat_database_blks_hit / (pg_stat_database_blks_hit + pg_stat_database_blks_read)'),
            ("Replication Lag", f'pg_replication_lag{{service="{params.service}"}}'),
            ("Dead Tuples", f'pg_stat_user_tables_n_dead_tup{{service="{params.service}"}}'),
            ("Database Size", f'pg_database_size_bytes{{service="{params.service}"}}'),
        ],
        "messaging": [
            ("Messages Published/sec", f'rate(rabbitmq_channel_messages_published_total[5m])'),
            ("Messages Delivered/sec", f'rate(rabbitmq_channel_messages_delivered_total[5m])'),
            ("Queue Depth", f'rabbitmq_queue_messages'),
            ("Consumers", f'rabbitmq_queue_consumers'),
            ("Unacked Messages", f'rabbitmq_queue_messages_unacked'),
            ("Connection Count", f'rabbitmq_connections'),
        ],
        "kubernetes": [
            ("Pod CPU Usage", f'sum(rate(container_cpu_usage_seconds_total{{namespace="{params.service}"}}[5m])) by (pod)'),
            ("Pod Memory Usage", f'sum(container_memory_working_set_bytes{{namespace="{params.service}"}}) by (pod)'),
            ("Pod Restarts", f'sum(kube_pod_container_status_restarts_total{{namespace="{params.service}"}}) by (pod)'),
            ("Deployments Available", f'kube_deployment_status_replicas_available{{namespace="{params.service}"}}'),
            ("Node CPU", 'sum(rate(node_cpu_seconds_total{mode!="idle"}[5m])) by (instance)'),
            ("Node Memory", 'node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100'),
        ],
    }

    queries = panels.get(params.dashboard_type, panels["web_app"])
    md = f"## 📊 Dashboard: `{params.service}` ({params.dashboard_type})\n\n"
    for title, query in queries:
        md += f"### {title}\n```promql\n{query}\n```\n\n"
    md += "💡 Import these into Grafana as individual panels."
    return md

@mcp.tool(name="prom_health_check", annotations={"title": "AI Health Check", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def prom_health_check(params: PromHealthInput, ctx=None) -> str:
    """Comprehensive Prometheus stack health check."""
    try:
        http = await _get_http(ctx)
        issues, score = [], 100

        # Runtime info
        runtime = await http.get("/api/v1/status/runtimeinfo")
        runtime_data = runtime.json().get("data", {})

        # Targets
        targets = await http.get("/api/v1/targets")
        targets_data = targets.json().get("data", {})
        down_targets = [t for t in targets_data.get("activeTargets", []) if t.get("health") != "up"]
        if down_targets:
            issues.append(("🔴", f"{len(down_targets)} targets are DOWN"))
            score -= 15

        # Alerts
        alerts = await http.get("/api/v1/alerts")
        firing = [a for a in alerts.json().get("data", {}).get("alerts", []) if a.get("state") == "firing"]
        if firing:
            issues.append(("🟡", f"{len(firing)} alerts firing"))
            score -= 5

        score = max(0, score)
        emoji = "🟢" if score >= 80 else "🟡" if score >= 50 else "🔴"
        md = f"## {emoji} Prometheus Health — Score: {score}/100\n\n"
        md += f"**Storage:** {runtime_data.get('storageRetention', '?')} | **TSDB:** {runtime_data.get('timeSeriesCount', '?')} series\n\n"
        if issues:
            md += "### Issues\n" + "".join(f"- {s} {m}\n" for s, m in issues)
        else:
            md += "✅ Prometheus is healthy!\n"
        return md
    except Exception as e:
        return _handle_error(e)

if __name__ == "__main__":
    import sys
    transport = "stdio"
    for arg in sys.argv[1:]:
        if arg == "--http": transport = "streamable_http"
    mcp.run(transport=transport, port=8008) if transport == "streamable_http" else mcp.run()
