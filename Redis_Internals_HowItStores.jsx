import { useState } from "react";

const C = {
  bg: "#07070b", surface: "#0f0f16", card: "#14141d", cardHover: "#1b1b26",
  border: "#252535", primary: "#dc382d", primaryDim: "#dc382d18",
  text: "#f0f0f5", muted: "#9898b0", dim: "#55556a",
  green: "#22c55e", greenDim: "#22c55e15",
  blue: "#3b82f6", blueDim: "#3b82f615",
  yellow: "#eab308", yellowDim: "#eab30815",
  purple: "#a855f7", purpleDim: "#a855f715",
  cyan: "#06b6d4", cyanDim: "#06b6d415",
  orange: "#f97316", orangeDim: "#f9731615",
  pink: "#ec4899",
};

const Code = ({ children, title }) => (
  <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}`, margin: "12px 0" }}>
    {title && (
      <div style={{ padding: "6px 12px", background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {["#ff5f57","#febc2e","#28c840"].map(c => <div key={c} style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />)}
        </div>
        <span style={{ color: C.dim, fontSize: 10, fontFamily: "monospace", marginLeft: 4 }}>{title}</span>
      </div>
    )}
    <pre style={{
      margin: 0, padding: 14, background: "#09090d", color: "#d4d4d8",
      fontSize: 11.5, lineHeight: 1.7, fontFamily: "'JetBrains Mono', monospace",
      overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
    }}>{children}</pre>
  </div>
);

const Box = ({ color, title, children, icon }) => (
  <div style={{
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
    padding: 16, borderLeft: `3px solid ${color}`,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
      <span style={{ color, fontSize: 13, fontWeight: 700 }}>{title}</span>
    </div>
    <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.7 }}>{children}</div>
  </div>
);

const Diagram = ({ children }) => (
  <div style={{
    background: "#09090d", border: `1px solid ${C.border}`, borderRadius: 10,
    padding: 20, margin: "14px 0", fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11.5, lineHeight: 1.6, color: C.muted, overflowX: "auto",
    whiteSpace: "pre",
  }}>{children}</div>
);

const FlowStep = ({ num, title, desc, color = C.primary }) => (
  <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
    <div style={{
      width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
      background: `${color}22`, display: "flex", alignItems: "center", justifyContent: "center",
      color, fontSize: 12, fontWeight: 800, fontFamily: "monospace",
    }}>{num}</div>
    <div>
      <div style={{ color: C.text, fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{title}</div>
      <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.6 }}>{desc}</div>
    </div>
  </div>
);

const sections = [
  { id: "bigpicture", label: "Big Picture", icon: "🧠" },
  { id: "memory", label: "Memory Model", icon: "💾" },
  { id: "hashtable", label: "Key Lookup", icon: "🔍" },
  { id: "encoding", label: "Smart Encoding", icon: "⚙️" },
  { id: "lifecycle", label: "SET to GET Flow", icon: "🔄" },
  { id: "persist", label: "Persistence", icon: "💿" },
  { id: "expire", label: "Expiry & Eviction", icon: "⏰" },
];

export default function RedisInternals() {
  const [active, setActive] = useState("bigpicture");

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        padding: "32px 24px 24px", textAlign: "center",
        borderBottom: `1px solid ${C.border}`,
        background: `radial-gradient(ellipse at 50% 0%, ${C.primaryDim} 0%, transparent 50%)`,
      }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em" }}>
          How Redis <span style={{ color: C.primary }}>Actually</span> Stores Data
        </h1>
        <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
          From SET command → RAM → disk. The complete internal journey.
        </p>
      </div>

      {/* Nav */}
      <nav style={{
        display: "flex", gap: 4, padding: "10px 24px",
        borderBottom: `1px solid ${C.border}`, background: `${C.surface}dd`,
        backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100,
        overflowX: "auto", justifyContent: "center", flexWrap: "wrap",
      }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => setActive(s.id)} style={{
            padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
            fontSize: 11.5, fontWeight: active === s.id ? 600 : 400,
            background: active === s.id ? C.primaryDim : "transparent",
            color: active === s.id ? C.primary : C.muted, fontFamily: "inherit",
            transition: "all 0.15s", whiteSpace: "nowrap",
          }}>{s.icon} {s.label}</button>
        ))}
      </nav>

      <main style={{ padding: 24, maxWidth: 860, margin: "0 auto" }}>

        {/* ===== BIG PICTURE ===== */}
        {active === "bigpicture" && (<>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 16px" }}>🧠 The Big Picture — How Redis Knows Where Everything Is</h2>

          <Box color={C.cyan} icon="💡" title="One-Line Answer">
            Redis stores <span style={{ color: C.text, fontWeight: 600 }}>everything in RAM</span> as a giant hash table (dictionary). 
            Every key maps to a pointer that points to the actual data in memory. 
            That's why it's fast — zero disk I/O for reads/writes.
          </Box>

          <Diagram>{`
