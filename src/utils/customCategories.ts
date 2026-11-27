import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../data/defaults';
import { CustomCategory } from '../types';

export const CUSTOM_CATEGORY_COLORS = [
  '#2563EB',
  '#10B981',
  '#F59E0B',
  '#F43F5E',
  '#8B5CF6',
  '#06B6D4',
  '#EC4899',
  '#14B8A6',
] as const;

export function normalizeTag(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .slice(0, 32);
  return cleaned;
}

export function normalizeTags(rawTags?: string[] | null): string[] {
  if (!Array.isArray(rawTags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawTags) {
    if (typeof raw !== 'string') continue;
    const tag = normalizeTag(raw);
    if (!tag) continue;
    const lower = tag.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(tag);
    if (out.length >= 8) break;
  }
  return out;
}

export function extractHashtags(text: string): {
  cleanText: string;
  tags: string[];
} {
  if (!text) return { cleanText: '', tags: [] };
  const extracted: string[] = [];
  const cleanText = text
    .replace(/(^|\s)#([\p{L}\p{N}_-]{1,32})/gu, (_full, lead, tag) => {
      extracted.push(tag);
      return lead;
    })
    .replace(/\s+/g, ' ')
    .trim();
  return {
    cleanText,
    tags: normalizeTags(extracted),
  };
}

export function mergeExpenseCategories(
  customCategories: CustomCategory[] = []
): string[] {
  const seen = new Set<string>(EXPENSE_CATEGORIES);
  const merged: string[] = [...EXPENSE_CATEGORIES];
  for (const cat of customCategories) {
    if (cat.type !== 'expense') continue;
    const trimmed = cat.name.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    merged.push(trimmed);
  }
  return merged;
}

export function mergeIncomeCategories(
  customCategories: CustomCategory[] = []
): string[] {
  const seen = new Set<string>(INCOME_CATEGORIES);
  const merged: string[] = [...INCOME_CATEGORIES];
  for (const cat of customCategories) {
    if (cat.type !== 'income') continue;
    const trimmed = cat.name.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    merged.push(trimmed);
  }
  return merged;
}

export function buildCategoryColorMap(
  customCategories: CustomCategory[] = []
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of customCategories) {
    if (c.name && c.color) {
      map[c.name] = c.color;
    }
  }
  return map;
}
