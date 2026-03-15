import React from 'react';
import { Severity } from '@/types';

const SEV_CONFIG: Record<Severity, { color: string; rank: string }> = {
  critical: { color: '#EF4444', rank: '1' },
  high: { color: '#F97316', rank: '2' },
  major: { color: '#F97316', rank: '2' },
  medium: { color: '#EAB308', rank: '3' },
  minor: { color: '#EAB308', rank: '3' },
  low: { color: '#22C55E', rank: '4' },
  info: { color: '#22C55E', rank: '4' },
};

const STATUS_MAP: Record<string, { bg: string; text: string; label: string }> = {
  'Open': { bg: 'rgba(239,68,68,0.1)', text: '#EF4444', label: 'Open' },
  'False Positive': { bg: 'rgba(99,44,175,0.1)', text: '#632CA6', label: 'False Positive' },
  'Analyzed': { bg: 'rgba(234,179,8,0.1)', text: '#EAB308', label: 'Analyzed' },
  'Risk Accepted': { bg: 'rgba(167,139,250,0.1)', text: '#7C3AED', label: 'Risk Accepted' },
  'Resolved': { bg: 'rgba(34,197,94,0.1)', text: '#22C55E', label: 'Resolved' },
};

interface SeverityBadgeProps { severity: Severity; }
export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity }) => {
  const c = SEV_CONFIG[severity] || SEV_CONFIG.info;
  return (
    <div className="flex items-center justify-center w-6 h-6 rounded-full border text-[11px] font-bold"
      style={{
        borderColor: `${c.color}60`,
        color: c.color,
        backgroundColor: `${c.color}15`
      }}>
      {c.rank}
    </div>
  );
};

interface StatusBadgeProps { status: string; }
export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const c = STATUS_MAP[status] || { bg: 'rgba(107,114,128,0.08)', text: '#6B7280', label: status };
  return (
    <span className="inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold border"
      style={{ background: c.bg, color: c.text, borderColor: `${c.text}25` }}>
      {c.label}
    </span>
  );
};

interface MethodBadgeProps { method: string; }
export const MethodBadge: React.FC<MethodBadgeProps> = ({ method }) => {
  const colors: Record<string, string> = {
    GET: '#22C55E', POST: '#3B82F6', PUT: '#EAB308', DELETE: '#EF4444', PATCH: '#632CA6'
  };
  const color = colors[method] || '#6B7280';
  return (
    <span className="text-[11px] font-bold font-mono tracking-wide" style={{ color }}>
      {method}
    </span>
  );
};

interface AuthBadgeProps { auth: string; }
export const AuthBadge: React.FC<AuthBadgeProps> = ({ auth }) => {
  const isUnauth = auth === 'Unauth';
  return (
    <span className="text-[11px] font-semibold" style={{ color: isUnauth ? '#EF4444' : '#22C55E' }}>
      {auth}
    </span>
  );
};

export const StateBadge: React.FC<{ state: string }> = ({ state }) => (
  <span className="text-xs text-text-primary">{state}</span>
);

export const RiskBadge: React.FC<{ risk: string }> = ({ risk }) => {
  const r = risk.toLowerCase();
  const color = r === 'high' || r === 'critical' ? '#EF4444'
    : r === 'medium' ? '#F97316'
      : r === 'low' ? '#EAB308' : '#22C55E';
  return <span className="text-[11px] font-bold" style={{ color }}>{risk}</span>;
}
