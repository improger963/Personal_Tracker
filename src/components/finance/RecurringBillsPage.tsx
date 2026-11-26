import React, { useEffect, useRef, useState } from 'react';
import {
  BellRing,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  SkipForward,
  Trash2,
  X,
} from 'lucide-react';
import {
  MetricStrip,
  MonthCycleNav,
  PageHeader,
  PageShell,
  SectionCard,
} from '../layout/PagePrimitives';
import { EmptyStatePlaceholder } from '../ui/Skeleton';
import {
  BillFrequency,
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
import { getDateInCycleForDay } from '../../utils/financialCycle';
import {
  getBillFrequency,
  getCurrentHHMM,
  getDailyPresetTimes,
} from '../../utils/notifications';
import { RecurringBillSuggestion } from '../../utils/recurringBills';

interface RecurringBillsPageProps {
  selectedMonth: string;
  onShiftMonth: (delta: number) => void;
  effectivePayday: number;
  cycleLabel: string;
  currency: Currency;
  primaryIncome: PrimaryIncomeConfig;
  recurringBills: RecurringBill[];
  onAddRecurringBill: (bill: Omit<RecurringBill, 'id'>) => void;
  onUpdateRecurringBill: (
    id: string,
    updates: Omit<RecurringBill, 'id'>
  ) => void;
  onDeleteRecurringBill: (id: string) => void;
  onToggleBillActive?: (id: string) => void;
  onPayAllRecurringBills: (bills: RecurringBill[], monthKey: string) => void;
  onConfirmBillSlot: (billId: string, slotKey: string, dateISO: string) => void;
  onSkipBillSlot: (billId: string, slotKey: string) => void;
  currentHHMM?: string;
  monthTransactions: Transaction[];
  onAddTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  billSuggestions?: RecurringBillSuggestion[];
  prefillSuggestion?: RecurringBillSuggestion | null;
  onConsumePrefillSuggestion?: () => void;
  onConvertSuggestionToBill?: (
    suggestion: RecurringBillSuggestion,
    overrides?: {
      title?: string;
      amount?: number;
      category?: string;
      frequency?: 'monthly' | 'daily';
      dayOfMonth?: number;
      categorizeMatchingTransactions?: boolean;
    }
  ) => void;
  onDismissBillSuggestion?: (key: string) => void;
}

export function RecurringBillsPage({
  selectedMonth,
  onShiftMonth,
  effectivePayday,
  cycleLabel,
  currency,
  primaryIncome,
  recurringBills,
  onAddRecurringBill,
  onUpdateRecurringBill,
  onDeleteRecurringBill,
  onToggleBillActive,
  onPayAllRecurringBills,
  onConfirmBillSlot,
  onSkipBillSlot,
  currentHHMM,
  monthTransactions,
  onAddTransaction,
  billSuggestions = [],
  prefillSuggestion,
  onConsumePrefillSuggestion,
  onConvertSuggestionToBill,
  onDismissBillSuggestion,
}: RecurringBillsPageProps) {
  const todayISO = getTodayISO();
  const liveHHMM = currentHHMM || getCurrentHHMM();

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
  const [suggestionDrafts, setSuggestionDrafts] = useState<
    Record<
      string,
      {
        category: string;
        frequency: 'monthly' | 'daily';
        amount: string;
      }
    >
  >({});
  const composerAnchorRef = useRef<HTMLDivElement>(null);

  const loadSuggestionIntoComposer = (suggestion: RecurringBillSuggestion) => {
    const draft = suggestionDrafts[suggestion.key];
    setEditingBillId(null);
    setBillFrequency(draft?.frequency ?? suggestion.suggestedFrequency);
    setBillTitle(suggestion.title);
    setBillAmount(draft?.amount ?? String(suggestion.typicalAmount || ''));
    setBillCategory(draft?.category ?? suggestion.suggestedCategory);
    setBillDay(String(suggestion.suggestedDayOfMonth || 15));
    setBillReminderTime('10:00');
    setBillDailyTimes(
      suggestion.suggestedDailyTimes.length > 0
        ? suggestion.suggestedDailyTimes
        : ['10:00']
    );
    setBillIsVariable(suggestion.isVariableAmount);
    setBillError('');
  };

  useEffect(() => {
    if (!prefillSuggestion) return;
    loadSuggestionIntoComposer(prefillSuggestion);
    onConsumePrefillSuggestion?.();
    composerAnchorRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillSuggestion]);

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
      bill.active !== false &&
      getBillFrequency(bill) === 'monthly' &&
      !monthTransactions.some(
        (tx) =>
          tx.type === 'expense' &&
          tx.title.toLowerCase() === bill.title.toLowerCase()
      )
  );
  const unpaidTotal = unpaidBills.reduce((s, b) => s + (b.amount || 0), 0);

  const activeBillsCount = recurringBills.filter(
    (b) => b.active !== false
  ).length;
  const monthlyActiveBills = recurringBills.filter(
    (bill) => bill.active !== false && getBillFrequency(bill) === 'monthly'
  );
  const monthlyFixedTotal = monthlyActiveBills.reduce(
    (sum, b) => sum + (b.amount || 0),
    0
  );
  const monthlyIncomeSharePct =
    primaryIncome.enabled && primaryIncome.amount > 0 && monthlyFixedTotal > 0
      ? Math.round((monthlyFixedTotal / primaryIncome.amount) * 100)
      : null;

  const filteredRecurringBills = recurringBills.filter((bill) =>
    billFilter === 'all' ? true : getBillFrequency(bill) === billFilter
  );

  return (
    <PageShell>
      <PageHeader
        title="Կրկնվող և պլանավորված վճարներ"
        subtitle={`Ամսական, ամենօրյա և պլանավորված ծախսերի հիշեցումներ · ${cycleLabel}`}
        actions={
          <>
            <MonthCycleNav
              selectedMonth={selectedMonth}
              payday={effectivePayday}
              onShiftMonth={onShiftMonth}
            />
            {unpaidBills.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  onPayAllRecurringBills(unpaidBills, selectedMonth)
                }
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl btn-primary text-xs whitespace-nowrap shrink-0 tabular-nums"
              >
                Գրանցել բոլոր ամսականները ({unpaidBills.length})
              </button>
            )}
          </>
        }
      />

      <MetricStrip
        items={[
          {
            id: 'active-bills',
            label: 'Ակտիվ հիշեցումներ',
            value: String(activeBillsCount),
            hint: `Ընդամենը ${recurringBills.length} գրառում`,
          },
          {
            id: 'monthly-fixed',
            label: 'Ամսական պարտադիր',
            value: formatMoney(monthlyFixedTotal, currency),
            hint: `${monthlyActiveBills.length} ակտիվ ամսական`,
            sensitive: true,
          },
          {
            id: 'income-share',
            label: 'Եկամտի բաժին',
            value:
              monthlyIncomeSharePct !== null ? `${monthlyIncomeSharePct}%` : '—',
            hint:
              monthlyIncomeSharePct !== null
                ? 'Հիմնական եկամտից'
                : 'Սահմանեք հիմնական եկամուտ',
            tone:
              monthlyIncomeSharePct === null
                ? 'default'
                : monthlyIncomeSharePct > 65
                  ? 'negative'
                  : monthlyIncomeSharePct > 45
                    ? 'warning'
                    : 'positive',
          },
          {
            id: 'unpaid-monthly',
            label: 'Մնացած ամսական',
            value: formatMoney(unpaidTotal, currency),
            hint: `${unpaidBills.length} չվճարված այս ցիկլում`,
            tone: unpaidTotal > 0 ? 'warning' : 'positive',
            sensitive: true,
          },
        ]}
      />

      {/* Frequent Uncategorized Expenses Detection Prompt */}
      {billSuggestions.length > 0 && (
        <SectionCard
          title="Հայտնաբերված հաճախակի չդասակարգված ծախսեր"
          subtitle={`Գտնվել է ${billSuggestions.length} կրկնվող ծախս «Այլ» կատեգորիայից՝ կարող եք վերածել կրկնվող վճարի`}
          icon={Repeat}
          noPadding
        >
          <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
            {billSuggestions.map((suggestion) => {
              const draft = suggestionDrafts[suggestion.key];
              const chosenCategory =
                draft?.category ?? suggestion.suggestedCategory;
              const chosenFrequency =
                draft?.frequency ?? suggestion.suggestedFrequency;
              const chosenAmount =
                draft?.amount ?? String(suggestion.typicalAmount);
              const parsedAmount = Number(chosenAmount);

              const updateDraft = (
                patch: Partial<{
                  category: string;
                  frequency: 'monthly' | 'daily';
                  amount: string;
                }>
              ) => {
                setSuggestionDrafts((prev) => ({
                  ...prev,
                  [suggestion.key]: {
                    category: prev[suggestion.key]?.category ?? suggestion.suggestedCategory,
                    frequency:
                      prev[suggestion.key]?.frequency ?? suggestion.suggestedFrequency,
                    amount:
                      prev[suggestion.key]?.amount ?? String(suggestion.typicalAmount),
                    ...patch,
                  },
                }));
              };

              return (
                <div
                  key={suggestion.key}
                  className="px-4 sm:px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                        {suggestion.title}
                      </p>
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400 tabular-nums">
                        · {suggestion.occurrences} անգամ առանց կատեգորիայի
                      </span>
                    </div>
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1.5 flex-wrap tabular-nums">
                      <span>Տիպիկ գումար՝</span>
                      <span className="pa-sensitive font-mono font-medium text-[#0F172A] dark:text-[#E2E8F0]">
                        {formatMoney(suggestion.typicalAmount, currency)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Վերջինը՝ {formatShortDate(suggestion.lastDate)}
                      </span>
                      {suggestion.averageIntervalDays !== null && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {suggestion.averageIntervalDays <= 1
                              ? 'Գրեթե ամեն օր'
                              : `Միջինը ${suggestion.averageIntervalDays} օրը մեկ`}
                          </span>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={chosenAmount}
                      onChange={(e) => updateDraft({ amount: e.target.value })}
                      aria-label={`Գումար՝ ${suggestion.title}`}
                      className="w-28 min-h-[36px] px-2.5 py-1 text-xs font-mono tabular-nums rounded-xl input-field"
                    />
                    <select
                      value={chosenCategory}
                      onChange={(e) => updateDraft({ category: e.target.value })}
                      aria-label={`Կատեգորիա՝ ${suggestion.title}`}
                      className="min-h-[36px] px-2.5 py-1 text-xs rounded-xl input-field"
                    >
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <select
                      value={chosenFrequency}
                      onChange={(e) =>
                        updateDraft({
                          frequency: e.target.value as 'monthly' | 'daily',
                        })
                      }
                      aria-label={`Հաճախականություն՝ ${suggestion.title}`}
                      className="min-h-[36px] px-2.5 py-1 text-xs rounded-xl input-field"
                    >
                      <option value="monthly">Ամսական</option>
                      <option value="daily">Ամենօրյա</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => {
                        const finalAmt =
                          Number.isFinite(parsedAmount) && parsedAmount > 0
                            ? parsedAmount
                            : suggestion.typicalAmount;
                        if (onConvertSuggestionToBill) {
                          onConvertSuggestionToBill(suggestion, {
                            amount: finalAmt,
                            category: chosenCategory,
                            frequency: chosenFrequency,
                          });
                        } else {
                          onAddRecurringBill({
                            title: suggestion.title,
                            amount: finalAmt,
                            category: chosenCategory,
                            frequency: chosenFrequency,
                            dayOfMonth: suggestion.suggestedDayOfMonth,
                            reminderTime:
                              chosenFrequency === 'monthly' ? '10:00' : undefined,
                            dailyTimes:
                              chosenFrequency === 'daily'
                                ? suggestion.suggestedDailyTimes
                                : undefined,
                            isVariableAmount: suggestion.isVariableAmount,
                            active: true,
                          });
                        }
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl btn-primary text-xs inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      <span>Դարձնել կրկնվող վճար</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        loadSuggestionIntoComposer(suggestion);
                        composerAnchorRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'nearest',
                        });
                      }}
                      title="Խմբագրել ներքևի ձևում"
                      aria-label={`Խմբագրել ${suggestion.title} առաջարկը ձևում`}
                      className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] text-xs font-medium text-[#334155] dark:text-[#CBD5E1] hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Խմբագրել ձևում
                    </button>

                    {onDismissBillSuggestion && (
                      <button
                        type="button"
                        onClick={() => onDismissBillSuggestion(suggestion.key)}
                        aria-label={`Թաքցնել ${suggestion.title} առաջարկը`}
                        title="Թաքցնել"
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Composer */}
      <div ref={composerAnchorRef}>
      <SectionCard
        title={
          editingBillId ? 'Խմբագրել վճարումը' : 'Ավելացնել նոր վճարում կամ հիշեցում'
        }
        subtitle="Ընտրեք հաճախականությունը՝ ամսական, օրական մի քանի անգամ կամ կոնկրետ օրով"
        icon={CalendarClock}
        headerRight={
          editingBillId ? (
            <button
              type="button"
              onClick={resetBillComposer}
              className="text-xs font-medium text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] cursor-pointer"
            >
              Չեղարկել խմբագրումը
            </button>
          ) : undefined
        }
      >
        <form onSubmit={handleBillSubmit} className="space-y-3.5">
          {/* Frequency Selector */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl surface-subtle max-w-md">
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
              placeholder={
                billIsVariable ? 'Մոտավոր / 0 (ոչ պարտադիր)' : 'Գումար'
              }
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

          {billFrequency === 'daily' && (
            <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-3">
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
                            : 'border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] text-[#64748B] dark:text-[#94A3B8] hover:border-[#2563EB]'
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
                    className="inline-flex items-center gap-1 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-[#F8FAFC] dark:bg-[#0B1120] px-2.5 py-1.5"
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
                    className="min-h-[34px] px-2.5 py-1 rounded-xl border border-dashed border-[#CBD5E1] dark:border-[#334155] text-xs font-medium text-[#2563EB] dark:text-[#60A5FA] hover:border-[#2563EB] inline-flex items-center gap-1 cursor-pointer"
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
      </SectionCard>
      </div>

      {/* Bills List */}
      <SectionCard
        title="Գրանցված վճարումների ցանկ"
        noPadding
        headerRight={
          recurringBills.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
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
          ) : undefined
        }
      >
        {filteredRecurringBills.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyStatePlaceholder
              compact
              icon={CalendarClock}
              title="Այս բաժնում կրկնվող կամ պլանավորված ծախսեր չկան"
              description="Ավելացրեք ամսական, ամենօրյա կամ պլանավորված ծախս վերևից։"
            />
          </div>
        ) : (
          <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
            {filteredRecurringBills.map((bill) => {
              const freq = getBillFrequency(bill);
              const isPaused = bill.active === false;

              if (freq === 'daily') {
                const times = [...(bill.dailyTimes ?? ['10:00'])].sort();
                const doneTodayCount = times.filter((t) =>
                  bill.confirmedSlots?.includes(`${todayISO}@${t}`)
                ).length;

                return (
                  <div
                    key={bill.id}
                    className={`px-4 sm:px-6 py-4 space-y-2.5 transition-opacity ${
                      isPaused ? 'opacity-60' : ''
                    } ${
                      editingBillId === bill.id
                        ? 'bg-[#EFF6FF]/60 dark:bg-[#172554]/25'
                        : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                            {bill.title}
                          </p>
                          <span className="text-xs font-medium text-[#2563EB] dark:text-[#60A5FA] tabular-nums">
                            · Ամենօրյա · {times.length}×
                          </span>
                          {isPaused && (
                            <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                              · Դադարեցված
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1.5 tabular-nums mt-0.5">
                          <span>{bill.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="pa-sensitive font-mono font-medium text-[#475569] dark:text-[#CBD5E1]">
                            {formatMoney(bill.amount, currency)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            {doneTodayCount}/{times.length} այսօր
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {onToggleBillActive && (
                          <button
                            type="button"
                            onClick={() => onToggleBillActive(bill.id)}
                            title={isPaused ? 'Վերսկսել' : 'Դադարեցնել'}
                            aria-label={
                              isPaused
                                ? `Վերսկսել ${bill.title}`
                                : `Դադարեցնել ${bill.title}`
                            }
                            className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-[#2563EB] dark:hover:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#172554]/50 cursor-pointer"
                          >
                            {isPaused ? (
                              <Play className="w-3.5 h-3.5" />
                            ) : (
                              <Pause className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
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
                        const isDue =
                          !isConfirmed && !isSkipped && time <= liveHHMM;

                        if (isConfirmed) {
                          return (
                            <span
                              key={slotKey}
                              className="inline-flex items-center gap-1 min-h-[30px] px-2.5 py-1 text-emerald-700 dark:text-emerald-300 text-[11px] font-mono font-semibold tabular-nums"
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
                const isConfirmed = bill.confirmedSlots?.includes('planned');
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
                    className={`px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      editingBillId === bill.id
                        ? 'bg-[#EFF6FF]/60 dark:bg-[#172554]/25'
                        : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                          {bill.title}
                        </p>
                        <span
                          className={`text-xs font-medium ${
                            isConfirmed
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : isOverdue
                                ? 'text-rose-600 dark:text-rose-400'
                                : isDueNow
                                  ? 'text-[#2563EB] dark:text-[#60A5FA]'
                                  : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          ·{' '}
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
                          {sDate === todayISO ? 'Այսօր' : formatShortDate(sDate)},{' '}
                          {sTime}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="pa-sensitive font-mono font-medium text-[#475569] dark:text-[#CBD5E1]">
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
                  className={`px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-opacity ${
                    isPaused ? 'opacity-60' : ''
                  } ${
                    editingBillId === bill.id
                      ? 'bg-[#EFF6FF]/60 dark:bg-[#172554]/25'
                      : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                        {bill.title}
                      </p>
                      {isPaused && (
                        <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                          · Դադարեցված
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1.5 tabular-nums flex-wrap mt-0.5">
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
                      <span className="pa-sensitive font-mono font-medium text-[#475569] dark:text-[#CBD5E1]">
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
                    {onToggleBillActive && (
                      <button
                        type="button"
                        onClick={() => onToggleBillActive(bill.id)}
                        title={isPaused ? 'Վերսկսել' : 'Դադարեցնել'}
                        aria-label={
                          isPaused
                            ? `Վերսկսել ${bill.title}`
                            : `Դադարեցնել ${bill.title}`
                        }
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-[#2563EB] dark:hover:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#172554]/50 cursor-pointer"
                      >
                        {isPaused ? (
                          <Play className="w-4 h-4" />
                        ) : (
                          <Pause className="w-4 h-4" />
                        )}
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
      </SectionCard>
    </PageShell>
  );
}
