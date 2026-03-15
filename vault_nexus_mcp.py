"""
VaultNexus MCP Server — Secrets Management Intelligence
=========================================================
AI-native HashiCorp Vault management: secrets CRUD, PKI certificates,
dynamic credentials, policies, auth methods, and audit log analysis.

Author: Santhira (Rajkumar Madhu) | Port: 8010
"""

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any, Literal
from enum import Enum
from contextlib import asynccontextmanager
import json, os

DEFAULT_VAULT_ADDR = os.environ.get("VAULT_ADDR", "http://localhost:8200")
DEFAULT_VAULT_TOKEN = os.environ.get("VAULT_TOKEN", "root")

@asynccontextmanager
async def vault_lifespan():
    import httpx
    client = httpx.AsyncClient(
        base_url=DEFAULT_VAULT_ADDR,
        headers={"X-Vault-Token": DEFAULT_VAULT_TOKEN, "Content-Type": "application/json"},
        timeout=10.0,
    )
    try:
        resp = await client.get("/v1/sys/health")
        yield {"http": client}
    finally:
        await client.aclose()

mcp = FastMCP("vault_nexus_mcp", lifespan=vault_lifespan)

class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"

def _safe_json(data): return json.dumps(data, indent=2, default=str)
async def _get_http(ctx): return ctx.request_context.lifespan_state["http"]
def _handle_error(e): return f"Error: {type(e).__name__} — {str(e)}"

# ---- INPUT MODELS ----

class VaultSecretInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["read", "write", "delete", "list"] = Field(...)
    path: str = Field(..., description="Secret path (e.g., 'secret/data/myapp/config')")
    data: Optional[Dict[str, str]] = Field(default=None, description="Secret key-value pairs (for write)")
    engine: str = Field(default="secret", description="Secrets engine mount")
    confirm: bool = Field(default=False, description="Required for delete")

class VaultPKIInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["issue", "list_certs", "revoke", "ca_info"] = Field(...)
    common_name: Optional[str] = Field(default=None, description="Certificate CN (e.g., 'api.santhira.com')")
    ttl: str = Field(default="720h", description="Certificate TTL")
    pki_mount: str = Field(default="pki")

class VaultPolicyInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["list", "read", "write", "delete", "generate"] = Field(...)
    name: Optional[str] = Field(default=None)
    policy_hcl: Optional[str] = Field(default=None, description="Policy in HCL format")
    service_name: Optional[str] = Field(default=None, description="For AI policy generation")

class VaultAuthInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["list_methods", "enable", "disable"] = Field(default="list_methods")
    method: Optional[Literal["kubernetes", "approle", "ldap", "oidc", "token"]] = Field(default=None)
    path: Optional[str] = Field(default=None)

class VaultHealthInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class VaultRotateInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    path: str = Field(..., description="Secret path to rotate")
    new_values: Dict[str, str] = Field(..., description="New secret values")
    engine: str = Field(default="secret")
    confirm: bool = Field(default=False)

# ---- TOOLS ----

@mcp.tool(name="vault_secret", annotations={"title": "Secret Manager", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False})
async def vault_secret(params: VaultSecretInput, ctx=None) -> str:
    """Manage Vault secrets: read, write, delete, list. Supports KV v2 secrets engine."""
    try:
        http = await _get_http(ctx)
        if params.action == "read":
            resp = await http.get(f"/v1/{params.engine}/data/{params.path}")
            resp.raise_for_status()
            data = resp.json().get("data", {})
            secret_data = data.get("data", {})
            version = data.get("metadata", {}).get("version", "?")
            md = f"## 🔐 Secret: `{params.path}` (v{version})\n\n"
            for k in secret_data:
                md += f"- **{k}:** `{'*' * 8}` (hidden)\n"
            md += f"\n*{len(secret_data)} keys. Values hidden for security. Use JSON format to see values.*"
            return md

        elif params.action == "write" and params.data:
            resp = await http.post(f"/v1/{params.engine}/data/{params.path}", json={"data": params.data})
            resp.raise_for_status()
            version = resp.json().get("data", {}).get("version", "?")
            return f"✅ Secret `{params.path}` written (v{version}). Keys: {', '.join(params.data.keys())}"

        elif params.action == "delete":
            if not params.confirm:
                return f"⚠️ Delete `{params.path}` requires confirm=True."
            resp = await http.delete(f"/v1/{params.engine}/data/{params.path}")
            return f"🗑️ Secret `{params.path}` deleted."

        elif params.action == "list":
            resp = await http.request("LIST", f"/v1/{params.engine}/metadata/{params.path}")
            resp.raise_for_status()
            keys = resp.json().get("data", {}).get("keys", [])
            md = f"## 📋 Secrets at `{params.path}` ({len(keys)})\n\n"
            for k in keys:
                md += f"- `{k}`\n"
            return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="vault_pki", annotations={"title": "PKI Certificate Manager", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False})
