#!/bin/bash
cd /mnt/c/Users/ELCOT/OneDrive/Desktop/soc/sensor/ebpf/userspace

echo "Starting ingest stub..."
python3 - << 'PY' &
from http.server import HTTPServer, BaseHTTPRequestHandler
import json, datetime
class H(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(n)
        batch = json.loads(body)
        events = batch.get("events", [])
        print(f"[{datetime.datetime.now().isoformat()}] Received {len(events)} events")
        if events:
            ev = events[0]
            print("  Protocol:", ev.get("protocol"))
            print("  Method:", ev.get("request", {}).get("method"))
            print("  Path:", ev.get("request", {}).get("path"))
        self.send_response(200); self.end_headers()
        self.wfile.write(b'{"status":"ok"}')
    def log_message(self, *args): pass
print("Ingest stub listening on :9999")
HTTPServer(("0.0.0.0", 9999), H).serve_forever()
PY

sleep 2
echo "Starting sensor..."
sudo ./target/release/api-sec-sensor \
  --bpf /mnt/c/Users/ELCOT/OneDrive/Desktop/soc/sensor/ebpf/bpf/http_trace.bpf.o \
  --ingest http://localhost:9999/ingest \
  --api-key test-key \
  --account-id 1000000 \
  --role client \
  --tls-provider openssl \
  --tls-libs /usr/lib/x86_64-linux-gnu/libssl.so.3 2>&1 &

sleep 3
echo "Generating traffic..."
curl -s https://httpbin.org/get
echo ""
echo "Waiting for events..."
sleep 5
