import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  TrendingUp,
} from 'lucide-react';
import { Currency } from '../../types';
import { formatMoney } from '../../data/defaults';
import {
  BudgetForecastSummary,
  CategoryBudgetForecast,
} from '../../utils/budgetForecast';
import { SectionCard } from '../layout/PagePrimitives';

interface BudgetForecastWarningStripProps {
  forecast: BudgetForecastSummary;
  currency: Currency;
  onOpenBudgetsPage?: () => void;
  showNavigateButton?: boolean;
}

function formatCategoryRiskPreview(
  items: CategoryBudgetForecast[],
  currency: Currency
): string {
  const top = items.slice(0, 2).map((item) => {
    const overage =
      item.status === 'exceeded'
        ? item.spentSoFar - item.limit
        : item.projectedOverage;
    return `${item.category} (+${formatMoney(Math.max(0, overage), currency)})`;
  });
  const rest = items.length - top.length;
  return rest > 0 ? `${top.join(', ')} և ևս ${rest}` : top.join(', ');
}

export function BudgetForecastWarningStrip({
  forecast,
  currency,
  onOpenBudgetsPage,
  showNavigateButton = true,
}: BudgetForecastWarningStripProps) {
  const [expanded, setExpanded] = useState(false);

  if (!forecast.hasBudgets) return null;
  if (!forecast.hasWarning && forecast.overallStatus !== 'caution') return null;

  const atRiskList = [
    ...forecast.exceededCategories,
    ...forecast.atRiskCategories,
  ];
  const isExceeded = forecast.overallStatus === 'exceeded';
  const isWarning = forecast.hasWarning;

  const surfaceTone = isExceeded
    ? 'bg-rose-500/[0.06] dark:bg-rose-500/[0.09]'
    : isWarning
      ? 'bg-amber-500/[0.07] dark:bg-amber-500/[0.09]'
      : 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06]';

  const iconTone = isExceeded
    ? 'text-rose-600 dark:text-rose-400'
    : 'text-amber-600 dark:text-amber-400';

  const titleTone = isExceeded
    ? 'text-rose-700 dark:text-rose-300'
    : 'text-amber-800 dark:text-amber-300';

  const headline = isExceeded
    ? `Բյուջեի կանխատեսում · Սահմանաչափը գերազանցված է (${forecast.exceededCategories.length} կատեգորիա)`
    : isWarning
      ? `Բյուջեի կանխատեսում · Ցիկլի ավարտին սպասվում է գերծախս`
      : `Բյուջեի կանխատեսում · Մոտենում եք սահմանաչափին`;

  const detailLine =
    atRiskList.length > 0
      ? `Վտանգված կատեգորիաներ՝ ${formatCategoryRiskPreview(atRiskList, currency)} · Կանխատեսվող ընդհանուր ծախս՝ ${formatMoney(forecast.totalProjected, currency)} / ${formatMoney(forecast.totalLimit, currency)}`
      : `Ընդհանուր կանխատեսվող ծախսը (${formatMoney(forecast.totalProjected, currency)}) ${
          forecast.willExceedOverall
            ? `գերազանցում է սահմանաչափը ${formatMoney(forecast.totalProjectedOverage, currency)}-ով`
            : `կազմում է սահմանաչափի ${forecast.overallProjectedPct}%-ը`
        }`;

  const displayCategories =
    atRiskList.length > 0 ? atRiskList : forecast.nearLimitCategories;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`border-t border-[#E2E8F0]/80 dark:border-[#1B2538] ${surfaceTone}`}
    >
      <div className="px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${iconTone}`} />
          <div className="min-w-0 space-y-0.5">
            <p className={`text-xs font-semibold ${titleTone}`}>{headline}</p>
            <p className="pa-sensitive text-[11px] sm:text-xs text-[#475569] dark:text-[#CBD5E1] tabular-nums">
              {detailLine}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">
          {displayCategories.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[#CBD5E1]/90 dark:border-[#26334D] bg-white/80 dark:bg-[#0D1422] text-[11px] font-medium text-[#334155] dark:text-[#CBD5E1] hover:border-[#2563EB] dark:hover:border-[#3B82F6] inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>{expanded ? 'Փակել' : `Մանրամասն (${displayCategories.length})`}</span>
              {expanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          {showNavigateButton && onOpenBudgetsPage && (
            <button
              type="button"
              onClick={onOpenBudgetsPage}
              className="min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#1D4ED8] dark:text-[#60A5FA] hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <span>Բյուջե</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {expanded && displayCategories.length > 0 && (
        <div className="px-4 sm:px-6 pb-3.5 pt-1 border-t border-[#E2E8F0]/60 dark:border-[#1B2538]/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {displayCategories.map((item) => {
            const itemExceeded = item.status === 'exceeded';
            const overAmount = itemExceeded
              ? item.spentSoFar - item.limit
              : item.projectedOverage;
            return (
              <div
                key={item.category}
                className="px-3 py-2 rounded-xl border border-[#E2E8F0]/90 dark:border-[#1B2538] bg-white/90 dark:bg-[#0D1422] space-y-1 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                    {item.category}
                  </span>
                  <span
                    className={`pa-sensitive font-mono font-semibold tabular-nums whitespace-nowrap ${
                      itemExceeded
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {item.projectedPct}%
                  </span>
                </div>
                <p className="pa-sensitive text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                  Կանխատեսում՝{' '}
                  <strong className="font-mono text-[#0F172A] dark:text-[#F8FAFC]">
                    {formatMoney(item.projectedEndSpent, currency)}
                  </strong>{' '}
                  / {formatMoney(item.limit, currency)}
                  {overAmount > 0 && (
                    <span
                      className={`ml-1 font-mono font-medium ${
                        itemExceeded
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      (+{formatMoney(overAmount, currency)})
                    </span>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface BudgetForecastSectionProps {
  forecast: BudgetForecastSummary;
  currency: Currency;
  cycleLabel: string;
}

export function BudgetForecastSection({
  forecast,
  currency,
  cycleLabel,
}: BudgetForecastSectionProps) {
  if (!forecast.hasBudgets) return null;

  const isExceeded = forecast.overallStatus === 'exceeded';
  const isWarning = forecast.hasWarning;
  const isCaution = forecast.overallStatus === 'caution';

  const statusTone = isExceeded
    ? 'text-rose-600 dark:text-rose-400'
    : isWarning || isCaution
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-emerald-600 dark:text-emerald-400';

  const statusText = isExceeded
    ? 'Սահմանաչափը գերազանցված է'
    : isWarning
      ? `Սպասվում է +${formatMoney(forecast.totalProjectedOverage, currency)} գերծախս`
      : isCaution
        ? 'Մոտ է սահմանաչափին'
        : 'Բյուջեի սահմաններում է';

  const StatusIcon = isExceeded || isWarning || isCaution ? AlertTriangle : CheckCircle2;

  return (
    <SectionCard
      title="Բյուջեի կանխատեսում (Ցիկլի ավարտին)"
      subtitle={`${cycleLabel} · անցել է ${forecast.elapsedDays}/${forecast.totalDays} օր · ընթացիկ տեմպի հիման վրա`}
      icon={TrendingUp}
      headerRight={
        <span
          className={`pa-sensitive inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums ${statusTone}`}
        >
          <StatusIcon className="w-3.5 h-3.5 shrink-0" />
          <span>{statusText}</span>
        </span>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#E2E8F0] dark:divide-[#1E293B]">
          <div className="py-2 sm:pr-4">
            <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              Արդեն ծախսված (բյուջետավորված)
            </span>
            <p className="pa-sensitive font-mono text-base font-bold text-[#0F172A] dark:text-[#F8FAFC] mt-0.5 tabular-nums">
              {formatMoney(forecast.totalSpent, currency)}
            </p>
          </div>
          <div className="py-2 sm:px-4">
            <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              Կանխատեսվող ընդհանուր
            </span>
            <p
              className={`pa-sensitive font-mono text-base font-bold mt-0.5 tabular-nums ${
                forecast.willExceedOverall
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-[#2563EB] dark:text-[#60A5FA]'
              }`}
            >
              {formatMoney(forecast.totalProjected, currency)} ({forecast.overallProjectedPct}%)
            </p>
          </div>
          <div className="py-2 sm:pl-4">
            <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              Ընդհանուր սահմանաչափ
            </span>
            <p className="pa-sensitive font-mono text-base font-bold text-[#475569] dark:text-[#CBD5E1] mt-0.5 tabular-nums">
              {formatMoney(forecast.totalLimit, currency)}
            </p>
          </div>
        </div>

        <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B] border-t border-[#E2E8F0] dark:border-[#1E293B]">
          {forecast.categories.map((item) => {
            const actualWidth = Math.min(100, Math.max(item.currentPct, item.spentSoFar > 0 ? 3 : 0));
            const projectedTotalWidth = Math.min(
              100,
              Math.max(actualWidth, item.projectedPct)
            );
            const projectedExtraWidth = Math.max(0, projectedTotalWidth - actualWidth);

            const itemTone =
              item.status === 'exceeded'
                ? 'text-rose-600 dark:text-rose-400'
                : item.status === 'projected_exceed' || item.status === 'near_limit'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400';

            const actualBarTone =
              item.status === 'exceeded'
                ? 'bg-rose-500'
                : item.status === 'projected_exceed' || item.status === 'near_limit'
                  ? 'bg-[#2563EB] dark:bg-[#3B82F6]'
                  : 'bg-emerald-500';

            const projectedBarTone =
              item.status === 'exceeded' || item.status === 'projected_exceed'
                ? 'bg-rose-400/60 dark:bg-rose-400/50'
                : 'bg-amber-400/65 dark:bg-amber-400/50';

            const itemStatusLabel =
              item.status === 'exceeded'
                ? `Գերազանցված է +${formatMoney(item.spentSoFar - item.limit, currency)}`
                : item.status === 'projected_exceed'
                  ? `Կգերազանցի +${formatMoney(item.projectedOverage, currency)}-ով`
                  : item.status === 'near_limit'
                    ? `Մոտ է սահմանին (${item.projectedPct}%)`
                    : `Կայուն տեմպ (${item.projectedPct}%)`;

            return (
              <div key={item.category} className="py-3.5 last:pb-0 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                        {item.category}
                      </p>
                      <span className={`pa-sensitive text-xs font-semibold tabular-nums ${itemTone}`}>
                        · {itemStatusLabel}
                      </span>
                    </div>
                    <p className="pa-sensitive text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums mt-0.5">
                      Օրական տեմպ՝{' '}
                      <span className="font-mono">
                        {formatMoney(Math.round(item.dailyPace), currency)}
                      </span>
                      <span aria-hidden="true"> · </span>
                      <span>
                        Մնացած օրերի անվտանգ սահման՝{' '}
                        <span className="font-mono font-medium text-[#0F172A] dark:text-[#E2E8F0]">
                          {formatMoney(item.recommendedDailyAllowance, currency)}/օր
                        </span>
                      </span>
                    </p>
                  </div>

                  <div className="text-right tabular-nums shrink-0">
                    <p className="pa-sensitive text-xs sm:text-sm font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                      Կանխատեսում՝ {formatMoney(item.projectedEndSpent, currency)}
                    </p>
                    <p className="pa-sensitive text-[11px] font-mono text-[#64748B] dark:text-[#94A3B8]">
                      Փաստացի՝ {formatMoney(item.spentSoFar, currency)} /{' '}
                      {formatMoney(item.limit, currency)}
                    </p>
                  </div>
                </div>

                <div className="h-2 w-full rounded-full bg-[#E2E8F0] dark:bg-[#1E293B] overflow-hidden flex">
                  <div
                    className={`h-full transition-all duration-300 ${actualBarTone}`}
                    style={{ width: `${actualWidth}%` }}
                  />
                  {projectedExtraWidth > 0 && (
                    <div
                      className={`h-full transition-all duration-300 ${projectedBarTone}`}
                      style={{ width: `${projectedExtraWidth}%` }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}
