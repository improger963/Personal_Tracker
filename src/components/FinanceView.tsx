import React, { Suspense, lazy, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  PiggyBank,
  Receipt,
  ShieldCheck,
  Target,
  TrendingUp,
  Upload,
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
  CategoryDonutTooltip,
  DONUT_COLORS,
  FinancePageTab,
  MonthlyHealthTooltip,
  MonthlyPoint,
  calcDeltaPct,
  formatAxisCompact,
} from './finance/financeShared';
import { CardsSection } from './finance/CardsSection';
import { CardTransferModal } from './finance/CardTransferModal';
import { MonthlySavingsAdviceCard } from './finance/MonthlySavingsAdviceCard';
import { EmptyStatePlaceholder, PageSkeleton } from './ui/Skeleton';
import { scrollToTopInstant, scrollToTopSmooth } from '../utils/scroll';
import { INTERNAL_TRANSFER_CATEGORY } from '../utils/cardBalances';

const TransactionsLedgerPage = lazy(() =>
  import('./finance/TransactionsLedgerPage').then((m) => ({
    default: m.TransactionsLedgerPage,
  }))
);
const BudgetsAndBillsPage = lazy(() =>
  import('./finance/BudgetsAndBillsPage').then((m) => ({
    default: m.BudgetsAndBillsPage,
  }))
);
const AnalyticsAndReportsPage = lazy(() =>
  import('./finance/AnalyticsAndReportsPage').then((m) => ({
    default: m.AnalyticsAndReportsPage,
  }))
);
const GoalsAndDebtsPage = lazy(() =>
  import('./finance/GoalsAndDebtsPage').then((m) => ({
    default: m.GoalsAndDebtsPage,
  }))
);
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

