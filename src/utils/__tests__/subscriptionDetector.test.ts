import { describe, expect, it } from 'vitest';
import { Transaction } from '../../types';
import {
  areMerchantsSimilar,
  detectRecurringSubscriptions,
  normalizeMerchantName,
} from '../subscriptionDetector';
import { INTERNAL_TRANSFER_CATEGORY } from '../cardBalances';

function makeTx(
  overrides: Partial<Transaction> & { title: string; amount: number; date: string }
): Transaction {
  return {
    id: `tx-${overrides.title}-${overrides.date}`,
    type: 'expense',
    category: 'Ժամանց',
    createdAt: `${overrides.date}T10:00:00.000Z`,
    ...overrides,
  };
}

describe('subscriptionDetector', () => {
  it('normalizes merchant names and identifies similar merchant strings', () => {
    expect(normalizeMerchantName('Netflix #1234')).toBe('netflix');
    expect(areMerchantsSimilar('spotify premium', 'spotify premium monthly')).toBe(true);
    expect(areMerchantsSimilar('apple icloud 50gb', 'apple icloud')).toBe(true);
    expect(areMerchantsSimilar('coffee shop', 'car wash')).toBe(false);
  });

  it('detects known subscription services and multi-month recurring patterns', () => {
    const txs: Transaction[] = [
      makeTx({ title: 'Netflix', amount: 4500, date: '2026-09-12', category: 'Ժամանց' }),
      makeTx({ title: 'Netflix #09', amount: 4500, date: '2026-10-12', category: 'Ժամանց' }),
      makeTx({ title: 'Spotify', amount: 2500, date: '2026-10-05', category: 'Ժամանց' }),
      makeTx({ title: 'Gym Membership', amount: 18000, date: '2026-09-01', category: 'Առողջություն' }),
      makeTx({ title: 'Gym Membership', amount: 18000, date: '2026-10-01', category: 'Առողջություն' }),
      makeTx({ title: 'One-off Coffee', amount: 1800, date: '2026-10-14', category: 'Սնունդ' }),
      makeTx({
        title: 'Cloud Storage Pending',
        amount: 3000,
        date: '2026-10-20',
        isPending: true,
      }),
      makeTx({
        title: 'Card Transfer',
        amount: 20000,
        date: '2026-09-15',
        category: INTERNAL_TRANSFER_CATEGORY,
      }),
      makeTx({
        title: 'Card Transfer',
        amount: 20000,
        date: '2026-10-15',
        category: INTERNAL_TRANSFER_CATEGORY,
      }),
    ];

    const detected = detectRecurringSubscriptions(txs);
    const titles = detected.map((d) => d.title.toLowerCase());

    expect(titles.some((t) => t.includes('netflix'))).toBe(true);
    expect(titles.some((t) => t.includes('spotify'))).toBe(true);
    expect(titles.some((t) => t.includes('gym membership'))).toBe(true);
    expect(titles.some((t) => t.includes('coffee'))).toBe(false);
    expect(titles.some((t) => t.includes('pending'))).toBe(false);
    expect(titles.some((t) => t.includes('transfer'))).toBe(false);

    const gym = detected.find((d) => d.title.toLowerCase().includes('gym'));
    expect(gym?.matchReason).toBe('recurring_monthly');
    expect(gym?.distinctMonths).toBe(2);

    const netflix = detected.find((d) => d.title.toLowerCase().includes('netflix'));
    expect(netflix?.matchReason).toBe('both');
    expect(netflix?.count).toBe(2);
  });
});
