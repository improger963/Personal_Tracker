import { BudgetLimit, Transaction } from '../types';
import { INTERNAL_TRANSFER_CATEGORY } from './cardBalances';
import { getCycleDayMetrics, getCycleKeyForDate } from './financialCycle';

export type BudgetForecastStatus =
  | 'exceeded'
  | 'projected_exceed'
  | 'near_limit'
  | 'on_track';

export interface CategoryBudgetForecast {
  category: string;
  limit: number;
  spentSoFar: number;
  confirmedToDate: number;
  futureConfirmed: number;
  pendingAmount: number;
  dailyPace: number;
  projectedEndSpent: number;
  projectedOverage: number;
  currentPct: number;
  projectedPct: number;
  recommendedDailyAllowance: number;
  status: BudgetForecastStatus;
}

export interface BudgetForecastSummary {
  cycleKey: string;
  elapsedDays: number;
  totalDays: number;
  remainingDays: number;
  hasBudgets: boolean;
  totalLimit: number;
  totalSpent: number;
  totalProjected: number;
  totalProjectedOverage: number;
  overallProjectedPct: number;
  willExceedOverall: boolean;
  hasWarning: boolean;
  overallStatus: 'exceeded' | 'warning' | 'caution' | 'on_track';
  categories: CategoryBudgetForecast[];
  exceededCategories: CategoryBudgetForecast[];
  atRiskCategories: CategoryBudgetForecast[];
  nearLimitCategories: CategoryBudgetForecast[];
}

const STATUS_PRIORITY: Record<BudgetForecastStatus, number> = {
  exceeded: 0,
  projected_exceed: 1,
  near_limit: 2,
  on_track: 3,
};

/**
 * Predicts whether each category budget and total budget will be exceeded
 * by the end of the current billing cycle based on current spending pace,
 * future-dated confirmed expenses, and pending pre-expenses within the cycle.
 */
