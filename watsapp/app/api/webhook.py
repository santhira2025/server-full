"""
WhatsApp Webhook Endpoint - The entry point for all incoming messages.
Handles Meta's verification handshake and processes incoming messages
through the AI pipeline.
"""

import logging
from fastapi import APIRouter, Request, Response, HTTPException, Query, BackgroundTasks
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ValidationError

from app.core.config import get_settings
from app.services.whatsapp_service import whatsapp
from app.services.ai_engine import generate_sales_response
from app.services.database import db
from app.services.websocket import ws_manager
import asyncio
from app.models.schemas import (
    SalesContext, MessageDirection, LeadStage,
)

from typing import Optional

class WebhookPayload(BaseModel):
    object: str
    entry: list


class WhatsAppMessageData(BaseModel):
    message_id: Optional[str] = None
    from_number: str
    timestamp: Optional[str] = None
    type: str
    text: Optional[str] = None
    contact_name: Optional[str] = None
    button_reply: Optional[str] = None


settings = get_settings()
logger = logging.getLogger(__name__)
router = APIRouter()

def get_user_for_webhook(business_number: Optional[str]) -> Optional[dict]:
    """Find the user this message belongs to."""
    if not business_number:
        # Fallback: get the first user if only one exists (for simple setups)
        users = db._execute("SELECT * FROM users LIMIT 1")
        return users[0] if users else None
    
    # Try exact match
    user = db._execute_one("SELECT * FROM users WHERE whatsapp_number = %s", (business_number,))
    if not user:
        # Fallback: get the first user
        users = db._execute("SELECT * FROM users LIMIT 1")
        return users[0] if users else None
        
    return user


# ------------------------------------------
# Webhook Verification (GET) - Meta Handshake
# ------------------------------------------

@router.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """
    Meta sends a GET request to verify your webhook URL.
    Must return the challenge token if verify_token matches.
    """
    if hub_mode == "subscribe" and hub_verify_token == settings.whatsapp_verify_token:
        logger.info("Webhook verified successfully")
        return Response(content=hub_challenge, media_type="text/plain")

    logger.warning(f"Webhook verification failed: mode={hub_mode}")
    raise HTTPException(status_code=403, detail="Verification failed")


# ------------------------------------------
# Webhook Handler (POST) - Incoming Messages
# ------------------------------------------

async def _process_ai_pipeline(
    phone: str, text: str, contact_name: str,
    user: dict, user_id: str, conversation: dict, convo_id: str
):
    """Run AI + send reply in background so webhook returns 200 immediately."""
    try:
        history = db.get_conversation_history(phone, user_id=user_id, limit=10)
        context = SalesContext(
            customer_name=conversation.get("customer_name") or contact_name,
            phone_number=phone,
            lead_stage=LeadStage(conversation.get("lead_stage", "new")),
            lead_score=conversation.get("lead_score", 0),
            conversation_history=history,
            business_name=user.get("business_name") or settings.business_name,
            business_description=settings.business_description,
        )

        ai_response = await generate_sales_response(context, text)

        try:
            await whatsapp.send_text_message(phone, ai_response.reply_text)
        except Exception as e:
            logger.warning(f"WhatsApp send failed: {e}")

        db.save_message(
            conversation_id=convo_id,
            phone_number=phone,
            direction=MessageDirection.OUTBOUND,
            content=ai_response.reply_text,
            intent=ai_response.intent_detected,
            confidence=ai_response.confidence,
        )

        updates = {
            "sentiment": ai_response.sentiment.value,
            "total_messages": conversation.get("total_messages", 0) + 2,
            "lead_score": max(0, min(100, context.lead_score + ai_response.lead_score_delta)),
        }
        if ai_response.suggested_stage:
            updates["lead_stage"] = ai_response.suggested_stage.value
        if ai_response.extracted_name:
            updates["customer_name"] = ai_response.extracted_name

        db.update_conversation(phone, user_id, updates)
        asyncio.create_task(ws_manager.broadcast("reload", {"phone_number": phone}))

        logger.info(
            f"Processed: intent={ai_response.intent_detected}, "
            f"score={updates['lead_score']}, stage={ai_response.suggested_stage}"
        )
    except Exception as e:
        logger.error(f"AI pipeline failed: {e}")
        asyncio.create_task(ws_manager.broadcast("reload", {"phone_number": phone}))


