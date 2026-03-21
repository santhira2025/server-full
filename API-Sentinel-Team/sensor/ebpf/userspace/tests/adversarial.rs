use api_sec_sensor::grpc::decode_grpc_fields;
use api_sec_sensor::http::extract_http_header;
use api_sec_sensor::http2::{contains_http2_preface, parse_http2_frames, Http2HpackDecoder};
use api_sec_sensor::mcp::parse_sse_events;
use api_sec_sensor::quic::{
    is_likely_quic, is_quic_initial, parse_quic_header, QuicPacketType, QUIC_V1, QUIC_V2,
};
use api_sec_sensor::redaction::redact_pii;
use api_sec_sensor::websocket::parse_websocket_frame;

// ---------------------------------------------------------------------------
// HTTP/1.1 adversarial tests
// ---------------------------------------------------------------------------

#[test]
fn http_truncated_headers_no_crlf() {
    let buf = b"GET /index.html HTTP/1.1\r\nHost: example.com\r\nNo-End";
    assert!(extract_http_header(buf).is_none());
}

#[test]
fn http_oversized_content_length() {
    let buf = b"HTTP/1.1 200 OK\r\nContent-Length: 4294967296\r\n\r\nshort body";
    let result = extract_http_header(buf);
    assert!(result.is_some()); // should parse header, just not enough body
}

#[test]
fn http_empty_input() {
    assert!(extract_http_header(b"").is_none());
}

#[test]
fn http_only_crlf() {
    assert!(extract_http_header(b"\r\n\r\n").is_some());
}

#[test]
fn http_extremely_long_header_line() {
    let mut buf = b"GET / HTTP/1.1\r\nX-Long: ".to_vec();
    buf.extend_from_slice(&vec![b'A'; 100_000]);
    buf.extend_from_slice(b"\r\n\r\n");
    let result = extract_http_header(&buf);
    assert!(result.is_some());
}

#[test]
fn http_smuggling_cl_te_conflict() {
    let buf =
        b"POST / HTTP/1.1\r\nContent-Length: 5\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n";
    let result = extract_http_header(buf);
    assert!(result.is_some());
}

#[test]
fn http_utf8_invalid_in_headers() {
    let mut buf = b"GET / HTTP/1.1\r\nHost: ".to_vec();
    buf.extend_from_slice(&[0xFF, 0xFE, 0x80]);
    buf.extend_from_slice(b"\r\n\r\n");
    let result = extract_http_header(&buf);
    assert!(result.is_some());
}

#[test]
fn http_nested_chunked_encoding() {
    let buf =
        b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n3\r\nfoo\r\n0\r\n\r\n";
    let result = extract_http_header(buf);
    assert!(result.is_some());
}

// ---------------------------------------------------------------------------
// HTTP/2 adversarial tests
// ---------------------------------------------------------------------------

#[test]
fn h2_preface_followed_by_garbage() {
    let mut buf = b"PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n".to_vec();
    buf.extend_from_slice(&[0xFF; 100]);
    let mut decoder = Http2HpackDecoder::new();
    let _ = parse_http2_frames(&mut decoder, &buf); // must not panic
}

#[test]
fn h2_zero_length_frames() {
    let mut buf = b"PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n".to_vec();
    // Frame with length=0, type=HEADERS, flags=END_HEADERS, stream_id=1
    buf.extend_from_slice(&[0x00, 0x00, 0x00, 0x01, 0x04, 0x00, 0x00, 0x00, 0x01]);
    let mut decoder = Http2HpackDecoder::new();
    let _ = parse_http2_frames(&mut decoder, &buf);
}

#[test]
fn h2_truncated_frame_header() {
    let buf = b"PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n\x00\x00";
    let mut decoder = Http2HpackDecoder::new();
    let _ = parse_http2_frames(&mut decoder, buf);
}

#[test]
fn h2_no_preface() {
    let buf = b"NOT A VALID HTTP2 PREFACE";
    assert!(!contains_http2_preface(buf));
}

