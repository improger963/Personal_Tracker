import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../data/defaults';
import { CardCurrency, CustomCategory, Transaction, TransactionType } from '../types';
import {
  FxRatesToAmd,
  convertToAMD,
  normalizeCardCurrency,
} from './cardBalances';
import { mergeExpenseCategories, mergeIncomeCategories } from './customCategories';
import { parseSmartCommand } from './smartCommandParser';
import { normalizeTxTitle, predictCategoryFromHistory } from './transactionAutoCategory';

export type CsvDelimiter = ',' | ';' | '\t';

export interface ParsedCsvTable {
  delimiter: CsvDelimiter;
  headers: string[];
  rows: string[][];
}

export interface StatementColumnMapping {
  dateCol: number;
  titleCol: number;
  amountCol: number | null;
  debitCol: number | null;
  creditCol: number | null;
  currencyCol: number | null;
  categoryCol: number | null;
}

export interface StatementPreviewRow {
  id: string;
  rowIndex: number;
  date: string;
  title: string;
  type: TransactionType;
  nativeAmount: number;
  currency: CardCurrency;
  amountAMD: number;
  category: string;
  isDuplicate: boolean;
  selected: boolean;
}

function detectDelimiter(sampleText: string): CsvDelimiter {
  const firstLines = sampleText.split('\n').slice(0, 6).join('\n');
  const candidates: CsvDelimiter[] = [';', ',', '\t'];
  let best: CsvDelimiter = ',';
  let bestScore = -1;

  for (const delim of candidates) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLines.length; i++) {
      const ch = firstLines[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes && ch === delim) {
        count += 1;
      }
    }
    if (count > bestScore) {
      bestScore = count;
      best = delim;
    }
  }
  return best;
}

export function parseCsvRows(rawText: string): ParsedCsvTable {
  const cleanText = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const delimiter = detectDelimiter(cleanText);

  const rawRows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleanText[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) {
        rawRows.push(row);
      }
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) {
    rawRows.push(row);
  }

  if (rawRows.length === 0) {
    return { delimiter, headers: [], rows: [] };
  }

  const headers = rawRows[0];
  const rows = rawRows.slice(1);
  return { delimiter, headers, rows };
}

function isValidYMD(year: number, month: number, day: number): boolean {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

export function normalizeImportedDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // ISO-like prefix YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const ymdMatch = trimmed.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[T\s].*)?$/);
  if (ymdMatch) {
    const y = Number(ymdMatch[1]);
    const m = Number(ymdMatch[2]);
    const d = Number(ymdMatch[3]);
    if (!isValidYMD(y, m, d)) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY (common in Ameriabank / IDBank / European exports)
  const dmyMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s.*)?$/);
  if (dmyMatch) {
    const d = Number(dmyMatch[1]);
    const m = Number(dmyMatch[2]);
    const y = Number(dmyMatch[3]);
    if (!isValidYMD(y, m, d)) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  return null;
}

