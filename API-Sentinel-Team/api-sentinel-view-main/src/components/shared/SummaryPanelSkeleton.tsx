import React from 'react';

const SummaryPanelSkeleton: React.FC = () => (
  <div className="animate-pulse flex flex-col justify-between rounded-lg border border-border-subtle bg-bg-surface p-4"
    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
    <div className="mb-4 flex items-center justify-between">
      <div className="h-3 w-16 rounded bg-bg-hover" />
      <div className="h-3 w-3 rounded bg-bg-hover" />
    </div>
    <div className="grid grid-cols-5 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-8 w-16 rounded bg-bg-hover" />
          <div className="h-2 w-20 rounded bg-bg-hover/70" />
        </div>
      ))}
    </div>
  </div>
);

export default SummaryPanelSkeleton;
