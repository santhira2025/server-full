"""
Main Application Entry Point.
Wires together all routes, middleware, and services.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.api.webhook import router as webhook_router
from app.api.dashboard import router as dashboard_router

settings = get_settings()

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"{settings.app_name} starting up...")
    logger.info(f"   Environment: {settings.app_env}")
    logger.info(f"   Business: {settings.business_name}")
    logger.info(f"   AI Model: {settings.ai_model}")
    logger.info(f"   Database: {settings.db_host}:{settings.db_port}/{settings.db_name}")

    # Auto-create tables on startup
    from app.services.database import db
    try:
        db.init_tables()
        logger.info("   Database: tables ready")
    except Exception as e:
        logger.error(f"   Database init failed: {e}")

    # Load Ollama model into memory with keep_alive=-1 (stays loaded forever)
    from app.services.ai_engine import warmup_ollama
    import asyncio
    asyncio.create_task(warmup_ollama())

    yield
    logger.info("Shutting down...")


# ------------------------------------------
# App Factory
# ------------------------------------------

app = FastAPI(
    title=settings.app_name,
    description="WhatsApp AI Sales Agent with Real-Time Dashboard",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS - Allow dashboard to call API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for dashboard
app.mount("/static", StaticFiles(directory="dashboard/static"), name="static")

# Routes
app.include_router(webhook_router, prefix="/api", tags=["WhatsApp Webhook"])
app.include_router(dashboard_router, prefix="/dashboard", tags=["Dashboard"])


# ------------------------------------------
# Health Check
# ------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    from app.api.dashboard import templates
    return templates.TemplateResponse("landing.html", {
        "request": request,
        "business_name": "Argus AI"
    })


@app.get("/sw.js")
async def service_worker():
    return FileResponse(
        "dashboard/static/sw.js",
        media_type="application/javascript",
        headers={"Service-Worker-Allowed": "/"},
    )


@app.get("/health")
async def health():
    return {"status": "healthy"}
