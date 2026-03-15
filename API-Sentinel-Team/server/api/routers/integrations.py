"""
Third-party integrations — CRUD + test + fire events + Postman/Burp import.
Supports: Slack, Jira, Splunk, Datadog, Azure Boards, PagerDuty, Webhook, BigQuery.
"""
import json
import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete

from server.modules.persistence.database import get_db
from server.models.core import Integration
from server.modules.auth.rbac import RBAC
from server.modules.integrations.slack_client import SlackClient
from server.modules.integrations.jira_client import JiraClient
from server.modules.integrations.splunk_client import SplunkClient
from server.modules.integrations.datadog_client import DatadogClient
from server.modules.integrations.azure_boards_client import AzureBoardsClient
from server.modules.integrations.pagerduty_client import PagerDutyClient
from server.modules.integrations.webhook_client import WebhookClient
from server.modules.integrations.sentinel_client import SentinelClient
from server.modules.integrations.qradar_client import QRadarClient
from server.modules.integrations.elastic_client import ElasticClient
from server.modules.integrations.chronicle_client import ChronicleClient
from server.modules.integrations.dispatcher import dispatch_event
from server.modules.integrations.postman_importer import PostmanImporter
from server.modules.integrations.burp_importer import BurpImporter
import logging

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Integrations"])

SUPPORTED_TYPES = {
    "slack", "jira", "splunk", "datadog", "azure_boards", "pagerduty", "webhook", "bigquery",
    "sentinel", "qradar", "elastic", "chronicle",
}


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("/")
async def list_integrations(
    request: Request,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth)
):
    account_id = payload.get("account_id")
    result = await db.execute(select(Integration).where(Integration.account_id == account_id))
    items = result.scalars().all()
    return {"total": len(items), "integrations": [
        {"id": i.id, "type": i.type, "name": i.name, "enabled": i.enabled,
         "events": i.events, "created_at": i.created_at}
        for i in items
    ]}


@router.post("/")
async def create_integration(
    type: str = Body(...), name: str = Body(...),
    config: dict = Body(...),
    events: List[str] = Body(default=["vulnerability_found", "test_complete"]),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth)
):
    account_id = payload.get("account_id")
    """
    Config schemas per type:
    - slack:        {"webhook_url": "https://hooks.slack.com/..."}
    - jira:         {"base_url": "...", "email": "...", "api_token": "...", "project_key": "SEC"}
    - splunk:       {"hec_url": "...", "hec_token": "...", "index": "main"}
    - datadog:      {"api_key": "...", "app_key": "...", "site": "datadoghq.com"}
    - azure_boards: {"organization": "...", "project": "...", "personal_access_token": "..."}
    - pagerduty:    {"routing_key": "..."}
    - webhook:      {"url": "...", "secret": "...", "method": "POST"}
    - bigquery:     {"project_id": "...", "dataset_id": "...", "credentials_json": {...}}
    - sentinel:     {"endpoint_url": "...", "headers": {"x-api-key": "..."}}
    - qradar:       {"endpoint_url": "...", "format": "LEEF|JSON"}
    - elastic:      {"endpoint_url": "...", "api_key": "..."}
    - chronicle:    {"endpoint_url": "...", "api_key": "..."}
    """
    if type not in SUPPORTED_TYPES:
        raise HTTPException(400, f"Unsupported type. Supported: {sorted(SUPPORTED_TYPES)}")
    integration = Integration(id=str(uuid.uuid4()), account_id=account_id, type=type,
                              name=name, config=config, events=events, enabled=True)
    db.add(integration)
    await db.commit()
    await db.refresh(integration)
    return {"id": integration.id, "type": type, "name": name, "status": "created"}


@router.get("/{integration_id}")
async def get_integration(
    integration_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth)
):
    account_id = payload.get("account_id")
    result = await db.execute(select(Integration).where(
        Integration.id == integration_id,
        Integration.account_id == account_id
    ))
    i = result.scalar_one_or_none()
    if not i:
        raise HTTPException(404, "Integration not found")
    return {"id": i.id, "type": i.type, "name": i.name, "enabled": i.enabled,
            "events": i.events, "created_at": i.created_at}