export function computeBudgetForecast(params: {
  budgets: BudgetLimit[];
  transactions: Transaction[];
  effectivePayday: number;
  todayISO: string;
  cycleKey?: string;
}): BudgetForecastSummary {
  const { budgets, transactions, effectivePayday, todayISO } = params;
  const activeCycleKey =
    params.cycleKey ?? getCycleKeyForDate(todayISO, effectivePayday);
  const metrics = getCycleDayMetrics(activeCycleKey, effectivePayday, todayISO);

  const activeBudgets = budgets.filter((b) => b.limit > 0);
  if (activeBudgets.length === 0) {
    return {
      cycleKey: activeCycleKey,
      elapsedDays: metrics.elapsedDays,
      totalDays: metrics.totalDays,
      remainingDays: metrics.remainingDays,
      hasBudgets: false,
      totalLimit: 0,
      totalSpent: 0,
      totalProjected: 0,
      totalProjectedOverage: 0,
      overallProjectedPct: 0,
      willExceedOverall: false,
      hasWarning: false,
      overallStatus: 'on_track',
      categories: [],
      exceededCategories: [],
      atRiskCategories: [],
      nearLimitCategories: [],
    };
  }

  const byCategory = new Map<
    string,
    { confirmedToDate: number; futureConfirmed: number; pendingAmount: number }
  >();

  for (const tx of transactions) {
    if (
      tx.type !== 'expense' ||
      tx.category === INTERNAL_TRANSFER_CATEGORY ||
      tx.date < metrics.startDate ||
      tx.date > metrics.endDate
    ) {
      continue;
    }

    const entry = byCategory.get(tx.category) ?? {
      confirmedToDate: 0,
      futureConfirmed: 0,
      pendingAmount: 0,
    };

    if (tx.isPending) {
      entry.pendingAmount += tx.amount;
    } else if (metrics.isCurrentCycle && tx.date > todayISO) {
      entry.futureConfirmed += tx.amount;
    } else {
      entry.confirmedToDate += tx.amount;
    }

    byCategory.set(tx.category, entry);
  }

  const paceElapsedDays = Math.max(1, metrics.elapsedDays);
  const remainingInclusive = metrics.isCurrentCycle
    ? Math.max(1, metrics.remainingDays + 1)
    : Math.max(1, metrics.totalDays);

  const categories: CategoryBudgetForecast[] = activeBudgets.map((b) => {
    const stats = byCategory.get(b.category) ?? {
      confirmedToDate: 0,
      futureConfirmed: 0,
      pendingAmount: 0,
    };
    const spentSoFar = stats.confirmedToDate + stats.futureConfirmed;
    const dailyPace =
      metrics.elapsedDays > 0 && stats.confirmedToDate > 0
        ? stats.confirmedToDate / paceElapsedDays
        : 0;

    const projectedEndSpent = metrics.isPastCycle
      ? spentSoFar
      : metrics.isFutureCycle
        ? Math.round(spentSoFar + stats.pendingAmount)
        : Math.round(
            dailyPace * metrics.totalDays +
              stats.futureConfirmed +
              stats.pendingAmount
          );

    const projectedOverage = Math.max(0, projectedEndSpent - b.limit);
    const currentPct = Math.round((spentSoFar / b.limit) * 100);
    const projectedPct = Math.round((projectedEndSpent / b.limit) * 100);
    const recommendedDailyAllowance = Math.max(
      0,
      Math.floor((b.limit - spentSoFar) / remainingInclusive)
    );

    let status: BudgetForecastStatus = 'on_track';
    if (spentSoFar > b.limit) {
      status = 'exceeded';
    } else if (!metrics.isPastCycle && projectedEndSpent > b.limit) {
      status = 'projected_exceed';
    } else if (
      spentSoFar >= 0.8 * b.limit ||
      (!metrics.isPastCycle && projectedEndSpent >= 0.85 * b.limit)
    ) {
      status = 'near_limit';
    }

    return {
      category: b.category,
      limit: b.limit,
      spentSoFar,
      confirmedToDate: stats.confirmedToDate,
      futureConfirmed: stats.futureConfirmed,
      pendingAmount: stats.pendingAmount,
      dailyPace,
      projectedEndSpent,
      projectedOverage,
      currentPct,
      projectedPct,
      recommendedDailyAllowance,
      status,
    };
  });

  categories.sort((a, b) => {
    const pDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (pDiff !== 0) return pDiff;
    return b.projectedPct - a.projectedPct;
  });

  const exceededCategories = categories.filter((c) => c.status === 'exceeded');
  const atRiskCategories = categories.filter(
    (c) => c.status === 'projected_exceed'
  );
  const nearLimitCategories = categories.filter(
    (c) => c.status === 'near_limit'
  );

  const totalLimit = categories.reduce((s, c) => s + c.limit, 0);
  const totalSpent = categories.reduce((s, c) => s + c.spentSoFar, 0);
  const totalProjected = categories.reduce((s, c) => s + c.projectedEndSpent, 0);
  const totalProjectedOverage = Math.max(0, totalProjected - totalLimit);
  const overallProjectedPct =
    totalLimit > 0 ? Math.round((totalProjected / totalLimit) * 100) : 0;
  const willExceedOverall =
    !metrics.isPastCycle && totalLimit > 0 && totalProjected > totalLimit;

  const hasWarning =
    exceededCategories.length > 0 ||
    atRiskCategories.length > 0 ||
    willExceedOverall;

  const overallStatus =
    exceededCategories.length > 0 || totalSpent > totalLimit
      ? 'exceeded'
      : atRiskCategories.length > 0 || willExceedOverall
        ? 'warning'
        : nearLimitCategories.length > 0
          ? 'caution'
          : 'on_track';

  return {
    cycleKey: activeCycleKey,
    elapsedDays: metrics.elapsedDays,
    totalDays: metrics.totalDays,
    remainingDays: metrics.remainingDays,
    hasBudgets: true,
    totalLimit,
    totalSpent,
    totalProjected,
    totalProjectedOverage,
    overallProjectedPct,
    willExceedOverall,
    hasWarning,
    overallStatus,
    categories,
    exceededCategories,
    atRiskCategories,
    nearLimitCategories,
  };
}
