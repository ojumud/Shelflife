import React from 'react';
import { RotateCcw } from 'lucide-react';

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

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F6F6F3] text-zinc-900 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
            <h1 className="font-display text-xl font-bold text-zinc-900">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-zinc-600 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 min-h-[44px] px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium inline-flex items-center gap-2 hover:bg-zinc-800 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reload App</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
