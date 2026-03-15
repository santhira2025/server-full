from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from server.config import settings
from server.modules.persistence.database import engine, AsyncSessionLocal
from server.models import Base
from server.api.routers import router
from server.modules.test_executor.wordlist_manager import WordlistManager
from server.modules.scheduler.test_scheduler import TestScheduler
from server.modules.ingestion.queue import ingestion_queue
from server.modules.analytics.processor import AnalyticsProcessor
from server.modules.storage.archiver import ArchiveProcessor
from server.modules.storage.warm_exporter import WarmStoreExporter
from server.modules.api_inventory.lifecycle import EndpointLifecycleProcessor
from server.modules.streaming.pipeline import StreamPipeline
from server.modules.recon.scheduler import ReconScheduler
from server.modules.response.default_playbooks import ensure_default_playbooks
from server.modules.streaming.kafka_alert_consumer import KafkaAlertConsumer

DEMO_ACCOUNT_ID = 1000000

from contextlib import asynccontextmanager
import structlog
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from server.api.rate_limiter import limiter
logger = structlog.get_logger()
_scheduler = TestScheduler()
_analytics = AnalyticsProcessor(interval_sec=60, account_id=DEMO_ACCOUNT_ID)
_archiver = ArchiveProcessor(interval_sec=3600, account_id=DEMO_ACCOUNT_ID)
_warm_exporter = WarmStoreExporter(interval_sec=settings.WARM_EXPORT_INTERVAL_SECONDS)
_lifecycle = EndpointLifecycleProcessor(interval_sec=settings.LIFECYCLE_SWEEP_INTERVAL_SECONDS)
_stream_pipeline = StreamPipeline()
_recon_scheduler = ReconScheduler(interval_sec=settings.RECON_SCHEDULER_INTERVAL_SECONDS)
_kafka_alert_consumer = KafkaAlertConsumer()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    # Create all SQLAlchemy tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Ensure demo account (id=1000000) exists
    async with AsyncSessionLocal() as db:
        exists = await db.execute(
            text("SELECT id FROM accounts WHERE id = :id"), {"id": DEMO_ACCOUNT_ID}
        )
        if not exists.fetchone():
            await db.execute(
                text("INSERT INTO accounts (id, name, plan_tier) VALUES (:id, :name, :tier)"),
                {"id": DEMO_ACCOUNT_ID, "name": "Demo Organization", "tier": "ENTERPRISE"},
            )
            logger.info("startup", message=f"Created demo account id={DEMO_ACCOUNT_ID}")
        await db.commit()

    # Load security test templates from YAML library
    wm = WordlistManager.get_instance(settings.TESTS_LIBRARY_PATH)
    wm.refresh_templates()

    # Ensure default playbooks for recon/lifecycle events
    async with AsyncSessionLocal() as db:
        await ensure_default_playbooks(db, DEMO_ACCOUNT_ID)
        await db.commit()

    # Start APScheduler for cron-based test scheduling
    _scheduler.start()
    # Start ingestion workers
    await ingestion_queue.start()
    # Start analytics processor
    await _analytics.start()
    # Start archival processor
    await _archiver.start()
    # Start warm store exporter (ClickHouse)
    await _warm_exporter.start()
    # Start endpoint lifecycle sweeper
    await _lifecycle.start()
    # Start recon scheduler
    await _recon_scheduler.start()
    # Start stream processing pipeline
    await _stream_pipeline.start()
    # If Flink is enabled, start Kafka alert consumer
    if settings.STREAM_ENGINE.upper() == "FLINK":
        await _kafka_alert_consumer.start()

    logger.info("startup", templates_loaded=len(wm.templates), scheduler_started=True)
    
    yield
    
    # --- Shutdown ---
    _scheduler.stop()
    await _analytics.stop()
    await _archiver.stop()
    await _warm_exporter.stop()
    await _lifecycle.stop()
    await _recon_scheduler.stop()
    await _stream_pipeline.stop()
    await _kafka_alert_consumer.stop()
    await ingestion_queue.stop()
    await engine.dispose()
    logger.info("shutdown", message="Shutdown complete.")



app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="API Security Engine — full Akto-parity backend with Python/FastAPI/SQLite",
    lifespan=lifespan
)
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
async def custom_rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"error": True, "message": "Too many requests. Please try again later."},
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": True, "message": exc.detail},
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    # Skip logging for common network errors or expected breaks
    logger.error("unhandled_exception", path=request.url.path, error=str(exc))
    msg = "Internal Server Error"
    if settings.DEBUG:
        msg = f"Internal Server Error: {str(exc)}"
    return JSONResponse(
        status_code=500,
        content={"error": True, "message": msg},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

app.include_router(router, prefix="/api")
