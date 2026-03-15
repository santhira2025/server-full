import React from 'react';
import { cn } from '@/lib/utils';

interface StatusPulseProps {
  variant: 'online' | 'warning' | 'critical' | 'offline';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

const variantColors = {
  online: { bg: '#2DA44E', ring: 'rgba(45, 164, 78, 0.25)', text: 'text-green-600' },
  warning: { bg: '#D4A017', ring: 'rgba(212, 160, 23, 0.25)', text: 'text-yellow-600' },
  critical: { bg: '#D63D2F', ring: 'rgba(214, 61, 47, 0.25)', text: 'text-red-600' },
  offline: { bg: '#9D9DAF', ring: 'rgba(157, 157, 175, 0.25)', text: 'text-gray-500' },
};

const sizes = {
  sm: { dot: 6, ring1: 10, ring2: 14 },
  md: { dot: 8, ring1: 14, ring2: 20 },
  lg: { dot: 10, ring1: 18, ring2: 26 },
};

const StatusPulse: React.FC<StatusPulseProps> = ({
  variant,
  size = 'md',
  label,
  className,
}) => {
  const colors = variantColors[variant];
  const dims = sizes[size];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="relative flex items-center justify-center"
        style={{ width: dims.ring2, height: dims.ring2 }}
      >
        {/* Outer pulse ring */}
        {variant !== 'offline' && (
          <div
            className="absolute rounded-full"
            style={{
              width: dims.ring2,
              height: dims.ring2,
              background: colors.ring,
              animation: 'pulse-ring 2s cubic-bezier(0, 0, 0.2, 1) infinite',
            }}
          />
        )}
        {/* Middle ring */}
        {variant !== 'offline' && (
          <div
            className="absolute rounded-full"
            style={{
              width: dims.ring1,
              height: dims.ring1,
              background: colors.ring,
              animation: 'pulse-ring 2s cubic-bezier(0, 0, 0.2, 1) infinite 0.3s',
            }}
          />
        )}
        {/* Core dot */}
        <div
          className="relative rounded-full z-10"
          style={{
            width: dims.dot,
            height: dims.dot,
            background: colors.bg,
            boxShadow: `0 0 6px ${colors.bg}80`,
          }}
        />
      </div>
      {label && (
        <span className={cn('text-xs font-medium', colors.text)}>{label}</span>
      )}
    </div>
  );
};

export default StatusPulse;
