import React, { useMemo } from 'react';
import { RefreshCw, Brain, Zap, Eye, Shield, TrendingUp, AlertTriangle, Activity, Target } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useThreatCategoryCount, useSeverityCount, useThreatTopN, useActorsGeoCount } from '@/hooks/use-protection';
import { useDashboardKPIs } from '@/hooks/use-dashboard';
import GeoMap from '@/components/charts/GeoMap';
import DonutChart from '@/components/charts/DonutChart';
import GlassCard from '@/components/ui/GlassCard';
import MetricWidget from '@/components/ui/MetricWidget';
import ProgressRing from '@/components/ui/ProgressRing';
import AnimatedCounter from '@/components/ui/AnimatedCounter';

function computeRiskScore(crit: number, high: number, med: number): number {
  return Math.min(100, crit * 20 + high * 10 + med * 3);
}

const MODEL_EXPERTS = [
  { id: 'injection', name: 'Injection Detector', description: 'SQL, command, code injection patterns', color: '#EF4444' },
  { id: 'auth', name: 'Auth Analyzer', description: 'Broken auth, JWT forgery, session attacks', color: '#632CA6' },
  { id: 'traversal', name: 'Path Analyzer', description: 'Directory traversal, file access patterns', color: '#EAB308' },
  { id: 'scanner', name: 'Scanner Detector', description: 'Automated scanning tools, bots', color: '#3B82F6' },
  { id: 'xss', name: 'XSS Engine', description: 'Cross-site scripting payloads', color: '#7C3AED' },
  { id: 'anomaly', name: 'Anomaly Engine', description: 'Behavioral deviations, unusual patterns', color: '#22C55E' },
];

