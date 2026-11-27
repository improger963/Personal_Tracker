import { memo, useMemo, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { PieChart as PieChartIcon, RotateCcw } from 'lucide-react';
import { BankCard, BudgetLimit, Currency, CustomCategory, Transaction } from '../../types';
import { formatMoney } from '../../data/defaults';
import {
  INTERNAL_TRANSFER_CATEGORY,
  formatCardLabel,
} from '../../utils/cardBalances';
import { buildCategoryColorMap } from '../../utils/customCategories';
import { SectionCard } from '../layout/PagePrimitives';
import { EmptyStatePlaceholder } from '../ui/Skeleton';
import {
  CategoryDonutPoint,
  CategoryDonutTooltip,
  DONUT_COLORS,
} from './financeShared';

interface SpendingByCategoryPieCardProps {
  cycleLabel: string;
  currency: Currency;
  monthTransactions: Transaction[];
  budgets?: BudgetLimit[];
  cards?: BankCard[];
  customCategories?: CustomCategory[];
  selectedCardFilter?: string;
  activeCategoryFilter?: string;
  onSelectCategory?: (category: string) => void;
  onClearCategoryFilter?: () => void;
  onAddExpense?: () => void;
}

interface CategoryPieSegment extends CategoryDonutPoint {
  txCount: number;
}

type PieVariant = 'pie' | 'donut';

export const SpendingByCategoryPieCard = memo(function SpendingByCategoryPieCard({
  cycleLabel,
  currency,
  monthTransactions,
  budgets = [],
  cards = [],
  customCategories = [],
  selectedCardFilter = 'all',
  activeCategoryFilter = 'all',
  onSelectCategory,
  onClearCategoryFilter,
  onAddExpense,
}: SpendingByCategoryPieCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const [chartVariant, setChartVariant] = useState<PieVariant>('pie');
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  const customColorMap = useMemo(
    () => buildCategoryColorMap(customCategories),
    [customCategories]
  );

  const activeCardLabel = useMemo(() => {
    if (selectedCardFilter === 'all') return null;
    if (selectedCardFilter === 'unassigned') return 'Առանց քարտի';
    const found = cards.find((c) => c.id === selectedCardFilter);
    return found ? formatCardLabel(found) : null;
  }, [selectedCardFilter, cards]);

  const { segments, totalSpent, totalTxCount, pendingTotal } = useMemo(() => {
    const byCat = new Map<string, { amount: number; count: number }>();
    let confirmedSum = 0;
    let confirmedCount = 0;
    let pendingSum = 0;

    for (const tx of monthTransactions) {
      if (tx.type !== 'expense' || tx.category === INTERNAL_TRANSFER_CATEGORY) {
        continue;
      }
      if (selectedCardFilter === 'unassigned' && tx.cardId) continue;
      if (
        selectedCardFilter !== 'all' &&
        selectedCardFilter !== 'unassigned' &&
        tx.cardId !== selectedCardFilter
      ) {
        continue;
      }

      if (tx.isPending) {
        pendingSum += tx.amount;
        continue;
      }

      confirmedSum += tx.amount;
      confirmedCount += 1;
      const prev = byCat.get(tx.category);
      if (prev) {
        prev.amount += tx.amount;
        prev.count += 1;
      } else {
        byCat.set(tx.category, { amount: tx.amount, count: 1 });
      }
    }

    const sorted = Array.from(byCat.entries()).sort(
      (a, b) => b[1].amount - a[1].amount
    );

    const budgetByCat = new Map(budgets.map((b) => [b.category, b.limit]));

    const list: CategoryPieSegment[] = sorted.map(([category, stats], idx) => ({
      category,
      amount: stats.amount,
      txCount: stats.count,
      pct: confirmedSum > 0 ? Math.round((stats.amount / confirmedSum) * 100) : 0,
      color: customColorMap[category] || DONUT_COLORS[idx % DONUT_COLORS.length],
      budgetLimit: budgetByCat.get(category),
    }));

    return {
      segments: list,
      totalSpent: confirmedSum,
      totalTxCount: confirmedCount,
      pendingTotal: pendingSum,
    };
  }, [monthTransactions, budgets, selectedCardFilter, customColorMap]);

  const focusedCategory =
    hoveredCategory ??
    (activeCategoryFilter !== 'all' ? activeCategoryFilter : null);

  const focusedSegment = useMemo(
    () =>
      focusedCategory
        ? segments.find((s) => s.category === focusedCategory) ?? null
        : null,
    [focusedCategory, segments]
  );

  const topSegment = segments[0] ?? null;

  const subtitleParts = [
    activeCardLabel ?? cycleLabel,
    `${segments.length} կատեգորիա`,
    `${totalTxCount} ծախս`,
  ];

  return (
    <SectionCard
      className="h-full flex flex-col"
      bodyClassName="flex-1 flex flex-col"
      title="Ծախսեր ըստ կատեգորիայի"
      subtitle={subtitleParts.join(' · ')}
      icon={PieChartIcon}
      headerRight={
        <div className="flex items-center gap-2">
          {activeCategoryFilter !== 'all' && onClearCategoryFilter && (
            <button
              type="button"
              onClick={onClearCategoryFilter}
              aria-label="Մաքրել կատեգորիայի զտիչը"
              className="min-h-[30px] px-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-[11px] font-medium text-[#2563EB] dark:text-[#60A5FA] inline-flex items-center gap-1 hover:border-[#2563EB] transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Բոլորը</span>
            </button>
          )}
          <div className="inline-flex items-center p-0.5 rounded-xl surface-subtle text-xs">
            {(
              [
                { id: 'pie', label: 'Կարկանդակ' },
                { id: 'donut', label: 'Օղակ' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setChartVariant(opt.id)}
                className={`min-h-[30px] px-2.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  chartVariant === opt.id
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
      {segments.length === 0 ? (
        <EmptyStatePlaceholder
          compact
          icon={PieChartIcon}
          title={
            activeCardLabel
              ? `${activeCardLabel} քարտով ծախսեր դեռ չկան`
              : 'Այս ցիկլում հաստատված ծախսեր դեռ չկան'
          }
          description={
            pendingTotal > 0
              ? `Գրանցված է ${formatMoney(pendingTotal, currency)} նախածախս, որը կերևա հաստատելուց հետո։`
              : 'Ավելացրեք ծախսեր՝ կատեգորիաների տոկոսային բաշխումը տեսնելու համար։'
          }
          actionLabel={onAddExpense ? '+ Ավելացնել ծախս' : undefined}
          onAction={onAddExpense}
          className="h-full min-h-[220px]"
        />
      ) : (
        <div className="space-y-4 flex-1 flex flex-col justify-between">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs tabular-nums">
            <div className="text-[#64748B] dark:text-[#94A3B8]">
              <span>Ընդհանուր ծախս՝ </span>
              <strong className="pa-sensitive font-mono text-[#0F172A] dark:text-[#F8FAFC]">
                {formatMoney(totalSpent, currency)}
              </strong>
            </div>
            {topSegment && (
              <div className="text-[#64748B] dark:text-[#94A3B8] truncate max-w-full">
                <span>Առաջատար՝ </span>
                <strong className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  {topSegment.category}
                </strong>{' '}
                <span className="font-mono">({topSegment.pct}%)</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
            <div className="sm:col-span-5 relative h-[200px] w-full">
              <ResponsiveContainer width="100%" height={200} minWidth={0}>
                <PieChart>
                  <Pie
                    data={segments}
                    dataKey="amount"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={chartVariant === 'pie' ? 0 : 52}
                    outerRadius={82}
                    paddingAngle={segments.length > 1 ? 2 : 0}
                    cornerRadius={3}
                    stroke="none"
                    isAnimationActive={!prefersReducedMotion}
                    animationBegin={40}
                    animationDuration={540}
                    animationEasing="ease-out"
                    onMouseLeave={() => setHoveredCategory(null)}
                  >
                    {segments.map((seg) => {
                      const isDimmed =
                        focusedCategory !== null &&
                        focusedCategory !== seg.category;
                      return (
                        <Cell
                          key={seg.category}
                          fill={seg.color}
                          fillOpacity={isDimmed ? 0.3 : 1}
                          onMouseEnter={() => setHoveredCategory(seg.category)}
                          onClick={() => onSelectCategory?.(seg.category)}
                          className="cursor-pointer transition-opacity duration-150 focus:outline-none"
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => (
                      <CategoryDonutTooltip
                        active={active}
                        payload={payload}
                        currency={currency}
                      />
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>

              {chartVariant === 'donut' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3 pointer-events-none">
                  <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate max-w-[96px]">
                    {focusedSegment ? focusedSegment.category : 'Ընդհանուր'}
                  </span>
                  <span className="pa-sensitive text-xs sm:text-sm font-bold font-mono tabular-nums text-[#0F172A] dark:text-[#F8FAFC] mt-0.5">
                    {formatMoney(
                      focusedSegment ? focusedSegment.amount : totalSpent,
                      currency
                    )}
                  </span>
                  {focusedSegment && (
                    <span className="text-[10px] font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8]">
                      {focusedSegment.pct}%
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="sm:col-span-7 max-h-[212px] overflow-y-auto scroll-container pr-1 divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
              {segments.map((seg) => {
                const isSelected = activeCategoryFilter === seg.category;
                const isDimmed =
                  focusedCategory !== null && focusedCategory !== seg.category;
                const shareWidth =
                  totalSpent > 0
                    ? Math.max(3, Math.round((seg.amount / totalSpent) * 100))
                    : 0;

                return (
                  <button
                    key={seg.category}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelectCategory?.(seg.category)}
                    onMouseEnter={() => setHoveredCategory(seg.category)}
                    onMouseLeave={() => setHoveredCategory(null)}
                    className={`w-full py-2 px-2 rounded-lg text-left transition-all cursor-pointer space-y-1 ${
                      isSelected
                        ? 'bg-[#EFF6FF] dark:bg-[#172554]/50'
                        : 'hover:bg-[#F8FAFC] dark:hover:bg-[#162033]'
                    } ${isDimmed ? 'opacity-45' : 'opacity-100'}`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: seg.color }}
                        />
                        <span
                          className={`truncate font-medium ${
                            isSelected
                              ? 'text-[#1D4ED8] dark:text-[#60A5FA] font-semibold'
                              : 'text-[#0F172A] dark:text-[#F8FAFC]'
                          }`}
                        >
                          {seg.category}
                        </span>
                        <span className="text-[11px] text-[#94A3B8] font-mono tabular-nums shrink-0">
                          · {seg.txCount}
                        </span>
                      </span>

                      <span className="pa-sensitive font-mono tabular-nums text-[#334155] dark:text-[#CBD5E1] shrink-0">
                        {formatMoney(seg.amount, currency)}{' '}
                        <span className="text-[#64748B] dark:text-[#94A3B8]">
                          ({seg.pct}%)
                        </span>
                      </span>
                    </div>

                    <div className="h-1 w-full rounded-full bg-[#F1F5F9] dark:bg-[#1E293B] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${shareWidth}%`,
                          backgroundColor: seg.color,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
            Սեղմեք հատվածի կամ կատեգորիայի վրա՝ ներքևի մատյանը զտելու համար
            {pendingTotal > 0 && (
              <span className="pa-sensitive tabular-nums">
                {' '}
                · չհաստատված նախածախսեր՝ {formatMoney(pendingTotal, currency)}
              </span>
            )}
          </p>
        </div>
      )}
    </SectionCard>
  );
});
