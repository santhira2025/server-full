import json
import asyncio
from mitmproxy import http
from server.config import settings
from .har_converter import HARConverter
from .deduplication import RequestDeduplicator
from server.modules.api_inventory.endpoint_discovery import EndpointDiscoveryService
from server.modules.vulnerability_detector.pii_scanner import PIIScanner
from server.modules.persistence.database import AsyncSessionLocal

class MitmproxyAddon:
    """
    mitmproxy addon that intercepts flows, normalizes them, 
    and passes them to the API inventory and anomaly detection modules.
    """
    def __init__(self):
        self.converter = HARConverter()
        self.deduplicator = RequestDeduplicator()
        self.discovery = EndpointDiscoveryService()
        self.pii_scanner = PIIScanner()

    async def request(self, flow: http.HTTPFlow) -> None:
        """Called when a request is received."""
        # Optional: Preliminary filtering: e.g., if we only want JSON
        pass

    async def response(self, flow: http.HTTPFlow) -> None:
        """Called when a response is received."""
        # 1. Normalize the flow into HAR format
        entry = self.converter.flow_to_har_entry(flow)
        
        # 2. Extract key components for deduplication
        fingerprint = self.deduplicator.get_fingerprint(flow.request)
        if self.deduplicator.is_duplicate(fingerprint):
            return
            
        # 3. Process the entry (Inventory + PII + Anomalies)
        await self.process_entry(entry)

    async def process_entry(self, entry: dict):
        """
        Updates the inventory and scans for security issues.
        """
        async with AsyncSessionLocal() as db:
            # 1. API Discovery (updates api_endpoints table)
            await self.discovery.process_har_entry(entry, db)
            
            # 2. PII Detection
            findings = self.pii_scanner.scan_har_entry(entry)
            if findings:
                print(f"PII LEAK FOUND: {len(findings)} issues on {entry['request']['url']}")
                # In production, these would be saved to a 'pii_findings' table.
                # For now, we're printing to the console to confirm detection.

            # 3. Log capture
            print(f"Captured/Indexed: {entry['request']['method']} {entry['request']['url']}")

addons = [
    MitmproxyAddon()
]
