import React, { useState } from 'react';
import { RefreshCw, ChevronRight, Activity, ShieldAlert, Eye, Lock, Cpu } from 'lucide-react';
import DonutChart from '@/components/charts/DonutChart';
import TimeFilter from '@/components/shared/TimeFilter';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import MetricWidget from '@/components/ui/MetricWidget';
import GlassCard from '@/components/ui/GlassCard';
import ProgressRing from '@/components/ui/ProgressRing';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import { useApiCollections, useEndpointsCount } from '@/hooks/use-discovery';
import { useIssueSummary } from '@/hooks/use-testing';
import { useDashboardKPIs } from '@/hooks/use-dashboard';
import { useQueryClient } from '@tanstack/react-query';

const Organization: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d'>('24h');
  const qc = useQueryClient();

  const { data: collectionsData, isLoading, isError, refetch } = useApiCollections();
  const epCount = useEndpointsCount();
  const issueSummary = useIssueSummary();
  const { threats } = useDashboardKPIs();

  const collections = collectionsData?.apiCollections ?? [];
  const totalApis = epCount.data?.endpointsCount ?? 0;

  const sev = issueSummary.data?.severityBreakdown ?? {};
  const criticalCount = (sev as any).CRITICAL ?? 0;
  const highCount = (sev as any).HIGH ?? 0;
  const mediumCount = (sev as any).MEDIUM ?? 0;
  const lowCount = (sev as any).LOW ?? 0;
  const totalVulns = issueSummary.data?.totalIssues ?? 0;
  const blockedActors = (threats.data as any)?.threatData?.blockedActors ?? 0;

  const riskData = [
    { name: 'Critical', value: criticalCount, color: '#EF4444' },
    { name: 'High', value: highCount, color: '#F97316' },
    { name: 'Medium', value: mediumCount, color: '#EAB308' },
    { name: 'Low', value: lowCount, color: '#22C55E' },
  ];
  const riskTotal = riskData.reduce((s, d) => s + d.value, 0);
  const healthScore = totalVulns === 0 ? 100 : Math.max(0, 100 - criticalCount * 15 - highCount * 8 - mediumCount * 3);

  return (
    <div className="space-y-5 animate-fade-in w-full pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-text-primary">Organization Overview</h2>
          <p className="text-[11px] text-text-muted mt-0.5">All applications and their security posture</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { qc.invalidateQueries({ queryKey: ['discovery'] }); qc.invalidateQueries({ queryKey: ['testing'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); }}
            className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand transition-all outline-none">
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <TimeFilter value={timeRange} onChange={setTimeRange} />
        </div>
      </div>

      {isError && <QueryError message="Failed to load organization data" onRetry={() => refetch()} />}

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {([
          { label: 'Total APIs', value: totalApis, icon: Cpu, color: '#632CA6', bg: 'rgba(99,44,175,0.1)' },
          { label: 'Critical Risk', value: criticalCount, icon: ShieldAlert, color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
          { label: 'High Risk', value: highCount, icon: ShieldAlert, color: '#F97316', bg: 'rgba(99,44,175,0.1)' },
          { label: 'Applications', value: collections.length, icon: Eye, color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
          { label: 'Total Vulns', value: totalVulns, icon: Activity, color: '#EAB308', bg: 'rgba(234,179,8,0.1)' },
          { label: 'Blocked Actors', value: blockedActors, icon: Lock, color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
        ] as const).map((item, i) => (
          <div key={item.label} className={`animate-stagger-${Math.min(i + 1, 6)}`}>
            <MetricWidget label={item.label} value={item.value} icon={item.icon} iconColor={item.color} iconBg={item.bg}
              sparkData={Array.from({ length: 7 }, () => Math.max(0, item.value + Math.floor(Math.random() * 4 - 2)))} sparkColor={item.color} />
          </div>
        ))}
      </div>

      {/* Posture + Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard variant="elevated" className="p-5 flex items-center gap-6">
          <ProgressRing value={healthScore} max={100} size={100} strokeWidth={8} label="Health" />
          <div className="flex-1">
            <h3 className="text-sm font-bold text-text-primary mb-2">Security Posture</h3>
            <div className="flex items-baseline gap-1.5 mb-3">
              <span className="text-2xl font-bold text-text-primary tabular-nums"><AnimatedCounter value={totalApis} /></span>
              <span className="text-[11px] text-text-muted">APIs monitored</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {[
                ['Collections', String(collections.length), 'var(--text-primary)'],
                ['Critical', String(criticalCount), '#EF4444'],
                ['High', String(highCount), '#F97316'],
                ['Medium', String(mediumCount), '#EAB308'],
                ['Low', String(lowCount), '#22C55E'],
                ['Total Vulns', String(totalVulns), '#EAB308'],
              ].map(([k, v, c]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-[10px] text-text-muted">{k}</span>
                  <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color: c }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        <GlassCard variant="elevated" className="p-5 flex items-center gap-6">
          <DonutChart data={riskData} centerValue={riskTotal} size={120} innerRadius={38} outerRadius={55} centerLabel="Vulns" />
          <div className="flex-1">
            <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Vulnerability Distribution</span>
            <div className="mt-3 space-y-2">
              {riskData.map(({ name, value, color }) => (
                <div key={name} className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm" style={{ background: color }} /><span className="text-[11px] text-text-secondary">{name}</span></div>
                    <span className="text-[11px] font-bold font-mono tabular-nums" style={{ color }}>{value}</span>
                  </div>
                  <div className="h-1 bg-black/[0.04] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${riskTotal > 0 ? (value / riskTotal) * 100 : 0}%`, background: color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Applications */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Applications</h3>
          <span className="text-[10px] bg-bg-elevated border border-border-subtle px-2 py-0.5 rounded-full text-text-muted">{collections.length} apps</span>
        </div>

        {isLoading ? <TableSkeleton columns={6} rows={3} /> : (
          <div className="space-y-3">
            {collections.length === 0 && (
              <GlassCard variant="default" className="p-12 text-center">
                <Cpu size={32} className="mx-auto mb-3 text-text-muted" />
                <p className="text-xs text-text-muted">No applications found. Connect a traffic source to start discovering APIs.</p>
              </GlassCard>
            )}
            {collections.map((app: any, idx: number) => {
              const isDefault = collections.length === 1 || idx === 0;
              const epValue = isDefault ? totalApis : (app.urlsCount ?? 0);
              const critVal = isDefault ? criticalCount : 0;
              const highVal = isDefault ? highCount : 0;
              const medVal = isDefault ? mediumCount : 0;
              const lowVal = isDefault ? lowCount : 0;
              const vulnCount = isDefault ? totalVulns : 0;

              return (
                <GlassCard key={app.id} variant="default" className="p-5 cursor-pointer" hoverLift>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-brand/10 border border-brand/20">
                        <Cpu size={16} className="text-brand" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-text-primary">{app.displayName || app.hostName || `Collection ${app.id}`}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-border-subtle text-text-muted bg-black/[0.04]">{app.type || 'API'}</span>
                          <span className="text-[10px] text-text-muted">{app.hostName}</span>
                        </div>
                      </div>
                    </div>
                    <button className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-brand bg-brand/10 border border-brand/20 hover:bg-brand/20 transition-all">
                      Open Dashboard <ChevronRight size={12} />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 pt-3 border-t border-border-subtle">
                    {[
                      { label: 'Endpoints', value: epValue, color: 'var(--text-primary)' },
                      { label: 'Critical', value: critVal, color: '#EF4444' },
                      { label: 'High', value: highVal, color: '#F97316' },
                      { label: 'Medium', value: medVal, color: '#EAB308' },
                      { label: 'Low', value: lowVal, color: '#22C55E' },
                      { label: 'Total Vulns', value: vulnCount, color: '#EF4444' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex flex-col gap-1">
                        <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">{label}</span>
                        <span className="text-sm font-bold font-mono tabular-nums" style={{ color }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Organization;
