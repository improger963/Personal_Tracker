import { EXPENSE_CATEGORIES } from '../data/defaults';
import { BillFrequency, RecurringBill, Transaction } from '../types';
import { INTERNAL_TRANSFER_CATEGORY } from './cardBalances';
import { daysBetweenISO } from './financialCycle';
import { getDailyPresetTimes } from './notifications';
import { normalizeTxTitle, predictCategoryFromHistory } from './transactionAutoCategory';

export interface RecurringBillSuggestion {
  key: string;
  title: string;
  occurrences: number;
  typicalAmount: number;
  isVariableAmount: boolean;
  suggestedFrequency: Extract<BillFrequency, 'monthly' | 'daily'>;
  suggestedDayOfMonth: number;
  suggestedDailyTimes: string[];
  suggestedCategory: string;
  firstDate: string;
  lastDate: string;
  averageIntervalDays: number | null;
  matchingTransactionIds: string[];
}

export interface DetectRecurringExpensesOptions {
  minOccurrences?: number;
  dismissedKeys?: Iterable<string>;
}

const DEFAULT_UNCATEGORIZED = 'Այլ';

export function isUncategorizedExpense(tx: Transaction): boolean {
  if (tx.type !== 'expense' || tx.isPending) return false;
  if (tx.category === INTERNAL_TRANSFER_CATEGORY) return false;
  const cat = (tx.category ?? '').trim();
  return cat === '' || cat === DEFAULT_UNCATEGORIZED;
}

function computeMedianAmount(amounts: number[]): number {
  const valid = amounts.filter((a) => Number.isFinite(a) && a > 0).sort((a, b) => a - b);
  if (valid.length === 0) return 0;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) {
    return Math.round(valid[mid]);
  }
  return Math.round((valid[mid - 1] + valid[mid]) / 2);
}

function computeModeDayOfMonth(sortedTxs: Transaction[]): number {
  const counts = new Map<number, { count: number; latestDate: string }>();
  for (const tx of sortedTxs) {
    const parsedDay = Number(tx.date?.slice(8, 10));
    const day = Number.isFinite(parsedDay)
      ? Math.min(31, Math.max(1, Math.round(parsedDay)))
      : 15;
    const prev = counts.get(day);
    if (!prev) {
      counts.set(day, { count: 1, latestDate: tx.date });
    } else {
      prev.count += 1;
      if (tx.date > prev.latestDate) prev.latestDate = tx.date;
    }
  }

  let bestDay = 15;
  let bestCount = -1;
  let bestDate = '';
  for (const [day, meta] of counts.entries()) {
    if (
      meta.count > bestCount ||
      (meta.count === bestCount && meta.latestDate > bestDate)
    ) {
      bestDay = day;
      bestCount = meta.count;
      bestDate = meta.latestDate;
    }
  }
  return bestDay;
}

function inferFrequencyAndInterval(sortedTxs: Transaction[]): {
  frequency: 'monthly' | 'daily';
  averageIntervalDays: number | null;
} {
  const uniqueDates = Array.from(
    new Set(sortedTxs.map((tx) => tx.date).filter(Boolean))
  ).sort();

  if (uniqueDates.length < 2) {
    // Multiple occurrences on the same date or single date -> treat short burst as daily if >=3, else monthly
    return {
      frequency: sortedTxs.length >= 3 ? 'daily' : 'monthly',
      averageIntervalDays: sortedTxs.length >= 2 ? 0 : null,
    };
  }

  let totalGap = 0;
  for (let i = 1; i < uniqueDates.length; i++) {
    totalGap += Math.max(0, daysBetweenISO(uniqueDates[i - 1], uniqueDates[i]));
  }
  const avgInterval = Math.round(totalGap / (uniqueDates.length - 1));

  // If occurrences happen every <= 4 days on average, suggest a daily recurring bill
  const frequency = avgInterval <= 4 ? 'daily' : 'monthly';
  return { frequency, averageIntervalDays: avgInterval };
}

/**
 * Detects frequent, uncategorized expenses in transaction history that do not yet
 * have a matching recurring bill and prompts the user to convert them.
 */
