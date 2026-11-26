import { Suspense, lazy, memo, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  BarChart3,
  CalendarClock,
  CreditCard,
  HandCoins,
  PiggyBank,
  Receipt,
  Target,
} from 'lucide-react';
import {
  BankCard,
  BudgetLimit,
  Currency,
  DebtItem,
  IncomeKind,
  PrimaryIncomeConfig,
  RecurringBill,
  SavingsGoal,
  Transaction,
} from '../types';
import {
  CategoryDonutPoint,
  DONUT_COLORS,
  FinancePageTab,
  MonthlyPoint,
  calcDeltaPct,
} from './finance/financeShared';
import { CardTransferModal } from './finance/CardTransferModal';
import { MonthCycleNav, SubPageTabs } from './layout/PagePrimitives';
import { PageSkeleton } from './ui/Skeleton';
import { scrollToTopInstant } from '../utils/scroll';
import { INTERNAL_TRANSFER_CATEGORY } from '../utils/cardBalances';
import {
  formatMoney,
  getLastNMonthsKeys,
  getTodayISO,
  getTransactionIncomeKind,
  INCOME_KIND_LABELS,
} from '../data/defaults';
import {
  SafeToSpendMetrics,
  computeCycleFinancials,
  formatCycleLabel,
  getCycleDayMetrics,
  getCycleShortLabel,
  getEffectivePayday,
  isDateInCycle,
  shiftMonthKey,
} from '../utils/financialCycle';
import { getBillFrequency } from '../utils/notifications';
import { useLocalStorage } from '../hooks/useLocalStorage';
import {
  RecurringBillSuggestion,
  buildRecurringBillFromSuggestion,
  detectFrequentUncategorizedExpenses,
} from '../utils/recurringBills';
import { computeBudgetForecast } from '../utils/budgetForecast';
import { BudgetForecastWarningStrip } from './finance/BudgetForecastCard';

const loadLedgerPage = () =>
  import('./finance/TransactionsLedgerPage').then((m) => ({
    default: m.TransactionsLedgerPage,
  }));
const loadCardsPage = () =>
  import('./finance/CardsSection').then((m) => ({
    default: m.CardsSection,
  }));
const loadBudgetsPage = () =>
  import('./finance/BudgetsPage').then((m) => ({
    default: m.BudgetsPage,
  }));
const loadBillsPage = () =>
  import('./finance/RecurringBillsPage').then((m) => ({
    default: m.RecurringBillsPage,
  }));
const loadGoalsPage = () =>
  import('./finance/SavingsGoalsPage').then((m) => ({
    default: m.SavingsGoalsPage,
  }));
const loadDebtsPage = () =>
  import('./finance/DebtsPage').then((m) => ({
    default: m.DebtsPage,
  }));
const loadAnalyticsPage = () =>
  import('./finance/AnalyticsAndReportsPage').then((m) => ({
    default: m.AnalyticsAndReportsPage,
  }));
const loadSpendingTrendLineCard = () =>
  import('./finance/SpendingTrendLineCard').then((m) => ({
    default: m.SpendingTrendLineCard,
  }));

const TransactionsLedgerPage = lazy(loadLedgerPage);
const CardsSection = lazy(loadCardsPage);
const BudgetsPage = lazy(loadBudgetsPage);
const RecurringBillsPage = lazy(loadBillsPage);
const SavingsGoalsPage = lazy(loadGoalsPage);
const DebtsPage = lazy(loadDebtsPage);
const AnalyticsAndReportsPage = lazy(loadAnalyticsPage);
const SpendingTrendLineCard = lazy(loadSpendingTrendLineCard);

interface FinanceViewProps {
  activePage: FinancePageTab;
  onSelectPage: (page: FinancePageTab) => void;
  selectedMonth: string;
  onChangeMonth: (monthKey: string) => void;
  primaryIncome: PrimaryIncomeConfig;
  onSavePrimaryIncome: (
    config: Omit<PrimaryIncomeConfig, 'creditedCycles'>
  ) => void;
  onDisablePrimaryIncome: () => void;
  onManualCreditPrimaryIncome: () => void;
  transactions: Transaction[];
  onAddTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  onOpenNewTransactionModal: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onAutoCategorizeTransactions?: (
    updates: Array<{ id: string; category: string; incomeKind?: IncomeKind }>
  ) => void;
  onDeleteTransaction: (id: string) => void;
  onDuplicateTransaction?: (tx: Transaction) => void;
  onBulkDeleteTransactions?: (ids: string[]) => void;
  onBulkAssignCard?: (ids: string[], cardId: string | undefined) => void;
  onRepeatMonthlyIncomes: (sourceIncomes: Transaction[], monthKey: string) => void;
  onNotify?: (message: string) => void;
  budgets: BudgetLimit[];
  onSaveBudget: (category: string, limit: number) => void;
  onDeleteBudget: (category: string) => void;
  recurringBills: RecurringBill[];
  onAddRecurringBill: (bill: Omit<RecurringBill, 'id'>) => void;
  onUpdateRecurringBill: (
    id: string,
    updates: Omit<RecurringBill, 'id'>
  ) => void;
  onToggleBillActive?: (id: string) => void;
  onDeleteRecurringBill: (id: string) => void;
  onPayAllRecurringBills: (bills: RecurringBill[], monthKey: string) => void;
  onConfirmBillSlot: (billId: string, slotKey: string, dateISO: string) => void;
  onSkipBillSlot: (billId: string, slotKey: string) => void;
  onConfirmPreExpense: (txId: string) => void;
  currentHHMM?: string;
  safeToSpend: SafeToSpendMetrics;
  savingsGoals: SavingsGoal[];
  onOpenNewGoalModal: () => void;
  onEditGoal: (goal: SavingsGoal) => void;
  onAdjustGoal: (goalId: string, delta: number, recordInLedger: boolean) => void;
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
  cards: BankCard[];
  onOpenNewCardModal: () => void;
  onEditCard: (card: BankCard) => void;
  onDeleteCard: (cardId: string) => void;
  onSetDefaultCard: (cardId: string) => void;
  onQuickCardTransaction: (type: 'income' | 'expense', cardId: string) => void;
  onTransferBetweenCards: (params: {
    fromCardId: string;
    toCardId: string;
    amount: number;
    date: string;
    note?: string;
  }) => void;
  onExportJSON: () => void;
  onImportJSON: (file: File) => void;
}

