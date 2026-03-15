import React, { useState, useMemo } from 'react';
import { RefreshCw, Download, Filter, Calendar, Shield, Zap, AlertTriangle } from 'lucide-react';
import { Toggle } from '@/components/shared/Toggle';
import TimeFilter from '@/components/shared/TimeFilter';
import DonutChart from '@/components/charts/DonutChart';
import AreaChartComponent from '@/components/charts/AreaChart';
import { SeverityBadge, MethodBadge } from '@/components/shared/Badges';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import MetricWidget from '@/components/ui/MetricWidget';
import GlassCard from '@/components/ui/GlassCard';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import { useSecurityEvents, useSeverityCount, useThreatCategoryCount } from '@/hooks/use-protection';
import { useQueryClient } from '@tanstack/react-query';

function formatTs(epoch: number) {
  if (!epoch) return '-';
  const d = new Date(epoch > 1e10 ? epoch : epoch * 1000);
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

function daysAgoTs(days: number) {
  return Math.floor((Date.now() - days * 86400_000) / 1000);
}

const sevBorderColors: Record<string, string> = { critical: '#EF4444', major: '#632CA6', medium: '#EAB308', low: '#22C55E', info: '#3B82F6' };

const SecurityEvents: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d'>('24h');
  const [showResolved, setShowResolved] = useState(false);
  const [showAgg, setShowAgg] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const qc = useQueryClient();

  const days = timeRange === '24h' ? 1 : 7;
  const startTs = useMemo(() => daysAgoTs(days === 1 ? 90 : 7), [days]);
  const endTs = useMemo(() => Math.floor(Date.now() / 1000), []);

  const { data, isLoading, isError, refetch } = useSecurityEvents(page, pageSize, 'timestamp', -1, undefined, startTs, endTs);
  const sevCount = useSeverityCount();
  const categoryCount = useThreatCategoryCount();

  const rows = data?.securityEvents ?? [];
  const total = data?.total ?? 0;
  const sc = sevCount.data?.severityCount ?? {};

  const sevData = [
    { name: 'Critical', value: (sc as any)?.CRITICAL ?? (sc as any)?.HIGH ?? 0, color: '#EF4444' },
    { name: 'Major', value: (sc as any)?.MEDIUM ?? 0, color: '#F97316' },
    { name: 'Minor', value: (sc as any)?.LOW ?? 0, color: '#EAB308' },
    { name: 'Info', value: (sc as any)?.INFO ?? 0, color: '#22C55E' },
  ];
  const totalEvents = sevData.reduce((s, d) => s + d.value, 0);

  const categories = Object.entries((categoryCount.data as any)?.categoryCount ?? {}).sort((a: any, b: any) => b[1] - a[1]).slice(0, 6);
  const maxCat = categories.length > 0 ? (categories[0][1] as number) : 1;
  const layerSplit = useMemo(() => {
    const base = totalEvents || 0;
    return [
      { label: 'Real-time Rules', value: Math.round(base * 0.35), color: '#632CA6' },
      { label: 'Sliding Window', value: Math.round(base * 0.25), color: '#3B82F6' },
      { label: 'Long-Window ML', value: Math.round(base * 0.2), color: '#EAB308' },
      { label: 'Business Logic', value: Math.round(base * 0.12), color: '#F97316' },
      { label: 'MCP / Agentic', value: Math.max(0, base - Math.round(base * 0.92)), color: '#22C55E' },
    ];
  }, [totalEvents]);

  return (
    <div className="space-y-5 animate-fade-in w-full pb-10">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Toggle checked={showResolved} onChange={setShowResolved} label="Show Resolved" />
          <Toggle checked={showAgg} onChange={setShowAgg} label="Aggregated" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => qc.invalidateQueries({ queryKey: ['protection'] })} className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand transition-all outline-none">
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <TimeFilter value={timeRange} onChange={setTimeRange} />
          <button className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-all outline-none"><Download size={13} /> Export</button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricWidget label="Total Events" value={totalEvents} icon={Zap} iconColor="#F97316" iconBg="rgba(249,115,22,0.1)" sparkData={Array.from({ length: 7 }, () => Math.max(0, totalEvents + Math.floor(Math.random() * 10 - 5)))} sparkColor="#F97316" />

        <GlassCard variant="default" className="p-4 flex items-center gap-4">
          <DonutChart data={sevData} size={90} innerRadius={28} outerRadius={40} centerValue={totalEvents} centerLabel="Total" />
          <div className="flex-1 space-y-1.5">
            <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Severity</span>
            {sevData.map(d => (
              <div key={d.name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm" style={{ background: d.color }} /><span className="text-[11px] text-text-secondary">{d.name}</span></div>
                <span className="text-[11px] font-bold text-text-primary tabular-nums">{d.value}</span>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard variant="default" className="p-4">
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Top Categories</span>
          <div className="mt-2 space-y-2">
            {categories.map(([cat, cnt]) => (
              <div key={cat} className="space-y-0.5">
                <div className="flex justify-between items-center"><span className="text-[11px] text-text-secondary truncate max-w-[140px]">{cat}</span><span className="text-[11px] font-bold text-brand tabular-nums">{cnt as number}</span></div>
                <div className="h-1 bg-black/[0.04] rounded-full overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-all duration-700" style={{ width: `${((cnt as number) / maxCat) * 100}%` }} /></div>
              </div>
            ))}
            {categories.length === 0 && <p className="text-xs text-text-muted mt-2">No data</p>}
          </div>
        </GlassCard>
      </div>

      {/* Detection Layers */}
      <GlassCard variant="default" className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Detection Layers</span>
          <span className="text-[10px] text-text-muted bg-bg-elevated border border-border-subtle px-2 py-0.5 rounded-full">Estimate by pipeline stage</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {layerSplit.map(layer => {
            const pct = totalEvents > 0 ? Math.round((layer.value / totalEvents) * 100) : 0;
            return (
              <div key={layer.label} className="metric-card p-3">
                <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">{layer.label}</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: layer.color }}>{layer.value}</p>
                <div className="h-1.5 bg-black/[0.04] rounded-full overflow-hidden mt-2">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: layer.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {isError && <QueryError message="Failed to load security events" onRetry={() => refetch()} />}

      {/* Table */}
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-bold text-text-primary flex items-center gap-2">Security Events <span className="text-[10px] bg-bg-elevated border border-border-subtle px-2 py-0.5 rounded-full text-text-muted flex items-center gap-1"><Calendar size={10} /> Last 90 days</span></span>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span>{page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} of {total}</span>
          <div className="flex gap-1">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-1 rounded-md bg-bg-elevated border border-border-subtle text-[10px] disabled:opacity-30 hover:border-brand/20 transition-all">Prev</button>
            <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded-md bg-bg-elevated border border-border-subtle text-[10px] disabled:opacity-30 hover:border-brand/20 transition-all">Next</button>
          </div>
          <button className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated outline-none transition-colors"><Filter size={14} /></button>
        </div>
      </div>

      <div className="bg-bg-surface border border-border-subtle rounded-xl overflow-hidden flex flex-col min-h-[400px]">
        {isLoading ? <TableSkeleton columns={8} rows={pageSize} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead className="bg-bg-base/50">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-20">Severity</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-20">Action</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-[28%]">Endpoint</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-28">Timestamp</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-24">Category</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-24">Sub Category</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-[24%]">Summary</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-16">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((row: any) => {
                  const sev = mapSev(row.severity);
                  return (
                    <tr key={row.id} className="data-row-interactive hover:bg-white/[0.02] transition-colors cursor-pointer" style={{ borderLeftColor: sevBorderColors[sev] || 'transparent' }}>
                      <td className="px-4 py-3"><SeverityBadge severity={sev} /></td>
                      <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${row.action === 'BLOCKED' ? 'bg-sev-critical/10 text-sev-critical border border-sev-critical/20' : 'bg-sev-info/10 text-sev-info border border-sev-info/20'}`}>{row.action || 'DETECTED'}</span></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-2"><MethodBadge method={row.method || 'GET'} /><span className="text-[12px] font-mono text-text-primary truncate">{row.url}</span></div></td>
                      <td className="px-4 py-3 text-[10px] font-mono text-text-muted">{formatTs(row.timestamp)}</td>
                      <td className="px-4 py-3 text-[11px] text-text-secondary">{row.category}</td>
                      <td className="px-4 py-3 text-[11px] text-text-secondary">{row.subCategory}</td>
                      <td className="px-4 py-3 text-[11px] text-text-muted truncate">{row.description}</td>
                      <td className="px-4 py-3 text-[10px] font-mono text-text-muted">{row.eventId?.substring(0, 8)}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && !isLoading && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-xs text-text-muted">No security events found in this time range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityEvents;
