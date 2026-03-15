import React from 'react';
import { Settings, Shield, Clock, Zap, Bell } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';

const configSections = [
  { icon: Shield, label: 'Scan Scope', desc: 'Define which API collections and endpoints to include in security scans', color: '#3B82F6' },
  { icon: Zap, label: 'Test Templates', desc: 'Select and configure vulnerability test templates from the library', color: '#632CA6' },
  { icon: Clock, label: 'Schedule', desc: 'Set up recurring scan schedules with cron-based configuration', color: '#8B5CF6' },
  { icon: Bell, label: 'Notifications', desc: 'Configure alert channels and severity thresholds for findings', color: '#22C55E' },
];

const TestConfiguration: React.FC = () => (
  <div className="space-y-5 animate-fade-in">
    <GlassCard variant="elevated" className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
          <Settings size={18} className="text-brand" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-text-primary">Scan Configuration</h2>
          <p className="text-[11px] text-text-muted">Configure scan scope, authentication, scheduling, and notification preferences</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {configSections.map(({ icon: Icon, label, desc, color }) => (
          <div
            key={label}
            className="metric-card p-4 flex items-start gap-3 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}12` }}>
              <Icon size={18} style={{ color }} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-text-primary mb-0.5">{label}</h3>
              <p className="text-[11px] text-text-muted leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-text-muted mt-4 text-center">
        Configuration options will be fully interactive once the testing module is active and connected to your API inventory.
      </p>
    </GlassCard>
  </div>
);

export default TestConfiguration;
