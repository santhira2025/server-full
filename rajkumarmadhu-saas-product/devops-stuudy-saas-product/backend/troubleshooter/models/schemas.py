from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime


class ToolType(str, Enum):
    KUBERNETES = "kubernetes"
    DOCKER = "docker"
    TERRAFORM = "terraform"
    AWS = "aws"
    LINUX = "linux"
    NGINX = "nginx"
    POSTGRESQL = "postgresql"
    PROMETHEUS = "prometheus"
    REDIS = "redis"
    ELASTICSEARCH = "elasticsearch"
    AZURE = "azure"
    GCP = "gcp"


class ErrorCategory(str, Enum):
    CONFIGURATION = "configuration"
    NETWORKING = "networking"
    PERMISSIONS = "permissions"
    RESOURCES = "resources"
    STATE = "state"
    VERSION = "version"
    SECURITY = "security"
    STORAGE = "storage"
    DEPENDENCY = "dependency"


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class ParseResult(BaseModel):
    raw_error: str
    tool: Optional[ToolType] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    context: Dict[str, Any] = Field(default_factory=dict)
    parsed_at: datetime = Field(default_factory=datetime.now)


class ClassificationResult(BaseModel):
    category: ErrorCategory
    subcategory: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)
    severity: Severity
    keywords: List[str] = Field(default_factory=list)
    classified_at: datetime = Field(default_factory=datetime.now)


class KnowledgeMatch(BaseModel):
    error_id: str
    title: str
    description: str
    tool: ToolType
    category: ErrorCategory
    similarity_score: float = Field(ge=0.0, le=1.0)
    fix_steps: List[str]
    prevention: Optional[str] = None


class RCACause(BaseModel):
    cause: str
    probability: float = Field(ge=0.0, le=1.0)
    evidence: str
    is_root_cause: bool = False


class RCAResult(BaseModel):
    analysis: str
    causes: List[RCACause]
    affected_components: List[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    generated_at: datetime = Field(default_factory=datetime.now)


class FixStep(BaseModel):
    step_number: int
    title: str
    command: Optional[str] = None
    description: str
    verification: str
    warning: Optional[str] = None


class FixResult(BaseModel):
    steps: List[FixStep]
    estimated_time: Optional[str] = None
    risk_level: Severity = Severity.MEDIUM


class PreventionRule(BaseModel):
    rule_type: str
    description: str
    config: str
    alert_query: Optional[str] = None


class PreventionResult(BaseModel):
    monitoring_rules: List[PreventionRule] = Field(default_factory=list)
    cicd_checks: List[str] = Field(default_factory=list)
    best_practices: List[str] = Field(default_factory=list)


class TroubleshootingRequest(BaseModel):
    error_input: str
    tool_hint: Optional[ToolType] = None
    context: Optional[Dict[str, Any]] = None


class TroubleshootingResponse(BaseModel):
    request_id: str
    parse: ParseResult
    classify: ClassificationResult
    matches: List[KnowledgeMatch]
    rca: Optional[RCAResult] = None
    fix: Optional[FixResult] = None
    prevention: Optional[PreventionResult] = None
    total_time_ms: float


class FeedbackRequest(BaseModel):
    error_id: str
    resolution_helpful: bool
    correct_fix: bool
    feedback: Optional[str] = None
