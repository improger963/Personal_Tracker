import { BankCard, CardColor, CardCurrency, CardType, Transaction } from '../types';

export const INTERNAL_TRANSFER_CATEGORY = 'Քարտերի փոխանցում';

export const CARD_CURRENCIES: CardCurrency[] = ['AMD', 'USD', 'EUR', 'RUB', 'GEL'];

export const CARD_CURRENCY_META: Record<
  CardCurrency,
  { symbol: string; label: string; shortLabel: string }
> = {
  AMD: { symbol: '֏', label: 'ՀՀ դրամ (AMD)', shortLabel: 'AMD' },
  USD: { symbol: '$', label: 'ԱՄՆ դոլար (USD)', shortLabel: 'USD' },
  EUR: { symbol: '€', label: 'Եվրո (EUR)', shortLabel: 'EUR' },
  RUB: { symbol: '₽', label: 'Ռուբլի (RUB)', shortLabel: 'RUB' },
  GEL: { symbol: '₾', label: 'Լարի (GEL)', shortLabel: 'GEL' },
};

export const FALLBACK_FX_TO_AMD: Record<CardCurrency, number> = {
  AMD: 1,
  USD: 390,
  EUR: 420,
  RUB: 4.1,
  GEL: 145,
};

export type FxRatesToAmd = Partial<Record<'USD' | 'EUR' | 'RUB' | 'GEL', number>>;

export function normalizeCardCurrency(raw?: unknown): CardCurrency {
  if (raw === 'USD' || raw === 'EUR' || raw === 'RUB' || raw === 'GEL') {
    return raw;
  }
  return 'AMD';
}

export function getRateToAMD(
  currency: CardCurrency | undefined,
  fxRates?: FxRatesToAmd | null
): number {
  const code = normalizeCardCurrency(currency);
  if (code === 'AMD') return 1;
  const live = fxRates?.[code];
  if (typeof live === 'number' && Number.isFinite(live) && live > 0) {
    return live;
  }
  return FALLBACK_FX_TO_AMD[code];
}

export function convertToAMD(
  amount: number,
  currency: CardCurrency | undefined,
  fxRates?: FxRatesToAmd | null
): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * getRateToAMD(currency, fxRates));
}

export function convertFromAMD(
  amountAMD: number,
  targetCurrency: CardCurrency | undefined,
  fxRates?: FxRatesToAmd | null
): number {
  if (!Number.isFinite(amountAMD)) return 0;
  const code = normalizeCardCurrency(targetCurrency);
  if (code === 'AMD') return Math.round(amountAMD);
  const rate = getRateToAMD(code, fxRates);
  if (rate <= 0) return 0;
  return Math.round((amountAMD / rate) * 100) / 100;
}

const AMD_FORMATTER = new Intl.NumberFormat('hy-AM', {
  maximumFractionDigits: 0,
});

const FX_FORMATTER = new Intl.NumberFormat('hy-AM', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatCardMoney(
  amount: number,
  currency: CardCurrency = 'AMD'
): string {
  const code = normalizeCardCurrency(currency);
  const safe = Number.isFinite(amount) ? amount : 0;
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);
  const formatted =
    code === 'AMD'
      ? AMD_FORMATTER.format(Math.round(abs))
      : FX_FORMATTER.format(Math.round(abs * 100) / 100);
  return `${sign}${formatted} ${CARD_CURRENCY_META[code].symbol}`;
}

export interface CardComputedStats {
  card: BankCard;
  currency: CardCurrency;
  currentBalance: number;
  currentBalanceAMD: number;
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

export function getTxAmountInCardCurrency(
  tx: Transaction,
  cardCurrency: CardCurrency,
  fxRates?: FxRatesToAmd | null
): number {
  const code = normalizeCardCurrency(cardCurrency);
  if (code === 'AMD') return tx.amount;
  if (
    typeof tx.cardAmount === 'number' &&
    Number.isFinite(tx.cardAmount) &&
    tx.cardAmount > 0 &&
    (!tx.cardCurrency || tx.cardCurrency === code)
  ) {
    return tx.cardAmount;
  }
  return convertFromAMD(tx.amount, code, fxRates);
}

export function computeCardStats(
  card: BankCard,
  transactions: Transaction[],
  fxRates?: FxRatesToAmd | null
): CardComputedStats {
  const currency = normalizeCardCurrency(card.currency);
  let totalIncome = 0;
  let totalExpense = 0;
  let pendingExpense = 0;
  let txCount = 0;

  for (const tx of transactions) {
    if (tx.cardId !== card.id) continue;
    txCount += 1;
    const nativeAmount = getTxAmountInCardCurrency(tx, currency, fxRates);
    if (tx.type === 'income') {
      totalIncome += nativeAmount;
    } else if (tx.isPending) {
      pendingExpense += nativeAmount;
    } else {
      totalExpense += nativeAmount;
    }
  }

  const rawBalance =
    (Number.isFinite(card.initialBalance) ? card.initialBalance : 0) +
    totalIncome -
    totalExpense;
  const currentBalance =
    currency === 'AMD'
      ? Math.round(rawBalance)
      : Math.round(rawBalance * 100) / 100;

  return {
    card: { ...card, currency },
    currency,
    currentBalance,
    currentBalanceAMD: convertToAMD(currentBalance, currency, fxRates),
    totalIncome:
      currency === 'AMD'
        ? Math.round(totalIncome)
        : Math.round(totalIncome * 100) / 100,
    totalExpense:
      currency === 'AMD'
        ? Math.round(totalExpense)
        : Math.round(totalExpense * 100) / 100,
    pendingExpense:
      currency === 'AMD'
        ? Math.round(pendingExpense)
        : Math.round(pendingExpense * 100) / 100,
    txCount,
  };
}

export function formatCardLabel(card: BankCard): string {
  const code = normalizeCardCurrency(card.currency);
  const base = card.last4 ? `${card.name} •••• ${card.last4}` : card.name;
  return code === 'AMD' ? base : `${base} (${code})`;
}

export function getDefaultCard(cards: BankCard[]): BankCard | undefined {
  return cards.find((c) => c.isDefault) ?? cards[0];
}

export function getTotalCardsInitialBalanceAMD(
  cards: BankCard[],
  fxRates?: FxRatesToAmd | null
): number {
  return cards.reduce((sum, card) => {
    const initial = Number.isFinite(card.initialBalance)
      ? card.initialBalance
      : 0;
    return sum + convertToAMD(initial, normalizeCardCurrency(card.currency), fxRates);
  }, 0);
}

export function getTotalCardsInitialBalance(
  cards: BankCard[],
  fxRates?: FxRatesToAmd | null
): number {
  return getTotalCardsInitialBalanceAMD(cards, fxRates);
}

export function getTotalCardsBalanceAMD(
  cards: BankCard[],
  transactions: Transaction[],
  fxRates?: FxRatesToAmd | null
): number {
  return cards.reduce(
    (sum, card) => sum + computeCardStats(card, transactions, fxRates).currentBalanceAMD,
    0
  );
}
