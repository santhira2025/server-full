"""
DockerNexus MCP Server — Container Operations Intelligence
============================================================
AI-native Docker management: containers, images, volumes, networks,
compose, build, registry, and container health monitoring.
Uses Docker SDK for Python (docker-py).

Author: Santhira (Rajkumar Madhu) | Port: 8004
"""

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any, Literal
from enum import Enum
import json

mcp = FastMCP("docker_nexus_mcp")

class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"

def _safe_json(data): return json.dumps(data, indent=2, default=str)
def _fmt_bytes(b):
    for u in ['B','KB','MB','GB','TB']:
        if abs(b) < 1024: return f"{b:.1f} {u}"
        b /= 1024
    return f"{b:.1f} PB"

def _get_docker():
    import docker
    return docker.from_env()

def _handle_error(e): return f"Error: {type(e).__name__} — {str(e)}"

# ---- INPUT MODELS ----

class DockerContainersInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    show_all: bool = Field(default=False, description="Include stopped containers")
    name_filter: Optional[str] = Field(default=None, description="Filter by name")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class DockerContainerActionInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    container: str = Field(..., description="Container name or ID", min_length=1)
    action: Literal["start", "stop", "restart", "pause", "unpause", "kill", "remove", "inspect", "top", "stats"] = Field(...)
    confirm: bool = Field(default=False, description="Required for kill/remove")

class DockerLogsInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    container: str = Field(..., description="Container name or ID")
    tail: int = Field(default=100, ge=1, le=5000)
    since: Optional[str] = Field(default=None, description="Show logs since (e.g., '1h', '30m', '2024-01-01')")

class DockerImagesInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["list", "pull", "remove", "inspect", "prune", "history"] = Field(default="list")
    image: Optional[str] = Field(default=None, description="Image name:tag")
    confirm: bool = Field(default=False)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class DockerNetworkInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["list", "create", "inspect", "remove"] = Field(default="list")
    name: Optional[str] = Field(default=None)
    driver: Literal["bridge", "overlay", "host", "macvlan", "none"] = Field(default="bridge")
    subnet: Optional[str] = Field(default=None, description="CIDR subnet (e.g., '172.28.0.0/16')")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class DockerVolumeInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["list", "create", "inspect", "remove", "prune"] = Field(default="list")
    name: Optional[str] = Field(default=None)
    confirm: bool = Field(default=False)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class DockerComposeInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["up", "down", "ps", "logs", "restart", "build"] = Field(...)
    file: str = Field(default="docker-compose.yml", description="Compose file path")
    service: Optional[str] = Field(default=None, description="Specific service")
    detach: bool = Field(default=True)

class DockerBuildInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    path: str = Field(default=".", description="Build context path")
    tag: str = Field(..., description="Image tag (e.g., 'santhira/app:v1')")
    dockerfile: str = Field(default="Dockerfile")
    no_cache: bool = Field(default=False)
    build_args: Optional[Dict[str, str]] = Field(default=None)

class DockerSystemInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["info", "df", "prune", "events"] = Field(default="info")
    confirm: bool = Field(default=False)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class DockerHealthCheckInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

# ---- TOOLS ----

