from typing import List, Optional
from troubleshooter.models.schemas import (
    KnowledgeMatch, ToolType, ErrorCategory, Severity, RCACause, RCAResult,
    FixStep, FixResult, PreventionRule, PreventionResult
)


ERROR_CATALOG: List[dict] = [
    {
        "error_id": "k8s-001",
        "title": "Pod CrashLoopBackOff",
        "description": "Container repeatedly crashing and being restarted by Kubernetes",
        "tool": ToolType.KUBERNETES,
        "category": ErrorCategory.STATE,
        "severity": Severity.CRITICAL,
        "causes": [
            "Application crash (uncaught exception/panic)",
            "OOMKilled - container exceeded memory limit",
            "Failed liveness probe",
            "Missing ConfigMap or Secret",
            "Invalid configuration",
            "Missing dependencies or init failure"
        ],
        "fix_steps": [
            "kubectl describe pod <pod-name> -n <namespace>",
            "kubectl logs <pod-name> -n <namespace> --previous",
            "Check events in describe output for clues",
            "Verify resource limits are adequate",
            "Check application logs for exceptions",
            "Verify ConfigMaps and Secrets are mounted correctly"
        ],
        "prevention": "Set appropriate resource limits, add startup probes, implement proper logging",
        "monitoring_alert": "rate(kube_pod_container_status_restarts_total[15m]) > 0"
    },
    {
        "error_id": "k8s-002",
        "title": "Pod ImagePullBackOff",
        "description": "Kubernetes cannot pull the container image",
        "tool": ToolType.KUBERNETES,
        "category": ErrorCategory.CONFIGURATION,
        "severity": Severity.HIGH,
        "causes": [
            "Invalid image name or tag",
            "ImagePullSecret not configured for private registry",
            "Network issues reaching registry",
            "Registry authentication failed",
            "Image not found in registry"
        ],
        "fix_steps": [
            "kubectl describe pod <pod-name> -n <namespace>",
            "Verify image name and tag are correct",
            "Check if ImagePullSecret is needed",
            "Test image pull manually: docker pull <image>",
            "Check registry credentials in Secret",
            "Verify network policies allow registry access"
        ],
        "prevention": "Use ImagePullSecrets, pin image versions, validate image availability",
        "monitoring_alert": "kube_pod_status_reason{reason='ImagePullBackOff'} == 1"
    },
    {
        "error_id": "k8s-003",
        "title": "Pod Evicted",
        "description": "Pod was evicted from node due to resource pressure",
        "tool": ToolType.KUBERNETES,
        "category": ErrorCategory.RESOURCES,
        "severity": Severity.HIGH,
        "causes": [
            "Node out of memory",
            "Node out of disk space",
            "Node out of PIDs",
            "Node pressure (NotReady due to resource issues)",
            "Eviction policy thresholds exceeded"
        ],
        "fix_steps": [
            "kubectl get pods -n <namespace> -o wide | grep Evicted",
            "kubectl describe node <node-name>",
            "Check node conditions: kubectl get nodes",
            "Review node resource usage in monitoring",
            "Add more nodes or increase node size",
            "Reduce pod resource requests/limits"
        ],
        "prevention": "Set appropriate resource requests, configure PodDisruptionBudgets, use cluster autoscaler",
        "monitoring_alert": "kube_pod_status_reason{reason='Evicted'} == 1"
    },
    {
        "error_id": "k8s-004",
        "title": "Pod Pending",
        "description": "Pod cannot be scheduled to a node",
        "tool": ToolType.KUBERNETES,
        "category": ErrorCategory.RESOURCES,
        "severity": Severity.HIGH,
        "causes": [
            "Insufficient CPU or memory on nodes",
            "No nodes matching pod scheduling requirements",
            "NodeSelector/affinity/taint conflicts",
            "PVC cannot be bound",
            "Cluster at capacity"
        ],
        "fix_steps": [
            "kubectl describe pod <pod-name> -n <namespace>",
            "Check Events section for scheduling failures",
            "kubectl get nodes -o wide",
            "kubectl get pvc -n <namespace>",
            "Review node resources: kubectl top nodes",
            "Check pod affinity/taint configurations"
        ],
        "prevention": "Proper resource requests, pod disruption budgets, cluster autoscaling",
        "monitoring_alert": "kube_pod_status_phase{phase='Pending'} == 1"
    },
    {
        "error_id": "k8s-005",
        "title": "Pod OOMKilled",
        "description": "Container terminated due to out of memory",
        "tool": ToolType.KUBERNETES,
        "category": ErrorCategory.RESOURCES,
        "severity": Severity.CRITICAL,
        "causes": [
            "Memory limit too low for application",
            "Memory leak in application",
            "Unexpected spike in traffic/data",
            "JVM heap size misconfigured",
            "Large dataset processing in memory"
        ],
        "fix_steps": [
            "kubectl describe pod <pod-name> -n <namespace>",
            "Check container status: lastState.terminated.reason",
            "kubectl top pod <pod-name> -n <namespace>",
            "Increase memory limits in deployment",
            "Profile application for memory leaks",
            "Configure JVM heap settings if applicable"
        ],
        "prevention": "Appropriate memory limits, memory profiling, heap dumps on OOM",
        "monitoring_alert": "kube_pod_container_status_last_terminated_reason{reason='OOMKilled'} == 1"
    },
    {
        "error_id": "k8s-006",
        "title": "Container Unhealthy - Liveness Probe Failed",
        "description": "Liveness probe failed, container will be restarted",
        "tool": ToolType.KUBERNETES,
        "category": ErrorCategory.STATE,
        "severity": Severity.HIGH,
        "causes": [
            "Application not responding on health endpoint",
            "Health endpoint overloaded or slow",
            "Incorrect probe configuration",
            "Application stuck in deadlock",
            "Dependency failure causing health check to fail"
        ],
        "fix_steps": [
            "kubectl describe pod <pod-name> -n <namespace>",
            "Check livenessProbe configuration",
            "Test health endpoint manually",
            "Review application health implementation",
            "Check if dependencies are causing delays",
            "Adjust failureThreshold and periodSeconds"
        ],
        "prevention": "Proper health endpoints, appropriate probe settings, probe timeout buffers",
        "monitoring_alert": "kube_pod_container_status_restarts_total > 0"
    },
    {
        "error_id": "k8s-007",
        "title": "FailedMount - Volume Mount Error",
        "description": "Pod cannot mount the requested volume",
        "tool": ToolType.KUBERNETES,
        "category": ErrorCategory.STORAGE,
        "severity": Severity.HIGH,
        "causes": [
            "PVC not bound or missing",
            "StorageClass not available",
            "Node selector issues for local storage",
            "Incorrect mount path",
            "Secret/ConfigMap not found"
        ],
        "fix_steps": [
            "kubectl describe pod <pod-name> -n <namespace>",
            "kubectl get pvc -n <namespace>",
            "kubectl get sc",
            "Check volume mount configuration in pod spec",
            "Verify storage class exists and is default",
            "Check node resources for local volume provisioner"
        ],
        "prevention": "Proper PVC configuration, storage class validation, volume templates",
        "monitoring_alert": "kube_pod_volume_mounts{reason='MountVolume failed'}"
    },
    {
        "error_id": "docker-001",
        "title": "Docker Permission Denied",
        "description": "Docker command failed due to permissions",
        "tool": ToolType.DOCKER,
        "category": ErrorCategory.PERMISSIONS,
        "severity": Severity.MEDIUM,
        "causes": [
            "User not in docker group",
            "Docker socket permissions incorrect",
            "SELinux/AppArmor blocking access",
            "Rootless Docker misconfigured"
        ],
        "fix_steps": [
            "Check user groups: groups $USER",
            "Add user to docker group: sudo usermod -aG docker $USER",
            "Check docker socket: ls -la /var/run/docker.sock",
            "Restart Docker service",
            "Check SELinux status: getenforce"
        ],
        "prevention": "Proper user group configuration, sudo-less Docker access",
        "monitoring_alert": None
    },
    {
        "error_id": "docker-002",
        "title": "Container Already Exists",
        "description": "Cannot create container with existing name",
        "tool": ToolType.DOCKER,
        "category": ErrorCategory.STATE,
        "severity": Severity.LOW,
        "causes": [
            "Container with same name exists",
            "Container wasn't properly removed",
            "Docker state inconsistency"
        ],
        "fix_steps": [
            "docker ps -a | grep <container-name>",
            "docker rm <container-name> or docker rm -f <container-name>",
            "Use docker run --rm for temporary containers",
            "Use unique container names with $(date)"
        ],
        "prevention": "Use --rm flag for temp containers, unique naming",
        "monitoring_alert": None
    },
    {
        "error_id": "docker-003",
        "title": "Docker Network Not Found",
        "description": "Specified Docker network does not exist",
        "tool": ToolType.DOCKER,
        "category": ErrorCategory.NETWORKING,
        "severity": Severity.MEDIUM,
        "causes": [
            "Network not created",
            "Typo in network name",
            "Network removed after container created",
            "Using default bridge incorrectly"
        ],
        "fix_steps": [
            "docker network ls",
            "docker network create <network-name>",
            "docker network inspect <network-name>",
            "Check docker-compose networks section",
            "Recreate network if accidentally removed"
        ],
        "prevention": "Define networks in docker-compose, network lifecycle management",
        "monitoring_alert": None
    },
    {
        "error_id": "terraform-001",
        "title": "Terraform Provider Not Found",
        "description": "Required provider not available",
        "tool": ToolType.TERRAFORM,
        "category": ErrorCategory.CONFIGURATION,
        "severity": Severity.HIGH,
        "causes": [
            "Provider not initialized",
            "Network issues downloading provider",
            "Provider version not available",
            "Missing provider block"
        ],
        "fix_steps": [
            "terraform init",
            "Check provider version constraints",
            "Run terraform init -upgrade",
            "Verify network connectivity to registry",
            "Check Terraform version compatibility"
        ],
        "prevention": "Pin provider versions, use required_providers block, lock files",
        "monitoring_alert": None
    },
    {
        "error_id": "terraform-002",
        "title": "Terraform Resource Already Exists",
        "description": "Cannot create resource that already exists outside Terraform",
        "tool": ToolType.TERRAFORM,
        "category": ErrorCategory.STATE,
        "severity": Severity.MEDIUM,
        "causes": [
            "Manual resource creation",
            "Previous failed apply",
            "State drift",
            "Import needed"
        ],
        "fix_steps": [
            "terraform import <resource> <resource-id>",
            "terraform state rm to remove from state",
            "Check existing resources in cloud console",
            "Use terraform plan to see differences",
            "Reconcile state with terraform refresh"
        ],
        "prevention": "Import existing resources, avoid manual modifications, use remote state",
        "monitoring_alert": None
    },
    {
        "error_id": "terraform-003",
        "title": "Terraform Timeout Waiting for Resource",
        "description": "Resource creation timed out",
        "tool": ToolType.TERRAFORM,
        "category": ErrorCategory.NETWORKING,
        "severity": Severity.MEDIUM,
        "causes": [
            "Cloud API rate limiting",
            "Resource taking longer than expected",
            "Network issues",
            "Dependency not ready"
        ],
        "fix_steps": [
            "Check cloud console for resource status",
            "Increase timeouts in resource configuration",
            "Retry terraform apply",
            "Check IAM permissions for resource",
            "Verify cloud service status"
        ],
        "prevention": "Appropriate timeouts, retry configurations, async operations",
        "monitoring_alert": None
    },
    {
        "error_id": "aws-001",
        "title": "AWS Access Denied",
        "description": "IAM permission insufficient for action",
        "tool": ToolType.AWS,
        "category": ErrorCategory.PERMISSIONS,
        "severity": Severity.HIGH,
        "causes": [
            "Insufficient IAM permissions",
            "Role not assumed",
            "Resource policy blocking access",
            "Service Control Policy (SCP) restrictions"
        ],
        "fix_steps": [
            "Check error message for required action",
            "Review IAM user/role policies",
            "Verify resource policies",
            "Check AWS Organizations SCPs",
            "Use AWS Policy Simulator",
            "Add required permissions to IAM"
        ],
        "prevention": "Least privilege IAM, proper role assumptions, policy validation",
        "monitoring_alert": None
    },
    {
        "error_id": "aws-002",
        "title": "AWS Resource Not Found",
        "description": "Requested resource does not exist",
        "tool": ToolType.AWS,
        "category": ErrorCategory.STATE,
        "severity": Severity.MEDIUM,
        "causes": [
            "Resource deleted manually",
            "Wrong resource ID/name",
            "Wrong region",
            "State drift"
        ],
        "fix_steps": [
            "Verify resource exists in correct region",
            "Check resource ID is correct",
            "Check AWS console manually",
            "terraform import if using IaC",
            "Check for resource deletion via CloudTrail"
        ],
        "prevention": "IaC as source of truth, proper tagging, state management",
        "monitoring_alert": None
    },
    {
        "error_id": "aws-003",
        "title": "AWS Throttling Exception",
        "description": "API rate limit exceeded",
        "tool": ToolType.AWS,
        "category": ErrorCategory.RESOURCES,
        "severity": Severity.MEDIUM,
        "causes": [
            "Too many API requests",
            "Exceeding account limits",
            "Burst traffic",
            "No exponential backoff in code"
        ],
        "fix_steps": [
            "Implement exponential backoff",
            "Use jitter in retries",
            "Request limit increase from AWS",
            "Cache responses where possible",
            "Use paginators efficiently",
            "Reduce API call frequency"
        ],
        "prevention": "Rate limiting in code, caching, request queuing",
        "monitoring_alert": None
    },
    {
        "error_id": "linux-001",
        "title": "Permission Denied",
        "description": "Operation not permitted",
        "tool": ToolType.LINUX,
        "category": ErrorCategory.PERMISSIONS,
        "severity": Severity.MEDIUM,
        "causes": [
            "Insufficient file permissions",
            "SELinux/AppArmor blocking",
            "sudo required but not used",
            "ACL restrictions"
        ],
        "fix_steps": [
            "ls -la <file/path>",
            "Check ownership: chown user:group <path>",
            "Check permissions: chmod 755 <path>",
            "Check SELinux: ls -Z <path>",
            "Use sudo if needed",
            "Check ACLs: getfacl <path>"
        ],
        "prevention": "Proper permissions setup, sudo rules, SELinux policies",
        "monitoring_alert": None
    },
    {
        "error_id": "linux-002",
        "title": "No Such File or Directory",
        "description": "File or path does not exist",
        "tool": ToolType.LINUX,
        "category": ErrorCategory.STATE,
        "severity": Severity.LOW,
        "causes": [
            "Typo in path",
            "File was deleted",
            "Working directory incorrect",
            "Relative vs absolute path"
        ],
        "fix_steps": [
            "Check path with ls",
            "Use absolute paths",
            "Verify file exists: test -e <path>",
            "Check current directory: pwd",
            "Use tab completion",
            "Find file: find / -name <filename>"
        ],
        "prevention": "Use absolute paths, proper path validation",
        "monitoring_alert": None
    },
    {
        "error_id": "nginx-001",
        "title": "Nginx 502 Bad Gateway",
        "description": "Upstream server returned error",
        "tool": ToolType.NGINX,
        "category": ErrorCategory.NETWORKING,
        "severity": Severity.HIGH,
        "causes": [
            "Upstream service down",
            "Upstream timeout",
            "Port mismatch",
            "Firewall blocking",
            "Upstream process error"
        ],
        "fix_steps": [
            "Check upstream service status",
            "Verify upstream port and address",
            "Check nginx error logs: tail -f /var/log/nginx/error.log",
            "Test upstream directly: curl http://localhost:<port>",
            "Check upstream health checks",
            "Verify network connectivity"
        ],
        "prevention": "Upstream health checks, proper timeouts, monitoring",
        "monitoring_alert": "nginx_http_upstream_server_response_errors_total"
    },
    {
        "error_id": "nginx-002",
        "title": "Nginx 504 Gateway Timeout",
        "description": "Upstream server took too long",
        "tool": ToolType.NGINX,
        "category": ErrorCategory.NETWORKING,
        "severity": Severity.HIGH,
        "causes": [
            "Upstream slow to respond",
            "Database query timeout",
            "Network latency",
            "Proxy timeout too short",
            "Heavy load on upstream"
        ],
        "fix_steps": [
            "Increase proxy_read_timeout",
            "Check upstream service performance",
            "Profile slow queries",
            "Add caching",
            "Check nginx error logs",
            "Monitor upstream response times"
        ],
        "prevention": "Appropriate timeouts, caching, load balancing",
        "monitoring_alert": "nginx_http_upstream_response_time"
    },
    {
        "error_id": "postgres-001",
        "title": "PostgreSQL Connection Refused",
        "description": "Cannot connect to PostgreSQL",
        "tool": ToolType.POSTGRESQL,
        "category": ErrorCategory.NETWORKING,
        "severity": Severity.HIGH,
        "causes": [
            "PostgreSQL not running",
            "Wrong host/port",
            "Firewall blocking",
            "pg_hba.conf restriction",
            "Connection string error"
        ],
        "fix_steps": [
            "Check PostgreSQL service: systemctl status postgresql",
            "Verify port: pg_isready -h <host> -p <port>",
            "Check pg_hba.conf for allowed IPs",
            "Test connection: psql -h <host> -p <port> -U <user>",
            "Check firewall rules",
            "Review connection string"
        ],
        "prevention": "Proper connection strings, pg_hba rules, monitoring",
        "monitoring_alert": "pg_stat_database_connections_failed"
    },
    {
        "error_id": "postgres-002",
        "title": "PostgreSQL Password Authentication Failed",
        "description": "Authentication failed for user",
        "tool": ToolType.POSTGRESQL,
        "category": ErrorCategory.PERMISSIONS,
        "severity": Severity.HIGH,
        "causes": [
            "Wrong password",
            "User doesn't exist",
            "pg_hba.conf using peer/trust",
            "Password expired"
        ],
        "fix_steps": [
            "Verify username and password",
            "Check pg_hba.conf for auth method",
            "Reset password: ALTER USER <user> PASSWORD '<pass>';",
            "Create user if missing",
            "Check password encryption method"
        ],
        "prevention": "Secure credentials, proper pg_hba, password policies",
        "monitoring_alert": None
    },
    {
        "error_id": "postgres-003",
        "title": "PostgreSQL Duplicate Key",
        "description": "Unique constraint violation",
        "tool": ToolType.POSTGRESQL,
        "category": ErrorCategory.STATE,
        "severity": Severity.MEDIUM,
        "causes": [
            "Inserting existing primary key",
            "Unique index violation",
            "Race condition on insert",
            "Application retry with same data"
        ],
        "fix_steps": [
            "Check which constraint failed",
            "Use ON CONFLICT DO NOTHING/UPDATE",
            "Verify application logic for duplicates",
            "Check sequence if using serial",
            "Review application idempotency"
        ],
        "prevention": "Upsert patterns, idempotent operations, unique constraints handling",
        "monitoring_alert": "pg_stat_database_conflicts"
    },
    {
        "error_id": "postgres-004",
        "title": "PostgreSQL Deadlock Detected",
        "description": "Two transactions waiting on each other",
        "tool": ToolType.POSTGRESQL,
        "category": ErrorCategory.STATE,
        "severity": Severity.HIGH,
        "causes": [
            "Transactions accessing tables in different order",
            "Long-running transactions",
            "Too many concurrent updates",
            "Missing indexes causing table locks"
        ],
        "fix_steps": [
            "Check pg_locks: SELECT * FROM pg_locks WHERE granted = false;",
            "Review application transaction logic",
            "Add indexes to reduce lock duration",
            "Set lock_timeout",
            "Kill blocking session if safe: pg_terminate_backend(<pid>)",
            "Reorder table access in transactions"
        ],
        "prevention": "Consistent transaction ordering, shorter transactions, proper indexes",
        "monitoring_alert": "pg_stat_database_deadlocks"
    },
]


