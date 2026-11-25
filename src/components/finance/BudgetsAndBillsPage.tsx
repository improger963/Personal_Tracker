import React, { useState } from 'react';
import {
  BellRing,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Pencil,
  Plus,
  Repeat,
  SkipForward,
  Trash2,
  X,
} from 'lucide-react';
import {
  BillFrequency,
  BudgetLimit,
  Currency,
  PrimaryIncomeConfig,
  RecurringBill,
  Transaction,
} from '../../types';
import {
  EXPENSE_CATEGORIES,
  formatMoney,
  formatShortDate,
  getTodayISO,
} from '../../data/defaults';
import {
  clampPayday,
  getDateInCycleForDay,
} from '../../utils/financialCycle';
import {
  getBillFrequency,
  getCurrentHHMM,
  getDailyPresetTimes,
} from '../../utils/notifications';

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

interface BudgetsAndBillsPageProps {
  selectedMonth: string;
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
  budgets: BudgetLimit[];
  expenseByCategory: Record<string, number>;
  onSaveBudget: (category: string, limit: number) => void;
  onDeleteBudget: (category: string) => void;
  recurringBills: RecurringBill[];
  onAddRecurringBill: (bill: Omit<RecurringBill, 'id'>) => void;
  onUpdateRecurringBill: (
    id: string,
    updates: Omit<RecurringBill, 'id'>
  ) => void;
  onDeleteRecurringBill: (id: string) => void;
  onPayAllRecurringBills: (bills: RecurringBill[], monthKey: string) => void;
  onConfirmBillSlot: (billId: string, slotKey: string, dateISO: string) => void;
  onSkipBillSlot: (billId: string, slotKey: string) => void;
  currentHHMM?: string;
  monthTransactions: Transaction[];
  onAddTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
}

