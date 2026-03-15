import React from 'react';
import { RefreshCw, Settings, Shield, ShieldCheck, ShieldBan, Zap, Eye, Bell, Lock } from 'lucide-react';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import GlassCard from '@/components/ui/GlassCard';
import { useThreatConfig, useUpdateThreatConfig } from '@/hooks/use-admin';
import { useQueryClient } from '@tanstack/react-query';

function getSettingMeta(key: string): { icon: typeof Shield; color: string; desc: string } {
  const l = key.toLowerCase();
  if (l.includes('block') || l.includes('ban')) return { icon: ShieldBan, color: '#EF4444', desc: 'Automatically block threats matching this rule' };
  if (l.includes('monitor') || l.includes('watch')) return { icon: Eye, color: '#3B82F6', desc: 'Monitor and log suspicious activity' };
  if (l.includes('alert') || l.includes('notify')) return { icon: Bell, color: '#632CA6', desc: 'Send alerts when triggered' };
  if (l.includes('enforce') || l.includes('strict')) return { icon: Lock, color: '#8B5CF6', desc: 'Enforce strict validation rules' };
  if (l.includes('protect') || l.includes('shield')) return { icon: ShieldCheck, color: '#22C55E', desc: 'Enable protection layer' };
  if (l.includes('auto') || l.includes('detect')) return { icon: Zap, color: '#632CA6', desc: 'Automatic threat detection' };
  return { icon: Shield, color: '#6B7280', desc: 'Security configuration toggle' };
}

const ProtectionSettings: React.FC = () => {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useThreatConfig();
  const update = useUpdateThreatConfig();

  const config = data ?? {};
  const booleanEntries = Object.entries(config).filter(([, v]) => typeof v === 'boolean');

  const handleToggle = (key: string, current: boolean) => {
    update.mutate({ ...config, [key]: !current });
  };

  const enabledCount = booleanEntries.filter(([, v]) => v).length;
  const totalCount = booleanEntries.length;

  return (
    <div className="space-y-5 animate-fade-in pb-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
            <Settings size={18} className="text-brand" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary">Protection Settings</h2>
            <p className="text-[11px] text-text-muted">Toggle security features and protection layers</p>
          </div>
        </div>
        <button onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'threatConfig'] })} className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand transition-all outline-none">
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {isError && <QueryError message="Failed to load protection settings" onRetry={() => refetch()} />}

      {/* Status overview */}
      {!isLoading && totalCount > 0 && (
        <GlassCard variant="default" className="p-4 flex items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-lg bg-sev-low/10 flex items-center justify-center shrink-0">
              <ShieldCheck size={20} className="text-sev-low" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-text-secondary">Active Protection</span>
                <span className="text-sm font-bold text-text-primary tabular-nums">{enabledCount} / {totalCount}</span>
              </div>
              <div className="h-2 bg-black/[0.04] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-sev-low to-green-300 transition-all duration-700" style={{ width: `${totalCount > 0 ? (enabledCount / totalCount) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {isLoading ? <TableSkeleton columns={2} rows={4} /> : (
        <>
          {booleanEntries.length === 0 && (
            <GlassCard variant="default" className="p-8 text-center">
              <Settings size={32} className="mx-auto mb-3 text-text-muted" />
              <p className="text-sm text-text-muted">No configurable settings found. Settings will appear here once the protection module is active.</p>
            </GlassCard>
          )}

          <div className="space-y-2">
            {booleanEntries.map(([key, value]) => {
              const meta = getSettingMeta(key);
              const Icon = meta.icon;
              const isEnabled = value as boolean;
              return (
                <GlassCard key={key} variant="default" className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${meta.color}12` }}>
                      <Icon size={18} style={{ color: meta.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-text-primary">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</h3>
                      <p className="text-[11px] text-text-muted mt-0.5">{meta.desc}</p>
                    </div>
                    <button
                      onClick={() => handleToggle(key, isEnabled)}
                      className={`h-6 w-11 rounded-full relative cursor-pointer transition-all duration-300 shrink-0 ${isEnabled ? 'bg-brand shadow-[0_0_8px_rgba(99,44,175,0.3)]' : 'bg-[#484F58]'}`}
                    >
                      <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${isEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default ProtectionSettings;
