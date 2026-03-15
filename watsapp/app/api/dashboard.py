"""
Dashboard API Routes - Powers the real-time business owner dashboard.
Provides metrics, conversation lists, and live chat views.
"""

import logging
from passlib.context import CryptContext
from datetime import datetime, timedelta
from jose import jwt, JWTError
from fastapi import APIRouter, Request, HTTPException, Depends, WebSocket, WebSocketDisconnect, Response, Cookie
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.core.config import get_settings
from app.services.database import db
from app.services.whatsapp_service import whatsapp
from app.models.schemas import MessageDirection
from app.services.whatsapp_service import whatsapp
from app.services.websocket import ws_manager

settings = get_settings()
logger = logging.getLogger(__name__)
router = APIRouter()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

templates = Jinja2Templates(directory="dashboard/templates")

# ------------------------------------------
# Auth Utilities
# ------------------------------------------

COOKIE_NAME = "dashboard_session"

def create_access_token(user_id: str):
    expire = datetime.utcnow() + timedelta(days=7)
    to_encode = {"exp": expire, "sub": str(user_id)}
    return jwt.encode(to_encode, settings.app_secret_key, algorithm="HS256")

async def get_current_user(request: Request):
    """Dependency to verify dashboard session."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.app_secret_key, algorithms=["HS256"])
        user_id = payload.get("sub")
        if user_id:
            return user_id
    except JWTError:
        pass
    return None

async def auth_required(user: str = Depends(get_current_user)):
    """Strong dependency for protected pages."""
    if not user:
        return RedirectResponse(url="/dashboard/login", status_code=303)
    return user

# ------------------------------------------
# Login Routes
# ------------------------------------------

@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {
        "request": request,
        "business_name": settings.business_name
    })

@router.post("/login")
async def login_post(request: Request, response: Response):
    body = await request.json()
    email = body.get("email") # Client should be updated to send email
    password = body.get("password")
    
    # Check database for user
    user = db.get_user_by_email(email)
    if user and pwd_context.verify(password, user["password_hash"]):
        token = create_access_token(user["id"])
        response.set_cookie(
            key=COOKIE_NAME,
            value=token,
            httponly=True,
            max_age=604800, # 7 days
            samesite="lax",
            secure=settings.app_env == "production"
        )
        return {"status": "ok"}
    
    raise HTTPException(status_code=401, detail="Invalid email or password")

@router.get("/signup", response_class=HTMLResponse)
async def signup_page(request: Request):
    return templates.TemplateResponse("signup.html", {
        "request": request,
        "business_name": settings.business_name
    })

@router.post("/signup")
async def signup_post(request: Request, response: Response):
    body = await request.json()
    email = body.get("email")
    password = body.get("password")
    business_name = body.get("business_name")
    
    if not email or not password or not business_name:
        raise HTTPException(status_code=400, detail="Missing required fields")
    
    # Check if user exists
    if db.get_user_by_email(email):
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    hashed_pwd = pwd_context.hash(password)
    user = db.create_user(email, hashed_pwd, business_name)
    
    # Auto-login
    token = create_access_token(user["id"])
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        max_age=604800,
        samesite="lax",
        secure=settings.app_env == "production"
    )
    return {"status": "ok", "user_id": user["id"]}

@router.get("/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return RedirectResponse(url="/dashboard/login")

# ------------------------------------------
# Dashboard Pages (Protected)
# ------------------------------------------

@router.get("/", response_class=HTMLResponse)
async def dashboard_home(request: Request, user: str = Depends(auth_required)):
    """Main dashboard view with all metrics and conversation list."""
    if isinstance(user, RedirectResponse): return user
    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "business_name": settings.business_name,
    })


@router.get("/chat/{phone_number}", response_class=HTMLResponse)
async def chat_view(request: Request, phone_number: str, user: str = Depends(auth_required)):
    """View full conversation thread for a specific contact."""
    if isinstance(user, RedirectResponse): return user
    return templates.TemplateResponse("chat.html", {
        "request": request,
        "phone_number": phone_number,
        "business_name": settings.business_name,
    })


# ------------------------------------------
# Dashboard API (JSON)
# ------------------------------------------

async def auth_required_api(user: str = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user

@router.get("/api/metrics", dependencies=[Depends(auth_required_api)])
async def get_metrics(user_id: str = Depends(get_current_user)):
    """Get all dashboard metrics for charts and KPIs."""
    try:
        metrics = db.get_dashboard_metrics(user_id)
        return {"status": "ok", "data": metrics}
    except Exception as e:
        logger.error(f"Metrics error: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/api/conversations", dependencies=[Depends(auth_required_api)])
async def get_conversations(limit: int = 50, user_id: str = Depends(get_current_user)):
    """Get all conversations sorted by most recent activity."""
    try:
        conversations = db.get_all_conversations(user_id, limit=limit)
        return {"status": "ok", "data": conversations}
    except Exception as e:
        logger.error(f"Conversations error: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/api/conversations/{phone_number}/messages", dependencies=[Depends(auth_required_api)])
async def get_messages(phone_number: str, limit: int = 50, user_id: str = Depends(get_current_user)):
    """Get full message history for a conversation."""
    try:
        messages = db.get_conversation_history(phone_number, user_id=user_id, limit=limit)
        conversation = db._execute_one(
            "SELECT * FROM conversations WHERE user_id = %s AND phone_number = %s",
            (user_id, phone_number)
        )
        return {"status": "ok", "messages": messages, "conversation": db._serialize(conversation) if conversation else {}}
    except Exception as e:
        logger.error(f"Messages error: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/api/activity", dependencies=[Depends(auth_required_api)])
async def get_recent_activity(limit: int = 20, user_id: str = Depends(get_current_user)):
    """Get recent message activity across all conversations for this user."""
    try:
        # We need a new DB method or a filtered query here
        rows = db._execute("""
            SELECT m.* FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            WHERE c.user_id = %s
            ORDER BY m.timestamp DESC LIMIT %s
        """, (user_id, limit))
        activity = [db._serialize(r) for r in rows]
        return {"status": "ok", "data": activity}
    except Exception as e:
        logger.error(f"Activity error: {e}")
        return {"status": "error", "message": str(e)}


@router.post("/api/send-message", dependencies=[Depends(auth_required_api)])
async def manual_send(request: Request, user_id: str = Depends(get_current_user)):
    """Allow business owner to send a manual message from dashboard."""
    try:
        body = await request.json()
        phone = body.get("phone_number")
        text = body.get("message")
        
        # 1. Verify this conversation belongs to the user
        convo = db.get_or_create_conversation(phone, user_id=user_id)
        
        # 2. Send via WhatsApp
        await whatsapp.send_text_message(phone, text)
        
        # 3. Save to DB
        db.save_message(
            conversation_id=convo["id"],
            phone_number=phone,
            direction=MessageDirection.OUTBOUND,
            content=text,
            intent="manual_reply"
        )
        
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Manual send error: {e}")
        return {"status": "error", "message": str(e)}

# ------------------------------------------
# WebSockets for Real-Time Dashboard Updates
# ------------------------------------------

@router.websocket("/ws")
async def websocket_dashboard(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # We don't expect much incoming data from dashboard except maybe pings.
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

# ------------------------------------------
# Human Takeover APIs
# ------------------------------------------

@router.post("/api/conversations/{phone_number}/pause", dependencies=[Depends(auth_required_api)])
async def pause_ai_routing(phone_number: str, user_id: str = Depends(get_current_user)):
    """Pause the AI from automatically responding to this customer."""
    try:
        db.update_conversation(phone_number, user_id, {"is_paused": True})
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Pause error: {e}")
        raise HTTPException(500, str(e))

@router.post("/api/conversations/{phone_number}/resume", dependencies=[Depends(auth_required_api)])
async def resume_ai_routing(phone_number: str, user_id: str = Depends(get_current_user)):
    """Resume automatic AI responses for this customer."""
    try:
        db.update_conversation(phone_number, user_id, {"is_paused": False})
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Resume error: {e}")
        raise HTTPException(500, str(e))
