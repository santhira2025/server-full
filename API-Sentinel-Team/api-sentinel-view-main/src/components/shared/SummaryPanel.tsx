import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface SummaryPanelProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const SummaryPanel: React.FC<SummaryPanelProps> = ({ children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-border-subtle rounded-xl mb-4 flex flex-col overflow-hidden bg-bg-surface">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2.5 w-full outline-none transition-colors hover:bg-bg-elevated rounded-t-xl border-b border-border-subtle"
      >
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-widest">Summary</span>
        <ChevronDown size={14} className={twMerge(clsx('transition-transform text-muted-foreground', open ? 'rotate-0' : '-rotate-90'))} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 overflow-x-auto">
          <div className="flex gap-3 min-w-max">
            {children}
          </div>
        </div>
      )}
    </div>
  );
};

export default SummaryPanel;
