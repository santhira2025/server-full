use std::collections::{HashMap, HashSet, VecDeque};
use std::hash::{Hash, Hasher};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use crate::container::ContainerResolver;
use crate::dns::DnsResolver;
use crate::grpc::decode_grpc_fields;
use crate::http::{extract_http_header, split_query, HttpMessage, HttpResponseParsed};
use crate::http2::{contains_http2_preface, parse_http2_frames, Http2HpackDecoder};
use crate::mcp::{is_mcp_response, parse_sse_events};
use crate::metrics::*;
use crate::quic;
use crate::redaction::redact_pii;
use crate::types::*;
use crate::websocket::{parse_websocket_frame, ws_opcode_name};

const MAX_PENDING_PER_CONN: usize = 100;
const MAX_H2_PENDING_STREAMS: usize = 200;

// ---------------------------------------------------------------------------
// ShardedStreamState
// ---------------------------------------------------------------------------

pub struct ShardedStreamState {
    shards: Vec<Arc<Mutex<StreamState>>>,
}

impl ShardedStreamState {
    pub fn new(
        account_id: u64,
        role: TrafficRole,
        max_buffer: usize,
        container_resolver: Arc<ContainerResolver>,
        max_total_buffer_bytes: usize,
        dns_resolver: Option<Arc<DnsResolver>>,
    ) -> Self {
        Self {
            shards: (0..NUM_SHARDS)
                .map(|_| {
                    Arc::new(Mutex::new(StreamState::new(
                        account_id,
                        role,
                        max_buffer,
                        container_resolver.clone(),
                        max_total_buffer_bytes,
                        dns_resolver.clone(),
                    )))
                })
                .collect(),
        }
    }

    /// Shard by (pid, ssl_ptr) only — born_ms is resolved within the shard.
    fn shard_index(&self, pid: u32, ssl_ptr: u64) -> usize {
        use std::collections::hash_map::DefaultHasher;
        let mut h = DefaultHasher::new();
        pid.hash(&mut h);
        ssl_ptr.hash(&mut h);
        (h.finish() as usize) % NUM_SHARDS
    }

    pub fn handle_event(&self, ev: &TlsEventHeader, payload: &[u8]) -> Vec<ApiTrafficEvent> {
        let idx = self.shard_index(ev.pid, ev.ssl_ptr);
        let shard = &self.shards[idx];
        match shard.lock() {
            Ok(mut guard) => guard.handle_event(ev, payload),
            Err(e) => {
                tracing::warn!("shard mutex poisoned, recovering");
                e.into_inner().handle_event(ev, payload)
            }
        }
    }

