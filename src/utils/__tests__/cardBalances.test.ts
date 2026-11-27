import { describe, expect, it } from 'vitest';
import {
  computeCardStats,
  convertFromAMD,
  convertToAMD,
  getTotalCardsBalanceAMD,
  getTotalCardsInitialBalanceAMD,
  getTxAmountInCardCurrency,
} from '../cardBalances';
import { BankCard, Transaction } from '../../types';

const FX = { USD: 400, EUR: 430, RUB: 4, GEL: 150 };

describe('cardBalances', () => {
  it('converts between foreign currencies and AMD using provided FX rates', () => {
    expect(convertToAMD(100, 'USD', FX)).toBe(40000);
    expect(convertToAMD(50, 'EUR', FX)).toBe(21500);
    expect(convertToAMD(1000, 'RUB', FX)).toBe(4000);
    expect(convertFromAMD(40000, 'USD', FX)).toBe(100);
    expect(convertFromAMD(1500, 'GEL', FX)).toBe(10);
  });

  it('prefers native cardAmount when cardCurrency matches and falls back cleanly', () => {
    const exactTx: Transaction = {
      id: 'tx-usd',
      type: 'expense',
      amount: 39500,
      cardAmount: 100,
      cardCurrency: 'USD',
      title: 'Hotel',
      category: 'Գնումներ',
      date: '2026-11-20',
      createdAt: '2026-11-20T10:00:00Z',
    };
    expect(getTxAmountInCardCurrency(exactTx, 'USD', FX)).toBe(100);

    const amdOnlyTx: Transaction = {
      id: 'tx-amd',
      type: 'expense',
      amount: 40000,
      title: 'Online',
      category: 'Գնումներ',
      date: '2026-11-20',
      createdAt: '2026-11-20T10:00:00Z',
    };
    expect(getTxAmountInCardCurrency(amdOnlyTx, 'USD', FX)).toBe(100);
  });

  it('computes card stats and consolidated total balance in AMD accurately', () => {
    const cards: BankCard[] = [
      {
        id: 'c-amd',
        name: 'Ameria AMD',
        last4: '1111',
        cardType: 'visa',
        color: 'emerald',
        initialBalance: 100000,
        currency: 'AMD',
        isDefault: true,
        createdAt: '2026-11-01T00:00:00Z',
      },
      {
        id: 'c-usd',
        name: 'Travel USD',
        last4: '2222',
        cardType: 'mastercard',
        color: 'blue',
        initialBalance: 200,
        currency: 'USD',
        createdAt: '2026-11-01T00:00:00Z',
      },
    ];

    const txs: Transaction[] = [
      {
        id: 't1',
        type: 'expense',
        amount: 20000,
        title: 'Market',
        category: 'Սնունդ',
        date: '2026-11-05',
        cardId: 'c-amd',
        createdAt: '2026-11-05T10:00:00Z',
      },
      {
        id: 't2',
        type: 'expense',
        amount: 20000,
        cardAmount: 50,
        cardCurrency: 'USD',
        title: 'Software',
        category: 'Կրթություն',
        date: '2026-11-06',
        cardId: 'c-usd',
        createdAt: '2026-11-06T10:00:00Z',
      },
      {
        id: 't3',
        type: 'expense',
        amount: 4000,
        cardAmount: 10,
        cardCurrency: 'USD',
        title: 'Pending Sub',
        category: 'Ժամանց',
        date: '2026-11-08',
        cardId: 'c-usd',
        isPending: true,
        createdAt: '2026-11-08T10:00:00Z',
      },
    ];

    expect(getTotalCardsInitialBalanceAMD(cards, FX)).toBe(180000);

    const usdStats = computeCardStats(cards[1], txs, FX);
    expect(usdStats.currentBalance).toBe(150);
    expect(usdStats.pendingExpense).toBe(10);
    expect(usdStats.currentBalanceAMD).toBe(60000);

    // c-amd = 80,000 AMD, c-usd = 60,000 AMD => 140,000 AMD
    expect(getTotalCardsBalanceAMD(cards, txs, FX)).toBe(140000);
  });
});
