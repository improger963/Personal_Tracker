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
      'from-[#1E3A8A] via-[#1D4ED8] to-[#0F172A] text-white',
    ring: 'ring-blue-500/45',
    softBg: 'bg-blue-500/12',
    softText: 'text-blue-600 dark:text-blue-400',
  },
  emerald: {
    gradient:
      'from-[#065F46] via-[#047857] to-[#022C22] text-white',
    ring: 'ring-emerald-500/45',
    softBg: 'bg-emerald-500/12',
    softText: 'text-emerald-600 dark:text-emerald-400',
  },
  purple: {
    gradient:
      'from-[#312E81] via-[#4338CA] to-[#1E1B4B] text-white',
    ring: 'ring-indigo-500/45',
    softBg: 'bg-indigo-500/12',
    softText: 'text-indigo-600 dark:text-indigo-400',
  },
  amber: {
    gradient:
      'from-[#92400E] via-[#B45309] to-[#451A03] text-white',
    ring: 'ring-amber-500/45',
    softBg: 'bg-amber-500/12',
    softText: 'text-amber-600 dark:text-amber-400',
  },
  rose: {
    gradient:
      'from-[#881337] via-[#BE123C] to-[#4C0519] text-white',
    ring: 'ring-rose-500/45',
    softBg: 'bg-rose-500/12',
    softText: 'text-rose-600 dark:text-rose-400',
  },
  slate: {
    gradient:
      'from-[#1E293B] via-[#0F172A] to-[#020617] text-white',
    ring: 'ring-slate-500/45',
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
