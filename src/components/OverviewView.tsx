import { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  NotebookPen,
  Pencil,
  PiggyBank,
  Plus,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  BudgetLimit,
  FocusGoal,
  Habit,
  NavSection,
  Note,
  PrimaryIncomeConfig,
  Task,
  Transaction,
} from '../types';
import {
  INCOME_KIND_LABELS,
  formatMoney,
  formatReminderLabel,
  formatShortDate,
  getTodayISO,
  getTransactionIncomeKind,
} from '../data/defaults';
import {
  computeCycleFinancials,
  formatCycleLabel,
  getCycleDayMetrics,
  getEffectivePayday,
} from '../utils/financialCycle';

interface OverviewViewProps {
  selectedMonth: string;
  primaryIncome: PrimaryIncomeConfig;
  transactions: Transaction[];
  tasks: Task[];
  notes: Note[];
  budgets: BudgetLimit[];
  habits: Habit[];
  focusGoal: FocusGoal | null;
  onSaveFocusGoal: (title: string) => void;
  onToggleFocusGoal: () => void;
  onClearFocusGoal: () => void;
  onToggleTask: (id: string) => void;
  onQuickAddTask: (title: string) => void;
  onToggleHabitDate: (habitId: string, date: string) => void;
  onNavigate: (tab: NavSection) => void;
  onOpenNewModal: (initialMode: 'transaction' | 'task' | 'note') => void;
  onConfirmPreExpense?: (txId: string) => void;
}

interface SparkNode {
  x: number;
  y: number;
  balance: number;
  label: string;
  date: string;
}

