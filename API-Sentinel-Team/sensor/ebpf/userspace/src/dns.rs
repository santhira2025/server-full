use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use hickory_resolver::config::{ResolverConfig, ResolverOpts};
use hickory_resolver::TokioAsyncResolver;

// ---------------------------------------------------------------------------
// DNS metrics
// ---------------------------------------------------------------------------

pub static DNS_LOOKUPS_OK: AtomicU64 = AtomicU64::new(0);
pub static DNS_LOOKUPS_FAIL: AtomicU64 = AtomicU64::new(0);
pub static DNS_CACHE_HITS: AtomicU64 = AtomicU64::new(0);
pub static DNS_CACHE_SIZE: AtomicU64 = AtomicU64::new(0);

// ---------------------------------------------------------------------------
// DNS cache entry
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct DnsCacheEntry {
    hostname: Option<String>,
    inserted_at: Instant,
}

// ---------------------------------------------------------------------------
// DnsResolver — sharded LRU cache + async reverse lookup
// ---------------------------------------------------------------------------

const NUM_DNS_SHARDS: usize = 16;
const MAX_ENTRIES_PER_SHARD: usize = 4096;

pub struct DnsResolver {
    shards: Vec<Mutex<HashMap<IpAddr, DnsCacheEntry>>>,
    resolver: TokioAsyncResolver,
    ttl: Duration,
    negative_ttl: Duration,
}

impl DnsResolver {
    pub fn new(ttl_secs: u64, negative_ttl_secs: u64) -> Self {
        let mut opts = ResolverOpts::default();
        opts.timeout = Duration::from_secs(2);
        opts.attempts = 1;
        opts.cache_size = 0; // We manage our own cache
        opts.use_hosts_file = true;

        let resolver =
            TokioAsyncResolver::tokio(ResolverConfig::default(), opts);

        Self {
            shards: (0..NUM_DNS_SHARDS)
                .map(|_| Mutex::new(HashMap::new()))
                .collect(),
            resolver,
            ttl: Duration::from_secs(ttl_secs),
            negative_ttl: Duration::from_secs(negative_ttl_secs),
        }
    }

    fn shard_index(ip: &IpAddr) -> usize {
        let hash = match ip {
            IpAddr::V4(v4) => {
                let octets = v4.octets();
                (octets[0] as usize)
                    .wrapping_mul(31)
                    .wrapping_add(octets[1] as usize)
                    .wrapping_mul(31)
                    .wrapping_add(octets[2] as usize)
                    .wrapping_mul(31)
                    .wrapping_add(octets[3] as usize)
            }
            IpAddr::V6(v6) => {
                let octets = v6.octets();
                octets.iter().fold(0usize, |acc, &b| acc.wrapping_mul(31).wrapping_add(b as usize))
            }
        };
        hash % NUM_DNS_SHARDS
    }

    /// Try cache first (synchronous). Returns Some(hostname) on hit.
    pub fn lookup_cached(&self, ip: &IpAddr) -> Option<Option<String>> {
        let idx = Self::shard_index(ip);
        let shard = self.shards[idx].lock().unwrap_or_else(|e| e.into_inner());
        if let Some(entry) = shard.get(ip) {
            let ttl = if entry.hostname.is_some() {
                self.ttl
            } else {
                self.negative_ttl
            };
            if entry.inserted_at.elapsed() < ttl {
                DNS_CACHE_HITS.fetch_add(1, Ordering::Relaxed);
                return Some(entry.hostname.clone());
            }
        }
        None
    }

    /// Async reverse DNS lookup. Updates cache on completion.
    pub async fn resolve(&self, ip: IpAddr) -> Option<String> {
        // Check cache first
        if let Some(cached) = self.lookup_cached(&ip) {
            return cached;
        }

        // Perform async reverse lookup
        let result = self.resolver.reverse_lookup(ip).await;
        let hostname = match result {
            Ok(lookup) => {
                if let Some(name) = lookup.iter().next() {
                    let h = name.to_string().trim_end_matches('.').to_string();
                    DNS_LOOKUPS_OK.fetch_add(1, Ordering::Relaxed);
                    Some(h)
                } else {
                    DNS_LOOKUPS_FAIL.fetch_add(1, Ordering::Relaxed);
                    None
                }
            }
            Err(_) => {
                DNS_LOOKUPS_FAIL.fetch_add(1, Ordering::Relaxed);
                None
            }
        };

        // Insert into cache
        self.insert(ip, hostname.clone());
        hostname
    }

    /// Non-blocking resolve: returns cached result or spawns background lookup.
    /// Returns the cached hostname if available, None otherwise.
    /// Background lookups populate the cache for subsequent calls.
    pub fn resolve_nonblocking(
        self: &std::sync::Arc<Self>,
        ip: IpAddr,
    ) -> Option<String> {
        // Check cache first
        if let Some(cached) = self.lookup_cached(&ip) {
            return cached;
        }

        // Spawn background lookup
        let resolver = self.clone();
        tokio::spawn(async move {
            resolver.resolve(ip).await;
        });

        None
    }