export const FinanceView = memo(function FinanceView({
  activePage,
  onSelectPage,
  selectedMonth,
  onChangeMonth,
  primaryIncome,
  onSavePrimaryIncome,
  onDisablePrimaryIncome,
  onManualCreditPrimaryIncome,
  transactions,
  onAddTransaction,
  onOpenNewTransactionModal,
  onEditTransaction,
  onAutoCategorizeTransactions,
  onDeleteTransaction,
  onDuplicateTransaction,
  onBulkDeleteTransactions,
  onBulkAssignCard,
  onRepeatMonthlyIncomes,
  onNotify,
  budgets,
  onSaveBudget,
  onDeleteBudget,
  recurringBills,
  onAddRecurringBill,
  onUpdateRecurringBill,
  onToggleBillActive,
  onDeleteRecurringBill,
  onPayAllRecurringBills,
  onConfirmBillSlot,
  onSkipBillSlot,
  onConfirmPreExpense,
  currentHHMM,
  safeToSpend,
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
  cards,
  onOpenNewCardModal,
  onEditCard,
  onDeleteCard,
  onSetDefaultCard,
  onQuickCardTransaction,
  onTransferBetweenCards,
  onExportJSON,
  onImportJSON,
}: FinanceViewProps) {
  const currency: Currency = 'AMD';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const [selectedCardFilter, setSelectedCardFilter] = useState<string>('all');
  const [transferModalState, setTransferModalState] = useState<{
    fromCardId?: string;
  } | null>(null);
  const [dismissedBillSuggestionKeys, setDismissedBillSuggestionKeys] =
    useLocalStorage<string[]>('pa_dismissed_bill_suggestions_v1', []);
  const [prefillBillSuggestion, setPrefillBillSuggestion] =
    useState<RecurringBillSuggestion | null>(null);

  const billSuggestions = useMemo(
    () =>
      detectFrequentUncategorizedExpenses(transactions, recurringBills, {
        dismissedKeys: dismissedBillSuggestionKeys,
      }),
    [transactions, recurringBills, dismissedBillSuggestionKeys]
  );

  const handleDismissBillSuggestion = (key: string) => {
    setDismissedBillSuggestionKeys((prev) =>
      prev.includes(key) ? prev : [...prev, key]
    );
  };

  const handleConvertSuggestionToBill = (
    suggestion: RecurringBillSuggestion,
    overrides?: {
      title?: string;
      amount?: number;
      category?: string;
      frequency?: 'monthly' | 'daily';
      dayOfMonth?: number;
      categorizeMatchingTransactions?: boolean;
    }
  ) => {
    const targetCategory =
      overrides?.category?.trim() || suggestion.suggestedCategory;
    if (
      overrides?.categorizeMatchingTransactions !== false &&
      targetCategory !== 'Այլ' &&
      onAutoCategorizeTransactions &&
      suggestion.matchingTransactionIds.length > 0
    ) {
      onAutoCategorizeTransactions(
        suggestion.matchingTransactionIds.map((id) => ({
          id,
          category: targetCategory,
        }))
      );
    }
    onAddRecurringBill(
      buildRecurringBillFromSuggestion(suggestion, {
        ...overrides,
        category: targetCategory,
      })
    );
  };

  const handleOpenSuggestionInBills = (suggestion: RecurringBillSuggestion) => {
    setPrefillBillSuggestion(suggestion);
    onSelectPage('bills');
  };

  // Idle-prefetch all finance sub-page chunks for instant tab switches
  useEffect(() => {
    const prefetchAll = () => {
      void loadLedgerPage();
      void loadCardsPage();
      void loadBudgetsPage();
      void loadBillsPage();
      void loadGoalsPage();
      void loadDebtsPage();
      void loadAnalyticsPage();
      void loadSpendingTrendLineCard();
    };
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === 'function') {
      const id = win.requestIdleCallback(prefetchAll, { timeout: 2500 });
      return () => {
        win.cancelIdleCallback?.(id);
      };
    }
    const t = window.setTimeout(prefetchAll, 1200);
    return () => window.clearTimeout(t);
  }, []);

  const handleShiftMonth = (delta: number) => {
    onChangeMonth(shiftMonthKey(selectedMonth, delta));
  };

  const effectivePayday = getEffectivePayday(primaryIncome);
  const cycleLabel = useMemo(
    () => formatCycleLabel(selectedMonth, effectivePayday),
    [selectedMonth, effectivePayday]
  );
  const todayISO = getTodayISO();
  const cycleMetrics = useMemo(
    () => getCycleDayMetrics(selectedMonth, effectivePayday, todayISO),
    [selectedMonth, effectivePayday, todayISO]
  );

  const {
    cycleTransactions: monthTransactions,
    openingBalance,
    cycleIncome: totalIncome,
    cycleExpense: totalExpense,
    cyclePendingExpense,
    cycleNet: netSavings,
    cycleEndBalance: realBalance,
  } = useMemo(
    () =>
      computeCycleFinancials(
        transactions,
        selectedMonth,
        effectivePayday,
        todayISO
      ),
    [transactions, selectedMonth, effectivePayday, todayISO]
  );

  const currentCycleForecast = useMemo(
    () =>
      computeBudgetForecast({
        budgets,
        transactions,
        effectivePayday,
        todayISO,
      }),
    [budgets, transactions, effectivePayday, todayISO]
  );

  const selectedCycleForecast = useMemo(
    () =>
      computeBudgetForecast({
        budgets,
        transactions,
        effectivePayday,
        todayISO,
        cycleKey: selectedMonth,
      }),
    [budgets, transactions, effectivePayday, todayISO, selectedMonth]
  );

  const {
    incomeTransactions,
    expenseTransactions,
    monthlyIncomeTotal,
    extraIncomeTotal,
    oneTimeIncomeTotal,
    incomeKindSummary,
    expenseByCategory,
    sortedCategories,
    savingsPct,
    hasCurrentPrimaryCredited,
  } = useMemo(() => {
    const incTxs: Transaction[] = [];
    const expTxs: Transaction[] = [];
    let monthly = 0;
    let extra = 0;
    let oneTime = 0;
    const byCat: Record<string, number> = {};

    for (const t of monthTransactions) {
      if (t.category === INTERNAL_TRANSFER_CATEGORY) continue;
      if (t.type === 'income') {
        incTxs.push(t);
        const kind = getTransactionIncomeKind(t);
        if (kind === 'monthly') monthly += t.amount;
        else if (kind === 'extra') extra += t.amount;
        else oneTime += t.amount;
      } else {
        expTxs.push(t);
        byCat[t.category] = (byCat[t.category] ?? 0) + t.amount;
      }
    }

    const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const hasPrimary =
      primaryIncome.enabled &&
      (primaryIncome.creditedCycles.includes(selectedMonth) ||
        incTxs.some(
          (tx) =>
            tx.primaryCycleKey === selectedMonth ||
            (getTransactionIncomeKind(tx) === 'monthly' &&
              tx.title.toLowerCase() === primaryIncome.title.toLowerCase())
        ));

    return {
      incomeTransactions: incTxs,
      expenseTransactions: expTxs,
      monthlyIncomeTotal: monthly,
      extraIncomeTotal: extra,
      oneTimeIncomeTotal: oneTime,
      incomeKindSummary: [
        {
          id: 'monthly' as IncomeKind,
          label: 'Ամսական',
          amount: monthly,
          barClass: 'bg-emerald-500',
          textClass: 'text-emerald-600 dark:text-emerald-400',
        },
        {
          id: 'extra' as IncomeKind,
          label: 'Հավելյալ',
          amount: extra,
          barClass: 'bg-[#2563EB] dark:bg-[#3B82F6]',
          textClass: 'text-[#2563EB] dark:text-[#60A5FA]',
        },
        {
          id: 'one_time' as IncomeKind,
          label: 'Միանգամյա',
          amount: oneTime,
          barClass: 'bg-amber-500',
          textClass: 'text-amber-600 dark:text-amber-400',
        },
      ],
      expenseByCategory: byCat,
      sortedCategories: sortedCats,
      savingsPct:
        totalIncome > 0
          ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100)
          : null,
      hasCurrentPrimaryCredited: hasPrimary,
    };
  }, [
    monthTransactions,
    primaryIncome,
    selectedMonth,
    totalIncome,
    totalExpense,
  ]);

  const {
    incomeDeltaPct,
    expenseDeltaPct,
    repeatableMonthlyIncomes,
  } = useMemo(() => {
    const prevMonthKey = shiftMonthKey(selectedMonth, -1);
    const prevMonthTransactions = transactions.filter((t) =>
      isDateInCycle(t.date, prevMonthKey, effectivePayday)
    );
    const prevIncome = prevMonthTransactions
      .filter(
        (t) => t.type === 'income' && t.category !== INTERNAL_TRANSFER_CATEGORY
      )
      .reduce((sum, t) => sum + t.amount, 0);
    const prevExpense = prevMonthTransactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          !t.isPending &&
          t.category !== INTERNAL_TRANSFER_CATEGORY
      )
      .reduce((sum, t) => sum + t.amount, 0);

    const repeatable = prevMonthTransactions.filter(
      (t) =>
        t.type === 'income' &&
        t.category !== INTERNAL_TRANSFER_CATEGORY &&
        getTransactionIncomeKind(t) === 'monthly' &&
        !incomeTransactions.some(
          (cur) => cur.title.toLowerCase() === t.title.toLowerCase()
        )
    );

    return {
      incomeDeltaPct: calcDeltaPct(totalIncome, prevIncome),
      expenseDeltaPct: calcDeltaPct(totalExpense, prevExpense),
      repeatableMonthlyIncomes: repeatable,
    };
  }, [
    transactions,
    selectedMonth,
    effectivePayday,
    incomeTransactions,
    totalIncome,
    totalExpense,
  ]);

  const {
    dailyBurnRate,
    projectedMonthlyExpense,
    projectedRemainingExpense,
    unpaidBillsTotal,
    actualPacePct,
    projectedTotalBarPct,
    projectedAddBarPct,
    projectionStatusText,
    projectionStatusClass,
  } = useMemo(() => {
    const recordedToDateExpense = cycleMetrics.isCurrentCycle
      ? expenseTransactions
          .filter((t) => t.date <= todayISO)
          .reduce((sum, t) => sum + t.amount, 0)
      : totalExpense;
    const futureDatedExpense = Math.max(0, totalExpense - recordedToDateExpense);

    const priorExpenseMonths: [string, number][] = [1, 2, 3, 4, 5, 6]
      .map((offset) => {
        const k = shiftMonthKey(selectedMonth, -offset);
        const sum = transactions
          .filter(
            (t) =>
              t.type === 'expense' &&
              !t.isPending &&
              t.category !== INTERNAL_TRANSFER_CATEGORY &&
              isDateInCycle(t.date, k, effectivePayday)
          )
          .reduce((s, t) => s + t.amount, 0);
        return [k, sum] as [string, number];
      })
      .filter(([, sum]) => sum > 0);

    const historicalMonthlyAvg =
      priorExpenseMonths.length > 0
        ? Math.round(
            priorExpenseMonths.reduce((sum, [, val]) => sum + val, 0) /
              priorExpenseMonths.length
          )
        : null;

    const burnRate = cycleMetrics.isFutureCycle
      ? (historicalMonthlyAvg ?? 0) / cycleMetrics.totalDays
      : recordedToDateExpense / Math.max(1, cycleMetrics.elapsedDays);

    const projected = cycleMetrics.isPastCycle
      ? totalExpense
      : cycleMetrics.isCurrentCycle
        ? recordedToDateExpense > 0
          ? Math.round(burnRate * cycleMetrics.totalDays + futureDatedExpense)
          : Math.round(futureDatedExpense)
        : Math.round(Math.max(totalExpense, historicalMonthlyAvg ?? 0));

    const remainingProjected = Math.max(0, projected - totalExpense);

    const unpaid = recurringBills.filter(
      (bill) =>
        bill.active !== false &&
        getBillFrequency(bill) === 'monthly' &&
        !monthTransactions.some(
          (tx) =>
            tx.type === 'expense' &&
            tx.title.toLowerCase() === bill.title.toLowerCase()
        )
    );
    const unpaidTotal = unpaid.reduce((sum, b) => sum + b.amount, 0);
    const totalBudgetLimit = budgets.reduce((sum, b) => sum + b.limit, 0);

    const projectionBaseline =
      totalBudgetLimit > 0
        ? totalBudgetLimit
        : totalIncome > 0
          ? totalIncome
          : Math.max(projected, totalExpense, 1);
    const actualPct = Math.min(
      100,
      Math.round((totalExpense / projectionBaseline) * 100)
    );
    const projectedTotalPct = Math.min(
      100,
      Math.round((projected / projectionBaseline) * 100)
    );
    const projectedAddPct = Math.max(0, projectedTotalPct - actualPct);

    let statusText = 'Հաշվարկված է ընթացիկ տեմպով';
    let statusClass = 'text-[#64748B] dark:text-[#94A3B8]';

    if (cycleMetrics.isPastCycle) {
      if (totalBudgetLimit > 0) {
        if (totalExpense > totalBudgetLimit) {
          statusText = `Բյուջեից +${formatMoney(totalExpense - totalBudgetLimit, currency)}`;
          statusClass = 'text-rose-600 dark:text-rose-400';
        } else {
          statusText = `Բյուջեի սահմաններում · Մնաց ${formatMoney(totalBudgetLimit - totalExpense, currency)}`;
          statusClass = 'text-emerald-600 dark:text-emerald-400';
        }
      } else {
        statusText = 'Ամիսն ավարտված է';
      }
    } else if (totalBudgetLimit > 0) {
      const budgetRatio = projected / totalBudgetLimit;
      if (projected > totalBudgetLimit) {
        statusText = `Բյուջեն գերազանցելու ռիսկ · +${formatMoney(projected - totalBudgetLimit, currency)}`;
        statusClass = 'text-rose-600 dark:text-rose-400';
      } else if (budgetRatio >= 0.85) {
        statusText = `Մոտ է բյուջեի սահմանին · Մնացորդ՝ ${formatMoney(totalBudgetLimit - projected, currency)}`;
        statusClass = 'text-amber-600 dark:text-amber-400';
      } else {
        statusText = `Բյուջեի սահմաններում · Պահուստ՝ ${formatMoney(totalBudgetLimit - projected, currency)}`;
        statusClass = 'text-emerald-600 dark:text-emerald-400';
      }
    } else if (totalIncome > 0 && projected > 0) {
      const incRatio = projected / totalIncome;
      if (projected > totalIncome) {
        statusText = `Եկամտից +${formatMoney(projected - totalIncome, currency)} ավելի ծախս`;
        statusClass = 'text-rose-600 dark:text-rose-400';
      } else if (incRatio >= 0.85) {
        statusText = `Եկամտի ${Math.round(incRatio * 100)}%-ը՝ բարձր տեմպ`;
        statusClass = 'text-amber-600 dark:text-amber-400';
      } else {
        statusText = `Կանխատեսվող խնայողություն՝ ${formatMoney(totalIncome - projected, currency)}`;
        statusClass = 'text-emerald-600 dark:text-emerald-400';
      }
    }

    return {
      dailyBurnRate: burnRate,
      projectedMonthlyExpense: projected,
      projectedRemainingExpense: remainingProjected,
      unpaidBillsTotal: unpaidTotal,
      actualPacePct: actualPct,
      projectedTotalBarPct: projectedTotalPct,
      projectedAddBarPct: projectedAddPct,
      projectionStatusText: statusText,
      projectionStatusClass: statusClass,
    };
  }, [
    cycleMetrics,
    expenseTransactions,
    todayISO,
    totalExpense,
    totalIncome,
    selectedMonth,
    transactions,
    effectivePayday,
    recurringBills,
    monthTransactions,
    budgets,
    currency,
  ]);

  const monthlySeries: MonthlyPoint[] = useMemo(() => {
    const last6Months = getLastNMonthsKeys(selectedMonth, 6);
    return last6Months.map((monthKey) => {
      const items = transactions.filter(
        (t) =>
          t.category !== INTERNAL_TRANSFER_CATEGORY &&
          isDateInCycle(t.date, monthKey, effectivePayday)
      );
      const inc = items
        .filter((t) => t.type === 'income')
        .reduce((s, t) => s + t.amount, 0);
      const exp = items
        .filter((t) => t.type === 'expense' && !t.isPending)
        .reduce((s, t) => s + t.amount, 0);
      return {
        monthKey,
        label: getCycleShortLabel(monthKey, effectivePayday),
        income: inc,
        expense: exp,
      };
    });
  }, [selectedMonth, transactions, effectivePayday]);

  const last3MonthsSeries = useMemo(() => {
    const last3MonthsKeys = getLastNMonthsKeys(selectedMonth, 3);
    return last3MonthsKeys.map((monthKey) => {
      const items = transactions.filter(
        (t) =>
          t.category !== INTERNAL_TRANSFER_CATEGORY &&
          isDateInCycle(t.date, monthKey, effectivePayday)
      );
      const inc = items
        .filter((t) => t.type === 'income')
        .reduce((s, t) => s + t.amount, 0);
      const exp = items
        .filter((t) => t.type === 'expense' && !t.isPending)
        .reduce((s, t) => s + t.amount, 0);
      return {
        monthKey,
        label: formatCycleLabel(monthKey, effectivePayday),
        income: inc,
        expense: exp,
      };
    });
  }, [selectedMonth, transactions, effectivePayday]);

  const categoryComparisonData = useMemo(
    () =>
      budgets.length > 0
        ? budgets.map((b) => ({
            category: b.category,
            spent: expenseByCategory[b.category] ?? 0,
            limit: b.limit,
          }))
        : sortedCategories.slice(0, 6).map(([cat, val]) => ({
            category: cat,
            spent: val,
            limit: 0,
          })),
    [budgets, expenseByCategory, sortedCategories]
  );

  const donutSegments = useMemo(
    () =>
      sortedCategories.map(([cat, val], idx) => {
        const share = totalExpense > 0 ? val / totalExpense : 0;
        const budget = budgets.find((b) => b.category === cat);
        return {
          category: cat,
          amount: val,
          pct: Math.round(share * 100),
          color: DONUT_COLORS[idx % DONUT_COLORS.length],
          budgetLimit: budget?.limit,
        };
      }),
    [sortedCategories, totalExpense, budgets]
  );

  const pieExpenseSegments: CategoryDonutPoint[] = useMemo(() => {
    const confirmedByCat = monthTransactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          !t.isPending &&
          t.category !== INTERNAL_TRANSFER_CATEGORY
      )
      .reduce<Record<string, number>>((acc, t) => {
        acc[t.category] = (acc[t.category] ?? 0) + t.amount;
        return acc;
      }, {});
    const entries = Object.entries(confirmedByCat).sort((a, b) => b[1] - a[1]);
    const confirmedSum = entries.reduce((sum, [, val]) => sum + val, 0);
    return entries.map(([cat, val], idx) => {
      const budget = budgets.find((b) => b.category === cat);
      return {
        category: cat,
        amount: val,
        pct: confirmedSum > 0 ? Math.round((val / confirmedSum) * 100) : 0,
        color: DONUT_COLORS[idx % DONUT_COLORS.length],
        budgetLimit: budget?.limit,
      };
    });
  }, [monthTransactions, budgets]);

  const topExpensesForAdvice = useMemo(
    () =>
      [...expenseTransactions]
        .filter((t) => !t.isPending && t.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 6)
        .map((t) => ({
          title: t.title,
          category: t.category,
          amount: t.amount,
        })),
    [expenseTransactions]
  );

  const handleExportCSV = () => {
    const headers = ['Ամսաթիվ', 'Տեսակ', 'Կատեգորիա', 'Աղբյուր / Նպատակ', 'Գումար'];
    const rows = [...transactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((tx) => [
        tx.date,
        tx.type === 'income'
          ? `${INCOME_KIND_LABELS[getTransactionIncomeKind(tx)]} եկամուտ`
          : 'Ծախս',
        tx.category,
        `"${tx.title.replace(/"/g, '""')}"`,
        String(tx.type === 'income' ? tx.amount : -tx.amount),
      ]);
    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finances-${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const mobileTabItems = useMemo(
    () => [
      { id: 'ledger' as const, label: 'Գործարքներ', icon: Receipt, count: monthTransactions.length },
      { id: 'cards' as const, label: 'Քարտեր', icon: CreditCard, count: cards.length },
      { id: 'budgets' as const, label: 'Բյուջե և Ցիկլ', icon: Target, count: budgets.length },
      { id: 'bills' as const, label: 'Վճարներ', icon: CalendarClock, count: recurringBills.length },
      { id: 'goals' as const, label: 'Նպատակներ', icon: PiggyBank, count: savingsGoals.length },
      { id: 'debts' as const, label: 'Պարտքեր', icon: HandCoins, count: debts.filter((d) => !d.settled).length },
      { id: 'analytics' as const, label: 'Վերլուծություն', icon: BarChart3 },
    ],
    [monthTransactions.length, cards.length, budgets.length, recurringBills.length, savingsGoals.length, debts]
  );

  return (
    <div className="space-y-5">
      <SubPageTabs
        mobileOnly
        items={mobileTabItems}
        activeId={activePage}
        onSelect={onSelectPage}
        ariaLabel="Ֆինանսների ենթաբաժիններ"
      />

      {/* Cycle Summary Card */}
      <section
        aria-label="Ընտրված ցիկլի ֆինանսական ամփոփում"
        className="surface-card overflow-hidden"
      >
        <div className="px-4 sm:px-6 py-3.5 border-b border-[#E2E8F0]/80 dark:border-[#1B2538] flex flex-wrap items-center justify-between gap-2.5">
          <div className="min-w-0">
            <h2 className="font-display text-sm sm:text-[15px] font-semibold tracking-tight text-[#0F172A] dark:text-[#F8FAFC] truncate">
              Ցիկլի ֆինանսական ամփոփում
            </h2>
            <p className="text-[11px] sm:text-xs text-[#64748B] dark:text-[#94A3B8] truncate tabular-nums">
              {cycleLabel} · {monthTransactions.length} գործարք
            </p>
          </div>
          <MonthCycleNav
            selectedMonth={selectedMonth}
            payday={effectivePayday}
            onShiftMonth={handleShiftMonth}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#E2E8F0]/80 dark:divide-[#1B2538]">
          <div className="px-4 sm:px-6 py-4 min-w-0">
            <p className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8] truncate">
              Ընդհանուր եկամուտ
            </p>
            <p className="mt-1.5 font-mono text-xl sm:text-[22px] leading-snug font-semibold tracking-tight tabular-nums pa-sensitive text-emerald-600 dark:text-emerald-400 truncate">
              +{formatMoney(totalIncome, currency)}
            </p>
            <p className="mt-1 text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate tabular-nums">
              {incomeDeltaPct !== null
                ? `${incomeDeltaPct >= 0 ? '+' : ''}${incomeDeltaPct}% նախորդ ցիկլից`
                : 'Հաստատված մուտքեր'}
            </p>
          </div>

          <div className="px-4 sm:px-6 py-4 min-w-0">
            <p className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8] truncate">
              Ընդհանուր ծախսեր
            </p>
            <p className="mt-1.5 font-mono text-xl sm:text-[22px] leading-snug font-semibold tracking-tight tabular-nums pa-sensitive text-rose-600 dark:text-rose-400 truncate">
              -{formatMoney(totalExpense, currency)}
            </p>
            <p className="mt-1 text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate tabular-nums">
              {cyclePendingExpense > 0
                ? `Նախածախս՝ ${formatMoney(cyclePendingExpense, currency)}`
                : expenseDeltaPct !== null
                  ? `${expenseDeltaPct >= 0 ? '+' : ''}${expenseDeltaPct}% նախորդ ցիկլից`
                  : 'Փաստացի ծախսեր'}
            </p>
          </div>

          <div className="px-4 sm:px-6 py-4 min-w-0">
            <p className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8] truncate">
              Զուտ խնայողություն
            </p>
            <p
              className={`mt-1.5 font-mono text-xl sm:text-[22px] leading-snug font-semibold tracking-tight tabular-nums pa-sensitive truncate ${
                netSavings > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : netSavings < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-[#0F172A] dark:text-[#F8FAFC]'
              }`}
            >
              {netSavings > 0 ? '+' : ''}
              {formatMoney(netSavings, currency)}
            </p>
            <p className="mt-1 text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate tabular-nums">
              {savingsPct !== null
                ? netSavings >= 0
                  ? `Խնայողության մակարդակ՝ ${savingsPct}%`
                  : `Եկամտից ${Math.abs(savingsPct)}% գերծախս`
                : 'Եկամուտների և ծախսերի տարբերություն'}
            </p>
          </div>
        </div>

        <BudgetForecastWarningStrip
          forecast={currentCycleForecast}
          currency={currency}
          showNavigateButton={activePage !== 'budgets'}
          onOpenBudgetsPage={() => onSelectPage('budgets')}
        />
      </section>

      {activePage === 'ledger' && (
        <Suspense
          fallback={
            <div className="surface-card h-[300px] skeleton-shimmer rounded-2xl" />
          }
        >
          <SpendingTrendLineCard
            selectedMonth={selectedMonth}
            effectivePayday={effectivePayday}
            currency={currency}
            transactions={transactions}
          />
        </Suspense>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onImportJSON(file);
            e.target.value = '';
          }
        }}
      />

      <AnimatePresence mode="wait" onExitComplete={scrollToTopInstant}>
        <motion.div
          key={activePage}
          initial={
            prefersReducedMotion ? false : { opacity: 0, y: 10, scale: 0.996 }
          }
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={
            prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.996 }
          }
          transition={{
            duration: prefersReducedMotion ? 0.04 : 0.18,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{ willChange: 'transform, opacity' }}
        >
          <Suspense fallback={<PageSkeleton variant={activePage} />}>
            {activePage === 'ledger' && (
              <TransactionsLedgerPage
                selectedMonth={selectedMonth}
                onShiftMonth={handleShiftMonth}
                effectivePayday={effectivePayday}
                currency={currency}
                cards={cards}
                filterCardId={selectedCardFilter}
                onFilterCardChange={setSelectedCardFilter}
                monthTransactions={monthTransactions}
                allTransactions={transactions}
                onOpenNewTransactionModal={onOpenNewTransactionModal}
                onEditTransaction={onEditTransaction}
                onAutoCategorizeTransactions={onAutoCategorizeTransactions}
                onDeleteTransaction={onDeleteTransaction}
                onDuplicateTransaction={onDuplicateTransaction}
                onBulkDeleteTransactions={onBulkDeleteTransactions}
                onBulkAssignCard={onBulkAssignCard}
                onConfirmPreExpense={onConfirmPreExpense}
                onExportCSV={handleExportCSV}
                realBalance={realBalance}
                totalIncome={totalIncome}
                totalExpense={totalExpense}
                pendingExpense={cyclePendingExpense}
                openingBalance={openingBalance}
                incomeDeltaPct={incomeDeltaPct}
                expenseDeltaPct={expenseDeltaPct}
                hasCurrentPrimaryCredited={hasCurrentPrimaryCredited}
                isCurrentCycle={cycleMetrics.isCurrentCycle}
                primaryIncome={primaryIncome}
                onManualCreditPrimaryIncome={onManualCreditPrimaryIncome}
                billSuggestions={billSuggestions}
                onConvertSuggestionToBill={handleConvertSuggestionToBill}
                onOpenSuggestionInBills={handleOpenSuggestionInBills}
                onDismissBillSuggestion={handleDismissBillSuggestion}
              />
            )}

            {activePage === 'cards' && (
              <CardsSection
                cards={cards}
                transactions={transactions}
                currency={currency}
                selectedCardFilter={selectedCardFilter}
                onSelectCardFilter={(cardId) => {
                  setSelectedCardFilter(cardId);
                  if (cardId !== 'all') {
                    onSelectPage('ledger');
                  }
                }}
                onOpenNewCardModal={onOpenNewCardModal}
                onEditCard={onEditCard}
                onDeleteCard={onDeleteCard}
                onSetDefaultCard={onSetDefaultCard}
                onQuickCardIncome={(cardId) =>
                  onQuickCardTransaction('income', cardId)
                }
                onQuickCardExpense={(cardId) =>
                  onQuickCardTransaction('expense', cardId)
                }
                onOpenTransferModal={(fromCardId) =>
                  setTransferModalState({ fromCardId })
                }
              />
            )}

            {activePage === 'budgets' && (
              <BudgetsPage
                selectedMonth={selectedMonth}
                onShiftMonth={handleShiftMonth}
                effectivePayday={effectivePayday}
                cycleLabel={cycleLabel}
                currency={currency}
                primaryIncome={primaryIncome}
                onSavePrimaryIncome={onSavePrimaryIncome}
                onDisablePrimaryIncome={onDisablePrimaryIncome}
                onManualCreditPrimaryIncome={onManualCreditPrimaryIncome}
                hasCurrentPrimaryCredited={hasCurrentPrimaryCredited}
                cycleMetrics={cycleMetrics}
                safeToSpend={safeToSpend}
                budgets={budgets}
                expenseByCategory={expenseByCategory}
                budgetForecast={selectedCycleForecast}
                onSaveBudget={onSaveBudget}
                onDeleteBudget={onDeleteBudget}
              />
            )}

            {activePage === 'bills' && (
              <RecurringBillsPage
                selectedMonth={selectedMonth}
                onShiftMonth={handleShiftMonth}
                effectivePayday={effectivePayday}
                cycleLabel={cycleLabel}
                currency={currency}
                primaryIncome={primaryIncome}
                recurringBills={recurringBills}
                onAddRecurringBill={onAddRecurringBill}
                onUpdateRecurringBill={onUpdateRecurringBill}
                onDeleteRecurringBill={onDeleteRecurringBill}
                onToggleBillActive={onToggleBillActive}
                onPayAllRecurringBills={onPayAllRecurringBills}
                onConfirmBillSlot={onConfirmBillSlot}
                onSkipBillSlot={onSkipBillSlot}
                currentHHMM={currentHHMM}
                monthTransactions={monthTransactions}
                onAddTransaction={onAddTransaction}
                billSuggestions={billSuggestions}
                prefillSuggestion={prefillBillSuggestion}
                onConsumePrefillSuggestion={() => setPrefillBillSuggestion(null)}
                onConvertSuggestionToBill={handleConvertSuggestionToBill}
                onDismissBillSuggestion={handleDismissBillSuggestion}
              />
            )}

            {activePage === 'goals' && (
              <SavingsGoalsPage
                currency={currency}
                savingsGoals={savingsGoals}
                onOpenNewGoalModal={onOpenNewGoalModal}
                onEditGoal={onEditGoal}
                onAdjustGoal={onAdjustGoal}
                onDeleteGoal={onDeleteGoal}
              />
            )}

            {activePage === 'debts' && (
              <DebtsPage
                currency={currency}
                debts={debts}
                onOpenNewDebtModal={onOpenNewDebtModal}
                onEditDebt={onEditDebt}
                onRecordDebtPayment={onRecordDebtPayment}
                onDeleteDebt={onDeleteDebt}
              />
            )}

            {activePage === 'analytics' && (
              <AnalyticsAndReportsPage
                selectedMonth={selectedMonth}
                onShiftMonth={handleShiftMonth}
                onChangeMonth={onChangeMonth}
                effectivePayday={effectivePayday}
                cycleLabel={cycleLabel}
                currency={currency}
                transactions={transactions}
                monthTransactions={monthTransactions}
                incomeTransactions={incomeTransactions}
                expenseTransactions={expenseTransactions}
                budgets={budgets}
                cycleMetrics={cycleMetrics}
                openingBalance={openingBalance}
                totalIncome={totalIncome}
                totalExpense={totalExpense}
                netSavings={netSavings}
                realBalance={realBalance}
                monthlyIncomeTotal={monthlyIncomeTotal}
                extraIncomeTotal={extraIncomeTotal}
                oneTimeIncomeTotal={oneTimeIncomeTotal}
                savingsPct={savingsPct}
                incomeDeltaPct={incomeDeltaPct}
                expenseDeltaPct={expenseDeltaPct}
                repeatableMonthlyIncomes={repeatableMonthlyIncomes}
                onRepeatMonthlyIncomes={onRepeatMonthlyIncomes}
                dailyBurnRate={dailyBurnRate}
                projectedMonthlyExpense={projectedMonthlyExpense}
                projectedRemainingExpense={projectedRemainingExpense}
                unpaidBillsTotal={unpaidBillsTotal}
                actualPacePct={actualPacePct}
                projectedTotalBarPct={projectedTotalBarPct}
                projectedAddBarPct={projectedAddBarPct}
                projectionStatusText={projectionStatusText}
                projectionStatusClass={projectionStatusClass}
                donutSegments={donutSegments}
                pieExpenseSegments={pieExpenseSegments}
                topExpensesForAdvice={topExpensesForAdvice}
                categoryComparisonData={categoryComparisonData}
                monthlySeries={monthlySeries}
                last3MonthsSeries={last3MonthsSeries}
                incomeKindSummary={incomeKindSummary}
                expenseByCategory={expenseByCategory}
                onNotify={onNotify}
                onSelectCategoryFilter={() => onSelectPage('ledger')}
                onExportJSON={onExportJSON}
                onRequestImportJSON={() => fileInputRef.current?.click()}
              />
            )}
          </Suspense>
        </motion.div>
      </AnimatePresence>

      {transferModalState && (
        <CardTransferModal
          cards={cards}
          transactions={transactions}
          currency={currency}
          initialFromCardId={transferModalState.fromCardId}
          onClose={() => setTransferModalState(null)}
          onTransfer={onTransferBetweenCards}
        />
      )}
    </div>
  );
});