@router.patch("/{integration_id}")
async def update_integration(
    integration_id: str,
    enabled: Optional[bool] = Body(None),
    config: Optional[dict] = Body(None),
    events: Optional[List[str]] = Body(None),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth)
):
    account_id = payload.get("account_id")
    updates = {}
    if enabled is not None: updates["enabled"] = enabled
    if config is not None:  updates["config"] = config
    if events is not None:  updates["events"] = events
    if not updates:
        raise HTTPException(400, "No updates provided")
    result = await db.execute(update(Integration).where(
        Integration.id == integration_id,
        Integration.account_id == account_id
    ).values(**updates))
    if result.rowcount == 0:
        raise HTTPException(404, "Integration not found")
    await db.commit()
    return {"integration_id": integration_id, "updated": list(updates.keys())}


@router.delete("/{integration_id}")
async def delete_integration(
    integration_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth)
):
    account_id = payload.get("account_id")
    result = await db.execute(delete(Integration).where(
        Integration.id == integration_id,
        Integration.account_id == account_id
    ))
    if result.rowcount == 0:
        raise HTTPException(404, "Integration not found")
    await db.commit()
    return {"deleted": integration_id}


# ── Test / ping ────────────────────────────────────────────────────────────────

@router.post("/{integration_id}/test")
async def test_integration(
    integration_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth)
):
    """Send a test event to verify the integration configuration works."""
    account_id = payload.get("account_id")
    result = await db.execute(select(Integration).where(
        Integration.id == integration_id,
        Integration.account_id == account_id
    ))
    i = result.scalar_one_or_none()
    if not i:
        raise HTTPException(404, "Integration not found")

    cfg = i.config or {}
    ok, detail = False, ""

    if i.type == "slack":
        client = SlackClient(cfg.get("webhook_url", ""))
        ok = await client.send_alert("Test Alert", "Integration test from API Security Engine", "LOW")
        detail = "Slack test message sent" if ok else "Failed — check webhook_url"

    elif i.type == "jira":
        client = JiraClient(cfg.get("base_url", ""), cfg.get("email", ""), cfg.get("api_token", ""))
        ticket = await client.create_issue(cfg.get("project_key", "SEC"),
                                           "API Security Engine - Test", "Connectivity test", "Task")
        ok = ticket is not None
        detail = f"Jira issue created: {ticket}" if ok else "Failed — check credentials"

    elif i.type == "splunk":
        client = SplunkClient(cfg.get("hec_url", ""), cfg.get("hec_token", ""), cfg.get("index", "main"))
        ok = await client.send_event({"message": "Integration test", "source": "api-security-engine"})
        detail = "Splunk HEC event sent" if ok else "Failed — check hec_url and hec_token"

    elif i.type == "datadog":
        client = DatadogClient(cfg.get("api_key", ""), cfg.get("app_key", ""), cfg.get("site", "datadoghq.com"))
        ok = await client.send_event("API Security Engine Test", "Integration connectivity test", alert_type="info")
        detail = "Datadog event sent" if ok else "Failed — check api_key"

    elif i.type == "azure_boards":
        client = AzureBoardsClient(cfg.get("organization", ""), cfg.get("project", ""),
                                   cfg.get("personal_access_token", ""))
        item_id = await client.create_bug("API Security Engine - Test", "Connectivity test", severity="LOW")
        ok = item_id is not None
        detail = f"Work item created: {item_id}" if ok else "Failed — check org/project/PAT"

    elif i.type == "pagerduty":
        client = PagerDutyClient(cfg.get("routing_key", ""))
        dedup = await client.trigger("API Security Engine - Test", severity="info",
                                     custom_details={"test": True})
        ok = dedup is not None
        detail = f"PagerDuty incident triggered: {dedup}" if ok else "Failed — check routing_key"

    elif i.type == "webhook":
        client = WebhookClient(cfg.get("url", ""), secret=cfg.get("secret", ""),
                               method=cfg.get("method", "POST"))
        ok = await client.send({"test": True, "source": "api-security-engine"}, event_type="test")
        detail = "Webhook delivered" if ok else "Failed — check url"

    elif i.type == "bigquery":
        from server.modules.integrations.bigquery_client import BigQueryClient
        client = BigQueryClient(cfg.get("project_id", ""), cfg.get("dataset_id", ""),
                                cfg.get("credentials_json"))
        ok = client.is_available()
        detail = "BigQuery client ready" if ok else "Unavailable — install google-cloud-bigquery or check credentials"
    elif i.type == "sentinel":
        ok = await SentinelClient(cfg.get("endpoint_url", ""), cfg.get("headers")).send_event({"test": True})
        detail = "Sentinel event delivered" if ok else "Failed — check endpoint_url"
    elif i.type == "qradar":
        ok = await QRadarClient(cfg.get("endpoint_url", ""), cfg.get("format", "LEEF")).send_event({"test": True})
        detail = "QRadar event delivered" if ok else "Failed — check endpoint_url"
    elif i.type == "elastic":
        ok = await ElasticClient(cfg.get("endpoint_url", ""), cfg.get("api_key", "")).send_event({"test": True})
        detail = "Elastic event delivered" if ok else "Failed — check endpoint_url/api_key"
    elif i.type == "chronicle":
        ok = await ChronicleClient(cfg.get("endpoint_url", ""), cfg.get("api_key", "")).send_event({"test": True})
        detail = "Chronicle event delivered" if ok else "Failed — check endpoint_url/api_key"

    return {"integration_id": integration_id, "type": i.type, "success": ok, "detail": detail}


