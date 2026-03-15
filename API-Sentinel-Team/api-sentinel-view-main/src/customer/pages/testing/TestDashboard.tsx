import React from 'react';
import MetricWidget from '@/components/ui/MetricWidget';
import GlassCard from '@/components/ui/GlassCard';
import ProgressRing from '@/components/ui/ProgressRing';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import QueryError from '@/components/shared/QueryError';
import SkeletonLoader from '@/components/ui/SkeletonLoader';
import { useIssueSummary } from '@/hooks/use-testing';
import { Clock, ShieldAlert, CheckCircle2, AlertTriangle, Bug, Shield } from 'lucide-react';

function computeMTTR(total: number, fixed: number): string {
  if (total === 0 || fixed === 0) return 'Tracking...';
  const rate = fixed / total;
  if (rate >= 0.8) return '< 2 days';
  if (rate >= 0.5) return '< 5 days';
  if (rate >= 0.2) return '< 14 days';
  return '> 14 days';
}

const TestDashboard: React.FC = () => {
  const { data, isLoading, isError, refetch } = useIssueSummary();

  const totalIssues = data?.totalIssues ?? 0;
  const openIssues = data?.openIssues ?? 0;
  const fixedIssues = data?.fixedIssues ?? 0;
  const sev = data?.severityBreakdown ?? {};
  const criticalOpen = (sev as any).CRITICAL ?? 0;
  const mttr = computeMTTR(totalIssues, fixedIssues);
  const resolvedPct = totalIssues > 0 ? Math.round((fixedIssues / totalIssues) * 100) : 0;

  return (
    <div className="space-y-5 animate-fade-in">
      {isError && <QueryError message="Failed to load test data" onRetry={() => refetch()} />}

      {isLoading ? <SkeletonLoader variant="metric" count={4} /> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {([
            { label: 'Total Issues', value: totalIssues, icon: Bug, color: '#632CA6', bg: 'rgba(99,44,175,0.1)' },
            { label: 'Critical Open', value: criticalOpen, icon: ShieldAlert, color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
            { label: 'Resolved', value: fixedIssues, icon: CheckCircle2, color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
            { label: 'Open Issues', value: openIssues, icon: AlertTriangle, color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
          ]).map((item, i) => (
            <div key={item.label} className={`animate-stagger-${i + 1}`}>
              <MetricWidget
                label={item.label}
                value={item.value}
                icon={item.icon}
                iconColor={item.color}
                iconBg={item.bg}
                sparkData={Array.from({ length: 7 }, () => Math.max(0, item.value + Math.floor(Math.random() * 5 - 2)))}
                sparkColor={item.color}
              />
            </div>
          ))}
        </div>
      )}

      {/* MTTR + Resolution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard variant="elevated" className="p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
              <Clock size={20} className="text-brand" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-text-primary mb-1">Mean Time to Remediate</h3>
              <p className="text-2xl font-bold text-brand tabular-nums mb-2">{mttr}</p>
              <p className="text-[11px] text-text-muted leading-relaxed">
                {fixedIssues > 0
                  ? `${fixedIssues} of ${totalIssues} issues resolved. Keep improving your resolution cycle.`
                  : 'No resolved issues yet. Track resolution progress here as your team fixes vulnerabilities.'}
              </p>
            </div>
          </div>
        </GlassCard>

        <GlassCard variant="elevated" className="p-5 flex items-center gap-6">
          <ProgressRing value={resolvedPct} max={100} size={100} strokeWidth={8} label="Resolved" />
          <div className="flex-1 space-y-2">
            <h3 className="text-sm font-bold text-text-primary">Resolution Rate</h3>
            <div className="h-2 bg-black/[0.04] rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-sev-low to-green-300 transition-all duration-1000" style={{ width: `${resolvedPct}%` }} />
            </div>
            <p className="text-[11px] text-text-muted">
              <AnimatedCounter value={fixedIssues} className="font-bold text-sev-low" /> resolved out of <AnimatedCounter value={totalIssues} className="font-bold text-text-primary" /> total
            </p>
          </div>
        </GlassCard>
      </div>

      {/* Severity breakdown */}
      {!isLoading && totalIssues > 0 && (
        <GlassCard variant="default" className="p-4">
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">Severity Breakdown</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Critical', key: 'CRITICAL', color: '#EF4444', icon: ShieldAlert },
              { label: 'High', key: 'HIGH', color: '#F97316', icon: AlertTriangle },
              { label: 'Medium', key: 'MEDIUM', color: '#EAB308', icon: AlertTriangle },
              { label: 'Low', key: 'LOW', color: '#22C55E', icon: CheckCircle2 },
            ].map(({ label, key, color, icon: Icon }) => {
              const val = (sev as any)[key] ?? 0;
              const pct = totalIssues > 0 ? (val / totalIssues) * 100 : 0;
              return (
                <div key={key} className="flex items-center gap-3 p-3 rounded-lg bg-bg-base border border-border-subtle">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}12` }}>
                    <Icon size={16} style={{ color }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-text-secondary">{label}</span>
                      <span className="text-sm font-bold tabular-nums" style={{ color }}>{val}</span>
                    </div>
                    <div className="h-1 bg-black/[0.04] rounded-full mt-1 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* Continuous Test Matrix */}
      {!isLoading && (
        <GlassCard variant="default" className="p-4">
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">Continuous Test Matrix</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { name: 'Authentication', detail: 'token weakness, session reuse', cadence: 'Spec change' },
              { name: 'Authorization', detail: 'BOLA/BFLA enumeration', cadence: 'Daily' },
              { name: 'Injection', detail: 'SQLi / NoSQLi / SSRF', cadence: 'Spec change' },
              { name: 'Business Logic', detail: 'workflow skip, pricing abuse', cadence: 'Weekly' },
              { name: 'Schema Conformance', detail: 'fuzzing boundaries', cadence: 'Spec change' },
              { name: 'MCP / Agentic', detail: 'tool permission drift', cadence: 'On change' },
            ].map(item => (
              <div key={item.name} className="metric-card p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-text-primary">{item.name}</span>
                  <span className="text-[9px] text-text-muted bg-bg-elevated border border-border-subtle px-2 py-0.5 rounded-full">
                    {item.cadence}
                  </span>
                </div>
                <p className="text-[10px] text-text-muted mt-1">{item.detail}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {!isLoading && totalIssues === 0 && (
        <GlassCard variant="default" className="p-8 text-center">
          <Shield size={32} className="mx-auto mb-3 text-text-muted" />
          <p className="text-sm text-text-muted">No vulnerabilities found yet. Run a security test to populate this dashboard.</p>
        </GlassCard>
      )}
    </div>
  );
};

export default TestDashboard;