┌──────────────────── REDIS SERVER (Single Process) ────────────────────┐
│                                                                        │
│   ┌──────────────────── DATABASE 0 ────────────────────┐              │
│   │                                                      │              │
│   │   HASH TABLE (dict)                                  │              │
│   │   ┌────────────┬──────────────────────────────┐     │              │
│   │   │  Key Hash  │  Pointer → Value Object      │     │              │
│   │   ├────────────┼──────────────────────────────┤     │              │
│   │   │  0xA3F1... │  → "user:1001" → {Hash}      │     │              │
│   │   │  0x7B2E... │  → "price:NIFTY" → "22850"   │     │              │
│   │   │  0xD9C4... │  → "queue:orders" → [List]    │     │              │
│   │   │  0x1E8A... │  → "active:users" → {Set}     │     │              │
│   │   │  0x5F6D... │  → "rank:pnl" → {ZSet}       │     │              │
│   │   └────────────┴──────────────────────────────┘     │              │
│   │                                                      │              │
│   │   EXPIRES TABLE (separate dict)                      │              │
│   │   ┌────────────┬──────────────┐                     │              │
│   │   │  Key       │  Expire Time │                     │              │
│   │   │  price:*   │  1709136005  │                     │              │
│   │   └────────────┴──────────────┘                     │              │
│   └──────────────────────────────────────────────────────┘              │
│                                                                        │
│   DATABASE 1 ... DATABASE 15  (same structure, rarely used)           │
│                                                                        │
│   ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐             │
│   │ Event Loop  │  │ AOF Buffer  │  │ RDB Snapshotter  │             │
│   │ (single     │  │ (write log) │  │ (fork + dump)    │             │
│   │  thread)    │  │             │  │                  │             │
│   └─────────────┘  └─────────────┘  └──────────────────┘             │
└────────────────────────────────────────────────────────────────────────┘
          `}</Diagram>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
            <Box color={C.green} icon="⚡" title="Why So Fast?">
              <span style={{ color: C.text }}>All data lives in RAM.</span> No disk seek, no filesystem overhead. 
              CPU just follows a pointer in memory. A hash table lookup is O(1) — constant time 
              regardless of whether you have 100 keys or 100 million keys.
            </Box>
            <Box color={C.blue} icon="🧵" title="Single-Threaded Magic">
              Redis uses <span style={{ color: C.text }}>one thread</span> for all commands. No locks, no race conditions, 
              no context switching overhead. One command finishes completely before the next starts. 
              That's why INCR is atomic — nothing can interrupt it.
            </Box>
          </div>
        </>)}

        {/* ===== MEMORY MODEL ===== */}
        {active === "memory" && (<>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 16px" }}>💾 Memory Model — What's Actually in RAM?</h2>

          <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.7 }}>
            Every value in Redis is stored as a <span style={{ color: C.text, fontWeight: 600 }}>RedisObject</span> — 
            a C struct that wraps the actual data with metadata. This is how Redis "knows the details."
          </p>

          <Diagram>{`
