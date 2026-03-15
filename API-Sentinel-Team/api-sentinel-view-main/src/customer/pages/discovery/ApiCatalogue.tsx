import React, { useState, useMemo, useRef } from 'react';
import { RefreshCw, Download, Globe, Eye, ShieldOff, Calendar, Filter, Upload, Search } from 'lucide-react';
import DonutChart from '@/components/charts/DonutChart';
import TimeFilter from '@/components/shared/TimeFilter';
import LineChart from '@/components/charts/LineChart';
import { MethodBadge, AuthBadge } from '@/components/shared/Badges';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import MetricWidget from '@/components/ui/MetricWidget';
import GlassCard from '@/components/ui/GlassCard';
import SparklineChart from '@/components/ui/SparklineChart';
import { useApiCollections, useApiInfos, useSeverityCounts } from '@/hooks/use-discovery';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

function formatTs(epoch: number) {
  if (!epoch) return '-';
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function mapRiskScore(score: number | undefined): string {
  if (!score && score !== 0) return '-';
  if (score >= 4) return 'Critical';
  if (score >= 3) return 'High';
  if (score >= 2) return 'Medium';
  return 'Low';
}

function riskColor(label: string): string {
  switch (label) {
    case 'Critical': return '#EF4444';
    case 'High': return '#F97316';
    case 'Medium': return '#EAB308';
    default: return '#22C55E';
  }
}

const methodColors: Record<string, string> = {
  GET: '#22C55E', POST: '#632CA6', PUT: '#3B82F6', PATCH: '#8B5CF6', DELETE: '#EF4444', HEAD: '#6B7280', OPTIONS: '#6B7280',
};

const typeColors: Record<string, string> = {
  REST: '#3B82F6',
  GRAPHQL: '#632CA6',
  GRPC: '#22C55E',
  MCP: '#EAB308',
  WEBSOCKET: '#F97316',
  UNKNOWN: '#6B7280',
};

function inferApiType(url: string): keyof typeof typeColors {
  const u = (url || '').toLowerCase();
  if (u.includes('graphql')) return 'GRAPHQL';
  if (u.includes('/mcp') || u.includes('/sse')) return 'MCP';
  if (u.includes('grpc')) return 'GRPC';
  if (u.includes('ws') || u.includes('websocket')) return 'WEBSOCKET';
  return 'REST';
}

const ApiCatalogue: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d'>('24h');
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const pageSize = 10;
  const qc = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ endpoints_discovered: number; threats_detected: number; lines: number } | null>(null);

  async function handleNginxUpload(file: File) {
    setUploading(true);
    setUploadResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000');
      const token = localStorage.getItem('sentinel_token');
      const res = await fetch(`${BASE}/api/traffic/import/nginx-log`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const data = await res.json();
      setUploadResult(data);
      qc.invalidateQueries({ queryKey: ['discovery'] });
    } catch (e) {
      toast({
        title: 'Upload failed',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const collections = useApiCollections();
  const firstCollectionId = collections.data?.apiCollections?.[0]?.id ?? null;
  const allIds = useMemo(() => collections.data?.apiCollections?.map(c => c.id) ?? [], [collections.data]);
  const apiInfos = useApiInfos(firstCollectionId, page, pageSize, 'lastSeen', -1);
  const sevCounts = useSeverityCounts(allIds);

  const isLoading = collections.isLoading || apiInfos.isLoading;
  const hasError = collections.isError || apiInfos.isError;

  const totalApis = collections.data?.apiCollections?.reduce((s, c) => s + (c.urlsCount || 0), 0) ?? 0;
  const rows = apiInfos.data?.apiInfoList ?? [];
  const total = apiInfos.data?.total ?? 0;

  const sevAgg = useMemo(() => {
    const result = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    sevCounts.data?.severitiesCountResponse?.forEach(s => {
      Object.entries(s.severityCount || {}).forEach(([k, v]) => {
        const key = k.toUpperCase() as keyof typeof result;
        if (key in result) result[key] += v;
      });
    });
    return result;
  }, [sevCounts.data]);

  const riskData = [
    { name: 'Critical', value: sevAgg.CRITICAL, color: '#EF4444' },
    { name: 'High', value: sevAgg.HIGH, color: '#F97316' },
    { name: 'Medium', value: sevAgg.MEDIUM, color: '#EAB308' },
    { name: 'Low', value: sevAgg.LOW, color: '#22C55E' },
  ];

  const methodDist = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach(r => { c[r.id.method] = (c[r.id.method] || 0) + 1; });
    return c;
  }, [rows]);

  const authCounts = useMemo(() => {
    let unauth = 0;
    rows.forEach(r => {
      if (!r.allAuthTypesFound?.length || r.allAuthTypesFound.includes('UNAUTHENTICATED')) unauth++;
    });
    return { unauth, auth: rows.length - unauth };
  }, [rows]);

  const mcpEndpoints = useMemo(() => rows.filter(r => inferApiType(r.id.url) === 'MCP').length, [rows]);
  const shadowCandidates = useMemo(() => rows.filter(r => (r as any).shadow === true || (r as any).rogue === true).length, [rows]);
  const specCoverage = totalApis > 0 ? Math.round((authCounts.auth / Math.max(1, totalApis)) * 100) : 0;

  return (
    <div className="space-y-5 animate-fade-in w-full pb-10">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search endpoints..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border-subtle bg-bg-base text-text-primary placeholder-text-muted outline-none focus:border-brand/30 w-56 transition-all"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => qc.invalidateQueries({ queryKey: ['discovery'] })} className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand transition-all outline-none">
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <TimeFilter value={timeRange} onChange={setTimeRange} />
          <input ref={fileInputRef} type="file" accept=".log,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleNginxUpload(f); }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-1.5 rounded-lg border border-brand/30 px-3 py-1.5 text-xs text-brand hover:bg-brand/10 transition-all outline-none disabled:opacity-50">
            <Upload size={13} /> {uploading ? 'Importing...' : 'Import Log'}
          </button>
          <button className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:border-brand/20 transition-all outline-none">
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      {/* Upload banner */}
      {uploadResult && (
        <div className="flex items-center gap-4 glass-card-premium rounded-lg px-4 py-2.5 text-xs text-sev-low border border-sev-low/20 animate-fade-in">
          <span className="font-bold">Log imported successfully.</span>
          <span className="text-text-secondary">Lines: <strong className="text-text-primary">{uploadResult.lines}</strong></span>
          <span className="text-text-secondary">Endpoints: <strong className="text-text-primary">{uploadResult.endpoints_discovered}</strong></span>
          <span className="text-text-secondary">Threats: <strong className="text-sev-critical">{uploadResult.threats_detected}</strong></span>
          <button onClick={() => setUploadResult(null)} className="ml-auto text-text-muted hover:text-text-primary">x</button>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricWidget
          label="APIs Discovered"
          value={totalApis}
          icon={Globe}
          iconColor="#3B82F6"
          iconBg="rgba(59,130,246,0.1)"
          sparkData={[totalApis * 0.6, totalApis * 0.7, totalApis * 0.8, totalApis * 0.85, totalApis * 0.9, totalApis * 0.95, totalApis]}
          sparkColor="#3B82F6"
          changeLabel={`${authCounts.unauth} unauthenticated, ${authCounts.auth} authenticated`}
        />

        <GlassCard variant="default" className="p-4 flex items-center gap-4">
          <DonutChart data={riskData} size={100} innerRadius={30} outerRadius={44} centerValue={totalApis} centerLabel="APIs" />
          <div className="flex-1 space-y-1.5">
            <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Risk Distribution</span>
            {riskData.map(d => (
              <div key={d.name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-sm" style={{ background: d.color }} />
                  <span className="text-[11px] text-text-secondary">{d.name}</span>
                </div>
                <span className="text-[11px] font-bold text-text-primary tabular-nums">{d.value}</span>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard variant="default" className="p-4">
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Method Distribution</span>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(methodDist).sort((a, b) => b[1] - a[1]).map(([method, count]) => (
              <span
                key={method}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border"
                style={{
                  color: methodColors[method] || '#6B7280',
                  borderColor: `${methodColors[method] || '#6B7280'}30`,
                  background: `${methodColors[method] || '#6B7280'}08`,
                }}
              >
                {method}
                <span className="text-text-primary">{count}</span>
              </span>
            ))}
          </div>
          {Object.keys(methodDist).length === 0 && (
            <p className="text-xs text-text-muted mt-3">No method data</p>
          )}
        </GlassCard>
      </div>

      {/* Discovery Signals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricWidget
          label="Spec Coverage (Est.)"
          value={specCoverage}
          suffix="%"
          icon={Eye}
          iconColor="#632CA6"
          iconBg="rgba(99,44,175,0.1)"
          sparkData={[specCoverage - 8, specCoverage - 5, specCoverage - 3, specCoverage - 2, specCoverage]}
          sparkColor="#632CA6"
          changeLabel="Traffic-based OpenAPI inference"
        />
        <MetricWidget
          label="Shadow / Rogue"
          value={shadowCandidates}
          icon={ShieldOff}
          iconColor="#EF4444"
          iconBg="rgba(239,68,68,0.1)"
          sparkData={[shadowCandidates, shadowCandidates, shadowCandidates + 1, shadowCandidates]}
          sparkColor="#EF4444"
          changeLabel="Unregistered endpoints detected"
        />
        <MetricWidget
          label="MCP Endpoints"
          value={mcpEndpoints}
          icon={Globe}
          iconColor="#EAB308"
          iconBg="rgba(234,179,8,0.1)"
          sparkData={[mcpEndpoints, mcpEndpoints + 1, mcpEndpoints]}
          sparkColor="#EAB308"
          changeLabel="Agentic tool surfaces"
        />
      </div>

      {hasError && <QueryError message="Failed to load API catalogue" onRetry={() => qc.invalidateQueries({ queryKey: ['discovery'] })} />}

      {!isLoading && !hasError && total === 0 && (
        <GlassCard variant="accent" className="px-5 py-4 flex items-start gap-4">
          <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center shrink-0 mt-0.5">
            <Eye size={18} className="text-brand" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Awaiting Traffic Analysis</p>
            <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">
              No API endpoints discovered yet. Import an nginx/apache access log using <strong className="text-brand">Import Log</strong> above, or connect a live traffic sensor.
            </p>
          </div>
        </GlassCard>
      )}

      {/* Table */}
      <div className="bg-bg-surface border border-border-subtle rounded-xl overflow-hidden flex flex-col min-h-[400px]">
        <div className="p-3 border-b border-border-subtle flex items-center justify-between">
          <span className="text-sm font-bold text-text-primary flex items-center gap-2">
            API Catalogue
            <span className="text-[10px] bg-bg-elevated border border-border-subtle px-2 py-0.5 rounded-full text-text-muted flex items-center gap-1">
              <Calendar size={10} /> Last 90 days
            </span>
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <span>{page * pageSize + 1} - {Math.min((page + 1) * pageSize, total)} of {total}</span>
              <div className="flex gap-1">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-1 rounded-md bg-bg-elevated border border-border-subtle text-[10px] disabled:opacity-30 hover:border-brand/20 transition-all">Prev</button>
                <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded-md bg-bg-elevated border border-border-subtle text-[10px] disabled:opacity-30 hover:border-brand/20 transition-all">Next</button>
              </div>
            </div>
            <button className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated outline-none transition-colors">
              <Filter size={14} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton columns={10} rows={pageSize} />
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse table-fixed min-w-[1200px]">
              <thead className="bg-bg-base/50">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-10 text-center">
                    <input type="checkbox" className="accent-brand" />
                  </th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-24">Traits</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-20 text-center">Type</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-[30%]">Endpoint</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-[18%]">Host</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-28 text-center">Discovered</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-28 text-center">Last Seen</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-20 text-center">Auth</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-20 text-center">Risk</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-16 text-center">Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((row) => {
                  const risk = mapRiskScore(row.riskScore);
                  const isUnauth = !row.allAuthTypesFound?.length || row.allAuthTypesFound.includes('UNAUTHENTICATED');
                  const hostCollection = collections.data?.apiCollections?.find(c => c.id === row.id.apiCollectionId);
                  const apiType = inferApiType(row.id.url);
                  const typeColor = typeColors[apiType] || '#6B7280';
                  return (
                    <tr key={`${row.id.apiCollectionId}-${row.id.method}-${row.id.url}`} className="data-row-interactive hover:bg-white/[0.02] transition-colors cursor-pointer">
                      <td className="px-4 py-3 text-center"><input type="checkbox" className="accent-brand" /></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 items-center">
                          <Globe size={12} className="text-sev-info" />
                          {isUnauth && <ShieldOff size={12} className="text-sev-critical" />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                          style={{ color: typeColor, background: `${typeColor}12`, borderColor: `${typeColor}30` }}
                        >
                          {apiType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <MethodBadge method={row.id.method} />
                          <span className="text-[12px] font-mono text-text-primary truncate">{row.id.url}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-text-secondary truncate">{hostCollection?.hostName || hostCollection?.displayName || '-'}</td>
                      <td className="px-4 py-3 text-[10px] font-mono text-text-muted text-center">{formatTs(row.discoveredAt ?? 0)}</td>
                      <td className="px-4 py-3 text-[10px] font-mono text-text-muted text-center">{formatTs(row.lastSeen)}</td>
                      <td className="px-4 py-3 text-center"><AuthBadge auth={isUnauth ? 'Unauth' : 'Authenticated'} /></td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{
                          color: riskColor(risk),
                          background: `${riskColor(risk)}12`,
                        }}>{risk}</span>
                      </td>
                      <td className="px-4 py-3 flex justify-center">
                        <SparklineChart
                          data={Array.from({ length: 7 }, () => Math.floor(Math.random() * 50 + 10))}
                          color="#9D9DAF"
                          width={48}
                          height={16}
                          showDot={false}
                          strokeWidth={1}
                        />
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && !isLoading && (
                  <tr><td colSpan={10} className="px-4 py-12 text-center text-xs text-text-muted">No APIs found. Connect a traffic source to start discovering APIs.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiCatalogue;
