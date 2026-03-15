"""
Pydantic models for request/response validation and data structures.
These are the data contracts of the entire system.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


# ============================================
# Enums
# ============================================

class LeadStage(str, Enum):
    NEW = "new"
    ENGAGED = "engaged"
    QUALIFIED = "qualified"
    PROPOSAL = "proposal"
    NEGOTIATION = "negotiation"
    CLOSED_WON = "closed_won"
    CLOSED_LOST = "closed_lost"


class MessageDirection(str, Enum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"


class SentimentType(str, Enum):
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"


# ============================================
# WhatsApp Webhook Models (from Meta)
# ============================================

class WhatsAppMessage(BaseModel):
    from_number: str = Field(..., alias="from")
    id: str
    timestamp: str
    type: str
    text: Optional[dict] = None

    class Config:
        populate_by_name = True


class WhatsAppWebhookPayload(BaseModel):
    object: str
    entry: list


# ============================================
# Conversation & Lead Models
# ============================================

class Conversation(BaseModel):
    id: Optional[str] = None
    phone_number: str
    customer_name: Optional[str] = None
    lead_stage: LeadStage = LeadStage.NEW
    lead_score: int = Field(default=0, ge=0, le=100)
    sentiment: SentimentType = SentimentType.NEUTRAL
    total_messages: int = 0
    last_message_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    tags: list[str] = []
    notes: Optional[str] = None


class Message(BaseModel):
    id: Optional[str] = None
    conversation_id: str
    phone_number: str
    direction: MessageDirection
    content: str
    ai_confidence: Optional[float] = None
    intent_detected: Optional[str] = None
    timestamp: Optional[datetime] = None


class LeadScoreUpdate(BaseModel):
    phone_number: str
    score_delta: int
    reason: str
    new_stage: Optional[LeadStage] = None


# ============================================
# AI Agent Models
# ============================================

class SalesContext(BaseModel):
    """Context passed to the AI for each conversation turn."""
    customer_name: Optional[str] = None
    phone_number: str
    lead_stage: LeadStage
    lead_score: int
    conversation_history: list[dict] = []
    detected_interests: list[str] = []
    business_name: str = ""
    business_description: str = ""


class AIResponse(BaseModel):
    reply_text: str
    intent_detected: str = "general"
    sentiment: SentimentType = SentimentType.NEUTRAL
    lead_score_delta: int = 0
    suggested_stage: Optional[LeadStage] = None
    confidence: float = 0.0
    should_escalate: bool = False
    extracted_name: Optional[str] = None


# ============================================
# Dashboard Models
# ============================================

class DashboardMetrics(BaseModel):
    total_conversations: int = 0
    active_today: int = 0
    total_messages: int = 0
    avg_lead_score: float = 0.0
    conversion_rate: float = 0.0
    revenue_pipeline: float = 0.0
    leads_by_stage: dict = {}
    messages_per_hour: list = []
    top_intents: list = []
    sentiment_breakdown: dict = {}


class ConversationSummary(BaseModel):
    phone_number: str
    customer_name: Optional[str] = None
    last_message: str
    lead_stage: LeadStage
    lead_score: int
    sentiment: SentimentType
    message_count: int
    last_active: Optional[datetime] = None
