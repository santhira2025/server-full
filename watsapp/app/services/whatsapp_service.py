"""
WhatsApp Service - Handles all communication with WhatsApp.
Supports two providers:
  1. Meta WhatsApp Business API (official, needs business verification)
  2. Green API (easy, just scan QR code with your phone)

Set WHATSAPP_PROVIDER=green or WHATSAPP_PROVIDER=meta in .env
"""

import logging
from typing import Optional

import httpx

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class WhatsAppService:
    def __init__(self):
        self.provider = settings.whatsapp_provider  # "meta", "green", or "twilio"

        if self.provider == "twilio":
            from twilio.rest import Client
            self.twilio_client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
            self.twilio_number = settings.twilio_phone_number
            logger.info("WhatsApp provider: Twilio Sandbox")
        elif self.provider == "green":
            self.instance_id = settings.green_api_instance_id
            self.api_token = settings.green_api_token
            self.base_url = f"https://api.green-api.com/waInstance{self.instance_id}"
            logger.info("WhatsApp provider: Green API")
        else:
            self.api_url = settings.whatsapp_api_url
            self.headers = {
                "Authorization": f"Bearer {settings.whatsapp_api_token}",
                "Content-Type": "application/json",
            }
            logger.info("WhatsApp provider: Meta Business API")

    # -------------------------------------------------------
    # Send Text Message
    # -------------------------------------------------------

    async def send_text_message(self, to: str, text: str) -> dict:
        """Send a text message to a WhatsApp number."""
        try:
            if self.provider == "twilio":
                return await self._twilio_send_text(to, text)
            elif self.provider == "green":
                return await self._green_send_text(to, text)
            else:
                return await self._meta_send_text(to, text)
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
            return {"error": str(e)}

    async def _twilio_send_text(self, to: str, text: str) -> dict:
        """Send text via Twilio Sandbox."""
        import asyncio
        
        def send():
            # Standardize phone format for Twilio WhatsApp
            if to.startswith("whatsapp:"):
                to_formatted = to
            elif to.startswith("+"):
                to_formatted = f"whatsapp:{to}"
            else:
                to_formatted = f"whatsapp:+{to}"

            # Twilio client is synchronous, so we run it in a thread
            message = self.twilio_client.messages.create(
                from_=self.twilio_number,
                body=text,
                to=to_formatted
            )
            return message

        try:
            tw_msg = await asyncio.to_thread(send)
            logger.info(f"Message sent to {to[:6]}*** via Twilio")
            return {"sid": tw_msg.sid}
        except Exception as e:
            logger.error(f"Twilio API error: {e}")
            return {"error": str(e)}

    async def _green_send_text(self, to: str, text: str) -> dict:
        """Send text via Green API."""
        # Green API expects phone number with country code, no + sign
        chat_id = f"{to}@c.us"
        url = f"{self.base_url}/sendMessage/{self.api_token}"
        payload = {
            "chatId": chat_id,
            "message": text,
        }

        async with httpx.AsyncClient(verify=False) as client:
            response = await client.post(url, json=payload, timeout=30.0)

        if response.status_code == 200:
            logger.info(f"Message sent to {to[:6]}*** via Green API")
            return response.json()
        else:
            logger.error(f"Green API error: {response.status_code} - {response.text}")
            return {"error": response.text}

    async def _meta_send_text(self, to: str, text: str) -> dict:
        """Send text via Meta WhatsApp Business API."""
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "text",
            "text": {"preview_url": False, "body": text},
        }

        async with httpx.AsyncClient(verify=False) as client:
            response = await client.post(
                self.api_url,
                json=payload,
                headers=self.headers,
                timeout=30.0,
            )

        if response.status_code == 200:
            logger.info(f"Message sent to {to[:6]}*** via Meta API")
            return response.json()
        else:
            logger.error(f"Meta API error: {response.status_code} - {response.text}")
            return {"error": response.text}

    # -------------------------------------------------------
    # Send Template Message (Meta only)
    # -------------------------------------------------------

    async def send_template_message(
        self, to: str, template_name: str, language: str = "en"
    ) -> dict:
        """Send a pre-approved template message (Meta API only)."""
        if self.provider == "green" or self.provider == "twilio":
            # Green API/Twilio doesn't use templates, send as regular message
            return await self.send_text_message(to, f"[Template: {template_name}]")

        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language},
            },
        }

        async with httpx.AsyncClient(verify=False) as client:
            response = await client.post(
                self.api_url,
                json=payload,
                headers=self.headers,
                timeout=30.0,
            )

        return response.json()

    # -------------------------------------------------------
    # Send Interactive Buttons
    # -------------------------------------------------------

    async def send_interactive_buttons(
        self, to: str, body_text: str, buttons: list[dict]
    ) -> dict:
        """Send interactive button message."""
        if self.provider == "green" or self.provider == "twilio":
            # Green API/Twilio: send as text with numbered options
            btn_text = body_text + "\n\n"
            for i, btn in enumerate(buttons[:3], 1):
                btn_text += f"{i}. {btn.get('title', '')}\n"
            return await self.send_text_message(to, btn_text)

        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": body_text},
                "action": {
                    "buttons": [
                        {
                            "type": "reply",
                            "reply": {"id": btn["id"], "title": btn["title"]},
                        }
                        for btn in buttons[:3]
                    ]
                },
            },
        }

        async with httpx.AsyncClient(verify=False) as client:
            response = await client.post(
                self.api_url,
                json=payload,
                headers=self.headers,
                timeout=30.0,
            )

        return response.json()

    # -------------------------------------------------------
    # Mark as Read
    # -------------------------------------------------------

    async def mark_as_read(self, message_id: str) -> None:
        """Mark an incoming message as read (blue ticks)."""
        try:
            if self.provider == "twilio":
                # Twilio doesn't support manual mark_as_read for sandbox
                pass
            elif self.provider == "green":
                # Green API: mark as read
                url = f"{self.base_url}/readChat/{self.api_token}"
                async with httpx.AsyncClient(verify=False) as client:
                    await client.post(url, json={"chatId": message_id}, timeout=10.0)
            else:
                payload = {
                    "messaging_product": "whatsapp",
                    "status": "read",
                    "message_id": message_id,
                }
                async with httpx.AsyncClient(verify=False) as client:
                    await client.post(
                        self.api_url,
                        json=payload,
                        headers=self.headers,
                        timeout=10.0,
                    )
        except Exception as e:
            logger.warning(f"mark_as_read failed: {e}")

    # -------------------------------------------------------
    # Extract Message Data (from Meta webhook payload)
    # -------------------------------------------------------

    @staticmethod
    def extract_message_data(payload: dict) -> Optional[dict]:
        """
        Extract the actual message from Meta's webhook payload.
        Returns None if this isn't a user message (e.g., status update).
        """
        try:
            entry = payload.get("entry", [{}])[0]
            changes = entry.get("changes", [{}])[0]
            value = changes.get("value", {})
            messages = value.get("messages", [])

            if not messages:
                return None

            msg = messages[0]
            contact = value.get("contacts", [{}])[0]
            metadata = value.get("metadata", {})

            return {
                "message_id": msg.get("id"),
                "from_number": msg.get("from"),
                "business_number": metadata.get("display_phone_number"),
                "timestamp": msg.get("timestamp"),
                "type": msg.get("type"),
                "text": msg.get("text", {}).get("body", ""),
                "contact_name": contact.get("profile", {}).get("name", ""),
                "button_reply": (
                    msg.get("interactive", {}).get("button_reply", {}).get("id")
                    if msg.get("type") == "interactive"
                    else None
                ),
            }
        except (IndexError, KeyError, TypeError) as e:
            logger.warning(f"Could not extract message data: {e}")
            return None


# Singleton
whatsapp = WhatsAppService()