┌─────────────────── RedisObject (16 bytes header) ───────────────────┐
│                                                                       │
│   type     │  4 bits  │  string, list, set, zset, hash, stream      │
│   encoding │  4 bits  │  HOW data is stored internally (see below)   │
│   lru      │  24 bits │  Last access time (for eviction)             │
│   refcount │  32 bits │  Reference counter (for memory management)   │
│   *ptr     │  64 bits │  POINTER → actual data in memory             │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
                    │
                    │ ptr points to...
                    ▼
         ┌────────────────────┐
         │  Actual Data       │
         │  (encoding varies) │
         │                    │
         │  Could be:         │
         │  • Raw C string    │
         │  • Integer         │
         │  • Ziplist         │
         │  • Hashtable       │
         │  • Skiplist        │
         │  • Quicklist       │
         │  • Listpack        │
         └────────────────────┘
          `}</Diagram>

          <Box color={C.orange} icon="🔑" title="The Key Insight">
            Redis stores <span style={{ color: C.text, fontWeight: 600 }}>two things</span> for every entry: 
            (1) The <span style={{ color: C.cyan }}>type</span> — what the user thinks it is (string, hash, list...), and 
            (2) The <span style={{ color: C.cyan }}>encoding</span> — how Redis actually stores it in memory for efficiency. 
            The user says "Hash" but Redis might store it as a ziplist (compact) or hashtable (fast), 
            depending on size.
          </Box>

          <Code title="redis-cli — see the internals yourself">{`# See what type Redis thinks it is
TYPE user:1001
# → "hash"

# See HOW Redis is encoding it internally
OBJECT ENCODING user:1001
# → "listpack"   (small hash = compact encoding)
# → "hashtable"   (large hash = fast encoding)

# See how much memory this key uses
MEMORY USAGE user:1001
# → 128 (bytes)

# See how many times this key was accessed
OBJECT FREQ user:1001
# → 42

