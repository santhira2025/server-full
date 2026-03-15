import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface ProgressRingProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  showValue?: boolean;
  valuePrefix?: string;
  valueSuffix?: string;
  className?: string;
  children?: React.ReactNode;
}

function getScoreColor(pct: number): string {
  if (pct >= 80) return '#22C55E';
  if (pct >= 60) return '#EAB308';
  if (pct >= 40) return '#632CA6';
  return '#EF4444';
}

const ProgressRing: React.FC<ProgressRingProps> = ({
  value,
  max = 100,
  size = 120,
  strokeWidth = 8,
  color,
  trackColor = 'rgba(0,0,0,0.04)',
  label,
  showValue = true,
  valuePrefix = '',
  valueSuffix = '',
  className,
  children,
}) => {
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedValue(value), 100);
    return () => clearTimeout(timer);
  }, [value]);

  const pct = Math.min((animatedValue / max) * 100, 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const resolvedColor = color || getScoreColor((value / max) * 100);

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={resolvedColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.5s ease',
            filter: `drop-shadow(0 0 6px ${resolvedColor}40)`,
          }}
        />
      </svg>
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children ? (
          children
        ) : (
          <>
            {showValue && (
              <span className="text-xl font-bold text-text-primary tabular-nums leading-none">
                {valuePrefix}{Math.round((animatedValue / max) * 100)}{valueSuffix || '%'}
              </span>
            )}
            {label && (
              <span className="text-[10px] text-text-secondary mt-1">{label}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ProgressRing;
