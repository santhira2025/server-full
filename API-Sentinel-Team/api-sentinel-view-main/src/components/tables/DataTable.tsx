import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Filter } from 'lucide-react';

interface DataTableProps<T> {
  data: T[];
  columns: Array<{
    key: string;
    header: string;
    render?: (item: T) => React.ReactNode;
    sortable?: boolean;
  }>;
  selectable?: boolean;
  pageSize?: number;
}

function DataTable<T extends { id: string }>({ data, columns, selectable = true, pageSize = 10 }: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const av = (a as any)[sortKey];
        const bv = (b as any)[sortKey];
        const cmp = String(av).localeCompare(String(bv));
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : data;

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, sorted.length);

  const toggleAll = () => {
    if (selected.size === paged.length) setSelected(new Set());
    else setSelected(new Set(paged.map((d) => d.id)));
  };

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              {selectable && (
                <th className="w-10 px-3 py-3">
                  <input type="checkbox" checked={selected.size === paged.length && paged.length > 0} onChange={toggleAll} className="rounded border-border" />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground"
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.header}
                    {col.sortable !== false && sortKey === col.key && (
                      <span className="text-primary">{sortDir === 'asc' ? '^' : 'v'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((item) => (
              <tr key={item.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                {selectable && (
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => {
                        const next = new Set(selected);
                        next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                        setSelected(next);
                      }}
                      className="rounded border-border"
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2.5 text-foreground whitespace-nowrap">
                    {col.render ? col.render(item) : String((item as any)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-3 py-8 text-center text-muted-foreground">
                  No data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
            <Download className="h-3.5 w-3.5" /> Download
          </button>
          <button className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
            <Filter className="h-3.5 w-3.5" /> Filter
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Items <select className="ml-1 rounded border border-border bg-secondary px-1.5 py-0.5 text-foreground text-xs"><option>{pageSize}</option></select></span>
          <span>{start} - {end} of {sorted.length}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="rounded p-1 hover:bg-secondary/50 disabled:opacity-30">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="rounded p-1 hover:bg-secondary/50 disabled:opacity-30">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DataTable;
