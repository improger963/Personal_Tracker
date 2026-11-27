import { describe, expect, it } from 'vitest';
import { computeNetWorthAndRunway } from '../netWorthAndRunway';
import { BankCard, DebtItem, RecurringBill, SavingsGoal, Transaction } from '../../types';

describe('netWorthAndRunway', () => {
  it('computes net worth, daily burn, runway days/tier, and 6-cycle history', () => {
    const cards: BankCard[] = [
      {
        id: 'c1',
        name: 'AMD Card',
        last4: '1234',
        cardType: 'arca',
        color: 'blue',
        initialBalance: 100000,
        currency: 'AMD',
        isDefault: true,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    const transactions: Transaction[] = [
      {
        id: 't1',
        type: 'income',
        amount: 300000,
        title: 'Salary',
        category: 'Աշխատավարձ',
        date: '2026-11-05',
        createdAt: '2026-11-05T10:00:00Z',
      },
      {
        id: 't2',
        type: 'expense',
        amount: 60000,
        title: 'Living expenses',
        category: 'Սնունդ',
        date: '2026-11-10',
        createdAt: '2026-11-10T10:00:00Z',
      },
    ];

    const savingsGoals: SavingsGoal[] = [
      {
        id: 'g1',
        title: 'Emergency Fund',
        targetAmount: 500000,
        currentAmount: 160000,
        createdAt: '2026-06-01T00:00:00Z',
      },
    ];

    const debts: DebtItem[] = [
      {
        id: 'd1',
        person: 'Armen',
        direction: 'lent',
        totalAmount: 50000,
        paidAmount: 10000,
        settled: false,
        createdAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'd2',
        person: 'Bank',
        direction: 'borrowed',
        totalAmount: 100000,
        paidAmount: 20000,
        settled: false,
        createdAt: '2026-10-15T00:00:00Z',
      },
    ];

    const recurringBills: RecurringBill[] = [
      {
        id: 'rb1',
        title: 'Internet',
        amount: 12000,
        category: 'Կոմունալ',
        frequency: 'monthly',
        dayOfMonth: 20,
        active: true,
      },
    ];

    const summary = computeNetWorthAndRunway({
      cards,
      transactions,
      savingsGoals,
      debts,
      recurringBills,
      selectedMonth: '2026-11',
      effectivePayday: 1,
      todayISO: '2026-11-20',
    });

    // liquidCash = 100k + 300k - 60k = 340,000
    expect(summary.liquidCashAMD).toBe(340000);
    expect(summary.savingsGoalsTotal).toBe(160000);
    expect(summary.lentPendingTotal).toBe(40000);
    expect(summary.borrowedPendingTotal).toBe(80000);
    expect(summary.unpaidBillsAMD).toBe(12000);
    // netWorth = 340k + 160k + 40k - 80k = 460,000
    expect(summary.netWorth).toBe(460000);

    // Accessible reserve = 340k + 160k = 500,000
    // Burn over 14-day min window for 2026-11-10..2026-11-20 (11 days -> clamped to 14): 60000 / 14 = 4286 AMD/day
    expect(summary.hasBurnData).toBe(true);
    expect(summary.avgDailyBurn).toBe(Math.round(60000 / 14));
    expect(summary.runwayDays).toBe(Math.round(500000 / Math.round(60000 / 14)));
    expect(summary.runwayTier).toBe('healthy');
    expect(summary.history).toHaveLength(6);
  });
});
