import {
  BudgetLimit,
  DebtItem,
  Habit,
  RecurringBill,
  SavingsGoal,
  Task,
  Transaction,
} from '../types';
import { formatMoney } from '../data/defaults';
import { INTERNAL_TRANSFER_CATEGORY } from './cardBalances';
import { computeBudgetForecast } from './budgetForecast';
import {
  SafeToSpendMetrics,
  daysBetweenISO,
  getCycleKeyForDate,
  getDateInCycleForDay,
  isDateInCycle,
  shiftMonthKey,
} from './financialCycle';
import { getBillFrequency } from './notifications';
import {
  isTaskCompletedOnDate,
  isTaskDueOnDate,
  isTaskOverdue,
  isTaskRepeating,
} from './taskSchedule';

export type SmartInsightSeverity = 'alert' | 'warning' | 'positive' | 'info';

export type SmartInsightTarget =
  | { kind: 'finance'; page: 'ledger' | 'budgets' | 'bills' | 'goals' | 'debts' | 'analytics' }
  | { kind: 'planner'; page: 'tasks' | 'habits' | 'focus' }
  | { kind: 'assistant'; prompt: string };

export interface SmartInsightItem {
  id: string;
  severity: SmartInsightSeverity;
  title: string;
  description: string;
  actionLabel: string;
  target: SmartInsightTarget;
}

