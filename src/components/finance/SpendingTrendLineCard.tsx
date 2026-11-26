import { memo, useMemo, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Currency, Transaction } from '../../types';
import { formatMoney, formatShortDate, getTodayISO } from '../../data/defaults';
import {
  daysBetweenISO,
  formatCycleLabel,
  getCycleBounds,
  getCycleDayMetrics,
  shiftMonthKey,
} from '../../utils/financialCycle';
import { INTERNAL_TRANSFER_CATEGORY } from '../../utils/cardBalances';
import { SectionCard } from '../layout/PagePrimitives';
import { EmptyStatePlaceholder } from '../ui/Skeleton';
import { formatAxisCompact } from './financeShared';

interface SpendingTrendLineCardProps {
  selectedMonth: string;
  effectivePayday: number;
  currency: Currency;
  transactions: Transaction[];
}

interface CycleSpendingTrendPoint {
  dayIndex: number;
  dayLabel: string;
  currentDateLabel: string | null;
  prevDateLabel: string | null;
  currentDaily: number | null;
  prevDaily: number | null;
  currentCumulative: number | null;
  prevCumulative: number | null;
}

type TrendChartMode = 'cumulative' | 'daily';

function addDaysToISO(dateISO: string, deltaDays: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const utc = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + deltaDays));
  const uy = utc.getUTCFullYear();
  const um = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const ud = String(utc.getUTCDate()).padStart(2, '0');
  return `${uy}-${um}-${ud}`;
}

interface TrendTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  currency: Currency;
  mode: TrendChartMode;
}

function SpendingTrendTooltip({
  active,
  payload,
  currency,
  mode,
}: TrendTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as CycleSpendingTrendPoint | undefined;
  if (!point) return null;

  const currVal =
    mode === 'cumulative' ? point.currentCumulative : point.currentDaily;
  const prevVal = mode === 'cumulative' ? point.prevCumulative : point.prevDaily;
  const diff =
    currVal !== null && prevVal !== null ? currVal - prevVal : null;

  return (
    <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] px-3.5 py-2.5 shadow-xl text-xs space-y-1.5 min-w-[210px]">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
          Ցիկլի {point.dayIndex}-րդ օր
        </span>
        <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
          {point.currentDateLabel ?? '—'}
        </span>
      </div>

      <div className="space-y-1 tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-[#475569] dark:text-[#CBD5E1]">
            <span className="w-2.5 h-0.5 rounded-full bg-rose-500" />
            <span>
              Ընթացիկ{point.currentDateLabel ? ` (${point.currentDateLabel})` : ''}
            </span>
          </span>
          <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
            {currVal !== null ? formatMoney(currVal, currency) : '—'}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-[#64748B] dark:text-[#94A3B8]">
            <span className="w-2.5 h-0.5 rounded-full bg-slate-400" />
            <span>
              Նախորդ{point.prevDateLabel ? ` (${point.prevDateLabel})` : ''}
            </span>
          </span>
          <span className="font-mono font-semibold text-[#475569] dark:text-[#CBD5E1]">
            {prevVal !== null ? formatMoney(prevVal, currency) : '—'}
          </span>
        </div>
      </div>

      {diff !== null && (
        <div className="pt-1 border-t border-[#F1F5F9] dark:border-[#1E293B] flex items-center justify-between gap-4 tabular-nums">
          <span className="text-[#64748B] dark:text-[#94A3B8]">Տարբերություն</span>
          <span
            className={`font-mono font-semibold ${
              diff > 0
                ? 'text-rose-600 dark:text-rose-400'
                : diff < 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-[#64748B] dark:text-[#94A3B8]'
            }`}
          >
            {diff > 0 ? '+' : diff < 0 ? '-' : ''}
            {formatMoney(Math.abs(diff), currency)}
          </span>
        </div>
      )}
    </div>
  );
}

