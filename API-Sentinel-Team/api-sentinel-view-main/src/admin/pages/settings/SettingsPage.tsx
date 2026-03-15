import React from 'react';
import { LayoutGrid, Users, Key, Shield, Radio, FileText, ShieldAlert, ClipboardList, CheckSquare, Bell, Webhook, Search, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SettingsCard from '@/components/shared/SettingsCard';

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fade-in w-full pb-10 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col items-center justify-center mb-8 mt-2">
        <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center mb-4">
          <Settings size={24} className="text-brand" />
        </div>
        <h2 className="text-sm font-bold text-text-primary mb-4">Settings</h2>
        <div className="relative w-full max-w-2xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
          <input type="text" placeholder="Search settings..."
            className="w-full bg-bg-surface border border-border-subtle rounded-xl py-3 pl-11 pr-4 text-sm text-text-primary focus:border-brand/50 focus:outline-none focus:ring-1 focus:ring-brand/20 placeholder:text-text-muted transition-all" />
        </div>
      </div>

      {/* Access & Identity */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider pl-1">Access & Identity</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SettingsCard icon={LayoutGrid} title="Manage Applications" description="Add and register new applications, assign them to users or groups." onClick={() => navigate('/add-application')} />
          <SettingsCard icon={Users} title="User & Role Administration" description="Manage organizational users, update role assignments." onClick={() => navigate('/settings/users')} />
          <SettingsCard icon={Key} title="API Keys Management" description="Securely create, manage, and rotate API keys." />
          <SettingsCard icon={Shield} title="Private/Internal IPs" description="Define IP ranges owned by your organization." />
        </div>
      </div>

      {/* Platform & Infrastructure */}
      <div className="space-y-3 pt-2">
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider pl-1">Platform & Infrastructure</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SettingsCard icon={Radio} title="Controller & Sensor Config" description="Configure and manage controller and sensor settings." onClick={() => navigate('/system-health')} />
          <SettingsCard icon={FileText} title="License Usage" description="Monitor license consumption and track active usage." />
        </div>
      </div>

      {/* Security & Governance */}
      <div className="space-y-3 pt-2">
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider pl-1">Security & Governance</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SettingsCard icon={ShieldAlert} title="Threat Policies" description="Global rules for active threats and baseline deviations." onClick={() => navigate('/protection/policy')} />
          <SettingsCard icon={ClipboardList} title="Audit Logs" description="Review all administrative operations and policy changes." onClick={() => navigate('/settings/audit-logs')} />
          <SettingsCard icon={CheckSquare} title="Compliance Reports" description="Generate raw exports for SOC2, PCI-DSS, and HIPAA." onClick={() => navigate('/reports')} />
        </div>
      </div>

      {/* Notifications */}
      <div className="space-y-3 pt-2">
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider pl-1">Notifications</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SettingsCard icon={Bell} title="Alert Channels" description="Configure Slack, Teams, and Email notification routing." />
          <SettingsCard icon={Webhook} title="Webhook Configuration" description="Set up custom HTTP callbacks for security events." />
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
