import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface ToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
}

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label }) => {
    return (
        <label className="flex items-center gap-2 cursor-pointer outline-none group">
            <div
                onClick={() => onChange(!checked)}
                className="w-8 h-4 rounded-full relative transition-all duration-200 shrink-0"
                style={{ background: checked ? 'linear-gradient(135deg, #632CA6, #4F1F8E)' : 'var(--bg-elevated)', boxShadow: checked ? '0 0 8px rgba(99,44,175,0.4)' : 'none' }}
            >
                <div className={clsx(
                    'absolute top-[2px] w-3 h-3 rounded-full bg-bg-base transition-transform duration-200 shadow-sm',
                    checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
                )} />
            </div>
            {label && <span className="text-[11px] text-muted-foreground select-none group-hover:text-text-primary transition-colors">{label}</span>}
        </label>
    );
};
