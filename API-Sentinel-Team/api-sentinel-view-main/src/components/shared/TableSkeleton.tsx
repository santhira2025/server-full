import React from 'react';

interface TableSkeletonProps {
  columns?: number;
  rows?: number;
}

const TableSkeleton: React.FC<TableSkeletonProps> = ({ columns = 6, rows = 8 }) => (
  <div className="animate-pulse">
    {/* Header row */}
    <div className="flex gap-4 border-b border-border-subtle px-4 py-3">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="h-3 flex-1 rounded bg-bg-hover" />
      ))}
    </div>
    {/* Data rows */}
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex gap-4 border-b border-border-subtle px-4 py-3">
        {Array.from({ length: columns }).map((_, c) => (
          <div
            key={c}
            className="h-3 flex-1 rounded bg-bg-hover/70"
            style={{ maxWidth: c === 0 ? '24px' : undefined }}
          />
        ))}
      </div>
    ))}
  </div>
);

export default TableSkeleton;
