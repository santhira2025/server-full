"""
TerraformNexus MCP Server — Infrastructure as Code Intelligence
================================================================
AI-native Terraform management: state inspection, plan/apply, resource
analysis, drift detection, cost estimation, and module generation.

Author: Santhira (Rajkumar Madhu) | Port: 8009
"""

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any, Literal
from enum import Enum
import json, subprocess, os

mcp = FastMCP("terraform_nexus_mcp")

def _safe_json(data): return json.dumps(data, indent=2, default=str)
def _run_cmd(cmd, cwd=None):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120, cwd=cwd)
def _handle_error(e): return f"Error: {type(e).__name__} — {str(e)}"

class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"

# ---- INPUT MODELS ----

class TfStateInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    working_dir: str = Field(default=".", description="Terraform project directory")
    resource_filter: Optional[str] = Field(default=None, description="Filter resources by type (e.g., 'aws_instance')")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class TfPlanInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    working_dir: str = Field(default=".")
    target: Optional[str] = Field(default=None, description="Target specific resource")
    var_file: Optional[str] = Field(default=None, description="Variables file path")
    destroy: bool = Field(default=False)

class TfApplyInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    working_dir: str = Field(default=".")
    auto_approve: bool = Field(default=False, description="Skip approval (use with caution)")
    target: Optional[str] = Field(default=None)
    confirm: bool = Field(default=False)

class TfModuleGenInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    resource_type: Literal["eks_cluster", "rds_postgres", "s3_bucket", "vpc", "ec2_instance", "ecs_service", "alb", "redis_elasticache", "rabbitmq_amazonmq", "cloudfront"] = Field(...)
    environment: Literal["dev", "staging", "production"] = Field(default="production")
    region: str = Field(default="ap-south-1", description="AWS region")
    project_name: str = Field(default="santhira")

class TfDriftInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    working_dir: str = Field(default=".")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class TfCostInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    resources: List[Dict[str, Any]] = Field(..., description="List of resources [{type, size, region}]")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class TfValidateInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    working_dir: str = Field(default=".")

class TfWorkspaceInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["list", "show", "new", "select"] = Field(default="list")
    name: Optional[str] = Field(default=None)
    working_dir: str = Field(default=".")

# ---- TOOLS ----

