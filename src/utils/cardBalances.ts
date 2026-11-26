import { BankCard, CardColor, CardType, Transaction } from '../types';

export const INTERNAL_TRANSFER_CATEGORY = 'Քարտերի փոխանցում';

export interface CardComputedStats {
  card: BankCard;
  currentBalance: number;
  totalIncome: number;
  totalExpense: number;
  pendingExpense: number;
  txCount: number;
}

export const CARD_TYPE_META: Record<
  CardType,
  { label: string; shortLabel: string }
> = {
  arca: { label: 'ArCa', shortLabel: 'ArCa' },
  visa: { label: 'Visa', shortLabel: 'VISA' },
  mastercard: { label: 'Mastercard', shortLabel: 'MC' },
  cash: { label: 'Կանխիկ', shortLabel: 'ԿԱՆԽԻԿ' },
  other: { label: 'Այլ քարտ / Հաշիվ', shortLabel: 'ՔԱՐՏ' },
};

export const CARD_COLORS: { id: CardColor; label: string; dotClass: string }[] = [
  { id: 'blue', label: 'Կապույտ', dotClass: 'bg-blue-600' },
  { id: 'emerald', label: 'Կանաչ', dotClass: 'bg-emerald-600' },
  { id: 'purple', label: 'Մանուշակագույն', dotClass: 'bg-violet-600' },
  { id: 'amber', label: 'Ոսկեգույն', dotClass: 'bg-amber-500' },
  { id: 'rose', label: 'Կարմրավուն', dotClass: 'bg-rose-600' },
  { id: 'slate', label: 'Մոխրագույն', dotClass: 'bg-slate-700' },
];

export const CARD_SURFACE_CLASSES: Record<
  CardColor,
  {
    gradient: string;
    ring: string;
    softBg: string;
    softText: string;
  }
> = {
  blue: {
    gradient:
      'from-[#1D4ED8] via-[#2563EB] to-[#1E3A8A] text-white shadow-blue-900/15',
    ring: 'ring-blue-500/50',
    softBg: 'bg-blue-500/12',
    softText: 'text-blue-600 dark:text-blue-400',
  },
  emerald: {
    gradient:
      'from-[#059669] via-[#10B981] to-[#065F46] text-white shadow-emerald-900/15',
    ring: 'ring-emerald-500/50',
    softBg: 'bg-emerald-500/12',
    softText: 'text-emerald-600 dark:text-emerald-400',
  },
  purple: {
    gradient:
      'from-[#6D28D9] via-[#7C3AED] to-[#4C1D95] text-white shadow-violet-900/15',
    ring: 'ring-violet-500/50',
    softBg: 'bg-violet-500/12',
    softText: 'text-violet-600 dark:text-violet-400',
  },
  amber: {
    gradient:
      'from-[#D97706] via-[#F59E0B] to-[#92400E] text-white shadow-amber-900/15',
    ring: 'ring-amber-500/50',
    softBg: 'bg-amber-500/12',
    softText: 'text-amber-600 dark:text-amber-400',
  },
  rose: {
    gradient:
      'from-[#E11D48] via-[#F43F5E] to-[#881337] text-white shadow-rose-900/15',
    ring: 'ring-rose-500/50',
    softBg: 'bg-rose-500/12',
    softText: 'text-rose-600 dark:text-rose-400',
  },
  slate: {
    gradient:
      'from-[#334155] via-[#1E293B] to-[#0F172A] text-white shadow-slate-950/20',
    ring: 'ring-slate-500/50',
    softBg: 'bg-slate-500/12',
    softText: 'text-slate-600 dark:text-slate-300',
  },
};

export const ARMENIAN_BANK_PRESETS: {
  name: string;
  cardType: CardType;
  color: CardColor;
}[] = [
  { name: 'Ամերիաբանկ', cardType: 'visa', color: 'emerald' },
  { name: 'IDBank', cardType: 'visa', color: 'amber' },
  { name: 'Արդշինբանկ', cardType: 'mastercard', color: 'blue' },
  { name: 'Ինեկոբանկ', cardType: 'arca', color: 'slate' },
  { name: 'Evocabank', cardType: 'mastercard', color: 'purple' },
  { name: 'Կոնվերս Բանկ', cardType: 'arca', color: 'rose' },
  { name: 'Idram', cardType: 'other', color: 'amber' },
  { name: 'Կանխիկ դրամապանակ', cardType: 'cash', color: 'emerald' },
];

export function computeCardStats(
  card: BankCard,
  transactions: Transaction[]
): CardComputedStats {
  let totalIncome = 0;
  let totalExpense = 0;
  let pendingExpense = 0;
  let txCount = 0;

  for (const tx of transactions) {
    if (tx.cardId !== card.id) continue;
    txCount += 1;
    if (tx.type === 'income') {
      totalIncome += tx.amount;
    } else if (tx.isPending) {
      pendingExpense += tx.amount;
    } else {
      totalExpense += tx.amount;
    }
  }

  return {
    card,
    currentBalance: card.initialBalance + totalIncome - totalExpense,
    totalIncome,
    totalExpense,
    pendingExpense,
    txCount,
  };
}

export function formatCardLabel(card: BankCard): string {
  return card.last4 ? `${card.name} •••• ${card.last4}` : card.name;
}

export function getDefaultCard(cards: BankCard[]): BankCard | undefined {
  return cards.find((c) => c.isDefault) ?? cards[0];
}
