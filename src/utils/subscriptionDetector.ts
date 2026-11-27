import { Transaction } from '../types';
import { INTERNAL_TRANSFER_CATEGORY } from './cardBalances';

export type SubscriptionMatchReason = 'keyword' | 'recurring_monthly' | 'both';

export interface DetectedSubscription {
  id: string;
  title: string;
  normalizedMerchant: string;
  category: string;
  amount: number;
  count: number;
  distinctMonths: number;
  latestDate: string;
  matchReason: SubscriptionMatchReason;
}

export const KNOWN_SUBSCRIPTION_KEYWORDS = [
  'netflix',
  'spotify',
  'youtube',
  'apple',
  'icloud',
  'chatgpt',
  'openai',
  'claude',
  'gemini',
  'telegram',
  'prime',
  'amazon',
  'disney',
  'hulu',
  'adobe',
  'figma',
  'notion',
  'dropbox',
  'google one',
  'microsoft',
  'office 365',
  'xbox',
  'playstation',
  'steam',
  'vpn',
  'cloud',
  'hosting',
  'domain',
  'subscription',
  'բաժանորդագրություն',
  'ինտերնետ',
  'հեռուստա',
  'ucom',
  'viva',
  'beeline',
  'rostelecom',
  'ovio',
] as const;

export function normalizeMerchantName(rawTitle: string): string {
  return rawTitle
    .toLowerCase()
    .replace(/\b(20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/gi, ' ')
    .replace(/[#*_\-./\\|()[\]]+/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getMerchantBigrams(text: string): Set<string> {
  const compact = text.replace(/\s+/g, '');
  const set = new Set<string>();
  if (compact.length < 2) {
    if (compact) set.add(compact);
    return set;
  }
  for (let i = 0; i < compact.length - 1; i++) {
    set.add(compact.slice(i, i + 2));
  }
  return set;
}

export function areMerchantsSimilar(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen >= 4 && (a.includes(b) || b.includes(a))) {
    return true;
  }
  const bigramsA = getMerchantBigrams(a);
  const bigramsB = getMerchantBigrams(b);
  if (bigramsA.size === 0 || bigramsB.size === 0) return false;

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }
  const dice = (2 * intersection) / (bigramsA.size + bigramsB.size);
  return dice >= 0.72;
}

function matchesKnownSubscriptionKeyword(title: string, category: string): boolean {
  const lowerTitle = title.toLowerCase();
  const lowerCat = category.toLowerCase();
  return (
    KNOWN_SUBSCRIPTION_KEYWORDS.some((kw) => lowerTitle.includes(kw)) ||
    lowerCat.includes('ծառայություն') ||
    lowerCat.includes('բաժանորդագրություն')
  );
}

interface MerchantCluster {
  normalizedMerchant: string;
  displayTitle: string;
  category: string;
  latestDate: string;
  latestAmount: number;
  amounts: number[];
  months: Set<string>;
  count: number;
  hasKeywordMatch: boolean;
}

function areAmountsConsistent(amounts: number[]): boolean {
  if (amounts.length <= 1) return true;
  const max = Math.max(...amounts);
  const min = Math.min(...amounts);
  if (max <= 0) return false;
  // Allow up to ~20% price/FX drift across months, or exact match
  return (max - min) / max <= 0.2;
}

export function detectRecurringSubscriptions(
  transactions: Transaction[]
): DetectedSubscription[] {
  const confirmedExpenses = transactions.filter(
    (tx) =>
      tx.type === 'expense' &&
      !tx.isPending &&
      tx.amount > 0 &&
      tx.category !== INTERNAL_TRANSFER_CATEGORY &&
      tx.title.trim().length > 0
  );

  const clusters: MerchantCluster[] = [];

  // Sort chronologically ascending so latestDate/latestAmount stay deterministic
  const sorted = [...confirmedExpenses].sort((a, b) => a.date.localeCompare(b.date));

  for (const tx of sorted) {
    const cleanTitle = tx.title.trim();
    const norm = normalizeMerchantName(cleanTitle) || cleanTitle.toLowerCase();
    const monthKey = tx.date.slice(0, 7);
    const keywordHit = matchesKnownSubscriptionKeyword(cleanTitle, tx.category);

    // Find an existing cluster with a matching or similar merchant name
    let matched = clusters.find(
      (c) =>
        areMerchantsSimilar(c.normalizedMerchant, norm) &&
        (c.category === tx.category || c.hasKeywordMatch || keywordHit)
    );

    // Secondary heuristic: identical recurring amount (>= 500 AMD) with overlapping word token
    if (!matched) {
      const words = new Set(norm.split(' ').filter((w) => w.length >= 3));
      if (words.size > 0 && tx.amount >= 500) {
        matched = clusters.find((c) => {
          if (c.category !== tx.category) return false;
          if (!c.amounts.includes(tx.amount)) return false;
          const clusterWords = c.normalizedMerchant.split(' ').filter((w) => w.length >= 3);
          return clusterWords.some((w) => words.has(w));
        });
      }
    }

    if (!matched) {
      clusters.push({
        normalizedMerchant: norm,
        displayTitle: cleanTitle,
        category: tx.category,
        latestDate: tx.date,
        latestAmount: tx.amount,
        amounts: [tx.amount],
        months: new Set([monthKey]),
        count: 1,
        hasKeywordMatch: keywordHit,
      });
    } else {
      matched.count += 1;
      matched.amounts.push(tx.amount);
      matched.months.add(monthKey);
      matched.hasKeywordMatch = matched.hasKeywordMatch || keywordHit;
      if (tx.date >= matched.latestDate) {
        matched.latestDate = tx.date;
        matched.latestAmount = tx.amount;
        matched.displayTitle = cleanTitle;
      }
    }
  }

  const detected: DetectedSubscription[] = [];

  for (const cluster of clusters) {
    const distinctMonths = cluster.months.size;
    const isRecurringMonthly =
      distinctMonths >= 2 && areAmountsConsistent(cluster.amounts);

    if (!cluster.hasKeywordMatch && !isRecurringMonthly) {
      continue;
    }

    const matchReason: SubscriptionMatchReason =
      cluster.hasKeywordMatch && isRecurringMonthly
        ? 'both'
        : cluster.hasKeywordMatch
          ? 'keyword'
          : 'recurring_monthly';

    const title =
      cluster.displayTitle.charAt(0).toUpperCase() + cluster.displayTitle.slice(1);

    detected.push({
      id: `${cluster.normalizedMerchant}-${cluster.category}`,
      title,
      normalizedMerchant: cluster.normalizedMerchant,
      category: cluster.category,
      amount: Math.round(cluster.latestAmount),
      count: cluster.count,
      distinctMonths,
      latestDate: cluster.latestDate,
      matchReason,
    });
  }

  return detected.sort((a, b) => {
    if (b.distinctMonths !== a.distinctMonths) {
      return b.distinctMonths - a.distinctMonths;
    }
    return b.amount - a.amount;
  });
}
