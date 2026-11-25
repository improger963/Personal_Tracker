import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  FileDown,
  FileText,
  Repeat,
  TrendingUp,
} from 'lucide-react';
import {
  BudgetLimit,
  Currency,
  IncomeKind,
  Transaction,
} from '../../types';
import { formatMoney, formatShortDate } from '../../data/defaults';
import { formatCycleLabel } from '../../utils/financialCycle';
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
}

export function AnalyticsAndReportsPage({
  selectedMonth,
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
  categoryComparisonData,
  monthlySeries,
  last3MonthsSeries,
  incomeKindSummary,
  expenseByCategory,
  onNotify,
  onSelectCategoryFilter,
}: AnalyticsAndReportsPageProps) {
  const prefersReducedMotion = useReducedMotion();
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

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
    <div className="space-y-6">
      {/* 1. Monthly Summary Card */}
      <section className="surface-card overflow-hidden">
        <div className="px-5 py-4 sm:px-6 border-b border-[#E2E8F0] dark:border-[#1E293B] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-display text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
              Ամսական ամփոփում
            </h2>
            <span className="text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums">
              {cycleLabel} · {monthTransactions.length} գործարք
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {savingsPct !== null && (
              <p className="text-xs font-medium tabular-nums text-[#64748B] dark:text-[#94A3B8] mr-1">
                {netSavings >= 0 ? (
                  <>
                    Խնայողության մակարդակ՝{' '}
                    <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      {savingsPct}%
                    </span>
                  </>
                ) : (
                  <>
                    Գերծախս՝{' '}
                    <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                      {Math.abs(savingsPct)}%
                    </span>
                  </>
                )}
              </p>
            )}

            <button
              type="button"
              onClick={handleExportSummaryText}
              aria-label="Արտահանել ամսական ամփոփումը տեքստային ֆորմատով"
              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] inline-flex items-center gap-1.5 hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 text-[#64748B] dark:text-[#94A3B8]" />
              <span>Տեքստ (.txt)</span>
            </button>

            <button
              type="button"
              onClick={handleExportSummaryPDF}
              disabled={isExportingPDF}
              aria-label="Արտահանել ամսական ամփոփումը PDF ֆորմատով"
              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-[#F8FAFC] dark:bg-[#111A2E] text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] inline-flex items-center gap-1.5 hover:border-[#2563EB] dark:hover:border-[#3B82F6] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>{isExportingPDF ? 'Պատրաստվում է…' : 'PDF ամփոփում'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E2E8F0] dark:divide-[#1E293B]">
          <div className="p-4 sm:p-5 lg:p-6 min-w-0">
            <p className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
              Նախորդ մնացորդ
            </p>
            <p
              className={`mt-1.5 font-mono text-xl md:text-2xl font-bold tabular-nums tracking-tight truncate ${
                openingBalance > 0
                  ? 'text-[#0F172A] dark:text-[#F8FAFC]'
                  : openingBalance < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-[#64748B] dark:text-[#94A3B8]'
              }`}
            >
              {openingBalance > 0 ? '+' : ''}
              {formatMoney(openingBalance, currency)}
            </p>
            <p className="mt-1 text-xs text-[#94A3B8] dark:text-[#64748B] tabular-nums">
              Մինչև {formatShortDate(cycleMetrics.startDate)} կուտակվածը
            </p>
          </div>

          <div className="p-4 sm:p-5 lg:p-6 min-w-0">
            <p className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
              Ամսվա եկամուտ
            </p>
            <p className="mt-1.5 font-mono text-xl md:text-2xl font-bold tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400 truncate">
              +{formatMoney(totalIncome, currency)}
            </p>
            <p className="mt-1 text-xs text-[#94A3B8] dark:text-[#64748B] flex flex-wrap items-center gap-1.5 tabular-nums">
              <span>{incomeTransactions.length} մուտք</span>
              {incomeDeltaPct !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      incomeDeltaPct >= 0
                        ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                        : 'text-rose-600 dark:text-rose-400 font-medium'
                    }
                  >
                    {incomeDeltaPct >= 0 ? '+' : ''}
                    {incomeDeltaPct}% նախ. ցիկլից
                  </span>
                </>
              )}
            </p>
            <div className="mt-2.5 pt-2.5 border-t border-[#F1F5F9] dark:border-[#1E293B] grid grid-cols-3 gap-2 text-[11px] tabular-nums">
              <div className="min-w-0">
                <span className="block text-[#94A3B8] dark:text-[#64748B] truncate">
                  Ամսական
                </span>
                <span className="font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate block">
                  {formatMoney(monthlyIncomeTotal, currency)}
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-[#94A3B8] dark:text-[#64748B] truncate">
                  Հավելյալ
                </span>
                <span className="font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate block">
                  {formatMoney(extraIncomeTotal, currency)}
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-[#94A3B8] dark:text-[#64748B] truncate">
                  Միանգամյա
                </span>
                <span className="font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate block">
                  {formatMoney(oneTimeIncomeTotal, currency)}
                </span>
              </div>
            </div>
            {repeatableMonthlyIncomes.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onRepeatMonthlyIncomes(repeatableMonthlyIncomes, selectedMonth)
                }
                className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer tabular-nums"
              >
                <Repeat className="w-3 h-3 shrink-0" />
                <span>
                  Կրկնել նախ. ցիկլի ամսական եկամուտը ({repeatableMonthlyIncomes.length})
                </span>
              </button>
            )}
          </div>

          <div className="p-4 sm:p-5 lg:p-6 min-w-0">
            <p className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
              Ամսվա ծախս
            </p>
            <p className="mt-1.5 font-mono text-xl md:text-2xl font-bold tabular-nums tracking-tight text-rose-600 dark:text-rose-400 truncate">
              -{formatMoney(totalExpense, currency)}
            </p>
            <p className="mt-1 text-xs text-[#94A3B8] dark:text-[#64748B] flex flex-wrap items-center gap-1.5 tabular-nums">
              <span>{expenseTransactions.length} ելք</span>
              {expenseDeltaPct !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      expenseDeltaPct <= 0
                        ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                        : 'text-rose-600 dark:text-rose-400 font-medium'
                    }
                  >
                    {expenseDeltaPct >= 0 ? '+' : ''}
                    {expenseDeltaPct}% նախ. ցիկլից
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="p-4 sm:p-5 lg:p-6 min-w-0 bg-[#F8FAFC]/60 dark:bg-[#0B1120]/50">
            <p className="text-xs font-medium text-[#2563EB] dark:text-[#60A5FA]">
              Իրական բալանս
            </p>
            <p
              className={`mt-1.5 font-display text-2xl lg:text-3xl font-bold tabular-nums tracking-tight truncate ${
                realBalance >= 0
                  ? 'text-[#0F172A] dark:text-[#F8FAFC]'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {realBalance > 0 ? '+' : ''}
              {formatMoney(realBalance, currency)}
            </p>
            <p className="mt-1 text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums">
              Նախորդ մնացորդ + Եկամուտ - Ծախս
            </p>
          </div>
        </div>
      </section>

      {/* 2. Spend Pace & Burn Rate Forecast */}
      <section className="surface-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-[#EFF6FF] dark:bg-[#172554] text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </span>
            <div>
              <h3 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Ծախսերի տեմպ և կանխատեսում
              </h3>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                Միջին օրական այրման տեմպի և ամսվա ավարտի հաշվարկ
              </p>
            </div>
          </div>
          <span className={`text-xs font-semibold ${projectionStatusClass}`}>
            {projectionStatusText}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-[#0B1120] border border-[#E2E8F0] dark:border-[#1E293B]">
            <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">Օրական միջին</span>
            <p className="font-mono text-base font-bold text-[#0F172A] dark:text-[#F8FAFC] mt-0.5 tabular-nums">
              {formatMoney(Math.round(dailyBurnRate), currency)}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-[#0B1120] border border-[#E2E8F0] dark:border-[#1E293B]">
            <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">Կանխատեսվող ամսական</span>
            <p className="font-mono text-base font-bold text-[#2563EB] dark:text-[#60A5FA] mt-0.5 tabular-nums">
              {formatMoney(projectedMonthlyExpense, currency)}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-[#0B1120] border border-[#E2E8F0] dark:border-[#1E293B]">
            <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">Մնացորդային կանխատեսում</span>
            <p className="font-mono text-base font-bold text-[#475569] dark:text-[#CBD5E1] mt-0.5 tabular-nums">
              {formatMoney(projectedRemainingExpense, currency)}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-[#0B1120] border border-[#E2E8F0] dark:border-[#1E293B]">
            <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">Չվճարված պլանավորված</span>
            <p className="font-mono text-base font-bold text-amber-600 dark:text-amber-400 mt-0.5 tabular-nums">
              {formatMoney(unpaidBillsTotal, currency)}
            </p>
          </div>
        </div>

        {/* Progress Bar of Pace */}
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
      </section>

      {/* 3. 3-Month Comparative Income vs Expense Chart */}
      <section className="surface-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <h3 className="font-display text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
              Վերջին 3 ամիսների համեմատական (Եկամուտ և Ծախս)
            </h3>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
              Համեմատեք վերջին երեք հաշվարկային ամիսների դրամական հոսքերը՝ բյուջետավորումը հեշտացնելու համար
            </p>
          </div>
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
        </div>

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
      </section>

      {/* 4. Category Comparison & Donut Chart Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Category Budget vs Actual Spent */}
        <section className="lg:col-span-7 min-w-0 surface-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div>
              <h3 className="font-display text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                {budgets.length > 0
                  ? 'Բյուջե և փաստացի ծախս (ըստ կատեգորիայի)'
                  : 'Ամսական հաշվեկշռի ամփոփում'}
              </h3>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5 tabular-nums">
                {cycleLabel}
              </p>
            </div>
            {budgets.length > 0 && (
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
            )}
          </div>

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

          {/* 6-Month History List */}
          <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
            {monthlySeries.map((m) => {
              const net = m.income - m.expense;
              const isSelected = m.monthKey === selectedMonth;
              return (
                <button
                  key={m.monthKey}
                  type="button"
                  onClick={() => onChangeMonth(m.monthKey)}
                  className={`w-full py-2.5 px-2 -mx-2 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#EFF6FF] dark:bg-[#172554]/50'
                      : 'hover:bg-[#F8FAFC] dark:hover:bg-[#162033]'
                  }`}
                >
                  <span className="font-medium text-[#334155] dark:text-[#CBD5E1]">
                    {formatCycleLabel(m.monthKey, effectivePayday)}
                  </span>
                  <div className="flex items-center gap-2.5 sm:gap-4 font-mono tabular-nums">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      +{formatMoney(m.income, currency)}
                    </span>
                    <span className="text-rose-600 dark:text-rose-400">
                      -{formatMoney(m.expense, currency)}
                    </span>
                    <span
                      className={`hidden sm:inline ${
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
        </section>

        {/* Donut Chart & Category Breakdown */}
        <section className="lg:col-span-5 min-w-0 surface-card p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
              Ծախսեր ըստ կատեգորիայի
            </h3>
            <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">
              {cycleLabel}
            </span>
          </div>

          {donutSegments.length === 0 ? (
            <p className="text-sm text-[#64748B] dark:text-[#94A3B8] py-8 text-center">
              Այս ամսում գրանցված ծախսեր չկան։
            </p>
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
                          hoveredCategory !== null && hoveredCategory !== seg.category;
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
                  transition={{ duration: 0.35, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none"
                >
                  <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate max-w-[100px]">
                    {hoveredCategory ?? 'Ընդհանուր'}
                  </span>
                  <span className="text-sm font-bold font-mono tabular-nums text-[#0F172A] dark:text-[#F8FAFC] mt-0.5">
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
                    <span className="font-mono tabular-nums text-[#475569] dark:text-[#CBD5E1] text-xs sm:text-sm">
                      {formatMoney(seg.amount, currency)}{' '}
                      <span className="text-[#94A3B8]">({seg.pct}%)</span>
                    </span>
                  </motion.button>
                ))}
              </div>
            </>
          )}

          {/* Income Structure Breakdown */}
          <div className="pt-4 border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-display text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Եկամտի կառուցվածք
              </h4>
              <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                +{formatMoney(totalIncome, currency)}
              </span>
            </div>
            {totalIncome === 0 ? (
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                Այս ամսում գրանցված եկամուտներ չկան։
              </p>
            ) : (
              <div className="space-y-2.5">
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
                        <span className="font-mono text-[#475569] dark:text-[#CBD5E1]">
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
        </section>
      </div>
    </div>
  );
}
