from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import time
import asyncio
import os
from fastapi.responses import HTMLResponse

# --- Pydantic Models ---
class InsightResponse(BaseModel):
    status: str
    message: str
    data: Optional[dict] = None

class PodcastRequest(BaseModel):
    timeframe_minutes: int = 60
    focus_area: str = "anomalies" # e.g., 'anomalies', 'latency', 'security'

class PodcastResponse(BaseModel):
    task_id: str
    status: str
    estimated_time_sec: int

# --- FastAPI Initialization ---
app = FastAPI(
    title="Insights LM Backend",
    description="API powering the Real-Time Traffic Visualizer and AI Study agents.",
    version="1.0.0"
)

# Allow CORS for the static HTML frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- LangGraph Simulated Agents & Prompts ---

CLAUDE_3_7_SYSTEM_PROMPT = """
You are a specialized AI Podcast Host Agent operating within the Insights LM ecosystem.
Your task is to take raw, structured data from the Supabase pgvector logs and synthesize an engaging, 
informative "Audio Overview" conversation between two hosts:
- Host A (Network Analyst): Skeptical, detail-oriented, focuses on the metrics.
- Host B (Security Agent): Big-picture, explains the anomalies and mitigation strategies.

OUTPUT FORMAT: A structured JSON script linking paragraphs to document line numbers for verifiable citations.
"""

VISION_PROMPT = """
Analyze the provided network topology diagram.
1. Compare it against the current live traffic layout: [US-East, EU-West, API Gateway, Auth Service].
2. Identify missing redundancies or security vulnerabilities.
3. Output the results as a structured JSON object containing a confidence score and a list of findings.
"""

async def simulate_langgraph_podcast_workflow(task_id: str, request: PodcastRequest):
    """
    Simulates a multi-agent LangGraph workflow:
    1. Retrieval Agent: Pulls logs from Supabase Vector DB
    2. Synthesis Agent (Claude 3.7): Writes the podcast script
    3. TTS Agent (Gemini API): Converts script to audio
    """
    print(f"\n--- LANGGRAPH WORKFLOW: {task_id} ---")
    print(f"[{task_id}] [State: Routing] Supervisor Agent evaluating '{request.focus_area}' request...")
    await asyncio.sleep(1)
    
    print(f"[{task_id}] [State: Retrieval] Querying pgvector: SELECT * FROM traffic_logs WHERE time > NOW() - interval '{request.timeframe_minutes} minutes';")
    await asyncio.sleep(2)
    
    print(f"[{task_id}] [State: Synthesis] Invoking Claude 3.7 Sonnet with system prompt...")
    # Simulated LLM generation log
    print(f"[{task_id}] Claude 3.7 Output generation in progress (adhering to strict JSON schema for citations)...")
    await asyncio.sleep(3)
    
    print(f"[{task_id}] [State: TTS_Generation] Passing valid script to Gemini Voice API. Formatting PCM to MP3 via FFmpeg.")
    await asyncio.sleep(4)
    
    print(f"[{task_id}] [State: Workflow_Complete] Audio saved to Supabase Storage. Triggering webhook to frontend.\n")

# --- API Endpoints ---

