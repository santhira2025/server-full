import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

interface HeatmapData {
  day: number;   // 0-6 (Mon-Sun)
  hour: number;  // 0-23
  value: number;
}

interface HeatmapChartProps {
  data: HeatmapData[];
  height?: number;
  colorRange?: [string, string, string, string, string];
  className?: string;
}

const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hourLabels = ['12a', '', '', '3a', '', '', '6a', '', '', '9a', '', '', '12p', '', '', '3p', '', '', '6p', '', '', '9p', '', ''];

function getIntensityColor(value: number, max: number, colors: string[]): string {
  if (value === 0 || max === 0) return 'rgba(0,0,0,0.02)';
  const pct = value / max;
  if (pct < 0.2) return colors[0];
  if (pct < 0.4) return colors[1];
  if (pct < 0.6) return colors[2];
  if (pct < 0.8) return colors[3];
  return colors[4];
}

const HeatmapChart: React.FC<HeatmapChartProps> = ({
  data,
  height = 180,
  colorRange = [
    'rgba(99,44,175,0.1)',
    'rgba(99,44,175,0.25)',
    'rgba(99,44,175,0.4)',
    'rgba(99,44,175,0.6)',
    'rgba(99,44,175,0.85)',
  ],
  className,
}) => {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; value: number; day: string; hour: string } | null>(null);

  const { grid, maxVal } = useMemo(() => {
    const g: Map<string, number> = new Map();
    let mx = 0;
    data.forEach((d) => {
      const key = `${d.day}-${d.hour}`;
      g.set(key, d.value);
      if (d.value > mx) mx = d.value;
    });
    return { grid: g, maxVal: mx };
  }, [data]);

  const cellSize = Math.max(Math.floor((height - 30) / 7) - 2, 10);

  return (
    <div className={cn('relative', className)} style={{ height }}>
      <div className="flex">
        {/* Day labels */}
        <div className="flex flex-col pr-2 pt-5">
          {dayLabels.map((d) => (
            <div key={d} className="text-[9px] text-text-muted flex items-center" style={{ height: cellSize + 2 }}>
              {d}
            </div>
          ))}
        </div>
        {/* Grid */}
        <div className="flex-1 overflow-x-auto no-scrollbar">
          {/* Hour labels */}
          <div className="flex mb-1">
            {hourLabels.map((h, i) => (
              <div
                key={i}
                className="text-[8px] text-text-muted text-center"
                style={{ width: cellSize + 2, minWidth: cellSize + 2 }}
              >
                {h}
              </div>
            ))}
          </div>
          {/* Cells */}
          {dayLabels.map((_, dayIdx) => (
            <div key={dayIdx} className="flex">
              {Array.from({ length: 24 }).map((_, hourIdx) => {
                const val = grid.get(`${dayIdx}-${hourIdx}`) || 0;
                return (
                  <div
                    key={hourIdx}
                    className="rounded-sm cursor-pointer transition-all duration-150 hover:ring-1 hover:ring-brand/40"
                    style={{
                      width: cellSize,
                      height: cellSize,
                      margin: 1,
                      background: getIntensityColor(val, maxVal, colorRange),
                    }}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({
                        x: rect.left + rect.width / 2,
                        y: rect.top - 8,
                        value: val,
                        day: dayLabels[dayIdx],
                        hour: `${hourIdx}:00`,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 glass-card-premium px-2.5 py-1.5 rounded-md text-[10px] pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <span className="text-text-secondary">{tooltip.day} {tooltip.hour}</span>
          <span className="text-text-primary font-mono font-bold ml-2">{tooltip.value}</span>
        </div>
      )}
    </div>
  );
};

export default HeatmapChart;
