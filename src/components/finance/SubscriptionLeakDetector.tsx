import { memo, useMemo } from 'react';
import { AlertCircle, CreditCard, ExternalLink, Sparkles, Trash2 } from 'lucide-react';
import { Currency, Transaction } from '../../types';
import { formatMoney } from '../../data/defaults';
import { SectionCard } from '../layout/PagePrimitives';
import { EmptyStatePlaceholder } from '../ui/Skeleton';

interface SubscriptionLeakDetectorProps {
  transactions: Transaction[];
  currency: Currency;
  onOpenAssistant?: (prompt: string) => void;
}

interface DetectedSubscription {
  title: string;
  category: string;
  amount: number;
  count: number;
  latestDate: string;
}

const KNOWN_SUBSCRIPTION_KEYWORDS = [
  'netflix',
  'spotify',
  'youtube',
  'apple',
  'icloud',
  'chatgpt',
  'openai',
  'telegram',
  'prime',
  'disney',
  'hulu',
  'subscription',
  'bաժանորդագրություն',
  'ինտերնետ',
  'հեռուստա',
  'cloud',
  'hosting',
  'domain',
];

export const SubscriptionLeakDetector = memo(function SubscriptionLeakDetector({
  transactions,
  currency,
  onOpenAssistant,
}: SubscriptionLeakDetectorProps) {
  const subscriptions = useMemo(() => {
    const groups = new Map<string, { amount: number; count: number; category: string; latestDate: string }>();

    for (const tx of transactions) {
      if (tx.type !== 'expense' || tx.isPending) continue;
      const lowerTitle = tx.title.toLowerCase();
      const isSuspect = KNOWN_SUBSCRIPTION_KEYWORDS.some((kw) => lowerTitle.includes(kw)) || tx.category.toLowerCase().includes('ծառայություն');
      if (!isSuspect) continue;

      const key = lowerTitle.trim();
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          amount: tx.amount,
          count: 1,
          category: tx.category,
          latestDate: tx.date,
        });
      } else {
        existing.count += 1;
        if (tx.date > existing.latestDate) {
          existing.latestDate = tx.date;
          existing.amount = tx.amount;
        }
      }
    }

    const list: DetectedSubscription[] = Array.from(groups.entries()).map(([title, stats]) => ({
      title: title.charAt(0).toUpperCase() + title.slice(1),
      category: stats.category,
      amount: stats.amount,
      count: stats.count,
      latestDate: stats.latestDate,
    }));

    return list.sort((a, b) => b.amount - a.amount);
  }, [transactions]);

  const totalMonthlySubs = useMemo(
    () => subscriptions.reduce((sum, s) => sum + s.amount, 0),
    [subscriptions]
  );

  const handleAskAI = () => {
    if (!onOpenAssistant) return;
    const subsSummary = subscriptions.map((s) => `${s.title} (${formatMoney(s.amount, currency)})`).join(', ');
    onOpenAssistant(
      `Վերլուծիր իմ հայտնաբերված բաժանորդագրությունները և ծախսերի արտահոսքերը (Subscriptions & Leaks): Ընդհանուր ամսական գումարը՝ ${formatMoney(totalMonthlySubs, currency)} են։ Ցանկ՝ ${subsSummary}. Տուր խորհուրդ, թե որոնք արժե վերանայել կամ չեղարկել։`
    );
  };

  return (
    <SectionCard
      title="Բաժանորդագրությունների և ծախսերի արտահոսքի հայտնաբերում"
      subtitle="Ավտոմատ սկանավորում՝ հայտնաբերելու կրկնվող ամսական ծառայությունները և բաժանորդագրությունները"
      icon={CreditCard}
      headerRight={
        subscriptions.length > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-amber-500/12 text-amber-600 dark:text-amber-400 text-xs font-bold tabular-nums">
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
            description="Երբ գրանցեք Netflix, Spotify, iCloud կամ նմանատիպ ամսական ծախսեր, համակարգը ավտոմատ կհայտնաբերի դրանք։"
          />
        ) : (
          <>
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4 space-y-2">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                    Հայտնաբերվել է {subscriptions.length} ակտիվ բաժանորդագրություն
                  </p>
                  <p className="text-xs text-[#475569] dark:text-[#CBD5E1] leading-relaxed">
                    Դուք ամսական ծախսում եք մոտ <strong className="font-mono">{formatMoney(totalMonthlySubs, currency)}</strong> կրկնվող ծառայությունների վրա։ Ստուգեք, թե արդյոք բոլորն են ակտիվորեն օգտագործվում։
                  </p>
                </div>
              </div>
            </div>

            <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B] border border-[#E2E8F0] dark:border-[#1E293B] rounded-2xl overflow-hidden bg-white dark:bg-[#0B1120]">
              {subscriptions.map((sub) => (
                <div
                  key={sub.title}
                  className="px-4.5 py-3.5 flex items-center justify-between gap-3 hover:bg-[#F8FAFC] dark:hover:bg-[#11192B] transition-colors"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                      {sub.title}
                    </p>
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                      {sub.category} · Գրանցվել է {sub.count} անգամ
                    </p>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <p className="pa-sensitive font-mono text-sm font-extrabold text-rose-600 dark:text-rose-400">
                      -{formatMoney(sub.amount, currency)}
                    </p>
                    <p className="text-[10px] text-[#64748B] dark:text-[#94A3B8]">
                      Վերջին՝ {sub.latestDate}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {onOpenAssistant && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleAskAI}
                  className="min-h-[36px] px-4 py-2 rounded-xl btn-primary text-xs font-bold inline-flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Վերլուծել բաժանորդագրությունները AI-ի միջոցով</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </SectionCard>
  );
});
