import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, RefreshCw, Search, Globe } from 'lucide-react';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import GlassCard from '@/components/ui/GlassCard';
import { useApiCollections } from '@/hooks/use-discovery';
import { useQueryClient } from '@tanstack/react-query';

const methodColors: Record<string, string> = {
  GET: '#22C55E', POST: '#632CA6', PUT: '#3B82F6', PATCH: '#8B5CF6', DELETE: '#EF4444',
};

const ApiTree: React.FC = () => {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useApiCollections();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const collections = data?.apiCollections ?? [];

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search collections..."
            className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border-subtle bg-bg-base text-text-primary placeholder-text-muted outline-none focus:border-brand/30 w-56 transition-all"
          />
        </div>
        <button onClick={() => qc.invalidateQueries({ queryKey: ['discovery', 'collections'] })} className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand transition-all outline-none">
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {isError && <QueryError message="Failed to load API tree" onRetry={() => refetch()} />}

      <GlassCard variant="default" className="p-4">
        {isLoading ? <TableSkeleton columns={2} rows={4} /> : (
          <>
            {collections.length === 0 && (
              <div className="text-center py-12">
                <Globe size={32} className="mx-auto mb-3 text-text-muted" />
                <p className="text-xs text-text-muted">No API collections found. Connect a traffic source to populate the tree.</p>
              </div>
            )}
            <div className="space-y-0.5">
              {collections
                .filter(col => !searchQuery || (col.hostName || col.displayName || '').toLowerCase().includes(searchQuery.toLowerCase()))
                .map((col) => {
                  const isOpen = expanded.has(col.id);
                  const name = col.hostName || col.displayName || `Collection ${col.id}`;
                  const urlCount = col.urlsCount ?? 0;

                  return (
                    <div key={col.id}>
                      <button
                        onClick={() => toggleExpand(col.id)}
                        className="w-full flex items-center gap-2 py-2.5 px-3 rounded-lg text-left hover:bg-black/[0.03] transition-all group"
                      >
                        <span className="text-text-muted transition-transform duration-200" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                          <ChevronRight size={14} />
                        </span>
                        {isOpen ? (
                          <FolderOpen size={16} className="text-brand shrink-0" />
                        ) : (
                          <Folder size={16} className="text-brand shrink-0" />
                        )}
                        <span className="text-sm font-medium text-text-primary flex-1">{name}</span>
                        <span className="text-[10px] tabular-nums font-semibold text-text-muted bg-bg-elevated px-2 py-0.5 rounded-full border border-border-subtle">
                          {urlCount} endpoints
                        </span>
                        {/* Risk indicator */}
                        <div className="w-2 h-2 rounded-full bg-sev-low" title="Low risk" />
                      </button>

                      {/* Expanded content - mock endpoints */}
                      {isOpen && (
                        <div className="ml-10 pl-3 border-l border-border-subtle space-y-0.5 pb-2 animate-fade-in">
                          {urlCount > 0 ? (
                            <p className="text-[11px] text-text-muted py-2 px-2">
                              {urlCount} endpoints in this collection. View details in API Catalogue.
                            </p>
                          ) : (
                            <p className="text-[11px] text-text-muted py-2 px-2">No endpoints discovered yet.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </GlassCard>
    </div>
  );
};

export default ApiTree;
