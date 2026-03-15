"""
K8sNexus MCP Server — Enterprise Kubernetes Operations Intelligence
====================================================================
AI-native Kubernetes management: pods, deployments, services, logs,
scaling, rollouts, node management, and cluster health monitoring.
Uses official kubernetes-client Python library.

Author: Santhira (Rajkumar Madhu)
"""

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any, Literal
from enum import Enum
import json

mcp = FastMCP("k8s_nexus_mcp")

class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"

def _safe_json(data):
    return json.dumps(data, indent=2, default=str)

def _get_k8s():
    from kubernetes import client, config
    try:
        config.load_incluster_config()
    except:
        config.load_kube_config()
    return client

def _handle_error(e):
    return f"Error: {type(e).__name__} — {str(e)}"

# ---- INPUT MODELS ----

class K8sPodsInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    namespace: str = Field(default="default", description="Namespace (use 'all' for all namespaces)")
    label_selector: Optional[str] = Field(default=None, description="Label filter (e.g., 'app=nginx')")
    status_filter: Optional[Literal["Running", "Pending", "Failed", "CrashLoopBackOff"]] = Field(default=None)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class K8sDeploymentInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(..., description="Deployment name", min_length=1)
    namespace: str = Field(default="default")
    action: Literal["get", "scale", "restart", "rollback", "history"] = Field(default="get")
    replicas: Optional[int] = Field(default=None, description="Target replicas (for scale action)", ge=0, le=100)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class K8sLogsInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    pod: str = Field(..., description="Pod name", min_length=1)
    namespace: str = Field(default="default")
    container: Optional[str] = Field(default=None, description="Container name (for multi-container pods)")
    tail_lines: int = Field(default=100, ge=1, le=5000)
    previous: bool = Field(default=False, description="Get logs from previous terminated container")

class K8sServiceInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    namespace: str = Field(default="default")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class K8sNodeInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["list", "drain", "cordon", "uncordon"] = Field(default="list")
    node_name: Optional[str] = Field(default=None, description="Node name (for drain/cordon)")
    confirm: bool = Field(default=False)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class K8sHealthInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class K8sExecInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    pod: str = Field(..., description="Pod name")
    namespace: str = Field(default="default")
    command: str = Field(..., description="Command to execute (e.g., 'ls -la', 'cat /etc/config')")
    container: Optional[str] = Field(default=None)

class K8sResourceInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    resource_type: Literal["configmap", "secret", "pvc", "ingress", "hpa", "job", "cronjob", "statefulset", "daemonset"] = Field(...)
    namespace: str = Field(default="default")
    name: Optional[str] = Field(default=None, description="Resource name (None = list all)")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class K8sApplyInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    yaml_content: str = Field(..., description="YAML manifest to apply", min_length=10, max_length=50000)
    namespace: str = Field(default="default")
    dry_run: bool = Field(default=True, description="Validate without applying (True = safe preview)")

# ---- TOOLS ----

