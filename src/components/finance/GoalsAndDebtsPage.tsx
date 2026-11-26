import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calculator,
  Calendar,
  Check,
  CheckCircle2,
  HandCoins,
  Minus,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { EmptyStatePlaceholder } from '../ui/Skeleton';
import { Currency, DebtDirection, DebtItem, SavingsGoal } from '../../types';
import {
  ARMENIAN_MONTHS,
  formatMoney,
  formatShortDate,
  getTodayISO,
} from '../../data/defaults';
import { daysBetweenISO } from '../../utils/financialCycle';

interface GoalsAndDebtsPageProps {
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
  debts: DebtItem[];
  onOpenNewDebtModal: () => void;
  onEditDebt: (debt: DebtItem) => void;
  onRecordDebtPayment: (
    debtId: string,
    amount: number,
    recordInLedger: boolean
  ) => void;
  onDeleteDebt: (debtId: string) => void;
}

const GOAL_QUICK_PRESETS = [5000, 10000, 25000, 50000];

export function GoalsAndDebtsPage({
  currency,
  savingsGoals,
  onOpenNewGoalModal,
  onEditGoal,
  onAdjustGoal,
  onDeleteGoal,
  debts,
  onOpenNewDebtModal,
  onEditDebt,
  onRecordDebtPayment,
  onDeleteDebt,
}: GoalsAndDebtsPageProps) {
  const todayISO = getTodayISO();

  const [debtFilter, setDebtFilter] = useState<
    'all' | DebtDirection | 'settled'
  >('all');

  // Lightweight modal for Goal top-up / withdraw
  const [goalActionModal, setGoalActionModal] = useState<{
    goal: SavingsGoal;
    mode: 'add' | 'withdraw';
  } | null>(null);
  const [goalActionAmount, setGoalActionAmount] = useState('');
  const [goalRecordLedger, setGoalRecordLedger] = useState(true);

  // Lightweight modal for Debt partial / full payment
  const [debtPayModal, setDebtPayModal] = useState<DebtItem | null>(null);
  const [debtPayAmount, setDebtPayAmount] = useState('');
  const [debtRecordLedger, setDebtRecordLedger] = useState(true);
  const [monthlyPace, setMonthlyPace] = useState<number>(50000);

  const totalSavedInGoals = useMemo(
    () => savingsGoals.reduce((sum, g) => sum + g.currentAmount, 0),
    [savingsGoals]
  );
  const totalTargetInGoals = useMemo(
    () => savingsGoals.reduce((sum, g) => sum + g.targetAmount, 0),
    [savingsGoals]
  );

  const debtTotals = useMemo(() => {
    let activeLent = 0;
    let activeBorrowed = 0;
    for (const d of debts) {
      if (d.settled) continue;
      const rem = Math.max(0, d.totalAmount - d.paidAmount);
      if (d.direction === 'lent') activeLent += rem;
      else activeBorrowed += rem;
    }
    return {
      activeLent,
      activeBorrowed,
      netPosition: activeLent - activeBorrowed,
    };
  }, [debts]);

  const activeGoalsNeedTotal = useMemo(
    () =>
      savingsGoals.reduce(
        (sum, g) => sum + Math.max(0, g.targetAmount - g.currentAmount),
        0
      ),
    [savingsGoals]
  );

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

  const filteredDebts = useMemo(() => {
    return [...debts]
      .filter((d) => {
        if (debtFilter === 'settled') return d.settled;
        if (debtFilter === 'lent') return !d.settled && d.direction === 'lent';
        if (debtFilter === 'borrowed')
          return !d.settled && d.direction === 'borrowed';
        return true;
      })
      .sort((a, b) => {
        if (a.settled !== b.settled) return Number(a.settled) - Number(b.settled);
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [debts, debtFilter]);

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

  const openDebtPayment = (debt: DebtItem) => {
    const remaining = Math.max(1, debt.totalAmount - debt.paidAmount);
    setDebtPayModal(debt);
    setDebtPayAmount(String(remaining));
    setDebtRecordLedger(true);
  };

  const submitDebtPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtPayModal) return;
    const amt = Math.round(Number(debtPayAmount));
    if (!amt || amt <= 0) return;
    onRecordDebtPayment(debtPayModal.id, amt, debtRecordLedger);
    setDebtPayModal(null);
    setDebtPayAmount('');
  };

  return (
    <div className="space-y-6">
      {/* SECTION 1: SAVINGS GOALS ("Գանձանակներ") */}
      <section className="surface-card overflow-hidden">
        <div className="px-5 py-4 sm:px-6 border-b border-[#E2E8F0] dark:border-[#1E293B] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <PiggyBank className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Խնայողության նպատակներ (Գանձանակներ)
              </h2>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                Կուտակված՝{' '}
                <strong className="pa-sensitive font-mono text-emerald-600 dark:text-emerald-400">
                  {formatMoney(totalSavedInGoals, currency)}
                </strong>{' '}
                {totalTargetInGoals > 0 && (
                  <span className="pa-sensitive">
                    / {formatMoney(totalTargetInGoals, currency)} նպատակից
                  </span>
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenNewGoalModal}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl btn-primary text-xs font-semibold inline-flex items-center gap-1.5 self-start sm:self-auto whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Նոր նպատակ</span>
          </button>
        </div>

        {savingsGoals.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyStatePlaceholder
              compact
              icon={PiggyBank}
              title="Խնայողության նպատակներ դեռ չկան"
              description="Ստեղծեք գանձանակ անվտանգության պահուստի, տեխնիկայի կամ ճամփորդության համար։"
              actionLabel="+ Ստեղծել նպատակ"
              onAction={onOpenNewGoalModal}
            />
          </div>
        ) : (
          <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {savingsGoals.map((goal) => {
              const pct = Math.min(
                100,
                Math.round((goal.currentAmount / Math.max(1, goal.targetAmount)) * 100)
              );
              const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
              const isDone = goal.completed || goal.currentAmount >= goal.targetAmount;
              const daysLeft = goal.deadline
                ? daysBetweenISO(todayISO, goal.deadline)
                : null;

              return (
                <div
                  key={goal.id}
                  className={`rounded-2xl border p-4 flex flex-col justify-between gap-4 transition-colors ${
                    isDone
                      ? 'border-emerald-500/40 bg-emerald-500/[0.04]'
                      : 'border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120]'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {goal.category && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#EFF6FF] dark:bg-[#172554] text-[#2563EB] dark:text-[#60A5FA]">
                              {goal.category}
                            </span>
                          )}
                          {isDone && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="w-3 h-3" />
                              Կատարված
                            </span>
                          )}
                        </div>
                        <h3 className="mt-1 font-display text-sm sm:text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC] break-words">
                          {goal.title}
                        </h3>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onEditGoal(goal)}
                          aria-label={`Խմբագրել ${goal.title}`}
                          className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-white dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
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

                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2 tabular-nums">
                        <span className="text-base font-bold font-mono text-[#0F172A] dark:text-[#F8FAFC]">
                          {formatMoney(goal.currentAmount, currency)}
                        </span>
                        <span className="text-xs font-mono text-[#64748B] dark:text-[#94A3B8]">
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
                        <span>
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

                  <div className="flex items-center gap-2 pt-2 border-t border-[#E2E8F0] dark:border-[#1E293B]">
                    <button
                      type="button"
                      onClick={() => openGoalAction(goal, 'add')}
                      className="flex-1 min-h-[34px] px-3 py-1.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] dark:bg-[#3B82F6] dark:hover:bg-[#60A5FA] text-white dark:text-[#060B16] text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Համալրել</span>
                    </button>
                    {goal.currentAmount > 0 && (
                      <button
                        type="button"
                        onClick={() => openGoalAction(goal, 'withdraw')}
                        className="min-h-[34px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-xs font-medium text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB] inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                        <span>Հանել</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 1.5: PAYOFF & SAVINGS FORECASTER */}
      {(activeGoalsNeedTotal > 0 || debtTotals.activeBorrowed > 0) && (
        <section className="surface-card p-5 sm:p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-[#EFF6FF] dark:bg-[#172554] text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
                <Calculator className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  Կուտակման և պարտքերի մարման հաշվիչ
                </h2>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  Ընտրեք ամսական հատկացումը՝ տեսնելու մոտավոր ավարտի ամիսը
                </p>
              </div>
            </div>

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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeGoalsNeedTotal > 0 && (
              <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] p-4 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                    Բոլոր գանձանակների լրացում
                  </span>
                  <span className="pa-sensitive font-mono text-[#64748B] dark:text-[#94A3B8]">
                    մնացել է {formatMoney(activeGoalsNeedTotal, currency)}
                  </span>
                </div>
                {(() => {
                  const months = Math.max(
                    1,
                    Math.ceil(activeGoalsNeedTotal / Math.max(1, monthlyPace))
                  );
                  return (
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      ~{months} ամիս · Ավարտ՝ {formatProjectedMonth(months)}
                    </p>
                  );
                })()}
              </div>
            )}

            {debtTotals.activeBorrowed > 0 && (
              <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] p-4 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                    Վերցված պարտքերի լրիվ մարում
                  </span>
                  <span className="pa-sensitive font-mono text-[#64748B] dark:text-[#94A3B8]">
                    մնացել է {formatMoney(debtTotals.activeBorrowed, currency)}
                  </span>
                </div>
                {(() => {
                  const months = Math.max(
                    1,
                    Math.ceil(
                      debtTotals.activeBorrowed / Math.max(1, monthlyPace)
                    )
                  );
                  return (
                    <p className="text-sm font-semibold text-[#2563EB] dark:text-[#60A5FA] tabular-nums">
                      ~{months} ամիս · Ավարտ՝ {formatProjectedMonth(months)}
                    </p>
                  );
                })()}
              </div>
            )}
          </div>
        </section>
      )}

      {/* SECTION 2: DEBTS & IOUs ("Պարտքեր և փոխառություններ") */}
      <section className="surface-card overflow-hidden">
        <div className="px-5 py-4 sm:px-6 border-b border-[#E2E8F0] dark:border-[#1E293B] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <HandCoins className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Պարտքեր և փոխառություններ
              </h2>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                Հետևեք տված և վերցված գումարներին, մասնակի մարումներին ու ժամկետներին
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenNewDebtModal}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl btn-primary text-xs font-semibold inline-flex items-center gap-1.5 self-start lg:self-auto whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Նոր պարտք / փոխառություն</span>
          </button>
        </div>

        {/* 3 Debt Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#E2E8F0] dark:divide-[#1E293B] border-b border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC]/70 dark:bg-[#0B1120]/60">
          <div className="px-5 py-3.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                Ինձ են պարտք (ակտիվ)
              </p>
              <p className="pa-sensitive mt-0.5 text-base font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                +{formatMoney(debtTotals.activeLent, currency)}
              </p>
            </div>
            <ArrowDownLeft className="w-4 h-4 text-emerald-500 shrink-0" />
          </div>

          <div className="px-5 py-3.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                Ես եմ պարտք (ակտիվ)
              </p>
              <p className="pa-sensitive mt-0.5 text-base font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400">
                -{formatMoney(debtTotals.activeBorrowed, currency)}
              </p>
            </div>
            <ArrowUpRight className="w-4 h-4 text-rose-500 shrink-0" />
          </div>

          <div className="px-5 py-3.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                Զուտ պարտքային դիրք
              </p>
              <p
                className={`mt-0.5 text-base font-bold font-mono tabular-nums ${
                  debtTotals.netPosition >= 0
                    ? 'text-[#0F172A] dark:text-[#F8FAFC]'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {debtTotals.netPosition > 0 ? '+' : ''}
                {formatMoney(debtTotals.netPosition, currency)}
              </p>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="px-5 py-3 border-b border-[#E2E8F0] dark:border-[#1E293B] flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl surface-subtle">
            {(
              [
                { id: 'all', label: 'Բոլորը' },
                { id: 'lent', label: 'Ինձ են պարտք' },
                { id: 'borrowed', label: 'Պարտք եմ' },
                { id: 'settled', label: 'Մարված' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDebtFilter(tab.id)}
                className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  debtFilter === tab.id
                    ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                    : 'text-[#64748B] dark:text-[#94A3B8]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredDebts.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyStatePlaceholder
              compact
              icon={HandCoins}
              title={
                debts.length === 0
                  ? 'Գրանցված պարտքեր կամ փոխառություններ չկան'
                  : 'Ընտրված զտիչով գրառումներ չկան'
              }
              description={
                debts.length === 0
                  ? 'Գրանցեք ընկերներին տված կամ վերցված գումարները՝ հիշեցումներ ստանալու համար։'
                  : 'Փոխեք զտիչը՝ մյուս գրառումները տեսնելու համար։'
              }
              actionLabel={
                debts.length === 0 ? '+ Ավելացնել գրառում' : 'Ցույց տալ բոլորը'
              }
              onAction={
                debts.length === 0
                  ? onOpenNewDebtModal
                  : () => setDebtFilter('all')
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
            {filteredDebts.map((debt) => {
              const remaining = Math.max(0, debt.totalAmount - debt.paidAmount);
              const pct = Math.min(
                100,
                Math.round((debt.paidAmount / Math.max(1, debt.totalAmount)) * 100)
              );
              const isLent = debt.direction === 'lent';
              const isOverdue =
                !debt.settled && Boolean(debt.dueDate) && debt.dueDate! < todayISO;

              return (
                <div
                  key={debt.id}
                  className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 hover:bg-[#F8FAFC] dark:hover:bg-[#162033] transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span
                      className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        debt.settled
                          ? 'bg-[#F1F5F9] dark:bg-[#1E293B] text-[#64748B]'
                          : isLent
                            ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {isLent ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                          {debt.person}
                        </p>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            debt.settled
                              ? 'bg-[#E2E8F0] dark:bg-[#1E293B] text-[#64748B] dark:text-[#94A3B8]'
                              : isLent
                                ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                                : 'bg-rose-500/12 text-rose-700 dark:text-rose-300'
                          }`}
                        >
                          {debt.settled
                            ? 'Մարված է'
                            : isLent
                              ? 'Ինձ է պարտք'
                              : 'Պարտք եմ'}
                        </span>
                        {debt.dueDate && (
                          <span
                            className={`text-[11px] font-mono tabular-nums ${
                              isOverdue
                                ? 'text-rose-600 dark:text-rose-400 font-semibold'
                                : 'text-[#64748B] dark:text-[#94A3B8]'
                            }`}
                          >
                            Ժամկետ՝ {formatShortDate(debt.dueDate)}
                            {isOverdue ? ' (ուշացած)' : ''}
                          </span>
                        )}
                      </div>

                      {debt.note && (
                        <p className="text-xs text-[#64748B] dark:text-[#94A3B8] break-words">
                          {debt.note}
                        </p>
                      )}

                      <div className="flex items-center gap-3 max-w-sm">
                        <div className="flex-1 h-1.5 rounded-full bg-[#E2E8F0] dark:bg-[#1E293B] overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              debt.settled
                                ? 'bg-emerald-500'
                                : isLent
                                  ? 'bg-emerald-500'
                                  : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.max(4, pct)}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8]">
                          {pct}% ({formatMoney(debt.paidAmount, currency)} /{' '}
                          {formatMoney(debt.totalAmount, currency)})
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pl-12 sm:pl-0">
                    <div className="text-left sm:text-right mr-1">
                      <span className="block text-[10px] text-[#64748B] dark:text-[#94A3B8]">
                        {debt.settled ? 'Ընդամենը' : 'Մնացորդ'}
                      </span>
                      <span
                        className={`text-sm font-bold font-mono tabular-nums ${
                          debt.settled
                            ? 'text-[#64748B] dark:text-[#94A3B8] line-through'
                            : isLent
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {formatMoney(
                          debt.settled ? debt.totalAmount : remaining,
                          currency
                        )}
                      </span>
                    </div>

                    {!debt.settled && (
                      <button
                        type="button"
                        onClick={() => openDebtPayment(debt)}
                        className="min-h-[34px] px-3 py-1.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] dark:bg-[#3B82F6] dark:hover:bg-[#60A5FA] text-white dark:text-[#060B16] text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Վճարում</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onEditDebt(debt)}
                      aria-label={`Խմբագրել ${debt.person}`}
                      className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#E2E8F0]/60 dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteDebt(debt.id)}
                      aria-label={`Ջնջել ${debt.person}`}
                      className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Lightweight Goal Top-Up / Withdraw Dialog */}
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

      {/* Lightweight Debt Repayment Dialog */}
      {debtPayModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#020617]/65 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDebtPayModal(null);
          }}
        >
          <form
            onSubmit={submitDebtPayment}
            className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                {debtPayModal.direction === 'lent'
                  ? `Վերադարձ · ${debtPayModal.person}`
                  : `Մարում · ${debtPayModal.person}`}
              </h3>
              <button
                type="button"
                onClick={() => setDebtPayModal(null)}
                aria-label="Փակել"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-[#64748B] dark:text-[#94A3B8]">
                  Վճարման գումար (֏)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setDebtPayAmount(
                      String(
                        Math.max(0, debtPayModal.totalAmount - debtPayModal.paidAmount)
                      )
                    )
                  }
                  className="text-[#2563EB] dark:text-[#60A5FA] font-semibold hover:underline cursor-pointer tabular-nums"
                >
                  Ամբողջ մնացորդը (
                  {formatMoney(
                    Math.max(0, debtPayModal.totalAmount - debtPayModal.paidAmount),
                    currency
                  )}
                  )
                </button>
              </div>
              <input
                type="number"
                min="1"
                max={Math.max(1, debtPayModal.totalAmount - debtPayModal.paidAmount)}
                step="any"
                value={debtPayAmount}
                onChange={(e) => setDebtPayAmount(e.target.value)}
                autoFocus
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
              />
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] cursor-pointer">
              <input
                type="checkbox"
                checked={debtRecordLedger}
                onChange={(e) => setDebtRecordLedger(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded cursor-pointer"
              />
              <span className="text-xs text-[#475569] dark:text-[#CBD5E1] leading-snug">
                {debtPayModal.direction === 'lent'
                  ? 'Գրանցել որպես եկամուտ գործարքների մատյանում'
                  : 'Գրանցել որպես ծախս գործարքների մատյանում'}
              </span>
            </label>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDebtPayModal(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] text-xs font-medium text-[#475569] dark:text-[#CBD5E1] cursor-pointer"
              >
                Չեղարկել
              </button>
              <button
                type="submit"
                className="min-h-[40px] px-4 py-2 rounded-xl btn-primary text-xs font-semibold"
              >
                Հաստատել վճարումը
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
