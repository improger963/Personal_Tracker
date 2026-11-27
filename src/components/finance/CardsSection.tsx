import { useMemo } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Pencil,
  Plus,
  Receipt,
  Star,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  MetricStrip,
  PageHeader,
  PageShell,
  SectionCard,
} from '../layout/PagePrimitives';
import { EmptyStatePlaceholder } from '../ui/Skeleton';
import { BankCard, Currency, Transaction } from '../../types';
import { formatMoney } from '../../data/defaults';
import {
  CARD_SURFACE_CLASSES,
  CARD_TYPE_META,
  FxRatesToAmd,
  computeCardStats,
  convertToAMD,
  formatCardMoney,
} from '../../utils/cardBalances';

interface CardsSectionProps {
  cards: BankCard[];
  transactions: Transaction[];
  currency: Currency;
  fxRates?: FxRatesToAmd | null;
  selectedCardFilter: string;
  onSelectCardFilter: (cardId: string) => void;
  onOpenNewCardModal: () => void;
  onEditCard: (card: BankCard) => void;
  onDeleteCard: (cardId: string) => void;
  onSetDefaultCard: (cardId: string) => void;
  onQuickCardIncome: (cardId: string) => void;
  onQuickCardExpense: (cardId: string) => void;
  onOpenTransferModal: (fromCardId?: string) => void;
}

