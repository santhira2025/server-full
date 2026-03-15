import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield, Ban, Download, Zap, X, AlertTriangle, CheckCircle, RefreshCw, Filter, Search, Clock,
} from 'lucide-react';
import QueryError from '@/components/shared/QueryError';
import TableSkeleton from '@/components/shared/TableSkeleton';
import MetricWidget from '@/components/ui/MetricWidget';
import GlassCard from '@/components/ui/GlassCard';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlockedIP {
  ip: string;
  reason: string;
  blocked_by: 'AUTO' | 'MANUAL';
  risk_score: number;
  event_count: number;
  blocked_at: string;
  expires_at: string | null;
}

interface BlocklistResponse {
  items: BlockedIP[];
  total: number;
}

interface BlockIPPayload {
  ip: string;
  reason: string;
  expires_in_hours?: number;
}

interface AutoBlockResult {
  blocked_count: number;
  ips: string[];
}

// ─── API calls ────────────────────────────────────────────────────────────────

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('sentinel_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchBlocklist(signal?: AbortSignal): Promise<BlocklistResponse> {
  const res = await fetch('/api/blocklist/', { headers: authHeaders(), signal });
  if (!res.ok) throw new Error('Failed to fetch blocklist');
  const json = await res.json();
  if (Array.isArray(json)) return { items: json, total: json.length };
  return json;
}

