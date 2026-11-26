import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getTransactionIncomeKind } from '../data/defaults';
import { IncomeKind, Transaction, TransactionType } from '../types';

export type AutoCategoryMatchKind = 'exact' | 'partial' | 'token';

export interface AutoCategoryPrediction {
  category: string;
  incomeKind?: IncomeKind;
  matchedTitle: string;
  matchKind: AutoCategoryMatchKind;
  occurrences: number;
}

export interface TitleHistorySuggestion {
  title: string;
  category: string;
  incomeKind?: IncomeKind;
  count: number;
  lastDate: string;
}

const STOP_WORDS = new Set([
  'և',
  'ու',
  'կամ',
  'համար',
  'մեջ',
  'վրա',
  'հետ',
  'ըստ',
  'առանց',
  'որ',
  'այս',
  'այն',
  'and',
  'for',
  'the',
  'with',
  'from',
  'to',
  'in',
  'on',
  'of',
]);

export function normalizeTxTitle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[«»"'`.,!?;:()[\]{}\-–—/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeTitle(normalized: string): string[] {
  if (!normalized) return [];
  return normalized
    .split(' ')
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function isAllowedCategory(category: string, type: TransactionType): boolean {
  if (!category) return false;
  const list: readonly string[] =
    type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return list.includes(category);
}

interface TitleCategoryBucket {
  category: string;
  incomeKind?: IncomeKind;
  count: number;
  latestSortKey: string;
  displayTitle: string;
}

function buildCategoryWinner(
  items: Transaction[],
  type: TransactionType
): TitleCategoryBucket | null {
  if (items.length === 0) return null;

  const byCategory = new Map<string, TitleCategoryBucket>();
  for (const tx of items) {
    if (!isAllowedCategory(tx.category, type)) continue;
    const sortKey = `${tx.date || ''}|${tx.createdAt || ''}`;
    const existing = byCategory.get(tx.category);
    const kind = type === 'income' ? getTransactionIncomeKind(tx) : undefined;
    if (!existing) {
      byCategory.set(tx.category, {
        category: tx.category,
        incomeKind: kind,
        count: 1,
        latestSortKey: sortKey,
        displayTitle: tx.title,
      });
    } else {
      existing.count += 1;
      if (sortKey > existing.latestSortKey) {
        existing.latestSortKey = sortKey;
        existing.displayTitle = tx.title;
        if (kind) existing.incomeKind = kind;
      }
    }
  }

  let best: TitleCategoryBucket | null = null;
  for (const bucket of byCategory.values()) {
    if (!best) {
      best = bucket;
      continue;
    }
    if (
      bucket.count > best.count ||
      (bucket.count === best.count && bucket.latestSortKey > best.latestSortKey)
    ) {
      best = bucket;
    }
  }

  return best;
}

export function predictCategoryFromHistory(
  rawTitle: string,
  type: TransactionType,
  history: Transaction[],
  options?: {
    excludeTxId?: string;
    ignoreCategory?: string;
  }
): AutoCategoryPrediction | null {
  const inputNorm = normalizeTxTitle(rawTitle);
  if (inputNorm.length < 2) return null;

  const candidates = history.filter((tx) => {
    if (tx.type !== type) return false;
    if (options?.excludeTxId && tx.id === options.excludeTxId) return false;
    if (options?.ignoreCategory && tx.category === options.ignoreCategory) return false;
    if (!isAllowedCategory(tx.category, type)) return false;
    return normalizeTxTitle(tx.title).length > 0;
  });

  if (candidates.length === 0) return null;

  // 1. Exact normalized title match
  const exactMatches = candidates.filter(
    (tx) => normalizeTxTitle(tx.title) === inputNorm
  );
  if (exactMatches.length > 0) {
    const winner = buildCategoryWinner(exactMatches, type);
    if (winner) {
      return {
        category: winner.category,
        incomeKind: winner.incomeKind,
        matchedTitle: winner.displayTitle,
        matchKind: 'exact',
        occurrences: winner.count,
      };
    }
  }

  if (inputNorm.length < 3) return null;

  // 2. Prefix or substring match (for >= 3 chars)
  const partialScored: Array<{ tx: Transaction; score: number }> = [];
  for (const tx of candidates) {
    const candNorm = normalizeTxTitle(tx.title);
    if (candNorm.length < 3) continue;

    if (candNorm.startsWith(inputNorm) || inputNorm.startsWith(candNorm)) {
      const lengthRatio =
        Math.min(candNorm.length, inputNorm.length) /
        Math.max(candNorm.length, inputNorm.length);
      partialScored.push({ tx, score: 2 + lengthRatio });
    } else if (candNorm.includes(inputNorm) || inputNorm.includes(candNorm)) {
      const lengthRatio =
        Math.min(candNorm.length, inputNorm.length) /
        Math.max(candNorm.length, inputNorm.length);
      partialScored.push({ tx, score: 1 + lengthRatio });
    }
  }

  if (partialScored.length > 0) {
    const byCatScore = new Map<
      string,
      {
        score: number;
        count: number;
        latestSortKey: string;
        displayTitle: string;
        incomeKind?: IncomeKind;
      }
    >();

    for (const { tx, score } of partialScored) {
      const sortKey = `${tx.date || ''}|${tx.createdAt || ''}`;
      const kind = type === 'income' ? getTransactionIncomeKind(tx) : undefined;
      const existing = byCatScore.get(tx.category);
      if (!existing) {
        byCatScore.set(tx.category, {
          score,
          count: 1,
          latestSortKey: sortKey,
          displayTitle: tx.title,
          incomeKind: kind,
        });
      } else {
        existing.score += score * 0.35;
        existing.count += 1;
        if (sortKey > existing.latestSortKey) {
          existing.latestSortKey = sortKey;
          existing.displayTitle = tx.title;
          if (kind) existing.incomeKind = kind;
        }
      }
    }

    let bestCat: string | null = null;
    let bestData: {
      score: number;
      count: number;
      latestSortKey: string;
      displayTitle: string;
      incomeKind?: IncomeKind;
    } | null = null;

    for (const [cat, data] of byCatScore.entries()) {
      if (
        !bestData ||
        data.score > bestData.score ||
        (Math.abs(data.score - bestData.score) < 0.01 &&
          data.latestSortKey > bestData.latestSortKey)
      ) {
        bestCat = cat;
        bestData = data;
      }
    }

    if (bestCat && bestData) {
      return {
        category: bestCat,
        incomeKind: bestData.incomeKind,
        matchedTitle: bestData.displayTitle,
        matchKind: 'partial',
        occurrences: bestData.count,
      };
    }
  }

  // 3. Token overlap match (e.g. "Տաքսի տուն" -> matches "Տաքսի և երթևեկություն")
  const inputTokens = tokenizeTitle(inputNorm);
  if (inputTokens.length === 0) return null;

  const tokenStats = new Map<
    string,
    {
      score: number;
      count: number;
      latestSortKey: string;
      displayTitle: string;
      incomeKind?: IncomeKind;
    }
  >();

  for (const tx of candidates) {
    const candTokens = tokenizeTitle(normalizeTxTitle(tx.title));
    if (candTokens.length === 0) continue;

    let overlapWeight = 0;
    let hasStrongToken = false;

    for (const inTok of inputTokens) {
      for (const candTok of candTokens) {
        if (inTok === candTok) {
          overlapWeight += inTok.length >= 4 ? 1.2 : 1;
          if (inTok.length >= 3) hasStrongToken = true;
        } else if (
          inTok.length >= 4 &&
          candTok.length >= 4 &&
          (inTok.startsWith(candTok) || candTok.startsWith(inTok))
        ) {
          overlapWeight += 0.75;
          hasStrongToken = true;
        }
      }
    }

    if (!hasStrongToken || overlapWeight <= 0) continue;

    const unionSize = new Set([...inputTokens, ...candTokens]).size;
    const jaccard = overlapWeight / Math.max(1, unionSize);
    if (jaccard < 0.28) continue;

    const sortKey = `${tx.date || ''}|${tx.createdAt || ''}`;
    const kind = type === 'income' ? getTransactionIncomeKind(tx) : undefined;
    const existing = tokenStats.get(tx.category);
    if (!existing) {
      tokenStats.set(tx.category, {
        score: jaccard,
        count: 1,
        latestSortKey: sortKey,
        displayTitle: tx.title,
        incomeKind: kind,
      });
    } else {
      existing.score += jaccard * 0.4;
      existing.count += 1;
      if (sortKey > existing.latestSortKey) {
        existing.latestSortKey = sortKey;
        existing.displayTitle = tx.title;
        if (kind) existing.incomeKind = kind;
      }
    }
  }

  let winnerCat: string | null = null;
  let winnerTokenData: {
    score: number;
    count: number;
    latestSortKey: string;
    displayTitle: string;
    incomeKind?: IncomeKind;
  } | null = null;

  for (const [cat, data] of tokenStats.entries()) {
    if (
      !winnerTokenData ||
      data.score > winnerTokenData.score ||
      (Math.abs(data.score - winnerTokenData.score) < 0.01 &&
        data.latestSortKey > winnerTokenData.latestSortKey)
    ) {
      winnerCat = cat;
      winnerTokenData = data;
    }
  }

  if (winnerCat && winnerTokenData) {
    return {
      category: winnerCat,
      incomeKind: winnerTokenData.incomeKind,
      matchedTitle: winnerTokenData.displayTitle,
      matchKind: 'token',
      occurrences: winnerTokenData.count,
    };
  }

  return null;
}

export function getTitleSuggestionsFromHistory(
  rawQuery: string,
  type: TransactionType,
  history: Transaction[],
  limit = 5
): TitleHistorySuggestion[] {
  const queryNorm = normalizeTxTitle(rawQuery);
  const grouped = new Map<
    string,
    {
      title: string;
      txs: Transaction[];
      lastDate: string;
    }
  >();

  for (const tx of history) {
    if (tx.type !== type) continue;
    const norm = normalizeTxTitle(tx.title);
    if (!norm) continue;
    if (queryNorm && !norm.includes(queryNorm)) continue;

    const existing = grouped.get(norm);
    if (!existing) {
      grouped.set(norm, {
        title: tx.title,
        txs: [tx],
        lastDate: tx.date || '',
      });
    } else {
      existing.txs.push(tx);
      if ((tx.date || '') >= existing.lastDate) {
        existing.lastDate = tx.date || '';
        existing.title = tx.title;
      }
    }
  }

  const results: TitleHistorySuggestion[] = [];
  for (const [norm, group] of grouped.entries()) {
    // Avoid suggesting an exact match if user already finished typing it cleanly
    if (queryNorm && norm === queryNorm) continue;
    const winner = buildCategoryWinner(group.txs, type);
    if (!winner) continue;
    results.push({
      title: group.title,
      category: winner.category,
      incomeKind: winner.incomeKind,
      count: group.txs.length,
      lastDate: group.lastDate,
    });
  }

  results.sort((a, b) => {
    if (queryNorm) {
      const aStarts = normalizeTxTitle(a.title).startsWith(queryNorm) ? 1 : 0;
      const bStarts = normalizeTxTitle(b.title).startsWith(queryNorm) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;
    }
    if (b.count !== a.count) return b.count - a.count;
    return b.lastDate.localeCompare(a.lastDate);
  });

  return results.slice(0, limit);
}

export interface AutoCategorizableItem {
  tx: Transaction;
  prediction: AutoCategoryPrediction;
}

export function findAutoCategorizableTransactions(
  targetTransactions: Transaction[],
  allHistory: Transaction[]
): AutoCategorizableItem[] {
  const matches: AutoCategorizableItem[] = [];
  for (const tx of targetTransactions) {
    if (tx.category !== 'Այլ') continue;
    const prediction = predictCategoryFromHistory(tx.title, tx.type, allHistory, {
      excludeTxId: tx.id,
      ignoreCategory: 'Այլ',
    });
    if (prediction && prediction.category !== 'Այլ') {
      matches.push({ tx, prediction });
    }
  }
  return matches;
}