def search_knowledge_base(
    error_code: str,
    tool: Optional[ToolType],
    category: ErrorCategory,
    limit: int = 5
) -> List[KnowledgeMatch]:
    matches = []
    
    for entry in ERROR_CATALOG:
        score = 0.0
        
        if tool and entry["tool"] == tool:
            score += 0.3
        
        if error_code and error_code.lower() in entry["error_id"].lower():
            score += 0.4
        if error_code and error_code.lower() in entry["title"].lower():
            score += 0.3
        
        if category == entry["category"]:
            score += 0.2
        
        if score > 0:
            matches.append(KnowledgeMatch(
                error_id=entry["error_id"],
                title=entry["title"],
                description=entry["description"],
                tool=entry["tool"],
                category=entry["category"],
                similarity_score=min(score, 1.0),
                fix_steps=entry["fix_steps"],
                prevention=entry["prevention"]
            ))
    
    matches.sort(key=lambda x: x.similarity_score, reverse=True)
    return matches[:limit]


def generate_rca(parse_result, classification, matches: List[KnowledgeMatch]) -> RCAResult:
    if matches and matches[0].similarity_score > 0.7:
        match = matches[0]
        
        causes = []
        if "causes" in ERROR_CATALOG:
            for entry in ERROR_CATALOG:
                if entry["error_id"] == match.error_id:
                    for i, cause_text in enumerate(entry.get("causes", [])):
                        causes.append(RCACause(
                            cause=cause_text,
                            probability=1.0 - (i * 0.15),
                            evidence=f"Known cause for {match.title}",
                            is_root_cause=i == 0
                        ))
                    break
        
        analysis = f"Based on the error pattern '{match.title}', this is a {classification.severity.value} severity issue in the {classification.category.value} category."
    else:
        analysis = "Unable to find exact match in knowledge base. Generating analysis based on error characteristics."
        causes = [
            RCACause(
                cause="Unable to determine root cause",
                probability=0.5,
                evidence="No matching patterns found",
                is_root_cause=True
            )
        ]
    
    return RCAResult(
        analysis=analysis,
        causes=causes,
        affected_components=["Application", "Pod", "Node"],
        confidence=matches[0].similarity_score if matches else 0.3
    )


