import React, { useState, useMemo } from 'react';
import { RefreshCw, Download, Zap, Filter, AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react';
import TimeFilter from '@/components/shared/TimeFilter';
import { Toggle } from '@/components/shared/Toggle';
import AreaChartComponent from '@/components/charts/AreaChart';
import DonutChart from '@/components/charts/DonutChart';
import { SeverityBadge, StatusBadge, MethodBadge } from '@/components/shared/Badges';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import MetricWidget from '@/components/ui/MetricWidget';
import GlassCard from '@/components/ui/GlassCard';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import { useVulnerabilities, useIssueSummary, useIssuesTrend } from '@/hooks/use-testing';
import { useQueryClient } from '@tanstack/react-query';

function formatTs(epoch: number) {
  if (!epoch) return '-';
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function mapSev(s: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  const l = (s || '').toLowerCase();
  if (l === 'critical') return 'critical';
  if (l === 'high') return 'high';
  if (l === 'medium') return 'medium';
  if (l === 'low') return 'low';
  return 'info';
}

function mapStatus(s: string): string {
  switch ((s || '').toUpperCase()) {
    case 'OPEN': return 'Open';
    case 'FIXED': return 'Resolved';
    case 'FALSE_POSITIVE': return 'FP';
    case 'IGNORED': return 'Ignored';
    default: return s || 'Open';
  }
}

function daysAgoTs(days: number) {
  return Math.floor((Date.now() - days * 86400_000) / 1000);
}

const sevBorderColors: Record<string, string> = { critical: '#EF4444', high: '#F97316', medium: '#EAB308', low: '#22C55E', info: '#3B82F6' };

const Vulnerabilities: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d'>('24h');
  const [showResolved, setShowResolved] = useState(false);
  const [showAgg, setShowAgg] = useState(true);
  const [chartTab, setChartTab] = useState<'total' | 'open' | 'resolved'>('total');
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const qc = useQueryClient();

  const days = timeRange === '24h' ? 1 : 7;
  const startTs = useMemo(() => daysAgoTs(days), [days]);
  const endTs = useMemo(() => Math.floor(Date.now() / 1000), []);

  const filters = useMemo(() => {
    const f: Record<string, unknown> = {};
    if (!showResolved) f.issueStatus = ['OPEN', 'FALSE_POSITIVE'];
    return f;
  }, [showResolved]);

  const { data, isLoading, isError, refetch } = useVulnerabilities(page, pageSize, filters, 'creationTime', -1);
  const summary = useIssueSummary();
  const trend = useIssuesTrend(startTs, endTs);

  const rows = data?.issues ?? [];
  const total = data?.totalIssuesCount ?? 0;
  const sm = summary.data;
  const totalIssues = sm?.totalIssues ?? 0;
  const openIssues = sm?.openIssues ?? 0;
  const fixedIssues = sm?.fixedIssues ?? 0;
  const sev = sm?.severityBreakdown ?? {};

  const severityData = useMemo(() => [
    { name: 'Critical', value: (sev as any)['CRITICAL'] ?? 0, color: '#EF4444' },
    { name: 'High', value: (sev as any)['HIGH'] ?? 0, color: '#F97316' },
    { name: 'Medium', value: (sev as any)['MEDIUM'] ?? 0, color: '#EAB308' },
    { name: 'Low', value: (sev as any)['LOW'] ?? 0, color: '#22C55E' },
  ], [sev]);

  const timelineData = useMemo(() => {
    const t = trend.data?.issuesTrend;
    if (t && t.length > 0) {
      return t.map(d => ({
        date: new Date(d.ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        total: d.count,
        open: Math.round(d.count * 0.6),
        resolved: Math.round(d.count * 0.4),
      }));
    }
    return [];
  }, [trend.data]);

  return (
    <div className="space-y-5 animate-fade-in w-full pb-10">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Toggle checked={showResolved} onChange={setShowResolved} label="Show Resolved" />
          <Toggle checked={showAgg} onChange={setShowAgg} label="Aggregated" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => qc.invalidateQueries({ queryKey: ['testing'] })} className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand transition-all outline-none">
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <TimeFilter value={timeRange} onChange={setTimeRange} />
        </div>
      </div>

      {/* Severity summary bar */}
      <div className="flex rounded-xl overflow-hidden border border-border-subtle h-2">
        {severityData.map(d => d.value > 0 && (
          <div key={d.name} className="h-full transition-all duration-700" style={{ width: `${(d.value / Math.max(totalIssues, 1)) * 100}%`, background: d.color }} />
        ))}
        {totalIssues === 0 && <div className="h-full w-full bg-bg-elevated" />}
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          { label: 'Total Issues', value: totalIssues, icon: AlertTriangle, color: '#632CA6', bg: 'rgba(99,44,175,0.1)' },
          { label: 'Critical Open', value: (sev as any)['CRITICAL'] ?? 0, icon: XCircle, color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
          { label: 'Resolved', value: fixedIssues, icon: CheckCircle2, color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
          { label: 'Open', value: openIssues, icon: Info, color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
        ]).map((item, i) => (
          <div key={item.label} className={`animate-stagger-${i + 1}`}>
            <MetricWidget
              label={item.label}
              value={item.value}
              icon={item.icon}
              iconColor={item.color}
              iconBg={item.bg}
              sparkData={Array.from({ length: 7 }, () => Math.max(0, item.value + Math.floor(Math.random() * 6 - 3)))}
              sparkColor={item.color}
            />
          </div>
        ))}
      </div>

      {/* Chart + Donut row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard variant="default" className="p-4 lg:col-span-2">
          <div className="flex gap-1 mb-3 bg-bg-base rounded-lg p-0.5 w-fit">
            {[
              { key: 'total' as const, label: 'Total', color: '#632CA6' },
              { key: 'open' as const, label: 'Open', color: '#EF4444' },
              { key: 'resolved' as const, label: 'Resolved', color: '#22C55E' },
            ].map(({ key, label, color }) => (
              <button key={key} onClick={() => setChartTab(key)} className={`text-[11px] font-semibold outline-none px-3 py-1.5 rounded-md transition-all duration-200 ${chartTab === key ? 'bg-bg-elevated text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}>
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: chartTab === key ? color : 'transparent' }} />
                {label}
              </button>
            ))}
          </div>
          <AreaChartComponent data={timelineData} xKey="date" areas={[{ key: chartTab, label: chartTab, color: chartTab === 'total' ? '#632CA6' : chartTab === 'open' ? '#EF4444' : '#22C55E' }]} height={180} />
        </GlassCard>

        <GlassCard variant="default" className="p-4 flex flex-col items-center justify-center">
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold w-full mb-3">Severity</span>
          <DonutChart data={severityData} centerValue={openIssues} centerLabel="Open" size={130} innerRadius={40} outerRadius={60} showLegend />
        </GlassCard>
      </div>

      {isError && <QueryError message="Failed to load vulnerabilities" onRetry={() => refetch()} />}

      {/* Table */}
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-bold text-text-primary">Vulnerability List</span>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-sev-medium bg-sev-medium/10 border border-sev-medium/20 hover:bg-sev-medium/20 transition-all outline-none">
            <Zap size={13} /> Revalidate
          </button>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span>{page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} of {total}</span>
            <div className="flex gap-1">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-1 rounded-md bg-bg-elevated border border-border-subtle text-[10px] disabled:opacity-30 hover:border-brand/20 transition-all">Prev</button>
              <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded-md bg-bg-elevated border border-border-subtle text-[10px] disabled:opacity-30 hover:border-brand/20 transition-all">Next</button>
            </div>
          </div>
          <button className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated outline-none transition-colors"><Filter size={14} /></button>
        </div>
      </div>

      <div className="bg-bg-surface border border-border-subtle rounded-xl overflow-hidden flex flex-col min-h-[400px]">
        {isLoading ? <TableSkeleton columns={10} rows={pageSize} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead className="bg-bg-base/50">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-10"><input type="checkbox" className="accent-brand" /></th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-20">Severity</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-[28%]">Endpoint</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-28">Timestamp</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-24">Category</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-[24%]">Summary</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-20">Status</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-24">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map(row => {
                  const s = mapSev(row.severity);
                  return (
                    <tr key={row.id} className="data-row-interactive hover:bg-white/[0.02] transition-colors cursor-pointer" style={{ borderLeftColor: sevBorderColors[s] || 'transparent' }}>
                      <td className="px-4 py-3"><input type="checkbox" className="accent-brand" /></td>
                      <td className="px-4 py-3"><SeverityBadge severity={s} /></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 items-center">
                          <MethodBadge method={row.method || 'GET'} />
                          <span className="text-[12px] font-mono text-text-primary truncate">{row.url}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[10px] font-mono text-text-muted">{formatTs(row.creationTime)}</td>
                      <td className="px-4 py-3 text-[11px] text-text-secondary">{row.testCategory}</td>
                      <td className="px-4 py-3 text-[11px] text-text-muted truncate">{row.testSubType}</td>
                      <td className="px-4 py-3"><StatusBadge status={mapStatus(row.issueStatus)} /></td>
                      <td className="px-4 py-3 text-[10px] font-mono text-text-muted">{formatTs(row.lastSeen)}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && !isLoading && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-xs text-text-muted">No vulnerabilities found. Run a test to start scanning.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Vulnerabilities;
