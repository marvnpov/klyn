import React from 'react';
import { RotateCcw } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    let displayMsg = 'An unexpected error occurred while rendering klyn.';
    if (error instanceof Error) {
      try {
        const parsed = JSON.parse(error.message) as { error?: string; operationType?: string };
        if (parsed.error) {
          displayMsg = `Cloud sync encountered an issue (${parsed.operationType ?? 'sync'}): ${parsed.error}`;
        } else {
          displayMsg = error.message;
        }
      } catch {
        displayMsg = error.message || displayMsg;
      }
    }
    return { hasError: true, message: displayMsg };
  }

  componentDidCatch(error: unknown): void {
    console.error('klyn ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[100dvh] w-full items-center justify-center bg-[#000000] px-4 text-white">
          <div className="liquid-glass-elevated w-full max-w-md rounded-[32px] border border-white/15 p-6 text-center space-y-4">
            <BrandLogo className="mx-auto h-14 w-14 rounded-2xl border border-white/20 shadow-lg" />
            <div className="space-y-1.5">
              <h1 className="font-display text-xl font-bold text-white">Something went wrong</h1>
              <p className="text-xs leading-relaxed text-white/65">{this.state.message}</p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-black hover:scale-[1.02] active:scale-95 transition-transform"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reload klyn</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
