import React from 'react';
import { cn } from '@/lib/utils';
import AnimatedCounter from './AnimatedCounter';
import SparklineChart from './SparklineChart';
import { TrendingUp, TrendingDown, Minus, LucideIcon } from 'lucide-react';

interface MetricWidgetProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  change?: number;
  changeLabel?: string;
  sparkData?: number[];
  sparkColor?: string;
  icon?: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  compact?: boolean;
  className?: string;
  onClick?: () => void;
}

const MetricWidget: React.FC<MetricWidgetProps> = ({
  label,
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  change,
  changeLabel,
  sparkData,
  sparkColor = '#632CA6',
  icon: Icon,
  iconColor = '#632CA6',
  iconBg = 'rgba(99, 44, 175, 0.1)',
  compact = false,
  className,
  onClick,
}) => {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;
  const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const trendColor = isPositive ? '#22C55E' : isNegative ? '#EF4444' : '#6B6B80';

  if (compact) {
    return (
      <div
        onClick={onClick}
        className={cn(
          'metric-card p-3 flex items-center gap-3',
          onClick && 'cursor-pointer',
          className
        )}
      >
        {Icon && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: iconBg }}
          >
            <Icon size={16} style={{ color: iconColor }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-text-secondary truncate">{label}</p>
          <AnimatedCounter
            value={value}
            prefix={prefix}
            suffix={suffix}
            decimals={decimals}
            className="text-lg font-bold text-text-primary"
          />
        </div>
        {sparkData && sparkData.length > 1 && (
          <SparklineChart data={sparkData} color={sparkColor} width={56} height={20} />
        )}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        'metric-card p-4 flex flex-col gap-3',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {/* Header: icon + label */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: iconBg }}
            >
              <Icon size={18} style={{ color: iconColor }} />
            </div>
          )}
          <span className="text-xs font-medium text-text-secondary">{label}</span>
        </div>
        {change !== undefined && (
          <div className="flex items-center gap-1" style={{ color: trendColor }}>
            <TrendIcon size={14} />
            <span className="text-xs font-semibold tabular-nums">
              {isPositive && '+'}{change}%
            </span>
          </div>
        )}
      </div>

      {/* Value row */}
      <div className="flex items-end justify-between">
        <AnimatedCounter
          value={value}
          prefix={prefix}
          suffix={suffix}
          decimals={decimals}
          className="text-2xl font-bold text-text-primary leading-none"
        />
        {sparkData && sparkData.length > 1 && (
          <SparklineChart
            data={sparkData}
            color={sparkColor}
            width={80}
            height={24}
          />
        )}
      </div>

      {/* Change label */}
      {changeLabel && (
        <p className="text-[11px] text-text-muted">{changeLabel}</p>
      )}
    </div>
  );
};

export default MetricWidget;