export function parseFlexibleAmount(raw: string): number | null {
  if (!raw) return null;
  let working = raw.trim();
  if (!working) return null;

  let isNegative = false;
  if (/^\(.*\)$/.test(working)) {
    isNegative = true;
    working = working.slice(1, -1).trim();
  }
  if (working.startsWith('-')) {
    isNegative = true;
    working = working.slice(1).trim();
  } else if (working.startsWith('+')) {
    working = working.slice(1).trim();
  }

  // Strip currency letters, symbols, spaces, non-breaking spaces
  working = working
    .replace(/(?:AMD|USD|EUR|RUB|GEL|֏|\$|€|₽|₾)/gi, '')
    .replace(/[\s\u00A0\u202F']/g, '');

  if (!working || !/\d/.test(working)) return null;

  // Handle decimal vs thousands separators cleanly
  if (working.includes(',') && working.includes('.')) {
    const lastComma = working.lastIndexOf(',');
    const lastDot = working.lastIndexOf('.');
    if (lastComma > lastDot) {
      // e.g. 1.250,50 -> decimal comma
      working = working.replace(/\./g, '').replace(',', '.');
    } else {
      // e.g. 1,250.50 -> decimal dot
      working = working.replace(/,/g, '');
    }
  } else if (working.includes(',')) {
    // If trailing ,d or ,dd -> decimal comma; else thousands separator
    if (/,\d{1,2}$/.test(working) && !/,\d{3}$/.test(working)) {
      working = working.replace(',', '.');
    } else {
      working = working.replace(/,/g, '');
    }
  }

  const parsed = Number(working);
  if (!Number.isFinite(parsed) || parsed === 0) return null;
  return isNegative ? -Math.abs(parsed) : parsed;
}

export function detectStatementColumns(headers: string[]): StatementColumnMapping {
  const normHeaders = headers.map((h) => h.trim().toLowerCase());

  const findIndex = (patterns: RegExp[]): number | null => {
    for (const pat of patterns) {
      const idx = normHeaders.findIndex((h) => pat.test(h));
      if (idx !== -1) return idx;
    }
    return null;
  };

  const dateCol =
    findIndex([
      /^(date|ամսաթիվ|дата)$/,
      /date|posted|value.?date|ամսաթիվ|օր|дата|oper/,
    ]) ?? 0;

  const titleCol =
    findIndex([
      /description|merchant|details|purpose|memo|narrative|նկարագր|նպատակ|մեկնաբան|կոնտրագենտ|назначен|описан|title|անվանում/,
    ]) ?? Math.min(1, Math.max(0, headers.length - 1));

  const debitCol = findIndex([/debit|ելք|ծախս|դեբետ|withdrawal|outgoing|расход|списан/]);
  const creditCol = findIndex([/credit|մուտք|եկամուտ|կրեդիտ|deposit|incoming|приход|поступ/]);
  const amountCol = findIndex([/amount|գումար|sum|total|сумма|арժեք/]);
  const currencyCol = findIndex([/currency|ccy|արժույթ|валюта/]);
  const categoryCol = findIndex([/category|կատեգոր|բաժին|категор/]);

  return {
    dateCol,
    titleCol,
    amountCol,
    debitCol,
    creditCol,
    currencyCol,
    categoryCol,
  };
}

function buildDuplicateKey(
  date: string,
  type: TransactionType,
  amountAMD: number,
  title: string
): string {
  return `${date}|${type}|${Math.round(amountAMD)}|${normalizeTxTitle(title)}`;
}

export function buildStatementPreviewRows(params: {
  table: ParsedCsvTable;
  mapping: StatementColumnMapping;
  defaultCurrency: CardCurrency;
  existingTransactions: Transaction[];
  customCategories?: CustomCategory[];
  fxRates?: FxRatesToAmd | null;
}): StatementPreviewRow[] {
  const {
    table,
    mapping,
    defaultCurrency,
    existingTransactions,
    customCategories = [],
    fxRates,
  } = params;

  const allowedExpense = new Set(mergeExpenseCategories(customCategories));
  const allowedIncome = new Set(mergeIncomeCategories(customCategories));

  const existingKeys = new Set<string>();
  for (const tx of existingTransactions) {
    existingKeys.add(buildDuplicateKey(tx.date, tx.type, tx.amount, tx.title));
  }

  const preview: StatementPreviewRow[] = [];

  table.rows.forEach((cells, rowIndex) => {
    const rawDate = cells[mapping.dateCol] ?? '';
    const date = normalizeImportedDate(rawDate);
    if (!date) return;

    const rawTitle = (cells[mapping.titleCol] ?? '').trim();
    const cleanTitle = rawTitle.replace(/\s+/g, ' ').slice(0, 120);

    let type: TransactionType = 'expense';
    let nativeAmount = 0;

    if (mapping.debitCol !== null || mapping.creditCol !== null) {
      const debitVal =
        mapping.debitCol !== null
          ? parseFlexibleAmount(cells[mapping.debitCol] ?? '')
          : null;
      const creditVal =
        mapping.creditCol !== null
          ? parseFlexibleAmount(cells[mapping.creditCol] ?? '')
          : null;

      if (creditVal !== null && Math.abs(creditVal) > 0 && (debitVal === null || debitVal === 0)) {
        type = 'income';
        nativeAmount = Math.abs(creditVal);
      } else if (debitVal !== null && Math.abs(debitVal) > 0) {
        type = 'expense';
        nativeAmount = Math.abs(debitVal);
      } else if (mapping.amountCol !== null) {
        const signed = parseFlexibleAmount(cells[mapping.amountCol] ?? '');
        if (signed === null) return;
        type = signed > 0 ? 'income' : 'expense';
        nativeAmount = Math.abs(signed);
      } else {
        return;
      }
    } else if (mapping.amountCol !== null) {
      const signed = parseFlexibleAmount(cells[mapping.amountCol] ?? '');
      if (signed === null || signed === 0) return;
      type = signed > 0 ? 'income' : 'expense';
      nativeAmount = Math.abs(signed);
    } else {
      return;
    }

    if (nativeAmount <= 0) return;

    const rawCcy =
      mapping.currencyCol !== null
        ? (cells[mapping.currencyCol] ?? '').trim().toUpperCase()
        : '';
    const currency: CardCurrency = rawCcy
      ? normalizeCardCurrency(rawCcy)
      : normalizeCardCurrency(defaultCurrency);

    const roundedNative =
      currency === 'AMD'
        ? Math.round(nativeAmount)
        : Math.round(nativeAmount * 100) / 100;
    const amountAMD = convertToAMD(roundedNative, currency, fxRates);
    if (amountAMD <= 0) return;

    const title = cleanTitle || (type === 'income' ? 'Բանկային մուտք' : 'Բանկային վճարում');

    // Determine category
    let category = 'Այլ';
    const rawCsvCat =
      mapping.categoryCol !== null ? (cells[mapping.categoryCol] ?? '').trim() : '';
    const allowedSet = type === 'income' ? allowedIncome : allowedExpense;

    if (rawCsvCat && allowedSet.has(rawCsvCat)) {
      category = rawCsvCat;
    } else {
      const smartHint = parseSmartCommand(
        `${type === 'income' ? '+' : '-'}${Math.round(amountAMD)} ${title}`,
        existingTransactions
      );
      if (
        smartHint &&
        smartHint.kind === 'transaction' &&
        smartHint.txType === type &&
        smartHint.category !== 'Այլ' &&
        allowedSet.has(smartHint.category)
      ) {
        category = smartHint.category;
      } else {
        const histPred = predictCategoryFromHistory(title, type, existingTransactions, {
          ignoreCategory: 'Այլ',
        });
        if (histPred && allowedSet.has(histPred.category)) {
          category = histPred.category;
        }
      }
    }

    // Validate category exists in default or custom set
    const fallbackAllowed =
      type === 'income'
        ? (INCOME_CATEGORIES as readonly string[])
        : (EXPENSE_CATEGORIES as readonly string[]);
    if (!allowedSet.has(category) && !fallbackAllowed.includes(category)) {
      category = 'Այլ';
    }

    const dupKey = buildDuplicateKey(date, type, amountAMD, title);
    const isDuplicate = existingKeys.has(dupKey);
    existingKeys.add(dupKey);

    preview.push({
      id: `csv-${rowIndex}-${date}`,
      rowIndex,
      date,
      title,
      type,
      nativeAmount: roundedNative,
      currency,
      amountAMD,
      category,
      isDuplicate,
      selected: !isDuplicate,
    });
  });

  return preview;
}
