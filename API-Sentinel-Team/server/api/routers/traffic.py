"""
Traffic ingestion endpoints:
- HAR file upload → endpoint discovery + sample data storage
- Postman collection import → endpoint discovery
- OpenAPI spec export from discovered endpoints
- mitmproxy status
- Sample data CRUD
- Nginx/Apache access log upload → endpoint discovery + realtime logs + threat detection
"""
import json
import re
import uuid
import datetime
from urllib.parse import urlparse, unquote
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from server.modules.persistence.database import get_db
from server.modules.traffic_capture.sample_data_writer import SampleDataWriter
from server.modules.parsers.postman import PostmanParser
from server.modules.api_inventory.openapi_generator import OpenAPIGenerator
from server.modules.cache.redis_cache import bump_cache_version
from server.models.core import (
    APIEndpoint, SampleData, RequestLog,
    MaliciousEventRecord, MaliciousEvent, ThreatActor, WAFEvent,
)

ACCOUNT_ID = 1000000

# ── Nginx/Apache combined log pattern ────────────────────────────────────────
# 1.2.3.4 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326 "ref" "UA"
_LOG_RE = re.compile(
    r'(?P<ip>\S+)\s+\S+\s+\S+\s+'
    r'\[(?P<time>[^\]]+)\]\s+'
    r'"(?P<method>[A-Z]+)\s+(?P<path>\S+)\s+HTTP/[^"]+"\s+'
    r'(?P<status>\d{3})\s+(?P<bytes>\S+)'
    r'(?:\s+"(?P<referer>[^"]*)"\s+"(?P<ua>[^"]*)")?'
)
_LOG_TIME_FMT = "%d/%b/%Y:%H:%M:%S %z"

# ── Attack signature patterns ─────────────────────────────────────────────────
_ATTACK_SIGNATURES = [
    (re.compile(r"(union\s+select|select\s+.*from|insert\s+into|drop\s+table|'.*or\s+'1'='1|;--)", re.I),
     "SQL Injection", "HIGH"),
    (re.compile(r"(<script|javascript:|onerror\s*=|onload\s*=|alert\s*\(|<iframe)", re.I),
     "XSS", "HIGH"),
    (re.compile(r"(\.\./|\.\.%2f|%2e%2e/|/etc/passwd|/etc/shadow|/proc/self)", re.I),
     "Path Traversal", "CRITICAL"),
    (re.compile(r"(;\s*(ls|cat|whoami|id|wget|curl|bash|sh)\b|&&|\|\s*(cat|ls|id))", re.I),
     "Command Injection", "CRITICAL"),
    (re.compile(r"(\bexec\b|\beval\b|base64_decode|system\s*\(|passthru\s*\()", re.I),
     "Code Injection", "CRITICAL"),
    (re.compile(r"(\bscanner\b|nikto|nmap|sqlmap|dirbuster|gobuster|nuclei)", re.I),
     "Scanning Tool", "MEDIUM"),
    (re.compile(r"(wp-admin|phpMyAdmin|\.env|\.git/config|web\.config|\.htaccess)", re.I),
     "Sensitive File Access", "HIGH"),
]


def _detect_attacks(path: str, ua: str) -> list[tuple[str, str]]:
    """Return list of (category, severity) for any signatures matched."""
    target = unquote(path) + " " + (ua or "")
    found = []
    for pattern, category, severity in _ATTACK_SIGNATURES:
        if pattern.search(target):
            found.append((category, severity))
    return found


def _parse_nginx_log(text: str) -> list[dict]:
    entries = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        m = _LOG_RE.match(line)
        if not m:
            continue
        try:
            ts = datetime.datetime.strptime(m.group("time"), _LOG_TIME_FMT)
        except Exception:
            ts = datetime.datetime.utcnow()
        entries.append({
            "ip": m.group("ip"),
            "ts": ts,
            "method": m.group("method"),
            "path": m.group("path"),
            "status": int(m.group("status")),
            "bytes": m.group("bytes"),
            "referer": m.group("referer") or "",
            "ua": m.group("ua") or "",
        })
    return entries

router = APIRouter()
_writer = SampleDataWriter()
_openapi_gen = OpenAPIGenerator()


def _parse_har(har_data: dict) -> list[dict]:
    """Extract request/response pairs from HAR log entries."""
    entries = har_data.get("log", {}).get("entries", [])
    pairs = []
    for entry in entries:
        req = entry.get("request", {})
        resp = entry.get("response", {})
        url = req.get("url", "")
        method = req.get("method", "GET")
        headers = {h["name"]: h["value"] for h in req.get("headers", [])}
        body_text = req.get("postData", {}).get("text", "") if req.get("postData") else ""
        try:
            body = json.loads(body_text) if body_text else {}
        except Exception:
            body = {"raw": body_text}

        resp_body_text = resp.get("content", {}).get("text", "")
        try:
            resp_body = json.loads(resp_body_text) if resp_body_text else {}
        except Exception:
            resp_body = {"raw": resp_body_text}

        pairs.append({
            "url": url,
            "method": method,
            "request": {"url": url, "method": method, "headers": headers, "body": body},
            "response": {"status": resp.get("status", 200), "body": resp_body},
        })
    return pairs