@router.post("/webhook")
async def handle_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Process incoming WhatsApp messages through the full pipeline:
    1. Extract message from Meta payload
    2. Load/create conversation from Supabase
    3. Build sales context with history
    4. Generate AI response
    5. Send reply via WhatsApp
    6. Save everything to Supabase
    7. Update lead score and stage
    """
    content_type = request.headers.get("content-type", "")
    
    if "application/x-www-form-urlencoded" in content_type:
        # Twilio Sandbox webhook
        form_data = await request.form()
        phone = form_data.get("From", "").replace("whatsapp:", "").replace("+", "").strip()
        text = form_data.get("Body", "")
        contact_name = form_data.get("ProfileName", "")
        message_id = form_data.get("MessageSid", "")
        business_number = form_data.get("To", "").replace("whatsapp:", "").replace("+", "").strip()

        if not text:
            return Response(status_code=200)
            
    else:
        # Meta or Green API webhook (JSON)
        try:
            payload = await request.json()
        except Exception:
            return Response(status_code=200)

        message_data = whatsapp.extract_message_data(payload)
        if not message_data or not message_data.get("text"):
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=200, content={"status": "ok"})

        try:
            message = WhatsAppMessageData(**message_data)
        except ValidationError as e:
            logger.warning(f"Invalid message data: {e}")
            return Response(status_code=200)

        phone = message.from_number.replace("+", "")
        text = message.text if message.text else ""
        contact_name = message.contact_name
        message_id = message.message_id
        business_number = message_data.get("business_number")
    
    # --- Identification: Which user does this belong to? ---
    user = get_user_for_webhook(business_number)
    if not user:
        logger.warning(f"No user found for message from {phone}. Dropping.")
        return Response(status_code=200)
        
    user_id = user["id"]
    
    logger.info(f"Incoming from {phone[:6]}***: {text[:50]}...")

    # Mark message as read (blue ticks) - non-critical
    try:
        await whatsapp.mark_as_read(message_id or "")
    except Exception as e:
        logger.warning(f"mark_as_read failed: {e}")

    # --- Step 1: Get or create conversation ---
    try:
        conversation = db.get_or_create_conversation(phone, user_id=user_id)
        convo_id = conversation["id"] if conversation and "id" in conversation else ""
    except Exception as e:
        logger.error(f"DB get_or_create failed: {e}")
        return Response(status_code=200)

    # --- Step 2: Save inbound message ---
    try:
        db.save_message(
            conversation_id=convo_id,
            phone_number=phone,
            direction=MessageDirection.INBOUND,
            content=text,
        )
    except Exception as e:
        logger.error(f"DB save_message failed: {e}")

    # Update message count
    try:
        db.update_conversation(phone, user_id, {
            "total_messages": conversation.get("total_messages", 0) + 1,
            "customer_name": contact_name or conversation.get("customer_name"),
        })
    except Exception as e:
        logger.error(f"DB update_conversation failed: {e}")
        return Response(status_code=200) # Stop if we can't update metadata

    # Tell dashboard a new message arrived
    asyncio.create_task(ws_manager.broadcast("reload", {"phone_number": phone}))

    # Check if paused (Human Takeover)
    if conversation.get("is_paused"):
        logger.info(f"Conversation {phone} is paused. Skipping AI.")
        return Response(status_code=200)

    # Run AI pipeline in background — return 200 immediately so Twilio doesn't retry
    background_tasks.add_task(
        _process_ai_pipeline,
        phone, text, contact_name, user, user_id, conversation, convo_id
    )

    return Response(status_code=200)