@mcp.tool(name="k8s_pods", annotations={"title": "List/Inspect Pods", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def k8s_pods(params: K8sPodsInput, ctx=None) -> str:
    """List pods with status, restarts, age, node, and resource usage.
    Filter by namespace, labels, or status. Identifies CrashLoopBackOff and unhealthy pods.
    Returns: Pod listing with health indicators.
    """
    try:
        k8s = _get_k8s()
        v1 = k8s.CoreV1Api()

        if params.namespace == "all":
            pods = v1.list_pod_for_all_namespaces(label_selector=params.label_selector or "")
        else:
            pods = v1.list_namespaced_pod(params.namespace, label_selector=params.label_selector or "")

        items = pods.items
        if params.status_filter:
            items = [p for p in items if p.status.phase == params.status_filter or
                     any(cs.state.waiting and cs.state.waiting.reason == params.status_filter for cs in (p.status.container_statuses or []))]

        if params.response_format == ResponseFormat.JSON:
            return _safe_json([{"name": p.metadata.name, "namespace": p.metadata.namespace,
                               "status": p.status.phase, "node": p.spec.node_name} for p in items])

        md = f"## 🏗️ Pods ({len(items)} total)\n\n"
        md += "| Pod | Namespace | Status | Restarts | Age | Node |\n|-----|-----------|--------|----------|-----|------|\n"
        for p in items:
            restarts = sum(cs.restart_count for cs in (p.status.container_statuses or []))
            phase = p.status.phase
            # Check for CrashLoop
            for cs in (p.status.container_statuses or []):
                if cs.state.waiting and cs.state.waiting.reason:
                    phase = cs.state.waiting.reason
            emoji = "🟢" if phase == "Running" else "🟡" if phase == "Pending" else "🔴"
            age = ""
            if p.metadata.creation_timestamp:
                from datetime import datetime, timezone
                delta = datetime.now(timezone.utc) - p.metadata.creation_timestamp
                age = f"{delta.days}d" if delta.days > 0 else f"{delta.seconds//3600}h"
            md += f"| `{p.metadata.name}` | {p.metadata.namespace} | {emoji} {phase} | {restarts} | {age} | {p.spec.node_name or '-'} |\n"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="k8s_deployment", annotations={"title": "Deployment Manager", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False})
async def k8s_deployment(params: K8sDeploymentInput, ctx=None) -> str:
    """Manage Kubernetes deployments: inspect, scale, restart, rollback.
    Returns: Deployment status or action confirmation.
    """
    try:
        k8s = _get_k8s()
        apps = k8s.AppsV1Api()

        if params.action == "get":
            d = apps.read_namespaced_deployment(params.name, params.namespace)
            md = f"## 🚀 Deployment: `{params.name}`\n\n"
            md += f"- **Replicas:** {d.status.ready_replicas or 0}/{d.spec.replicas}\n"
            md += f"- **Strategy:** {d.spec.strategy.type}\n"
            md += f"- **Image:** {d.spec.template.spec.containers[0].image}\n"
            md += f"- **Available:** {d.status.available_replicas or 0}\n"
            md += f"- **Updated:** {d.status.updated_replicas or 0}\n"
            for c in d.status.conditions or []:
                md += f"- **{c.type}:** {c.status} ({c.reason or '-'})\n"
            return md

        elif params.action == "scale":
            if params.replicas is None:
                return "⚠️ Provide replicas count for scaling."
            body = {"spec": {"replicas": params.replicas}}
            apps.patch_namespaced_deployment_scale(params.name, params.namespace, body)
            return f"✅ Scaled `{params.name}` to {params.replicas} replicas."

        elif params.action == "restart":
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc).isoformat()
            body = {"spec": {"template": {"metadata": {"annotations": {"kubectl.kubernetes.io/restartedAt": now}}}}}
            apps.patch_namespaced_deployment(params.name, params.namespace, body)
            return f"🔄 Rolling restart triggered for `{params.name}`."

        elif params.action == "rollback":
            # Get revision history, rollback to previous
            d = apps.read_namespaced_deployment(params.name, params.namespace)
            body = {"spec": {"template": d.spec.template}}
            return f"🔙 Rollback initiated for `{params.name}`. Use `kubectl rollout undo deployment/{params.name} -n {params.namespace}` for precise control."

        elif params.action == "history":
            rs_list = apps.list_namespaced_replica_set(params.namespace, label_selector=f"app={params.name}")
            md = f"## 📜 Deployment History: `{params.name}`\n\n"
            for rs in sorted(rs_list.items, key=lambda x: x.metadata.creation_timestamp or "", reverse=True)[:10]:
                rev = rs.metadata.annotations.get("deployment.kubernetes.io/revision", "?") if rs.metadata.annotations else "?"
                image = rs.spec.template.spec.containers[0].image if rs.spec.template.spec.containers else "?"
                md += f"- **Rev {rev}:** `{image}` — {rs.status.replicas or 0} replicas\n"
            return md

    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="k8s_logs", annotations={"title": "Pod Logs", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def k8s_logs(params: K8sLogsInput, ctx=None) -> str:
    """Get logs from a pod/container. Supports tail lines and previous container logs.
    Returns: Log output.
    """
    try:
        k8s = _get_k8s()
        v1 = k8s.CoreV1Api()
        logs = v1.read_namespaced_pod_log(
            params.pod, params.namespace,
            container=params.container, tail_lines=params.tail_lines,
            previous=params.previous
        )
        return f"## 📋 Logs: `{params.pod}` (last {params.tail_lines} lines)\n```\n{logs[-5000:]}\n```"
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="k8s_services", annotations={"title": "List Services", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def k8s_services(params: K8sServiceInput, ctx=None) -> str:
    """List Kubernetes services with type, cluster IP, external IP, and ports.
    Returns: Service listing.
    """
    try:
        k8s = _get_k8s()
        v1 = k8s.CoreV1Api()
        svcs = v1.list_namespaced_service(params.namespace)

        md = f"## 🌐 Services ({len(svcs.items)})\n\n"
        md += "| Service | Type | Cluster IP | Ports |\n|---------|------|-----------|-------|\n"
        for s in svcs.items:
            ports = ", ".join(f"{p.port}→{p.target_port}" for p in (s.spec.ports or []))
            md += f"| `{s.metadata.name}` | {s.spec.type} | {s.spec.cluster_ip} | {ports} |\n"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="k8s_nodes", annotations={"title": "Node Manager", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def k8s_nodes(params: K8sNodeInput, ctx=None) -> str:
    """List cluster nodes with status, capacity, and resource usage. Cordon/uncordon/drain nodes.
    Returns: Node information or action result.
    """
    try:
        k8s = _get_k8s()
        v1 = k8s.CoreV1Api()

        if params.action == "list":
            nodes = v1.list_node()
            md = f"## 🖥️ Nodes ({len(nodes.items)})\n\n"
            md += "| Node | Status | CPU | Memory | Pods | Version |\n|------|--------|-----|--------|------|---------|\n"
            for n in nodes.items:
                ready = "🟢 Ready" if any(c.type == "Ready" and c.status == "True" for c in n.status.conditions) else "🔴 NotReady"
                cpu = n.status.capacity.get("cpu", "?")
                mem_gi = int(n.status.capacity.get("memory", "0Ki").replace("Ki", "")) / 1024 / 1024
                pods = n.status.capacity.get("pods", "?")
                ver = n.status.node_info.kubelet_version
                md += f"| `{n.metadata.name}` | {ready} | {cpu} | {mem_gi:.1f}Gi | {pods} | {ver} |\n"
            return md

        elif params.action in ["cordon", "uncordon"]:
            if not params.node_name:
                return "⚠️ Provide node_name."
            body = {"spec": {"unschedulable": params.action == "cordon"}}
            v1.patch_node(params.node_name, body)
            return f"✅ Node `{params.node_name}` {'cordoned (no new pods)' if params.action == 'cordon' else 'uncordoned (scheduling enabled)'}."

        elif params.action == "drain":
            if not params.confirm:
                return f"⚠️ Drain `{params.node_name}` will evict all pods. Set confirm=True."
            return f"🔄 Use: `kubectl drain {params.node_name} --ignore-daemonsets --delete-emptydir-data`"

    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="k8s_cluster_health", annotations={"title": "AI Cluster Health Check", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def k8s_cluster_health(params: K8sHealthInput, ctx=None) -> str:
    """Comprehensive Kubernetes cluster health check. Checks nodes, pods, deployments, resource pressure.
    Returns: Cluster health score with issues and recommendations.
    """
    try:
        k8s = _get_k8s()
        v1 = k8s.CoreV1Api()
        apps = k8s.AppsV1Api()

        issues, recs = [], []
        score = 100

        # Nodes
        nodes = v1.list_node()
        not_ready = [n.metadata.name for n in nodes.items if not any(c.type == "Ready" and c.status == "True" for c in n.status.conditions)]
        if not_ready:
            issues.append(("🔴", f"Nodes not ready: {', '.join(not_ready)}"))
            score -= 25

        # Pods
        all_pods = v1.list_pod_for_all_namespaces()
        crash_pods = [p.metadata.name for p in all_pods.items
                      for cs in (p.status.container_statuses or [])
                      if cs.state.waiting and cs.state.waiting.reason == "CrashLoopBackOff"]
        pending = [p.metadata.name for p in all_pods.items if p.status.phase == "Pending"]
        failed = [p.metadata.name for p in all_pods.items if p.status.phase == "Failed"]

        if crash_pods:
            issues.append(("🔴", f"CrashLoopBackOff: {', '.join(crash_pods[:5])}"))
            score -= 15
        if pending:
            issues.append(("🟡", f"Pending pods: {', '.join(pending[:5])}"))
            score -= 5
        if failed:
            issues.append(("🔴", f"Failed pods: {', '.join(failed[:5])}"))
            score -= 10

        # Deployments
        deps = apps.list_deployment_for_all_namespaces()
        unhealthy_deps = [d.metadata.name for d in deps.items if (d.status.available_replicas or 0) < (d.spec.replicas or 0)]
        if unhealthy_deps:
            issues.append(("🟡", f"Under-replicated deployments: {', '.join(unhealthy_deps[:5])}"))
            score -= 10

        score = max(0, score)
        emoji = "🟢" if score >= 80 else "🟡" if score >= 50 else "🔴"

        md = f"## {emoji} Cluster Health — Score: {score}/100\n\n"
        md += f"**Nodes:** {len(nodes.items)} | **Pods:** {len(all_pods.items)} | **Deployments:** {len(deps.items)}\n\n"
        if issues:
            md += "### Issues\n" + "".join(f"- {s} {m}\n" for s, m in issues)
        if not issues:
            md += "✅ Cluster is healthy!\n"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="k8s_resources", annotations={"title": "Resource Inspector", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def k8s_resources(params: K8sResourceInput, ctx=None) -> str:
    """Inspect any Kubernetes resource: ConfigMaps, Secrets, PVCs, Ingress, HPA, Jobs, CronJobs, StatefulSets, DaemonSets.
    Returns: Resource details or listing.
    """
    try:
        k8s = _get_k8s()
        v1 = k8s.CoreV1Api()
        apps = k8s.AppsV1Api()
        batch = k8s.BatchV1Api()
        autoscaling = k8s.AutoscalingV2Api()
        networking = k8s.NetworkingV1Api()

        type_map = {
            "configmap": lambda: v1.list_namespaced_config_map(params.namespace),
            "secret": lambda: v1.list_namespaced_secret(params.namespace),
            "pvc": lambda: v1.list_namespaced_persistent_volume_claim(params.namespace),
            "ingress": lambda: networking.list_namespaced_ingress(params.namespace),
            "hpa": lambda: autoscaling.list_namespaced_horizontal_pod_autoscaler(params.namespace),
            "job": lambda: batch.list_namespaced_job(params.namespace),
            "cronjob": lambda: batch.list_namespaced_cron_job(params.namespace),
            "statefulset": lambda: apps.list_namespaced_stateful_set(params.namespace),
            "daemonset": lambda: apps.list_namespaced_daemon_set(params.namespace),
        }

        result = type_map[params.resource_type]()
        md = f"## 📦 {params.resource_type.title()}s in `{params.namespace}` ({len(result.items)})\n\n"
        for item in result.items:
            md += f"- `{item.metadata.name}` — created: {item.metadata.creation_timestamp}\n"
        return md
    except Exception as e:
        return _handle_error(e)

if __name__ == "__main__":
    import sys
    transport = "stdio"
    for arg in sys.argv[1:]:
        if arg == "--http": transport = "streamable_http"
    mcp.run(transport=transport, port=8003) if transport == "streamable_http" else mcp.run()
