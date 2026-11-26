import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Pencil,
  Plus,
  Receipt,
  Star,
  Trash2,
  Wallet,
} from 'lucide-react';
import { BankCard, Currency, Transaction } from '../../types';
import { formatMoney } from '../../data/defaults';
import {
  CARD_SURFACE_CLASSES,
  CARD_TYPE_META,
  computeCardStats,
} from '../../utils/cardBalances';
import { EmptyStatePlaceholder } from '../ui/Skeleton';

interface CardsSectionProps {
  cards: BankCard[];
  transactions: Transaction[];
  currency: Currency;
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
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('pa_finance_cards_open');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const toggleExpanded = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('pa_finance_cards_open', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const cardStats = useMemo(
    () => cards.map((card) => computeCardStats(card, transactions)),
    [cards, transactions]
  );

  const totalCardsBalance = useMemo(
    () => cardStats.reduce((sum, s) => sum + s.currentBalance, 0),
    [cardStats]
  );

  return (
    <section
      aria-label="Քարտեր և դրամապանակներ"
      className="surface-card overflow-hidden"
    >
      <div className="px-4 py-3.5 sm:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-[#EFF6FF] dark:bg-[#172554] text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
            <CreditCard className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <h2 className="font-display text-sm sm:text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Քարտեր և դրամապանակներ
              </h2>
              <span className="text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                · {cards.length} հաշիվ · Ընդհանուր՝{' '}
                <strong
                  className={`font-mono ${
                    totalCardsBalance >= 0
                      ? 'text-[#0F172A] dark:text-[#F8FAFC]'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {formatMoney(totalCardsBalance, currency)}
                </strong>
              </span>
            </div>
            <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              Առանց բանկային կապի · մուտքերն ու ելքերը կառավարվում են ձեռքով
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {cards.length >= 2 && (
            <button
              type="button"
              onClick={() => onOpenTransferModal(selectedCardFilter !== 'all' && selectedCardFilter !== 'unassigned' ? selectedCardFilter : undefined)}
              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] hover:border-[#2563EB] dark:hover:border-[#3B82F6] text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
              <span>Փոխանցել</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenNewCardModal}
            className="min-h-[36px] px-3.5 py-1.5 rounded-xl btn-primary text-xs inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ավելացնել քարտ</span>
          </button>

          <button
            type="button"
            onClick={toggleExpanded}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Թաքցնել քարտերը' : 'Ցույց տալ քարտերը'}
            className="min-h-[36px] px-2.5 py-1 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] text-xs font-medium text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span className="hidden sm:inline">
              {isExpanded ? 'Թաքցնել' : 'Ցույց տալ'}
            </span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 sm:px-6 sm:pb-5 pt-3 border-t border-[#E2E8F0] dark:border-[#1E293B]">
          {cardStats.length === 0 ? (
            <EmptyStatePlaceholder
              compact
              icon={CreditCard}
              title="Ավելացված քարտեր կամ դրամապանակներ չկան"
              description="Ավելացրեք ձեր բանկային քարտը կամ կանխիկ դրամապանակը՝ մուտքերն ու ելքերը ձեռքով հաշվելու համար։"
              actionLabel="+ Ավելացնել քարտ"
              onAction={onOpenNewCardModal}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {cardStats.map(
                ({
                  card,
                  currentBalance,
                  totalIncome,
                  totalExpense,
                  pendingExpense,
                  txCount,
                }) => {
                  const style = CARD_SURFACE_CLASSES[card.color] ?? CARD_SURFACE_CLASSES.blue;
                  const typeMeta = CARD_TYPE_META[card.cardType] ?? CARD_TYPE_META.other;
                  const isFiltered = selectedCardFilter === card.id;

                  return (
                    <div
                      key={card.id}
                      className={`rounded-2xl border overflow-hidden transition-all flex flex-col bg-white dark:bg-[#0F172A] ${
                        isFiltered
                          ? `border-[#2563EB] dark:border-[#3B82F6] ring-2 ${style.ring}`
                          : 'border-[#E2E8F0] dark:border-[#1E293B]'
                      }`}
                    >
                      {/* Visual Card Face */}
                      <div
                        className={`relative bg-gradient-to-br ${style.gradient} p-4 flex flex-col justify-between gap-3.5 shadow-inner`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-7 h-7 rounded-lg bg-white/15 backdrop-blur-xs flex items-center justify-center shrink-0">
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
                                <span className="text-[11px] font-bold uppercase tracking-wider text-white/90">
                                  {typeMeta.shortLabel}
                                </span>
                                {card.isDefault && (
                                  <span className="text-[10px] font-semibold text-white/85">
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

                        <div className="flex items-end justify-between gap-2">
                          <div className="min-w-0">
                            <span className="block text-[10px] uppercase tracking-wider text-white/75">
                              Ընթացիկ բալանս
                            </span>
                            <p className="text-xl sm:text-2xl font-mono font-bold tabular-nums text-white truncate">
                              {formatMoney(currentBalance, currency)}
                            </p>
                          </div>
                          {card.last4 && (
                            <span className="text-xs font-mono tracking-widest text-white/85 shrink-0 tabular-nums">
                              •••• {card.last4}
                            </span>
                          )}
                        </div>

                        <div className="pt-2 border-t border-white/15 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums text-white/85">
                          <span>Սկիզբ՝ {formatMoney(card.initialBalance, currency)}</span>
                          <div className="flex items-center gap-2">
                            {totalIncome > 0 && (
                              <span>+{formatMoney(totalIncome, currency)}</span>
                            )}
                            {totalExpense > 0 && (
                              <span>-{formatMoney(totalExpense, currency)}</span>
                            )}
                            {pendingExpense > 0 && (
                              <span className="text-amber-200">
                                (սպաս. -{formatMoney(pendingExpense, currency)})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Direct Manual Actions Bar */}
                      <div className="p-2.5 flex items-center gap-1.5 bg-[#F8FAFC] dark:bg-[#0B1120]">
                        <button
                          type="button"
                          onClick={() => onQuickCardIncome(card.id)}
                          className="flex-1 min-h-[36px] px-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" />
                          <span>Մուտք</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onQuickCardExpense(card.id)}
                          className="flex-1 min-h-[36px] px-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
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
                          className={`min-h-[36px] px-2.5 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                            isFiltered
                              ? 'border-[#2563EB] bg-[#2563EB] text-white dark:bg-[#3B82F6] dark:border-[#3B82F6] dark:text-[#060B16]'
                              : 'border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB]'
                          }`}
                        >
                          <Receipt className="w-3.5 h-3.5 shrink-0" />
                          <span>{txCount}</span>
                        </button>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
