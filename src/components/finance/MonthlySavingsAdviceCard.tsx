import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Lightbulb,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Currency } from '../../types';
import { formatMoney } from '../../data/defaults';
import { CategoryDonutPoint } from './financeShared';
import { EmptyStatePlaceholder, Skeleton } from '../ui/Skeleton';

interface GroundingSource {
  title: string;
  uri: string;
}

interface AdviceResponseData {
  advice: string;
  sources: GroundingSource[];
  searchQueries: string[];
  generatedAt: string;
}

interface CachedAdviceEntry extends AdviceResponseData {
  fingerprint: string;
}

interface MonthlySavingsAdviceCardProps {
  selectedMonth: string;
  cycleLabel: string;
  currency: Currency;
  totalIncome: number;
  totalExpense: number;
  projectedMonthlyExpense: number;
  savingsPct: number | null;
  categories: CategoryDonutPoint[];
  topExpenses: Array<{ title: string; category: string; amount: number }>;
}

const CACHE_STORAGE_KEY = 'pa_finance_savings_advice_cache_v1';
const EXPANDED_STORAGE_KEY = 'pa_finance_advice_open';

function isSafeHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function readAdviceCache(): Record<string, CachedAdviceEntry> {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, CachedAdviceEntry>;
  } catch {
    return {};
  }
}

function writeAdviceCache(monthKey: string, entry: CachedAdviceEntry): void {
  try {
    const existing = readAdviceCache();
    existing[monthKey] = entry;
    const keys = Object.keys(existing);
    if (keys.length > 6) {
      keys
        .sort((a, b) =>
          (existing[a]?.generatedAt ?? '').localeCompare(existing[b]?.generatedAt ?? '')
        )
        .slice(0, keys.length - 6)
        .forEach((oldKey) => {
          delete existing[oldKey];
        });
    }
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(existing));
  } catch {
    // ignore storage quota errors
  }
}

function renderInlineBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong
          key={idx}
          className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]"
        >
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function AdviceMarkdownContent({ text }: { text: string }) {
  const blocks = useMemo(() => {
    const lines = text.split('\n');
    const items: Array<
      | { kind: 'heading'; content: string }
      | { kind: 'numbered'; num: string; content: string }
      | { kind: 'bullet'; content: string }
      | { kind: 'paragraph'; content: string }
    > = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
      if (headingMatch) {
        items.push({ kind: 'heading', content: headingMatch[1] });
        continue;
      }

      const numberedMatch = line.match(/^(\d+)[.)]\s+(.+)$/);
      if (numberedMatch) {
        items.push({
          kind: 'numbered',
          num: numberedMatch[1],
          content: numberedMatch[2],
        });
        continue;
      }

      const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
      if (bulletMatch) {
        items.push({ kind: 'bullet', content: bulletMatch[1] });
        continue;
      }

      items.push({ kind: 'paragraph', content: line });
    }

    return items;
  }, [text]);

  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-[#334155] dark:text-[#CBD5E1]">
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          return (
            <h3
              key={index}
              className="text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA] pt-1"
            >
              {renderInlineBold(block.content)}
            </h3>
          );
        }

        if (block.kind === 'numbered') {
          return (
            <div
              key={index}
              className="flex items-start gap-3 p-3 rounded-xl bg-[#F8FAFC] dark:bg-[#0B1120]/70 border border-[#E2E8F0]/80 dark:border-[#1E293B]"
            >
              <span className="w-6 h-6 rounded-lg bg-[#EFF6FF] dark:bg-[#172554] text-[#2563EB] dark:text-[#60A5FA] font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                {block.num}
              </span>
              <p className="min-w-0 flex-1">{renderInlineBold(block.content)}</p>
            </div>
          );
        }

        if (block.kind === 'bullet') {
          return (
            <div key={index} className="flex items-start gap-2.5 pl-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
              <p className="min-w-0 flex-1">{renderInlineBold(block.content)}</p>
            </div>
          );
        }

        return (
          <p key={index} className="text-sm text-[#334155] dark:text-[#CBD5E1]">
            {renderInlineBold(block.content)}
          </p>
        );
      })}
    </div>
  );
}

