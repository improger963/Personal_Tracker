import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Calculator,
  CalendarPlus,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { SectionCard } from '../layout/PagePrimitives';
import { Currency } from '../../types';
import { EXPENSE_CATEGORIES, formatMoney, getTodayISO } from '../../data/defaults';
import { SafeToSpendMetrics } from '../../utils/financialCycle';

interface PurchaseAffordabilityCardProps {
  currency: Currency;
  safeToSpend: SafeToSpendMetrics;
  cycleLabel: string;
  onAddPendingTransaction?: (tx: {
    type: 'expense';
    amount: number;
    title: string;
    category: string;
    date: string;
    isPending: boolean;
  }) => void;
  onAskAssistant?: (prompt: string) => void;
}

const SIM_PRESETS = [25_000, 50_000, 100_000, 250_000];

export function PurchaseAffordabilityCard({
  currency,
  safeToSpend,
  cycleLabel,
  onAddPendingTransaction,
  onAskAssistant,
}: PurchaseAffordabilityCardProps) {
  const [itemTitle, setItemTitle] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [simMode, setSimMode] = useState<'one_time' | 'installment'>('one_time');
  const [monthsCount, setMonthsCount] = useState('6');
  const [savedFeedback, setSavedFeedback] = useState(false);

  const rawAmount = Math.max(0, Math.round(Number(amountInput) || 0));
  const months = Math.min(36, Math.max(2, Math.round(Number(monthsCount) || 6)));
  const monthlyImpact =
    simMode === 'installment' && rawAmount > 0
      ? Math.ceil(rawAmount / months)
      : rawAmount;

  const analysis = useMemo(() => {
    const freeBefore = safeToSpend.freeFunds;
    const dailyBefore = safeToSpend.dailyAllowance;
    const days = Math.max(1, safeToSpend.remainingDaysInclusive);
    const freeAfter = freeBefore - monthlyImpact;
    const dailyAfter = Math.max(0, Math.floor(freeAfter / days));
    const dailyDrop = Math.max(0, dailyBefore - dailyAfter);
    const pctOfFree =
      freeBefore > 0 ? Math.round((monthlyImpact / freeBefore) * 100) : 999;

    let status: 'safe' | 'caution' | 'risk' = 'safe';
    let title = 'Հասանելի և անվտանգ գնում է';
    let summary = `Ձեր ազատ միջոցները բավարար են․ օրական սահմանաչափը կկազմի ${formatMoney(dailyAfter, currency)}։`;

    if (freeBefore <= 0 || freeAfter < 0) {
      status = 'risk';
      title = 'Ազատ միջոցները չեն բավարարում';
      summary = `Գնումից հետո կառաջանա ${formatMoney(Math.abs(freeAfter), currency)} պակասուրդ (հաշվի առնելով պարտադիր վճարները)։`;
    } else if (pctOfFree >= 60 || dailyAfter < Math.max(1500, Math.round(dailyBefore * 0.45))) {
      status = 'caution';
      title = 'Սահմանային է ընթացիկ ցիկլի համար';
      summary = `Կսպառի ազատ միջոցների ${pctOfFree}%-ը և օրական սահմանաչափը կնվազեցնի ${formatMoney(dailyDrop, currency)}-ով։`;
    }

    return {
      freeBefore,
      freeAfter,
      dailyBefore,
      dailyAfter,
      dailyDrop,
      pctOfFree,
      status,
      title,
      summary,
    };
  }, [currency, monthlyImpact, safeToSpend]);

  const handleSaveAsPending = () => {
    if (!onAddPendingTransaction || monthlyImpact <= 0) return;
    const label =
      itemTitle.trim() ||
      (simMode === 'installment' ? `Ապառիկ վճար (${months} ամիս)` : 'Պլանավորված գնում');
    onAddPendingTransaction({
      type: 'expense',
      amount: monthlyImpact,
      title: label,
      category: EXPENSE_CATEGORIES.includes('Գնումներ') ? 'Գնումներ' : EXPENSE_CATEGORIES[0],
      date: getTodayISO(),
      isPending: true,
    });
    setSavedFeedback(true);
    window.setTimeout(() => setSavedFeedback(false), 2600);
  };

  const handleConsultAI = () => {
    if (!onAskAssistant || rawAmount <= 0) return;
    const itemLabel = itemTitle.trim() || 'խոշոր գնում';
    const modeDesc =
      simMode === 'installment'
        ? `${formatMoney(rawAmount, currency)} արժեքով (${months} ամսով՝ ամսական ${formatMoney(monthlyImpact, currency)})`
        : `${formatMoney(rawAmount, currency)} միանգամյա վճարմամբ`;
    onAskAssistant(
      `Կարո՞ղ եմ այս ցիկլում (${cycleLabel}) թույլ տալ «${itemLabel}»՝ ${modeDesc}։ Գնահատիր ազդեցությունը իմ ազատ միջոցների, բյուջեի և նպատակների վրա։`
    );
  };

  return (
    <SectionCard
      title="Կարո՞ղ եմ թույլ տալ · Ֆինանսական սիմուլյատոր"
      subtitle="Ստուգեք ցանկացած գնման կամ ապառիկի ազդեցությունը ձեր ազատ մնացորդի և օրական սահմանաչափի վրա"
      icon={Calculator}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-5">
            <label
              htmlFor="sim-item-title"
              className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1.5"
            >
              Գնման նպատակ (ոչ պարտադիր)
            </label>
            <input
              id="sim-item-title"
              type="text"
              value={itemTitle}
              onChange={(e) => setItemTitle(e.target.value)}
              placeholder="Օրինակ՝ Նոթբուք կամ ուղևորություն"
              className="w-full min-h-[42px] px-3.5 py-2 text-sm rounded-xl input-field"
            />
          </div>

          <div className="sm:col-span-4">
            <label
              htmlFor="sim-item-amount"
              className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1.5"
            >
              Արժեք (֏)
            </label>
            <input
              id="sim-item-amount"
              type="number"
              min="1"
              step="any"
              inputMode="numeric"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="150000"
              className="w-full min-h-[42px] px-3.5 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
            />
          </div>

          <div className="sm:col-span-3">
            <span className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1.5">
              Վճարման ձև
            </span>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl surface-subtle min-h-[42px]">
              <button
                type="button"
                onClick={() => setSimMode('one_time')}
                className={`rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  simMode === 'one_time'
                    ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                    : 'text-[#64748B] dark:text-[#94A3B8]'
                }`}
              >
                Միանգամյա
              </button>
              <button
                type="button"
                onClick={() => setSimMode('installment')}
                className={`rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  simMode === 'installment'
                    ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                    : 'text-[#64748B] dark:text-[#94A3B8]'
                }`}
              >
                Ապառիկ
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {SIM_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmountInput(String(preset))}
                className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] hover:border-[#2563EB] dark:hover:border-[#3B82F6] text-[11px] font-mono tabular-nums text-[#475569] dark:text-[#CBD5E1] cursor-pointer transition-colors"
              >
                {formatMoney(preset, currency)}
              </button>
            ))}
          </div>

          {simMode === 'installment' && (
            <label className="inline-flex items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
              <span>Ամիսներ՝</span>
              <input
                type="number"
                min="2"
                max="36"
                value={monthsCount}
                onChange={(e) => setMonthsCount(e.target.value)}
                className="w-16 min-h-[32px] px-2 py-1 text-xs font-mono tabular-nums rounded-lg input-field text-center"
              />
              {rawAmount > 0 && (
                <span className="pa-sensitive font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
                  = {formatMoney(monthlyImpact, currency)}/ամիս
                </span>
              )}
            </label>
          )}
        </div>

        {rawAmount > 0 && (
          <div
            className={`rounded-xl border p-4 space-y-3 ${
              analysis.status === 'safe'
                ? 'border-emerald-500/30 bg-emerald-500/8'
                : analysis.status === 'caution'
                  ? 'border-amber-500/35 bg-amber-500/8'
                  : 'border-rose-500/35 bg-rose-500/8'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {analysis.status === 'safe' ? (
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : analysis.status === 'caution' ? (
                <AlertTriangle className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-4.5 h-4.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  {analysis.title}
                </p>
                <p className="pa-sensitive text-xs text-[#475569] dark:text-[#CBD5E1] leading-relaxed tabular-nums">
                  {analysis.summary}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-black/8 dark:border-white/10">
              <div className="min-w-0">
                <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Ազատ միջոցներ (հիմա)
                </p>
                <p className="pa-sensitive font-mono text-xs sm:text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums truncate">
                  {formatMoney(analysis.freeBefore, currency)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Գնումից հետո
                </p>
                <p
                  className={`pa-sensitive font-mono text-xs sm:text-sm font-semibold tabular-nums truncate ${
                    analysis.freeAfter >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {formatMoney(analysis.freeAfter, currency)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Օրական լիմիտ (հետո)
                </p>
                <p className="pa-sensitive font-mono text-xs sm:text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums truncate">
                  {formatMoney(analysis.dailyAfter, currency)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Ծանրաբեռնվածություն
                </p>
                <p className="pa-sensitive font-mono text-xs sm:text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums truncate">
                  {analysis.pctOfFree > 200 ? '>200%' : `${analysis.pctOfFree}%`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {onAddPendingTransaction && (
                <button
                  type="button"
                  onClick={handleSaveAsPending}
                  className="min-h-[34px] px-3 py-1.5 rounded-xl bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#26334D] text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#2563EB] dark:hover:border-[#3B82F6] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <CalendarPlus className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                  <span>
                    {savedFeedback ? 'Պահպանվեց որպես նախածախս ✓' : 'Պահել որպես նախածախս'}
                  </span>
                </button>
              )}
              {onAskAssistant && (
                <button
                  type="button"
                  onClick={handleConsultAI}
                  className="min-h-[34px] px-3 py-1.5 rounded-xl btn-primary text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>Խորհրդակցել AI-ի հետ</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
