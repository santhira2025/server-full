import React, { useMemo } from 'react';

interface SparklineChartProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  showDot?: boolean;
  fillOpacity?: number;
  strokeWidth?: number;
}

const SparklineChart: React.FC<SparklineChartProps> = ({
  data,
  color = '#632CA6',
  width = 80,
  height = 24,
  showDot = true,
  fillOpacity = 0.15,
  strokeWidth = 1.5,
}) => {
  const pathData = useMemo(() => {
    if (!data || data.length < 2) return { line: '', area: '' };
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = 2;
    const w = width - padding * 2;
    const h = height - padding * 2;

    const points = data.map((v, i) => ({
      x: padding + (i / (data.length - 1)) * w,
      y: padding + h - ((v - min) / range) * h,
    }));

    // Build smooth bezier curve
    let line = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const cpx = (curr.x + next.x) / 2;
      line += ` C ${cpx},${curr.y} ${cpx},${next.y} ${next.x},${next.y}`;
    }

    // Area path (line + close to bottom)
    const lastPt = points[points.length - 1];
    const area = `${line} L ${lastPt.x},${height} L ${points[0].x},${height} Z`;

    return { line, area, lastPoint: lastPt };
  }, [data, width, height]);

  if (!data || data.length < 2) return null;

  const gradientId = `spark-grad-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <path d={pathData.area} fill={`url(#${gradientId})`} />
      {/* Line */}
      <path
        d={pathData.line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 1000,
          strokeDashoffset: 0,
          animation: 'draw-line 1s ease-out',
        }}
      />
      {/* Latest point dot */}
      {showDot && pathData.lastPoint && (
        <circle
          cx={pathData.lastPoint.x}
          cy={pathData.lastPoint.y}
          r={2.5}
          fill={color}
          className="drop-shadow-sm"
        >
          <animate
            attributeName="opacity"
            values="0.5;1;0.5"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
      )}
    </svg>
  );
};

export default SparklineChart;
