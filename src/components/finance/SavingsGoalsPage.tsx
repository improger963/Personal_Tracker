import React, { useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  Calendar,
  CheckCircle2,
  Minus,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  MetricStrip,
  PageHeader,
  PageShell,
  SectionCard,
} from '../layout/PagePrimitives';
import { EmptyStatePlaceholder } from '../ui/Skeleton';
import { Currency, SavingsGoal } from '../../types';
import {
  ARMENIAN_MONTHS,
  formatMoney,
  formatShortDate,
  getTodayISO,
} from '../../data/defaults';
import { daysBetweenISO } from '../../utils/financialCycle';

interface SavingsGoalsPageProps {
  currency: Currency;
  savingsGoals: SavingsGoal[];
  onOpenNewGoalModal: () => void;
  onEditGoal: (goal: SavingsGoal) => void;
  onAdjustGoal: (
    goalId: string,
    delta: number,
    recordInLedger: boolean
  ) => void;
  onDeleteGoal: (goalId: string) => void;
}

const GOAL_QUICK_PRESETS = [5000, 10000, 25000, 50000];

export function SavingsGoalsPage({
  currency,
  savingsGoals,
  onOpenNewGoalModal,
  onEditGoal,
  onAdjustGoal,
  onDeleteGoal,
}: SavingsGoalsPageProps) {
  const todayISO = getTodayISO();

  const [goalActionModal, setGoalActionModal] = useState<{
    goal: SavingsGoal;
    mode: 'add' | 'withdraw';
  } | null>(null);
  const [goalActionAmount, setGoalActionAmount] = useState('');
  const [goalRecordLedger, setGoalRecordLedger] = useState(true);
  const [monthlyPace, setMonthlyPace] = useState<number>(50000);

  useEffect(() => {
    if (!goalActionModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGoalActionModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goalActionModal]);

  const {
    totalSavedInGoals,
    totalTargetInGoals,
    activeGoalsCount,
    completedGoalsCount,
    activeGoalsNeedTotal,
  } = useMemo(() => {
    const saved = savingsGoals.reduce((sum, g) => sum + g.currentAmount, 0);
    const target = savingsGoals.reduce((sum, g) => sum + g.targetAmount, 0);
    const completed = savingsGoals.filter(
      (g) => g.completed || g.currentAmount >= g.targetAmount
    ).length;
    const need = savingsGoals.reduce(
      (sum, g) => sum + Math.max(0, g.targetAmount - g.currentAmount),
      0
    );
    return {
      totalSavedInGoals: saved,
      totalTargetInGoals: target,
      activeGoalsCount: Math.max(0, savingsGoals.length - completed),
      completedGoalsCount: completed,
      activeGoalsNeedTotal: need,
    };
  }, [savingsGoals]);

  const formatProjectedMonth = (monthsAhead: number) => {
    const now = new Date();
    const target = new Date(
      now.getFullYear(),
      now.getMonth() + monthsAhead,
      1
    );
    const mName = ARMENIAN_MONTHS[target.getMonth()] ?? '';
    return `${mName} ${target.getFullYear()}`;
  };

  const openGoalAction = (goal: SavingsGoal, mode: 'add' | 'withdraw') => {
    setGoalActionModal({ goal, mode });
    setGoalActionAmount('10000');
    setGoalRecordLedger(true);
  };

  const submitGoalAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalActionModal) return;
    const raw = Math.round(Number(goalActionAmount));
    if (!raw || raw <= 0) return;
    const delta = goalActionModal.mode === 'add' ? raw : -raw;
    onAdjustGoal(goalActionModal.goal.id, delta, goalRecordLedger);
    setGoalActionModal(null);
    setGoalActionAmount('');
  };

  const overallPct =
    totalTargetInGoals > 0
      ? Math.min(100, Math.round((totalSavedInGoals / totalTargetInGoals) * 100))
      : 0;

  return (
    <PageShell>
      <PageHeader
        title="Խնայողության նպատակներ (Գանձանակներ)"
        subtitle="Սահմանեք նպատակներ, կատարեք համալրումներ և կանխատեսեք հավաքման ժամկետները"
        actions={
          <button
            type="button"
            onClick={onOpenNewGoalModal}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl btn-primary text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Նոր նպատակ</span>
          </button>
        }
      />

      <MetricStrip
        items={[
          {
            id: 'goals-saved',
            label: 'Կուտակված գումար',
            value: formatMoney(totalSavedInGoals, currency),
            hint: `${overallPct}% ընդհանուր թիրախից`,
            tone: 'positive',
            sensitive: true,
          },
          {
            id: 'goals-target',
            label: 'Ընդհանուր թիրախ',
            value: formatMoney(totalTargetInGoals, currency),
            hint: `Մնաց՝ ${formatMoney(activeGoalsNeedTotal, currency)}`,
            sensitive: true,
          },
          {
            id: 'goals-active',
            label: 'Ակտիվ նպատակներ',
            value: String(activeGoalsCount),
            hint: `Ընդամենը ${savingsGoals.length} գանձանակ`,
            tone: 'accent',
          },
          {
            id: 'goals-done',
            label: 'Կատարված նպատակներ',
            value: String(completedGoalsCount),
            hint: completedGoalsCount > 0 ? 'Լիովին հավաքված' : 'Ընթացքում են',
            tone: completedGoalsCount > 0 ? 'positive' : 'default',
          },
        ]}
      />

      {/* Goals Grid */}
      {savingsGoals.length === 0 ? (
        <SectionCard>
          <EmptyStatePlaceholder
            compact
            icon={PiggyBank}
            title="Խնայողության նպատակներ դեռ չկան"
            description="Ստեղծեք գանձանակ անվտանգության պահուստի, տեխնիկայի կամ ճամփորդության համար։"
            actionLabel="+ Ստեղծել նպատակ"
            onAction={onOpenNewGoalModal}
          />
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {savingsGoals.map((goal) => {
            const pct = Math.min(
              100,
              Math.round(
                (goal.currentAmount / Math.max(1, goal.targetAmount)) * 100
              )
            );
            const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
            const isDone =
              goal.completed || goal.currentAmount >= goal.targetAmount;
            const daysLeft = goal.deadline
              ? daysBetweenISO(todayISO, goal.deadline)
              : null;

            return (
              <article
                key={goal.id}
                className={`surface-card p-5 flex flex-col justify-between gap-4 ${
                  isDone ? 'border-emerald-500/40 dark:border-emerald-500/35' : ''
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {(goal.category || isDone) && (
                        <p className="text-[11px] font-semibold flex items-center gap-1.5 flex-wrap">
                          {goal.category && (
                            <span className="text-[#2563EB] dark:text-[#60A5FA]">
                              {goal.category}
                            </span>
                          )}
                          {goal.category && isDone && (
                            <span className="text-[#94A3B8]" aria-hidden="true">
                              ·
                            </span>
                          )}
                          {isDone && (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" />
                              Կատարված
                            </span>
                          )}
                        </p>
                      )}
                      <h2 className="mt-0.5 font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC] break-words">
                        {goal.title}
                      </h2>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onEditGoal(goal)}
                        aria-label={`Խմբագրել ${goal.title}`}
                        className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteGoal(goal.id)}
                        aria-label={`Ջնջել ${goal.title}`}
                        className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2 tabular-nums">
                      <span className="pa-sensitive text-lg font-bold font-mono text-[#0F172A] dark:text-[#F8FAFC]">
                        {formatMoney(goal.currentAmount, currency)}
                      </span>
                      <span className="pa-sensitive text-xs font-mono text-[#64748B] dark:text-[#94A3B8]">
                        / {formatMoney(goal.targetAmount, currency)} ({pct}%)
                      </span>
                    </div>

                    <div className="h-2 w-full rounded-full bg-[#E2E8F0] dark:bg-[#1E293B] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isDone ? 'bg-emerald-500' : 'bg-[#2563EB] dark:bg-[#3B82F6]'
                        }`}
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                      <span className="pa-sensitive">
                        {remaining > 0
                          ? `Մնացել է ${formatMoney(remaining, currency)}`
                          : 'Նպատակը ամբողջությամբ հավաքված է'}
                      </span>
                      {goal.deadline && (
                        <span
                          className={`inline-flex items-center gap-1 ${
                            daysLeft !== null && daysLeft < 0 && !isDone
                              ? 'text-rose-600 dark:text-rose-400 font-semibold'
                              : ''
                          }`}
                        >
                          <Calendar className="w-3 h-3" />
                          {formatShortDate(goal.deadline)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-[#E2E8F0] dark:border-[#1E293B]">
                  <button
                    type="button"
                    onClick={() => openGoalAction(goal, 'add')}
                    className="flex-1 min-h-[36px] px-3 py-1.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] dark:bg-[#3B82F6] dark:hover:bg-[#60A5FA] text-white dark:text-[#060B16] text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Համալրել</span>
                  </button>
                  {goal.currentAmount > 0 && (
                    <button
                      type="button"
                      onClick={() => openGoalAction(goal, 'withdraw')}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-xs font-medium text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB] inline-flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                      <span>Հանել</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Savings Forecaster */}
      {activeGoalsNeedTotal > 0 && (
        <SectionCard
          title="Կուտակման տեմպի հաշվիչ"
          subtitle="Ընտրեք ամսական հատկացումը՝ տեսնելու բոլոր գանձանակների լրացման մոտավոր ժամկետը"
          icon={Calculator}
          headerRight={
            <div className="flex flex-wrap items-center gap-1.5">
              {[25000, 50000, 100000, 150000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setMonthlyPace(preset)}
                  className={`min-h-[34px] px-2.5 py-1 rounded-xl border text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                    monthlyPace === preset
                      ? 'border-[#2563EB] bg-[#EFF6FF] dark:bg-[#172554] text-[#1D4ED8] dark:text-[#60A5FA] font-semibold'
                      : 'border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB]'
                  }`}
                >
                  {formatMoney(preset, currency)}
                </button>
              ))}
              <input
                type="number"
                min="1000"
                step="5000"
                value={monthlyPace}
                onChange={(e) =>
                  setMonthlyPace(Math.max(1000, Number(e.target.value) || 0))
                }
                aria-label="Ամսական հատկացում"
                className="w-28 min-h-[34px] px-2.5 py-1 text-xs font-mono tabular-nums rounded-xl input-field"
              />
            </div>
          }
        >
          {(() => {
            const months = Math.max(
              1,
              Math.ceil(activeGoalsNeedTotal / Math.max(1, monthlyPace))
            );
            return (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[#475569] dark:text-[#CBD5E1] tabular-nums">
                  Մնացած{' '}
                  <strong className="pa-sensitive font-mono text-[#0F172A] dark:text-[#F8FAFC]">
                    {formatMoney(activeGoalsNeedTotal, currency)}
                  </strong>{' '}
                  գումարը հավաքելու համար կպահանջվի՝
                </p>
                <p className="text-sm sm:text-base font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  ~{months} ամիս · Ավարտ՝ {formatProjectedMonth(months)}
                </p>
              </div>
            );
          })()}
        </SectionCard>
      )}

      {/* Goal Top-Up / Withdraw Dialog */}
      {goalActionModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#020617]/65 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setGoalActionModal(null);
          }}
        >
          <form
            onSubmit={submitGoalAction}
            className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                {goalActionModal.mode === 'add'
                  ? `Համալրել · ${goalActionModal.goal.title}`
                  : `Հանել · ${goalActionModal.goal.title}`}
              </h3>
              <button
                type="button"
                onClick={() => setGoalActionModal(null)}
                aria-label="Փակել"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                Գումար (֏)
              </label>
              <input
                type="number"
                min="1"
                step="any"
                value={goalActionAmount}
                onChange={(e) => setGoalActionAmount(e.target.value)}
                autoFocus
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
              />
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {GOAL_QUICK_PRESETS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setGoalActionAmount(String(amt))}
                    className="min-h-[30px] rounded-lg border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] text-[11px] font-mono tabular-nums text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB] cursor-pointer"
                  >
                    {amt.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] cursor-pointer">
              <input
                type="checkbox"
                checked={goalRecordLedger}
                onChange={(e) => setGoalRecordLedger(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded cursor-pointer"
              />
              <span className="text-xs text-[#475569] dark:text-[#CBD5E1] leading-snug">
                {goalActionModal.mode === 'add'
                  ? 'Գրանցել որպես ծախս գործարքների մատյանում (բալանսից պահում)'
                  : 'Գրանցել որպես վերադարձված եկամուտ մատյանում'}
              </span>
            </label>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setGoalActionModal(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] text-xs font-medium text-[#475569] dark:text-[#CBD5E1] cursor-pointer"
              >
                Չեղարկել
              </button>
              <button
                type="submit"
                className="min-h-[40px] px-4 py-2 rounded-xl btn-primary text-xs font-semibold"
              >
                Հաստատել
              </button>
            </div>
          </form>
        </div>
      )}
    </PageShell>
  );
}