export const SpendingTrendLineCard = memo(function SpendingTrendLineCard({
  selectedMonth,
  effectivePayday,
  currency,
  transactions,
}: SpendingTrendLineCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const [mode, setMode] = useState<TrendChartMode>('cumulative');
  const todayISO = getTodayISO();

  const prevMonthKey = useMemo(
    () => shiftMonthKey(selectedMonth, -1),
    [selectedMonth]
  );

  const currentCycleLabel = useMemo(
    () => formatCycleLabel(selectedMonth, effectivePayday),
    [selectedMonth, effectivePayday]
  );
  const prevCycleLabel = useMemo(
    () => formatCycleLabel(prevMonthKey, effectivePayday),
    [prevMonthKey, effectivePayday]
  );

  const {
    chartData,
    todayDayIndex,
    currentTotal,
    prevCycleSamePointTotal,
    prevCycleFullTotal,
    paceDiffPct,
    hasAnyExpenses,
  } = useMemo(() => {
    const currBounds = getCycleBounds(selectedMonth, effectivePayday);
    const prevBounds = getCycleBounds(prevMonthKey, effectivePayday);
    const currMetrics = getCycleDayMetrics(selectedMonth, effectivePayday, todayISO);

    const currDaysCount = Math.max(
      1,
      daysBetweenISO(currBounds.startDate, currBounds.endDate) + 1
    );
    const prevDaysCount = Math.max(
      1,
      daysBetweenISO(prevBounds.startDate, prevBounds.endDate) + 1
    );
    const maxDays = Math.max(currDaysCount, prevDaysCount);

    const currByDate = new Map<string, number>();
    const prevByDate = new Map<string, number>();
    let lastCurrTxISO = '';

    for (const tx of transactions) {
      if (
        tx.type !== 'expense' ||
        tx.isPending ||
        tx.category === INTERNAL_TRANSFER_CATEGORY
      ) {
        continue;
      }
      if (tx.date >= currBounds.startDate && tx.date <= currBounds.endDate) {
        currByDate.set(tx.date, (currByDate.get(tx.date) ?? 0) + tx.amount);
        if (tx.date > lastCurrTxISO) lastCurrTxISO = tx.date;
      } else if (tx.date >= prevBounds.startDate && tx.date <= prevBounds.endDate) {
        prevByDate.set(tx.date, (prevByDate.get(tx.date) ?? 0) + tx.amount);
      }
    }

    const todayIdx = currMetrics.isCurrentCycle ? currMetrics.elapsedDays : null;
    const lastTxIdx = lastCurrTxISO
      ? Math.min(currDaysCount, daysBetweenISO(currBounds.startDate, lastCurrTxISO) + 1)
      : 0;

    const maxPlottedCurrDay = currMetrics.isPastCycle
      ? currDaysCount
      : currMetrics.isCurrentCycle
        ? Math.max(currMetrics.elapsedDays, lastTxIdx)
        : lastTxIdx;

    const points: CycleSpendingTrendPoint[] = [];
    let runningCurr = 0;
    let runningPrev = 0;
    let samePointPrev = 0;

    for (let dayIdx = 1; dayIdx <= maxDays; dayIdx++) {
      const hasCurrDay = dayIdx <= currDaysCount;
      const currDateISO = hasCurrDay
        ? addDaysToISO(currBounds.startDate, dayIdx - 1)
        : null;
      const currDailyRaw = currDateISO ? (currByDate.get(currDateISO) ?? 0) : 0;
      const shouldPlotCurr = hasCurrDay && dayIdx <= maxPlottedCurrDay;

      if (shouldPlotCurr) {
        runningCurr += currDailyRaw;
      }

      const hasPrevDay = dayIdx <= prevDaysCount;
      const prevDateISO = hasPrevDay
        ? addDaysToISO(prevBounds.startDate, dayIdx - 1)
        : null;
      const prevDailyRaw = prevDateISO ? (prevByDate.get(prevDateISO) ?? 0) : 0;

      if (hasPrevDay) {
        runningPrev += prevDailyRaw;
      }

      if (
        (currMetrics.isCurrentCycle && dayIdx === currMetrics.elapsedDays) ||
        (!currMetrics.isCurrentCycle && dayIdx === maxDays)
      ) {
        samePointPrev = runningPrev;
      }

      points.push({
        dayIndex: dayIdx,
        dayLabel: `${dayIdx}`,
        currentDateLabel: currDateISO ? formatShortDate(currDateISO) : null,
        prevDateLabel: prevDateISO ? formatShortDate(prevDateISO) : null,
        currentDaily: shouldPlotCurr ? currDailyRaw : null,
        prevDaily: hasPrevDay ? prevDailyRaw : null,
        currentCumulative: shouldPlotCurr ? runningCurr : null,
        prevCumulative: hasPrevDay ? runningPrev : null,
      });
    }

    const currSum = runningCurr;
    const prevSum = runningPrev;
    const comparisonBase = currMetrics.isCurrentCycle ? samePointPrev : prevSum;
    const pct =
      comparisonBase > 0
        ? Math.round(((currSum - comparisonBase) / comparisonBase) * 100)
        : null;

    return {
      chartData: points,
      todayDayIndex: todayIdx,
      currentTotal: currSum,
      prevCycleSamePointTotal: comparisonBase,
      prevCycleFullTotal: prevSum,
      paceDiffPct: pct,
      hasAnyExpenses: currSum > 0 || prevSum > 0,
    };
  }, [transactions, selectedMonth, prevMonthKey, effectivePayday, todayISO]);

  const paceDeltaAmount = currentTotal - prevCycleSamePointTotal;

  return (
    <SectionCard
      title="Ամսական ծախսերի միտումը նախորդ ցիկլի համեմատ"
      subtitle={`${currentCycleLabel} · համեմատություն ${prevCycleLabel}-ի հետ`}
      icon={paceDeltaAmount <= 0 ? TrendingDown : TrendingUp}
      headerRight={
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center p-0.5 rounded-xl surface-subtle text-xs">
            {(
              [
                { id: 'cumulative', label: 'Կուտակային' },
                { id: 'daily', label: 'Օրական' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMode(opt.id)}
                className={`min-h-[30px] px-2.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  mode === opt.id
                    ? 'bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                    : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4 text-[#475569] dark:text-[#CBD5E1]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 rounded-full bg-rose-500" />
              <span>Ընթացիկ ցիկլ</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-[#64748B] dark:text-[#94A3B8]">
              <span className="w-3 border-t-2 border-dashed border-slate-400" />
              <span>Նախորդ ցիկլ</span>
            </span>
          </div>

          {hasAnyExpenses && (
            <div className="flex flex-wrap items-center gap-3 tabular-nums">
              <span className="text-[#64748B] dark:text-[#94A3B8]">
                Նույն պահին նախորդ ցիկլում՝{' '}
                <strong className="pa-sensitive font-mono text-[#0F172A] dark:text-[#F8FAFC]">
                  {formatMoney(prevCycleSamePointTotal, currency)}
                </strong>
              </span>
              {prevCycleFullTotal > 0 && paceDiffPct !== null && (
                <>
                  <span aria-hidden="true" className="text-[#CBD5E1] dark:text-[#334155]">
                    ·
                  </span>
                  <span
                    className={`pa-sensitive font-mono font-semibold ${
                      paceDeltaAmount > 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : paceDeltaAmount < 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-[#64748B] dark:text-[#94A3B8]'
                    }`}
                  >
                    {paceDeltaAmount > 0 ? '+' : paceDeltaAmount < 0 ? '-' : ''}
                    {formatMoney(Math.abs(paceDeltaAmount), currency)} (
                    {paceDiffPct > 0 ? '+' : ''}
                    {paceDiffPct}%)
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {!hasAnyExpenses ? (
          <EmptyStatePlaceholder
            compact
            icon={TrendingUp}
            title="Համեմատելու համար ծախսեր դեռ գրանցված չեն"
            description="Ավելացրեք ծախսեր ընթացիկ կամ նախորդ ցիկլում՝ ամսական միտումը գծապատկերում տեսնելու համար։"
            className="h-[210px]"
          />
        ) : (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height={220} minWidth={0}>
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 12, left: -8, bottom: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  className="text-[#E2E8F0] dark:text-[#1E293B]"
                />
                <XAxis
                  dataKey="dayIndex"
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                  tickFormatter={(day: number) => `Օր ${day}`}
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  className="text-[#64748B] dark:text-[#94A3B8] font-mono"
                  dy={6}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={54}
                  tickFormatter={formatAxisCompact}
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  className="text-[#94A3B8] dark:text-[#64748B] font-mono"
                />
                {todayDayIndex !== null && (
                  <ReferenceLine
                    x={todayDayIndex}
                    stroke="#2563EB"
                    strokeDasharray="4 4"
                    strokeOpacity={0.55}
                  />
                )}
                <Tooltip
                  cursor={{
                    stroke: '#3B82F6',
                    strokeWidth: 1,
                    strokeDasharray: '4 4',
                  }}
                  content={({ active, payload }) => (
                    <SpendingTrendTooltip
                      active={active}
                      payload={payload}
                      currency={currency}
                      mode={mode}
                    />
                  )}
                />
                <Line
                  type="monotone"
                  dataKey={
                    mode === 'cumulative' ? 'prevCumulative' : 'prevDaily'
                  }
                  name="Նախորդ ցիկլ"
                  stroke="#94A3B8"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  activeDot={{ r: 4, fill: '#94A3B8', stroke: '#FFFFFF', strokeWidth: 1.5 }}
                  connectNulls={false}
                  isAnimationActive={!prefersReducedMotion}
                  animationDuration={500}
                  animationEasing="ease-out"
                />
                <Line
                  type="monotone"
                  dataKey={
                    mode === 'cumulative' ? 'currentCumulative' : 'currentDaily'
                  }
                  name="Ընթացիկ ցիկլ"
                  stroke="#F43F5E"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: '#F43F5E', stroke: '#FFFFFF', strokeWidth: 2 }}
                  connectNulls={false}
                  isAnimationActive={!prefersReducedMotion}
                  animationDuration={580}
                  animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </SectionCard>
  );
});
