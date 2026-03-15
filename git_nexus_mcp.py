"""
GitNexus MCP Server — Git & CI/CD Operations Intelligence
============================================================
AI-native Git management: repo operations, branch management, PR workflows,
GitHub/GitLab API, CI/CD pipeline generation, and commit analysis.

Author: Santhira (Rajkumar Madhu) | Port: 8012
"""

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any, Literal
from enum import Enum
import json, subprocess, os

mcp = FastMCP("git_nexus_mcp")

def _safe_json(data): return json.dumps(data, indent=2, default=str)
def _run_cmd(cmd, cwd=None):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30, cwd=cwd or ".")
def _handle_error(e): return f"Error: {type(e).__name__} — {str(e)}"

class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"

# ---- INPUT MODELS ----

class GitRepoInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["status", "log", "diff", "branches", "remotes", "stash_list", "tags"] = Field(...)
    path: str = Field(default=".", description="Repository path")
    count: int = Field(default=10, description="Number of log entries", ge=1, le=100)
    branch: Optional[str] = Field(default=None)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

class GitBranchInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["create", "delete", "checkout", "merge", "rebase"] = Field(...)
    name: str = Field(..., description="Branch name")
    base: Optional[str] = Field(default=None, description="Base branch (for create)")
    path: str = Field(default=".")
    confirm: bool = Field(default=False)

class GitCommitInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action: Literal["commit", "amend", "cherry_pick", "revert"] = Field(...)
    message: Optional[str] = Field(default=None, description="Commit message")
    files: Optional[List[str]] = Field(default=None, description="Files to stage (None = all)")
    commit_hash: Optional[str] = Field(default=None, description="For cherry-pick/revert")
    path: str = Field(default=".")
    confirm: bool = Field(default=False)

class GitCommitMsgGenInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    path: str = Field(default=".", description="Repository path")
    style: Literal["conventional", "gitmoji", "simple"] = Field(default="conventional")

class GitCICDGenInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    platform: Literal["github_actions", "gitlab_ci", "jenkins", "bitbucket"] = Field(...)
    project_type: Literal["python", "node", "java", "go", "docker", "terraform", "kubernetes"] = Field(...)
    features: Optional[List[Literal["test", "lint", "build", "deploy", "security_scan", "docker_build", "helm_deploy"]]] = Field(default=None)
    deploy_target: Optional[Literal["eks", "ecs", "k8s", "docker_compose", "serverless"]] = Field(default=None)
    project_name: str = Field(default="santhira-app")

class GitHookGenInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    hook_type: Literal["pre-commit", "commit-msg", "pre-push", "post-merge"] = Field(...)
    checks: Optional[List[Literal["lint", "test", "format", "secrets_scan", "conventional_commit"]]] = Field(default=None)

class GitAnalysisInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    path: str = Field(default=".")
    analysis_type: Literal["contributors", "activity", "file_hotspots", "branch_health"] = Field(default="activity")
    days: int = Field(default=30, ge=1, le=365)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)

# ---- TOOLS ----