export function CardsSection({
  cards,
  transactions,
  currency,
  fxRates,
  selectedCardFilter,
  onSelectCardFilter,
  onOpenNewCardModal,
  onEditCard,
  onDeleteCard,
  onSetDefaultCard,
  onQuickCardIncome,
  onQuickCardExpense,
  onOpenTransferModal,
}: CardsSectionProps) {
  const cardStats = useMemo(
    () => cards.map((card) => computeCardStats(card, transactions, fxRates)),
    [cards, transactions, fxRates]
  );

  const { totalCardsBalance, totalInflow, totalOutflow } = useMemo(() => {
    let bal = 0;
    let inc = 0;
    let exp = 0;
    for (const s of cardStats) {
      bal += s.currentBalanceAMD;
      inc += convertToAMD(s.totalIncome, s.currency, fxRates);
      exp += convertToAMD(s.totalExpense, s.currency, fxRates);
    }
    return { totalCardsBalance: bal, totalInflow: inc, totalOutflow: exp };
  }, [cardStats, fxRates]);

  return (
    <PageShell>
      <PageHeader
        title="Քարտեր և դրամապանակներ"
        subtitle="Առանց բանկային կապի · մուտքերը, ելքերը և ներքին փոխանցումները կառավարվում են ձեռքով"
        actions={
          <>
            {cards.length >= 2 && (
              <button
                type="button"
                onClick={() =>
                  onOpenTransferModal(
                    selectedCardFilter !== 'all' &&
                      selectedCardFilter !== 'unassigned'
                      ? selectedCardFilter
                      : undefined
                  )
                }
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] hover:border-[#2563EB] dark:hover:border-[#3B82F6] text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                <span>Փոխանցել</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenNewCardModal}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl btn-primary text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ավելացնել քարտ</span>
            </button>
          </>
        }
      />

      <MetricStrip
        items={[
          {
            id: 'cards-total-balance',
            label: 'Ընդհանուր բալանս',
            value: formatMoney(totalCardsBalance, currency),
            tone: totalCardsBalance >= 0 ? 'default' : 'negative',
            sensitive: true,
          },
          {
            id: 'cards-count',
            label: 'Հաշիվների քանակ',
            value: String(cards.length),
            hint: cards.find((c) => c.isDefault)?.name ?? 'Քարտեր և կանխիկ',
            tone: 'accent',
          },
          {
            id: 'cards-inflow',
            label: 'Ընդհանուր մուտքեր',
            value: `+${formatMoney(totalInflow, currency)}`,
            tone: 'positive',
            sensitive: true,
          },
          {
            id: 'cards-outflow',
            label: 'Ընդհանուր ելքեր',
            value: `-${formatMoney(totalOutflow, currency)}`,
            tone: 'negative',
            sensitive: true,
          },
        ]}
      />

      {cardStats.length === 0 ? (
        <SectionCard>
          <EmptyStatePlaceholder
            compact
            icon={CreditCard}
            title="Ավելացված քարտեր կամ դրամապանակներ չկան"
            description="Ավելացրեք ձեր բանկային քարտը կամ կանխիկ դրամապանակը՝ մուտքերն ու ելքերը ձեռքով հաշվելու համար։"
            actionLabel="+ Ավելացնել քարտ"
            onAction={onOpenNewCardModal}
          />
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {cardStats.map(
            ({
              card,
              currency: cardCurrency,
              currentBalance,
              currentBalanceAMD,
              totalIncome,
              totalExpense,
              pendingExpense,
              txCount,
            }) => {
              const style =
                CARD_SURFACE_CLASSES[card.color] ?? CARD_SURFACE_CLASSES.blue;
              const typeMeta =
                CARD_TYPE_META[card.cardType] ?? CARD_TYPE_META.other;
              const isFiltered = selectedCardFilter === card.id;

              return (
                <article
                  key={card.id}
                  className={`surface-card overflow-hidden flex flex-col ${
                    isFiltered
                      ? `border-[#2563EB] dark:border-[#3B82F6] ring-2 ${style.ring}`
                      : ''
                  }`}
                >
                  {/* Visual Card Face */}
                  <div
                    className={`relative overflow-hidden bg-gradient-to-br ${style.gradient} p-5 flex flex-col justify-between gap-4 ring-1 ring-inset ring-white/15`}
                  >
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/[0.08] blur-2xl"
                    />
                    <div className="relative flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 rounded-lg bg-white/12 border border-white/15 backdrop-blur-xs flex items-center justify-center shrink-0">
                          {card.cardType === 'cash' ? (
                            <Banknote className="w-4 h-4 text-white" />
                          ) : card.cardType === 'other' ? (
                            <Wallet className="w-4 h-4 text-white" />
                          ) : (
                            <CreditCard className="w-4 h-4 text-white" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold tracking-wide text-white/85">
                              {typeMeta.shortLabel}
                            </span>
                            {cardCurrency !== 'AMD' && (
                              <span className="text-[11px] font-mono font-semibold text-white/85">
                                · {cardCurrency}
                              </span>
                            )}
                            {card.isDefault && (
                              <span className="text-[11px] font-medium text-white/75">
                                · Հիմնական
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-display font-semibold text-white truncate">
                            {card.name}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        {!card.isDefault && (
                          <button
                            type="button"
                            onClick={() => onSetDefaultCard(card.id)}
                            title="Դարձնել հիմնական քարտ"
                            aria-label={`Դարձնել ${card.name} հիմնական`}
                            className="min-h-[30px] min-w-[30px] rounded-lg flex items-center justify-center text-white/75 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                          >
                            <Star className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onEditCard(card)}
                          title="Խմբագրել քարտը"
                          aria-label={`Խմբագրել ${card.name}`}
                          className="min-h-[30px] min-w-[30px] rounded-lg flex items-center justify-center text-white/75 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteCard(card.id)}
                          title="Ջնջել քարտը"
                          aria-label={`Ջնջել ${card.name}`}
                          className="min-h-[30px] min-w-[30px] rounded-lg flex items-center justify-center text-white/75 hover:text-white hover:bg-rose-500/40 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="relative flex items-end justify-between gap-2 pt-1">
                      <div className="min-w-0">
                        <span className="block text-[11px] text-white/70">
                          Ընթացիկ բալանս
                        </span>
                        <p className="pa-sensitive mt-0.5 text-xl sm:text-2xl font-mono font-semibold tracking-tight tabular-nums text-white truncate">
                          {formatCardMoney(currentBalance, cardCurrency)}
                        </p>
                        {cardCurrency !== 'AMD' && (
                          <span className="pa-sensitive block text-[11px] font-mono text-white/75 tabular-nums mt-0.5">
                            ≈ {formatMoney(currentBalanceAMD, currency)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {card.cardType !== 'cash' && (
                          <svg
                            viewBox="0 0 32 24"
                            className="w-7 h-5 text-amber-200/75"
                            aria-hidden="true"
                          >
                            <rect
                              x="1"
                              y="1"
                              width="30"
                              height="22"
                              rx="4"
                              fill="currentColor"
                              fillOpacity="0.22"
                              stroke="currentColor"
                              strokeOpacity="0.5"
                              strokeWidth="1.2"
                            />
                            <path
                              d="M1 9h10M21 9h10M1 15h10M21 15h10M11 1v22M21 1v22"
                              stroke="currentColor"
                              strokeOpacity="0.45"
                              strokeWidth="1"
                            />
                          </svg>
                        )}
                        {card.last4 && (
                          <span className="text-xs font-mono tracking-widest text-white/85 tabular-nums">
                            •••• {card.last4}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pa-sensitive relative pt-2.5 border-t border-white/15 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums text-white/80">
                      <span>Սկիզբ՝ {formatCardMoney(card.initialBalance, cardCurrency)}</span>
                      <div className="flex items-center gap-2">
                        {totalIncome > 0 && (
                          <span>+{formatCardMoney(totalIncome, cardCurrency)}</span>
                        )}
                        {totalExpense > 0 && (
                          <span>-{formatCardMoney(totalExpense, cardCurrency)}</span>
                        )}
                        {pendingExpense > 0 && (
                          <span className="text-amber-200">
                            (սպաս. -{formatCardMoney(pendingExpense, cardCurrency)})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Direct Manual Actions Bar */}
                  <div className="p-3 flex flex-wrap items-center gap-1.5 bg-[#F8FAFC]/80 dark:bg-[#090F1B]">
                    <button
                      type="button"
                      onClick={() => onQuickCardIncome(card.id)}
                      className="flex-1 min-h-[40px] sm:min-h-[36px] px-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" />
                      <span>Մուտք</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onQuickCardExpense(card.id)}
                      className="flex-1 min-h-[40px] sm:min-h-[36px] px-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                      <span>Ելք</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onSelectCardFilter(isFiltered ? 'all' : card.id)
                      }
                      aria-pressed={isFiltered}
                      title="Զտել մատյանը այս քարտով"
                      className={`min-h-[40px] sm:min-h-[36px] px-2.5 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                        isFiltered
                          ? 'border-[#2563EB] bg-[#2563EB] text-white dark:bg-[#3B82F6] dark:border-[#3B82F6] dark:text-[#060B16]'
                          : 'border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB]'
                      }`}
                    >
                      <Receipt className="w-3.5 h-3.5 shrink-0" />
                      <span>{txCount}</span>
                    </button>
                  </div>
                </article>
              );
            }
          )}
        </div>
      )}
    </PageShell>
  );
}