export function OverviewView({
  selectedMonth,
  primaryIncome,
  transactions,
  tasks,
  notes,
  budgets,
  habits,
  focusGoal,
  onSaveFocusGoal,
  onToggleFocusGoal,
  onClearFocusGoal,
  onToggleTask,
  onQuickAddTask,
  onToggleHabitDate,
  onNavigate,
  onOpenNewModal,
  onConfirmPreExpense,
}: OverviewViewProps) {
  const currency = 'AMD' as const;
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [focusInput, setFocusInput] = useState('');
  const [isEditingFocus, setIsEditingFocus] = useState(false);
  const [hoveredSparkIndex, setHoveredSparkIndex] = useState<number | null>(null);
  const todayISO = getTodayISO();

  const effectivePayday = getEffectivePayday(primaryIncome);
  const cycleMetrics = getCycleDayMetrics(selectedMonth, effectivePayday, todayISO);
  const {
    cycleTransactions: monthTransactions,
    openingBalance,
    cycleIncome: totalIncome,
    cycleExpense: totalExpense,
    cycleNet,
    cycleEndBalance: balance,
  } = computeCycleFinancials(transactions, selectedMonth, effectivePayday, todayISO);

  const incomeTransactions = monthTransactions.filter((t) => t.type === 'income');
  const monthlyIncomeTotal = incomeTransactions
    .filter((t) => getTransactionIncomeKind(t) === 'monthly')
    .reduce((sum, t) => sum + t.amount, 0);
  const extraIncomeTotal = incomeTransactions
    .filter((t) => getTransactionIncomeKind(t) === 'extra')
    .reduce((sum, t) => sum + t.amount, 0);
  const oneTimeIncomeTotal = incomeTransactions
    .filter((t) => getTransactionIncomeKind(t) === 'one_time')
    .reduce((sum, t) => sum + t.amount, 0);
  const savingsRate =
    totalIncome > 0
      ? Math.max(0, Math.round(((totalIncome - totalExpense) / totalIncome) * 100))
      : 0;

  // Interactive cumulative real balance points starting from prior carryover
  const sortedChronological = [...monthTransactions].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const rawNodes: { balance: number; label: string; date: string }[] = [
    {
      balance: openingBalance,
      label: openingBalance !== 0 ? 'Նախորդ մնացորդ' : 'Ցիկլի սկիզբ',
      date: cycleMetrics.startDate,
    },
  ];
  for (const tx of sortedChronological) {
    const prev = rawNodes[rawNodes.length - 1].balance;
    rawNodes.push({
      balance:
        prev +
        (tx.type === 'income' ? tx.amount : tx.isPending ? 0 : -tx.amount),
      label: tx.title,
      date: tx.date,
    });
  }

  const minSpark = Math.min(...rawNodes.map((n) => n.balance), 0);
  const maxSpark = Math.max(...rawNodes.map((n) => n.balance), 1);
  const sparkRange = Math.max(1, maxSpark - minSpark);

  const sparkNodes: SparkNode[] = rawNodes.map((node, idx) => {
    const x =
      rawNodes.length <= 1 ? 320 : (idx / (rawNodes.length - 1)) * 320;
    const y = 74 - ((node.balance - minSpark) / sparkRange) * 60;
    return { ...node, x, y };
  });

  const sparkPoints = sparkNodes
    .map((n) => `${n.x.toFixed(1)},${n.y.toFixed(1)}`)
    .join(' ');
  const sparkArea = `0,84 ${sparkPoints} 320,84`;
  const activeSparkNode =
    hoveredSparkIndex !== null ? sparkNodes[hoveredSparkIndex] : null;

  const recentTransactions = [...monthTransactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const expenseByCategory = monthTransactions
    .filter((t) => t.type === 'expense')
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.category] = (acc[t.category] ?? 0) + t.amount;
      return acc;
    }, {});

  const topCategories = Object.entries(expenseByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const completedTasksCount = tasks.filter((t) => t.completed).length;
  const visibleTasks = [...tasks]
    .sort((a, b) => Number(a.completed) - Number(b.completed))
    .slice(0, 5);

  const highlightedNotes = [...notes]
    .sort((a, b) => Number(b.pinned) - Number(a.pinned))
    .slice(0, 3);

  const habitsDoneToday = habits.filter((h) =>
    h.completedDates.includes(todayISO)
  ).length;

  const handleTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickTaskTitle.trim();
    if (!trimmed) return;
    onQuickAddTask(trimmed);
    setQuickTaskTitle('');
  };

  const handleFocusSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = focusInput.trim();
    if (!trimmed) return;
    onSaveFocusGoal(trimmed);
    setFocusInput('');
    setIsEditingFocus(false);
  };

  const startEditFocus = () => {
    setFocusInput(focusGoal?.title ?? '');
    setIsEditingFocus(true);
  };

  return (
    <div className="space-y-6">
      {/* Daily Focus Goal */}
      <section
        aria-label="Օրվա ֆոկուս նպատակ"
        className={`surface-card p-4 sm:px-6 sm:py-5 transition-colors ${
          focusGoal?.completed
            ? 'border-emerald-500/40 dark:border-emerald-500/35'
            : ''
        }`}
      >
        {!focusGoal || isEditingFocus ? (
          <form
            onSubmit={handleFocusSubmit}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-[#2563EB]/10 dark:bg-[#3B82F6]/15 text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
                <Target className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-sm sm:text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  Օրվա ֆոկուս նպատակ
                </h2>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  Սահմանեք այսօրվա մեկ գլխավոր առաջնահերթությունը
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1 sm:max-w-lg min-w-0">
              <input
                type="text"
                value={focusInput}
                onChange={(e) => setFocusInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && isEditingFocus) {
                    setIsEditingFocus(false);
                    setFocusInput('');
                  }
                }}
                placeholder="Օրինակ՝ Ավարտել ամսական հաշվետվությունը..."
                className="flex-1 min-w-0 min-h-[42px] px-3.5 py-2 text-sm rounded-xl input-field"
              />
              <button
                type="submit"
                className="min-h-[42px] px-4 py-2 rounded-xl btn-primary text-xs sm:text-sm whitespace-nowrap shrink-0"
              >
                {isEditingFocus ? 'Պահպանել' : 'Սահմանել'}
              </button>
              {isEditingFocus && (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingFocus(false);
                    setFocusInput('');
                  }}
                  aria-label="Չեղարկել խմբագրումը"
                  className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl border border-[#CBD5E1] dark:border-[#26334D] text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onToggleFocusGoal}
              aria-pressed={focusGoal.completed}
              className="flex-1 min-w-0 min-h-[44px] flex items-center gap-3.5 text-left cursor-pointer group"
            >
              <span
                className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                  focusGoal.completed
                    ? 'bg-emerald-600 border-emerald-600 dark:bg-emerald-500 dark:border-emerald-500 text-white dark:text-[#060B16]'
                    : 'border-[#CBD5E1] dark:border-[#334155] group-hover:border-[#2563EB] dark:group-hover:border-[#3B82F6]'
                }`}
              >
                {focusGoal.completed && (
                  <Check className="w-3.5 h-3.5" strokeWidth={2.7} />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1.5">
                  <span>Օրվա ֆոկուս նպատակ</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      focusGoal.completed
                        ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                        : 'text-[#2563EB] dark:text-[#60A5FA] font-semibold'
                    }
                  >
                    {focusGoal.completed ? 'Կատարված է' : 'Ընթացքում'}
                  </span>
                </p>
                <p
                  className={`mt-0.5 text-sm sm:text-base font-display font-semibold break-words ${
                    focusGoal.completed
                      ? 'line-through text-[#94A3B8] dark:text-[#64748B]'
                      : 'text-[#0F172A] dark:text-[#F8FAFC]'
                  }`}
                >
                  {focusGoal.title}
                </p>
              </div>
            </button>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={startEditFocus}
                aria-label="Խմբագրել օրվա ֆոկուս նպատակը"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onClearFocusGoal}
                aria-label="Հեռացնել օրվա ֆոկուս նպատակը"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Row 1: Hero Financial Bento + Today's Rhythm */}
      <section
        aria-label="Ամսական հաշվեկշիռ և օրվա ռիթմ"
        className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-stretch"
      >
        {/* Left Dominant Cashflow & Balance Card */}
        <div className="lg:col-span-7 min-w-0 surface-card p-5 sm:p-7 flex flex-col justify-between gap-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8] truncate">
                {activeSparkNode
                  ? `${formatShortDate(activeSparkNode.date)} · ${activeSparkNode.label}`
                  : `${formatCycleLabel(selectedMonth, effectivePayday)} · Իրական բալանս`}
              </p>
              <h1
                className={`mt-2 font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight tabular-nums break-words ${
                  (activeSparkNode ? activeSparkNode.balance : balance) >= 0
                    ? 'text-[#0F172A] dark:text-[#F8FAFC]'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {formatMoney(
                  activeSparkNode ? activeSparkNode.balance : balance,
                  currency
                )}
              </h1>
              <p className="mt-2 text-xs text-[#64748B] dark:text-[#94A3B8] flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
                {openingBalance !== 0 && (
                  <>
                    <span>
                      Նախորդ մնացորդ՝{' '}
                      <span className="font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                        {openingBalance > 0 ? '+' : ''}
                        {formatMoney(openingBalance, currency)}
                      </span>
                    </span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <span>
                  Ցիկլի զուտ՝{' '}
                  <span
                    className={`font-mono font-semibold ${
                      cycleNet >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {cycleNet > 0 ? '+' : ''}
                    {formatMoney(cycleNet, currency)}
                  </span>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Խնայողություն՝{' '}
                  <span className="font-mono font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                    {savingsRate}%
                  </span>
                </span>
                {primaryIncome.enabled && cycleMetrics.isCurrentCycle && (
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

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onOpenNewModal('transaction')}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-[#F8FAFC] dark:bg-[#111A2E] text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#2563EB] dark:hover:border-[#3B82F6] active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
              >
                + Գործարք
              </button>
              <button
                type="button"
                onClick={() => onNavigate('finance')}
                className="min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#172554]/50 inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Մատյան</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive Cashflow Curve */}
          {sparkNodes.length > 1 && (
            <div
              className="w-full pt-2 relative"
              onMouseLeave={() => setHoveredSparkIndex(null)}
            >
              <svg
                viewBox="0 0 320 84"
                preserveAspectRatio="none"
                className="w-full h-24 overflow-visible"
                role="img"
                aria-label="Ամսական հաշվեկշռի շարժի գծապատկեր"
              >
                <defs>
                  <linearGradient id="cobaltFlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.26" />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon points={sparkArea} fill="url(#cobaltFlow)" />
                <polyline
                  points={sparkPoints}
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {activeSparkNode && (
                  <>
                    <line
                      x1={activeSparkNode.x}
                      y1="0"
                      x2={activeSparkNode.x}
                      y2="84"
                      stroke="#3B82F6"
                      strokeOpacity="0.45"
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={activeSparkNode.x}
                      cy={activeSparkNode.y}
                      r="4.2"
                      fill="#3B82F6"
                      stroke="#FFFFFF"
                      strokeWidth="1.5"
                    />
                  </>
                )}
                {sparkNodes.map((node, idx) => {
                  const colWidth = 320 / sparkNodes.length;
                  const xStart = Math.max(0, node.x - colWidth / 2);
                  return (
                    <rect
                      key={`${node.date}-${idx}`}
                      x={xStart}
                      y={0}
                      width={colWidth}
                      height={84}
                      fill="transparent"
                      className="cursor-crosshair"
                      onMouseEnter={() => setHoveredSparkIndex(idx)}
                      onClick={() => setHoveredSparkIndex(idx)}
                    />
                  );
                })}
              </svg>
            </div>
          )}

          {/* Split KPI Footer */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 pt-4 sm:pt-5 border-t border-[#E2E8F0] dark:border-[#1E293B]">
            <div className="min-w-0 flex items-start gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <TrendingUp className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                  Եկամուտ
                </p>
                <p className="mt-0.5 text-sm sm:text-base lg:text-lg font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 truncate">
                  +{formatMoney(totalIncome, currency)}
                </p>
                {totalIncome > 0 && (
                  <p className="mt-0.5 text-[11px] text-[#94A3B8] dark:text-[#64748B] truncate tabular-nums">
                    {[
                      monthlyIncomeTotal > 0
                        ? `Ամս. ${formatMoney(monthlyIncomeTotal, currency)}`
                        : null,
                      extraIncomeTotal > 0
                        ? `Հավ. ${formatMoney(extraIncomeTotal, currency)}`
                        : null,
                      oneTimeIncomeTotal > 0
                        ? `Միանգ. ${formatMoney(oneTimeIncomeTotal, currency)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
            </div>

            <div className="min-w-0 flex items-start gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-rose-500/12 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
                <TrendingDown className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                  Ծախս
                </p>
                <p className="mt-0.5 text-sm sm:text-base lg:text-lg font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400 truncate">
                  -{formatMoney(totalExpense, currency)}
                </p>
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-[#F1F5F9] dark:border-[#1E293B] min-w-0 flex items-start gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-[#2563EB]/10 dark:bg-[#3B82F6]/15 text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                  Կատարված գործեր
                </p>
                <p className="mt-0.5 text-sm sm:text-base lg:text-lg font-bold font-mono tabular-nums text-[#0F172A] dark:text-[#F8FAFC]">
                  {completedTasksCount}/{tasks.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Stage: Unified Today's Rhythm */}
        <div className="lg:col-span-5 min-w-0 surface-card flex flex-col justify-between overflow-hidden">
          <div>
            <div className="px-4 sm:px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  Օրվա ռիթմ
                </h2>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                  {completedTasksCount}/{tasks.length} անելիք · {habitsDoneToday}/
                  {habits.length} սովորություն
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('planner')}
                className="min-h-[34px] px-2.5 rounded-lg text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#172554]/50 inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Պլանավորող</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <form
              onSubmit={handleTaskSubmit}
              className="px-4 sm:px-6 py-3 border-b border-[#F1F5F9] dark:border-[#1E293B] flex items-center gap-2"
            >
              <input
                type="text"
                value={quickTaskTitle}
                onChange={(e) => setQuickTaskTitle(e.target.value)}
                placeholder="Արագ ավելացնել անելիք..."
                className="flex-1 min-w-0 min-h-[40px] px-3.5 py-1.5 text-sm rounded-xl input-field"
              />
              <button
                type="submit"
                aria-label="Ավելացնել անելիք"
                className="min-h-[40px] min-w-[40px] rounded-xl btn-primary flex items-center justify-center shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            </form>

            {visibleTasks.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#64748B] dark:text-[#94A3B8]">
                Անելիքների ցանկը դատարկ է։
              </div>
            ) : (
              <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
                {visibleTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onToggleTask(task.id)}
                    className="w-full min-h-[46px] px-4 sm:px-6 py-2.5 flex items-center gap-3 text-left hover:bg-[#F8FAFC] dark:hover:bg-[#162033] active:scale-[0.995] transition-all cursor-pointer"
                  >
                    <span
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                        task.completed
                          ? 'bg-[#2563EB] border-[#2563EB] dark:bg-[#3B82F6] dark:border-[#3B82F6] text-white dark:text-[#060B16]'
                          : 'border-[#CBD5E1] dark:border-[#334155]'
                      }`}
                    >
                      {task.completed && (
                        <Check className="w-3 h-3" strokeWidth={2.7} />
                      )}
                    </span>
                    <span
                      className={`text-sm flex-1 truncate ${
                        task.completed
                          ? 'line-through text-[#94A3B8] dark:text-[#64748B]'
                          : 'text-[#0F172A] dark:text-[#F8FAFC] font-medium'
                      }`}
                    >
                      {task.title}
                    </span>
                    {task.dueTime && (
                      <span className="text-xs font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8] shrink-0">
                        {task.dueTime}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {habits.length > 0 && (
            <div className="px-4 sm:px-6 py-3.5 border-t border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120]">
              <p className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8] mb-2">
                Այսօրվա սովորությունները
              </p>
              <div className="flex flex-wrap gap-2">
                {habits.map((h) => {
                  const done = h.completedDates.includes(todayISO);
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => onToggleHabitDate(h.id, todayISO)}
                      className={`min-h-[34px] px-3 py-1 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 active:scale-[0.97] transition-all cursor-pointer ${
                        done
                          ? 'border-emerald-600/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                          : 'border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-[#334155] dark:text-[#CBD5E1] hover:border-[#2563EB] dark:hover:border-[#3B82F6]'
                      }`}
                    >
                      <Check
                        className={`w-3.5 h-3.5 ${
                          done ? 'opacity-100' : 'opacity-30'
                        }`}
                      />
                      <span>{h.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Row 2: 3-Column Architectural Strip */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 items-start">
        <div className="surface-card min-w-0">
          <div className="px-5 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between gap-2">
            <h3 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
              Վերջին գործարքները
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('finance')}
              className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
            >
              Բոլորը
            </button>
          </div>
          {recentTransactions.length === 0 ? (
            <div className="p-6 text-center text-sm text-[#64748B] dark:text-[#94A3B8]">
              Գրանցված գործարքներ չկան։
            </div>
          ) : (
            <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
              {recentTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="px-5 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        tx.isPending
                          ? 'bg-amber-500/12 text-amber-600 dark:text-amber-400'
                          : tx.type === 'income'
                          ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
                      }`}
                      aria-hidden="true"
                    >
                      {tx.isPending ? (
                        <Clock className="w-4 h-4" />
                      ) : tx.type === 'income' ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                          {tx.title}
                        </p>
                        {tx.isPending && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 shrink-0">
                            Նախածախս
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#64748B] dark:text-[#94A3B8] truncate tabular-nums">
                        {tx.type === 'income'
                          ? `${INCOME_KIND_LABELS[getTransactionIncomeKind(tx)]} · ${tx.category} · ${formatShortDate(tx.date)}`
                          : `${tx.category} · ${formatShortDate(tx.date)}${tx.isPending ? ' · Չհանված' : ''}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="text-right">
                      <span
                        className={`text-xs sm:text-sm font-semibold font-mono tabular-nums whitespace-nowrap block ${
                          tx.isPending
                            ? 'text-amber-600 dark:text-amber-400'
                            : tx.type === 'income'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-[#0F172A] dark:text-[#F8FAFC]'
                        }`}
                      >
                        {tx.type === 'income' ? '+' : '-'}
                        {formatMoney(tx.amount, currency)}
                      </span>
                      {tx.isPending && (
                        <span className="block text-[10px] text-amber-600/80 dark:text-amber-400/80 font-medium">
                          չհանված
                        </span>
                      )}
                    </div>
                    {tx.isPending && onConfirmPreExpense && (
                      <button
                        type="button"
                        onClick={() => onConfirmPreExpense(tx.id)}
                        className="px-2 py-1 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 active:scale-95 transition-all cursor-pointer"
                        title="Հաստատել և հանել բալանսից"
                      >
                        Հաստատել
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Col 2: Category & Budget Health */}
        <div className="surface-card min-w-0 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-[#2563EB]/10 dark:bg-[#3B82F6]/15 text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center">
                <PiggyBank className="w-4 h-4" />
              </span>
              <h3 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Բյուջեի վերահսկում
              </h3>
            </span>
            <button
              type="button"
              onClick={() => onNavigate('finance')}
              className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
            >
              Կարգավորել
            </button>
          </div>
          {topCategories.length === 0 ? (
            <p className="text-sm text-[#64748B] dark:text-[#94A3B8] py-4">
              Ծախսեր ավելացնելուց հետո այստեղ կտեսնեք բյուջեի վիճակը։
            </p>
          ) : (
            <div className="space-y-4">
              {topCategories.map(([category, amount]) => {
                const budget = budgets.find((b) => b.category === category);
                const pct = budget
                  ? Math.round((amount / budget.limit) * 100)
                  : totalExpense > 0
                    ? Math.round((amount / totalExpense) * 100)
                    : 0;
                const barWidth = Math.min(100, Math.max(pct, 4));
                const barColor = budget
                  ? pct >= 100
                    ? 'bg-rose-500'
                    : pct >= 80
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  : 'bg-[#2563EB] dark:bg-[#3B82F6]';

                return (
                  <div key={category} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs sm:text-sm gap-2">
                      <span className="font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                        {category}
                      </span>
                      <span className="font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8] text-xs">
                        {formatMoney(amount, currency)}
                        {budget
                          ? ` / ${formatMoney(budget.limit, currency)}`
                          : ` (${pct}%)`}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[#E2E8F0] dark:bg-[#1E293B] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    {budget && (
                      <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                        {budget.limit - amount >= 0
                          ? `Մնացել է ${formatMoney(budget.limit - amount, currency)}`
                          : `Գերազանցված է ${formatMoney(amount - budget.limit, currency)}-ով`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Col 3: Notes */}
        <div className="surface-card min-w-0 md:col-span-2 lg:col-span-1">
          <div className="px-5 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-[#2563EB]/10 dark:bg-[#3B82F6]/15 text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center">
                <NotebookPen className="w-4 h-4" />
              </span>
              <h3 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Նշումներ և հիշեցումներ
              </h3>
            </span>
            <button
              type="button"
              onClick={() => onNavigate('notes')}
              className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
            >
              Բոլորը
            </button>
          </div>
          {highlightedNotes.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-[#64748B] dark:text-[#94A3B8]">
                Պահպանված նշումներ դեռ չկան։
              </p>
              <button
                type="button"
                onClick={() => onOpenNewModal('note')}
                className="mt-2 text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
              >
                Գրել առաջին նշումը
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
              {highlightedNotes.map((note) => (
                <div key={note.id} className="px-5 py-4 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h4 className="font-display text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                      {note.title}
                    </h4>
                    {note.pinned && (
                      <span className="text-[11px] font-semibold text-[#2563EB] dark:text-[#60A5FA] shrink-0">
                        Ամրացված
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#94A3B8] line-clamp-2 whitespace-pre-line">
                    {note.content}
                  </p>
                  {note.reminderDate && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 tabular-nums pt-0.5">
                      Հիշեցում · {formatReminderLabel(note.reminderDate)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
