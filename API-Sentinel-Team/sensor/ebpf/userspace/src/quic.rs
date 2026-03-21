//! QUIC packet parser for HTTP/3 detection.
//!
//! Parses QUIC long and short headers to extract connection IDs, version,
//! and packet types. This enables the sensor to detect QUIC traffic on
//! UDP port 443 and correlate it with HTTP/3.
//!
//! Reference: RFC 9000 (QUIC Transport Protocol)

use std::fmt;

// ---------------------------------------------------------------------------
// QUIC version constants
// ---------------------------------------------------------------------------

/// QUIC version 1 (RFC 9000)
pub const QUIC_V1: u32 = 0x00000001;
/// QUIC version 2 (RFC 9369)
pub const QUIC_V2: u32 = 0x6b3343cf;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QuicPacketType {
    Initial,
    ZeroRTT,
    Handshake,
    Retry,
    Short,
    VersionNegotiation,
    Unknown,
}

impl fmt::Display for QuicPacketType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            QuicPacketType::Initial => write!(f, "Initial"),
            QuicPacketType::ZeroRTT => write!(f, "0-RTT"),
            QuicPacketType::Handshake => write!(f, "Handshake"),
            QuicPacketType::Retry => write!(f, "Retry"),
            QuicPacketType::Short => write!(f, "Short"),
            QuicPacketType::VersionNegotiation => write!(f, "VersionNegotiation"),
            QuicPacketType::Unknown => write!(f, "Unknown"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct QuicPacketInfo {
    /// QUIC version (0 for Short headers and Version Negotiation)
    pub version: u32,
    /// Destination Connection ID
    pub dcid: Vec<u8>,
    /// Source Connection ID (empty for Short headers)
    pub scid: Vec<u8>,
    /// Packet type
    pub packet_type: QuicPacketType,
    /// Total header length parsed
    pub header_len: usize,
    /// Whether this is a long header packet
    pub is_long_header: bool,
}

/// Key for tracking QUIC connections (uses DCID as primary identifier).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct QuicConnKey {
    /// Destination Connection ID (primary key for QUIC connections)
    pub dcid: Vec<u8>,
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/// Parse a QUIC packet header from raw UDP payload.
///
/// Supports both long headers (Initial, Handshake, 0-RTT, Retry, Version Negotiation)
/// and short headers (1-RTT data).
///
/// Returns None if the data is too short or doesn't look like QUIC.
pub fn parse_quic_header(data: &[u8]) -> Option<QuicPacketInfo> {
    if data.is_empty() {
        return None;
    }

    let first_byte = data[0];

    // Check fixed bit (bit 6) — MUST be 1 for QUIC
    // Exception: Version Negotiation doesn't require it
    let is_long_header = (first_byte & 0x80) != 0;

    if is_long_header {
        parse_long_header(data)
    } else {
        parse_short_header(data)
    }
}

/// Parse a QUIC long header packet.
///
/// Long Header format (RFC 9000 §17.2):
/// ```text
/// +-+-+-+-+-+-+-+-+
/// |1|1|T T|X X X X|  (Header Form=1, Fixed=1, Type=TT)
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |                         Version (32)                         |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// | DCID Len (8)  |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |               Destination Connection ID (0..160)             |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// | SCID Len (8)  |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |                 Source Connection ID (0..160)                 |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// ```
fn parse_long_header(data: &[u8]) -> Option<QuicPacketInfo> {
    // Minimum: 1 (flags) + 4 (version) + 1 (dcid_len) + 1 (scid_len) = 7
    if data.len() < 7 {
        return None;
    }

    let first_byte = data[0];
    let version = u32::from_be_bytes([data[1], data[2], data[3], data[4]]);

    let dcid_len = data[5] as usize;
    // DCID length must be <= 20 (RFC 9000 §17.2)
    if dcid_len > 20 {
        return None;
    }

    let dcid_end = 6 + dcid_len;
    if data.len() < dcid_end + 1 {
        return None;
    }

    let dcid = data[6..dcid_end].to_vec();

    let scid_len = data[dcid_end] as usize;
    if scid_len > 20 {
        return None;
    }

    let scid_end = dcid_end + 1 + scid_len;
    if data.len() < scid_end {
        return None;
    }

    let scid = data[dcid_end + 1..scid_end].to_vec();

    // Version Negotiation: version == 0
    if version == 0 {
        return Some(QuicPacketInfo {
            version,
            dcid,
            scid,
            packet_type: QuicPacketType::VersionNegotiation,
            header_len: scid_end,
            is_long_header: true,
        });
    }

    // Determine packet type from first byte bits 4-5
    let pkt_type = match version {
        QUIC_V1 => match (first_byte & 0x30) >> 4 {
            0x00 => QuicPacketType::Initial,
            0x01 => QuicPacketType::ZeroRTT,
            0x02 => QuicPacketType::Handshake,
            0x03 => QuicPacketType::Retry,
            _ => QuicPacketType::Unknown,
        },
        QUIC_V2 => match (first_byte & 0x30) >> 4 {
            0x00 => QuicPacketType::Retry,
            0x01 => QuicPacketType::Initial,
            0x02 => QuicPacketType::ZeroRTT,
            0x03 => QuicPacketType::Handshake,
            _ => QuicPacketType::Unknown,
        },
        _ => {
            // Unknown QUIC version — try to parse anyway
            match (first_byte & 0x30) >> 4 {
                0x00 => QuicPacketType::Initial,
                0x01 => QuicPacketType::ZeroRTT,
                0x02 => QuicPacketType::Handshake,
                0x03 => QuicPacketType::Retry,
                _ => QuicPacketType::Unknown,
            }
        }
    };

    Some(QuicPacketInfo {
        version,
        dcid,
        scid,
        packet_type: pkt_type,
        header_len: scid_end,
        is_long_header: true,
    })
}

/// Parse a QUIC short header (1-RTT) packet.
///
/// Short Header format (RFC 9000 §17.3):
/// ```text
/// +-+-+-+-+-+-+-+-+
/// |0|1|S|R|R|K|P P|  (Header Form=0, Fixed=1)
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |                Destination Connection ID (*)                 |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// ```
///
/// The DCID length is negotiated during handshake and not encoded in the header.
/// We use a heuristic: default QUIC implementations use 8-20 byte CIDs.
/// We'll try to detect the length from context or default to 8.
fn parse_short_header(data: &[u8]) -> Option<QuicPacketInfo> {
    let first_byte = data[0];

    // Fixed bit (bit 6) must be 1
    if first_byte & 0x40 == 0 {
        return None;
    }

    // Short headers don't contain version — use 0
    // DCID length is implied (not encoded). Default to 8 bytes.
    let dcid_len: usize = 8;

    if data.len() < 1 + dcid_len {
        return None;
    }

    let dcid = data[1..1 + dcid_len].to_vec();

    Some(QuicPacketInfo {
        version: 0,
        dcid,
        scid: Vec::new(),
        packet_type: QuicPacketType::Short,
        header_len: 1 + dcid_len,
        is_long_header: false,
    })
}

/// Check if data looks like a QUIC Initial packet.
/// Used as a fast pre-filter before full parsing.
pub fn is_quic_initial(data: &[u8]) -> bool {
    if data.len() < 7 {
        return false;
    }

    let first_byte = data[0];
    // Long header: bit 7 = 1, fixed bit 6 = 1
    if first_byte & 0xC0 != 0xC0 {
        return false;
    }

    let version = u32::from_be_bytes([data[1], data[2], data[3], data[4]]);

    match version {
        QUIC_V1 => (first_byte & 0x30) >> 4 == 0x00,
        QUIC_V2 => (first_byte & 0x30) >> 4 == 0x01,
        0 => false, // Version Negotiation
        _ => (first_byte & 0x30) >> 4 == 0x00, // Assume V1-like
    }
}

/// Check if data on a given port is likely QUIC traffic.
/// QUIC typically runs on UDP port 443 or 8443.
pub fn is_likely_quic(data: &[u8], dst_port: u16) -> bool {
    if data.is_empty() {
        return false;
    }

    // Common QUIC ports
    let quic_port = matches!(dst_port, 443 | 8443 | 4433);

    if !quic_port {
        return false;
    }

    let first_byte = data[0];

    // Long header (bit 7 = 1) with fixed bit (bit 6 = 1)
    if first_byte & 0xC0 == 0xC0 {
        // Check for known QUIC version
        if data.len() >= 5 {
            let version = u32::from_be_bytes([data[1], data[2], data[3], data[4]]);
            return matches!(version, QUIC_V1 | QUIC_V2) || version == 0;
        }
    }

    // Short header (bit 7 = 0, bit 6 = 1)
    if first_byte & 0xC0 == 0x40 {
        return true;
    }

    false
}

/// Extract a human-readable version string from a QUIC version number.
pub fn quic_version_string(version: u32) -> &'static str {
    match version {
        QUIC_V1 => "QUICv1",
        QUIC_V2 => "QUICv2",
        0 => "VersionNegotiation",
        _ => "Unknown",
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // QUIC V1 Initial packet (crafted)
    fn make_quic_v1_initial() -> Vec<u8> {
        let mut pkt = Vec::new();
        // First byte: Long header (0x80) | Fixed bit (0x40) | Initial type (0x00)
        pkt.push(0xC0);
        // Version: QUIC V1
        pkt.extend_from_slice(&QUIC_V1.to_be_bytes());
        // DCID length: 8
        pkt.push(0x08);
        // DCID: 8 bytes
        pkt.extend_from_slice(&[0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
        // SCID length: 0
        pkt.push(0x00);
        // Token length (varint): 0
        pkt.push(0x00);
        // Payload length (varint): 4
        pkt.push(0x04);
        // Packet number + payload
        pkt.extend_from_slice(&[0x00, 0x00, 0x00, 0x01]);
        pkt
    }

    fn make_quic_v2_initial() -> Vec<u8> {
        let mut pkt = Vec::new();
        // First byte: Long header | Fixed bit | V2 Initial type (0x10)
        pkt.push(0xD0);
        // Version: QUIC V2
        pkt.extend_from_slice(&QUIC_V2.to_be_bytes());
        // DCID length: 4
        pkt.push(0x04);
        pkt.extend_from_slice(&[0xAA, 0xBB, 0xCC, 0xDD]);
        // SCID length: 4
        pkt.push(0x04);
        pkt.extend_from_slice(&[0x11, 0x22, 0x33, 0x44]);
        pkt
    }

    fn make_version_negotiation() -> Vec<u8> {
        let mut pkt = Vec::new();
        pkt.push(0x80); // Long header, no fixed bit required
        // Version: 0 (Version Negotiation)
        pkt.extend_from_slice(&0u32.to_be_bytes());
        // DCID len: 4
        pkt.push(0x04);
        pkt.extend_from_slice(&[0x01, 0x02, 0x03, 0x04]);
        // SCID len: 4
        pkt.push(0x04);
        pkt.extend_from_slice(&[0x05, 0x06, 0x07, 0x08]);
        // Supported versions
        pkt.extend_from_slice(&QUIC_V1.to_be_bytes());
        pkt
    }

    fn make_short_header() -> Vec<u8> {
        let mut pkt = Vec::new();
        // First byte: Short header (0x00) | Fixed bit (0x40)
        pkt.push(0x40);
        // DCID: 8 bytes (default length)
        pkt.extend_from_slice(&[0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x11, 0x22]);
        // Packet number + encrypted payload
        pkt.extend_from_slice(&[0x00, 0x01, 0x02, 0x03]);
        pkt
    }

    #[test]
    fn test_parse_v1_initial() {
        let pkt = make_quic_v1_initial();
        let info = parse_quic_header(&pkt).unwrap();
        assert_eq!(info.version, QUIC_V1);
        assert_eq!(info.packet_type, QuicPacketType::Initial);
        assert_eq!(info.dcid, vec![0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
        assert!(info.scid.is_empty());
        assert!(info.is_long_header);
    }

    #[test]
    fn test_parse_v2_initial() {
        let pkt = make_quic_v2_initial();
        let info = parse_quic_header(&pkt).unwrap();
        assert_eq!(info.version, QUIC_V2);
        assert_eq!(info.packet_type, QuicPacketType::Initial);
        assert_eq!(info.dcid, vec![0xAA, 0xBB, 0xCC, 0xDD]);
        assert_eq!(info.scid, vec![0x11, 0x22, 0x33, 0x44]);
    }

    #[test]
    fn test_parse_version_negotiation() {
        let pkt = make_version_negotiation();
        let info = parse_quic_header(&pkt).unwrap();
        assert_eq!(info.version, 0);
        assert_eq!(info.packet_type, QuicPacketType::VersionNegotiation);
    }

    #[test]
    fn test_parse_short_header() {
        let pkt = make_short_header();
        let info = parse_quic_header(&pkt).unwrap();
        assert_eq!(info.packet_type, QuicPacketType::Short);
        assert!(!info.is_long_header);
        assert_eq!(info.dcid.len(), 8);
    }

    #[test]
    fn test_parse_handshake() {
        let mut pkt = Vec::new();
        // V1 Handshake: type bits = 0x02 → 0x20
        pkt.push(0xC0 | 0x20); // 0xE0
        pkt.extend_from_slice(&QUIC_V1.to_be_bytes());
        pkt.push(0x04); // DCID len
        pkt.extend_from_slice(&[0x01, 0x02, 0x03, 0x04]);
        pkt.push(0x00); // SCID len

        let info = parse_quic_header(&pkt).unwrap();
        assert_eq!(info.packet_type, QuicPacketType::Handshake);
    }

    #[test]
    fn test_parse_zero_rtt() {
        let mut pkt = Vec::new();
        // V1 0-RTT: type bits = 0x01 → 0x10
        pkt.push(0xC0 | 0x10); // 0xD0
        pkt.extend_from_slice(&QUIC_V1.to_be_bytes());
        pkt.push(0x04);
        pkt.extend_from_slice(&[0x01, 0x02, 0x03, 0x04]);
        pkt.push(0x00);

        let info = parse_quic_header(&pkt).unwrap();
        assert_eq!(info.packet_type, QuicPacketType::ZeroRTT);
    }

    #[test]
    fn test_parse_retry() {
        let mut pkt = Vec::new();
        // V1 Retry: type bits = 0x03 → 0x30
        pkt.push(0xC0 | 0x30); // 0xF0
        pkt.extend_from_slice(&QUIC_V1.to_be_bytes());
        pkt.push(0x04);
        pkt.extend_from_slice(&[0x01, 0x02, 0x03, 0x04]);
        pkt.push(0x00);

        let info = parse_quic_header(&pkt).unwrap();
        assert_eq!(info.packet_type, QuicPacketType::Retry);
    }

    #[test]
    fn test_parse_empty() {
        assert!(parse_quic_header(b"").is_none());
    }

    #[test]
    fn test_parse_too_short() {
        assert!(parse_quic_header(&[0xC0, 0x00]).is_none());
    }

    #[test]
    fn test_parse_invalid_dcid_len() {
        let mut pkt = Vec::new();
        pkt.push(0xC0);
        pkt.extend_from_slice(&QUIC_V1.to_be_bytes());
        pkt.push(0xFF); // DCID len = 255 (invalid, max is 20)
        pkt.extend_from_slice(&[0; 50]);

        assert!(parse_quic_header(&pkt).is_none());
    }

    #[test]
    fn test_parse_truncated_dcid() {
        let mut pkt = Vec::new();
        pkt.push(0xC0);
        pkt.extend_from_slice(&QUIC_V1.to_be_bytes());
        pkt.push(0x08); // DCID len = 8, but only provide 3
        pkt.extend_from_slice(&[0x01, 0x02, 0x03]);

        assert!(parse_quic_header(&pkt).is_none());
    }

    #[test]
    fn test_short_header_missing_fixed_bit() {
        // bit 7 = 0, bit 6 = 0 → NOT valid QUIC
        let pkt = [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09];
        assert!(parse_quic_header(&pkt).is_none());
    }

    #[test]
    fn test_short_header_too_short() {
        // Valid first byte but not enough for default 8-byte DCID
        let pkt = [0x40, 0x01, 0x02];
        assert!(parse_quic_header(&pkt).is_none());
    }

    #[test]
    fn test_is_quic_initial_v1() {
        let pkt = make_quic_v1_initial();
        assert!(is_quic_initial(&pkt));
    }

    #[test]
    fn test_is_quic_initial_v2() {
        let pkt = make_quic_v2_initial();
        assert!(is_quic_initial(&pkt));
    }

    #[test]
    fn test_is_quic_initial_short_header() {
        let pkt = make_short_header();
        assert!(!is_quic_initial(&pkt));
    }

    #[test]
    fn test_is_quic_initial_garbage() {
        assert!(!is_quic_initial(b"HTTP/1.1 200 OK"));
        assert!(!is_quic_initial(b""));
        assert!(!is_quic_initial(&[0xFF; 100]));
    }

    #[test]
    fn test_is_likely_quic_port_443() {
        let pkt = make_quic_v1_initial();
        assert!(is_likely_quic(&pkt, 443));
        assert!(is_likely_quic(&pkt, 8443));
        assert!(!is_likely_quic(&pkt, 80));
    }

    #[test]
    fn test_is_likely_quic_short_header() {
        let pkt = make_short_header();
        assert!(is_likely_quic(&pkt, 443));
    }

    #[test]
    fn test_is_likely_quic_empty() {
        assert!(!is_likely_quic(b"", 443));
    }

    #[test]
    fn test_version_string() {
        assert_eq!(quic_version_string(QUIC_V1), "QUICv1");
        assert_eq!(quic_version_string(QUIC_V2), "QUICv2");
        assert_eq!(quic_version_string(0), "VersionNegotiation");
        assert_eq!(quic_version_string(0xDEADBEEF), "Unknown");
    }

    #[test]
    fn test_quic_conn_key_hash() {
        use std::collections::HashSet;
        let mut set = HashSet::new();
        let k1 = QuicConnKey {
            dcid: vec![1, 2, 3, 4],
        };
        let k2 = QuicConnKey {
            dcid: vec![5, 6, 7, 8],
        };
        set.insert(k1.clone());
        set.insert(k2.clone());
        assert_eq!(set.len(), 2);
        assert!(set.contains(&k1));
    }

    #[test]
    fn test_display_packet_type() {
        assert_eq!(format!("{}", QuicPacketType::Initial), "Initial");
        assert_eq!(format!("{}", QuicPacketType::ZeroRTT), "0-RTT");
        assert_eq!(format!("{}", QuicPacketType::Handshake), "Handshake");
        assert_eq!(format!("{}", QuicPacketType::Short), "Short");
    }

    // Adversarial tests
    #[test]
    fn test_fuzz_all_single_bytes() {
        for b in 0..=255u8 {
            let _ = parse_quic_header(&[b]);
        }
    }

    #[test]
    fn test_fuzz_repeated_pattern() {
        let data = vec![0xC0; 1024];
        let _ = parse_quic_header(&data);
    }

    #[test]
    fn test_max_cid_lengths() {
        let mut pkt = Vec::new();
        pkt.push(0xC0);
        pkt.extend_from_slice(&QUIC_V1.to_be_bytes());
        pkt.push(20); // Max DCID length
        pkt.extend_from_slice(&[0xAA; 20]);
        pkt.push(20); // Max SCID length
        pkt.extend_from_slice(&[0xBB; 20]);

        let info = parse_quic_header(&pkt).unwrap();
        assert_eq!(info.dcid.len(), 20);
        assert_eq!(info.scid.len(), 20);
    }

    #[test]
    fn test_zero_cid_lengths() {
        let mut pkt = Vec::new();
        pkt.push(0xC0);
        pkt.extend_from_slice(&QUIC_V1.to_be_bytes());
        pkt.push(0); // DCID length = 0
        pkt.push(0); // SCID length = 0

        let info = parse_quic_header(&pkt).unwrap();
        assert!(info.dcid.is_empty());
        assert!(info.scid.is_empty());
    }
}
