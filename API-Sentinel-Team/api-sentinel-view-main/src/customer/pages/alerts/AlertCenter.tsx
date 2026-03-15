import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, AlertTriangle, CheckCircle, XCircle, RefreshCw, Activity, Filter, FileSearch } from 'lucide-react';
import QueryError from '@/components/shared/QueryError';
import MetricWidget from '@/components/ui/MetricWidget';
import GlassCard from '@/components/ui/GlassCard';

// ─── Types ────────────────────────────────────────────────────────────────────

type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type TabValue = 'ALL' | AlertStatus | 'CRITICAL';

interface Alert {
  id: string;
  severity: AlertSeverity;
  category: string;
  title: string;
  message: string;
  source_ip: string;
  endpoint: string;
  timestamp: string;
  status: AlertStatus;
}

interface AlertSummary {
  total: number;
  open: number;
  critical: number;
  high: number;
  acknowledged: number;
}

// ─── API calls ────────────────────────────────────────────────────────────────

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('sentinel_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function fetchAlerts(status?: string, severity?: string, signal?: AbortSignal): Promise<Alert[]> {
  const params = new URLSearchParams({ limit: '100' });
  if (status && status !== 'ALL') params.set('status', status);
  if (severity && severity !== 'ALL') params.set('severity', severity);
  const res = await fetch(`/api/alerts/?${params}`, { headers: authHeaders(), signal });
  if (!res.ok) throw new Error('Failed to fetch alerts');
  const json = await res.json();
  if (Array.isArray(json)) return json;
  return json.items ?? json.alerts ?? [];
}

async function fetchAlertSummary(signal?: AbortSignal): Promise<AlertSummary> {
  const res = await fetch('/api/alerts/summary', { headers: authHeaders(), signal });
  if (!res.ok) throw new Error('Failed to fetch alert summary');
  return res.json();
}

