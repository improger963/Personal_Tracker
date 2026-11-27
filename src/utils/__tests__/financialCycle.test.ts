import { describe, expect, it } from 'vitest';
import {
  clampPayday,
  computeCycleFinancials,
  computeSafeToSpend,
  getCycleBounds,
  getCycleDayMetrics,
  getCycleKeyForDate,
  getDateInCycleForDay,
} from '../financialCycle';
import { INTERNAL_TRANSFER_CATEGORY } from '../cardBalances';
import { Transaction } from '../../types';

describe('financialCycle', () => {
  it('clamps payday strictly within 1..31', () => {
    expect(clampPayday(-5)).toBe(1);
    expect(clampPayday(0)).toBe(1);
    expect(clampPayday(15.6)).toBe(16);
    expect(clampPayday(45)).toBe(31);
    expect(clampPayday(Number.NaN)).toBe(1);
  });

  it('computes cycle bounds accurately including leap-year February clamping', () => {
    const feb = getCycleBounds('2024-02', 31);
    expect(feb.startDate).toBe('2024-02-29');
    expect(feb.nextStartDate).toBe('2024-03-31');
    expect(feb.endDate).toBe('2024-03-30');

    const calendar = getCycleBounds('2026-11', 1);
    expect(calendar.startDate).toBe('2026-11-01');
    expect(calendar.endDate).toBe('2026-11-30');
    expect(calendar.nextStartDate).toBe('2026-12-01');
  });

  it('maps dates to the correct billing cycle when payday != 1', () => {
    expect(getCycleKeyForDate('2026-11-10', 15)).toBe('2026-10');
    expect(getCycleKeyForDate('2026-11-15', 15)).toBe('2026-11');
    expect(getCycleKeyForDate('2026-11-28', 15)).toBe('2026-11');
    expect(getDateInCycleForDay('2026-11', 15, 5)).toBe('2026-12-05');
    expect(getDateInCycleForDay('2026-11', 15, 20)).toBe('2026-11-20');
  });

  it('computes liveRealBalance excluding pending, future, and internal-transfer rows', () => {
    const txs: Transaction[] = [
      {
        id: 't1',
        type: 'income',
        amount: 200000,
        title: 'Salary',
        category: 'Աշխատավարձ',
        date: '2026-11-05',
        createdAt: '2026-11-05T10:00:00Z',
      },
      {
        id: 't2',
        type: 'expense',
        amount: 20000,
        title: 'Food',
        category: 'Սնունդ',
        date: '2026-11-10',
        createdAt: '2026-11-10T10:00:00Z',
      },
      {
        id: 't3',
        type: 'expense',
        amount: 15000,
        title: 'Pending Rent Part',
        category: 'Բնակարան',
        date: '2026-11-12',
        isPending: true,
        createdAt: '2026-11-12T10:00:00Z',
      },
      {
        id: 't4',
        type: 'expense',
        amount: 50000,
        title: 'Future expense',
        category: 'Գնումներ',
        date: '2026-11-28',
        createdAt: '2026-11-12T10:00:00Z',
      },
      {
        id: 't5',
        type: 'expense',
        amount: 30000,
        title: 'Card Transfer',
        category: INTERNAL_TRANSFER_CATEGORY,
        date: '2026-11-12',
        createdAt: '2026-11-12T10:00:00Z',
      },
    ];

    const fin = computeCycleFinancials(txs, '2026-11', 1, '2026-11-15', 50000);
    // Initial 50,000 + Income 200,000 - Expense 20,000 (pending/future/transfer excluded from liveRealBalance)
    expect(fin.liveRealBalance).toBe(230000);
    // Cycle end includes confirmed future expense inside cycle (20,000 + 50,000)
    expect(fin.cycleExpense).toBe(70000);
    expect(fin.cyclePendingExpense).toBe(15000);
    expect(fin.cycleEndBalance).toBe(180000);
  });

  it('calculates safe-to-spend daily allowance reserving unpaid bills and pending items', () => {
    const metrics = getCycleDayMetrics('2026-11', 1, '2026-11-21');
    // Nov 21..30 => 10 remaining days inclusive
    expect(metrics.remainingDays + 1).toBe(10);

    const txs: Transaction[] = [
      {
        id: 'today-1',
        type: 'expense',
        amount: 3000,
        title: 'Coffee & Lunch',
        category: 'Սնունդ',
        date: '2026-11-21',
        createdAt: '2026-11-21T12:00:00Z',
      },
    ];

    const safe = computeSafeToSpend({
      availableBalance: 150000,
      unpaidBillsTotal: 30000,
      pendingExpensesTotal: 20000,
      cycleMetrics: metrics,
      transactions: txs,
      todayISO: '2026-11-21',
    });

    expect(safe.freeFunds).toBe(100000);
    expect(safe.dailyAllowance).toBe(10000);
    expect(safe.todaySpent).toBe(3000);
    expect(safe.remainingTodayAllowance).toBe(7000);
  });
});
