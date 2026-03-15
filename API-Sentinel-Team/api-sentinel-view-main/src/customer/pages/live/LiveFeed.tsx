import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Wifi, WifiOff, Activity, Shield, Ban, Zap, Download, X, RefreshCw, Search, Filter } from 'lucide-react';
import MetricWidget from '@/components/ui/MetricWidget';
import StatusPulse from '@/components/ui/StatusPulse';
import QueryError from '@/components/shared/QueryError';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttackInfo {
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

interface LogEntry {
  id: string;
  ip: string;
  method: string;
  path: string;
  status: number;
  bytes: string | number;
  timestamp: string;
  attacks: AttackInfo[];
}

interface WsMessage {
  type: 'log_entry';
  data: Omit<LogEntry, 'id'>;
}

type SeverityFilter = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM';

const MAX_ROWS = 200;
const WS_BASE = (import.meta.env.VITE_API_WS_URL ?? '').replace(/\/$/, '');
const DEFAULT_WS_BASE = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
const WS_URL = `${(WS_BASE || DEFAULT_WS_BASE)}/api/stream/live`;
const RECENT_URL = `${(import.meta.env.VITE_API_BASE_URL ?? '')}/api/stream/recent`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return iso; }
}

function statusColor(code: number): string {
  if (code >= 200 && code < 300) return '#22C55E';
  if (code >= 400 && code < 500) return '#EAB308';
  if (code >= 500) return '#EF4444';
  return '#6B6B80';
}

function methodColors(method: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    GET: { bg: 'rgba(59,130,246,0.15)', text: '#60A5FA' },
    POST: { bg: 'rgba(34,197,94,0.15)', text: '#4ADE80' },
    PUT: { bg: 'rgba(234,179,8,0.15)', text: '#FACC15' },
    DELETE: { bg: 'rgba(239,68,68,0.15)', text: '#F87171' },
    PATCH: { bg: 'rgba(167,139,250,0.15)', text: '#C4B5FD' },
  };
  return map[method.toUpperCase()] ?? { bg: 'rgba(107,114,128,0.15)', text: '#6B6B80' };
}

function severityColor(sev: string): string {
  const map: Record<string, string> = { CRITICAL: '#EF4444', HIGH: '#F97316', MEDIUM: '#EAB308', LOW: '#22C55E' };
  return map[sev.toUpperCase()] ?? '#6B6B80';
}

function maxEntrySeverity(attacks: AttackInfo[]): string {
  if (!attacks.length) return '';
  const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  for (const sev of order) { if (attacks.some((a) => a.severity === sev)) return sev; }
  return attacks[0].severity;
}

