import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface TimeFilterProps {
  value: '24h' | '7d';
  onChange: (v: '24h' | '7d') => void;
}

const TimeFilter: React.FC<TimeFilterProps> = ({ value, onChange }) => {
  return (
    <div className="flex items-center gap-6 px-1 py-1">
      {(['24h', '7d'] as const).map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className="flex items-center gap-2 group outline-none cursor-pointer"
        >
          <div className={twMerge(clsx(
            "w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all",
            value === opt
              ? "border-brand bg-brand/10 shadow-[0_0_8px_rgba(99,44,175,0.2)]"
              : "border-border-subtle group-hover:border-muted-foreground"
          ))}>
            {value === opt && <div className="w-1.5 h-1.5 rounded-full bg-brand" />}
          </div>
          <span className={twMerge(clsx(
            "text-xs font-semibold transition-colors",
            value === opt ? "text-text-primary" : "text-muted-foreground group-hover:text-text-primary"
          ))}>
            {opt === '24h' ? '24 Hours' : '7 Days'}
          </span>
        </button>
      ))}
    </div>
  );
};

export default TimeFilter;
