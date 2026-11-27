import { describe, expect, it } from 'vitest';
import { sanitizeBackupPayload } from '../backupValidation';

describe('backupValidation', () => {
  it('sanitizes valid backup payloads including customCategories, multi-currency cards, tags, and linked task metadata', () => {
    const raw = {
      cards: [
        {
          id: 'c1',
          name: 'USD Visa',
          last4: '4321ab',
          cardType: 'visa',
          color: 'blue',
          initialBalance: 125.456,
          currency: 'USD',
          isDefault: true,
        },
      ],
      transactions: [
        {
          id: 'tx1',
          type: 'expense',
          amount: 19500,
          cardAmount: 50.123,
          cardCurrency: 'USD',
          title: 'Flight seat',
          category: 'Տրանսպորտ',
          tags: ['#travel', 'work trip', '#travel'],
          date: '2026-11-15',
        },
        // Invalid transaction (zero amount) should be skipped
        {
          id: 'tx-bad',
          type: 'expense',
          amount: 0,
          title: 'Invalid',
          category: 'Այլ',
          date: '2026-11-15',
        },
      ],
      tasks: [
        {
          id: 'task1',
          title: 'Pay dentist',
          priority: 'high',
          date: '2026-11-20',
          expectedAmount: 25000,
          expectedCategory: 'Առողջություն',
          linkedTxId: 'tx-pending-1',
        },
      ],
      customCategories: [
        { id: 'cat1', name: 'Մարզասրահ', type: 'expense', color: '#10B981' },
        { id: 'cat2', name: 'մարզասրահ', type: 'expense', color: '#F59E0B' }, // duplicate
      ],
    };

    const res = sanitizeBackupPayload(raw);
    expect(res).not.toBeNull();
    expect(res!.cards).toHaveLength(1);
    expect(res!.cards![0].initialBalance).toBe(125.46);
    expect(res!.cards![0].currency).toBe('USD');
    expect(res!.cards![0].last4).toBe('4321');

    expect(res!.transactions).toHaveLength(1);
    expect(res!.transactions![0].cardAmount).toBe(50.12);
    expect(res!.transactions![0].cardCurrency).toBe('USD');
    expect(res!.transactions![0].tags).toEqual(['travel', 'work_trip']);

    expect(res!.tasks![0].expectedAmount).toBe(25000);
    expect(res!.tasks![0].expectedCategory).toBe('Առողջություն');
    expect(res!.tasks![0].linkedTxId).toBe('tx-pending-1');

    expect(res!.customCategories).toHaveLength(1);
    expect(res!.customCategories![0].name).toBe('Մարզասրահ');
  });

  it('rejects non-object or unrecognized payloads', () => {
    expect(sanitizeBackupPayload(null)).toBeNull();
    expect(sanitizeBackupPayload(['not', 'an', 'object'])).toBeNull();
    expect(sanitizeBackupPayload({ foo: 'bar' })).toBeNull();
  });
});
