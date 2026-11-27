import { memo, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
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
  Repeat,
  Target,
  Timer,
  X,
  Zap,
} from 'lucide-react';
import {
  MetricStrip,
  MonthCycleNav,
  PageHeader,
  PageShell,
  SectionCard,
} from './layout/PagePrimitives';
import { EmptyStatePlaceholder } from './ui/Skeleton';
import { QuickModalMode } from './QuickAddModal';
import { FinancePageTab } from './finance/financeShared';
import {
  BankCard,
  BudgetLimit,
  DebtItem,
  FocusGoal,
  Habit,
  NavSection,
  Note,
  PlannerPageTab,
  PrimaryIncomeConfig,
  RecurringBill,
  SavingsGoal,
  Task,
  Transaction,
} from '../types';
import { SmartDailyBriefCard } from './SmartDailyBriefCard';
import { SmartWidgetsHub } from './SmartWidgetsHub';
import {
  SmartInsightTarget,
  generateSmartDailyInsights,
} from '../utils/smartInsights';
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
  INTERNAL_TRANSFER_CATEGORY,
  FxRatesToAmd,
  formatCardLabel,
  formatCardMoney,
  getTotalCardsBalanceAMD,
  getTotalCardsInitialBalanceAMD,
} from '../utils/cardBalances';
import { NetWorthAndRunwaySummary } from '../utils/netWorthAndRunway';

interface OverviewViewProps {
  selectedMonth: string;
  onShiftMonth: (delta: number) => void;
  primaryIncome: PrimaryIncomeConfig;
  transactions: Transaction[];
  cards: BankCard[];
  fxRates?: FxRatesToAmd | null;
  netWorthSummary?: NetWorthAndRunwaySummary;
  tasks: Task[];
  notes: Note[];
  budgets: BudgetLimit[];
  recurringBills?: RecurringBill[];
  habits: Habit[];
  focusGoal: FocusGoal | null;
  safeToSpend: SafeToSpendMetrics;
  savingsGoals: SavingsGoal[];
  debts: DebtItem[];
  onSaveFocusGoal: (title: string) => void;
  onToggleFocusGoal: () => void;
  onClearFocusGoal: () => void;
  onToggleTask: (id: string) => void;
  onToggleHabitDate: (habitId: string, date: string) => void;
  onNavigate: (tab: NavSection) => void;
  onNavigateFinance: (page: FinancePageTab) => void;
  onNavigatePlanner: (page: PlannerPageTab) => void;
  onOpenNewModal: (initialMode: QuickModalMode) => void;
  onOpenAssistant?: (prompt?: string) => void;
  onConfirmPreExpense?: (txId: string) => void;
  onAddTransaction?: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  onOpenTransactionWithPrefill?: (
    prefill: Partial<Omit<Transaction, 'id' | 'createdAt'>>
  ) => void;
}

interface SparkNode {
  x: number;
  y: number;
  balance: number;
  label: string;
  date: string;
}

