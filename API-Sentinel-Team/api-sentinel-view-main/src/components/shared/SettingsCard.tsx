import React from 'react';
import { LucideIcon } from 'lucide-react';

interface SettingsCardProps {
    icon: LucideIcon;
    title: string;
    description: string;
    onClick?: () => void;
}

const SettingsCard: React.FC<SettingsCardProps> = ({ icon: Icon, title, description, onClick }) => {
    return (
        <div
            onClick={onClick}
            className="group flex flex-col items-start gap-4 rounded-xl border border-border-subtle bg-bg-surface p-5 cursor-pointer transition-all hover:bg-bg-hover hover:border-brand/30 hover:shadow-[0_4px_16px_rgba(99,44,175,0.08)]"
        >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <Icon size={20} />
            </div>
            <div>
                <h3 className="text-sm font-semibold text-text-primary group-hover:text-brand transition-colors">{title}</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>
            </div>
        </div>
    );
};

export default SettingsCard;
