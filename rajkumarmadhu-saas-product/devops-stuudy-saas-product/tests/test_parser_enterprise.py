"""
Enterprise-grade unit tests for parser.py
Tests the 8-step error parsing & classification pipeline.
"""
import pytest
from backend.troubleshooter.services.parser import (
    parse_error,
    detect_tool,
    classify_error,
    determine_severity,
)
from backend.troubleshooter.models.schemas import (
    ToolType,
    ErrorCategory,
    Severity,
)


class TestDetectTool:
    """Tests for the tool auto-detection scoring algorithm."""

    def test_detects_kubernetes_from_crashloopbackoff(self):
        error = "Pod is in CrashLoopBackOff state, kubectl describe shows OOMKilled"
        assert detect_tool(error) == ToolType.KUBERNETES

    def test_detects_docker_from_daemon_error(self):
        error = "Error response from daemon: driver failed programming external connectivity"
        assert detect_tool(error) == ToolType.DOCKER

    def test_detects_terraform_from_provider_not_found(self):
        error = "Error: Provider registry.terraform.io/hashicorp/aws not found"
        assert detect_tool(error) == ToolType.TERRAFORM

    def test_detects_aws_from_access_denied(self):
        error = "An error occurred (AccessDenied) when calling PutObject on S3"
        assert detect_tool(error) == ToolType.AWS

    def test_detects_postgresql_from_auth_failure(self):
        error = "FATAL: password authentication failed for user postgres"
        assert detect_tool(error) == ToolType.POSTGRESQL

    def test_detects_nginx_from_502(self):
        error = "nginx: upstream 502 Bad Gateway while reading response header from upstream"
        assert detect_tool(error) == ToolType.NGINX

    def test_returns_none_for_unknown_error(self):
        assert detect_tool("something completely generic happened") is None


class TestParseError:
    """Tests for the full parse_error pipeline."""

    def test_parse_returns_parse_result(self):
        result = parse_error("Pod CrashLoopBackOff in cluster k8s")
        assert result is not None
        assert result.raw_error is not None

    def test_parse_detects_tool(self):
        result = parse_error("kubectl get pods shows ImagePullBackOff")
        assert result.tool == ToolType.KUBERNETES

    def test_parse_extracts_error_code(self):
        result = parse_error("Pod status is ImagePullBackOff in namespace default")
        assert result.error_code == "ImagePullBackOff"

    def test_parse_handles_empty_context(self):
        result = parse_error("Some random error that doesn't match any pattern")
        assert result.raw_error == "Some random error that doesn't match any pattern"
        assert result.error_code == "Unknown"

    def test_parse_detects_stack_trace(self):
        error = "Traceback (most recent call last):\n  File 'app.py', line 42, in main"
        result = parse_error(error)
        assert result.context.get("has_trace") is True


class TestClassifyError:
    """Tests for error classification and severity assignment."""

    def test_classifies_oom_as_resources(self):
        error = "OOMKilled - container exceeded memory limit"
        parse_result = parse_error(error)
        classification = classify_error(parse_result)
        assert classification.category == ErrorCategory.RESOURCES

    def test_classifies_permission_denied_correctly(self):
        error = "Permission denied while accessing /etc/sshd_config"
        result = classify_error(parse_error(error))
        assert classification.category == ErrorCategory.PERMISSIONS

    def test_confidence_increases_with_known_tool(self):
        error_known = "kubectl pod CrashLoopBackOff in cluster"
        error_unknown = "something happened"
        conf_known = classify_error(parse_error(error_known)).confidence
        conf_unknown = classify_error(parse_error(error_unknown)).confidence
        assert conf_known > conf_unknown

    def test_confidence_capped_at_095(self):
        error = "kubectl pod CrashLoopBackOff connection refused network timeout"
        result = classify_error(parse_error(error))
        assert result.confidence <= 0.95


class TestDetermineSeverity:
    """Tests for the severity scoring function."""

    def test_crashloopbackoff_is_critical(self):
        sev = determine_severity(ErrorCategory.STATE, "CrashLoopBackOff")
        assert sev == Severity.CRITICAL

    def test_oomkilled_is_critical(self):
        sev = determine_severity(ErrorCategory.RESOURCES, "OOMKilled")
        assert sev == Severity.CRITICAL

    def test_security_category_is_high(self):
        sev = determine_severity(ErrorCategory.SECURITY, "SomeSecurityError")
        assert sev == Severity.HIGH

    def test_config_error_is_medium(self):
        sev = determine_severity(ErrorCategory.CONFIGURATION, "ConfigError")
        assert sev == Severity.MEDIUM
