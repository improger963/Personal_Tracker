import { PrimaryIncomeConfig, Transaction } from '../types';
import {
  ARMENIAN_MONTHS,
  formatMonthLabel,
  formatShortDate,
} from '../data/defaults';
import { INTERNAL_TRANSFER_CATEGORY } from './cardBalances';

export interface CycleBounds {
  startDate: string;
  endDate: string;
  nextStartDate: string;
}

export interface CycleDayMetrics extends CycleBounds {
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  elapsedPct: number;
  daysUntilNextPayday: number;
  isCurrentCycle: boolean;
  isPastCycle: boolean;
  isFutureCycle: boolean;
}

export interface CycleFinancials {
  cycleTransactions: Transaction[];
  priorTransactions: Transaction[];
  openingBalance: number;
  cycleIncome: number;
  cycleExpense: number;
  cyclePendingExpense: number;
  cycleNet: number;
  cycleEndBalance: number;
  liveRealBalance: number;
}

export function clampPayday(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(31, Math.max(1, Math.round(day)));
}

export function getEffectivePayday(
  primaryIncome?: PrimaryIncomeConfig | null
): number {
  if (!primaryIncome || !primaryIncome.enabled) return 1;
  return clampPayday(primaryIncome.payday);
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const date = new Date(y || 2026, (m || 1) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getDaysInCalendarMonth(
  year: number,
  month1Based: number
): number {
  return new Date(year, month1Based, 0).getDate();
}

function toISODate(year: number, month1Based: number, day: number): string {
  return `${year}-${String(month1Based).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDaysISO(dateISO: string, deltaDays: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const utc = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + deltaDays));
  const uy = utc.getUTCFullYear();
  const um = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const ud = String(utc.getUTCDate()).padStart(2, '0');
  return `${uy}-${um}-${ud}`;
}

export function daysBetweenISO(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split('-').map(Number);
  const [ty, tm, td] = toISO.split('-').map(Number);
  const fromUtc = Date.UTC(fy, (fm || 1) - 1, fd || 1);
  const toUtc = Date.UTC(ty, (tm || 1) - 1, td || 1);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

export function getCycleBounds(cycleKey: string, payday: number): CycleBounds {
  const safePayday = clampPayday(payday);
  const [y, m] = cycleKey.split('-').map(Number);
  const year = y || new Date().getFullYear();
  const month = m || 1;

  const startDay = Math.min(safePayday, getDaysInCalendarMonth(year, month));
  const startDate = toISODate(year, month, startDay);

  const nextKey = shiftMonthKey(cycleKey, 1);
  const [ny, nm] = nextKey.split('-').map(Number);
  const nextStartDay = Math.min(safePayday, getDaysInCalendarMonth(ny, nm));
  const nextStartDate = toISODate(ny, nm, nextStartDay);
  const endDate = addDaysISO(nextStartDate, -1);

  return { startDate, endDate, nextStartDate };
}

export function getCycleKeyForDate(dateISO: string, payday: number): string {
  const safePayday = clampPayday(payday);
  const baseKey = dateISO.slice(0, 7);
  if (safePayday <= 1) return baseKey;
  const { startDate } = getCycleBounds(baseKey, safePayday);
  return dateISO >= startDate ? baseKey : shiftMonthKey(baseKey, -1);
}

export function isDateInCycle(
  dateISO: string,
  cycleKey: string,
  payday: number
): boolean {
  const { startDate, endDate } = getCycleBounds(cycleKey, payday);
  return dateISO >= startDate && dateISO <= endDate;
}

export function getDateInCycleForDay(
  cycleKey: string,
  payday: number,
  dayOfMonth: number
): string {
  const safePayday = clampPayday(payday);
  const clampedTargetDay = Math.min(31, Math.max(1, Math.round(dayOfMonth)));
  const { startDate, endDate } = getCycleBounds(cycleKey, safePayday);

  if (safePayday <= 1) {
    const [y, m] = cycleKey.split('-').map(Number);
    const maxDay = getDaysInCalendarMonth(y, m);
    return toISODate(y, m, Math.min(clampedTargetDay, maxDay));
  }

  const [sy, sm] = startDate.split('-').map(Number);
  const candidateStartMonth = toISODate(
    sy,
    sm,
    Math.min(clampedTargetDay, getDaysInCalendarMonth(sy, sm))
  );
  if (candidateStartMonth >= startDate && candidateStartMonth <= endDate) {
    return candidateStartMonth;
  }

  const [ey, em] = endDate.split('-').map(Number);
  const candidateEndMonth = toISODate(
    ey,
    em,
    Math.min(clampedTargetDay, getDaysInCalendarMonth(ey, em))
  );
  if (candidateEndMonth >= startDate && candidateEndMonth <= endDate) {
    return candidateEndMonth;
  }

  return startDate;
}

export function getCycleDayMetrics(
  cycleKey: string,
  payday: number,
  todayISO: string
): CycleDayMetrics {
  const bounds = getCycleBounds(cycleKey, payday);
  const totalDays = Math.max(1, daysBetweenISO(bounds.startDate, bounds.endDate) + 1);
  const isCurrentCycle =
    todayISO >= bounds.startDate && todayISO <= bounds.endDate;
  const isPastCycle = todayISO > bounds.endDate;
  const isFutureCycle = todayISO < bounds.startDate;

  const elapsedDays = isPastCycle
    ? totalDays
    : isFutureCycle
      ? 0
      : Math.min(totalDays, Math.max(1, daysBetweenISO(bounds.startDate, todayISO) + 1));

  const remainingDays = Math.max(0, totalDays - elapsedDays);
  const elapsedPct = Math.round((elapsedDays / totalDays) * 100);
  const daysUntilNextPayday = isCurrentCycle
    ? Math.max(0, daysBetweenISO(todayISO, bounds.nextStartDate))
    : 0;

  return {
    ...bounds,
    totalDays,
    elapsedDays,
    remainingDays,
    elapsedPct,
    daysUntilNextPayday,
    isCurrentCycle,
    isPastCycle,
    isFutureCycle,
  };
}

export function formatCycleLabel(cycleKey: string, payday: number): string {
  const safePayday = clampPayday(payday);
  if (safePayday <= 1) {
    return formatMonthLabel(cycleKey);
  }
  const { startDate, endDate } = getCycleBounds(cycleKey, safePayday);
  const startYear = startDate.slice(0, 4);
  const endYear = endDate.slice(0, 4);
  if (startYear !== endYear) {
    return `${formatShortDate(startDate)} ${startYear} – ${formatShortDate(endDate)} ${endYear}`;
  }
  return `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`;
}

export function getCycleShortLabel(cycleKey: string, payday: number): string {
  const safePayday = clampPayday(payday);
  const [, m] = cycleKey.split('-').map(Number);
  const monthShort = ARMENIAN_MONTHS[(m ?? 1) - 1]?.slice(0, 3) ?? cycleKey;
  if (safePayday <= 1) {
    return monthShort;
  }
  const { startDate } = getCycleBounds(cycleKey, safePayday);
  const startDay = Number(startDate.slice(8, 10));
  return `${startDay} ${monthShort}`;
}

export function computeCycleFinancials(
  transactions: Transaction[],
  cycleKey: string,
  payday: number,
  todayISO: string
): CycleFinancials {
  const { startDate, endDate } = getCycleBounds(cycleKey, payday);
  const cycleTransactions = transactions.filter(
    (t) => t.date >= startDate && t.date <= endDate
  );
  const priorTransactions = transactions.filter((t) => t.date < startDate);

  const openingBalance = priorTransactions
    .filter((t) => t.category !== INTERNAL_TRANSFER_CATEGORY)
    .reduce(
      (sum, t) =>
        sum + (t.type === 'income' ? t.amount : t.isPending ? 0 : -t.amount),
      0
    );
  const cycleIncome = cycleTransactions
    .filter((t) => t.type === 'income' && t.category !== INTERNAL_TRANSFER_CATEGORY)
    .reduce((sum, t) => sum + t.amount, 0);
  const cycleExpense = cycleTransactions
    .filter(
      (t) =>
        t.type === 'expense' &&
        !t.isPending &&
        t.category !== INTERNAL_TRANSFER_CATEGORY
    )
    .reduce((sum, t) => sum + t.amount, 0);
  const cyclePendingExpense = cycleTransactions
    .filter(
      (t) =>
        t.type === 'expense' &&
        t.isPending &&
        t.category !== INTERNAL_TRANSFER_CATEGORY
    )
    .reduce((sum, t) => sum + t.amount, 0);
  const cycleNet = cycleIncome - cycleExpense;
  const cycleEndBalance = openingBalance + cycleNet;

  const liveRealBalance = transactions
    .filter(
      (t) => t.date <= todayISO && t.category !== INTERNAL_TRANSFER_CATEGORY
    )
    .reduce(
      (sum, t) =>
        sum + (t.type === 'income' ? t.amount : t.isPending ? 0 : -t.amount),
      0
    );

  return {
    cycleTransactions,
    priorTransactions,
    openingBalance,
    cycleIncome,
    cycleExpense,
    cyclePendingExpense,
    cycleNet,
    cycleEndBalance,
    liveRealBalance,
  };
}

export interface SafeToSpendMetrics {
  availableBalance: number;
  reservedBills: number;
  reservedPending: number;
  freeFunds: number;
  remainingDaysInclusive: number;
  dailyAllowance: number;
  todaySpent: number;
  remainingTodayAllowance: number;
}

export function computeSafeToSpend(params: {
  availableBalance: number;
  unpaidBillsTotal: number;
  pendingExpensesTotal: number;
  cycleMetrics: CycleDayMetrics;
  transactions: Transaction[];
  todayISO: string;
}): SafeToSpendMetrics {
  const {
    availableBalance,
    unpaidBillsTotal,
    pendingExpensesTotal,
    cycleMetrics,
    transactions,
    todayISO,
  } = params;

  const reservedBills = cycleMetrics.isPastCycle ? 0 : Math.max(0, unpaidBillsTotal);
  const reservedPending = cycleMetrics.isPastCycle ? 0 : Math.max(0, pendingExpensesTotal);
  const freeFunds = availableBalance - reservedBills - reservedPending;

  const remainingDaysInclusive = cycleMetrics.isCurrentCycle
    ? Math.max(1, cycleMetrics.remainingDays + 1)
    : Math.max(1, cycleMetrics.totalDays);

  const dailyAllowance = Math.max(0, Math.floor(freeFunds / remainingDaysInclusive));

  const todaySpent = transactions
    .filter(
      (t) =>
        t.type === 'expense' &&
        !t.isPending &&
        t.category !== INTERNAL_TRANSFER_CATEGORY &&
        t.date === todayISO
    )
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    availableBalance,
    reservedBills,
    reservedPending,
    freeFunds,
    remainingDaysInclusive,
    dailyAllowance,
    todaySpent,
    remainingTodayAllowance: dailyAllowance - todaySpent,
  };
}
