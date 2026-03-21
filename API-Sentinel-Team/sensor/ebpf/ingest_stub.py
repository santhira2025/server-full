#!/usr/bin/env python3
"""Simple ingest stub that accepts POST requests from the sensor."""
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        self.rfile.read(n)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"ok":true}')
    def log_message(self, *a):
        pass

print("Ingest stub listening on :9999", flush=True)
HTTPServer(("0.0.0.0", 9999), Handler).serve_forever()
