import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Pause } from 'lucide-react';

interface CarouselCardProps {
    title: string;
    items: React.ReactNode[];
}

const CarouselCard: React.FC<CarouselCardProps> = ({ title, items }) => {
    const [idx, setIdx] = useState(0);

    return (
        <div className="bg-bg-base border border-border-subtle rounded p-3 min-w-[200px] flex flex-col h-full"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-border-subtle">
                <span className="text-xs text-muted-foreground font-medium">{title}</span>
                <div className="flex gap-1">
                    <button
                        onClick={() => setIdx(i => Math.max(0, i - 1))}
                        className="text-muted-foreground hover:text-text-primary transition-colors outline-none cursor-pointer"
                    >
                        <ChevronLeft size={12} />
                    </button>
                    <button className="text-muted-foreground hover:text-text-primary transition-colors outline-none cursor-pointer">
                        <Pause size={12} />
                    </button>
                    <button
                        onClick={() => setIdx(i => Math.min(items.length - 1, i + 1))}
                        className="text-muted-foreground hover:text-text-primary transition-colors outline-none cursor-pointer"
                    >
                        <ChevronRight size={12} />
                    </button>
                </div>
            </div>
            <div className="flex-1 flex flex-col justify-center items-center">
                {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center w-full">No Records Found</p>
                ) : (
                    <div className="w-full text-xs text-text-primary">
                        {items[idx]}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CarouselCard;
