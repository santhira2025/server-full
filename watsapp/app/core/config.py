"""
Application Configuration - Single source of truth for all settings.
Loads from .env file with sensible defaults.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # --- App ---
    app_name: str = "WhatsApp AI Sales Agent"
    app_env: str = "development"
    app_secret_key: str = "change-me-in-production"
    app_port: int = 8000
    app_host: str = "0.0.0.0"
    dashboard_password: str = "admin"

    # --- WhatsApp Meta API ---
    whatsapp_api_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_business_account_id: str = ""
    whatsapp_verify_token: str = "finspot-verify-2024"

    # --- Green API (Easy Alternative - just scan QR code) ---
    green_api_instance_id: str = ""
    green_api_token: str = ""
    # --- Twilio Sandbox (Most reliable alternative) ---
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = "whatsapp:+14155238886"
    
    whatsapp_provider: str = "twilio"  # "meta", "green", or "twilio"

    # --- Claude AI (Primary) ---
    anthropic_api_key: str = ""
    ai_model: str = "claude-sonnet-4-6"

    # --- OpenAI (Fallback) ---
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # --- Ollama (Local AI) ---
    ollama_host: str = ""          # e.g. http://173.249.2.23:11435
    ollama_model: str = "llama3.2:3b"

    # --- PostgreSQL (Direct - for K8s self-hosted) ---
    database_url: str = "postgresql://postgres:postgres@localhost:5432/whatsapp_agent"
    db_host: str = "postgres-service"
    db_port: int = 5432
    db_name: str = "whatsapp_agent"
    db_user: str = "postgres"
    db_password: str = "postgres"

    # --- Business ---
    business_name: str = "Argus"
    business_description: str = "AI-powered business solutions and services"
    business_website: str = "https://argus.watsapp.santhira.com"
    currency: str = "INR"
    timezone: str = "Asia/Kolkata"

    # --- Webhook ---
    webhook_url: str = ""

    @property
    def whatsapp_api_url(self) -> str:
        return f"https://graph.facebook.com/v21.0/{self.whatsapp_phone_number_id}/messages"

    @property
    def pg_dsn(self) -> str:
        return f"postgresql://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