interface FinanceViewProps {
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

export function FinanceView({
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
  onRepeatMonthlyIncomes,
  onNotify,
  budgets,
  onSaveBudget,
  onDeleteBudget,
  recurringBills,
  onAddRecurringBill,
  onUpdateRecurringBill,
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

  const [dynamicsRange, setDynamicsRange] = useState<6 | 12>(6);
  const [dynamicsMode, setDynamicsMode] = useState<'area' | 'bar'>('area');
  const [showIncomeSeries, setShowIncomeSeries] = useState(true);
  const [showExpenseSeries, setShowExpenseSeries] = useState(true);
  const [showNetSeries, setShowNetSeries] = useState(false);
  const [isDynamicsExpanded, setIsDynamicsExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('pa_finance_dynamics_open');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const [hoveredPieCategory, setHoveredPieCategory] = useState<string | null>(null);
  const [isPieExpanded, setIsPieExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('pa_finance_pie_open');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const toggleDynamicsExpanded = () => {
    setIsDynamicsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('pa_finance_dynamics_open', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const togglePieExpanded = () => {
    setIsPieExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('pa_finance_pie_open', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // 4 Dedicated Pages State (Default to 'ledger' or stored user preference)
  const [activePage, setActivePage] = useState<FinancePageTab>(() => {
    try {
      const saved = localStorage.getItem('pa_finance_active_page');
      if (
        saved === 'ledger' ||
        saved === 'budgets' ||
        saved === 'goals_debts' ||
        saved === 'analytics'
      ) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'ledger';
  });

  const handleSelectPage = (page: FinancePageTab) => {
    if (page === activePage) {
      scrollToTopSmooth();
      return;
    }
    setActivePage(page);
    try {
      localStorage.setItem('pa_finance_active_page', page);
    } catch {
      // ignore
    }
  };

  const effectivePayday = getEffectivePayday(primaryIncome);
  const cycleLabel = formatCycleLabel(selectedMonth, effectivePayday);
  const todayISO = getTodayISO();
  const cycleMetrics = getCycleDayMetrics(selectedMonth, effectivePayday, todayISO);

  const {
    cycleTransactions: monthTransactions,
    openingBalance,
    cycleIncome: totalIncome,
    cycleExpense: totalExpense,
    cyclePendingExpense,
    cycleNet: netSavings,
    cycleEndBalance: realBalance,
  } = computeCycleFinancials(transactions, selectedMonth, effectivePayday, todayISO);

  const incomeTransactions = monthTransactions.filter(
    (t) => t.type === 'income' && t.category !== INTERNAL_TRANSFER_CATEGORY
  );
  const expenseTransactions = monthTransactions.filter(
    (t) => t.type === 'expense' && t.category !== INTERNAL_TRANSFER_CATEGORY
  );

  const monthlyIncomeTotal = incomeTransactions
    .filter((t) => getTransactionIncomeKind(t) === 'monthly')
    .reduce((sum, t) => sum + t.amount, 0);
  const extraIncomeTotal = incomeTransactions
    .filter((t) => getTransactionIncomeKind(t) === 'extra')
    .reduce((sum, t) => sum + t.amount, 0);
  const oneTimeIncomeTotal = incomeTransactions
    .filter((t) => getTransactionIncomeKind(t) === 'one_time')
    .reduce((sum, t) => sum + t.amount, 0);

  const incomeKindSummary = [
    {
      id: 'monthly' as IncomeKind,
      label: 'Ամսական',
      amount: monthlyIncomeTotal,
      barClass: 'bg-emerald-500',
      textClass: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      id: 'extra' as IncomeKind,
      label: 'Հավելյալ',
      amount: extraIncomeTotal,
      barClass: 'bg-[#2563EB] dark:bg-[#3B82F6]',
      textClass: 'text-[#2563EB] dark:text-[#60A5FA]',
    },
    {
      id: 'one_time' as IncomeKind,
      label: 'Միանգամյա',
      amount: oneTimeIncomeTotal,
      barClass: 'bg-amber-500',
      textClass: 'text-amber-600 dark:text-amber-400',
    },
  ];

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

  const incomeDeltaPct = calcDeltaPct(totalIncome, prevIncome);
  const expenseDeltaPct = calcDeltaPct(totalExpense, prevExpense);

  const repeatableMonthlyIncomes = prevMonthTransactions.filter(
    (t) =>
      t.type === 'income' &&
      t.category !== INTERNAL_TRANSFER_CATEGORY &&
      getTransactionIncomeKind(t) === 'monthly' &&
      !incomeTransactions.some(
        (cur) => cur.title.toLowerCase() === t.title.toLowerCase()
      )
  );

  const expenseByCategory = monthTransactions
    .filter(
      (t) => t.type === 'expense' && t.category !== INTERNAL_TRANSFER_CATEGORY
    )
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.category] = (acc[t.category] ?? 0) + t.amount;
      return acc;
    }, {});

  const sortedCategories = Object.entries(expenseByCategory).sort(
    (a, b) => b[1] - a[1]
  );

  const savingsPct =
    totalIncome > 0
      ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100)
      : null;

  const hasCurrentPrimaryCredited =
    primaryIncome.enabled &&
    (primaryIncome.creditedCycles.includes(selectedMonth) ||
      incomeTransactions.some(
        (tx) =>
          tx.primaryCycleKey === selectedMonth ||
          (getTransactionIncomeKind(tx) === 'monthly' &&
            tx.title.toLowerCase() === primaryIncome.title.toLowerCase())
      ));

  // Burn rate and projections calculation
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

  const dailyBurnRate = cycleMetrics.isFutureCycle
    ? (historicalMonthlyAvg ?? 0) / cycleMetrics.totalDays
    : recordedToDateExpense / Math.max(1, cycleMetrics.elapsedDays);

  const projectedMonthlyExpense = cycleMetrics.isPastCycle
    ? totalExpense
    : cycleMetrics.isCurrentCycle
      ? recordedToDateExpense > 0
        ? Math.round(dailyBurnRate * cycleMetrics.totalDays + futureDatedExpense)
        : Math.round(futureDatedExpense)
      : Math.round(Math.max(totalExpense, historicalMonthlyAvg ?? 0));

  const projectedRemainingExpense = Math.max(
    0,
    projectedMonthlyExpense - totalExpense
  );

  const unpaidBills = recurringBills.filter(
    (bill) =>
      getBillFrequency(bill) === 'monthly' &&
      !monthTransactions.some(
        (tx) =>
          tx.type === 'expense' &&
          tx.title.toLowerCase() === bill.title.toLowerCase()
      )
  );
  const unpaidBillsTotal = unpaidBills.reduce((sum, b) => sum + b.amount, 0);
  const totalBudgetLimit = budgets.reduce((sum, b) => sum + b.limit, 0);

  const projectionBaseline =
    totalBudgetLimit > 0
      ? totalBudgetLimit
      : totalIncome > 0
        ? totalIncome
        : Math.max(projectedMonthlyExpense, totalExpense, 1);
  const actualPacePct = Math.min(
    100,
    Math.round((totalExpense / projectionBaseline) * 100)
  );
  const projectedTotalBarPct = Math.min(
    100,
    Math.round((projectedMonthlyExpense / projectionBaseline) * 100)
  );
  const projectedAddBarPct = Math.max(0, projectedTotalBarPct - actualPacePct);

  let projectionStatusText = 'Հաշվարկված է ընթացիկ տեմպով';
  let projectionStatusClass = 'text-[#64748B] dark:text-[#94A3B8]';

  if (cycleMetrics.isPastCycle) {
    if (totalBudgetLimit > 0) {
      if (totalExpense > totalBudgetLimit) {
        projectionStatusText = `Բյուջեից +${formatMoney(totalExpense - totalBudgetLimit, currency)}`;
        projectionStatusClass = 'text-rose-600 dark:text-rose-400';
      } else {
        projectionStatusText = `Բյուջեի սահմաններում · Մնաց ${formatMoney(totalBudgetLimit - totalExpense, currency)}`;
        projectionStatusClass = 'text-emerald-600 dark:text-emerald-400';
      }
    } else {
      projectionStatusText = 'Ամիսն ավարտված է';
    }
  } else if (totalBudgetLimit > 0) {
    const budgetRatio = projectedMonthlyExpense / totalBudgetLimit;
    if (projectedMonthlyExpense > totalBudgetLimit) {
      projectionStatusText = `Բյուջեն գերազանցելու ռիսկ · +${formatMoney(projectedMonthlyExpense - totalBudgetLimit, currency)}`;
      projectionStatusClass = 'text-rose-600 dark:text-rose-400';
    } else if (budgetRatio >= 0.85) {
      projectionStatusText = `Մոտ է բյուջեի սահմանին · Մնացորդ՝ ${formatMoney(totalBudgetLimit - projectedMonthlyExpense, currency)}`;
      projectionStatusClass = 'text-amber-600 dark:text-amber-400';
    } else {
      projectionStatusText = `Բյուջեի սահմաններում · Պահուստ՝ ${formatMoney(totalBudgetLimit - projectedMonthlyExpense, currency)}`;
      projectionStatusClass = 'text-emerald-600 dark:text-emerald-400';
    }
  } else if (totalIncome > 0 && projectedMonthlyExpense > 0) {
    const incRatio = projectedMonthlyExpense / totalIncome;
    if (projectedMonthlyExpense > totalIncome) {
      projectionStatusText = `Եկամտից +${formatMoney(projectedMonthlyExpense - totalIncome, currency)} ավելի ծախս`;
      projectionStatusClass = 'text-rose-600 dark:text-rose-400';
    } else if (incRatio >= 0.85) {
      projectionStatusText = `Եկամտի ${Math.round(incRatio * 100)}%-ը՝ բարձր տեմպ`;
      projectionStatusClass = 'text-amber-600 dark:text-amber-400';
    } else {
      projectionStatusText = `Կանխատեսվող խնայողություն՝ ${formatMoney(totalIncome - projectedMonthlyExpense, currency)}`;
      projectionStatusClass = 'text-emerald-600 dark:text-emerald-400';
    }
  }

  // 6-Month Trend Data
  const last6Months = getLastNMonthsKeys(selectedMonth, 6);
  const monthlySeries: MonthlyPoint[] = last6Months.map((monthKey) => {
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

  // 6 or 12-Month Dynamics Chart Data
  const dynamicsSeries = useMemo(() => {
    const keys = getLastNMonthsKeys(selectedMonth, dynamicsRange);
    return keys.map((monthKey) => {
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
      const shortLabel = getCycleShortLabel(monthKey, effectivePayday);
      const yearSuffix = dynamicsRange === 12 ? ` '${monthKey.slice(2, 4)}` : '';
      return {
        monthKey,
        label: `${shortLabel}${yearSuffix}`,
        income: inc,
        expense: exp,
        net: inc - exp,
      };
    });
  }, [transactions, selectedMonth, dynamicsRange, effectivePayday]);

  const dynamicsStats = useMemo(() => {
    const totalRangeIncome = dynamicsSeries.reduce((s, p) => s + p.income, 0);
    const totalRangeExpense = dynamicsSeries.reduce((s, p) => s + p.expense, 0);
    const activeMonthsCount = Math.max(
      1,
      dynamicsSeries.filter((p) => p.income > 0 || p.expense > 0).length
    );
    return {
      avgIncome: Math.round(totalRangeIncome / activeMonthsCount),
      avgExpense: Math.round(totalRangeExpense / activeMonthsCount),
      netTotal: totalRangeIncome - totalRangeExpense,
      hasAnyData: totalRangeIncome > 0 || totalRangeExpense > 0,
    };
  }, [dynamicsSeries]);

  // 3-Month Comparative Data
  const last3MonthsKeys = getLastNMonthsKeys(selectedMonth, 3);
  const last3MonthsSeries = last3MonthsKeys.map((monthKey) => {
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

  const categoryComparisonData =
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
        }));

  const donutSegments = sortedCategories.map(([cat, val], idx) => {
    const share = totalExpense > 0 ? val / totalExpense : 0;
    const budget = budgets.find((b) => b.category === cat);
    return {
      category: cat,
      amount: val,
      pct: Math.round(share * 100),
      color: DONUT_COLORS[idx % DONUT_COLORS.length],
      budgetLimit: budget?.limit,
    };
  });

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

  const activeHoveredSegment = hoveredPieCategory
    ? pieExpenseSegments.find((s) => s.category === hoveredPieCategory) ?? null
    : null;

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

  const activeGoalsCount = savingsGoals.filter(
    (g) => g.currentAmount < g.targetAmount
  ).length;
  const activeDebtsCount = debts.filter((d) => !d.settled).length;

  const pagesConfig = [
    {
      id: 'ledger' as const,
      label: 'Գործարքներ',
      subtitle: 'Մատյան և գրանցումներ',
      icon: Receipt,
      badge: `${monthTransactions.length}`,
    },
    {
      id: 'budgets' as const,
      label: 'Բյուջե և Վճարներ',
      subtitle: 'Կրկնվող ծախսեր և ցիկլ',
      icon: Target,
      badge: `${budgets.length + recurringBills.length}`,
    },
    {
      id: 'goals_debts' as const,
      label: 'Նպատակներ / Պարտքեր',
      subtitle: 'Գանձանակներ և փոխառություններ',
      icon: PiggyBank,
      badge: `${activeGoalsCount + activeDebtsCount}`,
    },
    {
      id: 'analytics' as const,
      label: 'Վերլուծություն',
      subtitle: 'Ամփոփում և գրաֆիկներ',
      icon: BarChart3,
      badge: savingsPct !== null ? `${savingsPct}%` : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Header with Month Navigator and Export/Restore Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
            Ֆինանսների կառավարում
          </h1>
          <p className="text-sm text-[#64748B] dark:text-[#94A3B8]">
            {activePage === 'ledger' && 'Գործարքների մատյան, որոնում և արագ ավելացում'}
            {activePage === 'budgets' && 'Կատեգորիաների բյուջեներ, ամենօրյա և ամսական կրկնվող վճարներ'}
            {activePage === 'goals_debts' && 'Խնայողության գանձանակներ, տրված և վերցված պարտքերի վերահսկում'}
            {activePage === 'analytics' && 'Ամսական ամփոփում, 3 և 6 ամիսների համեմատական վերլուծություն'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Month Selector */}
          <div className="inline-flex items-center border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl bg-white dark:bg-[#0F172A]">
            <button
              type="button"
              onClick={() => onChangeMonth(shiftMonthKey(selectedMonth, -1))}
              aria-label="Նախորդ հաշվարկային ամիս"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#64748B] dark:text-[#94A3B8] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] rounded-l-xl transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3.5 text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] whitespace-nowrap tabular-nums">
              {cycleLabel}
            </span>
            <button
              type="button"
              onClick={() => onChangeMonth(shiftMonthKey(selectedMonth, 1))}
              aria-label="Հաջորդ հաշվարկային ամիս"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#64748B] dark:text-[#94A3B8] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] rounded-r-xl transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={transactions.length === 0}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] inline-flex items-center gap-1.5 hover:border-[#2563EB] dark:hover:border-[#3B82F6] disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={onExportJSON}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] inline-flex items-center gap-1.5 hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Պահուստ</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] inline-flex items-center gap-1.5 hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Վերականգնել</span>
          </button>
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
        </div>
      </div>

      {/* 2. Four Dedicated Pages Switcher */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 p-1.5 rounded-2xl surface-subtle">
        {pagesConfig.map((page) => {
          const Icon = page.icon;
          const isActive = activePage === page.id;
          return (
            <button
              key={page.id}
              type="button"
              onClick={() => handleSelectPage(page.id)}
              className={`min-h-[52px] px-4 py-2.5 rounded-xl text-left flex items-center justify-between gap-3 transition-all cursor-pointer ${
                isActive
                  ? 'bg-white dark:bg-[#0F172A] shadow-md border border-[#E2E8F0] dark:border-[#1E293B]'
                  : 'hover:bg-white/50 dark:hover:bg-[#162033]/50 text-[#64748B] dark:text-[#94A3B8]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    isActive
                      ? 'bg-[#EFF6FF] dark:bg-[#172554] text-[#2563EB] dark:text-[#60A5FA]'
                      : 'bg-transparent text-[#64748B] dark:text-[#94A3B8]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p
                    className={`text-sm font-semibold truncate ${
                      isActive
                        ? 'text-[#0F172A] dark:text-[#F8FAFC]'
                        : 'text-[#475569] dark:text-[#CBD5E1]'
                    }`}
                  >
                    {page.label}
                  </p>
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate hidden sm:block">
                    {page.subtitle}
                  </p>
                </div>
              </div>

              {page.badge && (
                <span
                  className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md tabular-nums shrink-0 ${
                    isActive
                      ? 'bg-[#EFF6FF] dark:bg-[#172554] text-[#2563EB] dark:text-[#60A5FA]'
                      : 'bg-[#E2E8F0]/70 dark:bg-[#1E293B] text-[#64748B] dark:text-[#94A3B8]'
                  }`}
                >
                  {page.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 2.15. Manual Cards & Wallets Section */}
      <CardsSection
        cards={cards}
        transactions={transactions}
        currency={currency}
        selectedCardFilter={selectedCardFilter}
        onSelectCardFilter={(cardId) => {
          setSelectedCardFilter(cardId);
          if (cardId !== 'all' && activePage !== 'ledger') {
            handleSelectPage('ledger');
          }
        }}
        onOpenNewCardModal={onOpenNewCardModal}
        onEditCard={onEditCard}
        onDeleteCard={onDeleteCard}
        onSetDefaultCard={onSetDefaultCard}
        onQuickCardIncome={(cardId) => onQuickCardTransaction('income', cardId)}
        onQuickCardExpense={(cardId) => onQuickCardTransaction('expense', cardId)}
        onOpenTransferModal={(fromCardId) =>
          setTransferModalState({ fromCardId })
        }
      />

      {/* 2.25. Safe-to-Spend Daily Allowance Summary Strip */}
      <section
        aria-label="Օրական անվտանգ բյուջե"
        className="surface-card px-4 py-3.5 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-[#EFF6FF] dark:bg-[#172554] text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <h2 className="font-display text-sm sm:text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Օրական անվտանգ բյուջե
              </h2>
              <span className="text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                · {safeToSpend.remainingDaysInclusive} օր մինչև ցիկլի ավարտը
              </span>
            </div>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums">
              Ազատ միջոցներ՝{' '}
              <strong className="font-mono text-[#0F172A] dark:text-[#F8FAFC]">
                {formatMoney(safeToSpend.freeFunds, currency)}
              </strong>
              {(safeToSpend.reservedBills > 0 || safeToSpend.reservedPending > 0) && (
                <>
                  {' '}
                  · Պահուստ (վճարներ + նախածախս)՝{' '}
                  <strong className="font-mono text-amber-600 dark:text-amber-400">
                    {formatMoney(
                      safeToSpend.reservedBills + safeToSpend.reservedPending,
                      currency
                    )}
                  </strong>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 sm:gap-6 shrink-0 tabular-nums">
          <div>
            <span className="block text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              Օրական սահմանաչափ
            </span>
            <span className="font-mono text-base sm:text-lg font-bold text-[#2563EB] dark:text-[#60A5FA]">
              {formatMoney(safeToSpend.dailyAllowance, currency)}
            </span>
          </div>
          <div className="pl-4 border-l border-[#E2E8F0] dark:border-[#1E293B]">
            <span className="block text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              Այսօրվա մնացորդ (ծախս՝ {formatMoney(safeToSpend.todaySpent, currency)})
            </span>
            <span
              className={`font-mono text-base sm:text-lg font-bold ${
                safeToSpend.remainingTodayAllowance >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {safeToSpend.remainingTodayAllowance >= 0 ? '+' : ''}
              {formatMoney(safeToSpend.remainingTodayAllowance, currency)}
            </span>
          </div>
        </div>
      </section>

      {/* 2.5. Visual Analytics Row: Monthly Dynamics + Selected Month Category Pie Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      <section className="xl:col-span-7 min-w-0 surface-card overflow-hidden">
        <div className="px-5 py-4 sm:px-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#EFF6FF] dark:bg-[#172554] text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                Եկամուտների և ծախսերի ամսական դինամիկա
              </h2>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                Վերջին {dynamicsRange} հաշվարկային ամիս · սեղմեք ամսվա վրա՝ ցիկլը բացելու համար
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Period Averages */}
            <div className="hidden 2xl:flex items-center gap-3 mr-2 pr-3 border-r border-[#E2E8F0] dark:border-[#1E293B] text-xs tabular-nums">
              <div>
                <span className="text-[#94A3B8] dark:text-[#64748B] mr-1">Միջ. եկամուտ՝</span>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  +{formatMoney(dynamicsStats.avgIncome, currency)}
                </span>
              </div>
              <div>
                <span className="text-[#94A3B8] dark:text-[#64748B] mr-1">Միջ. ծախս՝</span>
                <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                  -{formatMoney(dynamicsStats.avgExpense, currency)}
                </span>
              </div>
            </div>

            {isDynamicsExpanded && (
              <>
                {/* 6m / 12m Toggle */}
                <div className="inline-flex items-center p-0.5 rounded-xl surface-subtle text-xs">
                  {([6, 12] as const).map((months) => (
                    <button
                      key={months}
                      type="button"
                      onClick={() => setDynamicsRange(months)}
                      className={`min-h-[30px] px-2.5 rounded-lg font-medium transition-colors cursor-pointer tabular-nums ${
                        dynamicsRange === months
                          ? 'bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                          : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                      }`}
                    >
                      {months} ամիս
                    </button>
                  ))}
                </div>

                {/* Area / Bar Chart Mode Toggle */}
                <div className="inline-flex items-center p-0.5 rounded-xl surface-subtle text-xs">
                  <button
                    type="button"
                    onClick={() => setDynamicsMode('area')}
                    aria-label="Գծային դինամիկա"
                    title="Գծային դինամիկա"
                    className={`min-h-[30px] px-2.5 rounded-lg font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      dynamicsMode === 'area'
                        ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] shadow-xs'
                        : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                    }`}
                  >
                    <LineChartIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Գծային</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDynamicsMode('bar')}
                    aria-label="Սյունակային համեմատություն"
                    title="Սյունակային համեմատություն"
                    className={`min-h-[30px] px-2.5 rounded-lg font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      dynamicsMode === 'bar'
                        ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] shadow-xs'
                        : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Սյուներ</span>
                  </button>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={toggleDynamicsExpanded}
              aria-expanded={isDynamicsExpanded}
              aria-label={isDynamicsExpanded ? 'Թաքցնել գծապատկերը' : 'Ցույց տալ գծապատկերը'}
              className="min-h-[32px] px-2.5 py-1 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] text-xs font-medium text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:border-[#CBD5E1] dark:hover:border-[#334155] inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>{isDynamicsExpanded ? 'Թաքցնել' : 'Ցույց տալ'}</span>
              {isDynamicsExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {isDynamicsExpanded && (
          <div className="px-5 pb-5 sm:px-6 sm:pb-6 pt-3 border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-4">
            {/* Series Toggles & Summary Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    if (showIncomeSeries && !showExpenseSeries && !showNetSeries) return;
                    setShowIncomeSeries((v) => !v);
                  }}
                  className={`px-2.5 py-1 rounded-lg border inline-flex items-center gap-1.5 font-medium transition-all cursor-pointer ${
                    showIncomeSeries
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-[#E2E8F0] dark:border-[#1E293B] text-[#94A3B8] opacity-60'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                  <span>Եկամուտ</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (showExpenseSeries && !showIncomeSeries && !showNetSeries) return;
                    setShowExpenseSeries((v) => !v);
                  }}
                  className={`px-2.5 py-1 rounded-lg border inline-flex items-center gap-1.5 font-medium transition-all cursor-pointer ${
                    showExpenseSeries
                      ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                      : 'border-[#E2E8F0] dark:border-[#1E293B] text-[#94A3B8] opacity-60'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" />
                  <span>Ծախս</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (showNetSeries && !showIncomeSeries && !showExpenseSeries) return;
                    setShowNetSeries((v) => !v);
                  }}
                  className={`px-2.5 py-1 rounded-lg border inline-flex items-center gap-1.5 font-medium transition-all cursor-pointer ${
                    showNetSeries
                      ? 'border-[#3B82F6]/40 bg-[#3B82F6]/10 text-[#2563EB] dark:text-[#60A5FA]'
                      : 'border-[#E2E8F0] dark:border-[#1E293B] text-[#94A3B8] opacity-75 hover:opacity-100'
                  }`}
                >
                  <span className="w-2.5 h-0.5 rounded-full bg-[#3B82F6]" />
                  <span>Մնացորդ (Զուտ)</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs tabular-nums">
                <span className="2xl:hidden text-[#64748B] dark:text-[#94A3B8]">
                  Միջ. եկամուտ՝{' '}
                  <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                    +{formatMoney(dynamicsStats.avgIncome, currency)}
                  </strong>
                </span>
                <span className="2xl:hidden text-[#64748B] dark:text-[#94A3B8]">
                  Միջ. ծախս՝{' '}
                  <strong className="font-mono text-rose-600 dark:text-rose-400">
                    -{formatMoney(dynamicsStats.avgExpense, currency)}
                  </strong>
                </span>
                <span className="text-[#64748B] dark:text-[#94A3B8]">
                  Ընդ. զուտ հոսք՝{' '}
                  <strong
                    className={`font-mono ${
                      dynamicsStats.netTotal >= 0
                        ? 'text-[#0F172A] dark:text-[#F8FAFC]'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {dynamicsStats.netTotal > 0 ? '+' : ''}
                    {formatMoney(dynamicsStats.netTotal, currency)}
                  </strong>
                </span>
              </div>
            </div>

            {!dynamicsStats.hasAnyData ? (
              <EmptyStatePlaceholder
                compact
                icon={TrendingUp}
                title="Այս ժամանակահատվածում գրանցված եկամուտներ կամ ծախսեր չկան"
                description="Ավելացրեք գործարքներ՝ ամսական դինամիկան այստեղ տեսնելու համար։"
                className="h-[220px]"
              />
            ) : (
              <div className="h-[235px] w-full">
                <ResponsiveContainer width="100%" height={235} minWidth={0}>
                  {dynamicsMode === 'area' ? (
                    <ComposedChart
                      data={dynamicsSeries}
                      margin={{ top: 12, right: 12, left: -8, bottom: 0 }}
                      onClick={(state) => {
                        const clickedKey = (
                          state as { activeLabel?: string } | null
                        )?.activeLabel;
                        if (clickedKey && clickedKey !== selectedMonth) {
                          onChangeMonth(clickedKey);
                        }
                      }}
                    >
                      <defs>
                        <linearGradient id="financeIncomeGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="financeExpenseGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.24} />
                          <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        vertical={false}
                        strokeDasharray="3 3"
                        stroke="currentColor"
                        className="text-[#E2E8F0] dark:text-[#1E293B]"
                      />
                      <XAxis
                        dataKey="monthKey"
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(key: string) => {
                          const found = dynamicsSeries.find((p) => p.monthKey === key);
                          return found ? found.label : key;
                        }}
                        tick={{ fontSize: 11, fill: 'currentColor' }}
                        className="text-[#64748B] dark:text-[#94A3B8]"
                        dy={6}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        width={54}
                        tickFormatter={formatAxisCompact}
                        tick={{ fontSize: 11, fill: 'currentColor' }}
                        className="text-[#94A3B8] dark:text-[#64748B] font-mono"
                      />
                      <ReferenceLine
                        x={selectedMonth}
                        stroke="#3B82F6"
                        strokeDasharray="4 4"
                        strokeOpacity={0.65}
                      />
                      <Tooltip
                        cursor={{
                          stroke: '#3B82F6',
                          strokeWidth: 1,
                          strokeDasharray: '4 4',
                        }}
                        content={({ active, payload }) => (
                          <MonthlyHealthTooltip
                            active={active}
                            payload={payload}
                            currency={currency}
                            payday={effectivePayday}
                          />
                        )}
                      />
                      {showIncomeSeries && (
                        <Area
                          type="monotone"
                          dataKey="income"
                          name="Եկամուտ"
                          stroke="#10B981"
                          strokeWidth={2.5}
                          fill="url(#financeIncomeGrad)"
                          activeDot={{ r: 5, strokeWidth: 2, stroke: '#FFFFFF' }}
                          dot={{ r: 3, fill: '#10B981', strokeWidth: 0 }}
                          isAnimationActive={!prefersReducedMotion}
                          animationDuration={550}
                          animationEasing="ease-out"
                        />
                      )}
                      {showExpenseSeries && (
                        <Area
                          type="monotone"
                          dataKey="expense"
                          name="Ծախս"
                          stroke="#F43F5E"
                          strokeWidth={2.5}
                          fill="url(#financeExpenseGrad)"
                          activeDot={{ r: 5, strokeWidth: 2, stroke: '#FFFFFF' }}
                          dot={{ r: 3, fill: '#F43F5E', strokeWidth: 0 }}
                          isAnimationActive={!prefersReducedMotion}
                          animationDuration={620}
                          animationEasing="ease-out"
                        />
                      )}
                      {showNetSeries && (
                        <Line
                          type="monotone"
                          dataKey="net"
                          name="Մնացորդ"
                          stroke="#3B82F6"
                          strokeWidth={2}
                          strokeDasharray="5 4"
                          dot={{ r: 2.5, fill: '#3B82F6', strokeWidth: 0 }}
                          activeDot={{ r: 4.5, strokeWidth: 2, stroke: '#FFFFFF' }}
                          isAnimationActive={!prefersReducedMotion}
                          animationDuration={650}
                          animationEasing="ease-out"
                        />
                      )}
                    </ComposedChart>
                  ) : (
                    <BarChart
                      data={dynamicsSeries}
                      barGap={6}
                      barCategoryGap={dynamicsRange === 12 ? '20%' : '26%'}
                      margin={{ top: 12, right: 12, left: -8, bottom: 0 }}
                      onClick={(state) => {
                        const clickedKey = (
                          state as { activeLabel?: string } | null
                        )?.activeLabel;
                        if (clickedKey && clickedKey !== selectedMonth) {
                          onChangeMonth(clickedKey);
                        }
                      }}
                    >
                      <CartesianGrid
                        vertical={false}
                        strokeDasharray="3 3"
                        stroke="currentColor"
                        className="text-[#E2E8F0] dark:text-[#1E293B]"
                      />
                      <XAxis
                        dataKey="monthKey"
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(key: string) => {
                          const found = dynamicsSeries.find((p) => p.monthKey === key);
                          return found ? found.label : key;
                        }}
                        tick={{ fontSize: 11, fill: 'currentColor' }}
                        className="text-[#64748B] dark:text-[#94A3B8]"
                        dy={6}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        width={54}
                        tickFormatter={formatAxisCompact}
                        tick={{ fontSize: 11, fill: 'currentColor' }}
                        className="text-[#94A3B8] dark:text-[#64748B] font-mono"
                      />
                      <ReferenceLine
                        x={selectedMonth}
                        stroke="#3B82F6"
                        strokeDasharray="4 4"
                        strokeOpacity={0.65}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(59, 130, 246, 0.08)', radius: 8 }}
                        content={({ active, payload }) => (
                          <MonthlyHealthTooltip
                            active={active}
                            payload={payload}
                            currency={currency}
                            payday={effectivePayday}
                          />
                        )}
                      />
                      {showIncomeSeries && (
                        <Bar
                          dataKey="income"
                          name="Եկամուտ"
                          fill="#10B981"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={dynamicsRange === 12 ? 20 : 30}
                          isAnimationActive={!prefersReducedMotion}
                          animationDuration={500}
                          animationEasing="ease-out"
                        />
                      )}
                      {showExpenseSeries && (
                        <Bar
                          dataKey="expense"
                          name="Ծախս"
                          fill="#F43F5E"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={dynamicsRange === 12 ? 20 : 30}
                          isAnimationActive={!prefersReducedMotion}
                          animationDuration={550}
                          animationEasing="ease-out"
                        />
                      )}
                      {showNetSeries && (
                        <Bar
                          dataKey="net"
                          name="Մնացորդ"
                          fill="#3B82F6"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={dynamicsRange === 12 ? 20 : 30}
                          isAnimationActive={!prefersReducedMotion}
                          animationDuration={580}
                          animationEasing="ease-out"
                        />
                      )}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </section>

        {/* Category Expense Pie Chart (Selected Month) */}
        <section className="xl:col-span-5 min-w-0 surface-card overflow-hidden">
          <div className="px-5 py-4 sm:px-6 flex items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <PieChartIcon className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-base sm:text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                  Ծախսերն ըստ կատեգորիայի
                </h2>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums truncate">
                  {cycleLabel} · {pieExpenseSegments.length} կատեգորիա
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={togglePieExpanded}
              aria-expanded={isPieExpanded}
              aria-label={isPieExpanded ? 'Թաքցնել շրջանաձև գծապատկերը' : 'Ցույց տալ շրջանաձև գծապատկերը'}
              className="min-h-[32px] px-2.5 py-1 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] text-xs font-medium text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:border-[#CBD5E1] dark:hover:border-[#334155] inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0"
            >
              <span>{isPieExpanded ? 'Թաքցնել' : 'Ցույց տալ'}</span>
              {isPieExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {isPieExpanded && (
            <div className="px-5 pb-5 sm:px-6 sm:pb-6 pt-3 border-t border-[#E2E8F0] dark:border-[#1E293B]">
              {pieExpenseSegments.length === 0 ? (
                <EmptyStatePlaceholder
                  compact
                  icon={PieChartIcon}
                  title="Այս ամսում գրանցված ծախսեր չկան"
                  description="Ավելացրեք ծախսեր՝ կատեգորիաների բաշխումը տեսնելու համար։"
                  className="h-[235px]"
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                  {/* Recharts Pie Chart */}
                  <div className="sm:col-span-6 relative h-[215px] w-full">
                    <ResponsiveContainer width="100%" height={215} minWidth={0}>
                      <PieChart>
                        <Pie
                          data={pieExpenseSegments}
                          dataKey="amount"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={82}
                          paddingAngle={3}
                          stroke="none"
                          isAnimationActive={!prefersReducedMotion}
                          animationBegin={40}
                          animationDuration={550}
                          animationEasing="ease-out"
                          onMouseLeave={() => setHoveredPieCategory(null)}
                        >
                          {pieExpenseSegments.map((seg) => {
                            const isDimmed =
                              hoveredPieCategory !== null &&
                              hoveredPieCategory !== seg.category;
                            return (
                              <Cell
                                key={seg.category}
                                fill={seg.color}
                                fillOpacity={isDimmed ? 0.32 : 1}
                                onMouseEnter={() => setHoveredPieCategory(seg.category)}
                                className="cursor-pointer transition-opacity duration-150"
                              />
                            );
                          })}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => (
                            <CategoryDonutTooltip
                              active={active}
                              payload={payload}
                              currency={currency}
                            />
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>

                    {/* Center Total / Hovered Category Overlay */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
                      <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate max-w-[96px]">
                        {activeHoveredSegment ? activeHoveredSegment.category : 'Ընդհանուր'}
                      </span>
                      <span className="text-sm font-bold font-mono tabular-nums text-[#0F172A] dark:text-[#F8FAFC] mt-0.5 truncate max-w-[100px]">
                        {formatMoney(
                          activeHoveredSegment ? activeHoveredSegment.amount : totalExpense,
                          currency
                        )}
                      </span>
                      {activeHoveredSegment && (
                        <span className="text-[10px] font-mono font-semibold text-[#2563EB] dark:text-[#60A5FA] tabular-nums">
                          {activeHoveredSegment.pct}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Interactive Category Breakdown Legend */}
                  <div className="sm:col-span-6 max-h-[215px] overflow-y-auto scroll-container pr-1 divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
                    {pieExpenseSegments.map((seg) => {
                      const isDimmed =
                        hoveredPieCategory !== null &&
                        hoveredPieCategory !== seg.category;
                      return (
                        <div
                          key={seg.category}
                          onMouseEnter={() => setHoveredPieCategory(seg.category)}
                          onMouseLeave={() => setHoveredPieCategory(null)}
                          className={`py-2 flex items-center justify-between gap-2 text-xs transition-opacity cursor-default ${
                            isDimmed ? 'opacity-45' : 'opacity-100'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: seg.color }}
                            />
                            <span className="font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                              {seg.category}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 font-mono tabular-nums shrink-0">
                            <span className="text-[#334155] dark:text-[#CBD5E1] font-semibold">
                              {formatMoney(seg.amount, currency)}
                            </span>
                            <span className="text-[11px] text-[#94A3B8] w-8 text-right">
                              {seg.pct}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* 2.75. Monthly Savings Advice (Google Search Grounded) */}
      <MonthlySavingsAdviceCard
        selectedMonth={selectedMonth}
        cycleLabel={cycleLabel}
        currency={currency}
        totalIncome={totalIncome}
        totalExpense={totalExpense}
        projectedMonthlyExpense={projectedMonthlyExpense}
        savingsPct={savingsPct}
        categories={pieExpenseSegments}
        topExpenses={topExpensesForAdvice}
      />

      {/* 3. Render Active Page with Smooth Transition & Scroll-to-Top */}
      <AnimatePresence mode="wait" onExitComplete={scrollToTopInstant}>
        <motion.div
          key={activePage}
          initial={
            prefersReducedMotion ? false : { opacity: 0, y: 12, scale: 0.996 }
          }
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={
            prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.996 }
          }
          transition={{
            duration: prefersReducedMotion ? 0.04 : 0.2,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{ willChange: 'transform, opacity' }}
        >
          <Suspense fallback={<PageSkeleton variant={activePage} />}>
            {activePage === 'ledger' && (
              <TransactionsLedgerPage
                selectedMonth={selectedMonth}
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
                onConfirmPreExpense={onConfirmPreExpense}
              />
            )}

            {activePage === 'budgets' && (
              <BudgetsAndBillsPage
                selectedMonth={selectedMonth}
                effectivePayday={effectivePayday}
                cycleLabel={cycleLabel}
                currency={currency}
                primaryIncome={primaryIncome}
                onSavePrimaryIncome={onSavePrimaryIncome}
                onDisablePrimaryIncome={onDisablePrimaryIncome}
                onManualCreditPrimaryIncome={onManualCreditPrimaryIncome}
                hasCurrentPrimaryCredited={hasCurrentPrimaryCredited}
                cycleMetrics={cycleMetrics}
                budgets={budgets}
                expenseByCategory={expenseByCategory}
                onSaveBudget={onSaveBudget}
                onDeleteBudget={onDeleteBudget}
                recurringBills={recurringBills}
                onAddRecurringBill={onAddRecurringBill}
                onUpdateRecurringBill={onUpdateRecurringBill}
                onDeleteRecurringBill={onDeleteRecurringBill}
                onPayAllRecurringBills={onPayAllRecurringBills}
                onConfirmBillSlot={onConfirmBillSlot}
                onSkipBillSlot={onSkipBillSlot}
                currentHHMM={currentHHMM}
                monthTransactions={monthTransactions}
                onAddTransaction={onAddTransaction}
              />
            )}

            {activePage === 'goals_debts' && (
              <GoalsAndDebtsPage
                currency={currency}
                savingsGoals={savingsGoals}
                onOpenNewGoalModal={onOpenNewGoalModal}
                onEditGoal={onEditGoal}
                onAdjustGoal={onAdjustGoal}
                onDeleteGoal={onDeleteGoal}
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
                categoryComparisonData={categoryComparisonData}
                monthlySeries={monthlySeries}
                last3MonthsSeries={last3MonthsSeries}
                incomeKindSummary={incomeKindSummary}
                expenseByCategory={expenseByCategory}
                onNotify={onNotify}
                onSelectCategoryFilter={() => {
                  handleSelectPage('ledger');
                }}
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
}
