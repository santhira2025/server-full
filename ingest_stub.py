from http.server import HTTPServer, BaseHTTPRequestHandler
import json, datetime

class IngestHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        batch = json.loads(body)
        events = batch.get('events', [])
        print(f"[{datetime.datetime.now().isoformat()}] Received {len(events)} events")
        for ev in events[:3]:
            req = ev.get('request', {})
            resp = ev.get('response', {})
            print(f"  {ev.get('protocol')} {req.get('method')} {req.get('host','')}{req.get('path')} → {resp.get('status_code')} ({resp.get('latency_ms',0)}ms)")
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def log_message(self, *args):
        pass

if __name__ == '__main__':
    print("Ingest stub listening on :9999")
    HTTPServer(('0.0.0.0', 9999), IngestHandler).serve_forever()
