#!/usr/bin/env python3
"""APISentinel Dashboard Server — serves HTML dashboard + proxies /api/metrics from sensor."""

import http.server
import urllib.request
import os
import sys

METRICS_URL = "http://localhost:9091/metrics"
HEALTHZ_URL = "http://localhost:9091/healthz"
DASHBOARD_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboard.html")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


class DashboardHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/" or self.path == "/dashboard":
            self.serve_file(DASHBOARD_PATH, "text/html")
        elif self.path == "/api/metrics":
            self.proxy(METRICS_URL, "text/plain")
        elif self.path == "/api/healthz":
            self.proxy(HEALTHZ_URL, "application/json")
        else:
            self.send_error(404)

    def serve_file(self, path, content_type):
        try:
            with open(path, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except FileNotFoundError:
            self.send_error(404, "Dashboard HTML not found")

    def proxy(self, url, content_type):
        try:
            with urllib.request.urlopen(url, timeout=3) as resp:
                data = resp.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(f"Sensor unreachable: {e}".encode())

    def log_message(self, fmt, *args):
        pass  # suppress request logs


if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", PORT), DashboardHandler)
    print(f"\n  APISentinel Dashboard running on http://0.0.0.0:{PORT}")
    print(f"  Open in your browser: http://<your-vps-ip>:{PORT}\n", flush=True)
    server.serve_forever()
