import React, { useState } from 'react';
import { RefreshCw, Filter, Search, Key, Shield, AlertTriangle } from 'lucide-react';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import { MethodBadge } from '@/components/shared/Badges';
import MetricWidget from '@/components/ui/MetricWidget';
import { useSensitiveParameters } from '@/hooks/use-discovery';
import { useQueryClient } from '@tanstack/react-query';

const ParameterCatalogue: React.FC = () => {
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const pageSize = 20;
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useSensitiveParameters(page, pageSize);
  const params = data?.data?.endpoints ?? [];
  const total = data?.total ?? 0;

  const typeColors: Record<string, string> = {
    EMAIL: '#3B82F6', PHONE: '#8B5CF6', SSN: '#EF4444', CREDIT_CARD: '#EF4444',
    IP_ADDRESS: '#632CA6', PASSWORD: '#EF4444', TOKEN: '#EAB308', API_KEY: '#EAB308',
  };

  return (
    <div className="space-y-5 animate-fade-in w-full">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricWidget
          label="Sensitive Parameters"
          value={total}
          icon={Key}
          iconColor="#EAB308"
          iconBg="rgba(234,179,8,0.1)"
          sparkData={[total * 0.5, total * 0.6, total * 0.7, total * 0.8, total * 0.9, total]}
          sparkColor="#EAB308"
          compact
        />
        <MetricWidget
          label="Header Parameters"
          value={params.filter(p => p.isHeader).length}
          icon={Shield}
          iconColor="#3B82F6"
          iconBg="rgba(59,130,246,0.1)"
          compact
        />
        <MetricWidget
          label="Body Parameters"
          value={params.filter(p => !p.isHeader).length}
          icon={AlertTriangle}
          iconColor="#632CA6"
          iconBg="rgba(99,44,175,0.1)"
          compact
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search parameters..."
            className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border-subtle bg-bg-base text-text-primary placeholder-text-muted outline-none focus:border-brand/30 w-56 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => qc.invalidateQueries({ queryKey: ['discovery', 'sensitiveParams'] })} className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand transition-all outline-none">
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span>{total > 0 ? `${page * pageSize + 1}-${Math.min((page + 1) * pageSize, total)}` : '0'} of {total}</span>
            <div className="flex gap-1">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-1 rounded-md bg-bg-elevated border border-border-subtle text-[10px] disabled:opacity-30 hover:border-brand/20 transition-all">Prev</button>
              <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded-md bg-bg-elevated border border-border-subtle text-[10px] disabled:opacity-30 hover:border-brand/20 transition-all">Next</button>
            </div>
          </div>
          <button className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated outline-none transition-colors"><Filter size={14} /></button>
        </div>
      </div>

      {isError && <QueryError message="Failed to load sensitive parameters" onRetry={() => refetch()} />}

      {/* Table */}
      <div className="bg-bg-surface border border-border-subtle rounded-xl flex flex-col min-h-[500px] overflow-hidden">
        {isLoading ? <TableSkeleton columns={5} rows={pageSize} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-bg-base/50">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Parameter</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Data Type</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Endpoint</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Location</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Collection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {params.map((p, i) => (
                  <tr key={`${p.url}-${p.param}-${i}`} className="data-row-interactive hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-[13px] font-mono font-semibold text-brand bg-brand/8 px-2 py-0.5 rounded">
                        {p.param}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full border"
                        style={{
                          color: typeColors[p.subType?.toUpperCase()] || '#6B6B80',
                          borderColor: `${typeColors[p.subType?.toUpperCase()] || '#6B6B80'}30`,
                          background: `${typeColors[p.subType?.toUpperCase()] || '#6B6B80'}08`,
                        }}
                      >
                        {p.subType || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <MethodBadge method={p.method || 'GET'} />
                        <span className="text-[12px] font-mono text-text-primary truncate">{p.url}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.isHeader ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'}`}>
                        {p.isHeader ? 'Header' : 'Body'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted font-mono">{p.apiCollectionId}</td>
                  </tr>
                ))}
                {params.length === 0 && !isLoading && (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-xs text-text-muted">No sensitive parameters detected yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ParameterCatalogue;
