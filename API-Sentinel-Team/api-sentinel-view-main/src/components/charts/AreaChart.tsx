import React from 'react';
import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface AreaChartProps {
  data: any[];
  areas: { key: string; color: string; label: string; stacked?: boolean }[];
  xKey: string;
  height?: number;
  showGrid?: boolean;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-card-premium p-3 rounded-lg shadow-xl min-w-[140px]">
        <p className="text-text-primary text-xs mb-2 font-medium">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex gap-2 items-center text-[11px] mb-1">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color }} />
            <span className="text-text-secondary">{entry.name}:</span>
            <span className="text-text-primary font-mono font-medium">{entry.value?.toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const AreaChartComponent: React.FC<AreaChartProps> = ({
  data,
  areas,
  xKey,
  height = 240,
  showGrid = true,
}) => {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            {areas.map((area) => (
              <linearGradient key={area.key} id={`grad-${area.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={area.color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={area.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="#E4E4EC" vertical={false} />
          )}
          <XAxis
            dataKey={xKey}
            stroke="#9D9DAF"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            dy={10}
          />
          <YAxis
            stroke="#9D9DAF"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: 'rgba(99,44,175,0.2)', strokeWidth: 1 }}
          />
          {areas.map((area) => (
            <Area
              key={area.key}
              type="monotoneX"
              dataKey={area.key}
              name={area.label}
              stroke={area.color}
              strokeWidth={2}
              fill={`url(#grad-${area.key})`}
              stackId={area.stacked ? 'stack' : undefined}
              dot={false}
              activeDot={{ r: 4, fill: area.color, strokeWidth: 0 }}
            />
          ))}
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AreaChartComponent;
