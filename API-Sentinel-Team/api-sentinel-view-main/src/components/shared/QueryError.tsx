import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface QueryErrorProps {
  message?: string;
  onRetry?: () => void;
}

const QueryError: React.FC<QueryErrorProps> = ({
  message = 'Failed to load data',
  onRetry,
}) => (
  <div className="flex flex-col items-center justify-center gap-3 py-12">
    <AlertCircle className="h-6 w-6 text-[#EF4444]" />
    <p className="text-xs text-muted-foreground">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-surface px-3 py-1.5 text-[11px] text-text-primary hover:bg-bg-hover transition-colors"
      >
        <RefreshCw className="h-3 w-3" />
        Retry
      </button>
    )}
  </div>
);

export default QueryError;
