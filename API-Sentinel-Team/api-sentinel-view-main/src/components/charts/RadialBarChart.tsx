import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface RadialBarItem {
  label: string;
  value: number;
  max?: number;
  color: string;
}

interface RadialBarChartProps {
  data: RadialBarItem[];
  size?: number;
  strokeWidth?: number;
  showLegend?: boolean;
  className?: string;
}

const RadialBarChart: React.FC<RadialBarChartProps> = ({
  data,
  size = 140,
  strokeWidth = 10,
  showLegend = true,
  className,
}) => {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const center = size / 2;
  const gapBetweenRings = 4;

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <svg width={size} height={size} className="-rotate-90">
        {data.map((item, i) => {
          const radius = center - strokeWidth / 2 - i * (strokeWidth + gapBetweenRings);
          if (radius <= 0) return null;
          const circumference = 2 * Math.PI * radius;
          const max = item.max || 100;
          const pct = Math.min(item.value / max, 1);
          const offset = animated ? circumference * (1 - pct) : circumference;

          return (
            <React.Fragment key={i}>
              {/* Track */}
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.04)"
                strokeWidth={strokeWidth}
              />
              {/* Progress */}
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                style={{
                  transition: `stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.15}s`,
                  filter: `drop-shadow(0 0 4px ${item.color}40)`,
                }}
              />
            </React.Fragment>
          );
        })}
      </svg>

      {showLegend && (
        <div className="space-y-2">
          {data.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
              <div className="flex flex-col">
                <span className="text-[11px] text-text-secondary leading-none">{item.label}</span>
                <span className="text-xs font-bold text-text-primary tabular-nums">
                  {item.value}{item.max ? `/${item.max}` : '%'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RadialBarChart;
