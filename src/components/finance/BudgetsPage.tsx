import React, { useMemo, useState } from 'react';
import { CalendarDays, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import {
  MetricStrip,
  MonthCycleNav,
  PageHeader,
  PageShell,
  SectionCard,
} from '../layout/PagePrimitives';
import { EmptyStatePlaceholder } from '../ui/Skeleton';
import { BudgetLimit, Currency, PrimaryIncomeConfig } from '../../types';
import {
  EXPENSE_CATEGORIES,
  formatMoney,
  formatShortDate,
} from '../../data/defaults';
import { SafeToSpendMetrics, clampPayday } from '../../utils/financialCycle';

interface CycleDayMetrics {
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  elapsedPct: number;
  isCurrentCycle: boolean;
  isPastCycle: boolean;
  isFutureCycle: boolean;
  startDate: string;
  endDate: string;
  nextStartDate: string;
  daysUntilNextPayday: number;
}

interface BudgetsPageProps {
  selectedMonth: string;
  onShiftMonth: (delta: number) => void;
  effectivePayday: number;
  cycleLabel: string;
  currency: Currency;
  primaryIncome: PrimaryIncomeConfig;
  onSavePrimaryIncome: (
    config: Omit<PrimaryIncomeConfig, 'creditedCycles'>
  ) => void;
  onDisablePrimaryIncome: () => void;
  onManualCreditPrimaryIncome: () => void;
  hasCurrentPrimaryCredited: boolean;
  cycleMetrics: CycleDayMetrics;
  safeToSpend: SafeToSpendMetrics;
  budgets: BudgetLimit[];
  expenseByCategory: Record<string, number>;
  onSaveBudget: (category: string, limit: number) => void;
  onDeleteBudget: (category: string) => void;
}

export function BudgetsPage({
  selectedMonth,
  onShiftMonth,
  effectivePayday,
  cycleLabel,
  currency,
  primaryIncome,
  onSavePrimaryIncome,
  onDisablePrimaryIncome,
  onManualCreditPrimaryIncome,
  hasCurrentPrimaryCredited,
  cycleMetrics,
  safeToSpend,
  budgets,
  expenseByCategory,
  onSaveBudget,
  onDeleteBudget,
}: BudgetsPageProps) {
  const [isEditingPrimary, setIsEditingPrimary] = useState(false);
  const [primaryTitleInput, setPrimaryTitleInput] = useState(
    primaryIncome.title || 'Հիմնական աշխատավարձ'
  );
  const [primaryAmountInput, setPrimaryAmountInput] = useState(
    primaryIncome.amount > 0 ? String(primaryIncome.amount) : ''
  );
  const [primaryPaydayInput, setPrimaryPaydayInput] = useState(
    String(primaryIncome.enabled ? primaryIncome.payday : 10)
  );
  const [primaryAutoCreditInput, setPrimaryAutoCreditInput] = useState(
    primaryIncome.autoCredit
  );
  const [primaryFormError, setPrimaryFormError] = useState('');

  const [budgetCategory, setBudgetCategory] = useState<string>(
    EXPENSE_CATEGORIES[0]
  );
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetError, setBudgetError] = useState('');

  const handleOpenPrimaryEditor = () => {
    setPrimaryTitleInput(primaryIncome.title || 'Հիմնական աշխատավարձ');
    setPrimaryAmountInput(
      primaryIncome.amount > 0 ? String(primaryIncome.amount) : ''
    );
    setPrimaryPaydayInput(
      String(primaryIncome.enabled ? primaryIncome.payday : 10)
    );
    setPrimaryAutoCreditInput(primaryIncome.autoCredit);
    setPrimaryFormError('');
    setIsEditingPrimary(true);
  };

  const handlePrimaryIncomeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = primaryTitleInput.trim();
    const numericAmount = Number(primaryAmountInput);
    const numericDay = Number(primaryPaydayInput);
    if (!trimmedTitle) {
      setPrimaryFormError('Մուտքագրեք հիմնական եկամտի անվանումը։');
      return;
    }
    if (!numericAmount || numericAmount <= 0) {
      setPrimaryFormError('Մուտքագրեք ճիշտ ամսական գումար։');
      return;
    }
    if (!Number.isFinite(numericDay) || numericDay < 1 || numericDay > 31) {
      setPrimaryFormError('Նշեք ամսվա օր 1-ից 31 միջակայքում։');
      return;
    }
    setPrimaryFormError('');
    onSavePrimaryIncome({
      enabled: true,
      title: trimmedTitle,
      amount: numericAmount,
      payday: clampPayday(numericDay),
      autoCredit: primaryAutoCreditInput,
    });
    setIsEditingPrimary(false);
  };

  const handleBudgetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(budgetAmount);
    if (!num || num <= 0) {
      setBudgetError('Մուտքագրեք ճիշտ ամսական սահմանաչափ։');
      return;
    }
    setBudgetError('');
    onSaveBudget(budgetCategory, num);
    setBudgetAmount('');
  };

  const reservedTotal = safeToSpend.reservedBills + safeToSpend.reservedPending;
  const totalBudgetLimit = useMemo(
    () => budgets.reduce((sum, b) => sum + b.limit, 0),
    [budgets]
  );

  return (
    <PageShell>
      <PageHeader
        title="Բյուջե և Ցիկլ"
        subtitle={`Օրական անվտանգ սահմանաչափ, հաշվարկային ցիկլ և կատեգորիաների բյուջե · ${cycleLabel}`}
        actions={
          <MonthCycleNav
            selectedMonth={selectedMonth}
            payday={effectivePayday}
            onShiftMonth={onShiftMonth}
          />
        }
      />

      <MetricStrip
        items={[
          {
            id: 'daily-allowance',
            label: 'Օրական սահմանաչափ',
            value: formatMoney(safeToSpend.dailyAllowance, currency),
            hint: `Մնաց ${safeToSpend.remainingDaysInclusive} օր`,
            tone: 'accent',
            sensitive: true,
          },
          {
            id: 'today-remaining',
            label: 'Այսօրվա մնացորդ',
            value: `${safeToSpend.remainingTodayAllowance >= 0 ? '+' : ''}${formatMoney(safeToSpend.remainingTodayAllowance, currency)}`,
            hint: `Այսօր ծախս՝ ${formatMoney(safeToSpend.todaySpent, currency)}`,
            tone:
              safeToSpend.remainingTodayAllowance >= 0
                ? 'positive'
                : 'negative',
            sensitive: true,
          },
          {
            id: 'free-funds',
            label: 'Ազատ միջոցներ',
            value: formatMoney(safeToSpend.freeFunds, currency),
            hint:
              totalBudgetLimit > 0
                ? `Ընդ. բյուջե՝ ${formatMoney(totalBudgetLimit, currency)}`
                : 'Ցիկլի ավարտից առաջ',
            tone: safeToSpend.freeFunds >= 0 ? 'default' : 'negative',
            sensitive: true,
          },
          {
            id: 'reserved',
            label: 'Ամրագրված պահուստ',
            value: formatMoney(reservedTotal, currency),
            hint: 'Վճարումներ + նախածախս',
            tone: reservedTotal > 0 ? 'warning' : 'default',
            sensitive: true,
          },
        ]}
      />

      {/* Primary Income & Payday Billing Cycle Configuration */}
      <SectionCard
        title="Հիմնական եկամուտ և հաշվարկային ամիս"
        subtitle="Սահմանեք աշխատավարձի օրը՝ բոլոր բյուջեներն ու ցիկլերը համաժամանակեցնելու համար"
        icon={CalendarDays}
        headerRight={
          primaryIncome.enabled && !isEditingPrimary ? (
            <div className="flex flex-wrap items-center gap-2">
              {cycleMetrics.isCurrentCycle && !hasCurrentPrimaryCredited && (
                <button
                  type="button"
                  onClick={onManualCreditPrimaryIncome}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-[#060B16] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Գրանցել ցիկլի աշխատավարձը</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenPrimaryEditor}
                className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] inline-flex items-center gap-1.5 hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Փոփոխել</span>
              </button>
            </div>
          ) : undefined
        }
      >
        {primaryIncome.enabled && !isEditingPrimary ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <p className="font-display text-sm sm:text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  {primaryIncome.title}
                </p>
                <span className="pa-sensitive font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  +{formatMoney(primaryIncome.amount, currency)}
                </span>
              </div>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                <span>Ամսվա {primaryIncome.payday}-ին</span>
                <span aria-hidden="true">·</span>
                <span>
                  {primaryIncome.autoCredit
                    ? 'Ավտոմատ թարմացում ակտիվ է'
                    : 'Ձեռքով գրանցում'}
                </span>
                {cycleMetrics.isCurrentCycle && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#2563EB] dark:text-[#60A5FA] font-medium">
                      Հաջորդ թարմացումը՝ {formatShortDate(cycleMetrics.nextStartDate)} (
                      {cycleMetrics.daysUntilNextPayday === 0
                        ? 'այսօր'
                        : cycleMetrics.daysUntilNextPayday === 1
                          ? 'վաղը'
                          : `${cycleMetrics.daysUntilNextPayday} օրից`}
                      )
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handlePrimaryIncomeSubmit} className="space-y-4">
            {isEditingPrimary && (
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onDisablePrimaryIncome();
                    setIsEditingPrimary(false);
                  }}
                  className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  Անջատել ցիկլը
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingPrimary(false)}
                  className="text-xs font-medium text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] cursor-pointer"
                >
                  Չեղարկել
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5">
                <label
                  htmlFor="primary-income-title"
                  className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1.5"
                >
                  Եկամտի անվանում
                </label>
                <input
                  id="primary-income-title"
                  type="text"
                  value={primaryTitleInput}
                  onChange={(e) => setPrimaryTitleInput(e.target.value)}
                  placeholder="Օրինակ՝ Ամսական աշխատավարձ"
                  className="w-full min-h-[42px] px-3.5 py-2 text-sm rounded-xl input-field"
                />
              </div>

              <div className="sm:col-span-3">
                <label
                  htmlFor="primary-income-amount"
                  className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1.5"
                >
                  Գումար (֏)
                </label>
                <input
                  id="primary-income-amount"
                  type="number"
                  min="1"
                  step="any"
                  value={primaryAmountInput}
                  onChange={(e) => setPrimaryAmountInput(e.target.value)}
                  placeholder="Օրինակ՝ 450000"
                  className="w-full min-h-[42px] px-3.5 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="primary-income-day"
                  className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1.5"
                >
                  Ստացման օր (1–31)
                </label>
                <input
                  id="primary-income-day"
                  type="number"
                  min="1"
                  max="31"
                  value={primaryPaydayInput}
                  onChange={(e) => setPrimaryPaydayInput(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
                />
              </div>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="w-full min-h-[42px] px-4 py-2 rounded-xl btn-primary text-xs sm:text-sm whitespace-nowrap"
                >
                  {primaryIncome.enabled ? 'Պահպանել' : 'Կիրառել'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-xs text-[#475569] dark:text-[#CBD5E1] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={primaryAutoCreditInput}
                  onChange={(e) => setPrimaryAutoCreditInput(e.target.checked)}
                  className="w-4 h-4 rounded border-[#CBD5E1] dark:border-[#334155] accent-[#2563EB]"
                />
                <span>
                  Ամեն ամսվա այդ օրը ավտոմատ գրանցել եկամուտը, թարմացնել բալանսը և սկսել նոր ամիս
                </span>
              </label>

              {primaryFormError && (
                <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">
                  {primaryFormError}
                </p>
              )}
            </div>
          </form>
        )}
      </SectionCard>

      {/* Category Budgets */}
      <SectionCard
        title="Կատեգորիաների ամսական սահմանաչափեր"
        subtitle={`Վերահսկեք ծախսերը ըստ կատեգորիայի · ${cycleLabel}`}
        icon={Target}
      >
        <form
          onSubmit={handleBudgetSubmit}
          className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 mb-5"
        >
          <select
            value={budgetCategory}
            onChange={(e) => setBudgetCategory(e.target.value)}
            aria-label="Ընտրել կատեգորիա"
            className="sm:col-span-5 min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            step="any"
            value={budgetAmount}
            onChange={(e) => setBudgetAmount(e.target.value)}
            placeholder="Ամսական սահմանաչափ (֏)"
            className="sm:col-span-4 min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
          />
          <button
            type="submit"
            className="sm:col-span-3 min-h-[42px] px-3 py-2 rounded-xl btn-primary text-xs sm:text-sm whitespace-nowrap"
          >
            Սահմանել
          </button>
        </form>

        {budgetError && (
          <p className="text-xs text-rose-600 dark:text-rose-400 mb-4" role="alert">
            {budgetError}
          </p>
        )}

        {budgets.length === 0 ? (
          <EmptyStatePlaceholder
            compact
            icon={Target}
            title="Բյուջեի սահմանաչափեր դեռ չկան"
            description="Ընտրեք կատեգորիա և սահմանեք ամսական սահմանաչափ վերևի դաշտից։"
          />
        ) : (
          <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
            {budgets.map((b) => {
              const spent = expenseByCategory[b.category] ?? 0;
              const remaining = b.limit - spent;
              const pct = Math.round((spent / b.limit) * 100);
              const barWidth = Math.min(100, Math.max(pct, spent > 0 ? 4 : 0));
              const statusText =
                pct >= 100
                  ? `Գերազանցված է ${formatMoney(Math.abs(remaining), currency)}-ով`
                  : pct >= 80
                    ? `Մոտենում է սահմանին · Մնաց՝ ${formatMoney(remaining, currency)}`
                    : `Նորմայի մեջ · Մնաց՝ ${formatMoney(remaining, currency)}`;
              const statusClass =
                pct >= 100
                  ? 'text-rose-600 dark:text-rose-400'
                  : pct >= 80
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400';
              const barClass =
                pct >= 100
                  ? 'bg-rose-500'
                  : pct >= 80
                    ? 'bg-amber-500'
                    : 'bg-emerald-500';

              return (
                <div
                  key={b.category}
                  className="py-4 first:pt-1 last:pb-0 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                        {b.category}
                      </p>
                      <p className="text-xs text-[#64748B] dark:text-[#94A3B8] flex flex-wrap items-center gap-1.5 tabular-nums">
                        <span className={statusClass}>{statusText}</span>
                        <span aria-hidden="true">·</span>
                        <span>{pct}%</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="pa-sensitive text-xs sm:text-sm font-mono tabular-nums text-[#475569] dark:text-[#CBD5E1]">
                        {formatMoney(spent, currency)} /{' '}
                        {formatMoney(b.limit, currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteBudget(b.category)}
                        aria-label={`Հեռացնել ${b.category} բյուջեն`}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#E2E8F0] dark:bg-[#1E293B] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${barClass}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