async function blockIP(payload: BlockIPPayload): Promise<void> {
  const res = await fetch('/api/blocklist/', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to block IP');
}

async function unblockIP(ip: string): Promise<void> {
  const res = await fetch(`/api/blocklist/${encodeURIComponent(ip)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to unblock IP');
}

async function autoBlockHighRisk(): Promise<AutoBlockResult> {
  const res = await fetch('/api/blocklist/auto', {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Auto-block failed');
  return res.json();
}

async function exportNginx(): Promise<void> {
  const token = localStorage.getItem('sentinel_token');
  const res = await fetch('/api/blocklist/export/nginx', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Export failed');
  const text = await res.text();
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nginx-deny.conf';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return diff > 0 && diff < 24 * 60 * 60 * 1000;
}

// ─── Risk Score Bar ───────────────────────────────────────────────────────────

const RiskBar: React.FC<{ score: number }> = ({ score }) => {
  const pct = Math.min(Math.max(score, 0), 100);
  const color = pct >= 80 ? '#EF4444' : pct >= 50 ? '#632CA6' : '#EAB308';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-black/[0.04] rounded-full overflow-hidden" style={{ minWidth: 60 }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }} />
      </div>
      <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color }}>{pct}</span>
    </div>
  );
};

// ─── Block IP Modal ───────────────────────────────────────────────────────────

interface BlockModalProps {
  onClose: () => void;
  onSubmit: (payload: BlockIPPayload) => void;
  isLoading: boolean;
}

const BlockModal: React.FC<BlockModalProps> = ({ onClose, onSubmit, isLoading }) => {
  const [ip, setIp] = useState('');
  const [reason, setReason] = useState('');
  const [expiresHours, setExpiresHours] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ip.trim()) return;
    const payload: BlockIPPayload = { ip: ip.trim(), reason: reason.trim() || 'Manually blocked' };
    if (expiresHours && !isNaN(Number(expiresHours))) payload.expires_in_hours = Number(expiresHours);
    onSubmit(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-card-premium w-full max-w-md mx-4 p-6 animate-scale-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sev-critical/10 flex items-center justify-center"><Ban size={16} className="text-sev-critical" /></div>
            Block IP Address
          </h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"><X size={14} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">IP Address <span className="text-sev-critical">*</span></label>
            <input type="text" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="e.g. 192.168.1.100" required
              className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20 placeholder:text-text-muted font-mono transition-all" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Reason</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for blocking..."
              className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20 placeholder:text-text-muted transition-all" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Expires In (hours)</label>
            <input type="number" value={expiresHours} onChange={(e) => setExpiresHours(e.target.value)} placeholder="Leave blank for permanent" min="1"
              className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20 placeholder:text-text-muted transition-all" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-text-muted border border-border-subtle rounded-lg hover:bg-bg-elevated transition-colors">Cancel</button>
            <button type="submit" disabled={isLoading || !ip.trim()}
              className="px-4 py-2 text-sm font-semibold bg-sev-critical text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
              {isLoading && <RefreshCw size={12} className="animate-spin" />}
              Block IP
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Confirm Unblock Dialog ───────────────────────────────────────────────────

interface ConfirmUnblockProps {
  ip: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

const ConfirmUnblock: React.FC<ConfirmUnblockProps> = ({ ip, onConfirm, onCancel, isLoading }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onCancel} />
    <div className="relative glass-card-premium w-full max-w-sm mx-4 p-6 animate-scale-in">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-sev-low/10 flex items-center justify-center">
          <CheckCircle size={24} className="text-sev-low" />
        </div>
        <h3 className="text-base font-bold text-text-primary">Unblock IP Address</h3>
        <p className="text-sm text-text-muted">Remove <span className="font-mono text-text-primary">{ip}</span> from the block list?</p>
        <div className="flex gap-3 mt-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-text-muted border border-border-subtle rounded-lg hover:bg-bg-elevated transition-colors">Cancel</button>
          <button onClick={onConfirm} disabled={isLoading}
            className="px-4 py-2 text-sm font-semibold bg-sev-low text-white rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors flex items-center gap-2">
            {isLoading && <RefreshCw size={12} className="animate-spin" />}
            Unblock
          </button>
        </div>
      </div>
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const BlockList: React.FC = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [confirmUnblockIp, setConfirmUnblockIp] = useState<string | null>(null);
  const [autoBlockResult, setAutoBlockResult] = useState<AutoBlockResult | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<BlocklistResponse>({
    queryKey: ['blocklist'],
    queryFn: ({ signal }) => fetchBlocklist(signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  const items = data?.items ?? [];

  const blockMutation = useMutation({
    mutationFn: blockIP,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['blocklist'] }); setShowBlockModal(false); },
  });

  const unblockMutation = useMutation({
    mutationFn: unblockIP,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['blocklist'] }); setConfirmUnblockIp(null); },
  });

  const autoBlockMutation = useMutation({
    mutationFn: autoBlockHighRisk,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['blocklist'] });
      setAutoBlockResult(result);
      setTimeout(() => setAutoBlockResult(null), 5000);
    },
  });

  const stats = useMemo(() => {
    const total = items.length;
    const auto = items.filter((i) => i.blocked_by === 'AUTO').length;
    const manual = items.filter((i) => i.blocked_by === 'MANUAL').length;
    const expiringSoon = items.filter((i) => isExpiringSoon(i.expires_at)).length;
    return { total, auto, manual, expiringSoon };
  }, [items]);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.ip.toLowerCase().includes(q) || i.reason.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <div className="space-y-5 animate-fade-in w-full pb-10">
      {showBlockModal && <BlockModal onClose={() => setShowBlockModal(false)} onSubmit={(p) => blockMutation.mutate(p)} isLoading={blockMutation.isPending} />}
      {confirmUnblockIp && <ConfirmUnblock ip={confirmUnblockIp} onConfirm={() => unblockMutation.mutate(confirmUnblockIp)} onCancel={() => setConfirmUnblockIp(null)} isLoading={unblockMutation.isPending} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-text-primary">Block List</h2>
        <button onClick={() => refetch()} className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand transition-all outline-none">
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricWidget label="Total Blocked" value={stats.total} icon={Ban} iconColor="#EF4444" iconBg="rgba(239,68,68,0.1)" sparkData={Array.from({ length: 7 }, () => Math.max(0, stats.total + Math.floor(Math.random() * 4 - 2)))} sparkColor="#EF4444" />
        <MetricWidget label="Auto-Blocked" value={stats.auto} icon={Zap} iconColor="#F97316" iconBg="rgba(249,115,22,0.1)" sparkData={Array.from({ length: 7 }, () => Math.max(0, stats.auto + Math.floor(Math.random() * 3 - 1)))} sparkColor="#F97316" />
        <MetricWidget label="Manual" value={stats.manual} icon={Shield} iconColor="#3B82F6" iconBg="rgba(59,130,246,0.1)" sparkData={Array.from({ length: 7 }, () => Math.max(0, stats.manual + Math.floor(Math.random() * 3 - 1)))} sparkColor="#3B82F6" />
        <MetricWidget label="Expiring Soon" value={stats.expiringSoon} icon={Clock} iconColor="#EAB308" iconBg="rgba(234,179,8,0.1)" sparkData={Array.from({ length: 7 }, () => Math.max(0, stats.expiringSoon + Math.floor(Math.random() * 2)))} sparkColor="#EAB308" />
      </div>

      {/* Auto-block success banner */}
      {autoBlockResult && (
        <GlassCard variant="default" className="flex items-center gap-3 px-4 py-3 border-sev-low/30">
          <CheckCircle size={15} className="text-sev-low" />
          <span className="text-sm text-sev-low">Auto-blocked <strong>{autoBlockResult.blocked_count}</strong> high-risk IP{autoBlockResult.blocked_count !== 1 ? 's' : ''}.</span>
          <button onClick={() => setAutoBlockResult(null)} className="ml-auto text-text-muted hover:text-text-primary"><X size={14} /></button>
        </GlassCard>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-bg-surface border border-border-subtle rounded-lg px-3 py-2 flex-1 min-w-[200px] max-w-xs">
          <Search size={13} className="text-text-muted" />
          <input type="text" placeholder="Search IP or reason..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted w-full" />
          {search && <button onClick={() => setSearch('')} className="text-text-muted hover:text-text-primary"><X size={12} /></button>}
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <button onClick={() => autoBlockMutation.mutate()} disabled={autoBlockMutation.isPending}
            className="flex items-center gap-1.5 bg-brand text-white rounded-lg px-3 py-2 text-xs font-semibold hover:bg-brand-dark disabled:opacity-50 transition-colors">
            {autoBlockMutation.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
            Auto-Block High Risk
          </button>
          <button onClick={() => exportNginx()} className="flex items-center gap-1.5 bg-bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:border-brand/20 transition-all">
            <Download size={13} /> Export nginx.conf
          </button>
          <button onClick={() => setShowBlockModal(true)} className="flex items-center gap-1.5 bg-sev-critical text-white rounded-lg px-3 py-2 text-xs font-semibold hover:bg-red-600 transition-colors">
            <Ban size={13} /> Block IP
          </button>
        </div>
      </div>

      {isError && <QueryError message="Failed to load block list" onRetry={() => refetch()} />}

      {/* Table */}
      <div className="bg-bg-surface border border-border-subtle rounded-xl overflow-hidden flex flex-col min-h-[400px]">
        <div className="p-3 border-b border-border-subtle flex items-center justify-between">
          <span className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Ban size={14} className="text-sev-critical" />
            Blocked IPs
            <span className="text-[10px] bg-bg-elevated border border-border-subtle px-2 py-0.5 rounded-full text-text-muted">{filtered.length} entries</span>
          </span>
          <button className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated outline-none transition-colors"><Filter size={14} /></button>
        </div>

        {isLoading ? <TableSkeleton columns={8} rows={8} /> : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead className="bg-bg-base/50">
                <tr>
                  {['IP Address', 'Reason', 'Blocked By', 'Risk Score', 'Events', 'Blocked At', 'Expires', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-xs text-text-muted">
                    <Shield size={24} className="mx-auto mb-2 text-text-muted" />
                    No blocked IPs found.
                  </td></tr>
                )}
                {filtered.map((item) => (
                  <tr key={item.ip} className="data-row-interactive hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-[12px] font-mono text-text-primary whitespace-nowrap">{item.ip}</td>
                    <td className="px-4 py-3 text-[11px] text-text-secondary max-w-[200px] truncate">{item.reason || '-'}</td>
                    <td className="px-4 py-3">
                      {item.blocked_by === 'AUTO' ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-sev-critical/20 bg-sev-critical/10 text-sev-critical">AUTO</span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-border-subtle bg-bg-elevated text-text-muted">MANUAL</span>
                      )}
                    </td>
                    <td className="px-4 py-3 min-w-[120px]"><RiskBar score={item.risk_score} /></td>
                    <td className="px-4 py-3 text-[12px] font-mono font-bold text-text-primary tabular-nums">{item.event_count?.toLocaleString() ?? '-'}</td>
                    <td className="px-4 py-3 text-[10px] font-mono text-text-muted whitespace-nowrap">{item.blocked_at ? formatDate(item.blocked_at) : '-'}</td>
                    <td className="px-4 py-3">
                      {item.expires_at ? (
                        <span className={`text-[10px] font-mono whitespace-nowrap ${isExpiringSoon(item.expires_at) ? 'text-sev-medium' : 'text-text-muted'}`}>
                          {formatDate(item.expires_at)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-text-muted">Permanent</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setConfirmUnblockIp(item.ip)}
                        className="text-[10px] font-bold px-2 py-1 rounded-md bg-sev-low/10 text-sev-low border border-sev-low/20 hover:bg-sev-low/20 transition-all">
                        Unblock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default BlockList;