# See idle time (seconds since last access)
OBJECT IDLETIME user:1001
# → 3600 (1 hour idle)`}</Code>

          <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 20, marginBottom: 12, color: C.cyan }}>Memory Layout Per Data Type</h3>
          <div style={{ display: "grid", gap: 10 }}>
            {[
              { type: "String", small: "INT (8 bytes) — if value is a number", large: "RAW/EMBSTR — raw C string in memory", threshold: "Value is numeric → INT. ≤44 bytes → EMBSTR. Else → RAW", color: C.green },
              { type: "Hash", small: "LISTPACK — flat array of key-val pairs (very compact)", large: "HASHTABLE — real hash table with O(1) field lookup", threshold: "≤128 fields AND each field ≤64 bytes → LISTPACK. Else → HASHTABLE", color: C.blue },
              { type: "List", small: "LISTPACK — flat compressed array", large: "QUICKLIST — linked list of ziplists (best of both worlds)", threshold: "≤128 elements AND each ≤64 bytes → LISTPACK. Else → QUICKLIST", color: C.purple },
              { type: "Set", small: "LISTPACK — if all members are integers", large: "HASHTABLE — standard hash table", threshold: "≤128 integer members → LISTPACK. Else → HASHTABLE", color: C.yellow },
              { type: "Sorted Set", small: "LISTPACK — flat array sorted by score", large: "SKIPLIST + HASHTABLE — skip list for range + hash for O(1) lookup", threshold: "≤128 members AND each ≤64 bytes → LISTPACK. Else → SKIPLIST", color: C.orange },
              { type: "Stream", small: "STREAM — always rax tree + listpacks", large: "Same structure, grows with entries", threshold: "Always rax tree (radix tree) internally", color: C.pink },
            ].map(item => (
              <div key={item.type} style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
                padding: 14, borderLeft: `3px solid ${item.color}`,
              }}>
                <div style={{ color: item.color, fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{item.type}</div>
                <div style={{ fontSize: 11.5, lineHeight: 1.6 }}>
                  <div><span style={{ color: C.green, fontWeight: 600 }}>Small:</span> <span style={{ color: C.muted }}>{item.small}</span></div>
                  <div><span style={{ color: C.orange, fontWeight: 600 }}>Large:</span> <span style={{ color: C.muted }}>{item.large}</span></div>
                  <div style={{ marginTop: 4, color: C.dim, fontSize: 10.5 }}>Threshold: {item.threshold}</div>
                </div>
              </div>
            ))}
          </div>
        </>)}

        {/* ===== HASH TABLE ===== */}
        {active === "hashtable" && (<>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 16px" }}>🔍 Key Lookup — How Redis Finds Your Data</h2>

          <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>
            When you say <code style={{ color: C.cyan, background: C.surface, padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>GET price:NIFTY</code>, 
            Redis needs to find this key among potentially millions of keys. Here's exactly what happens:
          </p>

          <FlowStep num="1" color={C.blue} title='You send: GET price:NIFTY'
            desc='Client sends the command over TCP. Redis event loop picks it up.' />
          <FlowStep num="2" color={C.purple} title='Redis hashes the key string'
            desc='SipHash algorithm converts "price:NIFTY" → a 64-bit integer hash (e.g., 0xA3F1B2C4D5E6F789). This is O(1) — takes same time for short or long key names.' />
          <FlowStep num="3" color={C.green} title='Hash maps to a bucket'
            desc='hash & (table_size - 1) gives bucket index. Like: 0xA3F1... & 0xFFFF = bucket #4721. Direct memory address calculation — no searching.' />
          <FlowStep num="4" color={C.orange} title='Walk the bucket chain'
            desc='Each bucket has a linked list of entries (for hash collisions). Redis walks the chain comparing keys. Usually just 1-2 entries per bucket.' />
          <FlowStep num="5" color={C.cyan} title='Found! Follow the pointer'
            desc='The entry has a pointer (*ptr) to the RedisObject. Redis reads the type, encoding, and follows the data pointer to get the actual value.' />
          <FlowStep num="6" color={C.primary} title='Return value to client'
            desc='Serialize the value and send back over TCP. Total time: ~0.1ms.' />

          <Diagram>{`
  GET price:NIFTY
       │
       ▼
  ┌─────────────────────────────────────┐
  │  SipHash("price:NIFTY")            │
  │  = 0xA3F1B2C4D5E6F789              │
  └──────────────┬──────────────────────┘
                 │
                 ▼
  hash & (size-1) = bucket index 4721
                 │
                 ▼
  HASH TABLE
  ┌────────┐
  │ [0]    │ → NULL
  │ [1]    │ → entry → entry → NULL
  │ [...]  │
  │ [4721] │ → ┌──────────────────────────────────┐
  │        │   │ key: "price:NIFTY"                │
  │        │   │ val: → RedisObject                │
  │        │   │         type: string               │
  │        │   │         encoding: embstr            │
  │        │   │         ptr: → "22850.50"           │
  │        │   │ next: → NULL                       │
  │        │   └──────────────────────────────────┘
  │ [4722] │ → entry → NULL
  │ [...]  │
  └────────┘
          `}</Diagram>

          <Box color={C.yellow} icon="🔄" title="Rehashing — When Table Gets Full">
            When the hash table is >75% full, Redis creates a <span style={{ color: C.text }}>second table</span> (2x size) 
            and gradually migrates entries from old → new table. This happens <span style={{ color: C.text }}>incrementally</span> — 
            a few entries per command — so it never blocks. This is why Redis stays fast even when growing from 1K to 1M keys.
          </Box>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
            <Box color={C.green} icon="✅" title="Good Key Names">
              <div style={{ fontFamily: "monospace", fontSize: 11, color: C.text, lineHeight: 2 }}>
                user:1001<br/>
                price:NIFTY<br/>
                sess:abc123<br/>
                tenant:finspot:order:42
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: C.green }}>Short, descriptive, colon-separated hierarchy</div>
            </Box>
            <Box color={C.primary} icon="❌" title="Bad Key Names">
              <div style={{ fontFamily: "monospace", fontSize: 11, color: C.text, lineHeight: 2 }}>
                the_complete_user_profile_for_id_1001<br/>
                my-super-long-key-that-wastes-memory<br/>
                {`{json:"as","key":"bad"}`}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: C.primary }}>Long names waste RAM (stored for every key)</div>
            </Box>
          </div>
        </>)}

        {/* ===== SMART ENCODING ===== */}
        {active === "encoding" && (<>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 16px" }}>⚙️ Smart Encoding — Redis's Secret Weapon</h2>

          <Box color={C.cyan} icon="💡" title="Why This Matters">
            Redis automatically picks the <span style={{ color: C.text }}>most memory-efficient encoding</span> for your data. 
            A Hash with 3 fields uses a flat array (listpack = 80 bytes). Same hash with 200 fields uses a real 
            hash table (2KB). You never configure this — Redis handles it automatically.
          </Box>

          <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 20, marginBottom: 12 }}>String Encoding — 3 Modes</h3>
          <Diagram>{`
  SET counter 42          SET name "Raj"         SET bio "Long text..."
       │                       │                        │
       ▼                       ▼                        ▼
  ┌──────────┐          ┌──────────┐            ┌──────────┐
  │ INT      │          │ EMBSTR   │            │ RAW      │
  │          │          │          │            │          │
  │ Value    │          │ Object + │            │ Object   │
  │ stored   │          │ string   │            │    │     │
  │ directly │          │ in ONE   │            │    ▼     │
  │ in ptr   │          │ memory   │            │ Separate │
  │ field    │          │ block    │            │ memory   │
  │ (8 bytes)│          │ (≤44 ch) │            │ block    │
  └──────────┘          └──────────┘            └──────────┘
  Most compact!         One allocation          Two allocations
  No string at all      Cache-friendly          For strings > 44 bytes
          `}</Diagram>

          <Code title="redis-cli — see encoding in action">{`SET counter 42
OBJECT ENCODING counter
# → "int"          ← stored as 8-byte integer, not a string!

SET name "Raj"
OBJECT ENCODING name
# → "embstr"       ← embedded string, one memory allocation

SET bio "This is a really long biography text that exceeds 44 characters..."
OBJECT ENCODING bio
# → "raw"          ← raw string, separate memory allocation

# The magic: Redis auto-promotes
APPEND name " Kumar"
OBJECT ENCODING name
# → "raw"          ← changed from embstr to raw (because modified)`}</Code>

          <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 20, marginBottom: 12 }}>Hash Encoding — Listpack vs Hashtable</h3>
          <Diagram>{`
  HSET user:1 name "Raj" role "CTO"     HSET bigdata field1 val1 ... (200 fields)
              │                                        │
              ▼                                        ▼
  ┌──────────────────────┐            ┌──────────────────────────┐
  │ LISTPACK (compact)   │            │ HASHTABLE (fast)         │
  │                      │            │                          │
  │ [name][Raj][role]    │            │ bucket[0] → entry → ... │
  │ [CTO]               │            │ bucket[1] → entry → ... │
  │                      │            │ bucket[2] → NULL         │
  │ Flat array in memory │            │ ...                      │
  │ Sequential scan      │            │ O(1) field lookup        │
  │ ~80 bytes            │            │ ~2-4 KB                  │
  └──────────────────────┘            └──────────────────────────┘
                                       
  Auto-converts when:                   
  • Fields > 128 (hash-max-listpack-entries)
  • Any field value > 64 bytes (hash-max-listpack-value)
          `}</Diagram>

          <Box color={C.yellow} icon="⚡" title="Real Impact — Memory Savings">
            <div style={{ fontFamily: "monospace", fontSize: 12, color: C.text, lineHeight: 1.8 }}>
              1 million user hashes (5 fields each):<br/>
              • With listpack encoding: ~320 MB<br/>
              • With hashtable encoding: ~1.2 GB<br/>
              • <span style={{ color: C.green, fontWeight: 700 }}>Savings: 73% less memory!</span><br/><br/>
              Rule: Keep hashes under 128 fields and values under 64 bytes to stay in listpack mode.
            </div>
          </Box>

          <Code title="redis.conf — tune the thresholds">{`# Hash: use compact listpack when small
hash-max-listpack-entries 128    # Max fields for listpack
hash-max-listpack-value 64       # Max field value bytes

# List: use compact listpack when small  
list-max-listpack-size -2        # -2 = 8KB per node
list-max-ziplist-size 128

# Set: use compact when all integers
set-max-listpack-entries 128

# Sorted Set: compact when small
zset-max-listpack-entries 128
zset-max-listpack-value 64`}</Code>
        </>)}

        {/* ===== SET TO GET FLOW ===== */}
        {active === "lifecycle" && (<>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 16px" }}>🔄 Complete Lifecycle — From SET to GET</h2>

          <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>
            Let's trace exactly what happens when you store and retrieve data. Every step, every internal detail.
          </p>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 16px", color: C.green }}>
              Phase 1: SET price:NIFTY "22850" EX 5
            </h3>

            <FlowStep num="1" color={C.blue} title="Client sends command over TCP"
              desc='Your Python app (redis-py) serializes to RESP protocol: *4\r\n$3\r\nSET\r\n$11\r\nprice:NIFTY\r\n$5\r\n22850\r\n...' />
            <FlowStep num="2" color={C.purple} title="Redis event loop receives it"
              desc='epoll/kqueue notifies Redis of readable data on this client socket. Single-threaded — processes one command at a time.' />
            <FlowStep num="3" color={C.cyan} title="Parse command + validate"
              desc='Redis parses SET, key="price:NIFTY", value="22850", EX=5. Checks command exists, arg count correct.' />
            <FlowStep num="4" color={C.green} title="Create RedisObject for key"
              desc='Allocates a RedisObject: type=OBJ_STRING, encoding=OBJ_ENCODING_EMBSTR (value is short). The string "22850" is stored embedded in the object (one malloc).' />
            <FlowStep num="5" color={C.orange} title="Insert into hash table (dict)"
              desc='SipHash("price:NIFTY") → bucket index. Creates a dictEntry with key pointer + value pointer. Inserts into the bucket chain.' />
            <FlowStep num="6" color={C.yellow} title="Set expiry (EX 5)"
              desc='In the EXPIRES dict (separate hash table), stores: key="price:NIFTY" → expire_time=now()+5000ms. This is how Redis tracks TTL separately.' />
            <FlowStep num="7" color={C.primary} title="Append to AOF buffer"
              desc='If AOF enabled: appends "*4\r\n$3\r\nSET\r\n..." to the AOF write buffer. Will be fsynced to disk based on appendfsync policy (everysec = within 1 second).' />
            <FlowStep num="8" color={C.pink} title="Propagate to replicas"
              desc='If replicas connected: same command is sent to all replica servers over the replication stream. They execute the same SET.' />
            <FlowStep num="9" color={C.green} title='Reply "+OK" to client'
              desc="Writes +OK\r\n to client's output buffer. Event loop will flush it on next writable event. Total time: ~0.05ms." />
          </div>

          <div style={{ textAlign: "center", padding: "12px 0", color: C.primary, fontSize: 24 }}>⬇</div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 16px", color: C.blue }}>
              Phase 2: GET price:NIFTY
            </h3>

            <FlowStep num="1" color={C.blue} title="Client sends GET price:NIFTY"
              desc="RESP: *2\r\n$3\r\nGET\r\n$11\r\nprice:NIFTY\r\n" />
            <FlowStep num="2" color={C.purple} title="Hash table lookup"
              desc="SipHash('price:NIFTY') → same bucket index → find the entry → get the RedisObject pointer." />
            <FlowStep num="3" color={C.orange} title="Check expiry FIRST"
              desc="Before returning, Redis checks the EXPIRES dict. If current_time > expire_time → key is expired → delete it → return nil. This is 'lazy expiration'." />
            <FlowStep num="4" color={C.green} title="Read value from pointer"
              desc="RedisObject.ptr → embedded string '22850'. No copy needed — Redis reads directly from memory." />
            <FlowStep num="5" color={C.cyan} title="Update LRU clock"
              desc="Updates the 24-bit LRU field in RedisObject to current time. This is used for eviction (allkeys-lru policy) — least recently accessed keys get evicted first." />
            <FlowStep num="6" color={C.green} title="Reply with value"
              desc='Writes $5\r\n22850\r\n to client output buffer. Done in ~0.05ms.' />
          </div>
        </>)}

        {/* ===== PERSISTENCE ===== */}
        {active === "persist" && (<>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 16px" }}>💿 Persistence — How RAM Data Survives Restart</h2>

          <Box color={C.primary} icon="❓" title="The Problem">
            RAM = volatile. Power off = data gone. Redis solves this with two persistence mechanisms 
            that work independently or together.
          </Box>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            <div style={{ background: C.card, border: `1px solid ${C.blue}44`, borderRadius: 12, padding: 20 }}>
              <h3 style={{ color: C.blue, fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>📸 RDB (Snapshot)</h3>
              <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.7 }}>
                Takes a complete point-in-time <span style={{ color: C.text }}>photo</span> of all data. 
                Like a database backup.
              </p>
              <Diagram>{`
Time: ──────────────────────►
       │         │         │
     SAVE      SAVE      SAVE
       │         │         │
       ▼         ▼         ▼
    dump.rdb  dump.rdb  dump.rdb
    (v1)      (v2)      (v3)

How it works:
1. Redis forks child process
2. Child has copy of all RAM
   (copy-on-write, very fast)
3. Child writes all data to
   dump.rdb on disk
4. Parent keeps serving requests
   (zero downtime!)
              `}</Diagram>
              <Code title="redis.conf">{`save 900 1      # Save if 1+ changes in 900s
save 300 10     # Save if 10+ changes in 300s  
save 60 10000   # Save if 10K+ changes in 60s
dbfilename dump.rdb`}</Code>
              <div style={{ marginTop: 8, fontSize: 11 }}>
                <span style={{ color: C.green }}>✅ Pro:</span> <span style={{ color: C.muted }}>Compact file, fast restart</span><br/>
                <span style={{ color: C.primary }}>❌ Con:</span> <span style={{ color: C.muted }}>Data loss between snapshots</span>
              </div>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.green}44`, borderRadius: 12, padding: 20 }}>
              <h3 style={{ color: C.green, fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>📝 AOF (Append-Only File)</h3>
              <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.7 }}>
                Logs <span style={{ color: C.text }}>every write command</span> to a file. 
                Like a transaction log. Replay to rebuild state.
              </p>
              <Diagram>{`
Every write command appended:

appendonly.aof:
┌────────────────────────┐
│ SET price:NIFTY 22850  │
│ SET price:NIFTY 22860  │
│ HSET user:1 name Raj   │
│ LPUSH orders order_1   │
│ INCR api:hits          │
│ ...continues growing   │
└────────────────────────┘

On restart:
1. Redis reads AOF file
2. Replays every command
3. State fully rebuilt
              `}</Diagram>
              <Code title="redis.conf">{`appendonly yes
# Sync options:
appendfsync always    # Every write (safest, slow)
appendfsync everysec  # Every second (recommended)
appendfsync no        # OS decides (fastest, risky)`}</Code>
              <div style={{ marginTop: 8, fontSize: 11 }}>
                <span style={{ color: C.green }}>✅ Pro:</span> <span style={{ color: C.muted }}>Max 1 second data loss</span><br/>
                <span style={{ color: C.primary }}>❌ Con:</span> <span style={{ color: C.muted }}>Larger files, slower restart</span>
              </div>
            </div>
          </div>

          <Box color={C.purple} icon="🏆" title="Production Recommendation: Use BOTH">
            Enable RDB + AOF together. AOF for durability (max 1s loss). 
            RDB for fast backups and disaster recovery. 
            Redis uses AOF for restart (more complete) and RDB for backup copies.
            <div style={{ marginTop: 8, color: C.text, fontFamily: "monospace", fontSize: 11 }}>
              For your trading infrastructure: appendfsync everysec is the sweet spot — 1 second max data loss with minimal performance impact.
            </div>
          </Box>
        </>)}

        {/* ===== EXPIRY & EVICTION ===== */}
        {active === "expire" && (<>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 16px" }}>⏰ Expiry & Eviction — How Redis Forgets</h2>

          <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>
            Two separate mechanisms: <span style={{ color: C.text, fontWeight: 600 }}>Expiry</span> (keys you set TTL on) and 
            <span style={{ color: C.text, fontWeight: 600 }}> Eviction</span> (when memory is full, Redis chooses what to remove).
          </p>

          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: C.cyan }}>How Expiry Works — Two Strategies</h3>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Box color={C.blue} icon="😴" title="Lazy Expiry (on access)">
              When any client tries to read a key, Redis first checks if it's expired. 
              If yes → delete it → return nil. 
              <span style={{ color: C.text, fontWeight: 500 }}> Keys only expire when someone asks for them.</span>
              <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 10.5, color: C.text }}>
                GET expired_key<br/>
                → check expires dict<br/>
                → current_time {">"} expire_time?<br/>
                → YES → delete → return nil
              </div>
            </Box>
            <Box color={C.green} icon="🔍" title="Active Expiry (background scan)">
              Every 100ms, Redis randomly samples 20 keys from the expires dict. 
              If {">"} 25% are expired, it samples another 20. Repeats until {"<"} 25% are expired.
              <span style={{ color: C.text, fontWeight: 500 }}> Prevents memory fill from unaccessed expired keys.</span>
              <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 10.5, color: C.text }}>
                Every 100ms:<br/>
                → sample 20 expired keys<br/>
                → delete expired ones<br/>
                → if {">"} 25% expired → repeat
              </div>
            </Box>
          </div>

          <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 24, marginBottom: 12, color: C.orange }}>Eviction — When Memory is Full</h3>

          <Box color={C.orange} icon="⚠️" title="What Happens When maxmemory is Hit?">
            Redis checks the <span style={{ color: C.text, fontWeight: 600 }}>maxmemory-policy</span> and decides which keys to remove 
            to make room for new writes. This is completely separate from TTL expiry.
          </Box>

          <div style={{ marginTop: 12 }}>
            {[
              { policy: "noeviction", desc: "Don't evict anything. Return error on new writes.", use: "When data loss is unacceptable", color: C.primary, rec: false },
              { policy: "allkeys-lru", desc: "Remove least recently used keys from ALL keys.", use: "General-purpose cache (MOST COMMON)", color: C.green, rec: true },
              { policy: "allkeys-lfu", desc: "Remove least frequently used keys from ALL keys.", use: "When access patterns are stable", color: C.blue, rec: false },
              { policy: "volatile-lru", desc: "Remove least recently used only from keys WITH TTL set.", use: "Mix of cache + permanent data", color: C.purple, rec: false },
              { policy: "volatile-lfu", desc: "Remove least frequently used only from keys WITH TTL.", use: "Precise frequency-based cache", color: C.cyan, rec: false },
              { policy: "allkeys-random", desc: "Remove random keys.", use: "When all keys are equally important", color: C.yellow, rec: false },
              { policy: "volatile-ttl", desc: "Remove keys with shortest remaining TTL first.", use: "When near-expiry keys are least valuable", color: C.orange, rec: false },
            ].map(p => (
              <div key={p.policy} style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "10px 14px", marginBottom: 6,
                background: p.rec ? `${p.color}12` : "transparent",
                border: p.rec ? `1px solid ${p.color}44` : `1px solid transparent`,
                borderRadius: 8,
              }}>
                <code style={{
                  color: p.color, fontWeight: 700, fontSize: 11,
                  fontFamily: "monospace", flexShrink: 0, minWidth: 130,
                }}>
                  {p.policy} {p.rec && "⭐"}
                </code>
                <div>
                  <div style={{ color: C.text, fontSize: 12 }}>{p.desc}</div>
                  <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>Use when: {p.use}</div>
                </div>
              </div>
            ))}
          </div>

          <Code title="redis.conf — production settings">{`# Set memory limit (ALWAYS set in production!)
maxmemory 2gb

# Eviction policy (allkeys-lru for pure cache)
maxmemory-policy allkeys-lru

# How many samples to check for LRU approximation
# Higher = more accurate but slower (default: 5)
maxmemory-samples 10`}</Code>

          <Box color={C.green} icon="🎯" title="For Your Infrastructure">
            <div style={{ fontFamily: "monospace", fontSize: 11.5, color: C.text, lineHeight: 1.8 }}>
              Finspot Trading → allkeys-lru (cache prices, evict stale ones)<br/>
              LinkedEye ITSM → volatile-lru (cache + permanent incident data)<br/>
              VoiceLead AI → allkeys-lru (pure cache for voice transcriptions)<br/>
              Production → ALWAYS set maxmemory. Without it, Redis grows until OOM kill!
            </div>
          </Box>
        </>)}

      </main>
    </div>
  );
}