export function MonthlySavingsAdviceCard({
  selectedMonth,
  cycleLabel,
  currency,
  totalIncome,
  totalExpense,
  projectedMonthlyExpense,
  savingsPct,
  categories,
  topExpenses,
}: MonthlySavingsAdviceCardProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(EXPANDED_STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const dataFingerprint = useMemo(() => {
    const catPart = categories
      .slice(0, 6)
      .map((c) => `${c.category}:${c.amount}:${c.budgetLimit ?? 0}`)
      .join('|');
    return `${selectedMonth}::${totalIncome}::${totalExpense}::${catPart}`;
  }, [selectedMonth, totalIncome, totalExpense, categories]);

  const [adviceData, setAdviceData] = useState<AdviceResponseData | null>(() => {
    const cached = readAdviceCache()[selectedMonth];
    if (cached && cached.fingerprint === dataFingerprint) {
      return cached;
    }
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const toggleExpanded = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(EXPANDED_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const fetchAdvice = useCallback(
    async (forceRefresh = false) => {
      if (totalExpense <= 0 && categories.length === 0) {
        setAdviceData(null);
        setError(null);
        return;
      }

      if (!forceRefresh) {
        const cached = readAdviceCache()[selectedMonth];
        if (cached && cached.fingerprint === dataFingerprint) {
          setAdviceData(cached);
          setError(null);
          return;
        }
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/finance/savings-advice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            cycleLabel,
            monthKey: selectedMonth,
            totalIncome,
            totalExpense,
            projectedMonthlyExpense,
            savingsPct,
            currency,
            categories: categories.slice(0, 10).map((c) => ({
              category: c.category,
              amount: c.amount,
              pct: c.pct,
              budgetLimit: c.budgetLimit,
            })),
            topExpenses: topExpenses.slice(0, 6),
          }),
        });

        const payload = (await res.json()) as Partial<AdviceResponseData> & {
          error?: string;
        };

        if (!res.ok) {
          throw new Error(
            payload.error || 'Չհաջողվեց ստանալ խնայողության խորհուրդները։'
          );
        }

        if (!payload.advice) {
          throw new Error('Սերվերից ստացվել է դատարկ պատասխան։');
        }

        const safeSources = Array.isArray(payload.sources)
          ? payload.sources.filter(
              (s): s is GroundingSource =>
                Boolean(s?.uri) &&
                typeof s.title === 'string' &&
                isSafeHttpUrl(s.uri)
            )
          : [];

        const normalized: AdviceResponseData = {
          advice: payload.advice,
          sources: safeSources,
          searchQueries: Array.isArray(payload.searchQueries)
            ? payload.searchQueries.filter((q): q is string => typeof q === 'string')
            : [],
          generatedAt: payload.generatedAt || new Date().toISOString(),
        };

        writeAdviceCache(selectedMonth, {
          ...normalized,
          fingerprint: dataFingerprint,
        });

        if (!controller.signal.aborted) {
          setAdviceData(normalized);
          setError(null);
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError(
          err instanceof Error
            ? err.message
            : 'Հնարավոր չեղավ բեռնել խնայողության խորհուրդները։'
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [
      selectedMonth,
      cycleLabel,
      totalIncome,
      totalExpense,
      projectedMonthlyExpense,
      savingsPct,
      currency,
      categories,
      topExpenses,
      dataFingerprint,
    ]
  );

  useEffect(() => {
    const cached = readAdviceCache()[selectedMonth];
    if (cached && cached.fingerprint === dataFingerprint) {
      setAdviceData(cached);
      setError(null);
      return;
    }

    if (!isExpanded || (totalExpense <= 0 && categories.length === 0)) {
      setAdviceData(null);
      setError(null);
      return;
    }

    void fetchAdvice(false);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [selectedMonth, dataFingerprint, isExpanded, totalExpense, categories.length, fetchAdvice]);

  const top3Categories = categories.slice(0, 3);
  const hasExpenses = totalExpense > 0 || categories.length > 0;

  return (
    <section className="surface-card overflow-hidden">
      <div className="px-5 py-4 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Lightbulb className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-base sm:text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
              Ամսվա խնայողության խորհուրդ
            </h2>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] truncate">
              {cycleLabel} · Google Search-ով հիմնավորված առաջարկներ ընթացիկ ծախսերի հիման վրա
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasExpenses && (
            <button
              type="button"
              onClick={() => {
                if (!isExpanded) setIsExpanded(true);
                void fetchAdvice(true);
              }}
              disabled={loading}
              className="min-h-[34px] px-3 py-1.5 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#2563EB] dark:hover:border-[#3B82F6] disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2563EB] dark:text-[#60A5FA]" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
              )}
              <span>{adviceData ? 'Թարմացնել' : 'Ստանալ խորհուրդ'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleExpanded}
            aria-expanded={isExpanded}
            aria-label={
              isExpanded
                ? 'Թաքցնել խնայողության խորհուրդները'
                : 'Ցույց տալ խնայողության խորհուրդները'
            }
            className="min-h-[34px] px-2.5 py-1 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] text-xs font-medium text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:border-[#CBD5E1] dark:hover:border-[#334155] inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>{isExpanded ? 'Թաքցնել' : 'Ցույց տալ'}</span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="px-5 pb-5 sm:px-6 sm:pb-6 pt-3.5 border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-4">
          {!hasExpenses ? (
            <EmptyStatePlaceholder
              compact
              icon={Lightbulb}
              title="Այս ամսում գրանցված ծախսեր դեռ չկան"
              description="Ավելացրեք ծախսեր՝ ձեր ծախսային կառուցվածքին հարմարեցված խնայողության խորհուրդներ ստանալու համար։"
            />
          ) : (
            <>
              {/* Expense context summary strip */}
              {top3Categories.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-[#64748B] dark:text-[#94A3B8] font-medium">
                    Հիմնական ծախսեր՝
                  </span>
                  {top3Categories.map((cat) => (
                    <span
                      key={cat.category}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F1F5F9] dark:bg-[#162033] text-[#0F172A] dark:text-[#F8FAFC] font-medium tabular-nums"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span>{cat.category}</span>
                      <span className="font-mono text-[#64748B] dark:text-[#94A3B8]">
                        {formatMoney(cat.amount, currency)} ({cat.pct}%)
                      </span>
                    </span>
                  ))}
                </div>
              )}

              {loading && (
                <div className="space-y-3 py-1" aria-busy="true">
                  <div className="flex items-center gap-2 text-xs text-[#2563EB] dark:text-[#60A5FA] font-medium">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>
                      Վերլուծում ենք ընթացիկ ամսվա ծախսերը և որոնում օգտակար խորհուրդներ Google Search-ով...
                    </span>
                  </div>
                  <Skeleton className="h-4 w-3/4 rounded-lg" />
                  <div className="space-y-2.5">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 rounded-xl border border-[#E2E8F0]/70 dark:border-[#1E293B]"
                      >
                        <Skeleton className="w-6 h-6 rounded-lg shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3.5 w-4/5 rounded-md" />
                          <Skeleton className="h-3 w-3/5 rounded-md" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Skeleton className="h-6 w-28 rounded-lg" />
                    <Skeleton className="h-6 w-32 rounded-lg" />
                  </div>
                </div>
              )}

              {!loading && error && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void fetchAdvice(true)}
                    className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium transition-colors cursor-pointer shrink-0"
                  >
                    Կրկին փորձել
                  </button>
                </div>
              )}

              {!loading && !error && adviceData && (
                <div className="space-y-4">
                  <AdviceMarkdownContent text={adviceData.advice} />

                  {/* Google Search Grounding Sources & Queries */}
                  {(adviceData.sources.length > 0 ||
                    adviceData.searchQueries.length > 0) && (
                    <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-2.5">
                      {adviceData.sources.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#64748B] dark:text-[#94A3B8]">
                            <Search className="w-3 h-3" />
                            <span>Աղբյուրներ · Google Search</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {adviceData.sources.map((src) => (
                              <a
                                key={src.uri}
                                href={src.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] text-xs text-[#2563EB] dark:text-[#60A5FA] hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors max-w-[260px]"
                              >
                                <span className="truncate">{src.title}</span>
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {adviceData.searchQueries.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#94A3B8] dark:text-[#64748B]">
                          <span>Որոնումներ՝</span>
                          {adviceData.searchQueries.map((query, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-md bg-[#F1F5F9] dark:bg-[#162033] text-[#475569] dark:text-[#94A3B8]"
                            >
                              {query}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
