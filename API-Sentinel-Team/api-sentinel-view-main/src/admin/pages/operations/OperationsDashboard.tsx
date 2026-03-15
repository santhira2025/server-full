import React, { useState } from 'react';
import { TabNav } from '@/components/layout/TabNav';
import { RefreshCw, Filter, Server } from 'lucide-react';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import StatusPulse from '@/components/ui/StatusPulse';
import GlassCard from '@/components/ui/GlassCard';
import { useModuleInfo } from '@/hooks/use-admin';
import { useQueryClient } from '@tanstack/react-query';

function formatTs(epoch: number) {
  if (!epoch) return '-';
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const OperationsDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('system');
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useModuleInfo();

  const modules = data?.moduleInfos ?? [];
  const upCount = modules.filter(m => m.isConnected || m.state === 'RUNNING').length;

  const tabs = [
    { key: 'system', label: 'System' },
    { key: 'config', label: 'Config' },
    { key: 'secops', label: 'Sec-Ops' },
    { key: 'training', label: 'Global Training' },
  ];

  return (
    <div className="flex flex-col h-full animate-fade-in w-full pb-10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
            <Server size={18} className="text-brand" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary">Operations Dashboard</h2>
            <p className="text-[11px] text-text-muted">{upCount} of {modules.length} modules online</p>
          </div>
        </div>
        <button onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'modules'] })}
          className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand transition-all outline-none">
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {isError && <QueryError message="Failed to load operations data" onRetry={() => refetch()} />}

      <div className="border-b border-border-subtle -mx-6 mb-4">
        <div className="flex items-center justify-between pr-6">
          <TabNav tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted">{modules.length} modules</span>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle bg-bg-surface text-xs text-text-muted hover:text-text-primary hover:border-brand/20 transition-all outline-none">
              Filter <Filter size={12} />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-bg-surface border border-border-subtle rounded-xl overflow-hidden flex-1 flex flex-col">
        {isLoading ? <TableSkeleton columns={8} rows={4} /> : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse table-fixed min-w-[1200px]">
              <thead className="bg-bg-base/50">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-[14%]">Host Name</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-[14%]">Module</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-[10%]">Version</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-[12%]">IP Address</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-[8%]">Status</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-[8%]">State</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-[14%]">Last Heartbeat</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted w-[10%]">Policy Ver.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {modules.map((row) => {
                  const isUp = row.isConnected || row.state === 'RUNNING';
                  return (
                    <tr key={row.id} className="data-row-interactive hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-[12px] text-brand font-mono font-semibold">{row.hostName || row.id}</td>
                      <td className="px-4 py-3 text-[11px] text-sev-medium font-medium">{row.moduleName}</td>
                      <td className="px-4 py-3 text-[11px] text-text-muted font-mono">{row.currentVersion || '-'}</td>
                      <td className="px-4 py-3 text-[12px] text-text-primary font-mono">{row.ipAddress || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <StatusPulse variant={isUp ? 'online' : 'critical'} size="sm" />
                          <span className="text-[11px] font-bold" style={{ color: isUp ? '#22C55E' : '#EF4444' }}>{isUp ? 'Up' : 'Down'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-text-muted">{row.state || '-'}</td>
                      <td className="px-4 py-3 text-[10px] text-text-muted font-mono">{formatTs(row.lastHeartbeat)}</td>
                      <td className="px-4 py-3 text-[11px] text-text-muted font-mono">{row.policyVersion || '-'}</td>
                    </tr>
                  );
                })}
                {modules.length === 0 && !isLoading && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-xs text-text-muted">
                    <Server size={24} className="mx-auto mb-2 text-text-muted" />
                    No operational modules registered yet.
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

export default OperationsDashboard;