# ── Import endpoints ───────────────────────────────────────────────────────────

@router.post("/import/postman")
async def import_postman(
    collection_file: UploadFile = File(...),
    collection_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth)
):
    """Upload Postman Collection v2.1 JSON to auto-discover API endpoints."""
    account_id = payload.get("account_id")
    try:
        content = await collection_file.read()
        data = json.loads(content)
    except Exception as e:
        raise HTTPException(400, f"Invalid JSON: {e}")

    endpoints_data = PostmanImporter.parse_collection(data, account_id=account_id, collection_id=collection_id)
    from server.models.core import APIEndpoint
    for ep_data in endpoints_data:
        db.add(APIEndpoint(id=str(uuid.uuid4()), **ep_data))
    await db.commit()
    return {"imported": len(endpoints_data), "source": "postman", "filename": collection_file.filename}


@router.post("/import/burp")
async def import_burp(
    burp_file: UploadFile = File(...),
    collection_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth)
):
    """Upload Burp Suite XML export to auto-discover endpoints and sample data."""
    try:
        content = await burp_file.read()
        xml_content = content.decode("utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(400, f"Invalid file: {e}")

    account_id = payload.get("account_id")
    parsed = BurpImporter.parse_xml(xml_content, account_id=account_id, collection_id=collection_id)
    from server.models.core import APIEndpoint, SampleData
    for ep_data in parsed["endpoints"]:
        db.add(APIEndpoint(id=str(uuid.uuid4()), **ep_data))
    for sd in parsed["sample_data"]:
        db.add(SampleData(id=str(uuid.uuid4()), request=sd["request"], response=sd["response"]))
    await db.commit()
    return {"endpoints_imported": len(parsed["endpoints"]),
            "samples_imported": len(parsed["sample_data"]), "source": "burp"}


# ── Utility: broadcast event to all subscribed integrations ───────────────────

async def fire_event(event_name: str, payload: dict, account_id: int, db: AsyncSession):
    """Call from other routers to notify enabled integrations subscribed to event_name."""
    await dispatch_event(event_name, payload, account_id, db)
