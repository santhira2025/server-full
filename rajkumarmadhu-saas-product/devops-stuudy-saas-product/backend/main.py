from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from troubleshooter.api.routes import router as troubleshoot_router

app = FastAPI(
    title="Santhira - Troubleshooter AI API",
    description="AI-powered DevOps troubleshooting with 8-step pipeline",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(troubleshoot_router)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "troubleshooter-ai"}


@app.get("/")
async def root():
    return {
        "name": "Santhira Troubleshooter AI",
        "version": "1.0.0",
        "description": "AI-powered DevOps troubleshooting platform",
        "endpoints": {
            "troubleshoot": "POST /api/v1/troubleshoot",
            "troubleshoot_stream": "POST /api/v1/troubleshoot/stream",
            "stats": "GET /api/v1/troubleshoot/stats",
            "search": "GET /api/v1/troubleshoot/errors/search"
        }
    }