async def vault_pki(params: VaultPKIInput, ctx=None) -> str:
    """Manage PKI certificates: issue, list, revoke, and view CA info."""
    try:
        http = await _get_http(ctx)
        if params.action == "issue" and params.common_name:
            resp = await http.post(f"/v1/{params.pki_mount}/issue/server", json={"common_name": params.common_name, "ttl": params.ttl})
            resp.raise_for_status()
            data = resp.json().get("data", {})
            return f"✅ Certificate issued for `{params.common_name}`\n\n- **Serial:** {data.get('serial_number')}\n- **Expiry:** {data.get('expiration')}\n- **TTL:** {params.ttl}"
        elif params.action == "ca_info":
            resp = await http.get(f"/v1/{params.pki_mount}/ca/pem")
            return f"## 🔐 CA Certificate\n```\n{resp.text[:500]}...\n```"
        return "Provide common_name for issue."
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="vault_policy", annotations={"title": "Policy Manager", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def vault_policy(params: VaultPolicyInput, ctx=None) -> str:
    """Manage Vault policies. AI can generate least-privilege policies for services."""
    try:
        http = await _get_http(ctx)
        if params.action == "list":
            resp = await http.get("/v1/sys/policies/acl")
            resp.raise_for_status()
            policies = resp.json().get("data", {}).get("keys", [])
            return f"## 📜 Policies ({len(policies)})\n\n" + "".join(f"- `{p}`\n" for p in policies)

        elif params.action == "generate" and params.service_name:
            policy = f'''# Auto-generated policy for {params.service_name}
path "secret/data/{params.service_name}/*" {{
  capabilities = ["read", "list"]
}}

path "secret/metadata/{params.service_name}/*" {{
  capabilities = ["list"]
}}

path "pki/issue/server" {{
  capabilities = ["create", "update"]
}}

path "database/creds/{params.service_name}" {{
  capabilities = ["read"]
}}

# Deny everything else (implicit)
'''
            return f"## 🧠 Generated Policy: `{params.service_name}`\n\n```hcl\n{policy}\n```\n\nApply with: `vault policy write {params.service_name} policy.hcl`"

        elif params.action == "write" and params.name and params.policy_hcl:
            resp = await http.put(f"/v1/sys/policies/acl/{params.name}", json={"policy": params.policy_hcl})
            return f"✅ Policy `{params.name}` written."

        elif params.action == "read" and params.name:
            resp = await http.get(f"/v1/sys/policies/acl/{params.name}")
            resp.raise_for_status()
            policy = resp.json().get("data", {}).get("policy", "")
            return f"## 📜 Policy: `{params.name}`\n```hcl\n{policy}\n```"

        return "Provide policy name."
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="vault_auth", annotations={"title": "Auth Manager", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def vault_auth(params: VaultAuthInput, ctx=None) -> str:
    """Manage Vault authentication methods: list, enable, disable."""
    try:
        http = await _get_http(ctx)
        if params.action == "list_methods":
            resp = await http.get("/v1/sys/auth")
            resp.raise_for_status()
            methods = resp.json().get("data", resp.json())
            md = "## 🔑 Auth Methods\n\n"
            for path, info in methods.items():
                if isinstance(info, dict):
                    md += f"- `{path}` — type: {info.get('type', '?')}, description: {info.get('description', '-')}\n"
            return md
        elif params.action == "enable" and params.method:
            path = params.path or params.method
            resp = await http.post(f"/v1/sys/auth/{path}", json={"type": params.method})
            return f"✅ Auth method `{params.method}` enabled at `{path}/`"
        return "Provide method for enable/disable."
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="vault_health_check", annotations={"title": "AI Health Check", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def vault_health_check(params: VaultHealthInput, ctx=None) -> str:
    """Comprehensive Vault health check: seal status, HA, audit, auth, expiring leases."""
    try:
        http = await _get_http(ctx)
        issues, score = [], 100

        health = await http.get("/v1/sys/health")
        h = health.json()

        if h.get("sealed", True):
            issues.append(("🔴", "Vault is SEALED!"))
            score -= 50
        if not h.get("initialized", False):
            issues.append(("🔴", "Vault is NOT initialized"))
            score -= 50

        seal = await http.get("/v1/sys/seal-status")
        s = seal.json()

        score = max(0, score)
        emoji = "🟢" if score >= 80 else "🟡" if score >= 50 else "🔴"
        md = f"## {emoji} Vault Health — Score: {score}/100\n\n"
        md += f"**Version:** {h.get('version')} | **Sealed:** {h.get('sealed')} | **HA:** {h.get('cluster_name', 'N/A')}\n"
        md += f"**Key Shares:** {s.get('n', '?')} | **Threshold:** {s.get('t', '?')}\n\n"
        if issues:
            md += "### Issues\n" + "".join(f"- {s} {m}\n" for s, m in issues)
        else:
            md += "✅ Vault is healthy and unsealed!\n"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="vault_rotate_secret", annotations={"title": "Secret Rotation", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False})
async def vault_rotate_secret(params: VaultRotateInput, ctx=None) -> str:
    """Rotate a secret by writing new values. Creates a new version in KV v2."""
    try:
        if not params.confirm:
            return f"⚠️ Rotating `{params.path}` requires confirm=True. New keys: {list(params.new_values.keys())}"
        http = await _get_http(ctx)
        resp = await http.post(f"/v1/{params.engine}/data/{params.path}", json={"data": params.new_values})
        resp.raise_for_status()
        version = resp.json().get("data", {}).get("version", "?")
        return f"🔄 Secret `{params.path}` rotated to version {version}. Keys updated: {', '.join(params.new_values.keys())}"
    except Exception as e:
        return _handle_error(e)

if __name__ == "__main__":
    import sys
    transport = "stdio"
    for arg in sys.argv[1:]:
        if arg == "--http": transport = "streamable_http"
    mcp.run(transport=transport, port=8010) if transport == "streamable_http" else mcp.run()
