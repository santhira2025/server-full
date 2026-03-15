import React, { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="flex flex-col items-center gap-4 rounded-xl border border-border-subtle bg-bg-base p-8">
            <AlertTriangle className="h-8 w-8 text-brand" />
            <h2 className="text-lg font-semibold text-text-primary">Something went wrong</h2>
            <p className="max-w-md text-center text-xs text-muted-foreground">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={this.handleRetry}
              className="mt-2 flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-4 py-2 text-xs font-medium text-brand hover:bg-brand/20 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
