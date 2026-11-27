import { memo, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CreditCard,
  Loader2,
  RefreshCw,
  Repeat,
  Sparkles,
} from 'lucide-react';
import { Currency, Transaction } from '../../types';
import { formatMoney, formatShortDate } from '../../data/defaults';
import { SectionCard } from '../layout/PagePrimitives';
import { EmptyStatePlaceholder } from '../ui/Skeleton';
import {
  DetectedSubscription,
  SubscriptionMatchReason,
  detectRecurringSubscriptions,
} from '../../utils/subscriptionDetector';
import {
  SubscriptionAnalysisResult,
  analyzeSubscriptionsWithAI,
} from '../../services/smartAi';

interface SubscriptionLeakDetectorProps {
  transactions: Transaction[];
  currency: Currency;
  onOpenAssistant?: (prompt: string) => void;
}

const MATCH_REASON_LABELS: Record<SubscriptionMatchReason, string> = {
  both: 'Կրկնվող ամսական + հայտնի ծառայություն',
  recurring_monthly: 'Կրկնվող ամսական օրինաչափություն',
  keyword: 'Բաժանորդագրության ծառայություն',
};

export const SubscriptionLeakDetector = memo(function SubscriptionLeakDetector({
  transactions,
  currency,
  onOpenAssistant,
}: SubscriptionLeakDetectorProps) {
  const subscriptions: DetectedSubscription[] = useMemo(
    () => detectRecurringSubscriptions(transactions),
    [transactions]
  );

  const totalMonthlySubs = useMemo(
    () => subscriptions.reduce((sum, s) => sum + s.amount, 0),
    [subscriptions]
  );

  const signature = useMemo(
    () =>
      subscriptions
        .map((s) => `${s.id}:${s.amount}:${s.count}:${s.distinctMonths}`)
        .join('|'),
    [subscriptions]
  );

  const [aiAnalysis, setAiAnalysis] = useState<SubscriptionAnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    if (subscriptions.length === 0) {
      setAiAnalysis(null);
      setAiError(null);
      setAiLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    setAiLoading(true);
    setAiError(null);

    analyzeSubscriptionsWithAI({
      subscriptions: subscriptions.map((s) => ({
        title: s.title,
        category: s.category,
        amount: s.amount,
        count: s.count,
        distinctMonths: s.distinctMonths,
        matchReason: s.matchReason,
        latestDate: s.latestDate,
      })),
      totalMonthlySpend: totalMonthlySubs,
      currency,
      signal: controller.signal,
    })
      .then((result) => {
        if (!active) return;
        setAiAnalysis(result);
        setAiLoading(false);
      })
      .catch((err) => {
        if (!active || (err instanceof Error && err.name === 'AbortError')) return;
        setAiError(
          err instanceof Error
            ? err.message
            : 'Չհաջողվեց ստանալ բաժանորդագրությունների AI վերլուծությունը։'
        );
        setAiLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [signature, refreshNonce, currency, subscriptions, totalMonthlySubs]);

  const handleAskAI = () => {
    if (!onOpenAssistant) return;
    const subsSummary = subscriptions
      .map(
        (s) =>
          `${s.title} (${formatMoney(s.amount, currency)}, ${s.distinctMonths} ամիս)`
      )
      .join(', ');
    onOpenAssistant(
      `Վերլուծիր իմ հայտնաբերված բաժանորդագրությունները և ծախսերի արտահոսքերը (Subscriptions & Leaks): Ընդհանուր ամսական գումարը՝ ${formatMoney(totalMonthlySubs, currency)} են։ Ցանկ՝ ${subsSummary}. Տուր խորհուրդ, թե որոնք արժե վերանայել կամ չեղարկել։`
    );
  };

  return (
    <SectionCard
      title="Բաժանորդագրությունների և ծախսերի արտահոսքի հայտնաբերում"
      subtitle="Ամբողջ պատմության սկանավորում՝ կրկնվող ամսական վճարումները և ծառայությունները գտնելու համար"
      icon={CreditCard}
      headerRight={
        subscriptions.length > 0 && (
          <span className="pa-sensitive text-xs font-mono font-semibold tabular-nums text-amber-600 dark:text-amber-400">
            Ընդհանուր՝ {formatMoney(totalMonthlySubs, currency)}/ամիս
          </span>
        )
      }
    >
      <div className="space-y-4">
        {subscriptions.length === 0 ? (
          <EmptyStatePlaceholder
            compact
            icon={CreditCard}
            title="Կրկնվող բաժանորդագրություններ չեն հայտնաբերվել"
            description="Երբ գրանցեք Netflix, Spotify, Cloud կամ տարբեր ամիսներում կրկնվող նմանատիպ ծախսեր, համակարգը ավտոմատ կհայտնաբերի դրանք։"
          />
        ) : (
          <>
            {/* Gemini AI Smart Recommendation Card */}
            <div className="rounded-2xl border border-[#BFDBFE] dark:border-[#1E3A8A]/80 bg-[#EFF6FF]/75 dark:bg-[#172554]/35 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-lg bg-[#2563EB]/12 dark:bg-[#3B82F6]/20 text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#1D4ED8] dark:text-[#60A5FA] truncate">
                      Gemini AI խելացի առաջարկ
                    </p>
                    <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                      {subscriptions.length} բաժանորդագրություն ·{' '}
                      <span className="pa-sensitive font-mono tabular-nums">
                        {formatMoney(totalMonthlySubs, currency)}/ամիս
                      </span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setRefreshNonce((n) => n + 1)}
                  disabled={aiLoading}
                  title="Թարմացնել AI վերլուծությունը"
                  aria-label="Թարմացնել AI վերլուծությունը"
                  className="min-h-[30px] min-w-[30px] px-2 rounded-lg border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB] hover:text-[#2563EB] dark:hover:text-[#60A5FA] inline-flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  {aiLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">Թարմացնել</span>
                </button>
              </div>

              {aiLoading ? (
                <div className="space-y-2 py-1" aria-busy="true">
                  <div className="h-3.5 w-11/12 rounded bg-[#CBD5E1]/60 dark:bg-[#1E293B] animate-pulse" />
                  <div className="h-3.5 w-3/4 rounded bg-[#CBD5E1]/50 dark:bg-[#1E293B] animate-pulse" />
                </div>
              ) : aiError ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300 min-w-0 flex-1">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{aiError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRefreshNonce((n) => n + 1)}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#0F172A] border border-amber-500/35 text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:border-amber-500 cursor-pointer shrink-0"
                  >
                    Կրկին փորձել
                  </button>
                </div>
              ) : aiAnalysis ? (
                <div className="space-y-2.5">
                  <p className="text-xs sm:text-sm font-medium text-[#0F172A] dark:text-[#F8FAFC] leading-relaxed">
                    {aiAnalysis.recommendation}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#475569] dark:text-[#CBD5E1] tabular-nums">
                    {aiAnalysis.cancelCandidate && (
                      <span>
                        Առաջնային թեկնածու՝{' '}
                        <strong className="text-[#0F172A] dark:text-[#F8FAFC]">
                          {aiAnalysis.cancelCandidate}
                        </strong>
                      </span>
                    )}
                    {aiAnalysis.potentialMonthlySavings > 0 && (
                      <span>
                        · Հնարավոր խնայողություն՝{' '}
                        <strong className="pa-sensitive font-mono text-emerald-600 dark:text-emerald-400">
                          +{formatMoney(aiAnalysis.potentialMonthlySavings, currency)}/ամիս
                        </strong>
                      </span>
                    )}
                  </div>
                  {aiAnalysis.tips.length > 0 && (
                    <ul className="space-y-1 pt-1 border-t border-[#BFDBFE]/60 dark:border-[#1E3A8A]/50">
                      {aiAnalysis.tips.map((tip, idx) => (
                        <li
                          key={idx}
                          className="text-[11px] text-[#475569] dark:text-[#CBD5E1] flex items-start gap-1.5"
                        >
                          <span className="text-[#2563EB] dark:text-[#60A5FA] font-bold">
                            ·
                          </span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>

            {/* Detected Recurring Subscriptions List */}
            <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B] border border-[#E2E8F0] dark:border-[#1E293B] rounded-2xl overflow-hidden bg-white dark:bg-[#0B1120]">
              {subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#F8FAFC] dark:hover:bg-[#11192B] transition-colors"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Repeat
                        className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA] shrink-0"
                        aria-hidden="true"
                      />
                      <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                        {sub.title}
                      </p>
                    </div>
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums truncate">
                      {sub.category} · {MATCH_REASON_LABELS[sub.matchReason]} · {sub.count} անգամ
                      {sub.distinctMonths > 1 ? ` (${sub.distinctMonths} ամիս)` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <p className="pa-sensitive font-mono text-sm font-bold text-rose-600 dark:text-rose-400">
                      -{formatMoney(sub.amount, currency)}
                    </p>
                    <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                      Վերջին՝ {formatShortDate(sub.latestDate)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {onOpenAssistant && (
              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={handleAskAI}
                  className="min-h-[36px] px-4 py-2 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] hover:border-[#2563EB] dark:hover:border-[#3B82F6] text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Bot className="w-4 h-4" />
                  <span>Խորը քննարկել AI օգնականի հետ</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </SectionCard>
  );
});