export function detectFrequentUncategorizedExpenses(
  transactions: Transaction[],
  recurringBills: RecurringBill[],
  options?: DetectRecurringExpensesOptions
): RecurringBillSuggestion[] {
  const minOccurrences = Math.max(2, options?.minOccurrences ?? 2);

  const existingBillTitles = new Set(
    recurringBills.map((b) => normalizeTxTitle(b.title)).filter(Boolean)
  );
  const dismissedSet = new Set<string>();
  if (options?.dismissedKeys) {
    for (const k of options.dismissedKeys) {
      const norm = normalizeTxTitle(k);
      if (norm) dismissedSet.add(norm);
    }
  }

  const grouped = new Map<string, Transaction[]>();

  for (const tx of transactions) {
    if (!isUncategorizedExpense(tx)) continue;
    const normTitle = normalizeTxTitle(tx.title);
    if (normTitle.length < 2) continue;
    if (existingBillTitles.has(normTitle) || dismissedSet.has(normTitle)) {
      continue;
    }
    const list = grouped.get(normTitle);
    if (list) {
      list.push(tx);
    } else {
      grouped.set(normTitle, [tx]);
    }
  }

  const suggestions: RecurringBillSuggestion[] = [];

  for (const [key, txs] of grouped.entries()) {
    if (txs.length < minOccurrences) continue;

    const sorted = [...txs].sort((a, b) => {
      const dCmp = (a.date || '').localeCompare(b.date || '');
      if (dCmp !== 0) return dCmp;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });

    const latestTx = sorted[sorted.length - 1];
    const displayTitle = latestTx.title.trim() || key;

    const amounts = sorted.map((t) => t.amount).filter((a) => a > 0);
    const typicalAmount = computeMedianAmount(amounts);
    if (typicalAmount <= 0) continue;

    const minAmount = Math.min(...amounts);
    const maxAmount = Math.max(...amounts);
    const isVariableAmount =
      maxAmount - minAmount > Math.max(500, typicalAmount * 0.15);

    const { frequency, averageIntervalDays } = inferFrequencyAndInterval(sorted);
    const suggestedDayOfMonth = computeModeDayOfMonth(sorted);
    const prediction = predictCategoryFromHistory(
      displayTitle,
      'expense',
      transactions,
      { ignoreCategory: DEFAULT_UNCATEGORIZED }
    );
    const suggestedCategory =
      prediction &&
      prediction.category !== DEFAULT_UNCATEGORIZED &&
      (EXPENSE_CATEGORIES as readonly string[]).includes(prediction.category)
        ? prediction.category
        : DEFAULT_UNCATEGORIZED;

    suggestions.push({
      key,
      title: displayTitle,
      occurrences: sorted.length,
      typicalAmount,
      isVariableAmount,
      suggestedFrequency: frequency,
      suggestedDayOfMonth,
      suggestedDailyTimes: getDailyPresetTimes(1),
      suggestedCategory,
      firstDate: sorted[0].date,
      lastDate: latestTx.date,
      averageIntervalDays,
      matchingTransactionIds: sorted.map((t) => t.id),
    });
  }

  return suggestions.sort((a, b) => {
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
    return b.lastDate.localeCompare(a.lastDate);
  });
}

export function buildRecurringBillFromSuggestion(
  suggestion: RecurringBillSuggestion,
  overrides?: {
    title?: string;
    amount?: number;
    category?: string;
    frequency?: 'monthly' | 'daily';
    dayOfMonth?: number;
    dailyTimes?: string[];
    isVariableAmount?: boolean;
  }
): Omit<RecurringBill, 'id'> {
  const frequency = overrides?.frequency ?? suggestion.suggestedFrequency;
  const amount =
    overrides?.amount !== undefined && overrides.amount > 0
      ? Math.round(overrides.amount)
      : suggestion.typicalAmount;
  const category = overrides?.category?.trim() || suggestion.suggestedCategory;
  const dayOfMonth = Math.min(
    31,
    Math.max(1, Math.round(overrides?.dayOfMonth ?? suggestion.suggestedDayOfMonth))
  );

  return {
    title: overrides?.title?.trim() || suggestion.title,
    amount,
    category,
    frequency,
    dayOfMonth,
    reminderTime: frequency === 'monthly' ? '10:00' : undefined,
    dailyTimes:
      frequency === 'daily'
        ? (overrides?.dailyTimes ?? suggestion.suggestedDailyTimes)
        : undefined,
    isVariableAmount:
      overrides?.isVariableAmount ?? suggestion.isVariableAmount,
    active: true,
  };
}
