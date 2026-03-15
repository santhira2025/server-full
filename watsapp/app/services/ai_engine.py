"""
AI Sales Agent Engine - The brain that drives conversations.
Uses Claude as primary, OpenAI as fallback.
Implements a sales-optimized prompt chain with lead scoring.
"""

import json
import logging
from typing import Optional

import anthropic
import openai

from app.core.config import get_settings
from app.models.schemas import (
    AIResponse, SalesContext, LeadStage, SentimentType,
)

settings = get_settings()
logger = logging.getLogger(__name__)

# ------------------------------------------
# System Prompt: The Sales Agent Personality
# ------------------------------------------

SALES_AGENT_PROMPT = """You are an expert AI Sales Agent for {business_name}.

BUSINESS CONTEXT:
- Business: {business_name}
- What we do: {business_description}
- Website: {business_website}
- Currency: {currency}

CUSTOMER CONTEXT:
- Name: {customer_name}
- Current Lead Stage: {lead_stage}
- Lead Score: {lead_score}/100
- Conversation so far: {message_count} messages

YOUR ROLE:
You are a warm, professional, and persuasive sales assistant on WhatsApp.
You speak naturally like a human — short messages, friendly tone, no corporate jargon.

SALES FRAMEWORK (follow this progression):
1. GREETING & RAPPORT — Be warm. Ask their name if unknown. Show genuine interest.
2. DISCOVERY — Ask smart questions to understand their needs, budget, timeline.
3. QUALIFICATION — Assess if they're a good fit. Score their buying intent.
4. PRESENTATION — Present relevant solutions. Use benefits, not features.
5. OBJECTION HANDLING — Address concerns with empathy. Provide social proof.
6. CLOSING — Create urgency. Offer clear next steps. Ask for the sale.
7. FOLLOW-UP — If they go quiet, re-engage with value.

RESPONSE RULES:
- Keep messages SHORT (2-4 lines max). This is WhatsApp, not email.
- Use emojis sparingly (1-2 per message max).
- NEVER say you're an AI. You are a sales representative.
- Ask ONE question at a time. Don't overwhelm.
- If they mention price concerns, pivot to value first.
- If they're ready to buy, give clear payment/next steps.
- If they seem uninterested, gracefully offer to help later.

You MUST respond with a JSON object (no markdown, no code fences):
{{
    "reply_text": "Your WhatsApp message to the customer",
    "intent_detected": "one of: greeting, inquiry, pricing, objection, buying_signal, complaint, follow_up, general",
    "sentiment": "positive, neutral, or negative",
    "lead_score_delta": integer from -10 to +15 (how much to adjust their score),
    "suggested_stage": "new, engaged, qualified, proposal, negotiation, closed_won, or closed_lost (or null if no change)",
    "confidence": float 0.0-1.0 (how confident you are in this response),
    "should_escalate": false (set true only if customer demands human agent),
    "extracted_name": "customer's name if they mentioned it, else null"
}}"""


def _build_messages(context: SalesContext, customer_message: str) -> list[dict]:
    """Build the message array for the AI model."""
    system_prompt = SALES_AGENT_PROMPT.format(
        business_name=context.business_name or settings.business_name,
        business_description=context.business_description or settings.business_description,
        business_website=settings.business_website,
        currency=settings.currency,
        customer_name=context.customer_name or "Unknown",
        lead_stage=context.lead_stage.value,
        lead_score=context.lead_score,
        message_count=len(context.conversation_history),
    )

    messages = []

    # Add conversation history
    for msg in context.conversation_history[-10:]:  # Last 10 messages for context
        role = "user" if msg.get("direction") == "inbound" else "assistant"
        content = msg.get("content", "")
        if role == "assistant":
            # Wrap past AI responses so the model understands format
            content = json.dumps({"reply_text": content})
        messages.append({"role": role, "content": content})

    # Add current message
    messages.append({"role": "user", "content": customer_message})

    return system_prompt, messages


