import React from 'react';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  confirmReset: boolean;
}

const APP_STORAGE_KEYS = [
  'pa_primary_income',
  'pa_transactions',
  'pa_cards',
  'pa_tasks',
  'pa_notes',
  'pa_budgets',
  'pa_recurring_bills',
  'pa_habits',
  'pa_savings_goals',
  'pa_debts',
  'pa_focus_sessions',
  'pa_focus_goal',
  'pa_notification_settings',
  'pa_notif_snoozed',
  'pa_finance_active_page',
  'pa_planner_active_page',
  'pa_privacy_mode',
  'pa_theme_dark',
];

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '', confirmReset: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Անսպասելի սխալ տեղի ունեցավ։',
      confirmReset: false,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App ErrorBoundary caught error:', error, info);
  }

  handleClearLocalCache = () => {
    try {
      APP_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // Ignore storage removal errors
    }
    window.location.reload();
  };

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
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl btn-primary text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Թարմացնել էջը</span>
              </button>

              {!this.state.confirmReset ? (
                <button
                  type="button"
                  onClick={() => this.setState({ confirmReset: true })}
                  className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] text-xs font-medium text-[#475569] dark:text-[#CBD5E1] hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-400 inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Մաքրել քեշը</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={this.handleClearLocalCache}
                  className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Հաստատել մաքրումը</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
