import { AlertTriangle } from 'lucide-react';
import * as React from 'react';
import { Button } from './button';

interface State {
  error: Error | null;
}

/**
 * Last line of defence: a render error in one page must not blank the whole
 * app. Async and data errors are handled closer to where they happen.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="bg-destructive/10 flex size-12 items-center justify-center rounded-full">
          <AlertTriangle className="text-destructive size-6" aria-hidden />
        </span>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Something broke on this page</h1>
          <p className="text-muted-foreground max-w-md text-sm">{this.state.error.message}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
          <Button onClick={() => window.location.assign('/')}>Back to dashboard</Button>
        </div>
      </div>
    );
  }
}
