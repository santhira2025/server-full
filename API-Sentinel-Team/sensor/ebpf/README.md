# API-Sentinel-Sensor

A production-grade **eBPF-based TLS traffic capture sensor** for the API Sentinel platform. Intercepts encrypted HTTPS traffic at the kernel level using uprobes — no application changes required.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Linux Kernel (eBPF)                      │
│                                                             │
│  SSL_read/SSL_write uprobes  →  ring buffer  →  userspace  │
│  crypto/tls.(*Conn).Read/Write uprobes (Go TLS)            │
│  connect/accept kprobes (connection tracking)              │
└─────────────────────────────────────────────────────────────┘
          ↓ ring buffer events
┌─────────────────────────────────────────────────────────────┐
│              Rust Userspace Sensor (Tokio async)            │
│                                                             │
│  • Parse HTTP/1.1 + HTTP/2 (HPACK)                         │
│  • PII detection & redaction                               │
│  • Injection detection (SQLi, XSS, path traversal)         │
│  • Prometheus metrics (/metrics, /healthz)                  │
│  • Batch → gzip → POST to ingest endpoint                  │
└─────────────────────────────────────────────────────────────┘
          ↓ JSON over HTTP
┌──────────────┐
│  Ingest API  │  (cloud backend)
└──────────────┘
```

---

## Components

| Path | Description |
|------|-------------|
| `bpf/http_trace.bpf.c` | BPF kernel program — OpenSSL/Go TLS uprobes, connection kprobes, ring buffer |
| `userspace/src/main.rs` | Rust sensor — HTTP parsing, PII redaction, ingest shipping, Prometheus metrics |
| `Dockerfile.verify` | Ubuntu 24.04 build + verification image (clang, Rust, Go 1.21) |
| `scripts/root-verify.sh` | 9-check mechanical verification suite |
| `scripts/docker-entrypoint.sh` | Docker entrypoint — mounts bpffs/debugfs, runs verification |
| `scripts/verify_env.sh` | Kernel + TLS symbol sanity checks |
| `tests/` | Integration test servers (Go, Node, Python, WebSocket, MCP) |

---

## Requirements

- Linux kernel **5.8+** (kernel 6.8+ recommended, tested on 6.8.0)
- Root / `CAP_BPF`
- `clang`, `llvm`, `libbpf-dev`
- Rust stable (`cargo`)
- `bpftool` (from `linux-tools-common`)

---

## Build

```bash
cd sensor/ebpf
make
```

This compiles both the BPF object (`bpf/http_trace.bpf.o`) and the Rust sensor binary (`userspace/target/release/api-sec-sensor`).

---

## Run

```bash
sudo ./userspace/target/release/api-sec-sensor \
  --bpf ./bpf/http_trace.bpf.o \
  --ingest https://api.example.com/api/ingestion/v2/events \
  --api-key <token> \
  --account-id 1000000 \
  --role server \
  --tls-libs /usr/lib/x86_64-linux-gnu/libssl.so.3 \
  --discover-libs
```

### CLI Options

| Flag | Description |
|------|-------------|
| `--bpf <path>` | Path to compiled BPF object |
| `--ingest <url>` | Ingest endpoint URL |
| `--api-key <key>` | API authentication token |
| `--account-id <id>` | Account ID sent in event metadata |
| `--role client\|server` | Traffic role for event tagging |
| `--metrics-port <port>` | Prometheus metrics port (default: 9090) |
| `--tls-libs <path>` | Path to libssl shared library |
| `--discover-libs` | Auto-detect TLS libraries from `/proc/<pid>/maps` |
| `--go-tls` | Enable Go TLS interception via `crypto/tls` uprobes |
| `--pid <pid>` | Scope probes to a single process PID |

---

## TLS Interception

### OpenSSL / BoringSSL
Attaches uprobes to `SSL_read`, `SSL_write`, `SSL_read_ex`, `SSL_write_ex` in the target libssl shared library. Supports both shared library and statically linked BoringSSL (auto-detected via ELF symbol scan).

### Go TLS
Intercepts Go's `crypto/tls.(*Conn).Read` and `crypto/tls.(*Conn).Write` without needing `libssl`:

1. Scans `/proc/<pid>/maps` for executable segments
2. Identifies Go binary via buildinfo magic (`\xff Go buildinf:`)
3. Parses ELF symbol table to locate TLS function virtual addresses
4. Converts virtual addresses → file offsets via ELF PT_LOAD program headers
5. Disassembles with Capstone to find all RET instruction offsets
6. Attaches uprobes at function entry and every return point

Use `--go-tls --pid <go-server-pid>` to enable.

---

## HTTP/2 Support

Detects the HTTP/2 client preface (`PRI * HTTP/2.0`) and decodes headers using a built-in HPACK decoder (61 static entries + dynamic table). Emitted events include `protocol=HTTP/2` and `source=ebpf-grpc`.

---

## PII Detection & Redaction

The following patterns are detected and redacted before events are shipped:

| Type | Example raw | Redacted |
|------|------------|---------|
| Email | `alice@example.com` | `PII_EMAIL_*` |
| SSN | `123-45-6789` | `PII_SSN_*` |
| Credit card | `4111-1111-1111-1111` | `PII_CC_*` |
| Phone | `+1-800-555-1234` | `PII_PHONE_*` |
| AWS key | `AKIA...` | `PII_AWS_KEY_*` |
| JWT token | `eyJ...` | `PII_JWT_*` |

Applied to URL query parameters, request/response headers, and body fields.

---

## Injection Detection

Flags events with `has_injection: true` when the following are detected:

- **SQL injection**: `UNION SELECT`, `OR 1=1`, `DROP TABLE`, comment sequences
- **XSS**: `<script>`, `javascript:`, `onerror=`, `onload=`
- **Path traversal**: `../`, `%2e%2e%2f`

---

## Prometheus Metrics

Available at `http://localhost:9090/metrics`:

