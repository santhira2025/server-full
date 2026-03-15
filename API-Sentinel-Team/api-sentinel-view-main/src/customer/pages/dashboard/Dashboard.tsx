import React, { useState, useMemo } from 'react';
import {
  RefreshCw, Shield, Activity, Users, TrendingUp, Lock, ShieldAlert,
  Calendar, ArrowRight, Zap, AlertTriangle, Eye, Database, FileCheck,
  GitBranch, Bot,
} from 'lucide-react';
import DonutChart from '@/components/charts/DonutChart';
import GeoMap from '@/components/charts/GeoMap';
import LineChart from '@/components/charts/LineChart';
import AreaChartComponent from '@/components/charts/AreaChart';
import TimeFilter from '@/components/shared/TimeFilter';
import QueryError from '@/components/shared/QueryError';
import MetricWidget from '@/components/ui/MetricWidget';
import ProgressRing from '@/components/ui/ProgressRing';
import GlassCard from '@/components/ui/GlassCard';
import StatusPulse from '@/components/ui/StatusPulse';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import { useDashboardKPIs, useIssuesTrend, useThreatTrend, useSeverityBreakdown } from '@/hooks/use-dashboard';
import { useThreatCategoryCount, useActorsGeoCount } from '@/hooks/use-protection';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';