export function generateSmartDailyInsights(params: {
  selectedMonth: string;
  effectivePayday: number;
  todayISO: string;
  transactions: Transaction[];
  budgets: BudgetLimit[];
  recurringBills: RecurringBill[];
  savingsGoals: SavingsGoal[];
  debts: DebtItem[];
  tasks: Task[];
  habits: Habit[];
  safeToSpend: SafeToSpendMetrics;
}): SmartInsightItem[] {
  const {
    selectedMonth,
    effectivePayday,
    todayISO,
    transactions,
    budgets,
    recurringBills,
    savingsGoals,
    tasks,
    habits,
    safeToSpend,
  } = params;

  const insights: SmartInsightItem[] = [];

  // 1. Budget Forecast & Pace Alert
  const forecast = computeBudgetForecast({
    budgets,
    transactions,
    effectivePayday,
    todayISO,
    cycleKey: selectedMonth,
  });

  if (forecast.hasBudgets && forecast.exceededCategories.length > 0) {
    const top = forecast.exceededCategories[0];
    insights.push({
      id: 'insight-budget-exceeded',
      severity: 'alert',
      title: `«${top.category}» բյուջեն գերազանցված է`,
      description: `Արդեն ծախսվել է ${formatMoney(top.spentSoFar)} / ${formatMoney(top.limit)} (+${formatMoney(top.spentSoFar - top.limit)})։`,
      actionLabel: 'Ստուգել բյուջեն',
      target: { kind: 'finance', page: 'budgets' },
    });
  } else if (forecast.hasBudgets && forecast.atRiskCategories.length > 0) {
    const top = forecast.atRiskCategories[0];
    insights.push({
      id: 'insight-budget-risk',
      severity: 'warning',
      title: `«${top.category}» բյուջեի գերծախսի ռիսկ`,
      description: `Ընթացիկ տեմպով ցիկլի ավարտին ծախսը կհասնի ${formatMoney(top.projectedEndSpent)}։ Օրական ապահով սահմանը՝ ${formatMoney(top.recommendedDailyAllowance)}։`,
      actionLabel: 'Բյուջեի կանխատեսում',
      target: { kind: 'finance', page: 'budgets' },
    });
  }

  // 2. Category Spending Spike vs Previous Cycle
  const prevCycleKey = shiftMonthKey(selectedMonth, -1);
  const currentByCat = new Map<string, number>();
  const prevByCat = new Map<string, number>();

  for (const tx of transactions) {
    if (
      tx.type !== 'expense' ||
      tx.isPending ||
      tx.category === INTERNAL_TRANSFER_CATEGORY
    ) {
      continue;
    }
    if (isDateInCycle(tx.date, selectedMonth, effectivePayday)) {
      currentByCat.set(tx.category, (currentByCat.get(tx.category) ?? 0) + tx.amount);
    } else if (isDateInCycle(tx.date, prevCycleKey, effectivePayday)) {
      prevByCat.set(tx.category, (prevByCat.get(tx.category) ?? 0) + tx.amount);
    }
  }

  let topSpike: { category: string; current: number; prev: number; pct: number } | null = null;
  for (const [cat, curr] of currentByCat.entries()) {
    const prev = prevByCat.get(cat) ?? 0;
    if (prev >= 5000 && curr > prev * 1.3 && curr - prev >= 5000) {
      const pct = Math.round(((curr - prev) / prev) * 100);
      if (!topSpike || pct > topSpike.pct) {
        topSpike = { category: cat, current: curr, prev, pct };
      }
    }
  }

  if (topSpike) {
    insights.push({
      id: 'insight-category-spike',
      severity: 'warning',
      title: `«${topSpike.category}» ծախսերը աճել են +${topSpike.pct}%-ով`,
      description: `Այս ցիկլում՝ ${formatMoney(topSpike.current)}՝ նախորդ ցիկլի ${formatMoney(topSpike.prev)}-ի դիմաց։`,
      actionLabel: 'Վերլուծել',
      target: { kind: 'finance', page: 'analytics' },
    });
  }

  // 3. Overdue or High-Priority Tasks Today
  const overdueTasks = tasks.filter((t) => isTaskOverdue(t, todayISO));
  const todayHighTasks = tasks.filter(
    (t) =>
      isTaskDueOnDate(t, todayISO) &&
      !isTaskCompletedOnDate(t, todayISO) &&
      t.priority === 'high'
  );

  if (overdueTasks.length > 0) {
    insights.push({
      id: 'insight-overdue-tasks',
      severity: 'alert',
      title: `${overdueTasks.length} ժամկետանց անելիք ուշադրություն է պահանջում`,
      description: `Առաջնային՝ «${overdueTasks[0].title}»։ Ավարտեք կամ վերապլանավորեք այսօրվա գրաֆիկում։`,
      actionLabel: 'Բացել օրակարգը',
      target: { kind: 'planner', page: 'tasks' },
    });
  } else if (todayHighTasks.length > 0) {
    insights.push({
      id: 'insight-high-priority-focus',
      severity: 'info',
      title: `Այսօր ունեք ${todayHighTasks.length} կարևոր առաջադրանք`,
      description: `Սկսեք «${todayHighTasks[0].title}» գործից և միացրեք 25-րոպեանոց ֆոկուս թայմեր։`,
      actionLabel: 'Միացնել ֆոկուս',
      target: { kind: 'planner', page: 'focus' },
    });
  }

  // 4. Unpaid Monthly Bills Due Within 4 Days (using live cycle & next cycle across month boundaries)
  const liveCycleKey = getCycleKeyForDate(todayISO, effectivePayday);
  const candidateCycles = [liveCycleKey, shiftMonthKey(liveCycleKey, 1)];
  const dueSoonBills = recurringBills.filter((bill) => {
    if (bill.active === false || getBillFrequency(bill) !== 'monthly') return false;
    return candidateCycles.some((cycleKey) => {
      const slotKey = `monthly:${cycleKey}`;
      if (
        bill.confirmedSlots?.includes(slotKey) ||
        bill.skippedSlots?.includes(slotKey)
      ) {
        return false;
      }
      const dueDate = getDateInCycleForDay(
        cycleKey,
        effectivePayday,
        bill.dayOfMonth
      );
      const diff = daysBetweenISO(todayISO, dueDate);
      if (diff < 0 || diff > 4) return false;
      const paidThisCycle = transactions.some(
        (tx) =>
          tx.type === 'expense' &&
          isDateInCycle(tx.date, cycleKey, effectivePayday) &&
          tx.title.toLowerCase() === bill.title.toLowerCase()
      );
      return !paidThisCycle;
    });
  });

  if (dueSoonBills.length > 0) {
    const billsSum = dueSoonBills.reduce((s, b) => s + b.amount, 0);
    insights.push({
      id: 'insight-due-bills',
      severity: 'info',
      title: `Մոտակա 4 օրում սպասվում է ${dueSoonBills.length} վճարում`,
      description: `${dueSoonBills.map((b) => b.title).slice(0, 2).join(', ')} · ընդամենը ${formatMoney(billsSum)}։`,
      actionLabel: 'Տեսնել վճարները',
      target: { kind: 'finance', page: 'bills' },
    });
  }

  // 5. Safe-to-Spend Surplus / Savings Goal Opportunity
  const activeGoal = savingsGoals.find((g) => g.currentAmount < g.targetAmount);
  if (
    insights.length < 4 &&
    activeGoal &&
    safeToSpend.remainingTodayAllowance >= 5000 &&
    safeToSpend.freeFunds > 20000
  ) {
    const suggestedBoost = Math.min(
      Math.round(safeToSpend.remainingTodayAllowance * 0.5 / 500) * 500,
      activeGoal.targetAmount - activeGoal.currentAmount
    );
    if (suggestedBoost >= 1000) {
      insights.push({
        id: 'insight-goal-boost',
        severity: 'positive',
        title: `Խնայողության հնարավորություն՝ «${activeGoal.title}»`,
        description: `Այսօրվա բյուջեից ազատ մնացորդը թույլ է տալիս փոխանցել ${formatMoney(suggestedBoost)} նպատակին։`,
        actionLabel: 'Համալրել նպատակը',
        target: { kind: 'finance', page: 'goals' },
      });
    }
  }

  // 6. Habit Streak Check-in if still plenty of space
  const undoneHabitsToday = habits.filter((h) => !h.completedDates.includes(todayISO));
  if (insights.length < 3 && undoneHabitsToday.length > 0 && tasks.some((t) => !isTaskRepeating(t))) {
    insights.push({
      id: 'insight-habits-reminder',
      severity: 'info',
      title: `Այսօր մնացել է ${undoneHabitsToday.length} սովորություն`,
      description: `Նշեք «${undoneHabitsToday[0].title}»-ը՝ շաբաթական սերիան չընդհատելու համար։`,
      actionLabel: 'Սովորություններ',
      target: { kind: 'planner', page: 'habits' },
    });
  }

  return insights.slice(0, 4);
}
