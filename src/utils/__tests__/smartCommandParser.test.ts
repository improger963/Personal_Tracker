import { describe, expect, it } from 'vitest';
import {
  classify503020Category,
  extractChecklistAmounts,
  parseSmartCommand,
} from '../smartCommandParser';
import { extractHashtags } from '../customCategories';
import { BankCard } from '../../types';

describe('smartCommandParser', () => {
  const sampleCards: BankCard[] = [
    {
      id: 'c-visa',
      name: 'Ameriabank Visa',
      last4: '4589',
      cardType: 'visa',
      color: 'emerald',
      initialBalance: 100000,
      currency: 'AMD',
      isDefault: true,
      createdAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 'c-cash',
      name: 'Կանխիկ',
      last4: '',
      cardType: 'cash',
      color: 'amber',
      initialBalance: 20000,
      currency: 'AMD',
      createdAt: '2026-11-01T00:00:00Z',
    },
  ];

  it('parses expense shortcuts like "-1500 սուրճ" and "1.5k կոֆե կանխիկ"', () => {
    const simple = parseSmartCommand('-1500 սուրճ', [], sampleCards);
    expect(simple).not.toBeNull();
    expect(simple?.kind).toBe('transaction');
    if (simple?.kind === 'transaction') {
      expect(simple.txType).toBe('expense');
      expect(simple.amount).toBe(1500);
      expect(simple.category).toBe('Սնունդ');
      expect(simple.cardId).toBe('c-visa');
    }

    const kSyntax = parseSmartCommand('1.5k կոֆե կանխիկ', [], sampleCards);
    expect(kSyntax?.kind).toBe('transaction');
    if (kSyntax?.kind === 'transaction') {
      expect(kSyntax.amount).toBe(1500);
      expect(kSyntax.cardId).toBe('c-cash');
    }
  });

  it('parses income shortcuts like "+200000 աշխատավարձ"', () => {
    const income = parseSmartCommand('+200000 աշխատավարձ', [], sampleCards);
    expect(income?.kind).toBe('transaction');
    if (income?.kind === 'transaction') {
      expect(income.txType).toBe('income');
      expect(income.amount).toBe(200000);
      expect(income.category).toBe('Աշխատավարձ');
    }
  });

  it('parses task and note prefixes as well as hashtags & checklists', () => {
    const task = parseSmartCommand('անելիք՝ հաշիվը վճարել 18:30 !', [], []);
    expect(task?.kind).toBe('task');
    if (task?.kind === 'task') {
      expect(task.dueTime).toBe('18:30');
      expect(task.priority).toBe('high');
    }

    const note = parseSmartCommand('նշում՝ Գաղափար - ստեղծել բյուջե', [], []);
    expect(note?.kind).toBe('note');

    const { cleanText, tags } = extractHashtags('Ընթրիք ընկերների հետ #ճամփորդություն #Աշխատանք');
    expect(cleanText).toBe('Ընթրիք ընկերների հետ');
    expect(tags).toEqual(['ճամփորդություն', 'Աշխատանք']);

    const checklistTotals = extractChecklistAmounts([
      { id: '1', text: 'Կաթ 900', done: true },
      { id: '2', text: 'Պանիր 1800 ֏', done: false },
    ]);
    expect(checklistTotals.totalEstimated).toBe(2700);
    expect(checklistTotals.uncheckedEstimated).toBe(1800);
    expect(classify503020Category('Սնունդ')).toBe('needs');
    expect(classify503020Category('Ժամանց')).toBe('wants');
  });
});
