import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface TimelineChartProps {
  data: Array<{ date: string; [key: string]: number | string }>;
  bars: Array<{ key: string; color: string; name: string }>;
  height?: number;
}

const TimelineChart: React.FC<TimelineChartProps> = ({ data, bars, height = 200 }) => {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))' }}
          labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
        />
        {bars.map((bar) => (
          <Bar key={bar.key} dataKey={bar.key} fill={bar.color} name={bar.name} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

export default TimelineChart;
