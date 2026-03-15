import React, { useRef, useEffect, useState } from 'react';
import { clsx } from 'clsx';

interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TabNavProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (key: string) => void;
}

export const TabNav: React.FC<TabNavProps> = ({ tabs, activeTab, onChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeEl = container.querySelector(`[data-tab-key="${activeTab}"]`) as HTMLElement | null;
    if (activeEl) {
      const containerRect = container.getBoundingClientRect();
      const elRect = activeEl.getBoundingClientRect();
      setIndicator({
        left: elRect.left - containerRect.left,
        width: elRect.width,
      });
    }
  }, [activeTab]);

  return (
    <div ref={containerRef} className="relative flex gap-1 px-6 bg-bg-base">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          data-tab-key={tab.key}
          onClick={() => onChange(tab.key)}
          className={clsx(
            'relative py-3 px-3 text-sm font-medium transition-colors outline-none cursor-pointer flex items-center gap-1.5',
            activeTab === tab.key
              ? 'text-brand'
              : 'text-text-muted hover:text-text-secondary'
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={clsx(
              'text-[9px] font-bold px-1.5 py-0.5 rounded-full',
              activeTab === tab.key
                ? 'bg-brand/15 text-brand'
                : 'bg-bg-elevated text-text-muted'
            )}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
      {/* Animated underline indicator */}
      <div
        className="absolute bottom-0 h-[2px] bg-brand rounded-full transition-all duration-300 ease-out"
        style={{ left: indicator.left, width: indicator.width }}
      />
    </div>
  );
};
