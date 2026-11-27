import React, { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Area,
  AreaChart,
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
  CalendarDays,
  Download,
  FileDown,
  FileText,
  Hash,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Repeat,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Upload,
  Wallet,
} from 'lucide-react';
import {
  MetricStrip,
  MonthCycleNav,
  PageHeader,
  PageShell,
  SectionCard,
} from '../layout/PagePrimitives';
import { EmptyStatePlaceholder } from '../ui/Skeleton';
import { MonthlySavingsAdviceCard } from './MonthlySavingsAdviceCard';
import { SpendingTrendLineCard } from './SpendingTrendLineCard';
import {
  BudgetLimit,
  Currency,
  CustomCategory,
  IncomeKind,
  Transaction,
} from '../../types';
import {
  formatMoney,
  formatShortDate,
  getLastNMonthsKeys,
  getTodayISO,
} from '../../data/defaults';
import {
  formatCycleLabel,
  getCycleShortLabel,
  isDateInCycle,
} from '../../utils/financialCycle';
import { FxRatesToAmd, INTERNAL_TRANSFER_CATEGORY } from '../../utils/cardBalances';
import { NetWorthAndRunwaySummary, RunwayTier } from '../../utils/netWorthAndRunway';
import { classify503020Category } from '../../utils/smartCommandParser';
import {
  buildMonthlySummaryStats,
  downloadMonthlySummaryPDF,
  downloadMonthlySummaryText,
} from '../../utils/exportMonthlySummary';
import {
  CategoryBudgetTooltip,
  CategoryComparisonPoint,
  CategoryDonutPoint,
  CategoryDonutTooltip,
  MonthlyHealthTooltip,
  MonthlyPoint,
  formatAxisCompact,
} from './financeShared';

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

interface AnalyticsAndReportsPageProps {
  selectedMonth: string;
  onShiftMonth: (delta: number) => void;
  onChangeMonth: (monthKey: string) => void;
  effectivePayday: number;
  cycleLabel: string;
  currency: Currency;
  transactions: Transaction[];
  monthTransactions: Transaction[];
  incomeTransactions: Transaction[];
  expenseTransactions: Transaction[];
  budgets: BudgetLimit[];
  cycleMetrics: CycleDayMetrics;
  openingBalance: number;
  cardsInitialBalance?: number;
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  realBalance: number;
  monthlyIncomeTotal: number;
  extraIncomeTotal: number;
  oneTimeIncomeTotal: number;
  savingsPct: number | null;
  incomeDeltaPct: number | null;
  expenseDeltaPct: number | null;
  repeatableMonthlyIncomes: Transaction[];
  onRepeatMonthlyIncomes: (
    sourceIncomes: Transaction[],
    monthKey: string
  ) => void;
  dailyBurnRate: number;
  projectedMonthlyExpense: number;
  projectedRemainingExpense: number;
  unpaidBillsTotal: number;
  actualPacePct: number;
  projectedTotalBarPct: number;
  projectedAddBarPct: number;
  projectionStatusText: string;
  projectionStatusClass: string;
  donutSegments: CategoryDonutPoint[];
  pieExpenseSegments: CategoryDonutPoint[];
  topExpensesForAdvice: Array<{ title: string; category: string; amount: number }>;
  categoryComparisonData: CategoryComparisonPoint[];
  monthlySeries: MonthlyPoint[];
  last3MonthsSeries: MonthlyPoint[];
  incomeKindSummary: Array<{
    id: IncomeKind;
    label: string;
    amount: number;
    barClass: string;
    textClass: string;
  }>;
  expenseByCategory: Record<string, number>;
  onNotify?: (message: string) => void;
  onSelectCategoryFilter?: (cat: string) => void;
  onSelectTagFilter?: (tag: string) => void;
  customCategories?: CustomCategory[];
  fxRates?: FxRatesToAmd | null;
  netWorthSummary?: NetWorthAndRunwaySummary;
  onExportJSON: () => void;
  onRequestImportJSON: () => void;
}

const RUNWAY_TIER_META: Record<
  RunwayTier,
  { label: string; textClass: string }
> = {
  critical: {
    label: 'Կրիտիկական (< 1 ամիս)',
    textClass: 'text-rose-600 dark:text-rose-400',
  },
  caution: {
    label: 'Զգուշացում (1–3 ամիս)',
    textClass: 'text-amber-600 dark:text-amber-400',
  },
  healthy: {
    label: 'Առողջ (3–6 ամիս)',
    textClass: 'text-emerald-600 dark:text-emerald-400',
  },
  strong: {
    label: 'Հուսալի (6+ ամիս)',
    textClass: 'text-[#2563EB] dark:text-[#60A5FA]',
  },
};