@router.post("/har/upload")
async def upload_har(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """Upload a HAR file to discover endpoints and store sample traffic."""
    content = await file.read()
    try:
        har = json.loads(content)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid HAR JSON")

    pairs = _parse_har(har)
    discovered = 0
    saved_samples = 0

    for pair in pairs:
        url = pair["url"]
        method = pair["method"]

        # Parse host/path from URL
        try:
            parsed = urlparse(url)
            host = parsed.netloc
            path = parsed.path or "/"
            protocol = parsed.scheme or "http"
            port = parsed.port or (443 if protocol == "https" else 80)
        except Exception:
            continue

        # Find or create endpoint
        result = await db.execute(
            select(APIEndpoint).where(
                APIEndpoint.host == host,
                APIEndpoint.path == path,
                APIEndpoint.method == method,
            )
        )
        ep = result.scalar_one_or_none()
        if not ep:
            ep = APIEndpoint(
                id=str(uuid.uuid4()),
                method=method, path=path, host=host,
                protocol=protocol, port=port,
                last_response_code=pair["response"].get("status", 200),
            )
            db.add(ep)
            await db.flush()
            discovered += 1

        # Save sample data
        await _writer.save(ep.id, pair["request"], pair["response"], db)
        saved_samples += 1

    await db.commit()
    await bump_cache_version(ACCOUNT_ID)
    return {
        "status": "ok",
        "entries_processed": len(pairs),
        "endpoints_discovered": discovered,
        "samples_saved": saved_samples,
    }


@router.get("/samples")
async def list_samples(endpoint_id: str = None, limit: int = 50, db: AsyncSession = Depends(get_db)):
    """List captured traffic samples."""
    query = select(SampleData).limit(limit)
    if endpoint_id:
        query = query.where(SampleData.endpoint_id == endpoint_id)
    result = await db.execute(query)
    samples = result.scalars().all()
    return {
        "total": len(samples),
        "samples": [
            {"id": s.id, "endpoint_id": s.endpoint_id,
             "request": s.request, "response": s.response,
             "created_at": str(s.created_at)}
            for s in samples
        ],
    }


@router.post("/import/postman")
async def import_postman(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """Import a Postman collection JSON to discover endpoints and sample data."""
    content = await file.read()
    try:
        parser = PostmanParser(content.decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Postman JSON: {e}")

    items = parser.fetch_apis_recursively()
    discovered = 0
    saved_samples = 0

    for item in items:
        try:
            endpoint_meta, sample = parser.convert_to_akto_format(item)
        except Exception:
            continue

        raw_url = endpoint_meta.get("path", "/")
        try:
            parsed = urlparse(raw_url)
            host = parsed.netloc or "unknown"
            path = parsed.path or "/"
            protocol = parsed.scheme or "http"
            port = parsed.port or (443 if protocol == "https" else 80)
        except Exception:
            host, path, protocol, port = "unknown", raw_url, "http", 80

        method = endpoint_meta.get("method", "GET")
        result = await db.execute(
            select(APIEndpoint).where(
                APIEndpoint.host == host,
                APIEndpoint.path == path,
                APIEndpoint.method == method,
            )
        )
        ep = result.scalar_one_or_none()
        if not ep:
            ep = APIEndpoint(
                id=str(uuid.uuid4()),
                method=method, path=path, host=host,
                protocol=protocol, port=port,
            )
            db.add(ep)
            await db.flush()
            discovered += 1

        if sample:
            await _writer.save(ep.id, sample["request"], sample["response"], db)
            saved_samples += 1

    await db.commit()
    await bump_cache_version(ACCOUNT_ID)
    return {
        "status": "ok",
        "requests_parsed": len(items),
        "endpoints_discovered": discovered,
        "samples_saved": saved_samples,
    }


@router.get("/openapi")
async def export_openapi(collection_name: str = Query("Discovered API")):
    """Export an OpenAPI 3.0 spec generated from all discovered endpoints."""
    spec = await _openapi_gen.generate_spec(collection_name, account_id=ACCOUNT_ID)
    return spec


@router.get("/status")
async def traffic_capture_status():
    """Returns traffic capture status (mitmproxy / HAR ingestion mode)."""
    return {
        "mode": "har_upload",
        "mitmproxy": {"running": False, "note": "Use HAR upload or configure mitmproxy externally"},
        "har_upload_endpoint": "/api/traffic/har/upload",
        "postman_import_endpoint": "/api/traffic/import/postman",
        "openapi_export_endpoint": "/api/traffic/openapi",
        "nginx_log_endpoint": "/api/traffic/import/nginx-log",
    }


@router.post("/import/nginx-log")
async def import_nginx_log(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """
    Upload a Nginx or Apache combined-format access log file.
    Each line is parsed and stored as:
      - APIEndpoint (endpoint discovery)
      - RequestLog  (realtime traffic)
      - ThreatActor + MaliciousEvent + MaliciousEventRecord + WAFEvent  (if attack detected)
    """
    content = await file.read()
    try:
        text = content.decode("utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot decode file: {e}")

    entries = _parse_nginx_log(text)
    if not entries:
        raise HTTPException(status_code=400, detail="No valid log lines found. Expected nginx/apache combined log format.")

    stats = {"lines": len(entries), "endpoints_discovered": 0, "request_logs": 0, "threats_detected": 0, "waf_events": 0}

    # Cache endpoints in-memory to avoid repeated DB queries per line
    ep_cache: dict[str, str] = {}  # "METHOD:host:path" -> endpoint_id

    for entry in entries:
        raw_path = entry["path"]
        # Strip query string for endpoint key; keep for analysis
        parsed_path = urlparse(raw_path)
        clean_path = parsed_path.path or "/"
        host = "unknown"
        method = entry["method"]
        ep_key = f"{method}:{host}:{clean_path}"

        # ── Endpoint discovery ────────────────────────────────────────────
        if ep_key not in ep_cache:
            result = await db.execute(
                select(APIEndpoint).where(
                    APIEndpoint.method == method,
                    APIEndpoint.path == clean_path,
                    APIEndpoint.host == host,
                    APIEndpoint.account_id == ACCOUNT_ID,
                )
            )
            ep = result.scalar_one_or_none()
            if not ep:
                ep = APIEndpoint(
                    id=str(uuid.uuid4()),
                    account_id=ACCOUNT_ID,
                    method=method,
                    path=clean_path,
                    host=host,
                    protocol="http",
                    port=80,
                    last_response_code=entry["status"],
                    last_seen=entry["ts"],
                )
                db.add(ep)
                await db.flush()
                stats["endpoints_discovered"] += 1
            ep_cache[ep_key] = ep.id

        ep_id = ep_cache[ep_key]

        # ── Request log ───────────────────────────────────────────────────
        req_log = RequestLog(
            id=str(uuid.uuid4()),
            endpoint_id=ep_id,
            source_ip=entry["ip"],
            method=method,
            path=raw_path,
            response_code=entry["status"],
            created_at=entry["ts"],
        )
        db.add(req_log)
        stats["request_logs"] += 1

        # ── Attack detection ──────────────────────────────────────────────
        attacks = _detect_attacks(raw_path, entry["ua"])
        if attacks:
            # Upsert ThreatActor by IP
            actor_result = await db.execute(
                select(ThreatActor).where(ThreatActor.source_ip == entry["ip"])
            )
            actor = actor_result.scalar_one_or_none()
            if not actor:
                actor = ThreatActor(
                    id=str(uuid.uuid4()),
                    source_ip=entry["ip"],
                    status="MONITORING",
                    event_count=0,
                    risk_score=0.0,
                    last_seen=entry["ts"],
                )
                db.add(actor)
                await db.flush()

            for category, severity in attacks:
                # MaliciousEvent (lightweight, used by threat actor timeline)
                mal_ev = MaliciousEvent(
                    id=str(uuid.uuid4()),
                    actor_id=actor.id,
                    event_type=category.replace(" ", "_").upper(),
                    severity=severity,
                    detected_at=entry["ts"],
                )
                db.add(mal_ev)

                # MaliciousEventRecord (full-fidelity, shown in security events)
                rec = MaliciousEventRecord(
                    id=str(uuid.uuid4()),
                    account_id=ACCOUNT_ID,
                    actor=entry["ip"],
                    ip=entry["ip"],
                    url=raw_path,
                    method=method,
                    host=host,
                    category=category,
                    severity=severity,
                    detected_at=int(entry["ts"].timestamp() * 1000),
                    status="OPEN",
                    event_type="EVENT_TYPE_SINGLE",
                    context_source="API",
                )
                db.add(rec)

                # WAFEvent
                waf = WAFEvent(
                    id=str(uuid.uuid4()),
                    source_ip=entry["ip"],
                    endpoint_id=ep_id,
                    rule_id=f"NGINX-{category.replace(' ', '-').upper()}",
                    action="LOGGED",
                    method=method,
                    path=raw_path,
                    payload_snippet=raw_path[:500],
                    severity=severity,
                    created_at=entry["ts"],
                )
                db.add(waf)
                stats["waf_events"] += 1
                stats["threats_detected"] += 1

            actor.event_count = (actor.event_count or 0) + len(attacks)
            actor.risk_score = min(10.0, (actor.risk_score or 0.0) + len(attacks) * 0.5)
            actor.last_seen = entry["ts"]

    await db.commit()
    await bump_cache_version(ACCOUNT_ID)
    return {
        "status": "ok",
        **stats,
        "message": (
            f"Processed {stats['lines']} log lines: "
            f"{stats['endpoints_discovered']} new endpoints, "
            f"{stats['request_logs']} request logs, "
            f"{stats['threats_detected']} threats detected."
        ),
    }
