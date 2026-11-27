import { describe, expect, it } from 'vitest';
import {
  buildStatementPreviewRows,
  detectStatementColumns,
  normalizeImportedDate,
  parseCsvRows,
  parseFlexibleAmount,
} from '../statementImporter';
import { Transaction } from '../../types';

describe('statementImporter', () => {
  it('parses semicolon and quoted CSV tables cleanly', () => {
    const csv = [
      'Date;Description;Debit;Credit;Currency',
      '15.11.2026;"Coffee, Yerevan";"1 500,50";;AMD',
      '2026-11-16;Salary bonus;;"150,000";AMD',
    ].join('\n');

    const parsed = parseCsvRows(csv);
    expect(parsed.delimiter).toBe(';');
    expect(parsed.headers).toEqual(['Date', 'Description', 'Debit', 'Credit', 'Currency']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0][1]).toBe('Coffee, Yerevan');
  });

  it('normalizes ISO and European/Armenian bank date formats', () => {
    expect(normalizeImportedDate('2026-11-25T10:20:00')).toBe('2026-11-25');
    expect(normalizeImportedDate('25.11.2026')).toBe('2026-11-25');
    expect(normalizeImportedDate('31/02/2026')).toBeNull();
  });

  it('parses amounts with spaces, currency symbols, parentheses, and separators', () => {
    expect(parseFlexibleAmount('-1 250,50 ֏')).toBe(-1250.5);
    expect(parseFlexibleAmount('(450.00 USD)')).toBe(-450);
    expect(parseFlexibleAmount('+200,000')).toBe(200000);
    expect(parseFlexibleAmount('0')).toBeNull();
  });

  it('auto-detects columns, classifies rows, converts USD, and flags duplicates', () => {
    const csv = [
      'Ամսաթիվ,Նկարագրություն,Գումար,Արժույթ',
      '2026-11-10,Yerevan City Սուպերմարկետ,-5000,AMD',
      '2026-11-12,Spotify,-10,USD',
      '2026-11-15,Աշխատավարձ,+250000,AMD',
    ].join('\n');

    const table = parseCsvRows(csv);
    const mapping = detectStatementColumns(table.headers);
    expect(mapping.dateCol).toBe(0);
    expect(mapping.titleCol).toBe(1);
    expect(mapping.amountCol).toBe(2);
    expect(mapping.currencyCol).toBe(3);

    const existing: Transaction[] = [
      {
        id: 'existing-1',
        type: 'expense',
        amount: 5000,
        title: 'Yerevan City Սուպերմարկետ',
        category: 'Սնունդ',
        date: '2026-11-10',
        createdAt: '2026-11-10T12:00:00Z',
      },
    ];

    const preview = buildStatementPreviewRows({
      table,
      mapping,
      defaultCurrency: 'AMD',
      existingTransactions: existing,
      fxRates: { USD: 400 },
    });

    expect(preview).toHaveLength(3);
    expect(preview[0].isDuplicate).toBe(true);
    expect(preview[0].selected).toBe(false);
    expect(preview[1].currency).toBe('USD');
    expect(preview[1].amountAMD).toBe(4000);
    expect(preview[1].category).toBe('Ժամանց');
    expect(preview[2].type).toBe('income');
    expect(preview[2].category).toBe('Աշխատավարձ');
  });
});