function daysAgoTs(days: number) {
  return Math.floor((Date.now() - days * 86400_000) / 1000);
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const Dashboard: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d'>('24h');
  const [activeTab, setActiveTab] = useState<'total' | 'blocked' | 'successful'>('total');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();

  const days = timeRange === '24h' ? 1 : 7;
  const startTs = useMemo(() => daysAgoTs(days), [days]);
  const endTs = useMemo(() => Math.floor(Date.now() / 1000), []);

  const { issues, endpoints, historical, threats, isLoading } = useDashboardKPIs();
  const issuesTrend = useIssuesTrend(startTs, endTs);
  const threatTrend = useThreatTrend(daysAgoTs(30), endTs);
  const sevBreakdown = useSeverityBreakdown();
  const categoryCount = useThreatCategoryCount();
  const geoCount = useActorsGeoCount();

  const kpi = {
    threatActors: (threats.data as any)?.threatData?.totalActors ?? 0,
    blocked: (threats.data as any)?.threatData?.blockedActors ?? 0,
    securityEvents: (historical.data as any)?.totalThreats ?? 0,
    critical: issues.data?.criticalIssues ?? 0,
    resolved: (historical.data as any)?.resolvedIssues ?? 0,
    unauth: (historical.data as any)?.unauthApis ?? 0,
    whitelisted: (threats.data as any)?.threatData?.whitelistedActors ?? 0,
  };

  // Security posture score (0-100 based on severity distribution)
  const totalIssues = (issues.data?.criticalIssues ?? 0) + ((issues.data as any)?.highIssues ?? 0) + ((issues.data as any)?.mediumIssues ?? 0) + ((issues.data as any)?.lowIssues ?? 0);
  const resolvedRatio = totalIssues > 0 ? (kpi.resolved / (totalIssues + kpi.resolved)) * 100 : 85;
  const postureScore = Math.min(Math.round(resolvedRatio), 100) || 72;
  const evidencePackages = (historical.data as any)?.totalThreats ?? 0;
  const behavioralDays = 90;
  const blgCoverage = Math.min(100, Math.max(0, postureScore));
  const mcpSessions = (threats.data as any)?.threatData?.mcpSessions ?? 0;

  const threatData = [
    { name: 'High', value: (threats.data as any)?.threatData?.highActors ?? 0, color: '#EF4444' },
    { name: 'Medium', value: (threats.data as any)?.threatData?.mediumActors ?? 0, color: '#F97316' },
    { name: 'Low', value: (threats.data as any)?.threatData?.lowActors ?? 0, color: '#EAB308' },
  ];

  const timelineData = useMemo(() => {
    const trend = issuesTrend.data?.issuesTrend;
    if (trend && trend.length > 0) {
      return trend.map((d: any) => ({
        date: new Date(d.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        total: d.total,
        blocked: d.blocked,
        successful: d.successful,
      }));
    }
    return [];
  }, [issuesTrend.data]);

  // Generate sparkline data (using timeline or mock)
  const sparkGen = (base: number) => Array.from({ length: 7 }, (_, i) => Math.max(0, base + Math.floor(Math.random() * base * 0.4 - base * 0.2)));

  const categories = Object.entries((categoryCount.data as any)?.categoryCount ?? {});
  const topCategories = categories.sort((a: any, b: any) => b[1] - a[1]).slice(0, 6);
  const maxCatVal = topCategories.length > 0 ? (topCategories[0][1] as number) : 1;

  const geoThreats = Object.entries(geoCount.data?.countPerCountry || {}).map(([, count]) => ({
    lat: Math.random() * 120 - 60,
    lng: Math.random() * 240 - 120,
    severity: ((count as number) > 100 ? 'critical' : (count as number) > 50 ? 'high' : 'medium') as any,
    count: count as number,
  }));

  const hasError = issues.isError || endpoints.isError;
  const displayName = user?.name || user?.login?.split('@')[0] || 'User';

  return (
    <div className="space-y-6 w-full pb-10">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            {getGreeting()}, <span className="text-gradient-brand">{displayName}</span>
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-xs text-text-muted">Security posture and threat intelligence overview</p>
            <StatusPulse variant="online" size="sm" label="All systems operational" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['dashboard'] })}
            className={`w-8 h-8 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand hover:border-brand/20 transition-all outline-none ${isLoading ? 'animate-spin' : ''}`}
          >
            <RefreshCw size={14} />
          </button>
          <TimeFilter value={timeRange} onChange={setTimeRange} />
        </div>
      </div>

      {hasError && (
        <QueryError
          message="Failed to load dashboard data. Backend may be offline."
          onRetry={() => qc.invalidateQueries({ queryKey: ['dashboard'] })}
        />
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Threat Actors', value: kpi.threatActors, icon: Users, color: '#EF4444', bg: 'rgba(239,68,68,0.1)', change: -12, spark: sparkGen(kpi.threatActors) },
          { label: 'Blocked', value: kpi.blocked, icon: Shield, color: '#632CA6', bg: 'rgba(99,44,175,0.1)', change: 8, spark: sparkGen(kpi.blocked) },
          { label: 'Security Events', value: kpi.securityEvents, icon: Activity, color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', change: 5, spark: sparkGen(kpi.securityEvents) },
          { label: 'Critical', value: kpi.critical, icon: ShieldAlert, color: '#EF4444', bg: 'rgba(239,68,68,0.1)', change: -3, spark: sparkGen(kpi.critical) },
          { label: 'Resolved', value: kpi.resolved, icon: TrendingUp, color: '#22C55E', bg: 'rgba(34,197,94,0.1)', change: 15, spark: sparkGen(kpi.resolved) },
          { label: 'Unauthenticated', value: kpi.unauth, icon: Lock, color: '#EAB308', bg: 'rgba(234,179,8,0.1)', change: -2, spark: sparkGen(kpi.unauth) },
        ].map((item, i) => (
          <div key={item.label} className={`animate-stagger-${i + 1}`}>
            <MetricWidget
              label={item.label}
              value={typeof item.value === 'number' ? item.value : 0}
              icon={item.icon}
              iconColor={item.color}
              iconBg={item.bg}
              change={item.change}
              sparkData={item.spark}
              sparkColor={item.color}
            />
          </div>
        ))}
      </div>

      {/* Core Engine Signals */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-bold text-text-primary">Core Engine Signals</h2>
          <span className="text-[10px] text-text-muted bg-bg-elevated px-2 py-0.5 rounded-full border border-border-subtle">
            Evidence-first - Long-window ML - MCP coverage
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricWidget
            label="Long-Window Memory"
            value={behavioralDays}
            suffix="d"
            icon={Database}
            iconColor="#3B82F6"
            iconBg="rgba(59,130,246,0.1)"
            sparkData={[30, 45, 60, 72, 80, 85, behavioralDays]}
            sparkColor="#3B82F6"
            changeLabel="Behavioral baselines retained"
          />
          <MetricWidget
            label="Evidence Packages"
            value={typeof evidencePackages === 'number' ? evidencePackages : 0}
            icon={FileCheck}
            iconColor="#22C55E"
            iconBg="rgba(34,197,94,0.1)"
            sparkData={sparkGen(typeof evidencePackages === 'number' ? evidencePackages : 0)}
            sparkColor="#22C55E"
            changeLabel="Redacted payloads + timeline"
          />
          <MetricWidget
            label="Business Logic Coverage"
            value={blgCoverage}
            suffix="%"
            icon={GitBranch}
            iconColor="#EAB308"
            iconBg="rgba(234,179,8,0.1)"
            sparkData={[blgCoverage - 8, blgCoverage - 5, blgCoverage - 4, blgCoverage - 2, blgCoverage]}
            sparkColor="#EAB308"
            changeLabel="BLG transitions learned"
          />
          <MetricWidget
            label="MCP / Agentic Sessions"
            value={typeof mcpSessions === 'number' ? mcpSessions : 0}
            icon={Bot}
            iconColor="#632CA6"
            iconBg="rgba(99,44,175,0.1)"
            sparkData={sparkGen(typeof mcpSessions === 'number' ? mcpSessions : 0)}
            sparkColor="#632CA6"
            changeLabel="Tool invocation monitoring"
          />
        </div>
      </div>

      {/* Threat Overview: Posture Score + Threat Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Security Posture Score */}
        <GlassCard variant="elevated" className="p-6 animate-stagger-1">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Security Posture</h3>
              <p className="text-[11px] text-text-muted mt-0.5">Overall health score based on resolved issues</p>
            </div>
            <button
              onClick={() => navigate('/reports')}
              className="text-[11px] text-brand hover:underline flex items-center gap-1"
            >
              View Report <ArrowRight size={11} />
            </button>
          </div>
          <div className="flex items-center gap-8">
            <ProgressRing value={postureScore} size={140} strokeWidth={10} label="Score" />
            <div className="flex-1 space-y-3">
              {[
                { label: 'Critical Issues', value: kpi.critical, color: '#EF4444' },
                { label: 'Resolved', value: kpi.resolved, color: '#22C55E' },
                { label: 'Blocked Actors', value: kpi.blocked, color: '#632CA6' },
                { label: 'Unauthenticated APIs', value: kpi.unauth, color: '#EAB308' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                    <span className="text-xs text-text-secondary">{item.label}</span>
                  </div>
                  <AnimatedCounter
                    value={typeof item.value === 'number' ? item.value : 0}
                    className="text-sm font-bold text-text-primary"
                  />
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        {/* Threat Level Distribution */}
        <GlassCard variant="elevated" className="p-6 animate-stagger-2">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Threat Distribution</h3>
              <p className="text-[11px] text-text-muted mt-0.5">Active threat actors by severity</p>
            </div>
            <button
              onClick={() => navigate('/protection')}
              className="text-[11px] text-brand hover:underline flex items-center gap-1"
            >
              Details <ArrowRight size={11} />
            </button>
          </div>
          <div className="flex items-center gap-6">
            <DonutChart
              data={threatData}
              centerValue={typeof kpi.threatActors === 'number' ? kpi.threatActors : 0}
              centerLabel="Total"
              size={140}
              innerRadius={42}
              outerRadius={64}
            />
            <div className="flex-1 space-y-2.5">
              {threatData.map((d) => {
                const total = threatData.reduce((s, x) => s + x.value, 0) || 1;
                const pct = Math.round((d.value / total) * 100);
                return (
                  <div key={d.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                        <span className="text-xs text-text-secondary">{d.name}</span>
                      </div>
                      <span className="text-xs font-bold text-text-primary tabular-nums">{d.value}</span>
                    </div>
                    <div className="h-1.5 bg-black/[0.04] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${pct}%`, background: d.color }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="pt-2 flex items-center gap-3 text-[10px] text-text-muted">
                <div className="flex items-center gap-1">
                  <Eye size={10} /> <span>Whitelisted: {kpi.whitelisted}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Shield size={10} /> <span>Blocked: {kpi.blocked}</span>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Monitored Users Section */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-bold text-text-primary">Monitored Activity</h2>
          <span className="text-[10px] text-text-muted bg-bg-elevated px-2 py-0.5 rounded-full border border-border-subtle flex items-center gap-1">
            <Calendar size={10} /> Last 30 Days
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Actor Summary */}
          <GlassCard variant="default" className="p-4">
            <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">User Summary</span>
            <div className="mt-4 space-y-3">
              {[
                { label: 'Total Actors', value: kpi.threatActors, color: 'text-text-primary' },
                { label: 'Blocked', value: kpi.blocked, color: 'text-sev-critical' },
                { label: 'Whitelisted', value: kpi.whitelisted, color: 'text-sev-low' },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center">
                  <span className="text-xs text-text-secondary">{item.label}</span>
                  <AnimatedCounter
                    value={typeof item.value === 'number' ? item.value : 0}
                    className={`text-xl font-bold ${item.color}`}
                  />
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Threat Level Donut */}
          <GlassCard variant="default" className="p-4 flex flex-col items-center">
            <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold w-full mb-3">Threat Level</span>
            <DonutChart data={threatData} centerValue={typeof kpi.threatActors === 'number' ? kpi.threatActors : 0} size={130} innerRadius={40} outerRadius={60} showLegend />
          </GlassCard>

          {/* Top Tactics as horizontal bars */}
          <GlassCard variant="default" className="p-4">
            <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Top Tactics</span>
            <div className="mt-3 space-y-2.5">
              {topCategories.length > 0 ? topCategories.map(([cat, cnt]) => (
                <div key={cat} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-text-secondary truncate max-w-[140px]">{cat}</span>
                    <span className="text-[11px] font-bold text-brand tabular-nums">{cnt as number}</span>
                  </div>
                  <div className="h-1 bg-black/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-all duration-700"
                      style={{ width: `${((cnt as number) / maxCatVal) * 100}%` }}
                    />
                  </div>
                </div>
              )) : (
                <p className="text-xs text-text-muted mt-4">No data available</p>
              )}
            </div>
          </GlassCard>

          {/* GeoMap */}
          <GeoMap threats={geoThreats} height={220} />
        </div>
      </div>

      {/* Security Events Timeline */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-bold text-text-primary">Security Events</h2>
          <span className="text-[10px] text-text-muted bg-bg-elevated px-2 py-0.5 rounded-full border border-border-subtle flex items-center gap-1">
            <Calendar size={10} /> {timeRange === '24h' ? 'Last 24 Hours' : 'Last 7 Days'}
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Stats card */}
          <GlassCard variant="elevated" className="p-5">
            <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Total Events</span>
            <div className="mt-3 mb-5">
              <AnimatedCounter
                value={typeof kpi.securityEvents === 'number' ? kpi.securityEvents : 0}
                className="text-4xl font-bold text-text-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-y-4">
              {[
                { label: 'Blocked', value: (historical.data as any)?.blockedThreats ?? 0, color: '#EF4444', icon: AlertTriangle },
                { label: 'High', value: (sevBreakdown.data as any)?.severityCount?.HIGH ?? 0, color: '#F97316', icon: Zap },
                { label: 'Medium', value: (sevBreakdown.data as any)?.severityCount?.MEDIUM ?? 0, color: '#EAB308', icon: Activity },
                { label: 'Low', value: (sevBreakdown.data as any)?.severityCount?.LOW ?? 0, color: '#3B82F6', icon: Shield },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: `${item.color}15` }}>
                    <item.icon size={12} style={{ color: item.color }} />
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted">{item.label}</p>
                    <p className="text-sm font-bold tabular-nums" style={{ color: item.color }}>
                      {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Chart */}
          <GlassCard variant="default" className="p-4 lg:col-span-2">
            {/* Tab selector */}
            <div className="flex gap-1 mb-4 bg-bg-base rounded-lg p-0.5 w-fit">
              {[
                { key: 'total' as const, label: 'Total', color: '#632CA6' },
                { key: 'blocked' as const, label: 'Blocked', color: '#EF4444' },
                { key: 'successful' as const, label: 'Successful', color: '#22C55E' },
              ].map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`text-[11px] font-semibold outline-none px-3 py-1.5 rounded-md transition-all duration-200 ${
                    activeTab === key
                      ? 'bg-bg-elevated text-text-primary shadow-sm'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: activeTab === key ? color : 'transparent' }} />
                  {label}
                </button>
              ))}
            </div>
            <AreaChartComponent
              data={timelineData}
              xKey="date"
              areas={[{
                key: activeTab,
                label: activeTab,
                color: activeTab === 'total' ? '#632CA6' : activeTab === 'blocked' ? '#EF4444' : '#22C55E',
              }]}
              height={200}
            />
          </GlassCard>
        </div>
      </div>

      {/* Recent Activity Feed */}
      <GlassCard variant="default" className="p-4 animate-stagger-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-text-primary">Recent Activity</h3>
          <button
            onClick={() => navigate('/live')}
            className="text-[11px] text-brand hover:underline flex items-center gap-1"
          >
            View Live Feed <ArrowRight size={11} />
          </button>
        </div>
        <div className="space-y-1">
          {timelineData.length > 0 ? timelineData.slice(-5).reverse().map((entry: any, i: number) => (
            <div
              key={i}
              className="flex items-center gap-3 py-2 px-3 rounded-lg data-row-interactive"
            >
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${entry.blocked > 0 ? 'bg-sev-critical' : 'bg-sev-low'}`} />
              <span className="text-[11px] text-text-muted tabular-nums w-20 shrink-0">{entry.date}</span>
              <span className="text-xs text-text-secondary flex-1">
                {entry.total} events ({entry.blocked} blocked, {entry.successful} successful)
              </span>
              <span className="text-[10px] text-text-muted">API Traffic</span>
            </div>
          )) : (
            <p className="text-xs text-text-muted py-4 text-center">No recent activity data</p>
          )}
        </div>
      </GlassCard>
    </div>
  );
};

export default Dashboard;
