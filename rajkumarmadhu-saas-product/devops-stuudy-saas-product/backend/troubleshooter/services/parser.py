import re
from typing import Optional, Dict, Any
from troubleshooter.models.schemas import (
    ParseResult, ToolType, ErrorCategory, ClassificationResult, Severity
)


ERROR_PATTERNS = {
    ToolType.KUBERNETES: [
        (r"CrashLoopBackOff", "CrashLoopBackOff", "pod_status"),
        (r"ImagePullBackOff", "ImagePullBackOff", "image_pull"),
        (r"Evicted", "Evicted", "pod_eviction"),
        (r"Pending", "Pending", "pod_pending"),
        (r"FailedMount", "FailedMount", "volume_mount"),
        (r"Unhealthy", "Unhealthy", "probe_failure"),
        (r"OOMKilled", "OOMKilled", "memory"),
        (r"CreateContainerConfigError", "CreateContainerConfigError", "config"),
        (r"InvalidImageName", "InvalidImageName", "image"),
        (r"RunContainerError", "RunContainerError", "runtime"),
    ],
    ToolType.DOCKER: [
        (r"docker:.*no such file", "NoSuchFile", "filesystem"),
        (r"docker:.*permission denied", "PermissionDenied", "permissions"),
        (r"docker:.*connection refused", "ConnectionRefused", "network"),
        (r"Error response from daemon.*", "DaemonError", "daemon"),
        (r"network .* not found", "NetworkNotFound", "network"),
        (r"container .* already exists", "ContainerExists", "state"),
    ],
    ToolType.TERRAFORM: [
        (r"Error:.*", "TerraformError", "general"),
        (r"Provider.*not found", "ProviderNotFound", "provider"),
        (r".*already exists", "ResourceExists", "resource"),
        (r".*does not have attribute", "AttributeError", "attribute"),
        (r".*timeout while waiting", "Timeout", "timeout"),
    ],
    ToolType.AWS: [
        (r"AccessDenied", "AccessDenied", "iam"),
        (r"ResourceNotFound", "ResourceNotFound", "resource"),
        (r"ThrottlingException", "Throttling", "rate_limit"),
        (r"InvalidParameterValue", "InvalidParameter", "parameter"),
        (r"ExpiredToken", "ExpiredToken", "auth"),
    ],
    ToolType.LINUX: [
        (r"Permission denied", "PermissionDenied", "permissions"),
        (r"No such file or directory", "FileNotFound", "filesystem"),
        (r"Connection refused", "ConnectionRefused", "network"),
        (r"Out of memory", "OOM", "memory"),
        (r"disk.*full", "DiskFull", "storage"),
    ],
    ToolType.NGINX: [
        (r"connect\(\) failed", "ConnectionFailed", "upstream"),
        (r"404 Not Found", "NotFound", "http"),
        (r"502 Bad Gateway", "BadGateway", "upstream"),
        (r"503 Service Unavailable", "ServiceUnavailable", "upstream"),
        (r"refused while connecting", "ConnectionRefused", "network"),
    ],
    ToolType.POSTGRESQL: [
        (r"connection refused", "ConnectionRefused", "network"),
        (r"password authentication failed", "AuthFailed", "authentication"),
        (r"duplicate key", "DuplicateKey", "constraint"),
        (r"deadlock detected", "Deadlock", "concurrency"),
        (r"remaining connection slots", "ConnectionLimit", "resources"),
    ],
}


TOOL_INDICATORS = {
    ToolType.KUBERNETES: ["kubectl", "pod", "deployment", "namespace", "cluster", "k8s", "containerstatus", "kubernetes"],
    ToolType.DOCKER: ["docker", "containerd", "dockerd", "image", "dockerfile"],
    ToolType.TERRAFORM: ["terraform", "tfstate", "provider", "resource"],
    ToolType.AWS: ["aws", "ec2", "s3", "lambda", "rds", "ecs", "eks", "iam"],
    ToolType.LINUX: ["/bin/", "/usr/bin/", "systemd", "journalctl"],
    ToolType.NGINX: ["nginx", "upstream", "proxy_pass"],
    ToolType.POSTGRESQL: ["postgres", "psql", "pg_", "database"],
    ToolType.PROMETHEUS: ["prometheus", "alertmanager", "promql"],
    ToolType.REDIS: ["redis", "redis-cli", "OOM"],
    ToolType.ELASTICSEARCH: ["elasticsearch", "shard", "index"],
}


