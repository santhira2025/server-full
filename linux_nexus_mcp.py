"""
LinuxNexus MCP Server — System Administration Intelligence
=============================================================
AI-native Linux system management: system info, process management,
disk/memory/CPU monitoring, service management, firewall, cron, and
performance analysis.

Author: Santhira (Rajkumar Madhu) | Port: 8013
"""

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any, Literal
from enum import Enum
import json, subprocess

mcp = FastMCP("linux_nexus_mcp")

def _safe_json(data): return json.dumps(data, indent=2, default=str)
def _run(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=15)
def _handle_error(e): return f"Error: {type(e).__name__} — {str(e)}"

class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"

# ---- INPUT MODELS ----

class SysInfoInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class SysProcessInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["list", "top", "kill", "find"] = Field(default="top")
    pid: Optional[int] = Field(default=None, description="PID for kill")
    name: Optional[str] = Field(default=None, description="Process name to find")
    signal: int = Field(default=15, description="Kill signal (15=TERM, 9=KILL)")
    sort_by: Literal["cpu", "mem", "pid"] = Field(default="cpu")
    count: int = Field(default=20, ge=1, le=100)
    confirm: bool = Field(default=False)

class SysDiskInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["usage", "inodes", "top_dirs", "io_stats"] = Field(default="usage")
    path: str = Field(default="/", description="Path for top_dirs analysis")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class SysMemoryInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["overview", "top_consumers", "swap", "cache_clear"] = Field(default="overview")
    count: int = Field(default=10)
    confirm: bool = Field(default=False)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class SysNetworkInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["interfaces", "connections", "ports", "dns", "route", "bandwidth"] = Field(default="interfaces")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class SysServiceInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["list", "status", "start", "stop", "restart", "enable", "disable", "logs"] = Field(...)
    name: Optional[str] = Field(default=None, description="Service name")
    confirm: bool = Field(default=False)

class SysCronInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["list", "add", "remove", "generate"] = Field(default="list")
    schedule: Optional[str] = Field(default=None, description="Cron expression (e.g., '0 2 * * *')")
    command: Optional[str] = Field(default=None, description="Command to run")
    description: Optional[str] = Field(default=None, description="For AI cron generation")
    user: str = Field(default="root")

class SysHealthInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class SysFirewallInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["status", "list_rules", "allow", "deny", "delete_rule"] = Field(default="status")
    port: Optional[int] = Field(default=None)
    protocol: Literal["tcp", "udp", "both"] = Field(default="tcp")
    source: Optional[str] = Field(default=None, description="Source IP/CIDR")
    confirm: bool = Field(default=False)

# ---- TOOLS ----