export function BudgetsAndBillsPage({
  selectedMonth,
  effectivePayday,
  cycleLabel,
  currency,
  primaryIncome,
  onSavePrimaryIncome,
  onDisablePrimaryIncome,
  onManualCreditPrimaryIncome,
  hasCurrentPrimaryCredited,
  cycleMetrics,
  budgets,
  expenseByCategory,
  onSaveBudget,
  onDeleteBudget,
  recurringBills,
  onAddRecurringBill,
  onUpdateRecurringBill,
  onDeleteRecurringBill,
  onPayAllRecurringBills,
  onConfirmBillSlot,
  onSkipBillSlot,
  currentHHMM,
  monthTransactions,
  onAddTransaction,
}: BudgetsAndBillsPageProps) {
  const todayISO = getTodayISO();
  const liveHHMM = currentHHMM || getCurrentHHMM();

  // Primary Income form state
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

  // Budget form state
  const [budgetCategory, setBudgetCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetError, setBudgetError] = useState('');

  // Recurring & Planned bill composer state
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [billFrequency, setBillFrequency] = useState<BillFrequency>('monthly');
  const [billTitle, setBillTitle] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billCategory, setBillCategory] = useState<string>('Կոմունալ');
  const [billDay, setBillDay] = useState('15');
  const [billReminderTime, setBillReminderTime] = useState('10:00');
  const [billDailyTimes, setBillDailyTimes] = useState<string[]>([
    '09:30',
    '18:30',
  ]);
  const [billScheduledDate, setBillScheduledDate] = useState(getTodayISO());
  const [billScheduledTime, setBillScheduledTime] = useState('15:00');
  const [billIsVariable, setBillIsVariable] = useState(false);
  const [billFilter, setBillFilter] = useState<'all' | BillFrequency>('all');
  const [billError, setBillError] = useState('');

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

  const resetBillComposer = () => {
    setEditingBillId(null);
    setBillFrequency('monthly');
    setBillTitle('');
    setBillAmount('');
    setBillCategory('Կոմունալ');
    setBillDay('15');
    setBillReminderTime('10:00');
    setBillDailyTimes(['09:30', '18:30']);
    setBillScheduledDate(getTodayISO());
    setBillScheduledTime('15:00');
    setBillIsVariable(false);
    setBillError('');
  };

  const handleStartEditBill = (bill: RecurringBill) => {
    const freq = getBillFrequency(bill);
    setEditingBillId(bill.id);
    setBillFrequency(freq);
    setBillTitle(bill.title);
    setBillAmount(String(bill.amount || ''));
    setBillCategory(bill.category);
    setBillDay(String(bill.dayOfMonth || 15));
    setBillReminderTime(bill.reminderTime || '10:00');
    setBillDailyTimes(
      bill.dailyTimes && bill.dailyTimes.length > 0
        ? bill.dailyTimes
        : ['10:00']
    );
    setBillScheduledDate(bill.scheduledDate || getTodayISO());
    setBillScheduledTime(bill.scheduledTime || '15:00');
    setBillIsVariable(Boolean(bill.isVariableAmount));
    setBillError('');
  };

  const handleDailyCountPreset = (count: number) => {
    setBillDailyTimes(getDailyPresetTimes(count));
  };

  const handleDailyTimeChange = (idx: number, val: string) => {
    setBillDailyTimes((prev) => prev.map((t, i) => (i === idx ? val : t)));
  };

  const handleAddDailyTimeSlot = () => {
    setBillDailyTimes((prev) => {
      if (prev.length >= 8) return prev;
      const last = prev[prev.length - 1] || '10:00';
      const [hStr, mStr] = last.split(':');
      const nextH = (Number(hStr) + 3) % 24;
      const nextTime = `${String(nextH).padStart(2, '0')}:${mStr || '00'}`;
      return [...prev, nextTime];
    });
  };

  const handleRemoveDailyTimeSlot = (idx: number) => {
    setBillDailyTimes((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)
    );
  };

  const handleBillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(billAmount) || 0;
    const day = Math.min(31, Math.max(1, Number(billDay) || 1));
    if (!billTitle.trim()) {
      setBillError('Լրացրեք վճարման անվանումը։');
      return;
    }
    if (!billIsVariable && (!num || num <= 0)) {
      setBillError('Լրացրեք ճիշտ գումար կամ նշեք որպես փոփոխական։');
      return;
    }

    const cleanedDailyTimes = Array.from(
      new Set(
        billDailyTimes
          .map((t) => t.trim())
          .filter((t) => /^\d{2}:\d{2}$/.test(t))
      )
    ).sort();

    if (billFrequency === 'daily' && cleanedDailyTimes.length === 0) {
      setBillError('Ընտրեք առնվազն մեկ հիշեցման ժամ։');
      return;
    }

    if (billFrequency === 'planned' && !billScheduledDate) {
      setBillError('Ընտրեք պլանավորված ծախսի ամսաթիվը։');
      return;
    }

    setBillError('');
    const existing = editingBillId
      ? recurringBills.find((b) => b.id === editingBillId)
      : undefined;

    const payload: Omit<RecurringBill, 'id'> = {
      title: billTitle.trim(),
      amount: num,
      category: billCategory,
      frequency: billFrequency,
      dayOfMonth: day,
      reminderTime:
        billFrequency === 'monthly' ? billReminderTime || '10:00' : undefined,
      dailyTimes:
        billFrequency === 'daily' ? cleanedDailyTimes : undefined,
      scheduledDate:
        billFrequency === 'planned' ? billScheduledDate : undefined,
      scheduledTime:
        billFrequency === 'planned' ? billScheduledTime || '15:00' : undefined,
      isVariableAmount: billIsVariable,
      confirmedSlots: existing?.confirmedSlots,
      skippedSlots: existing?.skippedSlots,
      active: existing?.active ?? true,
    };

    if (editingBillId) {
      onUpdateRecurringBill(editingBillId, payload);
    } else {
      onAddRecurringBill(payload);
    }
    resetBillComposer();
  };

  const handlePayRecurringBill = (bill: RecurringBill) => {
    onAddTransaction({
      type: 'expense',
      amount: bill.amount,
      title: bill.title,
      category: bill.category,
      date: getDateInCycleForDay(selectedMonth, effectivePayday, bill.dayOfMonth),
    });
  };

  const unpaidBills = recurringBills.filter(
    (bill) =>
      getBillFrequency(bill) === 'monthly' &&
      !monthTransactions.some(
        (tx) =>
          tx.type === 'expense' &&
          tx.title.toLowerCase() === bill.title.toLowerCase()
      )
  );

  const filteredRecurringBills = recurringBills.filter((bill) =>
    billFilter === 'all' ? true : getBillFrequency(bill) === billFilter
  );

  return (
    <div className="space-y-6">
      {/* 1. Primary Income & Payday Billing Cycle Configuration */}
      <section className="surface-card overflow-hidden">
        {primaryIncome.enabled && !isEditingPrimary ? (
          <div className="px-5 py-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-3.5">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CalendarDays className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <h2 className="font-display text-sm sm:text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                    Հիմնական եկամուտ՝ {primaryIncome.title}
                  </h2>
                  <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    +{formatMoney(primaryIncome.amount, currency)}
                  </span>
                </div>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                  <span>Ամսվա {primaryIncome.payday}-ին</span>
                  <span aria-hidden="true">·</span>
                  <span>Ցիկլ՝ {cycleLabel}</span>
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

            <div className="flex flex-wrap items-center gap-2 shrink-0">
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
                className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] inline-flex items-center gap-1.5 hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Փոփոխել</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handlePrimaryIncomeSubmit} className="p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-xl bg-[#EFF6FF] dark:bg-[#172554]/60 text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
                  <CalendarDays className="w-4 h-4" />
                </span>
                <div>
                  <h2 className="font-display text-base sm:text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                    Հիմնական եկամուտ և հաշվարկային ամիս
                  </h2>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                    Նշեք ամսական աշխատավարձի անվանումը, գումարը և ստացման օրը — բոլոր հաշվարկներն ու իրական բալանսը կհաշվարկվեն այդ օրով։
                  </p>
                </div>
              </div>
              {isEditingPrimary && (
                <div className="flex items-center gap-2">
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
            </div>

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
      </section>

      {/* 2. Budgets & Recurring/Planned Bills 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Category Budgets */}
        <section className="lg:col-span-6 min-w-0 surface-card p-5 sm:p-6 space-y-5">
          <div>
            <h3 className="font-display text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
              Ամսական բյուջեի սահմանաչափեր
            </h3>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
              Վերահսկեք ծախսերը ըստ կատեգորիայի՝ {cycleLabel}
            </p>
          </div>

          <form
            onSubmit={handleBudgetSubmit}
            className="grid grid-cols-1 sm:grid-cols-12 gap-2.5"
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
              placeholder="Սահմանաչափ"
              className="sm:col-span-4 min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
            />
            <button
              type="submit"
              className="sm:col-span-3 min-h-[42px] px-3 py-2 rounded-xl btn-primary text-xs whitespace-nowrap"
            >
              Սահմանել
            </button>
          </form>

          {budgetError && (
            <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">
              {budgetError}
            </p>
          )}

          {budgets.length === 0 ? (
            <p className="text-sm text-[#64748B] dark:text-[#94A3B8] py-4">
              Սահմանաչափեր դեռ չկան։ Ավելացրեք վերևի դաշտից։
            </p>
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
                        <span className="text-xs sm:text-sm font-mono tabular-nums text-[#475569] dark:text-[#CBD5E1]">
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
        </section>

        {/* Recurring & Planned Bills */}
        <section className="lg:col-span-6 min-w-0 surface-card p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                {editingBillId
                  ? 'Խմբագրել վճարումը'
                  : 'Կրկնվող և պլանավորված ծախսեր'}
              </h3>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                Ամսական, ամենօրյա (օրական մի քանի անգամ) և պլանավորված ծախսերի հիշեցումներ
              </p>
            </div>
            <div className="flex items-center gap-2">
              {editingBillId && (
                <button
                  type="button"
                  onClick={resetBillComposer}
                  className="text-xs font-medium text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] cursor-pointer"
                >
                  Չեղարկել
                </button>
              )}
              {unpaidBills.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    onPayAllRecurringBills(unpaidBills, selectedMonth)
                  }
                  className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] text-xs font-medium text-[#2563EB] dark:text-[#60A5FA] hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer whitespace-nowrap tabular-nums"
                >
                  Գրանցել բոլոր ամսականները ({unpaidBills.length})
                </button>
              )}
            </div>
          </div>

          <form onSubmit={handleBillSubmit} className="space-y-3">
            {/* Frequency Selector */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl surface-subtle">
              {[
                {
                  id: 'monthly' as const,
                  label: 'Ամսական',
                  icon: BellRing,
                },
                {
                  id: 'daily' as const,
                  label: 'Ամենօրյա',
                  icon: Repeat,
                },
                {
                  id: 'planned' as const,
                  label: 'Պլանավորված',
                  icon: CalendarClock,
                },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = billFrequency === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setBillFrequency(opt.id)}
                    className={`min-h-[36px] px-2 py-1.5 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] shadow-xs font-semibold'
                        : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <input
                type="text"
                value={billTitle}
                onChange={(e) => setBillTitle(e.target.value)}
                placeholder={
                  billFrequency === 'daily'
                    ? 'Անվանում (օր.՝ Սուրճ, Ճաշ, Տրանսպորտ)'
                    : billFrequency === 'planned'
                      ? 'Անվանում (օր.՝ Մեքենայի սպասարկում)'
                      : 'Անվանում (օր.՝ Բնակարանի վարձ)'
                }
                className="sm:col-span-5 min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
              />
              <input
                type="number"
                min="0"
                step="any"
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
                placeholder={billIsVariable ? 'Մոտավոր / 0 (ոչ պարտադիր)' : 'Գումար'}
                className="sm:col-span-3 min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
              />
              <select
                value={billCategory}
                onChange={(e) => setBillCategory(e.target.value)}
                aria-label="Վճարման կատեգորիա"
                className="sm:col-span-4 min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Variable Amount Checkbox */}
            <label className="flex items-center gap-2 text-xs text-[#475569] dark:text-[#CBD5E1] cursor-pointer">
              <input
                type="checkbox"
                checked={billIsVariable}
                onChange={(e) => setBillIsVariable(e.target.checked)}
                className="w-4 h-4 rounded text-[#2563EB] dark:text-[#3B82F6] focus:ring-[#2563EB]"
              />
              <span>
                Փոփոխական գումար (ճշտել և հաստատել հիշեցման կամ վճարման պահին)
              </span>
            </label>

            {/* Monthly Schedule Controls */}
            {billFrequency === 'monthly' && (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-4 flex items-center gap-2">
                  <label
                    htmlFor="bill-day"
                    className="text-xs text-[#64748B] dark:text-[#94A3B8] whitespace-nowrap"
                  >
                    Ամսվա օր․
                  </label>
                  <input
                    id="bill-day"
                    type="number"
                    min="1"
                    max="31"
                    value={billDay}
                    onChange={(e) => setBillDay(e.target.value)}
                    className="w-full min-h-[42px] px-2.5 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
                  />
                </div>
                <div className="sm:col-span-5 flex items-center gap-2">
                  <label
                    htmlFor="bill-monthly-time"
                    className="text-xs text-[#64748B] dark:text-[#94A3B8] whitespace-nowrap"
                  >
                    Ժամ․
                  </label>
                  <input
                    id="bill-monthly-time"
                    type="time"
                    value={billReminderTime}
                    onChange={(e) => setBillReminderTime(e.target.value)}
                    className="w-full min-h-[42px] px-2.5 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
                  />
                </div>
                <button
                  type="submit"
                  className="sm:col-span-3 min-h-[42px] px-3 py-2 rounded-xl btn-primary text-xs whitespace-nowrap"
                >
                  {editingBillId ? 'Պահպանել' : 'Ավելացնել'}
                </button>
              </div>
            )}

            {/* Daily Multi-Time Schedule Controls */}
            {billFrequency === 'daily' && (
              <div className="p-3.5 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                    Օրական քանի անգամ և որ ժամերին հիշեցնել
                  </span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4].map((count) => {
                      const active = billDailyTimes.length === count;
                      return (
                        <button
                          key={count}
                          type="button"
                          onClick={() => handleDailyCountPreset(count)}
                          className={`min-h-[28px] px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer tabular-nums ${
                            active
                              ? 'bg-[#2563EB] dark:bg-[#3B82F6] text-white dark:text-[#060B16]'
                              : 'border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] text-[#64748B] dark:text-[#94A3B8] hover:border-[#2563EB]'
                          }`}
                        >
                          {count}×
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {billDailyTimes.map((timeVal, idx) => (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#E2E8F0] dark:border-[#26334D] bg-white dark:bg-[#0F172A] px-2 py-1"
                    >
                      <Clock className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                      <input
                        type="time"
                        value={timeVal}
                        onChange={(e) =>
                          handleDailyTimeChange(idx, e.target.value)
                        }
                        aria-label={`Հիշեցման ժամ ${idx + 1}`}
                        className="bg-transparent text-xs font-mono tabular-nums text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none"
                      />
                      {billDailyTimes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDailyTimeSlot(idx)}
                          aria-label="Հեռացնել ժամը"
                          className="p-0.5 text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  {billDailyTimes.length < 8 && (
                    <button
                      type="button"
                      onClick={handleAddDailyTimeSlot}
                      className="min-h-[32px] px-2.5 py-1 rounded-xl border border-dashed border-[#CBD5E1] dark:border-[#334155] text-xs font-medium text-[#2563EB] dark:text-[#60A5FA] hover:border-[#2563EB] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Ավելացնել ժամ</span>
                    </button>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="min-h-[40px] px-4 py-2 rounded-xl btn-primary text-xs whitespace-nowrap"
                  >
                    {editingBillId
                      ? 'Պահպանել ամենօրյա ծախսը'
                      : 'Ավելացնել ամենօրյա ծախս'}
                  </button>
                </div>
              </div>
            )}

            {/* Planned Date & Time Controls */}
            {billFrequency === 'planned' && (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-5 flex items-center gap-2">
                  <label
                    htmlFor="bill-planned-date"
                    className="text-xs text-[#64748B] dark:text-[#94A3B8] whitespace-nowrap"
                  >
                    Ամսաթիվ․
                  </label>
                  <input
                    id="bill-planned-date"
                    type="date"
                    value={billScheduledDate}
                    onChange={(e) => setBillScheduledDate(e.target.value)}
                    className="w-full min-h-[42px] px-2.5 py-2 text-xs font-mono tabular-nums rounded-xl input-field"
                  />
                </div>
                <div className="sm:col-span-4 flex items-center gap-2">
                  <label
                    htmlFor="bill-planned-time"
                    className="text-xs text-[#64748B] dark:text-[#94A3B8] whitespace-nowrap"
                  >
                    Ժամ․
                  </label>
                  <input
                    id="bill-planned-time"
                    type="time"
                    value={billScheduledTime}
                    onChange={(e) => setBillScheduledTime(e.target.value)}
                    className="w-full min-h-[42px] px-2.5 py-2 text-xs font-mono tabular-nums rounded-xl input-field"
                  />
                </div>
                <button
                  type="submit"
                  className="sm:col-span-3 min-h-[42px] px-3 py-2 rounded-xl btn-primary text-xs whitespace-nowrap"
                >
                  {editingBillId ? 'Պահպանել' : 'Պլանավորել'}
                </button>
              </div>
            )}

            {billError && (
              <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">
                {billError}
              </p>
            )}
          </form>

          {/* Filter Tabs */}
          {recurringBills.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {[
                { id: 'all' as const, label: `Բոլորը (${recurringBills.length})` },
                {
                  id: 'monthly' as const,
                  label: `Ամսական (${recurringBills.filter((b) => getBillFrequency(b) === 'monthly').length})`,
                },
                {
                  id: 'daily' as const,
                  label: `Ամենօրյա (${recurringBills.filter((b) => getBillFrequency(b) === 'daily').length})`,
                },
                {
                  id: 'planned' as const,
                  label: `Պլանավորված (${recurringBills.filter((b) => getBillFrequency(b) === 'planned').length})`,
                },
              ].map((tab) => {
                const active = billFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setBillFilter(tab.id)}
                    className={`min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer tabular-nums ${
                      active
                        ? 'bg-[#EFF6FF] dark:bg-[#172554]/60 text-[#1D4ED8] dark:text-[#60A5FA] font-semibold'
                        : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          {filteredRecurringBills.length === 0 ? (
            <p className="text-sm text-[#64748B] dark:text-[#94A3B8] py-4">
              Այս բաժնում կրկնվող կամ պլանավորված ծախսեր դեռ ավելացված չեն։
            </p>
          ) : (
            <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
              {filteredRecurringBills.map((bill) => {
                const freq = getBillFrequency(bill);

                if (freq === 'daily') {
                  const times = [...(bill.dailyTimes ?? ['10:00'])].sort();
                  const doneTodayCount = times.filter((t) =>
                    bill.confirmedSlots?.includes(`${todayISO}@${t}`)
                  ).length;

                  return (
                    <div
                      key={bill.id}
                      className={`py-3.5 first:pt-1 last:pb-0 space-y-2.5 ${
                        editingBillId === bill.id
                          ? 'bg-[#EFF6FF] dark:bg-[#172554]/30 -mx-2 px-2 rounded-xl'
                          : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                              {bill.title}
                            </p>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[#EFF6FF] dark:bg-[#172554] text-[#1D4ED8] dark:text-[#60A5FA] tabular-nums">
                              Ամենօրյա · {times.length}×
                            </span>
                          </div>
                          <p className="text-xs text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1.5 tabular-nums mt-0.5">
                            <span>{bill.category}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono font-medium text-[#475569] dark:text-[#CBD5E1]">
                              {formatMoney(bill.amount, currency)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              {doneTodayCount}/{times.length} այսօր
                            </span>
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEditBill(bill)}
                            aria-label={`Խմբագրել ${bill.title}`}
                            className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#E2E8F0]/60 dark:hover:bg-[#1E293B] cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (editingBillId === bill.id) resetBillComposer();
                              onDeleteRecurringBill(bill.id);
                            }}
                            aria-label={`Ջնջել ${bill.title}`}
                            className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {times.map((time) => {
                          const slotKey = `${todayISO}@${time}`;
                          const isConfirmed =
                            bill.confirmedSlots?.includes(slotKey);
                          const isSkipped = bill.skippedSlots?.includes(slotKey);
                          const isDue = !isConfirmed && !isSkipped && time <= liveHHMM;

                          if (isConfirmed) {
                            return (
                              <span
                                key={slotKey}
                                className="inline-flex items-center gap-1 min-h-[30px] px-2.5 py-1 rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 text-[11px] font-mono font-semibold tabular-nums"
                              >
                                <Check className="w-3 h-3" strokeWidth={2.5} />
                                <span>{time}</span>
                              </span>
                            );
                          }

                          if (isSkipped) {
                            return (
                              <button
                                key={slotKey}
                                type="button"
                                onClick={() =>
                                  onConfirmBillSlot(bill.id, slotKey, todayISO)
                                }
                                title="Սեղմեք՝ գրանցելու համար"
                                className="inline-flex items-center gap-1 min-h-[30px] px-2.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-[#1E293B] text-[#94A3B8] line-through text-[11px] font-mono tabular-nums cursor-pointer hover:text-[#0F172A] dark:hover:text-[#F8FAFC]"
                              >
                                <span>{time}</span>
                              </button>
                            );
                          }

                          return (
                            <div
                              key={slotKey}
                              className="inline-flex items-center rounded-lg overflow-hidden border border-[#CBD5E1] dark:border-[#26334D]"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  onConfirmBillSlot(bill.id, slotKey, todayISO)
                                }
                                className={`min-h-[30px] px-2.5 py-1 text-[11px] font-mono font-semibold tabular-nums inline-flex items-center gap-1 cursor-pointer transition-colors ${
                                  isDue
                                    ? 'bg-[#2563EB] dark:bg-[#3B82F6] text-white dark:text-[#060B16]'
                                    : 'bg-white dark:bg-[#0F172A] text-[#334155] dark:text-[#CBD5E1] hover:bg-[#F8FAFC] dark:hover:bg-[#162033]'
                                }`}
                              >
                                <Clock className="w-3 h-3" />
                                <span>{time}</span>
                                <span>· Հաստատել</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onSkipBillSlot(bill.id, slotKey)}
                                title="Բաց թողնել այս ժամը"
                                aria-label={`Բաց թողնել ${time} հիշեցումը`}
                                className="min-h-[30px] px-1.5 bg-[#F8FAFC] dark:bg-[#0B1120] text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 border-l border-[#E2E8F0] dark:border-[#26334D] cursor-pointer"
                              >
                                <SkipForward className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                if (freq === 'planned') {
                  const sDate = bill.scheduledDate || todayISO;
                  const sTime = bill.scheduledTime || '15:00';
                  const isConfirmed =
                    bill.confirmedSlots?.includes('planned');
                  const isSkipped = bill.skippedSlots?.includes('planned');
                  const isOverdue = !isConfirmed && !isSkipped && sDate < todayISO;
                  const isDueNow =
                    !isConfirmed &&
                    !isSkipped &&
                    sDate === todayISO &&
                    sTime <= liveHHMM;

                  return (
                    <div
                      key={bill.id}
                      className={`py-3.5 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        editingBillId === bill.id
                          ? 'bg-[#EFF6FF] dark:bg-[#172554]/30 -mx-2 px-2 rounded-xl'
                          : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                            {bill.title}
                          </p>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                              isConfirmed
                                ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                                : isOverdue
                                  ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300'
                                  : isDueNow
                                    ? 'bg-[#EFF6FF] dark:bg-[#172554] text-[#1D4ED8] dark:text-[#60A5FA]'
                                    : 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {isConfirmed
                              ? 'Հաստատված է'
                              : isOverdue
                                ? 'Ուշացած'
                                : isDueNow
                                  ? 'Հասունացել է'
                                  : isSkipped
                                    ? 'Բաց թողնված'
                                    : 'Պլանավորված'}
                          </span>
                        </div>
                        <p className="text-xs text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1.5 tabular-nums mt-0.5">
                          <span>{bill.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {sDate === todayISO
                              ? 'Այսօր'
                              : formatShortDate(sDate)}
                            , {sTime}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono font-medium text-[#475569] dark:text-[#CBD5E1]">
                            {formatMoney(bill.amount, currency)}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isConfirmed ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 px-2">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Գրանցված է</span>
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                onConfirmBillSlot(bill.id, 'planned', sDate)
                              }
                              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                                isOverdue || isDueNow
                                  ? 'bg-[#2563EB] hover:bg-[#1D4ED8] dark:bg-[#3B82F6] text-white dark:text-[#060B16]'
                                  : 'border border-[#CBD5E1] dark:border-[#26334D] text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#2563EB]'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Հաստատել</span>
                            </button>
                            {!isSkipped && (
                              <button
                                type="button"
                                onClick={() =>
                                  onSkipBillSlot(bill.id, 'planned')
                                }
                                title="Բաց թողնել"
                                aria-label={`Բաց թողնել ${bill.title}`}
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl border border-[#E2E8F0] dark:border-[#26334D] text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                              >
                                <SkipForward className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handleStartEditBill(bill)}
                          aria-label={`Խմբագրել ${bill.title}`}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#E2E8F0]/60 dark:hover:bg-[#1E293B] cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (editingBillId === bill.id) resetBillComposer();
                            onDeleteRecurringBill(bill.id);
                          }}
                          aria-label={`Ջնջել ${bill.title}`}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                }

                const isPaidThisMonth = monthTransactions.some(
                  (tx) =>
                    tx.type === 'expense' &&
                    tx.title.toLowerCase() === bill.title.toLowerCase()
                );
                return (
                  <div
                    key={bill.id}
                    className={`py-3.5 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      editingBillId === bill.id
                        ? 'bg-[#EFF6FF] dark:bg-[#172554]/30 -mx-2 px-2 rounded-xl'
                        : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                        {bill.title}
                      </p>
                      <p className="text-xs text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1.5 tabular-nums flex-wrap">
                        <span>{bill.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>Ամսվա {bill.dayOfMonth}-ին</span>
                        {bill.reminderTime && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{bill.reminderTime}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="font-mono font-medium text-[#475569] dark:text-[#CBD5E1]">
                          {formatMoney(bill.amount, currency)}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isPaidThisMonth ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 px-2">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Վճարված է</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handlePayRecurringBill(bill)}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#2563EB] dark:hover:border-[#3B82F6] inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Repeat className="w-3.5 h-3.5" />
                          <span>Գրանցել վճարումը</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleStartEditBill(bill)}
                        aria-label={`Խմբագրել ${bill.title}`}
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#E2E8F0]/60 dark:hover:bg-[#1E293B] cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (editingBillId === bill.id) resetBillComposer();
                          onDeleteRecurringBill(bill.id);
                        }}
                        aria-label={`Ջնջել ${bill.title}`}
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