def _parse_ai_response(raw_text: str) -> AIResponse:
    """Parse the JSON response from the AI model."""
    try:
        # Clean up common issues
        text = raw_text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1].rsplit("```", 1)[0]

        data = json.loads(text)
        return AIResponse(
            reply_text=data.get("reply_text", "I'll get back to you shortly!"),
            intent_detected=data.get("intent_detected", "general"),
            sentiment=SentimentType(data.get("sentiment", "neutral")),
            lead_score_delta=int(data.get("lead_score_delta", 0)),
            suggested_stage=(
                LeadStage(data["suggested_stage"])
                if data.get("suggested_stage")
                else None
            ),
            confidence=float(data.get("confidence", 0.5)),
            should_escalate=bool(data.get("should_escalate", False)),
            extracted_name=data.get("extracted_name"),
        )
    except (json.JSONDecodeError, ValueError, KeyError) as e:
        logger.warning(f"Failed to parse AI response: {e}. Raw: {raw_text[:200]}")
        return AIResponse(
            reply_text=raw_text if len(raw_text) < 500 else "Thanks for your message! Let me look into that for you.",
            intent_detected="general",
            confidence=0.3,
        )


# ------------------------------------------
# Ollama (Local Engine - Primary when configured)
# ------------------------------------------

async def _call_ollama(system_prompt: str, messages: list[dict]) -> str:
    import asyncio
    client = openai.OpenAI(
        base_url=f"{settings.ollama_host}/v1",
        api_key="ollama",
        timeout=240,
        max_retries=0,
    )
    full_messages = [{"role": "system", "content": system_prompt}] + messages

    def _sync_call():
        response = client.chat.completions.create(
            model=settings.ollama_model,
            messages=full_messages,
            max_tokens=200,
            temperature=0.7,
        )
        return response.choices[0].message.content

    return await asyncio.get_running_loop().run_in_executor(None, _sync_call)


async def warmup_ollama():
    """Load Ollama model into memory and keep it loaded indefinitely (keep_alive=-1)."""
    if not settings.ollama_host:
        return
    import asyncio, urllib.request, json as _json

    def _ping():
        payload = _json.dumps({
            "model": settings.ollama_model,
            "keep_alive": -1,      # keep loaded forever
            "messages": [{"role": "user", "content": "hi"}],
            "stream": False,
            "options": {"num_predict": 1},
        }).encode()
        req = urllib.request.Request(
            f"{settings.ollama_host}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=90)

    try:
        await asyncio.get_running_loop().run_in_executor(None, _ping)
        logger.info(f"Ollama model '{settings.ollama_model}' loaded and kept alive")
    except Exception as e:
        logger.warning(f"Ollama warmup failed (non-fatal): {e}")


# ------------------------------------------
# Claude (Primary Engine)
# ------------------------------------------

async def _call_claude(system_prompt: str, messages: list[dict]) -> str:
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    response = client.messages.create(
        model=settings.ai_model,
        max_tokens=500,
        system=system_prompt,
        messages=messages,
    )
    return response.content[0].text


# ------------------------------------------
# OpenAI (Fallback Engine)
# ------------------------------------------

async def _call_openai(system_prompt: str, messages: list[dict]) -> str:
    client = openai.OpenAI(api_key=settings.openai_api_key)
    full_messages = [{"role": "system", "content": system_prompt}] + messages
    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=full_messages,
        max_tokens=500,
        temperature=0.7,
    )
    return response.choices[0].message.content


# ------------------------------------------
# Public API
# ------------------------------------------

async def generate_sales_response(
    context: SalesContext, customer_message: str
) -> AIResponse:
    """
    Generate an AI sales response. Uses Claude first, falls back to OpenAI.
    This is the main entry point called by the webhook handler.
    """
    system_prompt, messages = _build_messages(context, customer_message)

    raw_response = None

    # Try Ollama first (local, free — runs async in background so no timeout issue)
    if settings.ollama_host:
        try:
            raw_response = await _call_ollama(system_prompt, messages)
            logger.info("AI response generated via Ollama")
        except Exception as e:
            logger.error(f"Ollama error: {e}")

    # Fallback to Claude
    if raw_response is None and settings.anthropic_api_key:
        try:
            raw_response = await _call_claude(system_prompt, messages)
            logger.info("AI response generated via Claude")
        except Exception as e:
            logger.error(f"Claude API error: {e}")

    # Fallback to OpenAI
    if raw_response is None and settings.openai_api_key:
        try:
            raw_response = await _call_openai(system_prompt, messages)
            logger.info("AI response generated via OpenAI (fallback)")
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")

    # Last resort
    if raw_response is None:
        logger.error("All AI engines failed")
        return AIResponse(
            reply_text="Thanks for reaching out! Our team will get back to you shortly. 🙏",
            intent_detected="general",
            confidence=0.0,
        )

    return _parse_ai_response(raw_response)