export const OverviewView = memo(function OverviewView({
  selectedMonth,
  onShiftMonth,
  primaryIncome,
  transactions,
  cards,
  fxRates,
  netWorthSummary,
  tasks,
  notes,
  budgets,
  recurringBills = [],
  habits,
  focusGoal,
  safeToSpend,
  savingsGoals,
  debts,
  onSaveFocusGoal,
  onToggleFocusGoal,
  onClearFocusGoal,
  onToggleTask,
  onToggleHabitDate,
  onNavigate,
  onNavigateFinance,
  onNavigatePlanner,
  onOpenNewModal,
  onOpenAssistant,
  onConfirmPreExpense,
  onAddTransaction,
  onOpenTransactionWithPrefill,
}: OverviewViewProps) {
  const currency = 'AMD' as const;
  const [focusInput, setFocusInput] = useState('');
  const [isEditingFocus, setIsEditingFocus] = useState(false);
  const [hoveredSparkIndex, setHoveredSparkIndex] = useState<number | null>(null);
  const todayISO = getTodayISO();

  const effectivePayday = getEffectivePayday(primaryIncome);

  const cycleMetrics = useMemo(
    () => getCycleDayMetrics(selectedMonth, effectivePayday, todayISO),
    [selectedMonth, effectivePayday, todayISO]
  );

  const cardsInitialBalance = useMemo(
    () => getTotalCardsInitialBalanceAMD(cards, fxRates),
    [cards, fxRates]
  );
  const defaultCardId = useMemo(
    () => cards.find((c) => c.isDefault)?.id ?? cards[0]?.id,
    [cards]
  );

  const {
    cycleTransactions: monthTransactions,
    openingBalance,
    cycleIncome: totalIncome,
    cycleExpense: totalExpense,
    cycleNet,
    cycleEndBalance: balance,
  } = useMemo(
    () =>
      computeCycleFinancials(
        transactions,
        selectedMonth,
        effectivePayday,
        todayISO,
        cardsInitialBalance
      ),
    [transactions, selectedMonth, effectivePayday, todayISO, cardsInitialBalance]
  );

  const cardsById = useMemo(
    () => new Map(cards.map((c) => [c.id, c])),
    [cards]
  );
  const totalCardsBalance = useMemo(
    () => getTotalCardsBalanceAMD(cards, transactions, fxRates),
    [cards, transactions, fxRates]
  );

  const savingsRate =
    totalIncome > 0
      ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100)
      : null;

  // Interactive cumulative real balance points starting from prior carryover
  const { sparkNodes, sparkPoints, sparkArea } = useMemo(() => {
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

    const nodes: SparkNode[] = rawNodes.map((node, idx) => {
      const x =
        rawNodes.length <= 1 ? 320 : (idx / (rawNodes.length - 1)) * 320;
      const y = 74 - ((node.balance - minSpark) / sparkRange) * 60;
      return { ...node, x, y };
    });

    const points = nodes
      .map((n) => `${n.x.toFixed(1)},${n.y.toFixed(1)}`)
      .join(' ');
    return {
      sparkNodes: nodes,
      sparkPoints: points,
      sparkArea: `0,84 ${points} 320,84`,
    };
  }, [monthTransactions, openingBalance, cycleMetrics.startDate]);

  const activeSparkNode =
    hoveredSparkIndex !== null ? sparkNodes[hoveredSparkIndex] : null;

  const recentTransactions = useMemo(
    () =>
      [...monthTransactions]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5),
    [monthTransactions]
  );

  const topCategories = useMemo(() => {
    const byCat = monthTransactions
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
    return Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [monthTransactions]);

  const { overviewTaskPool, completedTasksCount, visibleTasks } = useMemo(() => {
    const dueOrOverdueTasks = tasks.filter(
      (t) =>
        isTaskDueOnDate(t, todayISO) ||
        (!isTaskRepeating(t) && !t.completed && t.date < todayISO)
    );
    const pool = dueOrOverdueTasks.length > 0 ? dueOrOverdueTasks : tasks;
    const completed = pool.filter((t) =>
      isTaskCompletedOnDate(t, todayISO)
    ).length;
    const visible = [...pool]
      .sort(
        (a, b) =>
          Number(isTaskCompletedOnDate(a, todayISO)) -
          Number(isTaskCompletedOnDate(b, todayISO))
      )
      .slice(0, 5);
    return {
      overviewTaskPool: pool,
      completedTasksCount: completed,
      visibleTasks: visible,
    };
  }, [tasks, todayISO]);

  const highlightedNotes = useMemo(
    () =>
      [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned)).slice(0, 2),
    [notes]
  );

  const habitsDoneToday = useMemo(
    () => habits.filter((h) => h.completedDates.includes(todayISO)).length,
    [habits, todayISO]
  );

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

  const {
    activeGoals,
    totalSavedGoals,
    totalTargetGoals,
    activeDebts,
    activeLentTotal,
    activeBorrowedTotal,
  } = useMemo(() => {
    const activeG = savingsGoals.filter((g) => g.currentAmount < g.targetAmount);
    const saved = savingsGoals.reduce((s, g) => s + g.currentAmount, 0);
    const target = savingsGoals.reduce((s, g) => s + g.targetAmount, 0);
    const activeD = debts.filter((d) => !d.settled);
    let lent = 0;
    let borrowed = 0;
    for (const d of activeD) {
      const rem = Math.max(0, d.totalAmount - d.paidAmount);
      if (d.direction === 'lent') lent += rem;
      else borrowed += rem;
    }
    return {
      activeGoals: activeG,
      totalSavedGoals: saved,
      totalTargetGoals: target,
      activeDebts: activeD,
      activeLentTotal: lent,
      activeBorrowedTotal: borrowed,
    };
  }, [savingsGoals, debts]);

  const reservedTotal = safeToSpend.reservedBills + safeToSpend.reservedPending;
  const liquidCash = balance;
  const fallbackNetWorth =
    liquidCash +
    totalSavedGoals +
    activeLentTotal -
    activeBorrowedTotal -
    reservedTotal;
  const netWorth = netWorthSummary ? netWorthSummary.netWorth : fallbackNetWorth;
  const avgDailyExpense =
    cycleMetrics.elapsedDays > 0 && totalExpense > 0
      ? totalExpense / cycleMetrics.elapsedDays
      : 0;
  const fallbackRunwayDays =
    liquidCash > 0 && avgDailyExpense > 0
      ? Math.round(liquidCash / avgDailyExpense)
      : null;
  const runwayDays = netWorthSummary
    ? netWorthSummary.hasBurnData
      ? netWorthSummary.runwayDays
      : null
    : fallbackRunwayDays;

  const frequentExpensePresets = useMemo(() => {
    const groups = new Map<
      string,
      {
        title: string;
        category: string;
        amount: number;
        cardId?: string;
        count: number;
        latestDate: string;
      }
    >();
    for (const tx of transactions) {
      if (
        tx.type !== 'expense' ||
        tx.isPending ||
        tx.category === INTERNAL_TRANSFER_CATEGORY
      ) {
        continue;
      }
      const key = `${tx.title.trim().toLowerCase()}|${tx.category}`;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          title: tx.title.trim(),
          category: tx.category,
          amount: tx.amount,
          cardId: tx.cardId,
          count: 1,
          latestDate: tx.date,
        });
      } else {
        existing.count += 1;
        if (tx.date >= existing.latestDate) {
          existing.latestDate = tx.date;
          existing.amount = tx.amount;
          existing.cardId = tx.cardId;
        }
      }
    }
    return Array.from(groups.values())
      .filter((g) => g.count >= 1 && g.title.length > 0 && g.amount > 0)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.latestDate.localeCompare(a.latestDate);
      })
      .slice(0, 4);
  }, [transactions]);

  const smartInsights = useMemo(
    () =>
      generateSmartDailyInsights({
        selectedMonth,
        effectivePayday,
        todayISO,
        transactions,
        budgets,
        recurringBills,
        savingsGoals,
        debts,
        tasks,
        habits,
        safeToSpend,
      }),
    [
      selectedMonth,
      effectivePayday,
      todayISO,
      transactions,
      budgets,
      recurringBills,
      savingsGoals,
      debts,
      tasks,
      habits,
      safeToSpend,
    ]
  );

  const handleInsightTarget = (target: SmartInsightTarget) => {
    if (target.kind === 'finance') {
      onNavigateFinance(target.page);
    } else if (target.kind === 'planner') {
      onNavigatePlanner(target.page);
    } else {
      onOpenAssistant?.(target.prompt);
    }
  };

  const cycleLabel = formatCycleLabel(selectedMonth, effectivePayday);

  return (
    <PageShell>
      <PageHeader
        title="Ընդհանուր ամփոփում"
        subtitle={`${cycleLabel} · Ֆինանսական և օրվա համառոտ պատկեր`}
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
              onClick={() => onOpenNewModal('transaction')}
              className="min-h-[38px] px-3.5 py-2 rounded-xl btn-primary text-xs sm:text-sm inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Նոր գրառում</span>
            </button>
          </>
        }
      />

      <MetricStrip
        items={[
          {
            id: 'balance',
            label: 'Իրական բալանս',
            value: formatMoney(balance, currency),
            hint:
              cards.length > 0
                ? `Քարտեր՝ ${formatMoney(totalCardsBalance, currency)}`
                : `${cycleMetrics.elapsedDays}/${cycleMetrics.totalDays} օր`,
            tone: balance >= 0 ? 'default' : 'negative',
            sensitive: true,
            action: {
              label: 'Մատյան →',
              onClick: () => onNavigateFinance('ledger'),
            },
          },
          {
            id: 'safe-to-spend',
            label: 'Օրական անվտանգ բյուջե',
            value: formatMoney(safeToSpend.dailyAllowance, currency),
            hint: `Այսօր մնաց՝ ${safeToSpend.remainingTodayAllowance >= 0 ? '+' : ''}${formatMoney(
              safeToSpend.remainingTodayAllowance,
              currency
            )}`,
            tone: safeToSpend.remainingTodayAllowance >= 0 ? 'accent' : 'negative',
            sensitive: true,
            action: {
              label: 'Բյուջե →',
              onClick: () => onNavigateFinance('budgets'),
            },
          },
          {
            id: 'cycle-flow',
            label: 'Ցիկլի եկամուտ / ծախս',
            value: `+${formatMoney(totalIncome, currency)}`,
            hint: `Ծախս՝ -${formatMoney(totalExpense, currency)} · ${
              savingsRate === null
                ? 'Առանց եկամտի'
                : savingsRate >= 0
                  ? `Խնայող. ${savingsRate}%`
                  : `Գերծախս ${Math.abs(savingsRate)}%`
            }`,
            tone: cycleNet >= 0 ? 'positive' : 'negative',
            sensitive: true,
          },
          {
            id: 'net-worth',
            label: 'Զուտ կապիտալ',
            value: formatMoney(netWorth, currency),
            hint: `Գանձանակ՝ +${formatMoney(totalSavedGoals, currency)}`,
            tone: netWorth >= 0 ? 'default' : 'negative',
            sensitive: true,
            action: {
              label: 'Նպատակներ →',
              onClick: () => onNavigateFinance('goals'),
            },
          },
        ]}
      />

      {/* Row 1: Cashflow Curve + Quick Presets | Today's Agenda + Focus Goal + Habits */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <SectionCard
          title="Հաշվեկշռի շարժ և արագ ծախսեր"
          subtitle={
            activeSparkNode ? (
              <span>
                {formatShortDate(activeSparkNode.date)} · {activeSparkNode.label} (
                <span className="pa-sensitive font-mono tabular-nums">
                  {formatMoney(activeSparkNode.balance, currency)}
                </span>
                )
              </span>
            ) : (
              `${cycleLabel} · ${cycleMetrics.elapsedDays}/${cycleMetrics.totalDays} օր անցել է`
            )
          }
          headerRight={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigateFinance('cards')}
                className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-[#1E293B] text-xs font-medium text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB] dark:hover:border-[#3B82F6] inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Քարտեր ({cards.length})</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateFinance('ledger')}
                className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
              >
                <span>Մատյան</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          }
          className="lg:col-span-7 flex flex-col justify-between"
          bodyClassName="flex-1 flex flex-col justify-between gap-4"
        >
          <div className="space-y-4">
            {sparkNodes.length > 1 ? (
              <div
                className="w-full relative"
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
                      <stop offset="0%" stopColor="#2563EB" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <line x1="0" y1="18" x2="320" y2="18" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 4" />
                  <line x1="0" y1="46" x2="320" y2="46" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 4" />
                  <line x1="0" y1="74" x2="320" y2="74" stroke="currentColor" strokeOpacity="0.08" />
                  <polygon points={sparkArea} fill="url(#cobaltFlow)" />
                  <polyline
                    points={sparkPoints}
                    fill="none"
                    stroke="#2563EB"
                    strokeWidth="2.1"
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
                        stroke="#2563EB"
                        strokeOpacity="0.4"
                        strokeDasharray="2 2"
                      />
                      <circle
                        cx={activeSparkNode.x}
                        cy={activeSparkNode.y}
                        r="4.2"
                        fill="#2563EB"
                        stroke="#FFFFFF"
                        strokeWidth="1.75"
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
            ) : (
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] py-4">
                Գծապատկերը կհայտնվի ցիկլում առնվազն մեկ գործարք գրանցելուց հետո։
              </p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[#E2E8F0] dark:border-[#1E293B] text-xs tabular-nums">
              <div className="min-w-0">
                <span className="block text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Սկզբնական մնացորդ
                </span>
                <span className="pa-sensitive font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate block mt-0.5">
                  {openingBalance > 0 ? '+' : ''}
                  {formatMoney(openingBalance, currency)}
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Ցիկլի զուտ փոփոխ.
                </span>
                <span
                  className={`pa-sensitive font-mono font-semibold truncate block mt-0.5 ${
                    cycleNet >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {cycleNet > 0 ? '+' : ''}
                  {formatMoney(cycleNet, currency)}
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Ամրագրված պահուստ
                </span>
                <span className="pa-sensitive font-mono font-semibold text-amber-600 dark:text-amber-400 truncate block mt-0.5">
                  {formatMoney(reservedTotal, currency)}
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Ֆինանս. պահուստ
                </span>
                <span className="font-mono font-semibold text-[#2563EB] dark:text-[#60A5FA] truncate block mt-0.5">
                  {runwayDays !== null
                    ? runwayDays >= 60
                      ? `~${Math.round(runwayDays / 30)} ամիս`
                      : `${runwayDays} օր`
                    : '—'}
                </span>
              </div>
            </div>
          </div>

          {frequentExpensePresets.length > 0 && onAddTransaction && (
            <div className="pt-4 border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  <Zap className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                  <span>1-հպումով կրկնվող ծախսեր</span>
                </span>
                <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Պատմությունից
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {frequentExpensePresets.map((preset) => (
                  <div
                    key={`${preset.title}-${preset.category}`}
                    className="flex items-center justify-between gap-1 rounded-xl border border-[#E2E8F0]/90 dark:border-[#1B2538] bg-[#F8FAFC]/80 dark:bg-[#0A101D] hover:border-[#2563EB]/45 dark:hover:border-[#3B82F6]/45 transition-colors px-2.5 py-2 min-w-0"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onAddTransaction({
                          type: 'expense',
                          title: preset.title,
                          category: preset.category,
                          amount: preset.amount,
                          date: todayISO,
                          cardId: preset.cardId ?? defaultCardId,
                        })
                      }
                      title={`Գրանցել ${preset.title} (-${formatMoney(preset.amount, currency)})`}
                      className="flex-1 min-w-0 text-left cursor-pointer group"
                    >
                      <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate group-hover:text-[#2563EB] dark:group-hover:text-[#60A5FA] transition-colors">
                        {preset.title}
                      </p>
                      <p className="pa-sensitive text-[11px] font-mono tabular-nums text-rose-600 dark:text-rose-400">
                        -{formatMoney(preset.amount, currency)}
                      </p>
                    </button>
                    {onOpenTransactionWithPrefill && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenTransactionWithPrefill({
                            type: 'expense',
                            title: preset.title,
                            category: preset.category,
                            amount: preset.amount,
                            date: todayISO,
                            cardId: preset.cardId ?? defaultCardId,
                          })
                        }
                        aria-label={`Փոխել գումարը՝ ${preset.title}`}
                        title="Փոխել գումարը նախքան գրանցելը"
                        className="min-h-[28px] min-w-[28px] rounded-lg flex items-center justify-center text-[#94A3B8] hover:text-[#2563EB] dark:hover:text-[#60A5FA] hover:bg-white dark:hover:bg-[#1E293B] transition-colors cursor-pointer shrink-0"
                      >
                        <Repeat className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Օրվա ռիթմ"
          subtitle={`${completedTasksCount}/${overviewTaskPool.length} անելիք · ${habitsDoneToday}/${habits.length} սովորություն`}
          headerRight={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpenNewModal('task')}
                className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-[#1E293B] text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#2563EB] dark:hover:border-[#3B82F6] inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Անելիք</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigatePlanner('focus')}
                className="min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#172554]/50 inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Timer className="w-3.5 h-3.5" />
                <span>Ֆոկուս</span>
              </button>
            </div>
          }
          className="lg:col-span-5 flex flex-col justify-between"
          noPadding
        >
          <div>
            {/* Compact Inline Focus Goal Strip */}
            <div className="px-4 sm:px-6 py-3.5 border-b border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC]/70 dark:bg-[#0B1120]/60">
              {!focusGoal || isEditingFocus ? (
                <form
                  onSubmit={handleFocusSubmit}
                  className="flex items-center gap-2"
                >
                  <Target className="w-4 h-4 text-[#2563EB] dark:text-[#60A5FA] shrink-0" />
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
                    placeholder="Օրվա գլխավոր ֆոկուս նպատակը..."
                    aria-label="Օրվա ֆոկուս նպատակ"
                    className="flex-1 min-w-0 min-h-[34px] px-2.5 py-1 text-xs sm:text-sm rounded-lg input-field"
                  />
                  <button
                    type="submit"
                    className="min-h-[34px] px-3 rounded-lg btn-primary text-xs font-semibold shrink-0"
                  >
                    {isEditingFocus ? 'Պահել' : 'Սահմանել'}
                  </button>
                  {isEditingFocus && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingFocus(false);
                        setFocusInput('');
                      }}
                      aria-label="Չեղարկել"
                      className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </form>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={onToggleFocusGoal}
                    aria-pressed={focusGoal.completed}
                    className="flex-1 min-w-0 flex items-center gap-2.5 text-left cursor-pointer"
                  >
                    <span
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                        focusGoal.completed
                          ? 'bg-emerald-600 border-emerald-600 dark:bg-emerald-500 dark:border-emerald-500 text-white dark:text-[#060B16]'
                          : 'border-[#CBD5E1] dark:border-[#334155]'
                      }`}
                    >
                      {focusGoal.completed && (
                        <Check className="w-3 h-3" strokeWidth={2.7} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8] block">
                        Օրվա ֆոկուս ·{' '}
                        <span
                          className={
                            focusGoal.completed
                              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                              : 'text-[#2563EB] dark:text-[#60A5FA] font-semibold'
                          }
                        >
                          {focusGoal.completed ? 'Կատարված է' : 'Ընթացքում'}
                        </span>
                      </span>
                      <p
                        className={`text-xs sm:text-sm font-semibold truncate ${
                          focusGoal.completed
                            ? 'line-through text-[#94A3B8] dark:text-[#64748B]'
                            : 'text-[#0F172A] dark:text-[#F8FAFC]'
                        }`}
                      >
                        {focusGoal.title}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={startEditFocus}
                      aria-label="Խմբագրել ֆոկուսը"
                      className="min-h-[30px] min-w-[30px] flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={onClearFocusGoal}
                      aria-label="Հեռացնել ֆոկուսը"
                      className="min-h-[30px] min-w-[30px] flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {visibleTasks.length === 0 ? (
              <div className="p-5">
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
                      className="w-full min-h-[44px] px-4 sm:px-6 py-2.5 flex items-center gap-3 text-left hover:bg-[#F8FAFC] dark:hover:bg-[#162033] transition-colors cursor-pointer"
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
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm truncate ${
                            doneToday
                              ? 'line-through text-[#94A3B8] dark:text-[#64748B]'
                              : 'text-[#0F172A] dark:text-[#F8FAFC] font-medium'
                          }`}
                        >
                          {task.title}
                        </p>
                        {(repeating || task.dueTime) && (
                          <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                            {repeating ? getTaskScheduleLabel(task) : ''}
                            {repeating && task.dueTime ? ' · ' : ''}
                            {task.dueTime ? (
                              <span className="font-mono">{task.dueTime}</span>
                            ) : null}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {habits.length > 0 && (
            <div className="px-4 sm:px-6 py-3.5 border-t border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC]/70 dark:bg-[#0B1120]/60">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                  Այսօրվա սովորությունները
                </p>
                <button
                  type="button"
                  onClick={() => onNavigatePlanner('habits')}
                  className="text-[11px] font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
                >
                  7-օրյա մատրից →
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {habits.map((h) => {
                  const done = h.completedDates.includes(todayISO);
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => onToggleHabitDate(h.id, todayISO)}
                      className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
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
        </SectionCard>
      </div>

      {/* Smart Daily Insights Brief */}
      <SmartDailyBriefCard
        insights={smartInsights}
        onRunTarget={handleInsightTarget}
        onOpenAssistant={(prompt) => onOpenAssistant?.(prompt)}
      />

      {/* Integrated Smart Widgets Hub */}
      <SmartWidgetsHub
        currency={currency}
        selectedMonth={selectedMonth}
        cycleLabel={cycleLabel}
        transactions={monthTransactions}
        tasks={tasks}
        habits={habits}
        focusGoal={focusGoal}
        safeToSpend={safeToSpend}
        netWorth={netWorth}
        totalIncome={totalIncome}
        totalExpense={totalExpense}
        onOpenAssistant={(prompt) => onOpenAssistant?.(prompt)}
        onNavigateFinance={onNavigateFinance}
        onNavigatePlanner={onNavigatePlanner}
      />

      {/* Row 2: Recent Transactions | Budget Health | Notes, Goals & Debts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
        <SectionCard
          title="Վերջին գործարքները"
          headerRight={
            <button
              type="button"
              onClick={() => onNavigateFinance('ledger')}
              className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
            >
              Բոլորը →
            </button>
          }
          noPadding
        >
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
              {recentTransactions.map((tx) => {
                const linkedCard = tx.cardId ? cardsById.get(tx.cardId) : undefined;
                const cardPart = linkedCard ? ` · ${formatCardLabel(linkedCard)}` : '';
                return (
                  <div
                    key={tx.id}
                    className="px-5 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                          tx.isPending
                            ? 'border-amber-500/25 bg-amber-500/[0.07] text-amber-600 dark:text-amber-400'
                            : tx.type === 'income'
                              ? 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-600 dark:text-emerald-400'
                              : 'border-[#E2E8F0] dark:border-[#1B2538] bg-[#F8FAFC] dark:bg-[#11192B] text-[#475569] dark:text-[#94A3B8]'
                        }`}
                        aria-hidden="true"
                      >
                        {tx.isPending ? (
                          <Clock className="w-3.5 h-3.5" />
                        ) : tx.type === 'income' ? (
                          <ArrowDownLeft className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                          {tx.title}
                        </p>
                        <p className="text-xs text-[#64748B] dark:text-[#94A3B8] truncate tabular-nums">
                          {tx.type === 'income'
                            ? `${INCOME_KIND_LABELS[getTransactionIncomeKind(tx)]} · ${tx.category}${cardPart} · ${formatShortDate(tx.date)}`
                            : `${tx.category}${cardPart} · ${formatShortDate(tx.date)}`}
                          {tx.tags && tx.tags.length > 0 && (
                            <span className="text-[#2563EB] dark:text-[#60A5FA] font-mono">
                              {' '}
                              · {tx.tags.map((tag) => `#${tag}`).join(' ')}
                            </span>
                          )}
                          {tx.isPending && (
                            <span className="text-amber-600 dark:text-amber-400 font-medium">
                              {' '}
                              · Նախածախս
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <span
                          className={`pa-sensitive block text-xs sm:text-sm font-semibold font-mono tabular-nums whitespace-nowrap ${
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
                        {tx.cardAmount !== undefined &&
                          tx.cardCurrency &&
                          tx.cardCurrency !== 'AMD' && (
                            <span className="pa-sensitive block text-[10px] font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8]">
                              {tx.type === 'income' ? '+' : '-'}
                              {formatCardMoney(tx.cardAmount, tx.cardCurrency)}
                            </span>
                          )}
                      </div>
                      {tx.isPending && onConfirmPreExpense && (
                        <button
                          type="button"
                          onClick={() => onConfirmPreExpense(tx.id)}
                          className="px-2 py-1 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 cursor-pointer"
                          title="Հաստատել և հանել բալանսից"
                        >
                          Հաստատել
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Բյուջեի վերահսկում"
          headerRight={
            <button
              type="button"
              onClick={() => onNavigateFinance('budgets')}
              className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
            >
              Կարգավորել →
            </button>
          }
        >
          {topCategories.length === 0 ? (
            <EmptyStatePlaceholder
              compact
              icon={PiggyBank}
              title="Տվյալներ դեռ չկան"
              description="Ծախսեր ավելացնելուց հետո այստեղ կտեսնեք բյուջեի վիճակը։"
              actionLabel="Կարգավորել բյուջեն"
              onAction={() => onNavigateFinance('budgets')}
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
                const barWidth = amount > 0 ? Math.min(100, Math.max(pct, 4)) : 0;
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
                      <span className="pa-sensitive font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8] text-xs">
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
                      <p className="pa-sensitive text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
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
        </SectionCard>

        <SectionCard
          title="Նշումներ, նպատակներ և պարտքեր"
          headerRight={
            <button
              type="button"
              onClick={() => onNavigate('notes')}
              className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
            >
              Նշումներ →
            </button>
          }
          className="md:col-span-2 lg:col-span-1"
          noPadding
        >
          <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
            {highlightedNotes.length === 0 ? (
              <div className="px-5 py-4 flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-2 text-[#64748B] dark:text-[#94A3B8]">
                  <NotebookPen className="w-4 h-4" />
                  <span>Նշումներ դեռ չկան</span>
                </span>
                <button
                  type="button"
                  onClick={() => onOpenNewModal('note')}
                  className="font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
                >
                  + Նոր նշում
                </button>
              </div>
            ) : (
              highlightedNotes.map((note) => (
                <div key={note.id} className="px-5 py-3.5 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-display text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                      {note.title}
                    </h3>
                    {note.pinned && (
                      <span className="text-[11px] font-semibold text-[#2563EB] dark:text-[#60A5FA] shrink-0">
                        Ամրացված
                      </span>
                    )}
                  </div>
                  {note.content && (
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8] line-clamp-2 whitespace-pre-line">
                      {note.content}
                    </p>
                  )}
                  {note.reminderDate && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 tabular-nums">
                      Հիշեցում · {formatReminderLabel(note.reminderDate)}
                    </p>
                  )}
                </div>
              ))
            )}

            <button
              type="button"
              onClick={() => onNavigateFinance('goals')}
              className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[#F8FAFC] dark:hover:bg-[#162033] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-lg border border-[#E2E8F0] dark:border-[#233049] bg-[#F8FAFC] dark:bg-[#11192B] text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <PiggyBank className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                    Խնայողության նպատակներ ({activeGoals.length})
                  </p>
                  <p className="pa-sensitive text-[11px] font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8] truncate">
                    {formatMoney(totalSavedGoals, currency)} /{' '}
                    {formatMoney(totalTargetGoals, currency)}
                  </p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-[#94A3B8] shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => onNavigateFinance('debts')}
              className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[#F8FAFC] dark:hover:bg-[#162033] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-lg border border-[#E2E8F0] dark:border-[#233049] bg-[#F8FAFC] dark:bg-[#11192B] text-[#1D4ED8] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
                  <HandCoins className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                    Պարտքեր ({activeDebts.length} ակտիվ)
                  </p>
                  <p className="pa-sensitive text-[11px] font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8] truncate">
                    Ինձ՝ +{formatMoney(activeLentTotal, currency)} · Ես՝ -
                    {formatMoney(activeBorrowedTotal, currency)}
                  </p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-[#94A3B8] shrink-0" />
            </button>
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
});