def _serve_html(filename: str) -> HTMLResponse:
    """Helper to load any HTML file from the project root."""
    html_path = os.path.join(os.path.dirname(__file__), "..", filename)
    try:
        with open(html_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except Exception as e:
        return HTMLResponse(content=f"<h1>Error: {e}</h1>", status_code=500)

@app.get("/", response_class=HTMLResponse, tags=["Dashboards"])
async def serve_home():
    """Landing page — lists all available dashboards."""
    return HTMLResponse(content="""
    <!DOCTYPE html><html><head><meta charset='UTF-8'>
    <title>Santhira Platform</title>
    <link href='https://fonts.googleapis.com/css2?family=Outfit:wght@700;800&family=Inter:wght@400;500&display=swap' rel='stylesheet'>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:#040508;color:#dce6f5;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;}
        .wrap{text-align:center;max-width:640px;padding:40px 20px;}
        h1{font-family:Outfit,sans-serif;font-size:48px;font-weight:800;background:linear-gradient(135deg,#fff,#7c4dff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px;}
        p{color:#55647f;margin-bottom:40px;font-size:16px;}
        .links{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
        a{display:block;padding:20px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;text-decoration:none;color:#dce6f5;transition:all 0.2s;font-weight:500;}
        a:hover{border-color:rgba(124,77,255,0.4);background:rgba(124,77,255,0.08);}
        .icon{font-size:28px;margin-bottom:8px;}
        .lbl{font-size:13px;color:#55647f;margin-top:4px;}
    </style></head><body>
    <div class='wrap'>
        <h1>Santhira ⚡</h1>
        <p>Enterprise AI DevOps Platform · All services running</p>
        <div class='links'>
            <a href='/enterprise'><div class='icon'>📊</div><b>Enterprise Dashboard</b><div class='lbl'>Command Center — Live Metrics</div></a>
            <a href='/traffic'><div class='icon'>🌐</div><b>Traffic Visualizer</b><div class='lbl'>Real-time AI Traffic Monitor</div></a>
            <a href='/docs'><div class='icon'>⚡</div><b>API Swagger Docs</b><div class='lbl'>All REST endpoints — Interactive</div></a>
            <a href='/learn'><div class='icon'>📚</div><b>Backend Learning Guide</b><div class='lbl'>How to build this backend</div></a>
        </div>
    </div></body></html>
    """)

@app.get("/enterprise", response_class=HTMLResponse, tags=["Dashboards"])
async def serve_enterprise_dashboard():
    """Serves the Enterprise Command Center Dashboard."""
    return _serve_html("Enterprise_Dashboard.html")

@app.get("/traffic", response_class=HTMLResponse, tags=["Dashboards"])
async def serve_traffic_dashboard():
    """Serves the Real-Time Traffic Visualizer."""
    return _serve_html("Realtime_Traffic_Visualizer.html")

@app.get("/learn", response_class=HTMLResponse, tags=["Dashboards"])
async def serve_learn():
    """Returns a backend learning guide."""
    return HTMLResponse(content="""
    <!DOCTYPE html><html><head><meta charset='UTF-8'><title>Learn Backend — Santhira</title>
    <link href='https://fonts.googleapis.com/css2?family=Outfit:wght@700;800&family=Inter:wght@400;500&family=JetBrains+Mono&display=swap' rel='stylesheet'>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:#040508;color:#dce6f5;font-family:Inter,sans-serif;padding:40px 20px;max-width:800px;margin:0 auto;line-height:1.7;}
        h1{font-family:Outfit,sans-serif;font-size:40px;font-weight:800;background:linear-gradient(135deg,#fff,#00e5ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px;}
        h2{font-family:Outfit,sans-serif;font-size:20px;font-weight:700;margin:32px 0 12px;color:#dce6f5;}
        p,li{color:#8899bb;font-size:15px;}
        ul{padding-left:20px;margin-bottom:8px;}
        code{font-family:'JetBrains Mono',monospace;background:rgba(0,229,255,0.08);color:#00e5ff;padding:2px 8px;border-radius:5px;font-size:13px;}
        .step{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-left:3px solid #7c4dff;border-radius:12px;padding:20px 24px;margin-bottom:16px;}
        .step-num{font-family:Outfit,sans-serif;font-size:13px;font-weight:700;color:#7c4dff;margin-bottom:6px;letter-spacing:1px;}
        a{color:#00e5ff;}
        .back{display:inline-block;margin-bottom:30px;color:#55647f;text-decoration:none;font-size:13px;}
    </style></head><body>
    <a class='back' href='/'>← Back to Platform</a>
    <h1>Learn Backend Development</h1>
    <p>You are already running a real Python FastAPI backend. Here is exactly how it works and how to go deeper.</p>

    <h2>🔴 What You Just Built (This Very Server!)</h2>
    <div class='step'><div class='step-num'>TECH STACK</div>
    <b>Python + FastAPI + Uvicorn</b><br>
    <ul><li>FastAPI creates the REST API routes (<code>@app.get</code>, <code>@app.post</code>)</li>
    <li>Uvicorn is the ASGI web server that runs it (<code>uvicorn insights_api:app</code>)</li>
    <li>Pydantic validates all request/response data automatically</li>
    <li>asyncio handles many requests simultaneously without blocking</li></ul></div>

    <h2>📚 Step-by-Step Learning Path</h2>
    <div class='step'><div class='step-num'>STEP 1 — Python Basics (Week 1)</div>
    Variables, functions, loops, classes. Resource: <a href='https://docs.python.org/3/tutorial/' target='_blank'>Python Official Tutorial</a></div>
    <div class='step'><div class='step-num'>STEP 2 — FastAPI (Week 2)</div>
    Build REST APIs. This project uses it! Resource: <a href='https://fastapi.tiangolo.com' target='_blank'>fastapi.tiangolo.com</a></div>
    <div class='step'><div class='step-num'>STEP 3 — Databases (Week 3)</div>
    PostgreSQL + SQLAlchemy ORM. This project uses Supabase (Postgres + pgvector).</div>
    <div class='step'><div class='step-num'>STEP 4 — Authentication (Week 4)</div>
    JWT tokens, OAuth2. FastAPI has built-in security utilities.</div>
    <div class='step'><div class='step-num'>STEP 5 — Async & Background Tasks (Week 5)</div>
    This project uses <code>BackgroundTasks</code> and <code>asyncio.sleep</code> — you just learned it!</div>
    <div class='step'><div class='step-num'>STEP 6 — Deploy (Week 6)</div>
    Docker → your <code>Dockerfile</code> is already written! Deploy to AWS EC2 or Google Cloud Run.</div>

    <h2>⚡ Explore This Live Backend</h2>
    <ul>
    <li>📖 <a href='/docs'>Interactive API Docs</a> — test all endpoints in browser</li>
    <li>🌐 <a href='/enterprise'>Enterprise Dashboard</a> — the UI this backend serves</li>
    <li>🎙️ <code>POST /api/generate-podcast</code> — triggers the LangGraph AI agents</li>
    <li>🔔 <code>POST /api/trigger-chaos</code> — fires the n8n remediation webhook</li></ul>
    </body></html>
    """)

@app.post("/api/generate-podcast", response_model=PodcastResponse, tags=["AI Agents"])
async def generate_podcast(request: PodcastRequest, background_tasks: BackgroundTasks):
    """
    Triggers the LangGraph pipeline to generate a NotebookLM-style Audio Overview.
    """
    task_id = f"pod_{int(time.time())}"
    
    # Run the heavy LangGraph workflow in the background
    background_tasks.add_task(simulate_langgraph_podcast_workflow, task_id, request)
    
    return PodcastResponse(
        task_id=task_id,
        status="Workflow initiated",
        estimated_time_sec=11
    )

@app.post("/api/study-image", response_model=InsightResponse, tags=["AI Agents"])
async def study_topology_image(file: UploadFile = File(...)):
    """
    Endpoint to receive a network topology diagram (image) and run a vision model over it.
    """
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File provided is not an image.")
    
    print(f"\n--- VISION LLM INVOKED ---")
    print(f"[study-image] Receiving blob: {file.filename}")
    print(f"[study-image] Applying VISION_PROMPT to image via Claude 3.5 Sonnet / GPT-4o...")
    
    # 1. Save file temporarily (simulated)
    # 2. Pass to Vision LLM using the crafted VISION_PROMPT
    # 3. Compare with live topology mapping
    
    await asyncio.sleep(3) # Simulate processing time
    print(f"[study-image] Vision processing complete. Returning structured findings.\n")
    
    return InsightResponse(
        status="success",
        message="Vision Study Complete",
        data={
            "findings": [
                "Detected missing redundancy link between US-East Edge and Auth Service.",
                "Live nodes perfectly map to structural layout.",
                "Recommendation: Deploy n8n workflow to spin up secondary API Gateway."
            ],
            "confidence_score": 0.94
        }
    )

@app.post("/api/trigger-chaos", response_model=InsightResponse, tags=["n8n Workflows"])
async def trigger_chaos_remediation():
    """
    Simulates sending the anomaly data to an n8n webhook, which acts on it via Claude 3.7
    to generate a mitigation strategy and block the IP using Cloudflare APIs.
    """
    print(f"\n--- n8n WEBHOOK TRIGGERED ---")
    print(f"[trigger-chaos] Sending 14k req/s anomaly log to n8n webhook...")
    await asyncio.sleep(1) # simulate network call to n8n
    print(f"[n8n-Workflow] Claude 3.7 analyzing payload...")
    await asyncio.sleep(2) # simulate Claude inference
    print(f"[n8n-Workflow] Mitigation generated. Executing Cloudflare API block...")
    await asyncio.sleep(1) # simulate HTTP request to CF
    print(f"[n8n-Workflow] IP blocked successfully. Returning mitigation payload.\n")
    
    return InsightResponse(
        status="success",
        message="n8n Mitigation Deployed",
        data={
            "action": "Cloudflare WAF Block",
            "target": "US-East Edge",
            "reason": "14k spike in unauthorized access attempts",
            "latency": "4s"
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("insights_api:app", host="0.0.0.0", port=8000, reload=True)