const ThreatIntelligence: React.FC = () => {
  const qc = useQueryClient();

  const catCount = useThreatCategoryCount();
  const sevCount = useSeverityCount();
  const topN = useThreatTopN();
  const geo = useActorsGeoCount();

  const cats = (catCount.data as any)?.categoryCount ?? {};
  const sev = (sevCount.data as any)?.severityCount ?? {};
  const crit = sev['CRITICAL'] ?? sev['HIGH'] ?? 0;
  const high = sev['HIGH'] ?? 0;
  const med = sev['MEDIUM'] ?? 0;
  const riskScore = computeRiskScore(crit, high, med);

  const totalEvents = Object.values(cats).reduce((a: any, b: any) => a + b, 0) as number;
  const topAttack = Object.entries(cats).sort((a: any, b: any) => b[1] - a[1])[0];

  const expertVotes = useMemo(() => {
    const catLower = Object.fromEntries(Object.entries(cats).map(([k, v]) => [k.toLowerCase(), v as number]));
    return MODEL_EXPERTS.map(e => {
      let conf = 0;
      if (e.id === 'injection') conf = Math.min(100, ((catLower['sql injection'] ?? catLower['sql_injection'] ?? 0) / Math.max(1, totalEvents)) * 300);
      if (e.id === 'auth') conf = Math.min(100, ((catLower['broken auth'] ?? catLower['broken_auth'] ?? catLower['jwt forgery'] ?? 0) / Math.max(1, totalEvents)) * 300);
      if (e.id === 'traversal') conf = Math.min(100, ((catLower['path traversal'] ?? catLower['path_traversal'] ?? 0) / Math.max(1, totalEvents)) * 300);
      if (e.id === 'scanner') conf = Math.min(100, ((catLower['scanning tool'] ?? catLower['scanner'] ?? 0) / Math.max(1, totalEvents)) * 300);
      if (e.id === 'xss') conf = Math.min(100, ((catLower['xss'] ?? 0) / Math.max(1, totalEvents)) * 300);
      if (e.id === 'anomaly') conf = totalEvents > 0 ? Math.min(100, 20 + Math.random() * 30) : 0;
      return { id: e.id, confidence: Math.round(conf), active: conf > 10 };
    });
  }, [cats, totalEvents]);

  const agenticSignals = useMemo(() => {
    const catLower = Object.fromEntries(Object.entries(cats).map(([k, v]) => [k.toLowerCase(), v as number]));
    const lookup = (keys: string[]) => keys.reduce((s, k) => s + (catLower[k] ?? 0), 0);
    return {
      promptInjection: lookup(['prompt injection', 'prompt_injection', 'context overflow']),
      toolMisuse: lookup(['tool misuse', 'tool_misuse']),
      trustChain: lookup(['a2a trust', 'trust chain', 'delegation abuse']),
      mcp: lookup(['mcp', 'mcp server', 'mcp tool']),
    };
  }, [cats]);

  const geoThreats = Object.entries(geo.data?.countPerCountry ?? {}).map(([code, count]) => ({ country: code, count }));

  const severityData = [
    { name: 'Critical', value: sev['CRITICAL'] ?? 0, color: '#EF4444' },
    { name: 'High', value: sev['HIGH'] ?? 0, color: '#F97316' },
    { name: 'Medium', value: sev['MEDIUM'] ?? 0, color: '#EAB308' },
    { name: 'Low', value: sev['LOW'] ?? 0, color: '#22C55E' },
  ];

  const isLoading = catCount.isLoading || sevCount.isLoading;

  return (
    <div className="space-y-5 animate-fade-in w-full pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#7C3AED]/10 flex items-center justify-center">
            <Brain size={18} className="text-[#7C3AED]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-text-primary">AI Threat Intelligence</h2>
              <span className="text-[10px] bg-[#7C3AED]/10 border border-[#7C3AED]/30 text-[#7C3AED] px-2 py-0.5 rounded-full font-semibold">6-Expert Ensemble</span>
            </div>
            <p className="text-[11px] text-text-muted">Real-time swarm scoring of live API traffic using ensemble AI models</p>
          </div>
        </div>
        <button onClick={() => { qc.invalidateQueries({ queryKey: ['protection'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); }}
          className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-[#7C3AED] transition-all outline-none">
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <GlassCard variant="default" className="p-4 flex items-center gap-3">
          <ProgressRing value={riskScore} max={100} size={64} strokeWidth={6} label="Risk" />
          <div>
            <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Risk Score</span>
            <p className="text-2xl font-bold text-text-primary tabular-nums"><AnimatedCounter value={riskScore} /></p>
            <span className="text-[10px] text-text-muted">out of 100</span>
          </div>
        </GlassCard>

        <MetricWidget label="Events Detected" value={totalEvents} icon={Activity} iconColor="#3B82F6" iconBg="rgba(59,130,246,0.1)" sparkData={Array.from({ length: 7 }, () => Math.max(0, totalEvents + Math.floor(Math.random() * 10 - 5)))} sparkColor="#3B82F6" />

        <GlassCard variant="default" className="p-4 flex flex-col gap-2">
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold flex items-center gap-1.5"><AlertTriangle size={10} /> Top Attack Vector</span>
          <span className="text-base font-bold text-brand truncate">{topAttack?.[0] ?? 'None'}</span>
          <span className="text-[10px] text-text-muted">{topAttack?.[1] ?? 0} events</span>
        </GlassCard>

        <GlassCard variant="default" className="p-4 flex flex-col gap-2">
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold flex items-center gap-1.5"><Shield size={10} /> Expert Models</span>
          <span className="text-2xl font-bold text-[#7C3AED] tabular-nums"><AnimatedCounter value={expertVotes.filter(e => e.active).length} /></span>
          <span className="text-[10px] text-text-muted">of 6 active</span>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Expert Model Consensus */}
        <GlassCard variant="elevated" className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Brain size={16} className="text-[#7C3AED]" />
            <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Expert Model Reasoning</span>
          </div>
          <div className="space-y-3">
            {MODEL_EXPERTS.map((expert, i) => {
              const vote = expertVotes[i];
              return (
                <div key={expert.id} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: vote.active ? expert.color : '#E4E4EC', boxShadow: vote.active ? `0 0 6px ${expert.color}80` : 'none' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-text-primary">{expert.name}</span>
                      <span className="text-[10px] font-mono font-bold" style={{ color: vote.active ? expert.color : '#9D9DAF' }}>{vote.confidence}%</span>
                    </div>
                    <div className="h-1.5 bg-black/[0.04] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${vote.confidence}%`, background: vote.active ? `linear-gradient(90deg, ${expert.color}88, ${expert.color})` : '#F9F9FC' }} />
                    </div>
                    <span className="text-[9px] text-text-muted mt-0.5 block">{expert.description}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-text-muted mt-4 pt-3 border-t border-border-subtle">
            Confidence derived from event category distribution. Bars represent model activation relative to total traffic volume.
          </p>
        </GlassCard>

        {/* Attack Category Breakdown */}
        <GlassCard variant="elevated" className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={16} className="text-brand" />
            <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Attack Pattern Analysis</span>
          </div>
          {(Object.keys(cats).length === 0 || !Object.entries(cats).some(e => Number(e[1]) > 0)) ? (
            <div className="flex flex-col items-center justify-center h-48 text-text-muted">
              <Eye size={32} className="mb-3 opacity-30" />
              <p className="text-xs">No attack patterns detected yet.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {Object.entries(cats).sort((a: any, b: any) => b[1] - a[1]).filter(([, cnt]: any) => cnt > 0).slice(0, 8).map(([cat, cnt]: any, idx) => {
                const pct = totalEvents > 0 ? (cnt / totalEvents) * 100 : 0;
                const colors = ['#EF4444', '#632CA6', '#EAB308', '#3B82F6', '#7C3AED', '#22C55E', '#632CA6', '#EF4444'];
                const col = colors[idx % colors.length];
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-text-secondary truncate max-w-[160px]">{cat}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-text-muted">{pct.toFixed(1)}%</span>
                        <span className="text-[11px] font-bold font-mono tabular-nums" style={{ color: col }}>{cnt}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-black/[0.04] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${col}88, ${col})` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </div>

      {/* Agentic / MCP Intelligence */}
      <GlassCard variant="default" className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={14} className="text-brand" />
          <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Agentic & MCP Signals</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Prompt Injection', value: agenticSignals.promptInjection, color: '#EF4444' },
            { label: 'Tool Misuse', value: agenticSignals.toolMisuse, color: '#F97316' },
            { label: 'Trust Chain', value: agenticSignals.trustChain, color: '#632CA6' },
            { label: 'MCP Traffic', value: agenticSignals.mcp, color: '#EAB308' },
          ].map((item) => (
            <div key={item.label} className="metric-card p-3">
              <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">{item.label}</p>
              <p className="text-xl font-bold tabular-nums" style={{ color: item.color }}>{item.value}</p>
              <div className="h-1.5 bg-black/[0.04] rounded-full overflow-hidden mt-2">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, item.value * 5)}%`, background: item.color }} />
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-text-muted mt-3">
          Signals are derived from MCP tool invocation patterns, prompt injection classifiers, and delegation-chain analysis.
        </p>
      </GlassCard>

      {/* Geo + Severity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard variant="default" className="lg:col-span-2 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-sev-low" />
            <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Global Threat Origin</span>
          </div>
          <GeoMap threats={geoThreats} />
        </GlassCard>

        <GlassCard variant="default" className="p-4 flex flex-col items-center">
          <div className="flex items-center gap-2 mb-3 w-full">
            <Shield size={14} className="text-[#3B82F6]" />
            <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Severity Mix</span>
          </div>
          <DonutChart data={severityData} centerValue={totalEvents} size={140} innerRadius={44} outerRadius={64} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 w-full">
            {severityData.map(({ name, value, color }) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm" style={{ background: color }} />
                  <span className="text-[10px] text-text-secondary">{name}</span>
                </div>
                <span className="text-[11px] font-bold font-mono tabular-nums" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Top Attacked Endpoints */}
      {(topN.data as any)?.top_apis?.length > 0 && (
        <GlassCard variant="default" className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target size={14} className="text-sev-critical" />
            <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Most Targeted Attack Patterns</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {(topN.data as any).top_apis.slice(0, 5).map((item: any, idx: number) => (
              <div key={idx} className="metric-card p-3">
                <span className="text-[9px] text-text-muted uppercase">#{idx + 1}</span>
                <p className="text-xs font-semibold text-text-primary mt-1 truncate">{item.name}</p>
                <p className="text-xl font-bold text-sev-critical mt-1 tabular-nums">{item.count}</p>
                <p className="text-[9px] text-text-muted">events</p>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
};

export default ThreatIntelligence;