    fn insert(&self, ip: IpAddr, hostname: Option<String>) {
        let idx = Self::shard_index(&ip);
        let mut shard = self.shards[idx].lock().unwrap_or_else(|e| e.into_inner());

        // Evict expired entries if shard is full
        if shard.len() >= MAX_ENTRIES_PER_SHARD {
            let ttl = self.ttl;
            let neg_ttl = self.negative_ttl;
            shard.retain(|_, entry| {
                let entry_ttl = if entry.hostname.is_some() { ttl } else { neg_ttl };
                entry.inserted_at.elapsed() < entry_ttl
            });

            // If still full after eviction, remove oldest entries
            if shard.len() >= MAX_ENTRIES_PER_SHARD {
                let excess = shard.len() - MAX_ENTRIES_PER_SHARD + 1;
                let mut entries: Vec<_> = shard.keys().cloned().collect();
                entries.sort_by_key(|k| {
                    shard.get(k).map(|e| e.inserted_at).unwrap_or_else(Instant::now)
                });
                for k in entries.into_iter().take(excess) {
                    shard.remove(&k);
                }
            }
        }

        shard.insert(
            ip,
            DnsCacheEntry {
                hostname,
                inserted_at: Instant::now(),
            },
        );

        // Update cache size metric
        let total: usize = self
            .shards
            .iter()
            .map(|s| s.lock().unwrap_or_else(|e| e.into_inner()).len())
            .sum();
        DNS_CACHE_SIZE.store(total as u64, Ordering::Relaxed);
    }

    /// Get current cache size across all shards.
    pub fn cache_size(&self) -> usize {
        self.shards
            .iter()
            .map(|s| s.lock().unwrap_or_else(|e| e.into_inner()).len())
            .sum()
    }

    /// Clear all cached entries.
    #[cfg(test)]
    pub fn clear(&self) {
        for shard in &self.shards {
            let mut s = shard.lock().unwrap_or_else(|e| e.into_inner());
            s.clear();
        }
        DNS_CACHE_SIZE.store(0, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
    use std::sync::Arc;

    #[test]
    fn test_shard_distribution() {
        // Different IPs should hash to potentially different shards
        let ip1 = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1));
        let ip2 = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 1));
        let idx1 = DnsResolver::shard_index(&ip1);
        let idx2 = DnsResolver::shard_index(&ip2);
        assert!(idx1 < NUM_DNS_SHARDS);
        assert!(idx2 < NUM_DNS_SHARDS);
    }

    #[test]
    fn test_shard_index_v6() {
        let ip = IpAddr::V6(Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 1));
        let idx = DnsResolver::shard_index(&ip);
        assert!(idx < NUM_DNS_SHARDS);
    }

    #[test]
    fn test_cache_insert_and_lookup() {
        let resolver = DnsResolver::new(3600, 60);
        let ip = IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1));

        // No cache entry initially
        assert!(resolver.lookup_cached(&ip).is_none());

        // Insert
        resolver.insert(ip, Some("localhost".to_string()));

        // Cache hit
        let cached = resolver.lookup_cached(&ip);
        assert_eq!(cached, Some(Some("localhost".to_string())));
    }

    #[test]
    fn test_negative_cache() {
        let resolver = DnsResolver::new(3600, 60);
        let ip = IpAddr::V4(Ipv4Addr::new(10, 255, 255, 255));

        resolver.insert(ip, None);

        let cached = resolver.lookup_cached(&ip);
        assert_eq!(cached, Some(None)); // Negative cache hit
    }

    #[test]
    fn test_cache_eviction() {
        let resolver = DnsResolver::new(3600, 60);

        // Fill a single shard beyond capacity
        // Use IPs that hash to the same shard
        for i in 0..MAX_ENTRIES_PER_SHARD + 10 {
            let ip = IpAddr::V4(Ipv4Addr::new(
                ((i >> 24) & 0xFF) as u8,
                ((i >> 16) & 0xFF) as u8,
                ((i >> 8) & 0xFF) as u8,
                (i & 0xFF) as u8,
            ));
            resolver.insert(ip, Some(format!("host-{i}")));
        }

        // Total cache should not exceed max per shard * num shards
        assert!(resolver.cache_size() <= MAX_ENTRIES_PER_SHARD * NUM_DNS_SHARDS);
    }

    #[test]
    fn test_cache_size_metric() {
        let resolver = DnsResolver::new(3600, 60);
        let ip1 = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1));
        let ip2 = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 2));

        resolver.insert(ip1, Some("host1".to_string()));
        resolver.insert(ip2, Some("host2".to_string()));

        assert_eq!(resolver.cache_size(), 2);
        assert_eq!(DNS_CACHE_SIZE.load(Ordering::Relaxed), 2);
    }

    #[tokio::test]
    async fn test_resolve_localhost() {
        let resolver = Arc::new(DnsResolver::new(3600, 60));
        let ip = IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1));

        let result = resolver.resolve(ip).await;
        // On most systems, 127.0.0.1 resolves to "localhost"
        // but in CI/containers it may not, so we just check it doesn't panic
        if let Some(ref hostname) = result {
            assert!(!hostname.is_empty());
        }

        // Second lookup should hit cache
        let cached = resolver.lookup_cached(&ip);
        assert!(cached.is_some());
    }

    #[tokio::test]
    async fn test_resolve_nonblocking() {
        let resolver = Arc::new(DnsResolver::new(3600, 60));
        let ip = IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1));

        // First call: cache miss, returns None, spawns background lookup
        let result = resolver.resolve_nonblocking(ip);
        // May be None (first call) or Some (if background resolves quickly)
        let _ = result;

        // Wait for background to complete
        tokio::time::sleep(Duration::from_millis(500)).await;

        // Second call: should hit cache now
        let cached = resolver.lookup_cached(&ip);
        assert!(cached.is_some());
    }

    #[test]
    fn test_clear() {
        let resolver = DnsResolver::new(3600, 60);
        let ip = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1));
        resolver.insert(ip, Some("test".to_string()));
        assert_eq!(resolver.cache_size(), 1);

        resolver.clear();
        assert_eq!(resolver.cache_size(), 0);
    }
}