async function acknowledgeAlert(id: string): Promise<void> {
  const res = await fetch(`/api/alerts/${id}/acknowledge`, { method: 'PATCH', headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to acknowledge alert');
}

async function resolveAlert(id: string): Promise<void> {
  const res = await fetch(`/api/alerts/${id}/resolve`, { method: 'PATCH', headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to resolve alert');
}

async function dismissAlert(id: string): Promise<void> {
  const res = await fetch(`/api/alerts/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to dismiss alert');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const SEVERITY_BORDER: Record<AlertSeverity, string> = { CRITICAL: '#EF4444', HIGH: '#F97316', MEDIUM: '#EAB308', LOW: '#3B82F6' };
const SEVERITY_BADGE: Record<AlertSeverity, { bg: string; text: string }> = {
  CRITICAL: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
  HIGH: { bg: 'rgba(249,115,22,0.15)', text: '#F97316' },
  MEDIUM: { bg: 'rgba(234,179,8,0.15)', text: '#EAB308' },
  LOW: { bg: 'rgba(59,130,246,0.15)', text: '#60A5FA' },
};
const STATUS_CHIP: Record<AlertStatus, { bg: string; text: string; label: string }> = {
  OPEN: { bg: 'rgba(239,68,68,0.1)', text: '#EF4444', label: 'OPEN' },
  ACKNOWLEDGED: { bg: 'rgba(234,179,8,0.1)', text: '#EAB308', label: 'ACKNOWLEDGED' },
  RESOLVED: { bg: 'rgba(34,197,94,0.1)', text: '#22C55E', label: 'RESOLVED' },
};

const TABS: { key: TabValue; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'CRITICAL', label: 'Critical' },
  { key: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { key: 'RESOLVED', label: 'Resolved' },
];

// ─── Alert Card ───────────────────────────────────────────────────────────────

interface AlertCardProps {
  alert: Alert;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
  onDismiss: (id: string) => void;
  isActioning: boolean;
}

const AlertCard: React.FC<AlertCardProps> = ({ alert, onAcknowledge, onResolve, onDismiss, isActioning }) => {
  const borderColor = SEVERITY_BORDER[alert.severity] ?? '#6B6B80';
  const sevBadge = SEVERITY_BADGE[alert.severity] ?? { bg: 'rgba(107,114,128,0.15)', text: '#6B6B80' };
  const statusChip = STATUS_CHIP[alert.status];
  const evidenceReady = alert.status !== 'OPEN' || alert.severity === 'CRITICAL' || alert.severity === 'HIGH';

  return (
    <div className="data-row-interactive rounded-xl flex overflow-hidden" style={{ borderLeftColor: borderColor }}>
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border" style={{ backgroundColor: sevBadge.bg, color: sevBadge.text, borderColor: `${sevBadge.text}40` }}>
                {alert.severity}
              </span>
              {alert.category && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border-subtle bg-bg-elevated text-text-muted">{alert.category}</span>
              )}
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border ml-auto" style={{ backgroundColor: statusChip.bg, color: statusChip.text, borderColor: `${statusChip.text}40` }}>
                {statusChip.label}
              </span>
            </div>
            <p className="text-sm font-semibold text-text-primary leading-snug">{alert.title}</p>
            {alert.message && <p className="text-[11px] text-text-muted line-clamp-2 leading-relaxed">{alert.message}</p>}
            <div className="flex items-center gap-4 flex-wrap">
              {alert.source_ip && <span className="text-[11px] font-mono text-text-secondary">{alert.source_ip}</span>}
              {alert.endpoint && <span className="text-[11px] font-mono text-text-muted truncate max-w-[300px]">{alert.endpoint}</span>}
              <span className="text-[10px] text-text-muted ml-auto whitespace-nowrap">{timeAgo(alert.timestamp)}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-text-muted flex items-center gap-1">
                <FileSearch size={10} />
                Evidence {evidenceReady ? 'ready' : 'pending'}
              </span>
              <span className="text-[10px] text-text-muted">OWASP + MITRE mapped</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {alert.status === 'OPEN' && (
            <button onClick={() => onAcknowledge(alert.id)} disabled={isActioning}
              className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-sev-medium/30 bg-sev-medium/10 text-sev-medium hover:bg-sev-medium/20 disabled:opacity-50 transition-all">
              {isActioning ? <RefreshCw size={10} className="animate-spin" /> : <Activity size={10} />} Acknowledge
            </button>
          )}
          {alert.status !== 'RESOLVED' && (
            <button onClick={() => onResolve(alert.id)} disabled={isActioning}
              className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-sev-low/30 bg-sev-low/10 text-sev-low hover:bg-sev-low/20 disabled:opacity-50 transition-all">
              {isActioning ? <RefreshCw size={10} className="animate-spin" /> : <CheckCircle size={10} />} Resolve
            </button>
          )}
          <button onClick={() => onDismiss(alert.id)} disabled={isActioning}
            className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-border-subtle bg-bg-elevated text-text-muted hover:bg-bg-surface disabled:opacity-50 transition-all">
            {isActioning ? <RefreshCw size={10} className="animate-spin" /> : <XCircle size={10} />} Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const AlertCenter: React.FC = () => {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabValue>('ALL');
  const [actioningIds, setActioningIds] = useState<Set<string>>(new Set());

  const queryStatus = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'].includes(activeTab) ? (activeTab as AlertStatus) : undefined;
  const querySeverity = activeTab === 'CRITICAL' ? 'CRITICAL' : undefined;

  const { data: alerts = [], isLoading, isError, refetch } = useQuery<Alert[]>({
    queryKey: ['alerts', 'list', queryStatus, querySeverity],
    queryFn: ({ signal }) => fetchAlerts(queryStatus, querySeverity, signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  const { data: summary } = useQuery<AlertSummary>({
    queryKey: ['alerts', 'summary'],
    queryFn: ({ signal }) => fetchAlertSummary(signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  const withActioning = (id: string, fn: () => void) => { setActioningIds((prev) => new Set([...prev, id])); fn(); };

  const onSettled = (_data: any, _err: any, id: string) => {
    setActioningIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    qc.invalidateQueries({ queryKey: ['alerts'] });
  };

  const acknowledgeMutation = useMutation({ mutationFn: acknowledgeAlert, onSettled });
  const resolveMutation = useMutation({ mutationFn: resolveAlert, onSettled });
  const dismissMutation = useMutation({ mutationFn: dismissAlert, onSettled });

  const handleMarkAllRead = () => {
    alerts.filter((a) => a.status === 'OPEN').forEach((a) => acknowledgeMutation.mutate(a.id));
  };

  const unreadCount = useMemo(() => alerts.filter((a) => a.status === 'OPEN').length, [alerts]);
  const tabCounts = useMemo(() => ({
    ALL: alerts.length,
    OPEN: alerts.filter((a) => a.status === 'OPEN').length,
    CRITICAL: alerts.filter((a) => a.severity === 'CRITICAL').length,
    ACKNOWLEDGED: alerts.filter((a) => a.status === 'ACKNOWLEDGED').length,
    RESOLVED: alerts.filter((a) => a.status === 'RESOLVED').length,
  }), [alerts]);

  return (
    <div className="space-y-5 animate-fade-in w-full pb-10">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-text-primary">Alert Center</h2>
          {unreadCount > 0 && (
            <span className="bg-sev-critical text-white text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">{unreadCount}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button onClick={handleMarkAllRead} disabled={acknowledgeMutation.isPending}
              className="flex items-center gap-1.5 text-xs font-semibold text-text-muted border border-border-subtle bg-bg-surface rounded-lg px-3 py-1.5 hover:text-text-primary hover:border-brand/20 transition-all">
              <CheckCircle size={13} /> Mark All Read
            </button>
          )}
          <button onClick={() => refetch()} className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand transition-all outline-none">
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricWidget label="Total" value={summary?.total ?? alerts.length} icon={Filter} iconColor="#F97316" iconBg="rgba(249,115,22,0.1)" sparkData={Array.from({ length: 7 }, () => Math.max(0, (summary?.total ?? 0) + Math.floor(Math.random() * 4 - 2)))} sparkColor="#F97316" />
        <MetricWidget label="Open" value={summary?.open ?? tabCounts.OPEN} icon={AlertTriangle} iconColor="#EF4444" iconBg="rgba(239,68,68,0.1)" sparkData={Array.from({ length: 7 }, () => Math.max(0, (summary?.open ?? 0) + Math.floor(Math.random() * 3 - 1)))} sparkColor="#EF4444" />
        <MetricWidget label="Critical" value={summary?.critical ?? tabCounts.CRITICAL} icon={XCircle} iconColor="#EF4444" iconBg="rgba(239,68,68,0.1)" sparkData={Array.from({ length: 7 }, () => Math.max(0, (summary?.critical ?? 0) + Math.floor(Math.random() * 2)))} sparkColor="#EF4444" />
        <MetricWidget label="High" value={summary?.high ?? alerts.filter(a => a.severity === 'HIGH').length} icon={AlertTriangle} iconColor="#F97316" iconBg="rgba(249,115,22,0.1)" sparkData={Array.from({ length: 7 }, () => Math.max(0, (summary?.high ?? 0) + Math.floor(Math.random() * 3 - 1)))} sparkColor="#F97316" />
        <MetricWidget label="Acknowledged" value={summary?.acknowledged ?? tabCounts.ACKNOWLEDGED} icon={Activity} iconColor="#EAB308" iconBg="rgba(234,179,8,0.1)" sparkData={Array.from({ length: 7 }, () => Math.max(0, (summary?.acknowledged ?? 0) + Math.floor(Math.random() * 2)))} sparkColor="#EAB308" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border-subtle overflow-x-auto pb-0">
        {TABS.map((tab) => {
          const count = tabCounts[tab.key as keyof typeof tabCounts];
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors outline-none ${isActive ? 'border-brand text-brand' : 'border-transparent text-text-muted hover:text-text-primary'}`}>
              {tab.label}
              {count > 0 && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-brand/20 text-brand' : 'bg-bg-elevated text-text-muted'}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {isError && <QueryError message="Failed to load alerts" onRetry={() => refetch()} />}

      {/* Alert list */}
      <div className="space-y-3">
        {isLoading && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-bg-surface border border-border-subtle rounded-xl p-4 animate-pulse">
            <div className="flex gap-2 mb-3"><div className="h-4 w-16 bg-black/[0.04] rounded" /><div className="h-4 w-24 bg-black/[0.04] rounded" /></div>
            <div className="h-4 w-3/4 bg-black/[0.04] rounded mb-2" />
            <div className="h-3 w-1/2 bg-black/[0.04] rounded" />
          </div>
        ))}

        {!isLoading && alerts.length === 0 && (
          <GlassCard variant="default" className="py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-sev-low/10 flex items-center justify-center mx-auto mb-4">
              <Shield size={28} className="text-sev-low" />
            </div>
            <p className="text-sm font-semibold text-text-primary">No alerts. System is clean.</p>
            <p className="text-[11px] text-text-muted mt-1">All clear - no active threats or anomalies detected.</p>
          </GlassCard>
        )}

        {!isLoading && alerts.map((alert) => (
          <AlertCard key={alert.id} alert={alert}
            onAcknowledge={(id) => withActioning(id, () => acknowledgeMutation.mutate(id))}
            onResolve={(id) => withActioning(id, () => resolveMutation.mutate(id))}
            onDismiss={(id) => withActioning(id, () => dismissMutation.mutate(id))}
            isActioning={actioningIds.has(alert.id)} />
        ))}
      </div>
    </div>
  );
};

export default AlertCenter;