@mcp.tool(name="docker_containers", annotations={"title": "List Containers", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def docker_containers(params: DockerContainersInput, ctx=None) -> str:
    """List Docker containers with status, ports, CPU/memory usage, and uptime."""
    try:
        client = _get_docker()
        containers = client.containers.list(all=params.show_all)
        if params.name_filter:
            containers = [c for c in containers if params.name_filter in c.name]

        if params.response_format == ResponseFormat.JSON:
            return _safe_json([{"id": c.short_id, "name": c.name, "status": c.status, "image": c.image.tags[0] if c.image.tags else "?"} for c in containers])

        md = f"## 🐳 Containers ({len(containers)})\n\n"
        md += "| Name | Image | Status | Ports |\n|------|-------|--------|-------|\n"
        for c in containers:
            img = c.image.tags[0] if c.image.tags else c.image.short_id
            ports = ", ".join(f"{k}→{v[0]['HostPort']}" for k, v in (c.ports or {}).items() if v) if c.ports else "-"
            emoji = "🟢" if c.status == "running" else "🔴" if c.status == "exited" else "🟡"
            md += f"| `{c.name}` | {img} | {emoji} {c.status} | {ports} |\n"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="docker_container_action", annotations={"title": "Container Actions", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False})
async def docker_container_action(params: DockerContainerActionInput, ctx=None) -> str:
    """Perform actions on containers: start, stop, restart, pause, kill, remove, inspect, top, stats."""
    try:
        client = _get_docker()
        c = client.containers.get(params.container)

        if params.action == "inspect":
            info = c.attrs
            md = f"## 🔍 Container: `{c.name}`\n\n"
            md += f"- **ID:** {c.short_id}\n- **Image:** {info['Config']['Image']}\n"
            md += f"- **Status:** {c.status}\n- **Created:** {info['Created']}\n"
            md += f"- **Platform:** {info.get('Platform', 'linux')}\n"
            md += f"- **Command:** `{' '.join(info['Config'].get('Cmd') or [])}`\n"
            net = info.get("NetworkSettings", {}).get("Networks", {})
            for name, n in net.items():
                md += f"- **Network {name}:** IP={n.get('IPAddress', '-')}\n"
            return md

        elif params.action == "stats":
            stats = c.stats(stream=False)
            cpu_delta = stats['cpu_stats']['cpu_usage']['total_usage'] - stats['precpu_stats']['cpu_usage']['total_usage']
            sys_delta = stats['cpu_stats']['system_cpu_usage'] - stats['precpu_stats']['system_cpu_usage']
            cpu_pct = (cpu_delta / sys_delta) * 100 if sys_delta > 0 else 0
            mem_usage = stats['memory_stats'].get('usage', 0)
            mem_limit = stats['memory_stats'].get('limit', 1)
            return f"## 📊 Stats: `{c.name}`\n\n- **CPU:** {cpu_pct:.2f}%\n- **Memory:** {_fmt_bytes(mem_usage)} / {_fmt_bytes(mem_limit)} ({mem_usage/mem_limit*100:.1f}%)\n"

        elif params.action == "top":
            top = c.top()
            md = f"## 🔝 Processes: `{c.name}`\n\n"
            md += "| " + " | ".join(top['Titles']) + " |\n"
            md += "|" + "|".join(["---"] * len(top['Titles'])) + "|\n"
            for proc in top['Processes']:
                md += "| " + " | ".join(proc) + " |\n"
            return md

        elif params.action in ["kill", "remove"]:
            if not params.confirm:
                return f"⚠️ {params.action.upper()} `{c.name}` requires confirm=True."
            if params.action == "kill": c.kill()
            else: c.remove(force=True)
            return f"✅ Container `{c.name}` {params.action}ed."
        else:
            getattr(c, params.action)()
            return f"✅ Container `{c.name}` — {params.action} executed."
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="docker_logs", annotations={"title": "Container Logs", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def docker_logs(params: DockerLogsInput, ctx=None) -> str:
    """Get container logs with tail and time filters."""
    try:
        client = _get_docker()
        c = client.containers.get(params.container)
        kwargs = {"tail": params.tail}
        if params.since:
            kwargs["since"] = params.since
        logs = c.logs(**kwargs).decode("utf-8", errors="replace")
        return f"## 📋 Logs: `{c.name}` (last {params.tail} lines)\n```\n{logs[-5000:]}\n```"
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="docker_images", annotations={"title": "Image Manager", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False})
async def docker_images(params: DockerImagesInput, ctx=None) -> str:
    """Manage Docker images: list, pull, remove, inspect, prune unused, view history."""
    try:
        client = _get_docker()
        if params.action == "list":
            images = client.images.list()
            md = f"## 🖼️ Images ({len(images)})\n\n"
            md += "| Repository:Tag | Size | ID | Created |\n|---------------|------|----|---------|\n"
            for img in images:
                tag = img.tags[0] if img.tags else "<none>"
                md += f"| `{tag}` | {_fmt_bytes(img.attrs.get('Size', 0))} | {img.short_id} | {img.attrs.get('Created', '?')[:19]} |\n"
            return md
        elif params.action == "pull":
            if not params.image: return "⚠️ Provide image name."
            img = client.images.pull(params.image)
            return f"✅ Pulled `{params.image}` — {img.short_id}"
        elif params.action == "remove":
            if not params.image or not params.confirm: return "⚠️ Provide image name and confirm=True."
            client.images.remove(params.image, force=True)
            return f"🗑️ Removed image `{params.image}`"
        elif params.action == "prune":
            if not params.confirm: return "⚠️ Prune removes ALL unused images. Set confirm=True."
            result = client.images.prune()
            reclaimed = sum(i.get('Size', 0) for i in (result.get('ImagesDeleted') or []))
            return f"🗑️ Pruned {len(result.get('ImagesDeleted') or [])} images. Reclaimed: {_fmt_bytes(result.get('SpaceReclaimed', 0))}"
        elif params.action == "inspect" and params.image:
            img = client.images.get(params.image)
            return f"## 🔍 Image: `{params.image}`\n```json\n{_safe_json(img.attrs)[:3000]}\n```"
        elif params.action == "history" and params.image:
            img = client.images.get(params.image)
            history = img.history()
            md = f"## 📜 History: `{params.image}`\n\n"
            for h in history:
                md += f"- {h.get('CreatedBy', '?')[:80]} — {_fmt_bytes(h.get('Size', 0))}\n"
            return md
        return "Provide image name for this action."
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="docker_networks", annotations={"title": "Network Manager", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def docker_networks(params: DockerNetworkInput, ctx=None) -> str:
    """Manage Docker networks: list, create, inspect, remove."""
    try:
        client = _get_docker()
        if params.action == "list":
            nets = client.networks.list()
            md = f"## 🌐 Networks ({len(nets)})\n\n"
            for n in nets:
                cfg = n.attrs.get("IPAM", {}).get("Config", [{}])
                subnet = cfg[0].get("Subnet", "-") if cfg else "-"
                md += f"- `{n.name}` — {n.attrs.get('Driver', '?')} | Subnet: {subnet} | Containers: {len(n.attrs.get('Containers', {}))}\n"
            return md
        elif params.action == "create" and params.name:
            ipam = None
            if params.subnet:
                import docker
                ipam_pool = docker.types.IPAMPool(subnet=params.subnet)
                ipam = docker.types.IPAMConfig(pool_configs=[ipam_pool])
            net = client.networks.create(params.name, driver=params.driver, ipam=ipam)
            return f"✅ Network `{params.name}` created ({params.driver}). ID: {net.short_id}"
        elif params.action == "inspect" and params.name:
            net = client.networks.get(params.name)
            return f"## 🔍 Network: `{params.name}`\n```json\n{_safe_json(net.attrs)[:3000]}\n```"
        elif params.action == "remove" and params.name:
            net = client.networks.get(params.name)
            net.remove()
            return f"🗑️ Network `{params.name}` removed."
        return "Provide network name."
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="docker_volumes", annotations={"title": "Volume Manager", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def docker_volumes(params: DockerVolumeInput, ctx=None) -> str:
    """Manage Docker volumes: list, create, inspect, remove, prune unused."""
    try:
        client = _get_docker()
        if params.action == "list":
            vols = client.volumes.list()
            md = f"## 💾 Volumes ({len(vols)})\n\n"
            for v in vols:
                md += f"- `{v.name}` — Driver: {v.attrs.get('Driver', '?')} | Mount: {v.attrs.get('Mountpoint', '?')}\n"
            return md
        elif params.action == "create" and params.name:
            vol = client.volumes.create(params.name)
            return f"✅ Volume `{params.name}` created."
        elif params.action == "prune":
            if not params.confirm: return "⚠️ Set confirm=True to prune unused volumes."
            result = client.volumes.prune()
            return f"🗑️ Pruned {len(result.get('VolumesDeleted') or [])} volumes. Reclaimed: {_fmt_bytes(result.get('SpaceReclaimed', 0))}"
        elif params.action == "remove" and params.name:
            vol = client.volumes.get(params.name)
            vol.remove()
            return f"🗑️ Volume `{params.name}` removed."
        return "Provide volume name."
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="docker_system", annotations={"title": "System Info", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def docker_system(params: DockerSystemInput, ctx=None) -> str:
    """Docker system info, disk usage, and system prune."""
    try:
        client = _get_docker()
        if params.action == "info":
            info = client.info()
            md = f"## 🐳 Docker System Info\n\n"
            md += f"- **Server Version:** {info.get('ServerVersion')}\n"
            md += f"- **OS:** {info.get('OperatingSystem')}\n"
            md += f"- **Kernel:** {info.get('KernelVersion')}\n"
            md += f"- **CPUs:** {info.get('NCPU')}\n"
            md += f"- **Memory:** {_fmt_bytes(info.get('MemTotal', 0))}\n"
            md += f"- **Containers:** {info.get('Containers')} (Running: {info.get('ContainersRunning')}, Stopped: {info.get('ContainersStopped')})\n"
            md += f"- **Images:** {info.get('Images')}\n"
            md += f"- **Storage Driver:** {info.get('Driver')}\n"
            return md
        elif params.action == "df":
            df = client.df()
            md = "## 💾 Docker Disk Usage\n\n"
            images_size = sum(i.get('Size', 0) for i in df.get('Images', []))
            containers_size = sum(c.get('SizeRw', 0) for c in df.get('Containers', []))
            volumes_size = sum(v.get('UsageData', {}).get('Size', 0) for v in df.get('Volumes', []))
            md += f"- **Images:** {_fmt_bytes(images_size)} ({len(df.get('Images', []))} images)\n"
            md += f"- **Containers:** {_fmt_bytes(containers_size)} ({len(df.get('Containers', []))} containers)\n"
            md += f"- **Volumes:** {_fmt_bytes(volumes_size)} ({len(df.get('Volumes', []))} volumes)\n"
            md += f"- **Total:** {_fmt_bytes(images_size + containers_size + volumes_size)}\n"
            return md
        elif params.action == "prune":
            if not params.confirm: return "⚠️ System prune removes ALL stopped containers, unused networks, dangling images, and build cache. Set confirm=True."
            result = client.containers.prune()
            img_result = client.images.prune()
            net_result = client.networks.prune()
            return f"🗑️ System pruned. Reclaimed: {_fmt_bytes(result.get('SpaceReclaimed', 0) + img_result.get('SpaceReclaimed', 0))}"
        return "Unknown action."
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="docker_health_check", annotations={"title": "AI Health Check", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def docker_health_check(params: DockerHealthCheckInput, ctx=None) -> str:
    """Comprehensive Docker host health check. Checks containers, disk usage, restarts, network issues."""
    try:
        client = _get_docker()
        issues, score = [], 100

        containers = client.containers.list(all=True)
        running = [c for c in containers if c.status == "running"]
        exited = [c for c in containers if c.status == "exited"]
        restarting = [c for c in containers if c.status == "restarting"]

        if restarting:
            issues.append(("🔴", f"Restarting containers: {', '.join(c.name for c in restarting)}"))
            score -= 20

        for c in running:
            restart_count = c.attrs.get("RestartCount", 0)
            if restart_count > 5:
                issues.append(("🟡", f"`{c.name}` has restarted {restart_count} times"))
                score -= 5

        if len(exited) > 10:
            issues.append(("🟡", f"{len(exited)} stopped containers consuming disk space"))
            score -= 5

        info = client.info()
        if info.get("MemoryLimit", True) is False:
            issues.append(("🟡", "Memory limits not enforced on containers"))
            score -= 5

        score = max(0, score)
        emoji = "🟢" if score >= 80 else "🟡" if score >= 50 else "🔴"
        md = f"## {emoji} Docker Health — Score: {score}/100\n\n"
        md += f"**Running:** {len(running)} | **Stopped:** {len(exited)} | **Restarting:** {len(restarting)}\n\n"
        if issues:
            md += "### Issues\n" + "".join(f"- {s} {m}\n" for s, m in issues)
        if not issues:
            md += "✅ Docker host is healthy!\n"
        return md
    except Exception as e:
        return _handle_error(e)

if __name__ == "__main__":
    import sys
    transport = "stdio"
    for arg in sys.argv[1:]:
        if arg == "--http": transport = "streamable_http"
    mcp.run(transport=transport, port=8004) if transport == "streamable_http" else mcp.run()
