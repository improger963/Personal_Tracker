import { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  HandCoins,
  NotebookPen,
  Pencil,
  PiggyBank,
  Plus,
  Receipt,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { EmptyStatePlaceholder } from './ui/Skeleton';
import { FocusTimerCard } from './FocusTimerCard';
import { QuickModalMode } from './QuickAddModal';
import {
  BankCard,
  BudgetLimit,
  DebtItem,
  FocusGoal,
  FocusSession,
  Habit,
  NavSection,
  Note,
  NotificationSettings,
  PrimaryIncomeConfig,
  SavingsGoal,
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
  SafeToSpendMetrics,
  computeCycleFinancials,
  formatCycleLabel,
  getCycleDayMetrics,
  getEffectivePayday,
} from '../utils/financialCycle';
import {
  getTaskScheduleLabel,
  isTaskCompletedOnDate,
  isTaskDueOnDate,
  isTaskRepeating,
} from '../utils/taskSchedule';
import {
  CARD_SURFACE_CLASSES,
  CARD_TYPE_META,
  INTERNAL_TRANSFER_CATEGORY,
  computeCardStats,
  formatCardLabel,
} from '../utils/cardBalances';

interface OverviewViewProps {
  selectedMonth: string;
  primaryIncome: PrimaryIncomeConfig;
  transactions: Transaction[];
  cards: BankCard[];
  tasks: Task[];
  notes: Note[];
  budgets: BudgetLimit[];
  habits: Habit[];
  focusGoal: FocusGoal | null;
  safeToSpend: SafeToSpendMetrics;
  savingsGoals: SavingsGoal[];
  debts: DebtItem[];
  focusSessions: FocusSession[];
  soundEnabled: boolean;
  browserNotifications: boolean;
  notificationSettings?: NotificationSettings;
  onCompleteFocusSession: (session: Omit<FocusSession, 'id' | 'completedAt'>) => void;
  onSaveFocusGoal: (title: string) => void;
  onToggleFocusGoal: () => void;
  onClearFocusGoal: () => void;
  onToggleTask: (id: string) => void;
  onToggleHabitDate: (habitId: string, date: string) => void;
  onNavigate: (tab: NavSection) => void;
  onOpenNewModal: (initialMode: QuickModalMode) => void;
  onQuickCardTransaction: (type: 'income' | 'expense', cardId: string) => void;
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
  cards,
  tasks,
  notes,
  budgets,
  habits,
  focusGoal,
  safeToSpend,
  savingsGoals,
  debts,
  focusSessions,
  soundEnabled,
  browserNotifications,
  notificationSettings,
  onCompleteFocusSession,
  onSaveFocusGoal,
  onToggleFocusGoal,
  onClearFocusGoal,
  onToggleTask,
  onToggleHabitDate,
  onNavigate,
  onOpenNewModal,
  onQuickCardTransaction,
  onConfirmPreExpense,
}: OverviewViewProps) {
  const currency = 'AMD' as const;
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

  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const cardStats = cards.map((card) => computeCardStats(card, transactions));
  const totalCardsBalance = cardStats.reduce(
    (sum, item) => sum + item.currentBalance,
    0
  );

  const incomeTransactions = monthTransactions.filter(
    (t) => t.type === 'income' && t.category !== INTERNAL_TRANSFER_CATEGORY
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
  const savingsRate =
    totalIncome > 0
      ? Math.max(0, Math.round(((totalIncome - totalExpense) / totalIncome) * 100))
      : 0;

  // Interactive cumulative real balance points starting from prior carryover
  const sortedChronological = [...monthTransactions]
    .filter((t) => t.category !== INTERNAL_TRANSFER_CATEGORY)
    .sort((a, b) => a.date.localeCompare(b.date));
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
    .filter(
      (t) => t.type === 'expense' && t.category !== INTERNAL_TRANSFER_CATEGORY
    )
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.category] = (acc[t.category] ?? 0) + t.amount;
      return acc;
    }, {});

  const topCategories = Object.entries(expenseByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const dueOrOverdueTasks = tasks.filter(
    (t) =>
      isTaskDueOnDate(t, todayISO) ||
      (!isTaskRepeating(t) && !t.completed && t.date < todayISO)
  );
  const overviewTaskPool = dueOrOverdueTasks.length > 0 ? dueOrOverdueTasks : tasks;
  const completedTasksCount = overviewTaskPool.filter((t) =>
    isTaskCompletedOnDate(t, todayISO)
  ).length;
  const visibleTasks = [...overviewTaskPool]
    .sort(
      (a, b) =>
        Number(isTaskCompletedOnDate(a, todayISO)) -
        Number(isTaskCompletedOnDate(b, todayISO))
    )
    .slice(0, 5);

  const highlightedNotes = [...notes]
    .sort((a, b) => Number(b.pinned) - Number(a.pinned))
    .slice(0, 3);

  const habitsDoneToday = habits.filter((h) =>
    h.completedDates.includes(todayISO)
  ).length;

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

  const openGoalsAndDebtsPage = () => {
    try {
      localStorage.setItem('pa_finance_active_page', 'goals_debts');
    } catch {
      // ignore
    }
    onNavigate('finance');
  };

  const activeGoals = savingsGoals.filter((g) => g.currentAmount < g.targetAmount);
  const totalSavedGoals = savingsGoals.reduce((s, g) => s + g.currentAmount, 0);
  const totalTargetGoals = savingsGoals.reduce((s, g) => s + g.targetAmount, 0);
  const activeDebts = debts.filter((d) => !d.settled);
  const activeLentTotal = activeDebts
    .filter((d) => d.direction === 'lent')
    .reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0);
  const activeBorrowedTotal = activeDebts
    .filter((d) => d.direction === 'borrowed')
    .reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0);
  const reservedTotal = safeToSpend.reservedBills + safeToSpend.reservedPending;

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

      {/* Compact Focus Pomodoro Strip */}
      <FocusTimerCard
        compact
        tasks={tasks}
        focusGoal={focusGoal}
        focusSessions={focusSessions}
        soundEnabled={soundEnabled}
        browserNotifications={browserNotifications}
        notificationSettings={notificationSettings}
        onCompleteSession={onCompleteFocusSession}
      />

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

          {/* Safe-to-Spend Daily Allowance Highlight */}
          <div className="rounded-xl border border-[#BFDBFE]/75 dark:border-[#1E3A8A]/70 bg-[#EFF6FF]/60 dark:bg-[#172554]/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-lg bg-[#2563EB]/12 dark:bg-[#3B82F6]/20 text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  Օրական անվտանգ բյուջե
                </p>
                <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums truncate">
                  {safeToSpend.remainingDaysInclusive} օր ·{' '}
                  {safeToSpend.remainingTodayAllowance >= 0
                    ? `այսօր մնաց ${formatMoney(safeToSpend.remainingTodayAllowance, currency)}`
                    : `այսօր գերազանցված ${formatMoney(Math.abs(safeToSpend.remainingTodayAllowance), currency)}-ով`}
                  {reservedTotal > 0
                    ? ` · պահուստ՝ ${formatMoney(reservedTotal, currency)}`
                    : ''}
                </p>
              </div>
            </div>
            <div className="sm:text-right shrink-0">
              <span className="font-mono text-base sm:text-lg font-bold tabular-nums text-[#1D4ED8] dark:text-[#60A5FA]">
                {formatMoney(safeToSpend.dailyAllowance, currency)}
              </span>
              <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8] ml-1">
                / օր
              </span>
            </div>
          </div>

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
                  {completedTasksCount}/{overviewTaskPool.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Stage: Unified Today's Rhythm */}
        <div className="lg:col-span-5 min-w-0 surface-card flex flex-col justify-between overflow-hidden">
          <div>
            <div className="px-4 sm:px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  Օրվա ռիթմ
                </h2>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums truncate">
                  {completedTasksCount}/{overviewTaskPool.length} անելիք · {habitsDoneToday}/
                  {habits.length} սովորություն
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenNewModal('task')}
                  className="min-h-[34px] px-3 py-1 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-[#F8FAFC] dark:bg-[#111A2E] text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#2563EB] dark:hover:border-[#3B82F6] active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Անելիք</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('planner')}
                  className="min-h-[34px] px-2.5 rounded-lg text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#172554]/50 inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>Պլանավորող</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {visibleTasks.length === 0 ? (
              <div className="p-4 sm:p-5">
                <EmptyStatePlaceholder
                  compact
                  icon={CheckCircle2}
                  title="Անելիքների ցանկը դատարկ է"
                  description="Ավելացրեք այսօրվա առաջնահերթ գործը մեկ հպումով։"
                  actionLabel="+ Ավելացնել անելիք"
                  onAction={() => onOpenNewModal('task')}
                />
              </div>
            ) : (
              <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
                {visibleTasks.map((task) => {
                  const doneToday = isTaskCompletedOnDate(task, todayISO);
                  const repeating = isTaskRepeating(task);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onToggleTask(task.id)}
                      className="w-full min-h-[46px] px-4 sm:px-6 py-2.5 flex items-center gap-3 text-left hover:bg-[#F8FAFC] dark:hover:bg-[#162033] active:scale-[0.995] transition-all cursor-pointer"
                    >
                      <span
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                          doneToday
                            ? 'bg-[#2563EB] border-[#2563EB] dark:bg-[#3B82F6] dark:border-[#3B82F6] text-white dark:text-[#060B16]'
                            : 'border-[#CBD5E1] dark:border-[#334155]'
                        }`}
                      >
                        {doneToday && (
                          <Check className="w-3 h-3" strokeWidth={2.7} />
                        )}
                      </span>
                      <span
                        className={`text-sm flex-1 truncate ${
                          doneToday
                            ? 'line-through text-[#94A3B8] dark:text-[#64748B]'
                            : 'text-[#0F172A] dark:text-[#F8FAFC] font-medium'
                        }`}
                      >
                        {task.title}
                      </span>
                      {repeating && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#EFF6FF] dark:bg-[#172554] text-[#2563EB] dark:text-[#60A5FA] shrink-0">
                          {getTaskScheduleLabel(task)}
                        </span>
                      )}
                      {task.dueTime && (
                        <span className="text-xs font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8] shrink-0">
                          {task.dueTime}
                        </span>
                      )}
                    </button>
                  );
                })}
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

      {/* Row 1.5: Compact Cards & Wallets Strip */}
      <section
        aria-label="Քարտեր և մնացորդներ"
        className="surface-card p-4 sm:p-5 space-y-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-[#EFF6FF] dark:bg-[#172554] text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
              <CreditCard className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <h2 className="font-display text-sm sm:text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  Քարտեր և մնացորդներ
                </h2>
                {cards.length > 0 && (
                  <span className="text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                    · Ընդհանուր՝{' '}
                    <strong className="font-mono text-[#0F172A] dark:text-[#F8FAFC]">
                      {formatMoney(totalCardsBalance, currency)}
                    </strong>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                Մուտք և ելք ձեռքով · առանց բանկային կապի
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenNewModal('card')}
              className="min-h-[34px] px-3 py-1 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-[#F8FAFC] dark:bg-[#111A2E] text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Քարտ</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('finance')}
              className="min-h-[34px] px-2.5 rounded-lg text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#172554]/50 inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>Կառավարել</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {cardStats.length === 0 ? (
          <EmptyStatePlaceholder
            compact
            icon={CreditCard}
            title="Քարտեր դեռ ավելացված չեն"
            description="Ավելացրեք ձեր բանկային քարտը կամ կանխիկ դրամապանակը՝ մուտք ու ելքը հետևելու համար։"
            actionLabel="+ Ավելացնել քարտ"
            onAction={() => onOpenNewModal('card')}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {cardStats.slice(0, 4).map(({ card, currentBalance }) => {
              const style =
                CARD_SURFACE_CLASSES[card.color] ?? CARD_SURFACE_CLASSES.blue;
              const typeMeta =
                CARD_TYPE_META[card.cardType] ?? CARD_TYPE_META.other;
              return (
                <div
                  key={card.id}
                  className="rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC]/80 dark:bg-[#0B1120] p-3.5 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${style.softBg} ${style.softText}`}
                      >
                        {card.cardType === 'cash' ? (
                          <Banknote className="w-4 h-4" />
                        ) : card.cardType === 'other' ? (
                          <Wallet className="w-4 h-4" />
                        ) : (
                          <CreditCard className="w-4 h-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                          {card.name}
                        </p>
                        <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate tabular-nums">
                          {typeMeta.shortLabel}
                          {card.last4 ? ` · •••• ${card.last4}` : ''}
                          {card.isDefault ? ' · Հիմնական' : ''}
                        </p>
                      </div>
                    </div>
                  </div>

                  <p
                    className={`text-lg font-mono font-bold tabular-nums truncate ${
                      currentBalance >= 0
                        ? 'text-[#0F172A] dark:text-[#F8FAFC]'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {formatMoney(currentBalance, currency)}
                  </p>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onQuickCardTransaction('income', card.id)}
                      className="flex-1 min-h-[32px] px-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      <ArrowDownLeft className="w-3 h-3" />
                      <span>Մուտք</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onQuickCardTransaction('expense', card.id)}
                      className="flex-1 min-h-[32px] px-2 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      <ArrowUpRight className="w-3 h-3" />
                      <span>Ելք</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
            <div className="p-5">
              <EmptyStatePlaceholder
                compact
                icon={Receipt}
                title="Գրանցված գործարքներ չկան"
                description="Ավելացրեք եկամուտ կամ ծախս՝ շարժը վերահսկելու համար։"
                actionLabel="+ Ավելացնել գործարք"
                onAction={() => onOpenNewModal('transaction')}
              />
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
                        {(() => {
                          const linkedCard = tx.cardId
                            ? cardsById.get(tx.cardId)
                            : undefined;
                          const cardPart = linkedCard
                            ? ` · ${formatCardLabel(linkedCard)}`
                            : '';
                          return tx.type === 'income'
                            ? `${INCOME_KIND_LABELS[getTransactionIncomeKind(tx)]} · ${tx.category}${cardPart} · ${formatShortDate(tx.date)}`
                            : `${tx.category}${cardPart} · ${formatShortDate(tx.date)}${tx.isPending ? ' · Չհանված' : ''}`;
                        })()}
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
            <EmptyStatePlaceholder
              compact
              icon={PiggyBank}
              title="Տվյալներ դեռ չկան"
              description="Ծախսեր ավելացնելուց հետո այստեղ կտեսնեք բյուջեի վիճակը։"
              actionLabel="Կարգավորել բյուջեն"
              onAction={() => onNavigate('finance')}
            />
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
            <div className="p-5">
              <EmptyStatePlaceholder
                compact
                icon={NotebookPen}
                title="Պահպանված նշումներ դեռ չկան"
                description="Գրի առեք կարևոր մտքերն ու հիշեցումները մեկ տեղում։"
                actionLabel="Գրել առաջին նշումը"
                onAction={() => onOpenNewModal('note')}
              />
            </div>
          ) : (
            <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
              {highlightedNotes.map((note) => {
                const checklistItems = note.checklist ?? [];
                const checklistDone = checklistItems.filter((c) => c.done).length;
                return (
                  <div key={note.id} className="px-5 py-4 space-y-1.5">
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
                    {note.content && (
                      <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#94A3B8] line-clamp-2 whitespace-pre-line">
                        {note.content}
                      </p>
                    )}
                    {checklistItems.length > 0 && (
                      <div className="space-y-1 pt-0.5">
                        <div className="flex items-center justify-between text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                          <span>Ստուգացանկ</span>
                          <span className="font-mono font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                            {checklistDone}/{checklistItems.length}
                          </span>
                        </div>
                        <div className="h-1 w-full rounded-full bg-[#E2E8F0] dark:bg-[#1E293B] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{
                              width: `${Math.round((checklistDone / checklistItems.length) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                    {note.reminderDate && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 tabular-nums pt-0.5">
                        Հիշեցում · {formatReminderLabel(note.reminderDate)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Row 3: Savings Goals & Debts Summary Strip */}
      <section
        aria-label="Խնայողության նպատակներ և պարտքեր"
        className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6"
      >
        <div className="surface-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <PiggyBank className="w-4 h-4" />
              </span>
              <h3 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Խնայողության նպատակներ
              </h3>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenNewModal('goal')}
                className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] hover:text-[#2563EB] dark:hover:text-[#60A5FA] cursor-pointer"
              >
                + Նպատակ
              </button>
              <button
                type="button"
                onClick={openGoalsAndDebtsPage}
                className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
              >
                Բոլորը
              </button>
            </div>
          </div>

          {savingsGoals.length === 0 ? (
            <EmptyStatePlaceholder
              compact
              icon={PiggyBank}
              title="Գանձանակներ դեռ չկան"
              description="Սահմանեք նպատակ և հետևեք խնայողության աճին։"
              actionLabel="+ Ավելացնել նպատակ"
              onAction={() => onOpenNewModal('goal')}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between text-xs tabular-nums">
                <span className="text-[#64748B] dark:text-[#94A3B8]">
                  {activeGoals.length} ընթացիկ նպատակ
                </span>
                <span className="font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  {formatMoney(totalSavedGoals, currency)} /{' '}
                  {formatMoney(totalTargetGoals, currency)}
                </span>
              </div>
              <div className="space-y-2.5">
                {savingsGoals.slice(0, 2).map((g) => {
                  const pct =
                    g.targetAmount > 0
                      ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100))
                      : 0;
                  return (
                    <div key={g.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                          {g.title}
                        </span>
                        <span className="font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8] shrink-0">
                          {pct}% · {formatMoney(g.currentAmount, currency)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#E2E8F0] dark:bg-[#1E293B] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pct >= 100 ? 'bg-emerald-500' : 'bg-[#2563EB] dark:bg-[#3B82F6]'
                          }`}
                          style={{ width: `${Math.max(pct, 3)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="surface-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-[#2563EB]/10 dark:bg-[#3B82F6]/15 text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center">
                <HandCoins className="w-4 h-4" />
              </span>
              <h3 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Պարտքեր և փոխառություններ
              </h3>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenNewModal('debt')}
                className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] hover:text-[#2563EB] dark:hover:text-[#60A5FA] cursor-pointer"
              >
                + Պարտք
              </button>
              <button
                type="button"
                onClick={openGoalsAndDebtsPage}
                className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
              >
                Կառավարել
              </button>
            </div>
          </div>

          {activeDebts.length === 0 ? (
            <EmptyStatePlaceholder
              compact
              icon={HandCoins}
              title="Ակտիվ պարտքեր չկան"
              description="Գրանցեք տված կամ վերցված փոխառությունները՝ ժամկետները չմոռանալու համար։"
              actionLabel="+ Գրանցել պարտք"
              onAction={() => onOpenNewModal('debt')}
            />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs tabular-nums">
                <div className="p-2.5 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
                  <span className="text-[#64748B] dark:text-[#94A3B8] block">
                    Ինձ պարտք են
                  </span>
                  <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    +{formatMoney(activeLentTotal, currency)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-500/8 border border-rose-500/20">
                  <span className="text-[#64748B] dark:text-[#94A3B8] block">
                    Ես պարտք եմ
                  </span>
                  <span className="font-mono text-sm font-bold text-rose-600 dark:text-rose-400">
                    -{formatMoney(activeBorrowedTotal, currency)}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
                {activeDebts.slice(0, 2).map((d) => {
                  const remaining = Math.max(0, d.totalAmount - d.paidAmount);
                  return (
                    <div
                      key={d.id}
                      className="py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                          {d.person}
                        </p>
                        <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                          {d.direction === 'lent' ? 'Տրված է' : 'Վերցված է'}
                          {d.dueDate ? ` · ${formatShortDate(d.dueDate)}` : ''}
                        </p>
                      </div>
                      <span
                        className={`font-mono font-semibold tabular-nums shrink-0 ${
                          d.direction === 'lent'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {formatMoney(remaining, currency)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