export function AnalyticsAndReportsPage({
  selectedMonth,
  onShiftMonth,
  onChangeMonth,
  effectivePayday,
  cycleLabel,
  currency,
  transactions,
  monthTransactions,
  incomeTransactions,
  expenseTransactions,
  budgets,
  cycleMetrics,
  openingBalance,
  cardsInitialBalance = 0,
  totalIncome,
  totalExpense,
  netSavings,
  realBalance,
  monthlyIncomeTotal,
  extraIncomeTotal,
  oneTimeIncomeTotal,
  savingsPct,
  incomeDeltaPct,
  expenseDeltaPct,
  repeatableMonthlyIncomes,
  onRepeatMonthlyIncomes,
  dailyBurnRate,
  projectedMonthlyExpense,
  projectedRemainingExpense,
  unpaidBillsTotal,
  actualPacePct,
  projectedTotalBarPct,
  projectedAddBarPct,
  projectionStatusText,
  projectionStatusClass,
  donutSegments,
  pieExpenseSegments,
  topExpensesForAdvice,
  categoryComparisonData,
  monthlySeries,
  last3MonthsSeries,
  incomeKindSummary,
  expenseByCategory,
  onNotify,
  onSelectCategoryFilter,
  onSelectTagFilter,
  netWorthSummary,
  onExportJSON,
  onRequestImportJSON,
}: AnalyticsAndReportsPageProps) {
  const prefersReducedMotion = useReducedMotion();
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [dynamicsRange, setDynamicsRange] = useState<6 | 12>(6);
  const [dynamicsMode, setDynamicsMode] = useState<'area' | 'bar'>('area');
  const [showIncomeSeries, setShowIncomeSeries] = useState(true);
  const [showExpenseSeries, setShowExpenseSeries] = useState(true);
  const [showNetSeries, setShowNetSeries] = useState(false);

  const todayISO = getTodayISO();
  const [selectedHeatmapDay, setSelectedHeatmapDay] = useState<string | null>(
    null
  );

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

  const cycleCalendarData = useMemo(() => {
    const startParts = cycleMetrics.startDate.split('-').map(Number);
    const endParts = cycleMetrics.endDate.split('-').map(Number);
    const startDt = new Date(
      startParts[0],
      (startParts[1] || 1) - 1,
      startParts[2] || 1
    );
    const endDt = new Date(
      endParts[0],
      (endParts[1] || 1) - 1,
      endParts[2] || 1
    );

    const byDate = new Map<
      string,
      { spent: number; income: number; txs: Transaction[] }
    >();
    for (const tx of monthTransactions) {
      if (tx.category === INTERNAL_TRANSFER_CATEGORY) continue;
      const entry = byDate.get(tx.date) ?? { spent: 0, income: 0, txs: [] };
      if (tx.type === 'expense' && !tx.isPending) {
        entry.spent += tx.amount;
      } else if (tx.type === 'income') {
        entry.income += tx.amount;
      }
      entry.txs.push(tx);
      byDate.set(tx.date, entry);
    }

    const days: Array<{
      date: string;
      dayNum: number;
      spent: number;
      income: number;
      txs: Transaction[];
    }> = [];
    let maxDailySpent = 0;
    const cursor = new Date(startDt);
    let guard = 0;
    while (cursor <= endDt && guard < 40) {
      guard += 1;
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      const iso = `${y}-${m}-${d}`;
      const info = byDate.get(iso);
      const spent = info?.spent ?? 0;
      if (spent > maxDailySpent) maxDailySpent = spent;
      days.push({
        date: iso,
        dayNum: cursor.getDate(),
        spent,
        income: info?.income ?? 0,
        txs: info?.txs ?? [],
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    const firstJsDay = startDt.getDay();
    const leadingEmpty = (firstJsDay + 6) % 7;

    return { days, maxDailySpent, leadingEmpty };
  }, [cycleMetrics.startDate, cycleMetrics.endDate, monthTransactions]);

  const activeHeatmapDayObj = useMemo(() => {
    if (cycleCalendarData.days.length === 0) return null;
    if (selectedHeatmapDay) {
      const found = cycleCalendarData.days.find(
        (d) => d.date === selectedHeatmapDay
      );
      if (found) return found;
    }
    const todayInCycle = cycleCalendarData.days.find(
      (d) => d.date === todayISO
    );
    if (todayInCycle) return todayInCycle;
    const maxDay = [...cycleCalendarData.days].sort((a, b) => b.spent - a.spent)[0];
    return maxDay ?? cycleCalendarData.days[0];
  }, [cycleCalendarData.days, selectedHeatmapDay, todayISO]);

  const rule503020 = useMemo(() => {
    let needs = 0;
    let wants = 0;
    for (const tx of expenseTransactions) {
      if (tx.isPending || tx.category === INTERNAL_TRANSFER_CATEGORY) continue;
      const bucket = classify503020Category(tx.category);
      if (bucket === 'needs') needs += tx.amount;
      else if (bucket === 'wants') wants += tx.amount;
    }
    const savingsActual = Math.max(0, totalIncome - (needs + wants));
    const denominator = totalIncome > 0 ? totalIncome : Math.max(1, needs + wants);
    return {
      needs,
      wants,
      savingsActual,
      needsPct: Math.round((needs / denominator) * 100),
      wantsPct: Math.round((wants / denominator) * 100),
      savingsPctActual:
        totalIncome > 0 ? Math.round((savingsActual / totalIncome) * 100) : 0,
      hasData: needs > 0 || wants > 0 || totalIncome > 0,
    };
  }, [expenseTransactions, totalIncome]);

  const tagBreakdown = useMemo(() => {
    const map = new Map<string, { tag: string; amount: number; count: number }>();
    let maxTagAmount = 0;
    for (const tx of expenseTransactions) {
      if (tx.isPending || tx.category === INTERNAL_TRANSFER_CATEGORY) continue;
      if (!tx.tags || tx.tags.length === 0) continue;
      for (const rawTag of tx.tags) {
        const clean = rawTag.trim();
        if (!clean) continue;
        const key = clean.toLowerCase();
        const prev = map.get(key) ?? { tag: clean, amount: 0, count: 0 };
        prev.amount += tx.amount;
        prev.count += 1;
        if (prev.amount > maxTagAmount) maxTagAmount = prev.amount;
        map.set(key, prev);
      }
    }
    const items = Array.from(map.values()).sort((a, b) => b.amount - a.amount);
    return { items, maxTagAmount };
  }, [expenseTransactions]);

  const handleExportSummaryText = () => {
    const stats = buildMonthlySummaryStats({
      selectedMonth,
      payday: effectivePayday,
      currency,
      transactions,
      budgets,
      dailyBurnRate,
      projectedMonthlyExpense,
      elapsedDays: cycleMetrics.elapsedDays,
      daysInSelectedMonth: cycleMetrics.totalDays,
      isCurrentMonth: cycleMetrics.isCurrentCycle,
      initialBalance: cardsInitialBalance,
    });
    downloadMonthlySummaryText(stats);
    onNotify?.('Ամսական ամփոփումը արտահանվեց տեքստային ֆորմատով (.txt)');
  };

  const handleExportSummaryPDF = async () => {
    if (isExportingPDF) return;
    setIsExportingPDF(true);
    try {
      const stats = buildMonthlySummaryStats({
        selectedMonth,
        payday: effectivePayday,
        currency,
        transactions,
        budgets,
        dailyBurnRate,
        projectedMonthlyExpense,
        elapsedDays: cycleMetrics.elapsedDays,
        daysInSelectedMonth: cycleMetrics.totalDays,
        isCurrentMonth: cycleMetrics.isCurrentCycle,
        initialBalance: cardsInitialBalance,
      });
      await downloadMonthlySummaryPDF(stats);
      onNotify?.('Ամսական ամփոփումը արտահանվեց PDF ֆորմատով');
    } finally {
      setIsExportingPDF(false);
    }
  };

  const donutAnimKey = `${selectedMonth}:${donutSegments
    .map((s) => `${s.category}:${s.amount}`)
    .join('|')}`;
  const categoryBarAnimKey = `${selectedMonth}:${categoryComparisonData
    .map((c) => `${c.category}:${c.spent}:${c.limit}`)
    .join('|')}`;

  return (
    <PageShell>
      <PageHeader
        title="Ֆինանսական վերլուծություն և հաշվետվություն"
        subtitle={`Դինամիկա, բաշխում և արտահանում · ${cycleLabel} · ${monthTransactions.length} գործարք`}
        actions={
          <>
            <MonthCycleNav
              selectedMonth={selectedMonth}
              payday={effectivePayday}
              onShiftMonth={onShiftMonth}
              className="lg:hidden"
            />
            <button
              type="button"
              onClick={handleExportSummaryText}
              aria-label="Արտահանել ամսական ամփոփումը տեքստային ֆորմատով"
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] inline-flex items-center gap-1.5 hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 text-[#64748B] dark:text-[#94A3B8]" />
              <span>.txt</span>
            </button>
            <button
              type="button"
              onClick={handleExportSummaryPDF}
              disabled={isExportingPDF}
              aria-label="Արտահանել ամսական ամփոփումը PDF ֆորմատով"
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-[#F8FAFC] dark:bg-[#111A2E] text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] inline-flex items-center gap-1.5 hover:border-[#2563EB] dark:hover:border-[#3B82F6] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>{isExportingPDF ? 'Պատրաստվում է…' : 'PDF'}</span>
            </button>
            <button
              type="button"
              onClick={onExportJSON}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] inline-flex items-center gap-1.5 hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Պահուստ</span>
            </button>
            <button
              type="button"
              onClick={onRequestImportJSON}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] inline-flex items-center gap-1.5 hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Վերականգնել</span>
            </button>
          </>
        }
      />

      <MetricStrip
        items={[
          {
            id: 'analytics-opening',
            label: 'Նախորդ մնացորդ',
            value: `${openingBalance > 0 ? '+' : ''}${formatMoney(openingBalance, currency)}`,
            hint: `Մինչև ${formatShortDate(cycleMetrics.startDate)}`,
            tone: openingBalance < 0 ? 'negative' : 'default',
            sensitive: true,
          },
          {
            id: 'analytics-income',
            label: 'Ամսվա եկամուտ',
            value: `+${formatMoney(totalIncome, currency)}`,
            hint:
              incomeDeltaPct !== null
                ? `${incomeTransactions.length} մուտք · ${incomeDeltaPct >= 0 ? '+' : ''}${incomeDeltaPct}%`
                : `${incomeTransactions.length} մուտք`,
            tone: 'positive',
            sensitive: true,
            action:
              repeatableMonthlyIncomes.length > 0
                ? {
                    label: `Կրկնել (${repeatableMonthlyIncomes.length})`,
                    onClick: () =>
                      onRepeatMonthlyIncomes(
                        repeatableMonthlyIncomes,
                        selectedMonth
                      ),
                  }
                : undefined,
          },
          {
            id: 'analytics-expense',
            label: 'Ամսվա ծախս',
            value: `-${formatMoney(totalExpense, currency)}`,
            hint:
              expenseDeltaPct !== null
                ? `${expenseTransactions.length} ելք · ${expenseDeltaPct >= 0 ? '+' : ''}${expenseDeltaPct}%`
                : `${expenseTransactions.length} ելք`,
            tone: 'negative',
            sensitive: true,
          },
          {
            id: 'analytics-balance',
            label: 'Իրական բալանս',
            value: `${realBalance > 0 ? '+' : ''}${formatMoney(realBalance, currency)}`,
            hint:
              savingsPct !== null
                ? netSavings >= 0
                  ? `Խնայողություն՝ ${savingsPct}%`
                  : `Գերծախս՝ ${Math.abs(savingsPct)}%`
                : 'Նախորդ + Եկամուտ - Ծախս',
            tone: realBalance >= 0 ? 'accent' : 'negative',
            sensitive: true,
          },
        ]}
      />

      {/* Cycle vs Previous Cycle Spending Trend Line Chart */}
      <SpendingTrendLineCard
        selectedMonth={selectedMonth}
        effectivePayday={effectivePayday}
        currency={currency}
        transactions={transactions}
      />

      {netWorthSummary && (
        <SectionCard
          title="Զուտ կապիտալ և անվտանգության բարձիկ"
          subtitle="Կանխիկ և քարտեր + խնայողություն + տված պարտքեր − վերցրած պարտքեր · 6 ցիկլի պատմություն"
          icon={ShieldCheck}
          headerRight={
            <span
              className={`text-xs font-semibold ${
                RUNWAY_TIER_META[netWorthSummary.runwayTier].textClass
              }`}
            >
              {RUNWAY_TIER_META[netWorthSummary.runwayTier].label}
            </span>
          }
        >
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#E2E8F0] dark:divide-[#1E293B]">
              <div className="py-2 sm:pr-4">
                <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Զուտ կապիտալ (Net Worth)
                </span>
                <p
                  className={`pa-sensitive font-mono text-lg sm:text-xl font-bold mt-0.5 tabular-nums ${
                    netWorthSummary.netWorth >= 0
                      ? 'text-[#0F172A] dark:text-[#F8FAFC]'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {netWorthSummary.netWorth > 0 ? '+' : ''}
                  {formatMoney(netWorthSummary.netWorth, currency)}
                </p>
              </div>
              <div className="py-2 sm:px-4">
                <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Անվտանգության բարձիկ (Runway)
                </span>
                <p
                  className={`font-mono text-lg sm:text-xl font-bold mt-0.5 tabular-nums ${
                    RUNWAY_TIER_META[netWorthSummary.runwayTier].textClass
                  }`}
                >
                  {netWorthSummary.runwayDays} օր{' '}
                  <span className="text-xs font-normal text-[#64748B] dark:text-[#94A3B8]">
                    ({netWorthSummary.runwayMonths} ամիս)
                  </span>
                </p>
              </div>
              <div className="py-2 sm:pl-4">
                <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  60-օրյա միջին օրական ծախս
                </span>
                <p className="pa-sensitive font-mono text-lg sm:text-xl font-bold text-[#0F172A] dark:text-[#F8FAFC] mt-0.5 tabular-nums">
                  {netWorthSummary.hasBurnData
                    ? formatMoney(netWorthSummary.avgDailyBurn, currency)
                    : 'Տվյալներ չկան'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-3 border-t border-[#E2E8F0] dark:border-[#1E293B] text-xs tabular-nums">
              <div>
                <span className="block text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Իրացվելի միջոցներ
                </span>
                <span className="pa-sensitive font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  {formatMoney(netWorthSummary.liquidCashAMD, currency)}
                </span>
              </div>
              <div>
                <span className="block text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Խնայողության նպատակներ
                </span>
                <span className="pa-sensitive font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  +{formatMoney(netWorthSummary.savingsGoalsTotal, currency)}
                </span>
              </div>
              <div>
                <span className="block text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Ինձ են պարտք
                </span>
                <span className="pa-sensitive font-mono font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                  +{formatMoney(netWorthSummary.lentPendingTotal, currency)}
                </span>
              </div>
              <div>
                <span className="block text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Ես եմ պարտք
                </span>
                <span className="pa-sensitive font-mono font-semibold text-rose-600 dark:text-rose-400">
                  -{formatMoney(netWorthSummary.borrowedPendingTotal, currency)}
                </span>
              </div>
              <div>
                <span className="block text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Չվճարված հաշիվներ
                </span>
                <span className="pa-sensitive font-mono font-semibold text-amber-600 dark:text-amber-400">
                  {formatMoney(netWorthSummary.unpaidBillsAMD, currency)}
                </span>
              </div>
            </div>

            {netWorthSummary.history.length > 0 && (
              <div className="h-[220px] w-full pt-1">
                <ResponsiveContainer width="100%" height={220} minWidth={0}>
                  <AreaChart
                    data={netWorthSummary.history}
                    margin={{ top: 10, right: 12, left: -8, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="netWorthAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563EB" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#2563EB" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 3"
                      stroke="currentColor"
                      className="text-[#E2E8F0] dark:text-[#1E293B]"
                    />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
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
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const pt = payload[0]?.payload as
                          | NetWorthAndRunwaySummary['history'][number]
                          | undefined;
                        if (!pt) return null;
                        return (
                          <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] px-3.5 py-2.5 shadow-xl text-xs space-y-1 min-w-[180px] tabular-nums">
                            <p className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                              {formatCycleLabel(pt.monthKey, effectivePayday)}
                            </p>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[#64748B] dark:text-[#94A3B8]">
                                Զուտ կապիտալ
                              </span>
                              <span className="font-mono font-bold text-[#2563EB] dark:text-[#60A5FA]">
                                {formatMoney(pt.netWorth, currency)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[#64748B] dark:text-[#94A3B8]">
                                Մնացորդ
                              </span>
                              <span className="font-mono text-[#0F172A] dark:text-[#F8FAFC]">
                                {formatMoney(pt.cashBalance, currency)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[#64748B] dark:text-[#94A3B8]">
                                Խնայողություն
                              </span>
                              <span className="font-mono text-emerald-600 dark:text-emerald-400">
                                {formatMoney(pt.savingsTotal, currency)}
                              </span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="netWorth"
                      name="Զուտ կապիտալ"
                      stroke="#2563EB"
                      strokeWidth={2.5}
                      fill="url(#netWorthAreaGrad)"
                      dot={{ r: 3, fill: '#2563EB', strokeWidth: 0 }}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: '#FFFFFF' }}
                      isAnimationActive={!prefersReducedMotion}
                      animationDuration={550}
                      animationEasing="ease-out"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* 1. Monthly Income & Expense Dynamics (6m / 12m) */}
      <SectionCard
        title="Եկամուտների և ծախսերի ամսական դինամիկա"
        subtitle={`Վերջին ${dynamicsRange} հաշվարկային ամիս · սեղմեք ամսվա վրա՝ ցիկլը բացելու համար`}
        icon={TrendingUp}
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
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

            <div className="inline-flex items-center p-0.5 rounded-xl surface-subtle text-xs">
              <button
                type="button"
                onClick={() => setDynamicsMode('area')}
                aria-label="Գծային դինամիկա"
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
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  if (showIncomeSeries && !showExpenseSeries && !showNetSeries)
                    return;
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
                  if (showExpenseSeries && !showIncomeSeries && !showNetSeries)
                    return;
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
                  if (showNetSeries && !showIncomeSeries && !showExpenseSeries)
                    return;
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
              <span className="text-[#64748B] dark:text-[#94A3B8]">
                Միջ. եկամուտ՝{' '}
                <strong className="pa-sensitive font-mono text-emerald-600 dark:text-emerald-400">
                  +{formatMoney(dynamicsStats.avgIncome, currency)}
                </strong>
              </span>
              <span className="text-[#64748B] dark:text-[#94A3B8]">
                Միջ. ծախս՝{' '}
                <strong className="pa-sensitive font-mono text-rose-600 dark:text-rose-400">
                  -{formatMoney(dynamicsStats.avgExpense, currency)}
                </strong>
              </span>
              <span className="text-[#64748B] dark:text-[#94A3B8]">
                Ընդ. զուտ հոսք՝{' '}
                <strong
                  className={`pa-sensitive font-mono ${
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
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height={240} minWidth={0}>
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
      </SectionCard>

      {/* 2. Monthly Savings Advice (Google Search Grounded) */}
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

      {/* 3. Spend Pace & Burn Rate Forecast */}
      <SectionCard
        title="Ծախսերի տեմպ և կանխատեսում"
        subtitle="Միջին օրական այրման տեմպի և ամսվա ավարտի հաշվարկ"
        icon={TrendingUp}
        headerRight={
          <span className={`text-xs font-semibold ${projectionStatusClass}`}>
            {projectionStatusText}
          </span>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E2E8F0] dark:divide-[#1E293B]">
            <div className="py-2 sm:pr-4">
              <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                Օրական միջին
              </span>
              <p className="pa-sensitive font-mono text-base font-bold text-[#0F172A] dark:text-[#F8FAFC] mt-0.5 tabular-nums">
                {formatMoney(Math.round(dailyBurnRate), currency)}
              </p>
            </div>
            <div className="py-2 pl-3 sm:px-4">
              <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                Կանխատեսվող ամսական
              </span>
              <p className="pa-sensitive font-mono text-base font-bold text-[#2563EB] dark:text-[#60A5FA] mt-0.5 tabular-nums">
                {formatMoney(projectedMonthlyExpense, currency)}
              </p>
            </div>
            <div className="py-2 sm:px-4">
              <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                Մնացորդային կանխատեսում
              </span>
              <p className="pa-sensitive font-mono text-base font-bold text-[#475569] dark:text-[#CBD5E1] mt-0.5 tabular-nums">
                {formatMoney(projectedRemainingExpense, currency)}
              </p>
            </div>
            <div className="py-2 pl-3 sm:pl-4">
              <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                Չվճարված պլանավորված
              </span>
              <p className="pa-sensitive font-mono text-base font-bold text-amber-600 dark:text-amber-400 mt-0.5 tabular-nums">
                {formatMoney(unpaidBillsTotal, currency)}
              </p>
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums">
              <span>Փաստացի այրված՝ {actualPacePct}%</span>
              <span>Կանխատեսվող տեմպ՝ {projectedTotalBarPct}%</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-[#E2E8F0] dark:bg-[#1E293B] overflow-hidden flex">
              <div
                className="h-full bg-rose-500 transition-all duration-300"
                style={{ width: `${actualPacePct}%` }}
              />
              <div
                className="h-full bg-amber-400/70 transition-all duration-300"
                style={{ width: `${projectedAddBarPct}%` }}
              />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* 4. 3-Month Comparative Income vs Expense Chart */}
      <SectionCard
        title="Վերջին 3 ամիսների համեմատական (Եկամուտ և Ծախս)"
        subtitle="Համեմատեք վերջին երեք հաշվարկային ամիսների դրամական հոսքերը"
        headerRight={
          <div className="flex items-center gap-4 text-xs text-[#475569] dark:text-[#CBD5E1]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
              <span>Եկամուտ</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" />
              <span>Ծախս</span>
            </span>
          </div>
        }
      >
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height={240} minWidth={0}>
            <BarChart
              data={last3MonthsSeries}
              barGap={8}
              barCategoryGap="28%"
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="currentColor"
                className="text-[#E2E8F0] dark:text-[#1E293B]"
              />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'currentColor' }}
                className="text-[#64748B] dark:text-[#94A3B8]"
                dy={6}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={55}
                tickFormatter={formatAxisCompact}
                tick={{ fontSize: 11, fill: 'currentColor' }}
                className="text-[#94A3B8] dark:text-[#64748B] font-mono"
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
              <Bar
                dataKey="income"
                name="Եկամուտ"
                fill="#10B981"
                radius={[6, 6, 0, 0]}
                maxBarSize={32}
                isAnimationActive={!prefersReducedMotion}
                animationBegin={40}
                animationDuration={500}
                animationEasing="ease-out"
              />
              <Bar
                dataKey="expense"
                name="Ծախս"
                fill="#F43F5E"
                radius={[6, 6, 0, 0]}
                maxBarSize={32}
                isAnimationActive={!prefersReducedMotion}
                animationBegin={120}
                animationDuration={500}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* 5. Category Comparison & Single Interactive Donut Chart Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <SectionCard
          className="lg:col-span-7"
          title={
            budgets.length > 0
              ? 'Բյուջե և փաստացի ծախս (ըստ կատեգորիայի)'
              : 'Ամսական հաշվեկշռի ամփոփում'
          }
          subtitle={cycleLabel}
          headerRight={
            budgets.length > 0 ? (
              <div className="flex items-center gap-4 text-xs text-[#475569] dark:text-[#CBD5E1]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#3B82F6]" />
                  <span>Ծախսված</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-slate-400" />
                  <span>Սահմանաչափ</span>
                </span>
              </div>
            ) : undefined
          }
        >
          {categoryComparisonData.length > 0 && (
            <motion.div
              key={`category-bar-${categoryBarAnimKey}`}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
              className="h-[220px] w-full mb-5"
            >
              <ResponsiveContainer width="100%" height={220} minWidth={0}>
                <BarChart
                  data={categoryComparisonData}
                  barGap={6}
                  barCategoryGap="24%"
                  margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                >
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    stroke="currentColor"
                    className="text-[#E2E8F0] dark:text-[#1E293B]"
                  />
                  <XAxis
                    dataKey="category"
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    tickFormatter={(val: string) =>
                      val.length > 8 ? `${val.slice(0, 7)}…` : val
                    }
                    dy={6}
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    className="text-[#64748B] dark:text-[#94A3B8]"
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={50}
                    tickFormatter={formatAxisCompact}
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    className="text-[#94A3B8] dark:text-[#64748B] font-mono"
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(59, 130, 246, 0.08)', radius: 8 }}
                    content={({ active, payload }) => (
                      <CategoryBudgetTooltip
                        active={active}
                        payload={payload}
                        currency={currency}
                      />
                    )}
                  />
                  <Bar
                    dataKey="spent"
                    name="Ծախսված"
                    fill="#3B82F6"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={26}
                    isAnimationActive={!prefersReducedMotion}
                    animationBegin={60}
                    animationDuration={550}
                    animationEasing="ease-out"
                  />
                  {budgets.length > 0 && (
                    <Bar
                      dataKey="limit"
                      name="Սահմանաչափ"
                      fill="#94A3B8"
                      fillOpacity={0.55}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={26}
                      isAnimationActive={!prefersReducedMotion}
                      animationBegin={140}
                      animationDuration={550}
                      animationEasing="ease-out"
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
            {monthlySeries.map((m) => {
              const net = m.income - m.expense;
              const isSelected = m.monthKey === selectedMonth;
              return (
                <button
                  key={m.monthKey}
                  type="button"
                  onClick={() => onChangeMonth(m.monthKey)}
                  className={`w-full py-2.5 px-2.5 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#EFF6FF] dark:bg-[#172554]/50'
                      : 'hover:bg-[#F8FAFC] dark:hover:bg-[#162033]'
                  }`}
                >
                  <span className="font-medium text-[#334155] dark:text-[#CBD5E1]">
                    {formatCycleLabel(m.monthKey, effectivePayday)}
                  </span>
                  <div className="flex items-center gap-2.5 sm:gap-4 font-mono tabular-nums">
                    <span className="pa-sensitive text-emerald-600 dark:text-emerald-400">
                      +{formatMoney(m.income, currency)}
                    </span>
                    <span className="pa-sensitive text-rose-600 dark:text-rose-400">
                      -{formatMoney(m.expense, currency)}
                    </span>
                    <span
                      className={`pa-sensitive hidden sm:inline ${
                        net >= 0
                          ? 'text-[#0F172A] dark:text-[#F8FAFC]'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      ({net > 0 ? '+' : ''}
                      {formatMoney(net, currency)})
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard
          className="lg:col-span-5"
          title="Ծախսեր ըստ կատեգորիայի"
          subtitle={cycleLabel}
          icon={PieChartIcon}
        >
          <div className="space-y-5">
            {donutSegments.length === 0 ? (
              <EmptyStatePlaceholder
                compact
                icon={PieChartIcon}
                title="Այս ամսում գրանցված ծախսեր չկան"
                description="Ծախսեր ավելացնելուց հետո կտեսնեք կատեգորիաների բաշխումը։"
              />
            ) : (
              <>
                <motion.div
                  key={`analytics-donut-${donutAnimKey}`}
                  initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="relative h-[196px] w-full"
                >
                  <ResponsiveContainer width="100%" height={196} minWidth={0}>
                    <PieChart>
                      <Pie
                        data={donutSegments}
                        dataKey="amount"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={82}
                        paddingAngle={3}
                        stroke="none"
                        isAnimationActive={!prefersReducedMotion}
                        animationBegin={70}
                        animationDuration={620}
                        animationEasing="ease-out"
                        onMouseLeave={() => setHoveredCategory(null)}
                      >
                        {donutSegments.map((seg) => {
                          const isDimmed =
                            hoveredCategory !== null &&
                            hoveredCategory !== seg.category;
                          return (
                            <Cell
                              key={seg.category}
                              fill={seg.color}
                              fillOpacity={isDimmed ? 0.35 : 1}
                              onMouseEnter={() => setHoveredCategory(seg.category)}
                              onClick={() => onSelectCategoryFilter?.(seg.category)}
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
                  <motion.div
                    initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      duration: 0.35,
                      delay: 0.14,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none"
                  >
                    <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate max-w-[100px]">
                      {hoveredCategory ?? 'Ընդհանուր'}
                    </span>
                    <span className="pa-sensitive text-sm font-bold font-mono tabular-nums text-[#0F172A] dark:text-[#F8FAFC] mt-0.5">
                      {formatMoney(
                        hoveredCategory
                          ? expenseByCategory[hoveredCategory] ?? 0
                          : totalExpense,
                        currency
                      )}
                    </span>
                  </motion.div>
                </motion.div>

                <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
                  {donutSegments.map((seg, idx) => (
                    <motion.button
                      key={`analytics-legend-${donutAnimKey}-${seg.category}`}
                      type="button"
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.26,
                        delay: prefersReducedMotion ? 0 : 0.06 + idx * 0.04,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      onClick={() => onSelectCategoryFilter?.(seg.category)}
                      onMouseEnter={() => setHoveredCategory(seg.category)}
                      onMouseLeave={() => setHoveredCategory(null)}
                      className={`w-full py-2.5 flex items-center justify-between text-sm transition-opacity cursor-pointer ${
                        hoveredCategory && hoveredCategory !== seg.category
                          ? 'opacity-45'
                          : 'opacity-100'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: seg.color }}
                        />
                        <span>{seg.category}</span>
                      </span>
                      <span className="pa-sensitive font-mono tabular-nums text-[#475569] dark:text-[#CBD5E1] text-xs sm:text-sm">
                        {formatMoney(seg.amount, currency)}{' '}
                        <span className="text-[#94A3B8]">({seg.pct}%)</span>
                      </span>
                    </motion.button>
                  ))}
                </div>
              </>
            )}

            <div className="pt-4 border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-display text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  Եկամտի կառուցվածք
                </h4>
                <span className="pa-sensitive text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  +{formatMoney(totalIncome, currency)}
                </span>
              </div>
              {totalIncome === 0 ? (
                <EmptyStatePlaceholder
                  compact
                  icon={Wallet}
                  title="Այս ամսում գրանցված եկամուտներ չկան"
                />
              ) : (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 min-[380px]:grid-cols-3 gap-2.5 sm:gap-2 text-[11px] pb-1 tabular-nums">
                    <div>
                      <span className="block text-[#94A3B8]">Ամսական</span>
                      <span className="pa-sensitive font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                        {formatMoney(monthlyIncomeTotal, currency)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[#94A3B8]">Հավելյալ</span>
                      <span className="pa-sensitive font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                        {formatMoney(extraIncomeTotal, currency)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[#94A3B8]">Միանգամյա</span>
                      <span className="pa-sensitive font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                        {formatMoney(oneTimeIncomeTotal, currency)}
                      </span>
                    </div>
                  </div>
                  {incomeKindSummary.map((item) => {
                    const pct =
                      totalIncome > 0
                        ? Math.round((item.amount / totalIncome) * 100)
                        : 0;
                    return (
                      <div key={item.id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs tabular-nums">
                          <span className="font-medium text-[#334155] dark:text-[#CBD5E1]">
                            {item.label}
                          </span>
                          <span className="pa-sensitive font-mono text-[#475569] dark:text-[#CBD5E1]">
                            <span className={`font-semibold ${item.textClass}`}>
                              {formatMoney(item.amount, currency)}
                            </span>{' '}
                            <span className="text-[#94A3B8]">({pct}%)</span>
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-[#E2E8F0] dark:bg-[#1E293B] overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${item.barClass}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* 6. Cycle Daily Spend Heatmap & 50/30/20 Rule Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        <SectionCard
          className="lg:col-span-7"
          title="Ցիկլի օրական ծախսերի քարտեզ"
          subtitle="Սեղմեք ցանկացած օրվա վրա՝ տվյալ օրվա գործարքները տեսնելու համար"
          icon={CalendarDays}
          headerRight={
            <div className="flex items-center gap-1.5 text-[10px] text-[#64748B] dark:text-[#94A3B8]">
              <span>Քիչ</span>
              <span className="w-3 h-3 rounded bg-[#F1F5F9] dark:bg-[#1E293B]" />
              <span className="w-3 h-3 rounded bg-amber-300/60 dark:bg-amber-500/35" />
              <span className="w-3 h-3 rounded bg-orange-400/75 dark:bg-orange-500/55" />
              <span className="w-3 h-3 rounded bg-rose-500/85 dark:bg-rose-500/75" />
              <span>Շատ</span>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center text-[10px] sm:text-[11px] font-semibold text-[#94A3B8]">
              {['Երկ', 'Երք', 'Չոր', 'Հինգ', 'Ուրբ', 'Շաբ', 'Կիր'].map((wd) => (
                <div key={wd} className="py-1 truncate">
                  {wd}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {Array.from({ length: cycleCalendarData.leadingEmpty }).map((_, i) => (
                <div key={`empty-${i}`} className="h-10 sm:h-11" aria-hidden="true" />
              ))}
              {cycleCalendarData.days.map((day) => {
                const ratio =
                  cycleCalendarData.maxDailySpent > 0
                    ? day.spent / cycleCalendarData.maxDailySpent
                    : 0;
                const isSelected = activeHeatmapDayObj?.date === day.date;
                const isToday = day.date === todayISO;
                const heatClass =
                  day.spent <= 0
                    ? 'bg-[#F8FAFC] dark:bg-[#0B1120] border-[#E2E8F0] dark:border-[#1E293B] text-[#64748B] dark:text-[#94A3B8]'
                    : ratio >= 0.72
                      ? 'bg-rose-500/20 dark:bg-rose-500/25 border-rose-500/45 text-rose-800 dark:text-rose-200'
                      : ratio >= 0.36
                        ? 'bg-orange-500/18 dark:bg-orange-500/22 border-orange-500/40 text-orange-800 dark:text-orange-200'
                        : 'bg-amber-400/18 dark:bg-amber-500/18 border-amber-400/40 text-amber-800 dark:text-amber-200';

                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setSelectedHeatmapDay(day.date)}
                    title={`${formatShortDate(day.date)} · Ծախս՝ ${formatMoney(day.spent, currency)}`}
                    className={`h-10 sm:h-11 rounded-xl border flex flex-col items-center justify-center text-[11px] font-mono tabular-nums transition-all cursor-pointer ${heatClass} ${
                      isSelected
                        ? 'ring-2 ring-[#2563EB] dark:ring-[#3B82F6] font-bold'
                        : isToday
                          ? 'ring-1 ring-[#2563EB]/50'
                          : ''
                    }`}
                  >
                    <span>{day.dayNum}</span>
                    {day.spent > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-75 mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>

            {activeHeatmapDayObj && (
              <div className="pt-3.5 border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                    {formatShortDate(activeHeatmapDayObj.date)}
                    {activeHeatmapDayObj.date === todayISO ? ' (Այսօր)' : ''}
                  </span>
                  <div className="flex items-center gap-3 font-mono tabular-nums">
                    {activeHeatmapDayObj.income > 0 && (
                      <span className="pa-sensitive text-emerald-600 dark:text-emerald-400 font-semibold">
                        +{formatMoney(activeHeatmapDayObj.income, currency)}
                      </span>
                    )}
                    <span className="pa-sensitive text-rose-600 dark:text-rose-400 font-semibold">
                      -{formatMoney(activeHeatmapDayObj.spent, currency)}
                    </span>
                  </div>
                </div>
                {activeHeatmapDayObj.txs.length === 0 ? (
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                    Այս օրը գրանցված գործարքներ չկան։
                  </p>
                ) : (
                  <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
                    {activeHeatmapDayObj.txs.slice(0, 5).map((tx) => (
                      <div
                        key={tx.id}
                        className="py-1.5 flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="truncate text-[#334155] dark:text-[#CBD5E1]">
                          {tx.title}{' '}
                          <span className="text-[#94A3B8]">· {tx.category}</span>
                        </span>
                        <span
                          className={`pa-sensitive font-mono font-semibold tabular-nums shrink-0 ${
                            tx.type === 'income'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-[#0F172A] dark:text-[#F8FAFC]'
                          }`}
                        >
                          {tx.type === 'income' ? '+' : '-'}
                          {formatMoney(tx.amount, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          className="lg:col-span-5"
          title="50 / 30 / 20 բաշխման վերլուծություն"
          subtitle="Հիմնական կարիքներ, ցանկություններ և խնայողություն"
          icon={SlidersHorizontal}
        >
          {!rule503020.hasData ? (
            <EmptyStatePlaceholder
              compact
              icon={SlidersHorizontal}
              title="Բաշխման տվյալներ դեռ չկան"
              description="Եկամուտների և ծախսերի գրանցումից հետո այստեղ կտեսնեք 50/30/20 համամասնությունը։"
            />
          ) : (
            <div className="space-y-4">
              {[
                {
                  id: 'needs',
                  label: 'Անհրաժեշտ կարիքներ',
                  desc: 'Սնունդ, տրանսպորտ, կոմունալ, բնակարան, առողջություն',
                  amount: rule503020.needs,
                  actualPct: rule503020.needsPct,
                  targetPct: 50,
                  barClass:
                    rule503020.needsPct > 60
                      ? 'bg-amber-500'
                      : 'bg-[#2563EB] dark:bg-[#3B82F6]',
                },
                {
                  id: 'wants',
                  label: 'Ցանկություններ և գնումներ',
                  desc: 'Գնումներ, ժամանց և այլ ոչ պարտադիր ծախսեր',
                  amount: rule503020.wants,
                  actualPct: rule503020.wantsPct,
                  targetPct: 30,
                  barClass:
                    rule503020.wantsPct > 35 ? 'bg-rose-500' : 'bg-purple-500',
                },
                {
                  id: 'savings',
                  label: 'Մաքուր խնայողություն',
                  desc: 'Եկամտից մնացած չծախսված հատվածը',
                  amount: rule503020.savingsActual,
                  actualPct: rule503020.savingsPctActual,
                  targetPct: 20,
                  barClass:
                    rule503020.savingsPctActual >= 20
                      ? 'bg-emerald-500'
                      : 'bg-amber-500',
                },
              ].map((row) => (
                <div key={row.id} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                        {row.label}
                      </p>
                      <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                        {row.desc}
                      </p>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <span className="font-mono text-xs sm:text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                        {row.actualPct}%
                      </span>
                      <span className="text-[11px] text-[#94A3B8] ml-1">
                        / {row.targetPct}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#E2E8F0] dark:bg-[#1E293B] overflow-hidden relative">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${row.barClass}`}
                      style={{
                        width: `${Math.max(0, Math.min(100, row.actualPct))}%`,
                      }}
                    />
                  </div>
                  <p className="pa-sensitive text-[11px] font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8]">
                    {formatMoney(row.amount, currency)}
                    {totalIncome > 0 && (
                      <span className="text-[#94A3B8]">
                        {' '}
                        (թիրախ՝{' '}
                        {formatMoney(
                          Math.round((totalIncome * row.targetPct) / 100),
                          currency
                        )}
                        )
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* 7. Expenses Breakdown by #Tags */}
      <SectionCard
        title="Ծախսեր ըստ #թեգերի"
        subtitle={`Այս ցիկլում նշված հեշթեգերով ծախսերի ամփոփում · ${cycleLabel}`}
        icon={Hash}
      >
        {tagBreakdown.items.length === 0 ? (
          <EmptyStatePlaceholder
            compact
            icon={Hash}
            title="Այս ցիկլում #թեգերով ծախսեր չկան"
            description="Գործարք ավելացնելիս ավելացրեք #սուրճ կամ #ճանապարհ՝ խմբավորված վերլուծություն տեսնելու համար։"
          />
        ) : (
          <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
            {tagBreakdown.items.map((item) => {
              const widthPct =
                tagBreakdown.maxTagAmount > 0
                  ? Math.max(4, Math.round((item.amount / tagBreakdown.maxTagAmount) * 100))
                  : 0;
              return (
                <button
                  key={item.tag}
                  type="button"
                  onClick={() => onSelectTagFilter?.(item.tag)}
                  className="w-full py-2.5 px-2 rounded-lg text-left hover:bg-[#F8FAFC] dark:hover:bg-[#162033] transition-colors cursor-pointer space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                    <span className="font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                      <span className="font-mono text-[#2563EB] dark:text-[#60A5FA]">
                        #{item.tag}
                      </span>{' '}
                      <span className="text-[11px] text-[#94A3B8] font-mono tabular-nums">
                        · {item.count} գործարք
                      </span>
                    </span>
                    <span className="pa-sensitive font-mono font-semibold tabular-nums text-[#0F172A] dark:text-[#F8FAFC] shrink-0">
                      {formatMoney(item.amount, currency)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#E2E8F0] dark:bg-[#1E293B] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#2563EB] dark:bg-[#3B82F6] transition-all duration-300"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
