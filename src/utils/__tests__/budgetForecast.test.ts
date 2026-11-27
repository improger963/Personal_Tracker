import { describe, expect, it } from 'vitest';
import { computeBudgetForecast } from '../budgetForecast';
import { INTERNAL_TRANSFER_CATEGORY } from '../cardBalances';
import { BudgetLimit, Transaction } from '../../types';

describe('budgetForecast', () => {
  it('classifies exceeded, projected_exceed, near_limit, and on_track budgets accurately', () => {
    const budgets: BudgetLimit[] = [
      { category: 'Սնունդ', limit: 60000 },
      { category: 'Տրանսպորտ', limit: 30000 },
      { category: 'Գնումներ', limit: 50000 },
      { category: 'Ժամանց', limit: 100000 },
    ];

    // Cycle 2026-11 (30 days), today = 2026-11-10 => 10 elapsed days
    const txs: Transaction[] = [
      // Food: 70,000 > 60,000 => exceeded
      {
        id: 'b1',
        type: 'expense',
        amount: 70000,
        title: 'Groceries',
        category: 'Սնունդ',
        date: '2026-11-05',
        createdAt: '2026-11-05T10:00:00Z',
      },
      // Transport: 15,000 in 10 days => pace 1500/day => projected 45,000 > 30,000 => projected_exceed
      {
        id: 'b2',
        type: 'expense',
        amount: 15000,
        title: 'Taxi',
        category: 'Տրանսպորտ',
        date: '2026-11-08',
        createdAt: '2026-11-08T10:00:00Z',
      },
      // Shopping: 15,000 future-dated confirmed => spentSoFar=15k, pace=0, projected=15k => Wait, to hit near_limit (>=80% spent): 42,000 future confirmed
      {
        id: 'b3',
        type: 'expense',
        amount: 42000,
        title: 'Planned jacket',
        category: 'Գնումներ',
        date: '2026-11-25',
        createdAt: '2026-11-10T10:00:00Z',
      },
      // Entertainment: 5,000 spent => pace 500/day => projected 15,000 => on_track
      {
        id: 'b4',
        type: 'expense',
        amount: 5000,
        title: 'Cinema',
        category: 'Ժամանց',
        date: '2026-11-04',
        createdAt: '2026-11-04T10:00:00Z',
      },
      // Internal transfer must be ignored
      {
        id: 'b5',
        type: 'expense',
        amount: 200000,
        title: 'Card Transfer',
        category: INTERNAL_TRANSFER_CATEGORY,
        date: '2026-11-06',
        createdAt: '2026-11-06T10:00:00Z',
      },
    ];

    const summary = computeBudgetForecast({
      budgets,
      transactions: txs,
      effectivePayday: 1,
      todayISO: '2026-11-10',
      cycleKey: '2026-11',
    });

    expect(summary.hasBudgets).toBe(true);
    expect(summary.exceededCategories.map((c) => c.category)).toEqual(['Սնունդ']);
    expect(summary.atRiskCategories.map((c) => c.category)).toEqual(['Տրանսպորտ']);
    expect(summary.nearLimitCategories.map((c) => c.category)).toEqual(['Գնումներ']);
    expect(summary.categories.find((c) => c.category === 'Ժամանց')?.status).toBe('on_track');
    expect(summary.overallStatus).toBe('exceeded');
  });

  it('excludes pending pre-expenses from spentSoFar while factoring them into projectedEndSpent', () => {
    const summary = computeBudgetForecast({
      budgets: [{ category: 'Կոմունալ', limit: 20000 }],
      transactions: [
        {
          id: 'p1',
          type: 'expense',
          amount: 25000,
          title: 'Electricity pending',
          category: 'Կոմունալ',
          date: '2026-11-12',
          isPending: true,
          createdAt: '2026-11-10T10:00:00Z',
        },
      ],
      effectivePayday: 1,
      todayISO: '2026-11-10',
      cycleKey: '2026-11',
    });

    const cat = summary.categories[0];
    expect(cat.spentSoFar).toBe(0);
    expect(cat.pendingAmount).toBe(25000);
    expect(cat.projectedEndSpent).toBe(25000);
    expect(cat.status).toBe('projected_exceed');
  });
});
