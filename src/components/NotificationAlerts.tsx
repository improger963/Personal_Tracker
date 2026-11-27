import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  Check,
  Clock,
  Repeat,
  SkipForward,
  Volume2,
  X,
} from 'lucide-react';
import { AppNotificationItem } from '../types';
import { formatMoney } from '../data/defaults';

interface NotificationAlertsProps {
  alerts: AppNotificationItem[];
  onConfirmExpense: (item: AppNotificationItem) => void;
  onSnooze: (id: string, minutes: number) => void;
  onSkipExpense: (item: AppNotificationItem) => void;
  onDismissBanner: (id: string) => void;
  onSpeakAlert?: (item: AppNotificationItem) => void;
}

export function NotificationAlerts({
  alerts,
  onConfirmExpense,
  onSnooze,
  onSkipExpense,
  onDismissBanner,
  onSpeakAlert,
}: NotificationAlertsProps) {
  const visible = alerts.slice(0, 2);
  if (visible.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Ակտիվ ծախսերի և բյուջեի հիշեցումներ"
      className="fixed bottom-[calc(4.35rem+env(safe-area-inset-bottom))] md:bottom-6 right-3 left-3 sm:left-auto sm:right-6 sm:w-[23.5rem] z-40 flex flex-col gap-2.5 pointer-events-none"
    >
      <AnimatePresence mode="popLayout">
        {visible.map((item) => {
          const isOverdue = item.status === 'overdue' || item.kind === 'budget_alert';
          const isBudget = item.kind === 'budget_alert';
          const Icon =
            item.kind === 'daily_expense'
              ? Repeat
              : item.kind === 'planned_expense'
                ? CalendarClock
                : item.kind === 'budget_alert'
                  ? AlertTriangle
                  : BellRing;

          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className={`pointer-events-auto rounded-2xl border bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-md shadow-2xl p-3.5 sm:p-4 space-y-2.5 sm:space-y-3 ${
                isBudget
                  ? 'border-amber-400 dark:border-amber-500/45'
                  : isOverdue
                    ? 'border-rose-300 dark:border-rose-500/40'
                    : 'border-[#BFDBFE] dark:border-[#2563EB]/45'
              }`}
              role="alert"
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isBudget
                        ? 'bg-amber-500/12 text-amber-600 dark:text-amber-400'
                        : isOverdue
                          ? 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
                          : 'bg-[#2563EB]/12 text-[#2563EB] dark:text-[#60A5FA]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                          isBudget
                            ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
                            : isOverdue
                              ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300'
                              : 'bg-[#EFF6FF] dark:bg-[#172554] text-[#1D4ED8] dark:text-[#60A5FA]'
                        }`}
                      >
                        {isBudget
                          ? 'Բյուջեի զգուշացում'
                          : isOverdue
                            ? 'Ուշացած'
                            : 'Հասունացել է'}
                      </span>
                      {item.dueTime && !isBudget && (
                        <span className="text-[11px] font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8]">
                          {item.dueTime}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate mt-1">
                      {item.title}
                    </p>
                    <p
                      className={`text-xs text-[#64748B] dark:text-[#94A3B8] truncate ${
                        isBudget || item.amount !== undefined ? 'pa-sensitive' : ''
                      }`}
                    >
                      {item.subtitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  {onSpeakAlert && (
                    <button
                      type="button"
                      onClick={() => onSpeakAlert(item)}
                      title="Լսել ձայնային ընթերցմամբ"
                      aria-label={`Լսել «${item.title}» ծանուցումը`}
                      className="min-h-[28px] min-w-[28px] flex items-center justify-center rounded-lg text-[#64748B] dark:text-[#94A3B8] hover:text-[#2563EB] dark:hover:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#172554]/60 transition-colors cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDismissBanner(item.id)}
                    aria-label={`Թաքցնել «${item.title}» ծանուցումը`}
                    className="min-h-[28px] min-w-[28px] flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#F1F5F9] dark:border-[#1E293B]">
                <div className="min-w-0">
                  {item.amount !== undefined && (
                    <span className="pa-sensitive text-sm font-mono font-bold tabular-nums text-[#0F172A] dark:text-[#F8FAFC]">
                      {formatMoney(item.amount)}
                    </span>
                  )}
                  {item.category && (
                    <span className="ml-1.5 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                      · {item.category}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {isBudget ? (
                    <button
                      type="button"
                      onClick={() => onDismissBanner(item.id)}
                      className="min-h-[32px] px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                      <span>Հասկանալի է</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onSnooze(item.id, 15)}
                        title="Հետաձգել 15 րոպեով"
                        className="min-h-[32px] px-2 py-1 rounded-lg border border-[#E2E8F0] dark:border-[#26334D] text-[11px] font-medium text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB] dark:hover:border-[#3B82F6] inline-flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Clock className="w-3 h-3" />
                        <span>15ր</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSkipExpense(item)}
                        title="Բաց թողնել այս անգամ"
                        className="min-h-[32px] px-2 py-1 rounded-lg border border-[#E2E8F0] dark:border-[#26334D] text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-300 dark:hover:border-rose-500/40 inline-flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <SkipForward className="w-3 h-3" />
                        <span className="hidden min-[380px]:inline">Բաց թողնել</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onConfirmExpense(item)}
                        className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] dark:bg-[#3B82F6] dark:hover:bg-[#60A5FA] text-white dark:text-[#060B16] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                        <span>Հաստատել</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
