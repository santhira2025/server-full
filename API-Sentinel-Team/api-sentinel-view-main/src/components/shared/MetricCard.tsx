import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  subLabel?: string;
  accentColor?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, trend, subLabel, accentColor }) => {
  const isUp = trend === 'up';
  const isDown = trend === 'down';

  return (
    <div className="rounded-lg flex flex-col p-4 border border-border-subtle justify-center min-w-[150px] transition-all duration-200 card-hover bg-bg-base"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
      <span className="text-[11px] text-muted-foreground mb-2 font-medium uppercase tracking-wider">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold font-display text-text-primary" style={accentColor ? { color: accentColor } : {}}>
          {value}
        </span>
        {trend && (
          <span className={`flex items-center text-[11px] font-semibold ${isUp ? 'text-[#22C55E]' : isDown ? 'text-[#EF4444]' : 'text-muted-foreground'}`}>
            {isUp ? <TrendingUp size={12} /> : isDown ? <TrendingDown size={12} /> : <Minus size={12} />}
          </span>
        )}
      </div>
      {subLabel && <span className="text-[10px] text-muted-foreground mt-1.5">{subLabel}</span>}
    </div>
  );
};

export default MetricCard;