def generate_fix_steps(matches: List[KnowledgeMatch]) -> FixResult:
    if not matches:
        return FixResult(
            steps=[
                FixStep(
                    step_number=1,
                    title="Gather Error Information",
                    command="kubectl describe pod <pod-name> -n <namespace>",
                    description="Get detailed error information",
                    verification="Check Events section"
                ),
                FixStep(
                    step_number=2,
                    title="Check Logs",
                    command="kubectl logs <pod-name> -n <namespace> --previous",
                    description="Review application logs",
                    verification="Look for error messages"
                )
            ],
            estimated_time="15-30 minutes",
            risk_level=Severity.MEDIUM
        )
    
    entry = None
    for e in ERROR_CATALOG:
        if e["error_id"] == matches[0].error_id:
            entry = e
            break
    
    if not entry:
        entry = ERROR_CATALOG[0]
    
    steps = []
    for i, step_text in enumerate(entry.get("fix_steps", []), 1):
        is_command = any(cmd in step_text for cmd in ["kubectl", "docker", "terraform", "aws", "psql"])
        
        steps.append(FixStep(
            step_number=i,
            title=f"Step {i}",
            command=step_text if is_command else None,
            description=step_text,
            verification="Verify command output"
        ))
    
    return FixResult(
        steps=steps,
        estimated_time="10-20 minutes",
        risk_level=entry.get("severity", Severity.MEDIUM)
    )


