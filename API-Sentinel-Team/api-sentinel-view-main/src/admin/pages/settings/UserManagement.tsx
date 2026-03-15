import React, { useState } from 'react';
import { useTeamData, useCustomRoles } from '@/hooks/use-admin';
import { ArrowLeft, Users, Shield, Loader2, Trash2, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { removeUser } from '@/services/admin.service';
import { useQueryClient } from '@tanstack/react-query';
import GlassCard from '@/components/ui/GlassCard';

const UserManagement: React.FC = () => {
  const navigate = useNavigate();
  const { data: teamData, isLoading: teamLoading } = useTeamData();
  const { data: rolesData, isLoading: rolesLoading } = useCustomRoles();
  const qc = useQueryClient();
  const [removing, setRemoving] = useState<string | null>(null);

  const users = teamData?.users ?? [];
  const pendingInvites = teamData?.pendingInvitees ?? [];
  const roles = rolesData?.customRoles ?? [];

  const handleRemove = async (email: string) => {
    if (!confirm(`Remove user ${email}?`)) return;
    setRemoving(email);
    try {
      await removeUser(email);
      qc.invalidateQueries({ queryKey: ['admin', 'team'] });
    } catch { /* handled by toast */ }
    setRemoving(null);
  };

  return (
    <div className="space-y-5 animate-fade-in max-w-5xl mx-auto pb-10">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/settings')} className="w-8 h-8 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-text-muted hover:text-text-primary hover:border-brand/20 transition-all">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-sm font-bold text-text-primary">User & Role Administration</h2>
          <p className="text-[11px] text-text-muted">Manage users, roles, and pending invitations</p>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-bg-surface border border-border-subtle rounded-xl overflow-hidden">
        <div className="p-3 border-b border-border-subtle flex items-center gap-2">
          <Users size={14} className="text-brand" />
          <span className="text-xs font-bold text-text-primary">Team Members</span>
          <span className="text-[10px] bg-bg-elevated border border-border-subtle px-2 py-0.5 rounded-full text-text-muted">{users.length}</span>
        </div>
        {teamLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>
        ) : users.length === 0 ? (
          <div className="py-10 text-center text-xs text-text-muted">No team members found</div>
        ) : (
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border-subtle bg-bg-base/50">
              <th className="text-left px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">User</th>
              <th className="text-left px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Role</th>
              <th className="text-left px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Last Login</th>
              <th className="text-right px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border-subtle">
              {users.map(u => (
                <tr key={u.login} className="data-row-interactive hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center text-brand text-[11px] font-bold">
                        {(u.name || u.login || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="text-[12px] text-text-primary font-medium">{u.name || u.login}</div>
                        <div className="text-[10px] text-text-muted">{u.login}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20 uppercase">{u.role}</span>
                  </td>
                  <td className="px-5 py-3 text-[11px] text-text-muted">
                    {u.lastLoginTs ? new Date(u.lastLoginTs).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => handleRemove(u.login)} disabled={removing === u.login}
                      className="p-1.5 rounded-md hover:bg-sev-critical/10 text-text-muted hover:text-sev-critical transition-colors disabled:opacity-50">
                      {removing === u.login ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pending Invitations */}
      {pendingInvites.length > 0 && (
        <GlassCard variant="default" className="overflow-hidden">
          <div className="p-3 border-b border-border-subtle flex items-center gap-2">
            <Mail size={14} className="text-sev-medium" />
            <span className="text-xs font-bold text-text-primary">Pending Invitations</span>
            <span className="text-[10px] bg-bg-elevated border border-border-subtle px-2 py-0.5 rounded-full text-text-muted">{pendingInvites.length}</span>
          </div>
          <div className="divide-y divide-border-subtle">
            {pendingInvites.map(email => (
              <div key={email} className="px-5 py-3 text-xs text-text-muted font-mono">{email}</div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Custom Roles */}
      <div className="bg-bg-surface border border-border-subtle rounded-xl overflow-hidden">
        <div className="p-3 border-b border-border-subtle flex items-center gap-2">
          <Shield size={14} className="text-brand" />
          <span className="text-xs font-bold text-text-primary">Custom Roles</span>
          <span className="text-[10px] bg-bg-elevated border border-border-subtle px-2 py-0.5 rounded-full text-text-muted">{roles.length}</span>
        </div>
        {rolesLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>
        ) : roles.length === 0 ? (
          <div className="py-10 text-center text-xs text-text-muted">No custom roles defined</div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {roles.map(r => (
              <div key={r.name} className="px-5 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                <div>
                  <div className="text-[12px] font-medium text-text-primary">{r.name}</div>
                  {r.baseRole && <div className="text-[10px] text-text-muted">Base: {r.baseRole}</div>}
                </div>
                <span className="text-[10px] bg-bg-elevated border border-border-subtle px-2 py-0.5 rounded-full text-text-muted">
                  {r.apiCollectionIds?.length ?? 0} collections
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserManagement;
