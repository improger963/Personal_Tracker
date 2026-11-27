import { getLastNMonthsKeys } from '../data/defaults';
import {
  BankCard,
  DebtItem,
  RecurringBill,
  SavingsGoal,
  Transaction,
} from '../types';
import {
  FxRatesToAmd,
  INTERNAL_TRANSFER_CATEGORY,
  getTotalCardsInitialBalanceAMD,
} from './cardBalances';
import {
  computeCycleFinancials,
  daysBetweenISO,
  getCycleBounds,
  getCycleShortLabel,
} from './financialCycle';
import { getMonthlyBillCycleStatus } from './recurringBills';

export type RunwayTier = 'critical' | 'caution' | 'healthy' | 'strong';

export interface NetWorthHistoryPoint {
  monthKey: string;
  label: string;
  netWorth: number;
  cashBalance: number;
  savingsTotal: number;
  netDebt: number;
}

export interface NetWorthAndRunwaySummary {
  liquidCashAMD: number;
  savingsGoalsTotal: number;
  lentPendingTotal: number;
  borrowedPendingTotal: number;
  unpaidBillsAMD: number;
  netWorth: number;
  avgDailyBurn: number;
  hasBurnData: boolean;
  runwayDays: number;
  runwayMonths: number;
  runwayTier: RunwayTier;
  history: NetWorthHistoryPoint[];
}

function addDaysISO(baseISO: string, deltaDays: number): string {
  const [y, m, d] = baseISO.split('-').map(Number);
  const utc = new Date(Date.UTC(y || 2026, (m || 1) - 1, (d || 1) + deltaDays));
  const uy = utc.getUTCFullYear();
  const um = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const ud = String(utc.getUTCDate()).padStart(2, '0');
  return `${uy}-${um}-${ud}`;
}

export function computeNetWorthAndRunway(params: {
  cards: BankCard[];
  transactions: Transaction[];
  savingsGoals: SavingsGoal[];
  debts: DebtItem[];
  recurringBills: RecurringBill[];
  fxRates?: FxRatesToAmd | null;
  selectedMonth: string;
  effectivePayday: number;
  todayISO: string;
}): NetWorthAndRunwaySummary {
  const {
    cards,
    transactions,
    savingsGoals,
    debts,
    recurringBills,
    fxRates,
    selectedMonth,
    effectivePayday,
    todayISO,
  } = params;

  const initialAMD = getTotalCardsInitialBalanceAMD(cards, fxRates);
  const currentCycleFin = computeCycleFinancials(
    transactions,
    selectedMonth,
    effectivePayday,
    todayISO,
    initialAMD
  );

  const liquidCashAMD = Math.round(currentCycleFin.liveRealBalance);

  const savingsGoalsTotal = Math.round(
    savingsGoals.reduce((sum, g) => sum + Math.max(0, g.currentAmount || 0), 0)
  );

  let lentPendingTotal = 0;
  let borrowedPendingTotal = 0;
  for (const debt of debts) {
    if (debt.settled) continue;
    const remaining = Math.max(0, (debt.totalAmount || 0) - (debt.paidAmount || 0));
    if (remaining <= 0) continue;
    if (debt.direction === 'lent') {
      lentPendingTotal += remaining;
    } else {
      borrowedPendingTotal += remaining;
    }
  }
  lentPendingTotal = Math.round(lentPendingTotal);
  borrowedPendingTotal = Math.round(borrowedPendingTotal);

  const unpaidBillsAMD = Math.round(
    recurringBills
      .filter(
        (b) =>
          b.active !== false &&
          (b.frequency ?? 'monthly') === 'monthly' &&
          getMonthlyBillCycleStatus(
            b,
            selectedMonth,
            currentCycleFin.cycleTransactions
          ) === 'unpaid'
      )
      .reduce((sum, b) => sum + Math.max(0, b.amount || 0), 0)
  );

  const netWorth = Math.round(
    liquidCashAMD + savingsGoalsTotal + lentPendingTotal - borrowedPendingTotal
  );

  // Average daily burn over last 60 days of confirmed expenses
  const windowStartISO = addDaysISO(todayISO, -59);
  const burnExpenses = transactions.filter(
    (t) =>
      t.type === 'expense' &&
      !t.isPending &&
      t.category !== INTERNAL_TRANSFER_CATEGORY &&
      t.date >= windowStartISO &&
      t.date <= todayISO
  );

  let avgDailyBurn = 0;
  if (burnExpenses.length > 0) {
    let earliestDate = burnExpenses[0].date;
    let totalBurn = 0;
    for (const tx of burnExpenses) {
      totalBurn += Math.max(0, tx.amount || 0);
      if (tx.date < earliestDate) earliestDate = tx.date;
    }
    const rawSpan = Math.max(1, daysBetweenISO(earliestDate, todayISO) + 1);
    const divisorDays = Math.min(60, Math.max(14, rawSpan));
    avgDailyBurn = Math.round(totalBurn / divisorDays);
  }

  const hasBurnData = avgDailyBurn > 0;
  const accessibleReserve = Math.max(0, liquidCashAMD + savingsGoalsTotal);

  const runwayDays =
    accessibleReserve <= 0
      ? 0
      : hasBurnData
        ? Math.max(0, Math.round(accessibleReserve / avgDailyBurn))
        : 365;

  const runwayMonths = Math.round((runwayDays / 30) * 10) / 10;

  let runwayTier: RunwayTier = 'critical';
  if (runwayDays >= 180) {
    runwayTier = 'strong';
  } else if (runwayDays >= 90) {
    runwayTier = 'healthy';
  } else if (runwayDays >= 30) {
    runwayTier = 'caution';
  }

  // 6-cycle Net Worth progression
  const monthKeys = getLastNMonthsKeys(selectedMonth, 6);
  const history: NetWorthHistoryPoint[] = monthKeys.map((monthKey) => {
    const bounds = getCycleBounds(monthKey, effectivePayday);
    const fin = computeCycleFinancials(
      transactions,
      monthKey,
      effectivePayday,
      todayISO,
      initialAMD
    );
    const cashBalance = Math.round(fin.cycleEndBalance);

    const savingsAtCycle = Math.round(
      savingsGoals
        .filter((g) => !g.createdAt || g.createdAt.slice(0, 10) <= bounds.endDate)
        .reduce((sum, g) => sum + Math.max(0, g.currentAmount || 0), 0)
    );

    let netDebtAtCycle = 0;
    for (const d of debts) {
      if (d.settled) continue;
      if (d.createdAt && d.createdAt.slice(0, 10) > bounds.endDate) continue;
      const rem = Math.max(0, (d.totalAmount || 0) - (d.paidAmount || 0));
      netDebtAtCycle += d.direction === 'lent' ? rem : -rem;
    }
    netDebtAtCycle = Math.round(netDebtAtCycle);

    return {
      monthKey,
      label: getCycleShortLabel(monthKey, effectivePayday),
      netWorth: Math.round(cashBalance + savingsAtCycle + netDebtAtCycle),
      cashBalance,
      savingsTotal: savingsAtCycle,
      netDebt: netDebtAtCycle,
    };
  });

  return {
    liquidCashAMD,
    savingsGoalsTotal,
    lentPendingTotal,
    borrowedPendingTotal,
    unpaidBillsAMD,
    netWorth,
    avgDailyBurn,
    hasBurnData,
    runwayDays,
    runwayMonths,
    runwayTier,
    history,
  };
}
