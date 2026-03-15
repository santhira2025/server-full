import React from 'react';
import { RefreshCw, Shield, FileText, ToggleRight, Hash, AlertTriangle } from 'lucide-react';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import GlassCard from '@/components/ui/GlassCard';
import { useThreatConfig } from '@/hooks/use-admin';
import { useQueryClient } from '@tanstack/react-query';

function getIcon(key: string) {
  const l = key.toLowerCase();
  if (l.includes('block') || l.includes('deny')) return AlertTriangle;
  if (l.includes('enable') || l.includes('active')) return ToggleRight;
  if (l.includes('threshold') || l.includes('limit') || l.includes('count') || l.includes('score')) return Hash;
  return FileText;
}

function getColor(key: string, value: any) {
  if (typeof value === 'boolean') return value ? '#22C55E' : '#6B7280';
  const l = key.toLowerCase();
  if (l.includes('block') || l.includes('critical')) return '#EF4444';
  if (l.includes('threshold') || l.includes('limit')) return '#632CA6';
  return '#3B82F6';
}

const PolicyConfiguration: React.FC = () => {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useThreatConfig();

  const config = data ?? {};
  const entries = Object.entries(config).filter(([k]) => !k.startsWith('_'));

  const boolEntries = entries.filter(([, v]) => typeof v === 'boolean');
  const numEntries = entries.filter(([, v]) => typeof v === 'number');
  const otherEntries = entries.filter(([, v]) => typeof v !== 'boolean' && typeof v !== 'number');

  return (
    <div className="space-y-5 animate-fade-in pb-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
            <Shield size={18} className="text-brand" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary">Security Policies</h2>
            <p className="text-[11px] text-text-muted">Active threat detection and response policy configuration</p>
          </div>
        </div>
        <button onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'threatConfig'] })} className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand transition-all outline-none">
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {isError && <QueryError message="Failed to load policy configuration" onRetry={() => refetch()} />}

      {isLoading ? <TableSkeleton columns={2} rows={5} /> : (
        <>
          {entries.length === 0 && (
            <GlassCard variant="default" className="p-8 text-center">
              <Shield size={32} className="mx-auto mb-3 text-text-muted" />
              <p className="text-sm text-text-muted">No threat policies configured. Policies will appear here once the protection module is active.</p>
            </GlassCard>
          )}

          {boolEntries.length > 0 && (
            <GlassCard variant="default" className="p-4">
              <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">Feature Flags</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {boolEntries.map(([key, value]) => {
                  const color = getColor(key, value);
                  const Icon = getIcon(key);
                  return (
                    <div key={key} className="metric-card flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}12` }}>
                        <Icon size={14} style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[12px] text-text-primary block truncate">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${value ? 'bg-sev-low/10 text-sev-low border border-sev-low/20' : 'bg-bg-elevated text-text-muted border border-border-subtle'}`}>
                        {value ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          )}

          {numEntries.length > 0 && (
            <GlassCard variant="default" className="p-4">
              <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">Thresholds & Limits</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {numEntries.map(([key, value]) => {
                  const color = getColor(key, value);
                  const Icon = getIcon(key);
                  return (
                    <div key={key} className="metric-card flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}12` }}>
                        <Icon size={14} style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[12px] text-text-primary block truncate">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
                      </div>
                      <span className="text-sm font-bold font-mono tabular-nums" style={{ color }}>{String(value)}</span>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          )}

          {otherEntries.length > 0 && (
            <GlassCard variant="default" className="p-4">
              <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">Other Settings</p>
              <div className="space-y-2">
                {otherEntries.map(([key, value]) => {
                  const color = getColor(key, value);
                  const Icon = getIcon(key);
                  return (
                    <div key={key} className="metric-card flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}12` }}>
                        <Icon size={14} style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[12px] text-text-primary block truncate">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
                      </div>
                      <span className="text-xs font-mono text-text-muted">{String(value)}</span>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          )}
        </>
      )}
    </div>
  );
};

export default PolicyConfiguration;