def generate_prevention(matches: List[KnowledgeMatch], category: ErrorCategory) -> PreventionResult:
    monitoring_rules = []
    cicd_checks = []
    best_practices = []
    
    if matches and matches[0].prevention:
        best_practices.append(matches[0].prevention)
    
    for entry in ERROR_CATALOG:
        if matches and entry["error_id"] == matches[0].error_id:
            if entry.get("monitoring_alert"):
                monitoring_rules.append(PreventionRule(
                    rule_type="Prometheus Alert",
                    description=f"Alert for {entry['title']}",
                    config=f"alert: {entry['title'].replace(' ', '')}\nexpr: {entry.get('monitoring_alert', '')}\nfor: 5m\nlabels:\n  severity: critical",
                    alert_query=entry.get("monitoring_alert")
                ))
    
    best_practices.extend([
        "Set appropriate resource requests and limits",
        "Implement proper logging and monitoring",
        "Use health probes appropriately",
        "Follow GitOps best practices",
        "Regular security updates"
    ])
    
    cicd_checks.extend([
        "Validate Kubernetes manifests before apply",
        "Check for image vulnerabilities with Trivy",
        "Verify resource limits are set",
        "Ensure security contexts are configured"
    ])
    
    return PreventionResult(
        monitoring_rules=monitoring_rules,
        cicd_checks=cicd_checks,
        best_practices=best_practices
    )