@mcp.tool(name="sys_info", annotations={"title": "System Info", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def sys_info(params: SysInfoInput, ctx=None) -> str:
    """Get comprehensive system information: OS, kernel, CPU, memory, disk, uptime."""
    try:
        hostname = _run("hostname").stdout.strip()
        os_info = _run("cat /etc/os-release | head -4").stdout
        kernel = _run("uname -r").stdout.strip()
        uptime = _run("uptime -p").stdout.strip()
        cpu = _run("nproc").stdout.strip()
        cpu_model = _run("lscpu | grep 'Model name' | head -1").stdout.strip()
        mem = _run("free -h | head -2").stdout
        disk = _run("df -h / | tail -1").stdout.strip()
        load = _run("cat /proc/loadavg").stdout.strip()

        md = f"## 🖥️ System: `{hostname}`\n\n"
        md += f"**Kernel:** {kernel} | **Uptime:** {uptime}\n"
        md += f"**CPU:** {cpu} cores — {cpu_model}\n"
        md += f"**Load:** {load}\n\n"
        md += f"### Memory\n```\n{mem}\n```\n"
        md += f"### Root Disk\n`{disk}`\n"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="sys_process", annotations={"title": "Process Manager", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False})
async def sys_process(params: SysProcessInput, ctx=None) -> str:
    """Manage processes: list top consumers, find by name, kill by PID."""
    try:
        if params.action == "top":
            sort_flag = {"cpu": "-pcpu", "mem": "-pmem", "pid": "-pid"}.get(params.sort_by, "-pcpu")
            result = _run(f"ps aux --sort={sort_flag} | head -{params.count + 1}")
            return f"## 🔝 Top Processes (by {params.sort_by})\n```\n{result.stdout}\n```"

        elif params.action == "find" and params.name:
            result = _run(f"pgrep -a {params.name}")
            return f"## 🔍 Processes matching `{params.name}`\n```\n{result.stdout or 'No matches'}\n```"

        elif params.action == "kill" and params.pid:
            if not params.confirm:
                ps = _run(f"ps -p {params.pid} -o pid,user,comm,args --no-headers")
                return f"⚠️ Kill PID {params.pid} requires confirm=True.\n```\n{ps.stdout}\n```"
            result = _run(f"kill -{params.signal} {params.pid}")
            return f"✅ Sent signal {params.signal} to PID {params.pid}."

        elif params.action == "list":
            result = _run(f"ps aux | wc -l")
            return f"**Total processes:** {result.stdout.strip()}"

    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="sys_disk", annotations={"title": "Disk Manager", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def sys_disk(params: SysDiskInput, ctx=None) -> str:
    """Disk analysis: filesystem usage, inodes, largest directories, I/O stats."""
    try:
        if params.action == "usage":
            result = _run("df -h --output=source,fstype,size,used,avail,pcent,target | grep -v tmpfs")
            md = f"## 💾 Disk Usage\n```\n{result.stdout}\n```"
            # Warnings
            for line in result.stdout.split("\n"):
                if "%" in line:
                    parts = line.split()
                    for p in parts:
                        if p.endswith("%") and int(p.rstrip("%")) > 85:
                            md += f"\n⚠️ **Warning:** {parts[0]} is at {p}!"
            return md

        elif params.action == "inodes":
            result = _run("df -ih | grep -v tmpfs")
            return f"## 📁 Inode Usage\n```\n{result.stdout}\n```"

        elif params.action == "top_dirs":
            result = _run(f"du -sh {params.path}/*/ 2>/dev/null | sort -rh | head -15")
            return f"## 📂 Largest Directories in `{params.path}`\n```\n{result.stdout}\n```"

        elif params.action == "io_stats":
            result = _run("iostat -x 1 1 2>/dev/null || cat /proc/diskstats | head -10")
            return f"## 📊 I/O Stats\n```\n{result.stdout}\n```"

    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="sys_memory", annotations={"title": "Memory Manager", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def sys_memory(params: SysMemoryInput, ctx=None) -> str:
    """Memory analysis: overview, top consumers, swap, cache management."""
    try:
        if params.action == "overview":
            result = _run("free -h")
            vmstat = _run("vmstat 1 1")
            return f"## 🧠 Memory\n```\n{result.stdout}\n```\n### VM Stats\n```\n{vmstat.stdout}\n```"

        elif params.action == "top_consumers":
            result = _run(f"ps aux --sort=-%mem | head -{params.count + 1}")
            return f"## 🧠 Top Memory Consumers\n```\n{result.stdout}\n```"

        elif params.action == "swap":
            result = _run("swapon --show")
            swap_usage = _run("free -h | grep Swap")
            return f"## 💽 Swap\n```\n{result.stdout or 'No swap'}\n{swap_usage.stdout}\n```"

        elif params.action == "cache_clear":
            if not params.confirm: return "⚠️ Clear page cache requires confirm=True. This is safe but may temporarily slow disk I/O."
            _run("sync && echo 3 > /proc/sys/vm/drop_caches")
            return "✅ Page cache, dentries, and inodes cleared."

    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="sys_network", annotations={"title": "Network Inspector", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def sys_network(params: SysNetworkInput, ctx=None) -> str:
    """Network diagnostics: interfaces, connections, listening ports, DNS, routes."""
    try:
        if params.action == "interfaces":
            result = _run("ip -brief addr show")
            return f"## 🌐 Network Interfaces\n```\n{result.stdout}\n```"
        elif params.action == "ports":
            result = _run("ss -tlnp")
            return f"## 🔌 Listening Ports\n```\n{result.stdout}\n```"
        elif params.action == "connections":
            result = _run("ss -s")
            return f"## 🔗 Connection Summary\n```\n{result.stdout}\n```"
        elif params.action == "dns":
            result = _run("cat /etc/resolv.conf")
            return f"## 🌍 DNS\n```\n{result.stdout}\n```"
        elif params.action == "route":
            result = _run("ip route show")
            return f"## 🛣️ Routes\n```\n{result.stdout}\n```"
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="sys_service", annotations={"title": "Service Manager", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False})
async def sys_service(params: SysServiceInput, ctx=None) -> str:
    """Manage systemd services: list, status, start, stop, restart, enable, disable, logs."""
    try:
        if params.action == "list":
            result = _run("systemctl list-units --type=service --state=running --no-pager | head -30")
            return f"## ⚙️ Running Services\n```\n{result.stdout}\n```"
        elif params.action == "status" and params.name:
            result = _run(f"systemctl status {params.name} --no-pager")
            return f"## ⚙️ Service: `{params.name}`\n```\n{result.stdout}\n```"
        elif params.action == "logs" and params.name:
            result = _run(f"journalctl -u {params.name} --no-pager -n 50")
            return f"## 📋 Logs: `{params.name}`\n```\n{result.stdout[-3000:]}\n```"
        elif params.action in ["start", "stop", "restart", "enable", "disable"] and params.name:
            if params.action in ["stop"] and not params.confirm:
                return f"⚠️ Stop `{params.name}` requires confirm=True."
            result = _run(f"systemctl {params.action} {params.name}")
            return f"✅ `{params.name}` — {params.action} executed."
        return "Provide service name."
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="sys_cron", annotations={"title": "Cron Manager", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def sys_cron(params: SysCronInput, ctx=None) -> str:
    """Manage cron jobs: list, add, remove, and AI-generate cron expressions."""
    try:
        if params.action == "list":
            result = _run(f"crontab -l -u {params.user} 2>/dev/null")
            return f"## ⏰ Cron Jobs ({params.user})\n```\n{result.stdout or 'No crontab'}\n```"

        elif params.action == "generate" and params.description:
            desc = params.description.lower()
            if "every minute" in desc: expr = "* * * * *"
            elif "every hour" in desc: expr = "0 * * * *"
            elif "every day" in desc or "daily" in desc: expr = "0 2 * * *"
            elif "every week" in desc or "weekly" in desc: expr = "0 2 * * 0"
            elif "every month" in desc or "monthly" in desc: expr = "0 2 1 * *"
            elif "midnight" in desc: expr = "0 0 * * *"
            elif "morning" in desc: expr = "0 6 * * *"
            elif "every 5 min" in desc: expr = "*/5 * * * *"
            elif "every 15 min" in desc: expr = "*/15 * * * *"
            elif "every 30 min" in desc: expr = "*/30 * * * *"
            elif "weekday" in desc: expr = "0 9 * * 1-5"
            else: expr = "0 * * * *"

            return f"## ⏰ Cron Expression\n\n**Description:** {params.description}\n**Expression:** `{expr}`\n\n```\n# {params.description}\n{expr} {params.command or '/path/to/command'}\n```\n\n| Field | Value |\n|-------|-------|\n| Minute | {expr.split()[0]} |\n| Hour | {expr.split()[1]} |\n| Day | {expr.split()[2]} |\n| Month | {expr.split()[3]} |\n| Weekday | {expr.split()[4]} |"

        return "Provide description for generate."
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="sys_health_check", annotations={"title": "AI System Health", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def sys_health_check(params: SysHealthInput, ctx=None) -> str:
    """Comprehensive Linux system health check: CPU, memory, disk, load, processes, services."""
    try:
        issues, score = [], 100

        # Load
        load = _run("cat /proc/loadavg").stdout.strip().split()
        cpus = int(_run("nproc").stdout.strip())
        load_1m = float(load[0])
        if load_1m > cpus * 2:
            issues.append(("🔴", f"Load average {load_1m} exceeds {cpus*2} (2x CPUs)"))
            score -= 20
        elif load_1m > cpus:
            issues.append(("🟡", f"Load average {load_1m} above CPU count ({cpus})"))
            score -= 10

        # Memory
        mem = _run("free | grep Mem").stdout.split()
        if len(mem) >= 4:
            total, used = int(mem[1]), int(mem[2])
            mem_pct = (used / total) * 100
            if mem_pct > 90:
                issues.append(("🔴", f"Memory at {mem_pct:.0f}%"))
                score -= 20
            elif mem_pct > 80:
                issues.append(("🟡", f"Memory at {mem_pct:.0f}%"))
                score -= 5

        # Disk
        df_output = _run("df -h / | tail -1").stdout.split()
        if len(df_output) >= 5:
            disk_pct = int(df_output[4].rstrip("%"))
            if disk_pct > 90:
                issues.append(("🔴", f"Root disk at {disk_pct}%"))
                score -= 20
            elif disk_pct > 80:
                issues.append(("🟡", f"Root disk at {disk_pct}%"))
                score -= 5

        # Swap
        swap = _run("free | grep Swap").stdout.split()
        if len(swap) >= 3 and int(swap[1]) > 0:
            swap_used = int(swap[2]) / int(swap[1]) * 100
            if swap_used > 50:
                issues.append(("🟡", f"Swap usage at {swap_used:.0f}%"))
                score -= 5

        # Zombie processes
        zombies = _run("ps aux | grep -c ' Z '").stdout.strip()
        if int(zombies) > 5:
            issues.append(("🟡", f"{zombies} zombie processes"))
            score -= 5

        # Failed services
        failed = _run("systemctl --failed --no-pager --no-legend | wc -l").stdout.strip()
        if int(failed) > 0:
            issues.append(("🟡", f"{failed} failed systemd services"))
            score -= 5

        score = max(0, score)
        emoji = "🟢" if score >= 80 else "🟡" if score >= 50 else "🔴"
        md = f"## {emoji} System Health — Score: {score}/100\n\n"
        md += f"**Load:** {' '.join(load[:3])} | **CPUs:** {cpus} | **Memory:** {mem_pct:.0f}% | **Disk:** {df_output[4] if len(df_output) > 4 else '?'}\n\n"
        if issues:
            md += "### Issues\n" + "".join(f"- {s} {m}\n" for s, m in issues)
        else:
            md += "✅ System is healthy!\n"
        return md
    except Exception as e:
        return _handle_error(e)

if __name__ == "__main__":
    import sys
    transport = "stdio"
    for arg in sys.argv[1:]:
        if arg == "--http": transport = "streamable_http"
    mcp.run(transport=transport, port=8013) if transport == "streamable_http" else mcp.run()