function exportCsv(rows: LogEntry[]): void {
  const header = 'Timestamp,IP,Method,Path,Status,Bytes,Threats\n';
  const body = rows.map((r) => {
    const threats = r.attacks.map((a) => `${a.category}(${a.severity})`).join('; ');
    return `"${r.timestamp}","${r.ip}","${r.method}","${r.path}",${r.status},${r.bytes},"${threats}"`;
  }).join('\n');
  const blob = new Blob([header + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `live-feed-${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function computeStats(rows: LogEntry[]) {
  const now = Date.now();
  const recent = rows.filter((r) => new Date(r.timestamp).getTime() >= now - 60_000);
  const threats = rows.filter((r) => r.attacks.length > 0).length;
  const blockedIps = new Set(rows.filter((r) => r.attacks.length > 0).map((r) => r.ip)).size;
  return { reqPerMin: recent.length, threats, blockedIps, sensors: 1 };
}

// ─── Main Component ───────────────────────────────────────────────────────────

const LiveFeed: React.FC = () => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [userScrolled, setUserScrolled] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const tableBodyRef = useRef<HTMLDivElement>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { isLoading: initialLoading, isError, refetch } = useQuery({
    queryKey: ['live-feed', 'recent'],
    queryFn: async ({ signal }) => {
      const token = localStorage.getItem('sentinel_token');
      const res = await fetch(RECENT_URL, { signal, headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error('Failed to fetch recent');
      const json = await res.json();
      const items: LogEntry[] = (json.data ?? json ?? []).map((d: Omit<LogEntry, 'id'>) => ({ ...d, id: genId() }));
      setEntries(items.slice(0, MAX_ROWS));
      return items;
    },
    staleTime: Infinity,
    retry: 1,
  });

  const connect = useCallback(() => {
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    const token = localStorage.getItem('sentinel_token');
    const url = token ? `${WS_URL}?token=${token}` : WS_URL;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onmessage = (ev) => {
      try {
        const msg: WsMessage = JSON.parse(ev.data);
        if (msg.type !== 'log_entry') return;
        setEntries((prev) => [{ ...msg.data, id: genId() }, ...prev].slice(0, MAX_ROWS));
      } catch { /* ignore */ }
    };
    ws.onerror = () => setConnected(false);
    ws.onclose = () => { setConnected(false); reconnectTimerRef.current = setTimeout(connect, 3000); };
  }, []);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(); if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current); };
  }, [connect]);

  useEffect(() => {
    if (!userScrolled && tableBodyRef.current) tableBodyRef.current.scrollTop = 0;
  }, [entries, userScrolled]);

  const handleScroll = useCallback(() => {
    if (!tableBodyRef.current) return;
    setUserScrolled(tableBodyRef.current.scrollTop > 50);
  }, []);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (severityFilter !== 'ALL') { const topSev = maxEntrySeverity(e.attacks); if (topSev !== severityFilter) return false; }
      if (searchQuery) { const q = searchQuery.toLowerCase(); if (!e.ip.toLowerCase().includes(q) && !e.path.toLowerCase().includes(q)) return false; }
      return true;
    });
  }, [entries, severityFilter, searchQuery]);

  const stats = useMemo(() => computeStats(entries), [entries]);

  return (
    <div className="space-y-5 animate-fade-in w-full pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-text-primary">Live Traffic Feed</h2>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border"
            style={connected
              ? { color: '#22C55E', background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.2)' }
              : { color: '#EF4444', background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' }}>
            <StatusPulse variant={connected ? 'online' : 'critical'} size="sm" />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        {connected ? <Wifi size={16} className="text-sev-low" /> : <WifiOff size={16} className="text-sev-critical" />}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricWidget label="Requests / min" value={stats.reqPerMin} icon={Activity} iconColor="#F97316" iconBg="rgba(249,115,22,0.1)" sparkData={Array.from({ length: 7 }, () => Math.max(0, stats.reqPerMin + Math.floor(Math.random() * 6 - 3)))} sparkColor="#F97316" />
        <MetricWidget label="Threats Detected" value={stats.threats} icon={Shield} iconColor="#EF4444" iconBg="rgba(239,68,68,0.1)" sparkData={Array.from({ length: 7 }, () => Math.max(0, stats.threats + Math.floor(Math.random() * 4 - 2)))} sparkColor="#EF4444" />
        <MetricWidget label="Blocked IPs" value={stats.blockedIps} icon={Ban} iconColor="#EAB308" iconBg="rgba(234,179,8,0.1)" sparkData={Array.from({ length: 7 }, () => Math.max(0, stats.blockedIps + Math.floor(Math.random() * 3 - 1)))} sparkColor="#EAB308" />
        <MetricWidget label="Active Sensors" value={stats.sensors} icon={Zap} iconColor="#22C55E" iconBg="rgba(34,197,94,0.1)" sparkData={[1, 1, 1, 1, 1, 1, 1]} sparkColor="#22C55E" />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-bg-surface border border-border-subtle rounded-lg px-3 py-2">
          <Filter size={13} className="text-text-muted" />
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
            className="bg-transparent text-xs text-text-primary outline-none cursor-pointer">
            <option value="ALL">All Severity</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
          </select>
        </div>
        <div className="flex items-center gap-2 bg-bg-surface border border-border-subtle rounded-lg px-3 py-2 flex-1 min-w-[180px] max-w-xs">
          <Search size={13} className="text-text-muted" />
          <input type="text" placeholder="Search IP or path..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted w-full" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="text-text-muted hover:text-text-primary"><X size={12} /></button>}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => setEntries([])} className="flex items-center gap-1.5 bg-bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:border-brand/20 transition-all">
            <X size={13} /> Clear
          </button>
          <button onClick={() => exportCsv(filteredEntries)} className="flex items-center gap-1.5 bg-bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:border-brand/20 transition-all">
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {isError && (
        <QueryError message="Failed to load recent traffic" onRetry={() => refetch()} />
      )}

      {/* Table */}
      <div className="bg-bg-surface border border-border-subtle rounded-xl flex flex-col overflow-hidden">
        <div className="p-3 border-b border-border-subtle flex items-center justify-between">
          <span className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Activity size={14} className="text-brand" />
            Live Events
            <span className="text-[10px] bg-bg-elevated border border-border-subtle px-2 py-0.5 rounded-full text-text-muted">{filteredEntries.length} rows</span>
          </span>
          {userScrolled && (
            <button onClick={() => { setUserScrolled(false); tableBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="flex items-center gap-1 text-[10px] text-brand hover:text-brand-light transition-colors">
              <RefreshCw size={10} /> Resume live scroll
            </button>
          )}
        </div>

        <div ref={tableBodyRef} onScroll={handleScroll} className="overflow-auto" style={{ maxHeight: '580px' }}>
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="sticky top-0 bg-bg-base/90 backdrop-blur-sm border-b border-border-subtle z-10">
              <tr>
                {['Timestamp', 'IP Address', 'Method', 'Path', 'Status', 'Threat', 'Bytes'].map(h => (
                  <th key={h} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {initialLoading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-3 bg-black/[0.04] rounded" style={{ width: j === 3 ? '80%' : '60%' }} /></td>
                  ))}
                </tr>
              ))}

              {!initialLoading && filteredEntries.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-xs text-text-muted">
                  {connected ? 'Waiting for traffic...' : 'Disconnected. Reconnecting...'}
                </td></tr>
              )}

              {filteredEntries.map((entry) => {
                const attacks = entry.attacks ?? [];
                const isThreat = attacks.length > 0;
                const topAttack = isThreat ? attacks[0] : null;
                const mc = methodColors(entry.method);
                const sc = statusColor(entry.status);

                return (
                  <tr key={entry.id} className={`transition-colors hover:bg-white/[0.02] ${isThreat ? 'bg-red-950/20' : ''}`}>
                    <td className="px-4 py-2.5 text-[10px] font-mono text-text-muted whitespace-nowrap">{formatTime(entry.timestamp)}</td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-text-primary whitespace-nowrap">{entry.ip}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded" style={{ backgroundColor: mc.bg, color: mc.text }}>{entry.method}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-text-secondary max-w-[280px] truncate">{entry.path}</td>
                    <td className="px-4 py-2.5"><span className="text-[12px] font-bold font-mono tabular-nums" style={{ color: sc }}>{entry.status}</span></td>
                    <td className="px-4 py-2.5">
                      {topAttack ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap"
                          style={{ color: severityColor(topAttack.severity), borderColor: `${severityColor(topAttack.severity)}40`, backgroundColor: `${severityColor(topAttack.severity)}15` }}>
                          {topAttack.category}
                        </span>
                      ) : <span className="text-[11px] text-text-muted">-</span>}
                    </td>
                    <td className="px-4 py-2.5 text-[10px] font-mono text-text-muted whitespace-nowrap">
                      {entry.bytes != null && entry.bytes !== '-' ? Number(entry.bytes).toLocaleString() + ' B' : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LiveFeed;