@mcp.tool(name="git_repo", annotations={"title": "Repository Inspector", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def git_repo(params: GitRepoInput, ctx=None) -> str:
    """Inspect git repository: status, log, diff, branches, remotes, tags."""
    try:
        if params.action == "status":
            result = _run_cmd("git status --short --branch", cwd=params.path)
            return f"## 📋 Git Status\n```\n{result.stdout or 'Clean working tree'}\n```"

        elif params.action == "log":
            fmt = "--pretty=format:'%h | %an | %ar | %s'"
            branch_flag = params.branch or ""
            result = _run_cmd(f"git log {branch_flag} -{params.count} {fmt}", cwd=params.path)
            md = f"## 📜 Git Log (last {params.count})\n\n"
            md += "| Hash | Author | Time | Message |\n|------|--------|------|--------|\n"
            for line in result.stdout.strip().split("\n"):
                parts = line.strip("'").split(" | ", 3)
                if len(parts) == 4:
                    md += f"| `{parts[0]}` | {parts[1]} | {parts[2]} | {parts[3]} |\n"
            return md

        elif params.action == "diff":
            result = _run_cmd(f"git diff {'--staged' if not params.branch else params.branch} --stat", cwd=params.path)
            return f"## 📊 Diff Summary\n```\n{result.stdout or 'No changes'}\n```"

        elif params.action == "branches":
            result = _run_cmd("git branch -a -v --sort=-committerdate", cwd=params.path)
            return f"## 🌿 Branches\n```\n{result.stdout}\n```"

        elif params.action == "remotes":
            result = _run_cmd("git remote -v", cwd=params.path)
            return f"## 🌐 Remotes\n```\n{result.stdout}\n```"

        elif params.action == "tags":
            result = _run_cmd("git tag --sort=-creatordate -n1", cwd=params.path)
            return f"## 🏷️ Tags\n```\n{result.stdout or 'No tags'}\n```"

        elif params.action == "stash_list":
            result = _run_cmd("git stash list", cwd=params.path)
            return f"## 📦 Stash\n```\n{result.stdout or 'No stashes'}\n```"

    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="git_branch", annotations={"title": "Branch Manager", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False})
async def git_branch(params: GitBranchInput, ctx=None) -> str:
    """Manage git branches: create, delete, checkout, merge, rebase."""
    try:
        if params.action == "create":
            base = params.base or "main"
            result = _run_cmd(f"git checkout -b {params.name} {base}", cwd=params.path)
            return f"✅ Branch `{params.name}` created from `{base}`."

        elif params.action == "checkout":
            result = _run_cmd(f"git checkout {params.name}", cwd=params.path)
            return f"✅ Switched to `{params.name}`."

        elif params.action == "delete":
            if not params.confirm: return f"⚠️ Delete branch `{params.name}` requires confirm=True."
            result = _run_cmd(f"git branch -D {params.name}", cwd=params.path)
            return f"🗑️ Branch `{params.name}` deleted."

        elif params.action == "merge":
            result = _run_cmd(f"git merge {params.name} --no-edit", cwd=params.path)
            if result.returncode != 0:
                return f"⚠️ Merge conflict:\n```\n{result.stdout}{result.stderr}\n```"
            return f"✅ Merged `{params.name}` into current branch."

        elif params.action == "rebase":
            result = _run_cmd(f"git rebase {params.name}", cwd=params.path)
            if result.returncode != 0:
                return f"⚠️ Rebase conflict:\n```\n{result.stderr}\n```\nResolve conflicts then `git rebase --continue`."
            return f"✅ Rebased onto `{params.name}`."

    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="git_commit_msg_generate", annotations={"title": "AI Commit Message", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def git_commit_msg_generate(params: GitCommitMsgGenInput, ctx=None) -> str:
    """AI-generated commit message based on staged changes."""
    try:
        diff = _run_cmd("git diff --staged --stat", cwd=params.path)
        diff_detail = _run_cmd("git diff --staged --shortstat", cwd=params.path)
        if not diff.stdout.strip():
            return "No staged changes. Run `git add` first."

        files = diff.stdout.strip()
        stats = diff_detail.stdout.strip()

        # Analyze changed files
        file_list = [l.split("|")[0].strip() for l in files.split("\n") if "|" in l]
        extensions = set(f.split(".")[-1] for f in file_list if "." in f)

        # Determine type
        if any("test" in f.lower() for f in file_list):
            change_type = "test"
            scope = "tests"
        elif any(f.endswith((".yml", ".yaml", ".tf", "Dockerfile")) for f in file_list):
            change_type = "ci" if any("ci" in f.lower() or "pipeline" in f.lower() for f in file_list) else "build"
            scope = "infra"
        elif any(f.endswith(".md") for f in file_list):
            change_type = "docs"
            scope = "readme"
        elif any(f.endswith((".css", ".html", ".jsx", ".tsx")) for f in file_list):
            change_type = "style" if all(f.endswith(".css") for f in file_list) else "feat"
            scope = "ui"
        elif any("fix" in f.lower() or "bug" in f.lower() for f in file_list):
            change_type = "fix"
            scope = "core"
        else:
            change_type = "feat"
            scope = file_list[0].split("/")[0] if "/" in file_list[0] else "core"

        if params.style == "conventional":
            msg = f"{change_type}({scope}): update {len(file_list)} files\n\n{stats}"
        elif params.style == "gitmoji":
            emoji_map = {"feat": "✨", "fix": "🐛", "docs": "📝", "test": "✅", "ci": "👷", "build": "🔧", "style": "💄"}
            msg = f"{emoji_map.get(change_type, '📦')} {change_type}: update {scope}\n\n{stats}"
        else:
            msg = f"Update {len(file_list)} files in {scope}\n\n{stats}"

        return f"## 💬 Suggested Commit Message\n\n```\n{msg}\n```\n\n### Changed Files\n```\n{files}\n```\n\nCommit with: `git commit -m \"{msg.split(chr(10))[0]}\"`"

    except Exception as e:
        return _handle_error(e)

@mcp.tool(name="git_cicd_generate", annotations={"title": "AI CI/CD Pipeline Generator", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def git_cicd_generate(params: GitCICDGenInput, ctx=None) -> str:
    """Generate production-ready CI/CD pipelines for GitHub Actions, GitLab CI, Jenkins, or Bitbucket."""
    features = params.features or ["test", "lint", "build", "deploy"]
    proj = params.project_name

    if params.platform == "github_actions":
        steps = []
        if "lint" in features:
            if params.project_type == "python":
                steps.append("      - name: Lint\n        run: pip install flake8 && flake8 .")
            elif params.project_type == "node":
                steps.append("      - name: Lint\n        run: npm run lint")
        if "test" in features:
            if params.project_type == "python":
                steps.append("      - name: Test\n        run: pip install pytest && pytest -v --cov")
            elif params.project_type == "node":
                steps.append("      - name: Test\n        run: npm test")
            elif params.project_type == "go":
                steps.append("      - name: Test\n        run: go test ./... -v -cover")
        if "security_scan" in features:
            steps.append("      - name: Security Scan\n        uses: aquasecurity/trivy-action@master\n        with:\n          scan-type: 'fs'")
        if "docker_build" in features:
            steps.append(f"      - name: Build & Push Docker\n        run: |\n          docker build -t ${{{{ secrets.REGISTRY }}}}/{proj}:${{{{ github.sha }}}} .\n          docker push ${{{{ secrets.REGISTRY }}}}/{proj}:${{{{ github.sha }}}}")
        if "helm_deploy" in features:
            steps.append(f"      - name: Deploy to K8s\n        run: |\n          helm upgrade --install {proj} ./helm \\\n            --set image.tag=${{{{ github.sha }}}} \\\n            --namespace production")

        setup = {
            "python": "      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.12'\n      - run: pip install -r requirements.txt",
            "node": "      - uses: actions/setup-node@v4\n        with:\n          node-version: '20'\n      - run: npm ci",
            "go": "      - uses: actions/setup-go@v5\n        with:\n          go-version: '1.22'",
            "java": "      - uses: actions/setup-java@v4\n        with:\n          distribution: 'temurin'\n          java-version: '21'",
        }

        pipeline = f"""name: {proj} CI/CD
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
{setup.get(params.project_type, '')}
{chr(10).join(steps)}

      - name: Upload Coverage
        uses: codecov/codecov-action@v4
        if: always()
"""
        filename = ".github/workflows/ci.yml"

    elif params.platform == "gitlab_ci":
        stages = []
        jobs = ""
        if "lint" in features:
            stages.append("lint")
            jobs += f"\nlint:\n  stage: lint\n  script:\n    - {'flake8 .' if params.project_type == 'python' else 'npm run lint'}\n"
        if "test" in features:
            stages.append("test")
            jobs += f"\ntest:\n  stage: test\n  script:\n    - {'pytest -v --cov' if params.project_type == 'python' else 'npm test'}\n  coverage: '/Total.*?(\\d+%)$/'\n"
        if "build" in features:
            stages.append("build")
            jobs += f"\nbuild:\n  stage: build\n  script:\n    - docker build -t $CI_REGISTRY_IMAGE:{proj}:$CI_COMMIT_SHA .\n    - docker push $CI_REGISTRY_IMAGE:{proj}:$CI_COMMIT_SHA\n"
        if "deploy" in features:
            stages.append("deploy")
            jobs += f"\ndeploy:\n  stage: deploy\n  script:\n    - helm upgrade --install {proj} ./helm --set image.tag=$CI_COMMIT_SHA\n  only:\n    - main\n  environment: production\n"

        pipeline = f"""stages:\n  - {chr(10) + '  - '.join(stages)}

image: {'python:3.12' if params.project_type == 'python' else 'node:20' if params.project_type == 'node' else 'alpine:latest'}

cache:
  paths:
    - {'__pycache__/' if params.project_type == 'python' else 'node_modules/'}
{jobs}"""
        filename = ".gitlab-ci.yml"

    elif params.platform == "jenkins":
        stage_blocks = ""
        if "test" in features:
            stage_blocks += f"""
        stage('Test') {{
            steps {{
                sh '{'pytest -v' if params.project_type == 'python' else 'npm test'}'
            }}
        }}"""
        if "build" in features:
            stage_blocks += f"""
        stage('Build Docker') {{
            steps {{
                sh "docker build -t {proj}:${{BUILD_NUMBER}} ."
            }}
        }}"""
        if "deploy" in features:
            stage_blocks += f"""
        stage('Deploy') {{
            when {{ branch 'main' }}
            steps {{
                sh "helm upgrade --install {proj} ./helm --set image.tag=${{BUILD_NUMBER}}"
            }}
        }}"""

        pipeline = f"""pipeline {{
    agent any
    environment {{
        REGISTRY = credentials('docker-registry')
    }}
    stages {{{stage_blocks}
    }}
    post {{
        always {{ junit '**/test-results/*.xml' }}
        failure {{ slackSend channel: '#devops', message: "Build Failed: ${{env.JOB_NAME}} #${{env.BUILD_NUMBER}}" }}
    }}
}}"""
        filename = "Jenkinsfile"

    else:
        pipeline = f"# {params.platform} pipeline for {params.project_type} — coming soon"
        filename = "pipeline.yml"

    return f"## 🔄 CI/CD Pipeline: `{params.platform}` for `{params.project_type}`\n\n**File:** `{filename}`\n\n```yaml\n{pipeline}\n```"

@mcp.tool(name="git_hook_generate", annotations={"title": "Git Hook Generator", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def git_hook_generate(params: GitHookGenInput, ctx=None) -> str:
    """Generate git hooks for pre-commit, commit-msg, pre-push quality gates."""
    checks = params.checks or ["lint", "test"]

    if params.hook_type == "pre-commit":
        cmds = []
        if "lint" in checks: cmds.append("echo '🔍 Linting...' && flake8 . || (echo '❌ Lint failed'; exit 1)")
        if "format" in checks: cmds.append("echo '✨ Formatting...' && black --check . || (echo '❌ Format check failed'; exit 1)")
        if "test" in checks: cmds.append("echo '🧪 Testing...' && pytest -x -q || (echo '❌ Tests failed'; exit 1)")
        if "secrets_scan" in checks: cmds.append("echo '🔐 Scanning secrets...' && git diff --cached --name-only | xargs grep -l 'password\\|secret\\|api_key' && echo '❌ Secrets detected!' && exit 1 || true")
        hook = "#!/bin/bash\nset -e\n\n" + "\n\n".join(cmds)

    elif params.hook_type == "commit-msg":
        hook = """#!/bin/bash
# Enforce conventional commits
COMMIT_MSG=$(cat "$1")
PATTERN='^(feat|fix|docs|style|refactor|test|chore|ci|build|perf)(\\(.+\\))?: .{3,}'

if ! echo "$COMMIT_MSG" | grep -qE "$PATTERN"; then
    echo "❌ Commit message must follow Conventional Commits format:"
    echo "   type(scope): description"
    echo "   Examples: feat(auth): add login, fix(api): handle timeout"
    exit 1
fi
echo "✅ Commit message format valid"
"""

    elif params.hook_type == "pre-push":
        hook = """#!/bin/bash
set -e
echo "🚀 Pre-push checks..."
echo "🧪 Running full test suite..."
pytest -v --cov --cov-fail-under=80 || (echo "❌ Tests failed or coverage below 80%"; exit 1)
echo "✅ All pre-push checks passed"
"""
    else:
        hook = "#!/bin/bash\necho 'Hook executed'"

    return f"## 🪝 Git Hook: `{params.hook_type}`\n\n```bash\n{hook}\n```\n\n**Install:** Save to `.git/hooks/{params.hook_type}` and `chmod +x`\n\nOr use with [pre-commit](https://pre-commit.com/) framework."

@mcp.tool(name="git_analysis", annotations={"title": "AI Repository Analysis", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})
async def git_analysis(params: GitAnalysisInput, ctx=None) -> str:
    """Analyze git repository: contributor stats, activity patterns, file hotspots, branch health."""
    try:
        if params.analysis_type == "contributors":
            result = _run_cmd(f"git shortlog -sn --since='{params.days} days ago'", cwd=params.path)
            return f"## 👥 Contributors (last {params.days} days)\n```\n{result.stdout or 'No commits'}\n```"

        elif params.analysis_type == "activity":
            result = _run_cmd(f"git log --since='{params.days} days ago' --format='%ai' | cut -d' ' -f1 | sort | uniq -c | sort -rn", cwd=params.path)
            total = _run_cmd(f"git log --since='{params.days} days ago' --oneline | wc -l", cwd=params.path)
            return f"## 📊 Activity (last {params.days} days)\n\n**Total Commits:** {total.stdout.strip()}\n\n### Commits by Day\n```\n{result.stdout}\n```"

        elif params.analysis_type == "file_hotspots":
            result = _run_cmd(f"git log --since='{params.days} days ago' --name-only --format='' | sort | uniq -c | sort -rn | head -20", cwd=params.path)
            return f"## 🔥 File Hotspots (most changed, last {params.days} days)\n```\n{result.stdout}\n```"

        elif params.analysis_type == "branch_health":
            result = _run_cmd("git branch -a --sort=-committerdate --format='%(refname:short) | %(committerdate:relative) | %(authorname)'", cwd=params.path)
            stale = _run_cmd("git branch --merged main | grep -v main | grep -v '\\*'", cwd=params.path)
            md = f"## 🌿 Branch Health\n\n### Active Branches\n```\n{result.stdout[:2000]}\n```\n"
            if stale.stdout.strip():
                md += f"\n### 🗑️ Merged Branches (safe to delete)\n```\n{stale.stdout}\n```"
            return md

    except Exception as e:
        return _handle_error(e)

if __name__ == "__main__":
    import sys
    transport = "stdio"
    for arg in sys.argv[1:]:
        if arg == "--http": transport = "streamable_http"
    mcp.run(transport=transport, port=8012) if transport == "streamable_http" else mcp.run()