// ---------------------------------------------------------------------------
// WebSocket adversarial tests
// ---------------------------------------------------------------------------

#[test]
fn ws_frame_payload_len_exceeds_buffer() {
    // Claim payload of 1000 bytes but only provide 5
    let buf = [0x81, 0x7E, 0x03, 0xE8, 0x41, 0x41, 0x41, 0x41, 0x41];
    let result = parse_websocket_frame(&buf);
    // Should return None (not enough data) or handle gracefully
    // The parser should not panic
    let _ = result;
}

#[test]
fn ws_frame_too_short() {
    assert!(parse_websocket_frame(b"").is_none());
    assert!(parse_websocket_frame(b"\x81").is_none());
}

#[test]
fn ws_frame_64bit_length() {
    // 127 length indicator → 8-byte extended length
    let mut buf = vec![0x81, 0x7F];
    buf.extend_from_slice(&[0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05]); // 5 bytes
    buf.extend_from_slice(b"hello");
    let result = parse_websocket_frame(&buf);
    assert!(result.is_some());
}

// ---------------------------------------------------------------------------
// gRPC adversarial tests
// ---------------------------------------------------------------------------

#[test]
fn grpc_msg_len_exceeds_buffer() {
    // Claim 1000 bytes of proto, only provide 5
    let buf = [0x00, 0x00, 0x00, 0x03, 0xE8, 0x08, 0x01, 0x10, 0x02, 0x18];
    let fields = decode_grpc_fields(&buf);
    // Should handle gracefully, returning whatever it can parse
    let _ = fields;
}

#[test]
fn grpc_too_short() {
    assert!(decode_grpc_fields(b"").is_empty());
    assert!(decode_grpc_fields(b"\x00\x00").is_empty());
}

#[test]
fn grpc_zero_length_message() {
    let buf = [0x00, 0x00, 0x00, 0x00, 0x00];
    let fields = decode_grpc_fields(&buf);
    assert!(fields.is_empty());
}

// ---------------------------------------------------------------------------
// MCP SSE adversarial tests
// ---------------------------------------------------------------------------

#[test]
fn mcp_sse_with_null_bytes() {
    let mut data = b"data: {\"jsonrpc\":\"2.0\",\"method\":\"test\"".to_vec();
    data.push(0x00);
    data.extend_from_slice(b",\"id\":1}\n");
    let events = parse_sse_events(&data);
    // May or may not parse, but must not panic
    let _ = events;
}

#[test]
fn mcp_sse_empty() {
    assert!(parse_sse_events(b"").is_empty());
}

#[test]
fn mcp_sse_no_data_prefix() {
    let events = parse_sse_events(b"event: message\nid: 123\n\n");
    assert!(events.is_empty());
}

#[test]
fn mcp_sse_invalid_json() {
    let events = parse_sse_events(b"data: {not valid json}\n");
    assert!(events.is_empty());
}

#[test]
fn mcp_sse_done_marker() {
    let events = parse_sse_events(b"data: [DONE]\n");
    assert!(events.is_empty());
}

// ---------------------------------------------------------------------------
// PII redaction adversarial tests
// ---------------------------------------------------------------------------

#[test]
fn redaction_empty_string() {
    assert_eq!(redact_pii(""), "");
}

#[test]
fn redaction_binary_like_string() {
    let input = "\x00\x01\x02\x7e\x7f";
    let _ = redact_pii(input); // must not panic
}

#[test]
fn redaction_extremely_long_input() {
    let input = "a".repeat(100_000);
    let output = redact_pii(&input);
    assert_eq!(output.len(), 100_000); // no PII, should be unchanged
}

#[test]
fn redaction_overlapping_patterns() {
    // Email inside a JWT-like string
    let input = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyQGV4YW1wbGUuY29tIn0.signature_here_abcdef";
    let output = redact_pii(input);
    assert!(output.contains("PII_")); // something should be redacted
}

// ---------------------------------------------------------------------------
// QUIC adversarial tests
// ---------------------------------------------------------------------------

#[test]
fn quic_empty_input() {
    assert!(parse_quic_header(b"").is_none());
}

