import React from 'react';
import { RefreshCw, Server } from 'lucide-react';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import StatusPulse from '@/components/ui/StatusPulse';
import { useModuleInfo } from '@/hooks/use-admin';
import { useQueryClient } from '@tanstack/react-query';

function formatTs(epoch: number) {
  if (!epoch) return '-';
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const ControllerHealth: React.FC = () => {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useModuleInfo();

  const modules = data?.moduleInfos ?? [];
  const controllers = modules.filter(m =>
    (m.moduleName || '').toLowerCase().includes('dashboard') ||
    (m.moduleName || '').toLowerCase().includes('controller') ||
    !m.moduleName
  );

  return (
    <div className="space-y-4 animate-fade-in w-full">
      {isError && <QueryError message="Failed to load controller health data" onRetry={() => refetch()} />}

      <div className="bg-bg-surface border border-border-subtle rounded-xl overflow-hidden flex flex-col min-h-[500px]">
        <div className="p-3 border-b border-border-subtle flex items-center justify-between">
          <span className="text-xs font-bold text-text-primary flex items-center gap-2">
            <Server size={14} className="text-brand" />
            Controllers
            <span className="text-[10px] bg-bg-elevated border border-border-subtle px-2 py-0.5 rounded-full text-text-muted">{controllers.length}</span>
          </span>
          <button onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'modules'] })}
            className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand transition-all outline-none">
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {isLoading ? <TableSkeleton columns={7} rows={5} /> : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse table-fixed min-w-[1000px]">
              <thead className="bg-bg-base/50">
                <tr>
                  {['Host Name', 'Module', 'Version', 'IP Address', 'Status', 'Last Heartbeat', 'Policy Ver.'].map(h => (
                    <th key={h} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {controllers.map(row => {
                  const isUp = row.isConnected || row.state === 'RUNNING';
                  return (
                    <tr key={row.id} className="data-row-interactive hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-[12px] text-text-primary font-mono">{row.hostName || row.id}</td>
                      <td className="px-4 py-3 text-[11px] text-text-secondary">{row.moduleName}</td>
                      <td className="px-4 py-3 text-[11px] text-text-muted font-mono">{row.currentVersion || '-'}</td>
                      <td className="px-4 py-3 text-[12px] text-text-primary font-mono">{row.ipAddress || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <StatusPulse variant={isUp ? 'online' : 'critical'} size="sm" />
                          <span className="text-[11px] font-bold" style={{ color: isUp ? '#22C55E' : '#EF4444' }}>{isUp ? 'Up' : 'Down'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[10px] text-text-muted font-mono">{formatTs(row.lastHeartbeat)}</td>
                      <td className="px-4 py-3 text-[11px] text-text-muted font-mono">{row.policyVersion || '-'}</td>
                    </tr>
                  );
                })}
                {controllers.length === 0 && !isLoading && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-xs text-text-muted">No controllers found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ControllerHealth;