| Metric | Description |
|--------|-------------|
| `apisec_events_captured_total` | Total TLS events captured |
| `apisec_ringbuf_drops_total` | Ring buffer overflow drops |
| `apisec_uptime_seconds` | Sensor uptime in seconds |

Health check: `GET http://localhost:9090/healthz` → `{"status":"ok"}`

---

## Kubernetes Deployment

Deploy as a privileged DaemonSet with host PID namespace:

```yaml
securityContext:
  privileged: true
hostPID: true
```

Container enrichment maps PIDs to container names/namespaces via cgroups v1/v2 and optionally via the containerd CRI socket at `/run/containerd/containerd.sock` (override with `CRI_SOCKET` env var).

---

## Verification (Docker)

Run the full 9-check mechanical verification suite on any Linux host with Docker:

```bash
# Build the verification image (one time)
docker build -f Dockerfile.verify -t api-sentinel-verify .

# Run all checks
docker run --rm --privileged --network=host --pid=host \
  -v "$(pwd)":/sensor/ebpf \
  -v /sys/fs/bpf:/sys/fs/bpf \
  -v /sys/kernel/btf:/sys/kernel/btf:ro \
  -v /usr/lib/linux-tools/$(uname -r)/bpftool:/usr/sbin/bpftool:ro \
  api-sentinel-verify \
  bash /sensor/ebpf/scripts/docker-entrypoint.sh
```

### Checks Performed

| # | Check | What it validates |
|---|-------|------------------|
| 1 | BPF verifier | All BPF programs accepted by kernel verifier |
| 2 | Sensor startup | Binary loads, uprobes attach, ring buffer starts |
| 3 | Prometheus metrics | `/metrics` and `/healthz` respond correctly |
| 4 | OpenSSL capture | `SSL_read` uprobe captures real HTTPS traffic |
| 5 | Go TLS capture | `crypto/tls` uprobe captures Go HTTPS traffic |
| 6 | Ring buffer stress | 10,000 concurrent requests with < 1% drop rate |

### Expected Output

```
═══════════════════════════════════════════════════════════════
  APISentinel Sensor — Mechanical Verification Suite
═══════════════════════════════════════════════════════════════

[PASS] BPF verifier accepted all programs
[PASS] Sensor started and is running
[PASS] /metrics contains apisec_events_captured_total
[PASS] /metrics contains apisec_ringbuf_drops_total
[PASS] /metrics contains apisec_uptime_seconds
[PASS] /healthz returns {"status":"ok"}
[PASS] Events captured: 2 (OpenSSL uprobe working)
[PASS] Go TLS events captured (before=0 after=11)
[PASS] Ring buffer drops = 0 — perfect

═══════════════════════════════════════════════════════════════
  Results: 9 passed  •  0 failed
═══════════════════════════════════════════════════════════════
  ALL CHECKS PASSED — sensor is production ready
```

Skip individual checks:
```bash
# Skip stress test
bash scripts/docker-entrypoint.sh --skip-stress

# Skip Go TLS test
bash scripts/docker-entrypoint.sh --skip-gotls
```

---

## Validated Environment

| Component | Version |
|-----------|---------|
| Linux kernel | 6.8.0-101-generic |
| Ubuntu | 24.04 |
| OpenSSL | 3.x |
| Go | 1.21.13 |
| Rust | stable |
| bpftool | v7.4.0 |
| libbpf | 1.x |