#[test]
fn quic_single_byte() {
    assert!(parse_quic_header(&[0xC0]).is_none());
}

#[test]
fn quic_all_zeros() {
    let data = [0u8; 100];
    // All zeros has bit 7 = 0, bit 6 = 0 → not valid QUIC
    assert!(parse_quic_header(&data).is_none());
}

#[test]
fn quic_all_ff() {
    let data = [0xFFu8; 100];
    // 0xFF → long header, version = 0xFFFFFFFF, DCID len = 0xFF (>20 → invalid)
    assert!(parse_quic_header(&data).is_none());
}

#[test]
fn quic_truncated_after_version() {
    // Long header + version, but no DCID length
    let data = [0xC0, 0x00, 0x00, 0x00, 0x01];
    assert!(parse_quic_header(&data).is_none());
}

#[test]
fn quic_dcid_len_exceeds_buffer() {
    let mut pkt = Vec::new();
    pkt.push(0xC0);
    pkt.extend_from_slice(&QUIC_V1.to_be_bytes());
    pkt.push(20); // DCID len = 20 but only provide 5 bytes
    pkt.extend_from_slice(&[0xAA; 5]);
    assert!(parse_quic_header(&pkt).is_none());
}

#[test]
fn quic_scid_len_exceeds_buffer() {
    let mut pkt = Vec::new();
    pkt.push(0xC0);
    pkt.extend_from_slice(&QUIC_V1.to_be_bytes());
    pkt.push(4); // DCID len
    pkt.extend_from_slice(&[0x01, 0x02, 0x03, 0x04]);
    pkt.push(20); // SCID len = 20 but only provide 3
    pkt.extend_from_slice(&[0xAA; 3]);
    assert!(parse_quic_header(&pkt).is_none());
}

#[test]
fn quic_short_header_not_enough_for_dcid() {
    // Fixed bit set (0x40) but only 4 bytes → needs 1 + 8 = 9
    let data = [0x40, 0x01, 0x02, 0x03];
    assert!(parse_quic_header(&data).is_none());
}

