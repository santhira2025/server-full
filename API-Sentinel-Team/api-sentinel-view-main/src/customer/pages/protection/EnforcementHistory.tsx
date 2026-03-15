import React, { useState, useMemo } from 'react';
import { RefreshCw, Calendar, Shield, Filter, ShieldBan, Activity } from 'lucide-react';
import { SeverityBadge, MethodBadge } from '@/components/shared/Badges';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import MetricWidget from '@/components/ui/MetricWidget';
import GlassCard from '@/components/ui/GlassCard';
import DonutChart from '@/components/charts/DonutChart';
import { useSecurityEvents } from '@/hooks/use-protection';
import { useQueryClient } from '@tanstack/react-query';

function formatTs(epoch: number) {
  if (!epoch) return '-';
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function mapSev(s: string): 'critical' | 'major' | 'medium' | 'low' | 'info' {
  const l = (s || '').toLowerCase();
  if (l === 'critical' || l === 'high') return 'critical';
  if (l === 'major' || l === 'medium') return 'major';
  if (l === 'minor' || l === 'low') return 'low';
  return 'info';
}

const sevBorderColors: Record<string, string> = { critical: '#EF4444', major: '#632CA6', medium: '#EAB308', low: '#22C55E', info: '#3B82F6' };

const EnforcementHistory: React.FC = () => {
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const qc = useQueryClient();

  const startTs = useMemo(() => Math.floor((Date.now() - 90 * 86400_000) / 1000), []);
  const endTs = useMemo(() => Math.floor(Date.now() / 1000), []);

  const { data, isLoading, isError, refetch } = useSecurityEvents(page, pageSize, 'timestamp', -1, undefined, startTs, endTs);
  const rows = data?.maliciousEvents ?? [];
  const total = data?.total ?? 0;

  const sevStats = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 };
    rows.forEach(r => {
      const s = (r.severity || '').toUpperCase();
      if (s === 'CRITICAL') c.critical++;
      else if (s === 'HIGH') c.high++;
      else if (s === 'MEDIUM') c.medium++;
      else c.low++;
    });
    return c;
  }, [rows]);

  const catStats = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach(r => { const c = r.category || r.filterId || 'Unknown'; m[c] = (m[c] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [rows]);

  return (
    <div className="space-y-5 animate-fade-in w-full pb-10">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-text-primary">Enforcement History</h2>
        <button onClick={() => qc.invalidateQueries({ queryKey: ['protection'] })} className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand transition-all outline-none">
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricWidget label="Total Enforcements" value={total} icon={ShieldBan} iconColor="#EF4444" iconBg="rgba(239,68,68,0.1)" sparkData={Array.from({ length: 7 }, () => Math.max(0, total + Math.floor(Math.random() * 6 - 3)))} sparkColor="#EF4444" />

        <GlassCard variant="default" className="p-4 flex items-center gap-4">
          <DonutChart data={[
            { name: 'Critical', value: sevStats.critical, color: '#EF4444' },
            { name: 'High', value: sevStats.high, color: '#F97316' },
            { name: 'Medium', value: sevStats.medium, color: '#EAB308' },
            { name: 'Low', value: sevStats.low, color: '#22C55E' },
          ]} size={90} innerRadius={28} outerRadius={40} centerLabel="Sev" />
          <div className="flex-1 space-y-1.5">
            <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">By Severity</span>
            {[
              { label: 'Critical', value: sevStats.critical, color: '#EF4444' },
              { label: 'High', value: sevStats.high, color: '#F97316' },
              { label: 'Medium', value: sevStats.medium, color: '#EAB308' },
              { label: 'Low', value: sevStats.low, color: '#22C55E' },
            ].map(d => (
              <div key={d.label} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm" style={{ background: d.color }} /><span className="text-[11px] text-text-secondary">{d.label}</span></div>
                <span className="text-[11px] font-bold text-text-primary tabular-nums">{d.value}</span>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard variant="default" className="p-4">
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Top Categories</span>
          <div className="mt-2 space-y-2">
            {catStats.map(([cat, cnt]) => {
              const maxCat = catStats.length > 0 ? catStats[0][1] : 1;
              return (
                <div key={cat} className="space-y-0.5">
                  <div className="flex justify-between items-center"><span className="text-[11px] text-text-secondary truncate max-w-[140px]">{cat}</span><span className="text-[11px] font-bold text-brand tabular-nums">{cnt}</span></div>
                  <div className="h-1 bg-black/[0.04] rounded-full overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-all duration-700" style={{ width: `${(cnt / maxCat) * 100}%` }} /></div>
                </div>
              );
            })}
            {catStats.length === 0 && <p className="text-xs text-text-muted mt-2">No data</p>}
          </div>
        </GlassCard>
      </div>

      {isError && <QueryError message="Failed to load enforcement history" onRetry={() => refetch()} />}

      {/* Table */}
      <div className="bg-bg-surface border border-border-subtle rounded-xl overflow-hidden flex flex-col min-h-[400px]">
        <div className="p-3 border-b border-border-subtle flex items-center justify-between">
          <span className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Activity size={14} className="text-sev-critical" />
            Blocked Events
            <span className="text-[10px] bg-bg-elevated border border-border-subtle px-2 py-0.5 rounded-full text-text-muted flex items-center gap-1"><Calendar size={10} /> Last 90 Days</span>
          </span>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span>{total > 0 ? `${page * pageSize + 1}-${Math.min((page + 1) * pageSize, total)}` : '0'} of {total}</span>
            <div className="flex gap-1">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-1 rounded-md bg-bg-elevated border border-border-subtle text-[10px] disabled:opacity-30 hover:border-brand/20 transition-all">Prev</button>
              <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded-md bg-bg-elevated border border-border-subtle text-[10px] disabled:opacity-30 hover:border-brand/20 transition-all">Next</button>
            </div>
            <button className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated outline-none transition-colors"><Filter size={14} /></button>
          </div>
        </div>

        {isLoading ? <TableSkeleton columns={6} rows={pageSize} /> : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="bg-bg-base/50">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-20">Severity</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-20">Action</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-[30%]">Endpoint</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-24">Category</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-28">Timestamp</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-[24%]">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((row: any) => {
                  const sev = mapSev(row.severity);
                  return (
                    <tr key={row.id} className="data-row-interactive hover:bg-white/[0.02] transition-colors" style={{ borderLeftColor: sevBorderColors[sev] || 'transparent' }}>
                      <td className="px-4 py-3"><SeverityBadge severity={sev} /></td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sev-critical/10 text-sev-critical border border-sev-critical/20">Blocked</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <MethodBadge method={row.method || 'GET'} />
                          <span className="text-[12px] font-mono text-text-primary truncate">{row.url}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-text-secondary">{row.category || row.filterId || '-'}</td>
                      <td className="px-4 py-3 text-[10px] font-mono text-text-muted">{formatTs(row.timestamp)}</td>
                      <td className="px-4 py-3 text-[11px] text-text-muted truncate">{row.description || '-'}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && !isLoading && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-xs text-text-muted">
                    <Shield size={24} className="mx-auto mb-2 text-text-muted" />
                    No enforcement actions found.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnforcementHistory;