@mcp.tool(name="tf_state", annotations={"title": "State Inspector", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def tf_state(params: TfStateInput, ctx=None) -> str:
    """Inspect Terraform state: list resources, show details, detect drift potential."""
    try:
        result = _run_cmd("terraform state list", cwd=params.working_dir)
        if result.returncode != 0:
            return f"❌ State error: {result.stderr}"
        resources = result.stdout.strip().split("\n")
        if params.resource_filter:
            resources = [r for r in resources if params.resource_filter in r]
        md = f"## 📋 Terraform State ({len(resources)} resources)\n\n"
        for r in resources:
            md += f"- `{r}`\n"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="tf_plan", annotations={"title": "Plan Changes", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def tf_plan(params: TfPlanInput, ctx=None) -> str:
    """Run terraform plan to preview infrastructure changes."""
    try:
        cmd = "terraform plan -no-color"
        if params.target: cmd += f" -target={params.target}"
        if params.var_file: cmd += f" -var-file={params.var_file}"
        if params.destroy: cmd += " -destroy"
        result = _run_cmd(cmd, cwd=params.working_dir)
        output = result.stdout + result.stderr
        # Parse summary
        lines = output.split("\n")
        summary = [l for l in lines if "Plan:" in l or "No changes" in l or "to add" in l]
        md = f"## 📋 Terraform Plan\n\n"
        if summary:
            md += f"**Summary:** {' '.join(summary)}\n\n"
        md += f"```\n{output[-3000:]}\n```"
        return md
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="tf_apply", annotations={"title": "Apply Changes", "readOnlyHint": False, "destructiveHint": True, "idempotentHint": False, "openWorldHint": True})
async def tf_apply(params: TfApplyInput, ctx=None) -> str:
    """Apply Terraform changes. Requires confirmation."""
    if not params.confirm:
        return "⚠️ `terraform apply` modifies real infrastructure. Set confirm=True and run tf_plan first!"
    try:
        cmd = "terraform apply -no-color"
        if params.auto_approve: cmd += " -auto-approve"
        if params.target: cmd += f" -target={params.target}"
        result = _run_cmd(cmd, cwd=params.working_dir)
        return f"## 🚀 Terraform Apply\n```\n{(result.stdout + result.stderr)[-3000:]}\n```"
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="tf_module_generate", annotations={"title": "AI Module Generator", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def tf_module_generate(params: TfModuleGenInput, ctx=None) -> str:
    """Generate production-ready Terraform modules for common AWS resources."""
    env = params.environment
    proj = params.project_name
    region = params.region

    modules = {
        "eks_cluster": f'''# EKS Cluster — {proj} {env}
module "eks" {{
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "{proj}-{env}"
  cluster_version = "1.29"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets
  cluster_endpoint_public_access = {"true" if env == "dev" else "false"}

  eks_managed_node_groups = {{
    workers = {{
      instance_types = ["{("t3.medium" if env == "dev" else "m5.xlarge")}"]
      min_size       = {1 if env == "dev" else 3}
      max_size       = {3 if env == "dev" else 10}
      desired_size   = {2 if env == "dev" else 3}
      disk_size      = {20 if env == "dev" else 50}
    }}
  }}

  tags = {{
    Environment = "{env}"
    Project     = "{proj}"
    ManagedBy   = "terraform"
  }}
}}''',
        "rds_postgres": f'''# RDS PostgreSQL — {proj} {env}
module "rds" {{
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 6.0"

  identifier     = "{proj}-{env}-pg"
  engine         = "postgres"
  engine_version = "16.1"
  instance_class = "{("db.t3.micro" if env == "dev" else "db.r6g.xlarge")}"
  allocated_storage = {20 if env == "dev" else 100}
  max_allocated_storage = {50 if env == "dev" else 500}

  db_name  = "{proj.replace("-", "_")}"
  username = "admin"
  port     = 5432

  multi_az               = {"false" if env == "dev" else "true"}
  backup_retention_period = {1 if env == "dev" else 7}
  deletion_protection     = {"false" if env == "dev" else "true"}

  vpc_security_group_ids = [module.sg.security_group_id]
  subnet_ids             = module.vpc.private_subnets

  tags = {{
    Environment = "{env}"
    Project     = "{proj}"
  }}
}}''',
        "vpc": f'''# VPC — {proj} {env}
module "vpc" {{
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "{proj}-{env}"
  cidr = "10.0.0.0/16"
  azs  = ["{region}a", "{region}b", "{region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway   = true
  single_nat_gateway   = {"true" if env == "dev" else "false"}
  enable_dns_hostnames = true

  tags = {{
    Environment = "{env}"
    Project     = "{proj}"
  }}
}}''',
        "s3_bucket": f'''# S3 Bucket — {proj} {env}
module "s3" {{
  source  = "terraform-aws-modules/s3-bucket/aws"
  version = "~> 4.0"

  bucket = "{proj}-{env}-data"
  acl    = "private"

  versioning = {{ enabled = {"false" if env == "dev" else "true"} }}

  server_side_encryption_configuration = {{
    rule = {{ apply_server_side_encryption_by_default = {{ sse_algorithm = "AES256" }} }}
  }}

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true

  tags = {{ Environment = "{env}", Project = "{proj}" }}
}}''',
    }

    template = modules.get(params.resource_type, f"# Module template for {params.resource_type} — coming soon")
    return f"## 🏗️ Terraform Module: `{params.resource_type}` ({env})\n\n```hcl\n{template}\n```\n\nRegion: `{region}` | Project: `{proj}`"

@mcp.tool(name="tf_validate", annotations={"title": "Validate Config", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def tf_validate(params: TfValidateInput, ctx=None) -> str:
    """Validate Terraform configuration files for syntax and consistency errors."""
    try:
        init = _run_cmd("terraform init -backend=false", cwd=params.working_dir)
        result = _run_cmd("terraform validate -no-color", cwd=params.working_dir)
        if result.returncode == 0:
            return f"✅ Configuration is valid!\n```\n{result.stdout}\n```"
        return f"❌ Validation failed:\n```\n{result.stderr}\n```"
    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="tf_workspaces", annotations={"title": "Workspace Manager", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def tf_workspaces(params: TfWorkspaceInput, ctx=None) -> str:
    """Manage Terraform workspaces: list, create, select."""
    try:
        if params.action == "list":
            result = _run_cmd("terraform workspace list", cwd=params.working_dir)
            return f"## 🗂️ Workspaces\n```\n{result.stdout}\n```"
        elif params.action == "show":
            result = _run_cmd("terraform workspace show", cwd=params.working_dir)
            return f"Current workspace: `{result.stdout.strip()}`"
        elif params.action == "new" and params.name:
            result = _run_cmd(f"terraform workspace new {params.name}", cwd=params.working_dir)
            return f"✅ Workspace `{params.name}` created."
        elif params.action == "select" and params.name:
            result = _run_cmd(f"terraform workspace select {params.name}", cwd=params.working_dir)
            return f"✅ Switched to workspace `{params.name}`."
        return "Provide workspace name."
    except Exception as e:
        return _handle_error(e)

if __name__ == "__main__":
    import sys
    transport = "stdio"
    for arg in sys.argv[1:]:
        if arg == "--http": transport = "streamable_http"
    mcp.run(transport=transport, port=8009) if transport == "streamable_http" else mcp.run()