    pub fn evict_connection(&self, conn_key: &ConnKey) {
        let idx = self.shard_index(conn_key.pid, conn_key.ssl_ptr);
        let shard = &self.shards[idx];
        match shard.lock() {
            Ok(mut guard) => guard.evict_connection_by_ptr(conn_key.pid, conn_key.ssl_ptr),
            Err(e) => {
                tracing::warn!("shard mutex poisoned, recovering");
                e.into_inner()
                    .evict_connection_by_ptr(conn_key.pid, conn_key.ssl_ptr);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// StreamState
// ---------------------------------------------------------------------------

struct StreamState {
    account_id: u64,
    role: TrafficRole,
    max_buffer: usize,
    max_total_buffer_bytes: usize,
    container_resolver: Arc<ContainerResolver>,
    dns_resolver: Option<Arc<DnsResolver>>,
    buffers: HashMap<StreamKey, (Vec<u8>, u64)>,
    pending: HashMap<ConnKey, VecDeque<ParsedRequest>>,
    http2_state: HashMap<ConnKey, Http2Conn>,
    ws_connections: HashSet<ConnKey>,
    known_connections: HashSet<ConnKey>,
    /// Tracks QUIC connections by ConnKey for protocol detection.
    quic_connections: HashSet<ConnKey>,
    /// Maps (pid, ssl_ptr) → first-seen timestamp for born_ms disambiguation.
    conn_born_ms: HashMap<(u32, u64), u64>,
    last_eviction_ms: u64,
}

#[derive(Default)]
pub struct Http2Conn {
    pub buffer: Vec<u8>,
    pub seen_preface: bool,
    pub pending_requests: HashMap<u32, ParsedRequest>,
    pub last_event_ts: u64,
    pub hpack: Http2HpackDecoder,
}

/// Subtract from TOTAL_BUFFER_BYTES with underflow protection.
fn release_memory(amount: usize) {
    if amount == 0 {
        return;
    }
    TOTAL_BUFFER_BYTES
        .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |current| {
            Some(current.saturating_sub(amount))
        })
        .ok();
}

impl StreamState {
    fn new(
        account_id: u64,
        role: TrafficRole,
        max_buffer: usize,
        container_resolver: Arc<ContainerResolver>,
        max_total_buffer_bytes: usize,
        dns_resolver: Option<Arc<DnsResolver>>,
    ) -> Self {
        Self {
            account_id,
            role,
            max_buffer,
            max_total_buffer_bytes,
            container_resolver,
            dns_resolver,
            buffers: HashMap::new(),
            pending: HashMap::new(),
            http2_state: HashMap::new(),
            ws_connections: HashSet::new(),
            known_connections: HashSet::new(),
            quic_connections: HashSet::new(),
            conn_born_ms: HashMap::new(),
            last_eviction_ms: 0,
        }
    }

    fn evict_stale(&mut self, now_ms: u64) {
        if now_ms.saturating_sub(self.last_eviction_ms) < 10_000 {
            return;
        }
        self.last_eviction_ms = now_ms;

        let mut freed_bytes: usize = 0;

        let old_buffers_size: usize = self.buffers.values().map(|(b, _)| b.len()).sum();
        self.buffers
            .retain(|_, (_, last_seen)| now_ms.saturating_sub(*last_seen) < STREAM_TTL_MS);
        let new_buffers_size: usize = self.buffers.values().map(|(b, _)| b.len()).sum();
        freed_bytes += old_buffers_size.saturating_sub(new_buffers_size);

        let old_h2_size: usize = self.http2_state.values().map(|c| c.buffer.len()).sum();
        self.http2_state
            .retain(|_, conn| now_ms.saturating_sub(conn.last_event_ts) < STREAM_TTL_MS);
        let new_h2_size: usize = self.http2_state.values().map(|c| c.buffer.len()).sum();
        freed_bytes += old_h2_size.saturating_sub(new_h2_size);

        self.pending.retain(|_, queue| !queue.is_empty());

        if self.buffers.len() > MAX_STREAM_ENTRIES {
            let excess = self.buffers.len() - MAX_STREAM_ENTRIES;
            let mut keys: Vec<_> = self.buffers.keys().cloned().collect();
            keys.sort_by_key(|k| self.buffers.get(k).map(|(_, ts)| *ts).unwrap_or(0));
            for k in keys.into_iter().take(excess) {
                if let Some((buf, _)) = self.buffers.remove(&k) {
                    freed_bytes += buf.len();
                }
            }
        }
        if self.http2_state.len() > MAX_STREAM_ENTRIES {
            let excess = self.http2_state.len() - MAX_STREAM_ENTRIES;
            let mut keys: Vec<_> = self.http2_state.keys().cloned().collect();
            keys.sort_by_key(|k| {
                self.http2_state
                    .get(k)
                    .map(|c| c.last_event_ts)
                    .unwrap_or(0)
            });
            for k in keys.into_iter().take(excess) {
                if let Some(conn) = self.http2_state.remove(&k) {
                    freed_bytes += conn.buffer.len();
                }
            }
        }

        if freed_bytes > 0 {
            release_memory(freed_bytes);
        }

        // Clean up known_connections for evicted connections
        self.known_connections.retain(|k| {
            let has_buffer = self
                .buffers
                .keys()
                .any(|sk| sk.pid == k.pid && sk.ssl_ptr == k.ssl_ptr);
            let still_active = has_buffer
                || self.pending.contains_key(k)
                || self.http2_state.contains_key(k)
                || self.ws_connections.contains(k)
                || self.quic_connections.contains(k);
            if !still_active {
                ACTIVE_CONNECTIONS.fetch_sub(1, Ordering::Relaxed);
                self.conn_born_ms.remove(&(k.pid, k.ssl_ptr));
            }
            still_active
        });
        // Clean up ws/quic connections for evicted connections
        self.ws_connections
            .retain(|k| self.known_connections.contains(k));
        self.quic_connections
            .retain(|k| self.known_connections.contains(k));
    }

    /// Evict a connection by (pid, ssl_ptr), regardless of born_ms.
    fn evict_connection_by_ptr(&mut self, pid: u32, ssl_ptr: u64) {
        let mut freed_bytes: usize = 0;
        self.buffers.retain(|k, (buf, _)| {
            if k.pid == pid && k.ssl_ptr == ssl_ptr {
                freed_bytes += buf.len();
                false
            } else {
                true
            }
        });
        self.pending
            .retain(|k, _| !(k.pid == pid && k.ssl_ptr == ssl_ptr));
        self.http2_state.retain(|k, conn| {
            if k.pid == pid && k.ssl_ptr == ssl_ptr {
                freed_bytes += conn.buffer.len();
                false
            } else {
                true
            }
        });
        self.ws_connections
            .retain(|k| !(k.pid == pid && k.ssl_ptr == ssl_ptr));
        self.quic_connections
            .retain(|k| !(k.pid == pid && k.ssl_ptr == ssl_ptr));

        let before = self.known_connections.len();
        self.known_connections
            .retain(|k| !(k.pid == pid && k.ssl_ptr == ssl_ptr));
        let evicted = before - self.known_connections.len();
        if evicted > 0 {
            ACTIVE_CONNECTIONS.fetch_sub(evicted as u64, Ordering::Relaxed);
        }

        self.conn_born_ms.remove(&(pid, ssl_ptr));

        if freed_bytes > 0 {
            release_memory(freed_bytes);
        }
    }

    fn net_context_from_event(&self, ev: &TlsEventHeader) -> NetContext {
        let mut ctx = NetContext::default();
        if ev.cgroup_id != 0 {
            ctx.cgroup_id = Some(ev.cgroup_id);
        }
        if ev.netns_ino != 0 {
            ctx.netns_ino = Some(ev.netns_ino);
        }
        if ev.src_port != 0 {
            ctx.source_port = Some(ev.src_port);
        }
        if ev.dst_port != 0 {
            ctx.dest_port = Some(ev.dst_port);
        }
        match ev.ip_family {
            4 => {
                ctx.source_ip = Some(Ipv4Addr::from(u32::from_be(ev.src_ip4)).to_string());
                ctx.dest_ip = Some(Ipv4Addr::from(u32::from_be(ev.dst_ip4)).to_string());
            }
            6 => {
                ctx.source_ip = Some(Ipv6Addr::from(ev.src_ip6).to_string());
                ctx.dest_ip = Some(Ipv6Addr::from(ev.dst_ip6).to_string());
            }
            _ => {}
        }
        ctx.container = self.container_resolver.resolve(ev);
        // Extract process name from BPF comm field
        let comm_end = ev.comm.iter().position(|&b| b == 0).unwrap_or(ev.comm.len());
        if comm_end > 0 {
            ctx.process_name = Some(String::from_utf8_lossy(&ev.comm[..comm_end]).into_owned());
        }
        // Non-blocking DNS resolution for source/dest IPs
        if let Some(ref dns) = self.dns_resolver {
            if let Some(ref src_ip) = ctx.source_ip {
                if let Ok(ip) = src_ip.parse::<IpAddr>() {
                    ctx.source_hostname = dns.resolve_nonblocking(ip);
                }
            }
            if let Some(ref dst_ip) = ctx.dest_ip {
                if let Ok(ip) = dst_ip.parse::<IpAddr>() {
                    ctx.dest_hostname = dns.resolve_nonblocking(ip);
                }
            }
        }
        ctx
    }

    fn handle_event(&mut self, ev: &TlsEventHeader, payload: &[u8]) -> Vec<ApiTrafficEvent> {
        let mut output = Vec::new();
        let ts_ms = ev.ts_ns / 1_000_000;
        let born_ms = *self
            .conn_born_ms
            .entry((ev.pid, ev.ssl_ptr))
            .or_insert(ts_ms);
        let conn_key = ConnKey {
            pid: ev.pid,
            ssl_ptr: ev.ssl_ptr,
            born_ms,
        };
        let stream_key = StreamKey {
            pid: ev.pid,
            ssl_ptr: ev.ssl_ptr,
            direction: ev.direction,
        };
        let data_len = payload.len();

        self.evict_stale(ts_ms);

        // Track active connections
        if self.known_connections.insert(conn_key.clone()) {
            ACTIVE_CONNECTIONS.fetch_add(1, Ordering::Relaxed);
        }

        let is_request_dir = match self.role {
            TrafficRole::Server => ev.direction == 0,
            TrafficRole::Client => ev.direction == 1,
        };

        // QUIC detection — check for QUIC packets on known QUIC ports
        let is_known_quic = self.quic_connections.contains(&conn_key);
        let dst_port = ev.dst_port;
        if data_len > 0
            && (is_known_quic || quic::is_likely_quic(payload, dst_port))
        {
            if let Some(pkt_info) = quic::parse_quic_header(payload) {
                if !is_known_quic {
                    self.quic_connections.insert(conn_key.clone());
                }
                PROTO_QUIC.fetch_add(1, Ordering::Relaxed);
                let net_ctx = self.net_context_from_event(ev);
                let version_str = quic::quic_version_string(pkt_info.version);
                let dcid_hex: String = pkt_info
                    .dcid
                    .iter()
                    .map(|b| format!("{b:02x}"))
                    .collect();
                let scid_hex: String = pkt_info
                    .scid
                    .iter()
                    .map(|b| format!("{b:02x}"))
                    .collect();
                let mut headers = HashMap::new();
                headers.insert("quic-version".to_string(), version_str.to_string());
                headers.insert("quic-dcid".to_string(), dcid_hex);
                if !scid_hex.is_empty() {
                    headers.insert("quic-scid".to_string(), scid_hex);
                }
                headers.insert(
                    "quic-packet-type".to_string(),
                    pkt_info.packet_type.to_string(),
                );
                output.push(ApiTrafficEvent {
                    version: "v1".to_string(),
                    event_type: "api_traffic".to_string(),
                    source: "ebpf".to_string(),
                    protocol: "QUIC".to_string(),
                    account_id: self.account_id,
                    observed_at: ts_ms,
                    request: ApiRequest {
                        method: pkt_info.packet_type.to_string(),
                        path: "/".to_string(),
                        host: None,
                        scheme: "https".to_string(),
                        headers,
                        query: HashMap::new(),
                        body: None,
                    },
                    response: ApiResponse {
                        status_code: 0,
                        headers: HashMap::new(),
                        body: None,
                        latency_ms: None,
                    },
                    collection_id: None,
                    source_ip: net_ctx.source_ip,
                    dest_ip: net_ctx.dest_ip,
                    source_port: net_ctx.source_port,
                    dest_port: net_ctx.dest_port,
                    source_hostname: net_ctx.source_hostname,
                    dest_hostname: net_ctx.dest_hostname,
                    netns_ino: net_ctx.netns_ino,
                    cgroup_id: net_ctx.cgroup_id,
                    process_name: net_ctx.process_name,
                    container: net_ctx.container,
                    metadata: None,
                    anomaly_features: None,
                });
                return output;
            }
        }

        // HTTP/2 check — only process if already known H2 or preface detected in this event.
        // This avoids creating a shadow buffer for HTTP/1.1 connections.
        let is_known_h2 = self.http2_state.contains_key(&conn_key);
        let data_has_preface = if !is_known_h2 && data_len > 0 {
            contains_http2_preface(payload)
        } else {
            false
        };

        if is_known_h2 || data_has_preface {
            if let Some(events) = self.process_http2_event(
                conn_key.clone(),
                ev,
                payload,
                ts_ms,
                is_request_dir,
                data_has_preface,
            ) {
                return events;
            }
        }

        if data_len == 0 {
            return output;
        }

        // WebSocket check — if connection is upgraded, parse WS frames
        if self.ws_connections.contains(&conn_key) {
            let mut pos = 0;
            while pos < payload.len() {
                match parse_websocket_frame(&payload[pos..]) {
                    Some((frame, consumed)) => {
                        if consumed == 0 {
                            break;
                        } // prevent infinite loop
                        let opcode_name = ws_opcode_name(frame.opcode).to_string();
                        let payload_str = String::from_utf8_lossy(&frame.payload).into_owned();
                        let redacted_payload = redact_pii(&payload_str);
                        let net_ctx = self.net_context_from_event(ev);
                        output.push(build_ws_event(
                            self.account_id,
                            ts_ms,
                            opcode_name,
                            redacted_payload,
                            net_ctx,
                        ));
                        PROTO_WEBSOCKET.fetch_add(1, Ordering::Relaxed);
                        pos += consumed;
                    }
                    None => break,
                }
            }
            return output;
        }

        // HTTP/1.1 parsing — use atomic CAS for memory reservation
        let max_buf = self.max_buffer;
        let max_total = self.max_total_buffer_bytes;
        let parsed = {
            let (buf, last_seen) = self
                .buffers
                .entry(stream_key)
                .or_insert_with(|| (Vec::new(), ts_ms));
            *last_seen = ts_ms;

            if !reserve_memory(max_total, data_len) {
                EVENTS_DROPPED.fetch_add(1, Ordering::Relaxed);
                return output;
            }
            buf.extend_from_slice(payload);

            if buf.len() > max_buf {
                let drain = buf.len() - max_buf;
                release_memory(drain);
                buf.drain(0..drain);
            }

            let mut msgs = Vec::new();
            let before_len = buf.len();
            while let Some((msg, remaining)) = extract_http_header(buf) {
                msgs.push(msg);
                *buf = remaining;
            }
            // Account for consumed bytes in memory ceiling
            let consumed = before_len.saturating_sub(buf.len());
            if consumed > 0 {
                release_memory(consumed);
            }
            msgs
        };

        for msg in parsed {
            match msg {
                HttpMessage::Request(req) => {
                    if is_request_dir {
                        let net_ctx = self.net_context_from_event(ev);
                        let queue = self.pending.entry(conn_key.clone()).or_default();
                        if queue.len() < MAX_PENDING_PER_CONN {
                            queue.push_back(ParsedRequest {
                                method: req.method,
                                path: req.path,
                                host: req.host,
                                headers: req.headers,
                                ts_ms,
                                net_ctx,
                            });
                        }
                    }
                }
                HttpMessage::Response(resp) => {
                    if is_request_dir {
                        continue;
                    }

                    // Check for WebSocket upgrade
                    let upgrade_hdr = resp.headers.get("upgrade").map(|v| v.to_lowercase());
                    if upgrade_hdr.as_deref() == Some("websocket") {
                        self.ws_connections.insert(conn_key.clone());
                    }

                    let is_mcp = is_mcp_response(&resp.headers);

                    let request = self
                        .pending
                        .entry(conn_key.clone())
                        .or_default()
                        .pop_front()
                        .unwrap_or_else(|| ParsedRequest {
                            method: "UNKNOWN".to_string(),
                            path: "/".to_string(),
                            host: None,
                            headers: HashMap::new(),
                            ts_ms,
                            net_ctx: NetContext::default(),
                        });
                    let latency_ms = ts_ms.saturating_sub(request.ts_ms);
                    let protocol = if is_mcp { "MCP" } else { "HTTP/1.1" };
                    let mut event = build_event(
                        self.account_id,
                        ts_ms,
                        request,
                        resp,
                        latency_ms,
                        protocol,
                        "ebpf",
                    );
                    if is_mcp {
                        let mcp_events = parse_sse_events(payload);
                        if let Some(mcp_ev) = mcp_events.first() {
                            event.metadata = Some(EventMetadata {
                                has_injection: mcp_ev.has_injection,
                                injection_patterns: if mcp_ev.has_injection {
                                    vec!["prompt_injection".to_string()]
                                } else {
                                    vec![]
                                },
                                permission_flags: mcp_ev.permission_flags.clone(),
                                mcp_method: mcp_ev.method.clone(),
                                mcp_tool_name: mcp_ev.tool_name.clone(),
                            });
                        }
                    }
                    output.push(event);
                }
            }
        }

        output
    }

    fn process_http2_event(
        &mut self,
        conn_key: ConnKey,
        ev: &TlsEventHeader,
        payload: &[u8],
        ts_ms: u64,
        is_request_dir: bool,
        data_has_preface: bool,
    ) -> Option<Vec<ApiTrafficEvent>> {
        let net_ctx = if is_request_dir {
            Some(self.net_context_from_event(ev))
        } else {
            None
        };
        let conn_state = self.http2_state.entry(conn_key).or_default();
        conn_state.last_event_ts = ts_ms;
        if data_has_preface {
            conn_state.seen_preface = true;
        }

        let data_len = payload.len();
        if data_len == 0 {
            return Some(vec![]);
        }

        // Atomic CAS memory reservation
        if !reserve_memory(self.max_total_buffer_bytes, data_len) {
            EVENTS_DROPPED.fetch_add(1, Ordering::Relaxed);
            return Some(vec![]);
        }
        conn_state.buffer.extend_from_slice(payload);

        if !conn_state.seen_preface {
            if contains_http2_preface(&conn_state.buffer) {
                conn_state.seen_preface = true;
            } else {
                return None;
            }
        }

        let mut output = Vec::new();
        if conn_state.buffer.len() > self.max_buffer * 2 {
            let target_drain = conn_state.buffer.len() - self.max_buffer;
            let boundary = find_next_frame_boundary(&conn_state.buffer, target_drain);
            if boundary > 0 {
                release_memory(boundary);
                conn_state.buffer.drain(0..boundary);
            }
        }

        // Bound pending requests to prevent unbounded growth
        if conn_state.pending_requests.len() > MAX_H2_PENDING_STREAMS {
            let excess = conn_state.pending_requests.len() - MAX_H2_PENDING_STREAMS;
            let keys: Vec<u32> = conn_state
                .pending_requests
                .keys()
                .copied()
                .take(excess)
                .collect();
            for k in keys {
                conn_state.pending_requests.remove(&k);
            }
        }

        let stream_frames = parse_http2_frames(&mut conn_state.hpack, &conn_state.buffer);
        for (stream_id, headers) in stream_frames {
            if is_request_dir {
                if let Some(method) = headers.get(":method") {
                    let path = headers
                        .get(":path")
                        .cloned()
                        .unwrap_or_else(|| "/".to_string());
                    let host = headers.get(":authority").cloned();
                    if conn_state.pending_requests.len() < MAX_H2_PENDING_STREAMS {
                        conn_state.pending_requests.insert(
                            stream_id,
                            ParsedRequest {
                                method: method.clone(),
                                path,
                                host,
                                headers: headers.clone(),
                                ts_ms,
                                net_ctx: net_ctx.clone().unwrap_or_default(),
                            },
                        );
                    }
                    let cleared = conn_state.buffer.len();
                    conn_state.buffer.clear();
                    release_memory(cleared);
                }
            } else if let Some(status) = headers.get(":status") {
                let request = conn_state
                    .pending_requests
                    .remove(&stream_id)
                    .unwrap_or_else(|| ParsedRequest {
                        method: "UNKNOWN".to_string(),
                        path: "/".to_string(),
                        host: None,
                        headers: HashMap::new(),
                        ts_ms,
                        net_ctx: NetContext::default(),
                    });
                let latency_ms = ts_ms.saturating_sub(request.ts_ms);
                let resp = HttpResponseParsed {
                    status_code: status.parse::<i32>().unwrap_or(0),
                    headers: headers.clone(),
                };
                let is_grpc = headers
                    .get("content-type")
                    .map(|v| v.starts_with("application/grpc"))
                    .unwrap_or(false);

                // gRPC protobuf body decode
                let grpc_body = if is_grpc {
                    let fields = decode_grpc_fields(&conn_state.buffer);
                    if !fields.is_empty() {
                        serde_json::to_string(&fields).ok()
                    } else {
                        None
                    }
                } else {
                    None
                };

                let protocol = if is_grpc { "gRPC" } else { "HTTP/2" };
                let mut event = build_event(
                    self.account_id,
                    ts_ms,
                    request,
                    resp,
                    latency_ms,
                    protocol,
                    "ebpf",
                );
                // gRPC body belongs in response, not request
                if let Some(body) = grpc_body {
                    event.response.body = Some(body);
                }
                output.push(event);
            }
        }
        if !output.is_empty() {
            let cleared = conn_state.buffer.len();
            conn_state.buffer.clear();
            release_memory(cleared);
        }
        Some(output)
    }
}

// ---------------------------------------------------------------------------
// Anomaly feature computation
// ---------------------------------------------------------------------------

fn compute_shannon_entropy(s: &str) -> f32 {
    if s.is_empty() {
        return 0.0;
    }
    let mut freq = [0u32; 256];
    for &b in s.as_bytes() {
        freq[b as usize] += 1;
    }
    let len = s.len() as f32;
    freq.iter()
        .filter(|&&c| c > 0)
        .map(|&c| {
            let p = c as f32 / len;
            -p * p.log2()
        })
        .sum()
}

fn contains_sqli(path: &str, query: &HashMap<String, String>) -> bool {
    let patterns = [
        "union select",
        "' or ",
        "1=1",
        "drop table",
        "insert into",
        "delete from",
        "update set",
        "--",
        "/*",
        "*/",
        "xp_",
        "exec(",
        "char(",
        "concat(",
        "benchmark(",
        "sleep(",
    ];
    let check = |s: &str| -> bool {
        let lower = s.to_lowercase();
        patterns.iter().any(|p| lower.contains(p))
    };
    check(path) || query.values().any(|v| check(v))
}

fn contains_xss(path: &str, query: &HashMap<String, String>) -> bool {
    let patterns = [
        "<script",
        "javascript:",
        "onerror=",
        "onload=",
        "onfocus=",
        "onmouseover=",
        "<img",
        "<svg",
        "<iframe",
        "alert(",
        "document.cookie",
    ];
    let check = |s: &str| -> bool {
        let lower = s.to_lowercase();
        patterns.iter().any(|p| lower.contains(p))
    };
    check(path) || query.values().any(|v| check(v))
}

fn compute_anomaly_features(
    path: &str,
    query: &HashMap<String, String>,
    body_len: usize,
) -> AnomalyFeatures {
    AnomalyFeatures {
        path_depth: path.matches('/').count().min(255) as u8,
        query_param_count: query.len().min(255) as u8,
        has_encoded_chars: path.contains('%'),
        request_size_bucket: if body_len == 0 {
            0
        } else {
            (body_len as f64).log2() as u8
        },
        shannon_entropy: compute_shannon_entropy(path),
        has_sqli_pattern: contains_sqli(path, query),
        has_xss_pattern: contains_xss(path, query),
        has_path_traversal: path.contains("../") || path.contains("..\\"),
    }
}

/// Scan for the next valid HTTP/2 frame boundary at or after `start`.
fn find_next_frame_boundary(buf: &[u8], start: usize) -> usize {
    let mut i = start;
    while i + 9 <= buf.len() {
        let frame_len =
            ((buf[i] as usize) << 16) | ((buf[i + 1] as usize) << 8) | (buf[i + 2] as usize);
        let frame_type = buf[i + 3];
        if frame_len <= 16384 && frame_type <= 9 && i + 9 + frame_len <= buf.len() {
            return i;
        }
        i += 1;
    }
    buf.len()
}

/// Atomic CAS memory reservation — returns true if reservation succeeded.
/// Uses fetch_update to avoid TOCTOU races between check and increment.
fn reserve_memory(max_total: usize, additional: usize) -> bool {
    TOTAL_BUFFER_BYTES
        .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |current| {
            if current + additional <= max_total {
                Some(current + additional)
            } else {
                None
            }
        })
        .is_ok()
}

// ---------------------------------------------------------------------------
// Event builders
// ---------------------------------------------------------------------------

pub fn build_ws_event(
    account_id: u64,
    ts_ms: u64,
    opcode_name: String,
    payload: String,
    net_ctx: NetContext,
) -> ApiTrafficEvent {
    ApiTrafficEvent {
        version: "v1".to_string(),
        event_type: "ws_message".to_string(),
        source: "ebpf".to_string(),
        protocol: "WebSocket".to_string(),
        account_id,
        observed_at: ts_ms,
        request: ApiRequest {
            method: opcode_name,
            path: "/ws".to_string(),
            host: None,
            scheme: "wss".to_string(),
            headers: HashMap::new(),
            query: HashMap::new(),
            body: Some(payload),
        },
        response: ApiResponse {
            status_code: 0,
            headers: HashMap::new(),
            body: None,
            latency_ms: None,
        },
        collection_id: None,
        source_ip: net_ctx.source_ip,
        dest_ip: net_ctx.dest_ip,
        source_port: net_ctx.source_port,
        dest_port: net_ctx.dest_port,
        source_hostname: net_ctx.source_hostname,
        dest_hostname: net_ctx.dest_hostname,
        netns_ino: net_ctx.netns_ino,
        cgroup_id: net_ctx.cgroup_id,
        process_name: net_ctx.process_name,
        container: net_ctx.container,
        metadata: None,
        anomaly_features: None,
    }
}

pub fn build_event(
    account_id: u64,
    ts_ms: u64,
    req: ParsedRequest,
    resp: HttpResponseParsed,
    latency_ms: u64,
    protocol: &str,
    source: &str,
) -> ApiTrafficEvent {
    // Increment protocol counters
    match protocol {
        "HTTP/1.1" => PROTO_HTTP1.fetch_add(1, Ordering::Relaxed),
        "HTTP/2" => PROTO_HTTP2.fetch_add(1, Ordering::Relaxed),
        "gRPC" => PROTO_GRPC.fetch_add(1, Ordering::Relaxed),
        "WebSocket" => PROTO_WEBSOCKET.fetch_add(1, Ordering::Relaxed),
        "MCP" => PROTO_MCP.fetch_add(1, Ordering::Relaxed),
        "Go-TLS" => PROTO_GO_TLS.fetch_add(1, Ordering::Relaxed),
        _ => 0,
    };

    // Compute anomaly features before redaction (on raw path/query)
    let (_, raw_query) = split_query(&req.path);
    let anomaly = compute_anomaly_features(&req.path, &raw_query, 0);

    // Apply PII redaction to path and header values
    let redacted_path = redact_pii(&req.path);
    let (path, query) = split_query(&redacted_path);
    let net_ctx = req.net_ctx.clone();

    let redacted_req_headers: HashMap<String, String> = req
        .headers
        .into_iter()
        .map(|(k, v)| (k, redact_pii(&v)))
        .collect();

    // Redact response headers too (may contain Set-Cookie, tokens, etc.)
    let redacted_resp_headers: HashMap<String, String> = resp
        .headers
        .into_iter()
        .map(|(k, v)| (k, redact_pii(&v)))
        .collect();

    ApiTrafficEvent {
        version: "v1".to_string(),
        event_type: "api_traffic".to_string(),
        source: source.to_string(),
        protocol: protocol.to_string(),
        account_id,
        observed_at: ts_ms,
        request: ApiRequest {
            method: req.method,
            path,
            host: req.host,
            scheme: "https".to_string(),
            headers: redacted_req_headers,
            query,
            body: None,
        },
        response: ApiResponse {
            status_code: resp.status_code,
            headers: redacted_resp_headers,
            body: None,
            latency_ms: Some(latency_ms),
        },
        collection_id: None,
        source_ip: net_ctx.source_ip,
        dest_ip: net_ctx.dest_ip,
        source_port: net_ctx.source_port,
        dest_port: net_ctx.dest_port,
        source_hostname: net_ctx.source_hostname,
        dest_hostname: net_ctx.dest_hostname,
        netns_ino: net_ctx.netns_ino,
        cgroup_id: net_ctx.cgroup_id,
        process_name: net_ctx.process_name,
        container: net_ctx.container,
        metadata: None,
        anomaly_features: Some(anomaly),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::container::{ContainerLookupRequest, ContainerResolver};
    use std::sync::atomic::Ordering;
    use tokio::sync::mpsc;

    fn make_test_resolver() -> Arc<ContainerResolver> {
        let (tx, _rx) = mpsc::channel::<ContainerLookupRequest>(16);
        Arc::new(ContainerResolver::new(tx, "test-node".to_string()))
    }

    fn make_test_state(max_buffer: usize, max_total: usize) -> StreamState {
        StreamState::new(
            1000,
            TrafficRole::Server,
            max_buffer,
            make_test_resolver(),
            max_total,
            None,
        )
    }

    fn make_header(
        pid: u32,
        ssl_ptr: u64,
        direction: u8,
        ts_ns: u64,
        data_len: u32,
    ) -> TlsEventHeader {
        TlsEventHeader {
            ts_ns,
            pid,
            tid: pid,
            ssl_ptr,
            data_len,
            direction,
            ip_family: 4,
            _pad16: 0,
            comm: [0; 16],
            cgroup_id: 0,
            netns_ino: 0,
            src_port: 8080,
            dst_port: 443,
            src_ip4: u32::from(std::net::Ipv4Addr::new(10, 0, 0, 1)).to_be(),
            dst_ip4: u32::from(std::net::Ipv4Addr::new(10, 0, 0, 2)).to_be(),
            src_ip6: [0; 16],
            dst_ip6: [0; 16],
        }
    }

    /// Reset global counters to avoid test interference.
    fn reset_globals() {
        TOTAL_BUFFER_BYTES.store(0, Ordering::Relaxed);
        ACTIVE_CONNECTIONS.store(0, Ordering::Relaxed);
        EVENTS_DROPPED.store(0, Ordering::Relaxed);
    }

    // ---- Pure function tests ----

    #[test]
    fn test_entropy_empty() {
        assert_eq!(compute_shannon_entropy(""), 0.0);
    }

    #[test]
    fn test_entropy_single_char() {
        assert_eq!(compute_shannon_entropy("aaaa"), 0.0);
    }

    #[test]
    fn test_entropy_uniform() {
        let e = compute_shannon_entropy("abababab");
        assert!((e - 1.0).abs() < 0.01, "expected ~1.0, got {e}");
    }

    #[test]
    fn test_entropy_high() {
        let s: String = (b'a'..=b'z').map(|b| b as char).collect();
        let e = compute_shannon_entropy(&s);
        assert!(e > 4.0, "expected high entropy, got {e}");
    }

    #[test]
    fn test_sqli_union_select() {
        assert!(contains_sqli(
            "/api/users?id=1 UNION SELECT * FROM pwd",
            &HashMap::new()
        ));
    }

    #[test]
    fn test_sqli_in_query_param() {
        let mut q = HashMap::new();
        q.insert("id".into(), "1' OR '1'='1".into());
        assert!(contains_sqli("/api/users", &q));
    }

    #[test]
    fn test_sqli_clean() {
        assert!(!contains_sqli("/api/users/123", &HashMap::new()));
    }

    #[test]
    fn test_xss_script_tag() {
        assert!(contains_xss(
            "/search?q=<script>alert(1)</script>",
            &HashMap::new()
        ));
    }

    #[test]
    fn test_xss_in_query_param() {
        let mut q = HashMap::new();
        q.insert("name".into(), "<img onerror=alert(1)>".into());
        assert!(contains_xss("/profile", &q));
    }

    #[test]
    fn test_xss_clean() {
        assert!(!contains_xss("/api/data", &HashMap::new()));
    }

    #[test]
    fn test_anomaly_features_basic() {
        let mut q = HashMap::new();
        q.insert("a".into(), "1".into());
        q.insert("b".into(), "2".into());
        let f = compute_anomaly_features("/api/v1/users%20data", &q, 1024);
        assert_eq!(f.path_depth, 3);
        assert_eq!(f.query_param_count, 2);
        assert!(f.has_encoded_chars);
        assert!(!f.has_sqli_pattern);
        assert!(!f.has_xss_pattern);
        assert!(!f.has_path_traversal);
        assert!(f.request_size_bucket > 0);
    }

    #[test]
    fn test_anomaly_path_traversal() {
        let f = compute_anomaly_features("/../../etc/passwd", &HashMap::new(), 0);
        assert!(f.has_path_traversal);
    }

    #[test]
    fn test_frame_boundary_empty() {
        assert_eq!(find_next_frame_boundary(&[], 0), 0);
    }

    #[test]
    fn test_frame_boundary_valid() {
        // Minimal H2 frame: length=0, type=0 (DATA), flags=0, stream_id=0
        let frame = [0u8, 0, 0, 0, 0, 0, 0, 0, 0];
        assert_eq!(find_next_frame_boundary(&frame, 0), 0);
    }

    #[test]
    fn test_frame_boundary_skip_garbage() {
        let mut buf = vec![0xFF, 0xFF, 0xFF];
        buf.extend_from_slice(&[0u8, 0, 0, 0, 0, 0, 0, 0, 0]);
        assert_eq!(find_next_frame_boundary(&buf, 0), 3);
    }

    // ---- Memory reservation ----

    #[test]
    fn test_reserve_memory_ok() {
        TOTAL_BUFFER_BYTES.store(0, Ordering::Relaxed);
        assert!(reserve_memory(1000, 500));
        assert_eq!(TOTAL_BUFFER_BYTES.load(Ordering::Relaxed), 500);
        TOTAL_BUFFER_BYTES.store(0, Ordering::Relaxed);
    }

    #[test]
    fn test_reserve_memory_exceeds_limit() {
        TOTAL_BUFFER_BYTES.store(900, Ordering::Relaxed);
        assert!(!reserve_memory(1000, 200));
        assert_eq!(TOTAL_BUFFER_BYTES.load(Ordering::Relaxed), 900);
        TOTAL_BUFFER_BYTES.store(0, Ordering::Relaxed);
    }

    #[test]
    fn test_release_memory_underflow_safe() {
        TOTAL_BUFFER_BYTES.store(10, Ordering::Relaxed);
        release_memory(100);
        assert_eq!(TOTAL_BUFFER_BYTES.load(Ordering::Relaxed), 0);
    }

    // ---- HTTP/1.1 flow ----

    #[test]
    fn test_http1_request_response_pair() {
        reset_globals();
        let mut state = make_test_state(65536, 10_000_000);

        let req = b"GET /api/users HTTP/1.1\r\nHost: example.com\r\n\r\n";
        let h = make_header(100, 0x1000, 0, 1_000_000_000, req.len() as u32);
        assert!(
            state.handle_event(&h, req).is_empty(),
            "request alone → no output"
        );

        let resp = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n";
        let h = make_header(100, 0x1000, 1, 1_100_000_000, resp.len() as u32);
        let events = state.handle_event(&h, resp);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].request.method, "GET");
        assert_eq!(events[0].response.status_code, 200);
        assert_eq!(events[0].protocol, "HTTP/1.1");
        reset_globals();
    }

    #[test]
    fn test_http1_pipelined() {
        reset_globals();
        let mut state = make_test_state(65536, 10_000_000);

        let req1 = b"GET /a HTTP/1.1\r\nHost: h\r\n\r\n";
        let req2 = b"POST /b HTTP/1.1\r\nHost: h\r\n\r\n";
        state.handle_event(
            &make_header(1, 0x1, 0, 1_000_000_000, req1.len() as u32),
            req1,
        );
        state.handle_event(
            &make_header(1, 0x1, 0, 1_050_000_000, req2.len() as u32),
            req2,
        );

        let r1 = b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n";
        let r2 = b"HTTP/1.1 201 Created\r\nContent-Length: 0\r\n\r\n";

        let e1 = state.handle_event(&make_header(1, 0x1, 1, 1_100_000_000, r1.len() as u32), r1);
        assert_eq!(e1.len(), 1);
        assert_eq!(e1[0].request.method, "GET");
        assert_eq!(e1[0].response.status_code, 200);

        let e2 = state.handle_event(&make_header(1, 0x1, 1, 1_150_000_000, r2.len() as u32), r2);
        assert_eq!(e2.len(), 1);
        assert_eq!(e2[0].request.method, "POST");
        assert_eq!(e2[0].response.status_code, 201);
        reset_globals();
    }

    #[test]
    fn test_http1_response_without_request() {
        reset_globals();
        let mut state = make_test_state(65536, 10_000_000);

        let resp = b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
        let h = make_header(100, 0x1000, 1, 1_000_000_000, resp.len() as u32);
        let events = state.handle_event(&h, resp);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].request.method, "UNKNOWN");
        assert_eq!(events[0].response.status_code, 404);
        reset_globals();
    }

    #[test]
    fn test_empty_payload_produces_nothing() {
        reset_globals();
        let mut state = make_test_state(65536, 10_000_000);
        let h = make_header(100, 0x1000, 0, 1_000_000_000, 0);
        assert!(state.handle_event(&h, &[]).is_empty());
        reset_globals();
    }

    // ---- Memory pressure ----

    #[test]
    fn test_memory_pressure_drops_events() {
        let max_total = 100;
        TOTAL_BUFFER_BYTES.store(max_total, Ordering::Relaxed);
        ACTIVE_CONNECTIONS.store(0, Ordering::Relaxed);
        let mut state = make_test_state(65536, max_total);

        let req = b"GET /test HTTP/1.1\r\nHost: h\r\n\r\n";
        let h = make_header(100, 0x1000, 0, 1_000_000_000, req.len() as u32);
        let events = state.handle_event(&h, req);
        assert!(events.is_empty(), "should drop when memory exhausted");
        reset_globals();
    }

    // ---- Eviction ----

    #[test]
    fn test_evict_connection_by_ptr() {
        reset_globals();
        let mut state = make_test_state(65536, 10_000_000);

        let req = b"GET /test HTTP/1.1\r\nHost: h\r\n\r\n";
        state.handle_event(
            &make_header(100, 0x1000, 0, 1_000_000_000, req.len() as u32),
            req,
        );
        assert!(!state.known_connections.is_empty());

        state.evict_connection_by_ptr(100, 0x1000);
        assert!(state.known_connections.is_empty());
        assert!(state.buffers.is_empty());
        assert!(state.pending.is_empty());
        reset_globals();
    }

    #[test]
    fn test_evict_stale_cleans_old_buffers() {
        reset_globals();
        let mut state = make_test_state(65536, 10_000_000);

        // Incomplete request stays in buffer
        let req = b"GET /test HTTP/1.1\r\n";
        let ts = 1_000_000u64;
        let h = make_header(100, 0x1000, 0, ts * 1_000_000, req.len() as u32);
        state.handle_event(&h, req);
        assert!(!state.buffers.is_empty());

        // Force eviction far in the future
        state.last_eviction_ms = 0;
        state.evict_stale(ts + STREAM_TTL_MS + 10_001);
        assert!(state.buffers.is_empty(), "stale buffers should be evicted");
        reset_globals();
    }

    #[test]
    fn test_evict_stale_skips_if_recent() {
        reset_globals();
        let mut state = make_test_state(65536, 10_000_000);
        state.last_eviction_ms = 1000;
        // Only 5s later — under 10s threshold
        state.evict_stale(6000);
        // Should not crash and should be a no-op
        reset_globals();
    }

    // ---- Event builders ----

    #[test]
    fn test_build_event_populates_anomaly() {
        let req = ParsedRequest {
            method: "GET".into(),
            path: "/api/v1/users?page=1".into(),
            host: Some("example.com".into()),
            headers: HashMap::new(),
            ts_ms: 1000,
            net_ctx: NetContext::default(),
        };
        let resp = HttpResponseParsed {
            status_code: 200,
            headers: HashMap::new(),
        };
        let event = build_event(42, 1100, req, resp, 100, "HTTP/1.1", "ebpf");
        assert_eq!(event.account_id, 42);
        assert_eq!(event.response.status_code, 200);
        assert_eq!(event.response.latency_ms, Some(100));
        assert!(event.anomaly_features.is_some());
        let af = event.anomaly_features.unwrap();
        assert_eq!(af.path_depth, 3);
        assert_eq!(af.query_param_count, 1);
    }

    #[test]
    fn test_build_ws_event() {
        let event = build_ws_event(
            42,
            1000,
            "text".into(),
            "hello".into(),
            NetContext::default(),
        );
        assert_eq!(event.event_type, "ws_message");
        assert_eq!(event.protocol, "WebSocket");
        assert_eq!(event.request.method, "text");
        assert_eq!(event.request.body, Some("hello".into()));
    }

    // ---- Connection tracking ----

    #[test]
    fn test_separate_connections_tracked_independently() {
        reset_globals();
        let mut state = make_test_state(65536, 10_000_000);

        let req = b"GET /a HTTP/1.1\r\nHost: h\r\n\r\n";
        state.handle_event(
            &make_header(100, 0x1000, 0, 1_000_000_000, req.len() as u32),
            req,
        );
        state.handle_event(
            &make_header(200, 0x2000, 0, 1_000_000_000, req.len() as u32),
            req,
        );

        assert_eq!(state.known_connections.len(), 2);

        // Response on first connection
        let resp = b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n";
        let events = state.handle_event(
            &make_header(100, 0x1000, 1, 1_100_000_000, resp.len() as u32),
            resp,
        );
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].response.status_code, 200);

        // Second connection still has pending request
        assert!(state.pending.values().any(|q| !q.is_empty()));
        reset_globals();
    }

    // ---- Pending request cap ----

    #[test]
    fn test_pending_request_cap() {
        reset_globals();
        let mut state = make_test_state(65536, 10_000_000);

        let req = b"GET /test HTTP/1.1\r\nHost: h\r\n\r\n";
        for i in 0..=MAX_PENDING_PER_CONN {
            let ts = (1_000_000 + i as u64) * 1_000_000;
            state.handle_event(&make_header(100, 0x1000, 0, ts, req.len() as u32), req);
        }

        let conn_key = ConnKey {
            pid: 100,
            ssl_ptr: 0x1000,
            born_ms: 1_000_000,
        };
        let queue_len = state.pending.get(&conn_key).map(|q| q.len()).unwrap_or(0);
        assert!(
            queue_len <= MAX_PENDING_PER_CONN,
            "queue should be capped at {MAX_PENDING_PER_CONN}"
        );
        reset_globals();
    }

    // ---- Process name extraction ----

    #[test]
    fn test_process_name_extracted() {
        reset_globals();
        let mut state = make_test_state(65536, 10_000_000);
        let mut header = make_header(100, 0x1000, 0, 1_000_000_000_000, 0);
        // Set comm field to "nginx"
        let name = b"nginx";
        header.comm[..name.len()].copy_from_slice(name);

        let req = b"GET / HTTP/1.1\r\nHost: test\r\n\r\n";
        let resp = b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n";

        header.data_len = req.len() as u32;
        state.handle_event(&header, req);
        header.direction = 1;
        header.data_len = resp.len() as u32;
        let events = state.handle_event(&header, resp);

        assert!(!events.is_empty());
        assert_eq!(events[0].process_name.as_deref(), Some("nginx"));
        reset_globals();
    }

    #[test]
    fn test_process_name_empty_comm() {
        reset_globals();
        let mut state = make_test_state(65536, 10_000_000);
        let header = make_header(100, 0x1000, 0, 1_000_000_000_000, 0);
        // comm is all zeros
        let req = b"GET / HTTP/1.1\r\nHost: test\r\n\r\n";
        let resp = b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n";

        state.handle_event(&header, req);
        let mut hdr_resp = header;
        hdr_resp.direction = 1;
        hdr_resp.data_len = resp.len() as u32;
        let events = state.handle_event(&hdr_resp, resp);
        // Empty comm → no process_name
        if !events.is_empty() {
            assert_eq!(events[0].process_name, None);
        }
        reset_globals();
    }

    #[test]
    fn test_process_name_full_16_bytes() {
        reset_globals();
        let mut state = make_test_state(65536, 10_000_000);
        let mut header = make_header(100, 0x1000, 0, 1_000_000_000_000, 0);
        // Fill comm with 16 non-null bytes (no null terminator)
        header.comm = [b'x'; 16];

        let req = b"GET / HTTP/1.1\r\nHost: test\r\n\r\n";
        let resp = b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n";

        header.data_len = req.len() as u32;
        state.handle_event(&header, req);
        header.direction = 1;
        header.data_len = resp.len() as u32;
        let events = state.handle_event(&header, resp);

        assert!(!events.is_empty());
        assert_eq!(events[0].process_name.as_deref(), Some("xxxxxxxxxxxxxxxx"));
        reset_globals();
    }

    // ---- QUIC detection ----

    #[test]
    fn test_quic_detection() {
        reset_globals();
        let mut state = make_test_state(65536, 10_000_000);

        // Create a QUIC V1 Initial packet
        let mut quic_pkt = Vec::new();
        quic_pkt.push(0xC0); // Initial
        quic_pkt.extend_from_slice(&crate::quic::QUIC_V1.to_be_bytes());
        quic_pkt.push(8); // DCID len
        quic_pkt.extend_from_slice(&[0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
        quic_pkt.push(0); // SCID len
        quic_pkt.extend_from_slice(&[0x00; 20]); // payload

        let mut header = make_header(100, 0x1000, 0, 1_000_000_000_000, quic_pkt.len() as u32);
        header.dst_port = 443; // QUIC port

        let events = state.handle_event(&header, &quic_pkt);
        assert!(!events.is_empty());
        assert_eq!(events[0].protocol, "QUIC");
        assert_eq!(events[0].request.method, "Initial");
        assert_eq!(
            events[0].request.headers.get("quic-version").map(|s| s.as_str()),
            Some("QUICv1")
        );
        reset_globals();
    }

    #[test]
    fn test_quic_not_detected_on_non_quic_port() {
        reset_globals();
        let mut state = make_test_state(65536, 10_000_000);

        let mut quic_pkt = Vec::new();
        quic_pkt.push(0xC0);
        quic_pkt.extend_from_slice(&crate::quic::QUIC_V1.to_be_bytes());
        quic_pkt.push(8);
        quic_pkt.extend_from_slice(&[0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
        quic_pkt.push(0);

        let mut header = make_header(100, 0x1000, 0, 1_000_000_000_000, quic_pkt.len() as u32);
        header.dst_port = 80; // NOT a QUIC port

        let events = state.handle_event(&header, &quic_pkt);
        // Should NOT be detected as QUIC (wrong port)
        assert!(events.iter().all(|e| e.protocol != "QUIC"));
        reset_globals();
    }

    // ---- New fields in serialization ----

    #[test]
    fn test_new_fields_serialize() {
        let event = ApiTrafficEvent {
            version: "v1".to_string(),
            event_type: "api_traffic".to_string(),
            source: "ebpf".to_string(),
            protocol: "HTTP/1.1".to_string(),
            account_id: 1000,
            observed_at: 12345,
            request: ApiRequest {
                method: "GET".to_string(),
                path: "/test".to_string(),
                host: None,
                scheme: "https".to_string(),
                headers: HashMap::new(),
                query: HashMap::new(),
                body: None,
            },
            response: ApiResponse {
                status_code: 200,
                headers: HashMap::new(),
                body: None,
                latency_ms: Some(5),
            },
            collection_id: None,
            source_ip: Some("10.0.0.1".to_string()),
            dest_ip: Some("10.0.0.2".to_string()),
            source_port: Some(8080),
            dest_port: Some(443),
            source_hostname: Some("client.local".to_string()),
            dest_hostname: Some("server.example.com".to_string()),
            netns_ino: None,
            cgroup_id: None,
            process_name: Some("nginx".to_string()),
            container: None,
            metadata: None,
            anomaly_features: None,
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"process_name\":\"nginx\""));
        assert!(json.contains("\"source_hostname\":\"client.local\""));
        assert!(json.contains("\"dest_hostname\":\"server.example.com\""));
    }
}