def parse_error(error_input: str) -> ParseResult:
    raw = error_input.strip()
    context = {}
    
    tool = detect_tool(raw)
    error_code, error_msg, category = extract_error_info(raw, tool)
    
    if tool:
        context["tool_indicators"] = [ind for ind in TOOL_INDICATORS.get(tool, []) if ind.lower() in raw.lower()]
    
    context["has_trace"] = "Traceback" in raw or "at " in raw
    context["has_stack"] = "stack" in raw.lower() or "trace" in raw.lower()
    context["line_numbers"] = re.findall(r"line \d+", raw.lower())
    
    return ParseResult(
        raw_error=raw,
        tool=tool,
        error_code=error_code,
        error_message=error_msg,
        context=context
    )


def detect_tool(error_input: str) -> Optional[ToolType]:
    error_lower = error_input.lower()
    scores = {}
    
    for tool, indicators in TOOL_INDICATORS.items():
        score = sum(1 for ind in indicators if ind.lower() in error_lower)
        if score > 0:
            scores[tool] = score
    
    if scores:
        return max(scores, key=scores.get)
    return None


def extract_error_info(error_input: str, tool: Optional[ToolType]) -> tuple:
    if tool and tool in ERROR_PATTERNS:
        for pattern, code, category in ERROR_PATTERNS[tool]:
            if re.search(pattern, error_input, re.IGNORECASE):
                msg = extract_error_message(error_input, code)
                return code, msg, category
    
    for patterns in ERROR_PATTERNS.values():
        for pattern, code, category in patterns:
            if re.search(pattern, error_input, re.IGNORECASE):
                msg = extract_error_message(error_input, code)
                return code, msg, category
    
    return "Unknown", error_input[:100], "general"


def extract_error_message(error_input: str, code: str) -> str:
    lines = error_input.split("\n")
    for line in lines:
        if code.lower() in line.lower():
            return line.strip()[:200]
    return lines[0][:200] if lines else error_input[:200]


def classify_error(parse_result: ParseResult) -> ClassificationResult:
    raw = parse_result.raw_error.lower()
    category = ErrorCategory.STATE
    subcategory = None
    keywords = []
    
    category_patterns = {
        ErrorCategory.CONFIGURATION: ["config", "yaml", "manifest", "spec", "invalid", "malformed"],
        ErrorCategory.NETWORKING: ["connection", "network", "timeout", "refused", "dns", "port", "socket"],
        ErrorCategory.PERMISSIONS: ["permission", "denied", "forbidden", "unauthorized", "access denied", "auth"],
        ErrorCategory.RESOURCES: ["memory", "cpu", "oom", "disk", "quota", "limit", "resource"],
        ErrorCategory.STATE: ["crash", "loop", "failed", "pending", "evicted", "terminated", "stopped"],
        ErrorCategory.VERSION: ["version", "mismatch", "upgrade", "deprecated", "unsupported"],
        ErrorCategory.SECURITY: ["certificate", "tls", "ssl", "secret", "token", "security"],
        ErrorCategory.STORAGE: ["volume", "mount", "storage", "pvc", "disk"],
        ErrorCategory.DEPENDENCY: ["dependency", "import", "module", "package", "not found"],
    }
    
    for cat, patterns in category_patterns.items():
        matches = [p for p in patterns if p in raw]
        if matches:
            category = cat
            keywords = matches
            break
    
    severity = determine_severity(category, parse_result.error_code)
    
    confidence = 0.7
    if parse_result.tool:
        confidence += 0.15
    if keywords:
        confidence += 0.1
    confidence = min(confidence, 0.95)
    
    return ClassificationResult(
        category=category,
        subcategory=subcategory,
        confidence=confidence,
        severity=severity,
        keywords=keywords
    )


def determine_severity(category: ErrorCategory, error_code: Optional[str]) -> Severity:
    high_severity_codes = ["CrashLoopBackOff", "Evicted", "OOMKilled", "Deadlock"]
    high_severity_categories = [ErrorCategory.RESOURCES, ErrorCategory.STATE]
    
    if error_code in high_severity_codes:
        return Severity.CRITICAL
    if category in high_severity_categories:
        return Severity.HIGH
    if category == ErrorCategory.SECURITY:
        return Severity.HIGH
    if category == ErrorCategory.CONFIGURATION:
        return Severity.MEDIUM
    return Severity.MEDIUM
