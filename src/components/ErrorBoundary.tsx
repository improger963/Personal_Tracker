import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

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
      message: error?.message || 'Անսպասելի սխալ տեղի ունեցավ։',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh flex items-center justify-center p-6 bg-[#F4F6FA] dark:bg-[#080C14] text-[#0F172A] dark:text-[#F8FAFC]">
          <div className="max-w-md w-full surface-card p-6 space-y-4 text-center">
            <span className="w-12 h-12 rounded-2xl bg-rose-500/12 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </span>
            <div className="space-y-1.5">
              <h1 className="font-display text-lg font-bold">
                Առաջացավ տեխնիկական խնդիր
              </h1>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] break-words">
                Ձեր տեղային տվյալները պահպանված են։ Թարմացրեք էջը՝ շարունակելու համար։
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[40px] px-4 py-2 rounded-xl btn-primary text-sm inline-flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Թարմացնել էջը</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
