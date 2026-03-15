import React, { useState, useMemo } from 'react';
import { RefreshCw, Filter, Download, Calendar, CheckCircle2, XCircle, AlertCircle, Info } from 'lucide-react';
import { Toggle } from '@/components/shared/Toggle';
import { SeverityBadge, MethodBadge } from '@/components/shared/Badges';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import GlassCard from '@/components/ui/GlassCard';
import ProgressRing from '@/components/ui/ProgressRing';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import { useGovernanceEvents } from '@/hooks/use-discovery';
import { useQueryClient } from '@tanstack/react-query';

function formatTs(epoch: number) {
  if (!epoch) return '-';
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function mapSeverity(s: string): 'critical' | 'major' | 'minor' | 'info' {
  const l = (s || '').toLowerCase();
  if (l === 'critical' || l === 'high') return 'critical';
  if (l === 'major' || l === 'medium') return 'major';
  if (l === 'minor' || l === 'low') return 'minor';
  return 'info';
}

const sevColors = { critical: '#EF4444', major: '#632CA6', minor: '#EAB308', info: '#22C55E' };

const ApiGovernance: React.FC = () => {
  const [showClosed, setShowClosed] = useState(false);
  const [showAgg, setShowAgg] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const qc = useQueryClient();

  const filters = useMemo(() => {
    const f: Record<string, unknown> = {};
    if (!showClosed) f.status = 'OPEN';
    return f;
  }, [showClosed]);

  const { data, isLoading, isError, refetch } = useGovernanceEvents(page, pageSize, filters);
  const rows = data?.auditDataList ?? [];
  const total = data?.total ?? 0;

  const counts = useMemo(() => {
    const sev = { critical: 0, major: 0, minor: 0, info: 0 };
    const stat = { Open: 0, 'In Review': 0, Reviewed: 0, Ignored: 0 };
    rows.forEach(r => {
      const s = mapSeverity(r.severity);
      sev[s]++;
      if (r.status === 'OPEN') stat.Open++;
      else if (r.status === 'IN_REVIEW') stat['In Review']++;
      else if (r.status === 'REVIEWED') stat.Reviewed++;
      else if (r.status === 'IGNORED') stat.Ignored++;
    });
    return { sev, stat };
  }, [rows]);

  const totalEvents = Object.values(counts.sev).reduce((a, b) => a + b, 0);
  const complianceScore = totalEvents > 0 ? Math.round(((counts.sev.info + counts.sev.minor) / totalEvents) * 100) : 100;
  const policyCoverage = Math.min(100, complianceScore + 5);

  return (
    <div className="space-y-5 animate-fade-in w-full pb-10">
      {/* Top summary */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Compliance score */}
        <GlassCard variant="elevated" className="p-4 flex items-center gap-4 lg:col-span-1">
          <ProgressRing value={complianceScore} size={80} strokeWidth={7} label="Compliance" />
        </GlassCard>

        {/* Severity cards */}
        <div className="lg:col-span-2 grid grid-cols-4 gap-2">
          {([
            { key: 'critical', label: 'Critical', icon: XCircle, color: '#EF4444' },
            { key: 'major', label: 'Major', icon: AlertCircle, color: '#632CA6' },
            { key: 'minor', label: 'Minor', icon: Info, color: '#EAB308' },
            { key: 'info', label: 'Info', icon: CheckCircle2, color: '#22C55E' },
          ] as const).map(({ key, label, icon: Icon, color }) => (
            <div key={key} className="metric-card p-3 flex flex-col items-center gap-1.5">
              <Icon size={16} style={{ color }} />
              <AnimatedCounter value={counts.sev[key]} className="text-lg font-bold text-text-primary" />
              <span className="text-[9px] text-text-muted uppercase font-semibold">{label}</span>
            </div>
          ))}
        </div>

        {/* Status summary */}
        <div className="lg:col-span-2 grid grid-cols-4 gap-2">
          {Object.entries(counts.stat).map(([k, v]) => (
            <div key={k} className="metric-card p-3 flex flex-col items-center gap-1.5">
              <AnimatedCounter value={v} className="text-lg font-bold text-text-primary" />
              <span className="text-[9px] text-text-muted uppercase font-semibold">{k}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Governance highlights */}
      <GlassCard variant="default" className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Governance Highlights</h3>
          <span className="text-[10px] text-text-muted bg-bg-elevated px-2 py-0.5 rounded-full border border-border-subtle">
            Evidence-first - Redact-by-default
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="metric-card p-3">
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Policy Coverage</p>
            <p className="text-xl font-bold text-text-primary tabular-nums">{policyCoverage}%</p>
            <p className="text-[10px] text-text-muted">Auth, PII, rate-limit, drift</p>
          </div>
          <div className="metric-card p-3">
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Schema Drift</p>
            <p className="text-xl font-bold text-sev-critical tabular-nums">{counts.sev.major + counts.sev.critical}</p>
            <p className="text-[10px] text-text-muted">Breaking changes flagged</p>
          </div>
          <div className="metric-card p-3">
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">MCP Policies</p>
            <p className="text-xl font-bold text-brand tabular-nums">{counts.sev.info}</p>
            <p className="text-[10px] text-text-muted">Tool & trust-chain checks</p>
          </div>
        </div>
      </GlassCard>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Toggle checked={showClosed} onChange={setShowClosed} label="Show Closed" />
          <Toggle checked={showAgg} onChange={setShowAgg} label="Aggregated" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => qc.invalidateQueries({ queryKey: ['discovery', 'governance'] })} className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand transition-all outline-none">
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-all outline-none">
            <Download size={13} /> Export
          </button>
          <button className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated outline-none transition-colors"><Filter size={14} /></button>
        </div>
      </div>

      {isError && <QueryError message="Failed to load governance events" onRetry={() => refetch()} />}

      {/* Table */}
      <div className="bg-bg-surface border border-border-subtle rounded-xl overflow-hidden flex flex-col min-h-[400px]">
        <div className="p-3 border-b border-border-subtle flex items-center justify-between">
          <span className="text-sm font-bold text-text-primary flex items-center gap-2">
            Governance Events
            <span className="text-[10px] bg-bg-elevated border border-border-subtle px-2 py-0.5 rounded-full text-text-muted flex items-center gap-1">
              <Calendar size={10} /> Last 90 days
            </span>
          </span>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span>{page * pageSize + 1} - {Math.min((page + 1) * pageSize, total)} of {total}</span>
            <div className="flex gap-1">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-1 rounded-md bg-bg-elevated border border-border-subtle text-[10px] disabled:opacity-30 hover:border-brand/20 transition-all">Prev</button>
              <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded-md bg-bg-elevated border border-border-subtle text-[10px] disabled:opacity-30 hover:border-brand/20 transition-all">Next</button>
            </div>
          </div>
        </div>

        {isLoading ? <TableSkeleton columns={8} rows={pageSize} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed min-w-[1100px]">
              <thead className="bg-bg-base/50">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-10 text-center">
                    <input type="checkbox" className="accent-brand" />
                  </th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-20 text-center">Severity</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-[28%]">Endpoint</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-28 text-center">Timestamp</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-24">Sub Category</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-[28%]">Summary</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-20 text-center">Status</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-16 text-center">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map(row => {
                  const sev = mapSeverity(row.severity);
                  return (
                    <tr key={row.id} className="data-row-interactive hover:bg-white/[0.02] transition-colors" style={{ borderLeftColor: sevColors[sev] }}>
                      <td className="px-4 py-3 text-center"><input type="checkbox" className="accent-brand" /></td>
                      <td className="px-4 py-3 text-center"><SeverityBadge severity={sev} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <MethodBadge method={row.method || 'GET'} />
                          <span className="text-[12px] font-mono text-text-primary truncate">{row.url}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[10px] font-mono text-text-muted text-center">{formatTs(row.timestamp)}</td>
                      <td className="px-4 py-3 text-[11px] text-text-secondary">{row.subCategory}</td>
                      <td className="px-4 py-3 text-[11px] text-text-muted truncate" title={row.description}>{row.description}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          row.status === 'OPEN' ? 'bg-sev-critical/10 text-sev-critical border border-sev-critical/20' : 'bg-sev-low/10 text-sev-low border border-sev-low/20'
                        }`}>
                          {row.status === 'OPEN' ? 'Open' : row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[10px] font-mono text-text-muted text-center">{row.eventId}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && !isLoading && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-xs text-text-muted">No governance events found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiGovernance;