#[test]
fn quic_initial_v1_parse() {
    let mut pkt = Vec::new();
    pkt.push(0xC0); // Initial V1
    pkt.extend_from_slice(&QUIC_V1.to_be_bytes());
    pkt.push(8);
    pkt.extend_from_slice(&[0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    pkt.push(0);
    let info = parse_quic_header(&pkt).unwrap();
    assert_eq!(info.packet_type, QuicPacketType::Initial);
    assert_eq!(info.version, QUIC_V1);
    assert!(info.is_long_header);
}

#[test]
fn quic_initial_v2_parse() {
    let mut pkt = Vec::new();
    pkt.push(0xD0); // Initial V2 (type bits = 0x01)
    pkt.extend_from_slice(&QUIC_V2.to_be_bytes());
    pkt.push(4);
    pkt.extend_from_slice(&[0xAA, 0xBB, 0xCC, 0xDD]);
    pkt.push(4);
    pkt.extend_from_slice(&[0x11, 0x22, 0x33, 0x44]);
    let info = parse_quic_header(&pkt).unwrap();
    assert_eq!(info.packet_type, QuicPacketType::Initial);
}

#[test]
fn quic_handshake_parse() {
    let mut pkt = Vec::new();
    pkt.push(0xE0); // Handshake V1 (type = 0x02)
    pkt.extend_from_slice(&QUIC_V1.to_be_bytes());
    pkt.push(4);
    pkt.extend_from_slice(&[0x01, 0x02, 0x03, 0x04]);
    pkt.push(0);
    let info = parse_quic_header(&pkt).unwrap();
    assert_eq!(info.packet_type, QuicPacketType::Handshake);
}

#[test]
fn quic_version_negotiation() {
    let mut pkt = Vec::new();
    pkt.push(0x80);
    pkt.extend_from_slice(&0u32.to_be_bytes());
    pkt.push(4);
    pkt.extend_from_slice(&[0x01, 0x02, 0x03, 0x04]);
    pkt.push(4);
    pkt.extend_from_slice(&[0x05, 0x06, 0x07, 0x08]);
    let info = parse_quic_header(&pkt).unwrap();
    assert_eq!(info.packet_type, QuicPacketType::VersionNegotiation);
}

#[test]
fn quic_short_header_parse() {
    let mut pkt = vec![0x40]; // Short header
    pkt.extend_from_slice(&[0xAA; 8]); // 8-byte DCID
    pkt.extend_from_slice(&[0x00; 4]); // payload
    let info = parse_quic_header(&pkt).unwrap();
    assert_eq!(info.packet_type, QuicPacketType::Short);
    assert!(!info.is_long_header);
}

#[test]
fn quic_is_initial_detects_v1() {
    let mut pkt = Vec::new();
    pkt.push(0xC0);
    pkt.extend_from_slice(&QUIC_V1.to_be_bytes());
    pkt.push(4);
    pkt.extend_from_slice(&[0; 4]);
    pkt.push(0);
    assert!(is_quic_initial(&pkt));
}

#[test]
fn quic_is_initial_rejects_short() {
    let pkt = vec![0x40, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08];
    assert!(!is_quic_initial(&pkt));
}

#[test]
fn quic_is_initial_rejects_http() {
    assert!(!is_quic_initial(b"GET / HTTP/1.1\r\n"));
}

#[test]
fn quic_likely_quic_port_443() {
    let mut pkt = Vec::new();
    pkt.push(0xC0);
    pkt.extend_from_slice(&QUIC_V1.to_be_bytes());
    pkt.extend_from_slice(&[0; 20]);
    assert!(is_likely_quic(&pkt, 443));
    assert!(!is_likely_quic(&pkt, 80));
}

#[test]
fn quic_max_cid_boundary() {
    let mut pkt = Vec::new();
    pkt.push(0xC0);
    pkt.extend_from_slice(&QUIC_V1.to_be_bytes());
    pkt.push(20); // Max
    pkt.extend_from_slice(&[0xAA; 20]);
    pkt.push(20);
    pkt.extend_from_slice(&[0xBB; 20]);
    let info = parse_quic_header(&pkt).unwrap();
    assert_eq!(info.dcid.len(), 20);
    assert_eq!(info.scid.len(), 20);
}

#[test]
fn quic_just_over_max_cid() {
    let mut pkt = Vec::new();
    pkt.push(0xC0);
    pkt.extend_from_slice(&QUIC_V1.to_be_bytes());
    pkt.push(21); // Over max → invalid
    pkt.extend_from_slice(&[0; 50]);
    assert!(parse_quic_header(&pkt).is_none());
}

#[test]
fn quic_fuzz_every_first_byte() {
    for b in 0..=255u8 {
        let mut data = vec![b];
        data.extend_from_slice(&[0x00, 0x00, 0x00, 0x01, 0x04, 0x01, 0x02, 0x03, 0x04, 0x00]);
        let _ = parse_quic_header(&data); // must not panic
    }
}

#[test]
fn quic_retry_packet() {
    let mut pkt = Vec::new();
    pkt.push(0xF0); // Retry V1 (type = 0x03)
    pkt.extend_from_slice(&QUIC_V1.to_be_bytes());
    pkt.push(4);
    pkt.extend_from_slice(&[0x01, 0x02, 0x03, 0x04]);
    pkt.push(0);
    let info = parse_quic_header(&pkt).unwrap();
    assert_eq!(info.packet_type, QuicPacketType::Retry);
}

#[test]
fn quic_zero_rtt_packet() {
    let mut pkt = Vec::new();
    pkt.push(0xD0); // 0-RTT V1 (type = 0x01)
    pkt.extend_from_slice(&QUIC_V1.to_be_bytes());
    pkt.push(4);
    pkt.extend_from_slice(&[0x01, 0x02, 0x03, 0x04]);
    pkt.push(0);
    let info = parse_quic_header(&pkt).unwrap();
    assert_eq!(info.packet_type, QuicPacketType::ZeroRTT);
}
