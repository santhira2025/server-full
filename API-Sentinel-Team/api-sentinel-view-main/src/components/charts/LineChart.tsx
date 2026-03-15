import React from 'react';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
} from 'recharts';

interface LineChartProps {
  data: any[];
  lines: { key: string; color: string; label: string }[];
  xKey: string;
  height?: number;
  showArea?: boolean;
  showDots?: boolean;
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

const LineChart: React.FC<LineChartProps> = ({
  data,
  lines,
  xKey,
  height = 240,
  showArea = true,
  showDots = false,
}) => {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            {lines.map((line) => (
              <linearGradient key={`grad-${line.key}`} id={`line-grad-${line.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={line.color} stopOpacity={0.2} />
                <stop offset="95%" stopColor={line.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E4E4EC" vertical={false} />
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
          {/* Area fills behind lines */}
          {showArea && lines.map((line) => (
            <Area
              key={`area-${line.key}`}
              type="monotoneX"
              dataKey={line.key}
              stroke="none"
              fill={`url(#line-grad-${line.key})`}
              fillOpacity={1}
            />
          ))}
          {lines.map((line) => (
            <Line
              key={line.key}
              type="monotoneX"
              dataKey={line.key}
              name={line.label}
              stroke={line.color}
              strokeWidth={2}
              dot={showDots ? { r: 3, fill: '#F4F4F8', stroke: line.color, strokeWidth: 2 } : false}
              activeDot={{ r: 4, fill: line.color, strokeWidth: 0, className: 'drop-shadow-md' }}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default LineChart;
