import { useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  Clock,
  Plus,
  Receipt,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { EmptyStatePlaceholder } from '../ui/Skeleton';
import { SwipeableTransactionRow } from './SwipeableTransactionRow';
import {
  Currency,
  IncomeKind,
  PrimaryIncomeConfig,
  Transaction,
  TransactionType,
} from '../../types';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  INCOME_KINDS,
  formatMoney,
  getTodayISO,
  getTransactionIncomeKind,
} from '../../data/defaults';
import { TxSortMode } from './financeShared';
import { findAutoCategorizableTransactions } from '../../utils/transactionAutoCategory';

interface TransactionsLedgerPageProps {
  selectedMonth: string;
  effectivePayday: number;
  currency: Currency;
  monthTransactions: Transaction[];
  allTransactions: Transaction[];
  onOpenNewTransactionModal: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onAutoCategorizeTransactions?: (
    updates: Array<{ id: string; category: string; incomeKind?: IncomeKind }>
  ) => void;
  onDeleteTransaction: (id: string) => void;
  onConfirmPreExpense: (id: string) => void;
  realBalance: number;
  totalIncome: number;
  totalExpense: number;
  pendingExpense?: number;
  openingBalance: number;
  incomeDeltaPct: number | null;
  expenseDeltaPct: number | null;
  hasCurrentPrimaryCredited: boolean;
  isCurrentCycle: boolean;
  primaryIncome: PrimaryIncomeConfig;
  onManualCreditPrimaryIncome: () => void;
}

export function TransactionsLedgerPage({
  currency,
  monthTransactions,
  allTransactions,
  onOpenNewTransactionModal,
  onEditTransaction,
  onAutoCategorizeTransactions,
  onDeleteTransaction,
  onConfirmPreExpense,
  realBalance,
  totalIncome,
  totalExpense,
  pendingExpense = 0,
  openingBalance,
  incomeDeltaPct,
  expenseDeltaPct,
  hasCurrentPrimaryCredited,
  isCurrentCycle,
  primaryIncome,
  onManualCreditPrimaryIncome,
}: TransactionsLedgerPageProps) {
  const todayISO = getTodayISO();
  const [openSwipeTxId, setOpenSwipeTxId] = useState<string | null>(null);

  // Filtering & Sorting state
  const [filterType, setFilterType] = useState<'all' | TransactionType | 'pending'>('all');
  const [filterIncomeKind, setFilterIncomeKind] = useState<'all' | IncomeKind>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterDateMode, setFilterDateMode] = useState<'all' | 'specific' | 'range'>('all');
  const [filterDateSpecific, setFilterDateSpecific] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [txSort, setTxSort] = useState<TxSortMode>('date-desc');

  // Search state & real-time suggestions
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const allCategories = Array.from(
    new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])
  );

  const pendingCount = monthTransactions.filter(
    (t) => t.type === 'expense' && t.isPending
  ).length;

  const searchSuggestions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const titlesSet = new Set<string>();
    const categoriesSet = new Set<string>();
    const amountsSet = new Set<string>();

    allTransactions.forEach((t) => {
      if (t.title) titlesSet.add(t.title);
      if (t.category) categoriesSet.add(t.category);
      if (t.amount) amountsSet.add(String(t.amount));
    });

    const allTitles = Array.from(titlesSet);
    const allCats = Array.from(categoriesSet);
    const allAmts = Array.from(amountsSet);

    if (!q) {
      return {
        titles: allTitles.slice(-6),
        categories: allCats.slice(-5),
        amounts: allAmts.slice(-4),
      };
    }

    return {
      titles: allTitles.filter((t) => t.toLowerCase().includes(q)).slice(0, 5),
      categories: allCats.filter((c) => c.toLowerCase().includes(q)).slice(0, 4),
      amounts: allAmts.filter((a) => a.includes(q)).slice(0, 4),
    };
  }, [allTransactions, searchQuery]);

  const hasSuggestions =
    searchSuggestions.titles.length > 0 ||
    searchSuggestions.categories.length > 0 ||
    searchSuggestions.amounts.length > 0;

  const autoCategorizableItems = useMemo(
    () => findAutoCategorizableTransactions(monthTransactions, allTransactions),
    [monthTransactions, allTransactions]
  );

  const hasActiveFilters =
    filterType !== 'all' ||
    filterIncomeKind !== 'all' ||
    filterCategory !== 'all' ||
    filterDateMode !== 'all' ||
    searchQuery.trim() !== '';

  const clearLedgerFilters = () => {
    setFilterType('all');
    setFilterIncomeKind('all');
    setFilterCategory('all');
    setFilterDateMode('all');
    setFilterDateSpecific('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchQuery('');
  };

  const filteredTransactions = [...monthTransactions]
    .filter((t) => {
      if (filterType === 'all') return true;
      if (filterType === 'pending') return t.type === 'expense' && t.isPending;
      return t.type === filterType;
    })
    .filter((t) => {
      if (filterType !== 'income' || filterIncomeKind === 'all') return true;
      return getTransactionIncomeKind(t) === filterIncomeKind;
    })
    .filter((t) =>
      filterCategory === 'all' ? true : t.category === filterCategory
    )
    .filter((t) => {
      if (filterDateMode === 'specific' && filterDateSpecific) {
        return t.date === filterDateSpecific;
      }
      if (filterDateMode === 'range') {
        if (filterDateFrom && t.date < filterDateFrom) return false;
        if (filterDateTo && t.date > filterDateTo) return false;
      }
      return true;
    })
    .filter((t) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = t.title.toLowerCase().includes(q);
      const catMatch = t.category.toLowerCase().includes(q);
      const amountStr = String(t.amount);
      const amountMatch =
        amountStr.includes(q) ||
        (Number(q) > 0 && Math.abs(t.amount - Number(q)) < 1);
      return titleMatch || catMatch || amountMatch;
    })
    .sort((a, b) => {
      if (txSort === 'amount-desc') return b.amount - a.amount;
      if (txSort === 'amount-asc') return a.amount - b.amount;
      return b.date.localeCompare(a.date);
    });

  const filteredNet = filteredTransactions.reduce(
    (sum, t) => sum + (t.type === 'income' ? t.amount : t.isPending ? 0 : -t.amount),
    0
  );

  return (
    <div className="space-y-6">
      {/* Compact Quick Summary Strip */}
      <section className="surface-card p-4 sm:p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E2E8F0] dark:divide-[#1E293B]">
          <div className="min-w-0">
            <span className="text-[11px] font-medium text-[#2563EB] dark:text-[#60A5FA]">
              Իրական բալանս
            </span>
            <p
              className={`text-xl sm:text-2xl font-display font-bold tabular-nums truncate mt-0.5 ${
                realBalance >= 0
                  ? 'text-[#0F172A] dark:text-[#F8FAFC]'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {realBalance > 0 ? '+' : ''}
              {formatMoney(realBalance, currency)}
            </p>
          </div>

          <div className="min-w-0 sm:pl-4 pt-3 sm:pt-0">
            <span className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
              Ամսվա եկամուտ
            </span>
            <p className="text-xl sm:text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums truncate mt-0.5">
              +{formatMoney(totalIncome, currency)}
            </p>
            {incomeDeltaPct !== null && (
              <span
                className={`text-[10px] font-medium tabular-nums ${
                  incomeDeltaPct >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {incomeDeltaPct >= 0 ? '+' : ''}
                {incomeDeltaPct}% նախ. ցիկլից
              </span>
            )}
          </div>

          <div className="min-w-0 sm:pl-4 pt-3 sm:pt-0">
            <span className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
              Ամսվա ծախս
            </span>
            <p className="text-xl sm:text-2xl font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums truncate mt-0.5">
              -{formatMoney(totalExpense, currency)}
            </p>
            {pendingExpense > 0 ? (
              <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1 tabular-nums mt-0.5 truncate">
                <Clock className="w-2.5 h-2.5 shrink-0" />
                <span>Սպասվող նախածախս՝ {formatMoney(pendingExpense, currency)}</span>
              </p>
            ) : expenseDeltaPct !== null ? (
              <span
                className={`text-[10px] font-medium tabular-nums ${
                  expenseDeltaPct <= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {expenseDeltaPct >= 0 ? '+' : ''}
                {expenseDeltaPct}% նախ. ցիկլից
              </span>
            ) : null}
          </div>

          <div className="min-w-0 sm:pl-4 pt-3 sm:pt-0 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                Նախորդ մնացորդ
              </span>
              <p className="text-base sm:text-lg font-mono font-semibold tabular-nums truncate text-[#475569] dark:text-[#CBD5E1] mt-0.5">
                {openingBalance > 0 ? '+' : ''}
                {formatMoney(openingBalance, currency)}
              </p>
            </div>
            {isCurrentCycle && primaryIncome.enabled && !hasCurrentPrimaryCredited && (
              <button
                type="button"
                onClick={onManualCreditPrimaryIncome}
                className="mt-1.5 self-start text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Գրանցել աշխատավարձը</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Full-Width Transactions Ledger */}
      <section className="surface-card overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-[#E2E8F0] dark:border-[#1E293B] flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Type Switcher with Pre-Expenses */}
            <div className="inline-flex items-center gap-1 p-1 rounded-xl surface-subtle max-w-full overflow-x-auto">
              {(
                [
                  { id: 'all', label: 'Բոլորը' },
                  { id: 'income', label: 'Եկամուտ' },
                  { id: 'expense', label: 'Ծախս' },
                  {
                    id: 'pending',
                    label: `Նախածախսեր (${pendingCount})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setFilterType(tab.id);
                    if (tab.id !== 'income') setFilterIncomeKind('all');
                  }}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    filterType === tab.id
                      ? tab.id === 'pending'
                        ? 'bg-amber-500 text-white font-semibold shadow-xs'
                        : 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                      : 'text-[#64748B] dark:text-[#94A3B8]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onOpenNewTransactionModal}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl btn-primary text-xs sm:text-sm inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Նոր գործարք</span>
            </button>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              aria-label="Զտել ըստ կատեգորիայի"
              className="min-h-[38px] px-3 py-1.5 text-xs rounded-xl input-field flex-1 sm:flex-none"
            >
              <option value="all">Բոլոր կատեգորիաները</option>
              {allCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={txSort}
              onChange={(e) => setTxSort(e.target.value as TxSortMode)}
              aria-label="Տեսակավորել գործարքները"
              className="min-h-[38px] px-3 py-1.5 text-xs rounded-xl input-field flex-1 sm:flex-none"
            >
              <option value="date-desc">Նորից հին</option>
              <option value="amount-desc">Գումար՝ մեծից փոքր</option>
              <option value="amount-asc">Գումար՝ փոքրից մեծ</option>
            </select>

            {/* Search Bar with Real-time Suggestions */}
            <div className="relative flex-1 min-w-[200px] sm:max-w-xs ml-auto">
              <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => {
                  setTimeout(() => setIsSearchFocused(false), 200);
                }}
                placeholder="Որոնել (անուն, կատեգորիա, գումար)..."
                className="w-full min-h-[38px] pl-9 pr-8 py-1.5 text-sm rounded-xl input-field"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Մաքրել որոնումը"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {isSearchFocused && hasSuggestions && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl shadow-xl z-50 p-2 space-y-2 text-xs max-h-64 overflow-y-auto scroll-container">
                  <div className="px-2 py-1 text-[11px] font-semibold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider flex items-center justify-between">
                    <span>Առաջարկվող հիշողությունից</span>
                    <span className="font-mono font-normal">Իրական ժամանակում</span>
                  </div>

                  {searchSuggestions.titles.length > 0 && (
                    <div className="space-y-0.5">
                      <p className="px-2 text-[10px] text-[#94A3B8] font-medium">
                        Նպատակ / Անվանում
                      </p>
                      {searchSuggestions.titles.map((t: string) => (
                        <button
                          key={`sug-title-${t}`}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSearchQuery(t);
                            setIsSearchFocused(false);
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] flex items-center justify-between transition-colors cursor-pointer"
                        >
                          <span className="truncate font-medium">{t}</span>
                          <span className="text-[10px] text-[#94A3B8] shrink-0 ml-2">անուն</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchSuggestions.categories.length > 0 && (
                    <div className="space-y-0.5 pt-1 border-t border-[#F1F5F9] dark:border-[#1E293B]">
                      <p className="px-2 text-[10px] text-[#94A3B8] font-medium">Կատեգորիա</p>
                      {searchSuggestions.categories.map((c: string) => (
                        <button
                          key={`sug-cat-${c}`}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSearchQuery(c);
                            setIsSearchFocused(false);
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] flex items-center justify-between transition-colors cursor-pointer"
                        >
                          <span className="truncate font-medium">{c}</span>
                          <span className="text-[10px] text-[#94A3B8] shrink-0 ml-2">կատեգորիա</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchSuggestions.amounts.length > 0 && (
                    <div className="space-y-0.5 pt-1 border-t border-[#F1F5F9] dark:border-[#1E293B]">
                      <p className="px-2 text-[10px] text-[#94A3B8] font-medium">Գումար</p>
                      {searchSuggestions.amounts.map((a: string) => (
                        <button
                          key={`sug-amt-${a}`}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSearchQuery(a);
                            setIsSearchFocused(false);
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] font-mono text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-between transition-colors cursor-pointer"
                        >
                          <span>{formatMoney(Number(a), currency)}</span>
                          <span className="text-[10px] text-[#94A3B8] shrink-0 ml-2">գումար</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Income Kind sub-filter if income selected */}
          {filterType === 'income' && (
            <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl surface-subtle self-start">
              <button
                type="button"
                onClick={() => setFilterIncomeKind('all')}
                className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  filterIncomeKind === 'all'
                    ? 'bg-white dark:bg-[#0F172A] text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs'
                    : 'text-[#64748B] dark:text-[#94A3B8]'
                }`}
              >
                Բոլոր տեսակները
              </button>
              {INCOME_KINDS.map((kind) => (
                <button
                  key={kind.id}
                  type="button"
                  onClick={() => setFilterIncomeKind(kind.id)}
                  className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    filterIncomeKind === kind.id
                      ? 'bg-white dark:bg-[#0F172A] text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs'
                      : 'text-[#64748B] dark:text-[#94A3B8]'
                  }`}
                >
                  {kind.label}
                </button>
              ))}
            </div>
          )}

          {/* Date Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-[#F1F5F9] dark:border-[#1E293B]">
            <div className="flex items-center gap-1 flex-wrap">
              {[
                { id: 'all' as const, label: 'Բոլոր օրերը' },
                { id: 'specific' as const, label: 'Կոնկրետ օր' },
                { id: 'range' as const, label: 'Ժամանակահատված (Դիապազոն)' },
              ].map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setFilterDateMode(mode.id)}
                  className={`min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer tabular-nums ${
                    filterDateMode === mode.id
                      ? 'bg-[#EFF6FF] dark:bg-[#172554]/60 text-[#1D4ED8] dark:text-[#60A5FA] font-semibold'
                      : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A]'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {filterDateMode === 'specific' && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">Օր․</span>
                <input
                  type="date"
                  value={filterDateSpecific}
                  onChange={(e) => setFilterDateSpecific(e.target.value)}
                  className="min-h-[34px] px-2.5 py-1 text-xs font-mono tabular-nums rounded-xl input-field"
                />
              </div>
            )}

            {filterDateMode === 'range' && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">Սկսած՝</span>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="min-h-[34px] px-2 py-1 text-xs font-mono tabular-nums rounded-xl input-field"
                />
                <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">Մինչև՝</span>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="min-h-[34px] px-2 py-1 text-xs font-mono tabular-nums rounded-xl input-field"
                />
              </div>
            )}
          </div>
        </div>

        {/* Auto-Categorize Existing 'Այլ' Transactions Banner */}
        {autoCategorizableItems.length > 0 && onAutoCategorizeTransactions && (
          <div className="px-4 sm:px-6 py-2.5 border-b border-[#E2E8F0] dark:border-[#1E293B] bg-[#EFF6FF]/70 dark:bg-[#172554]/30 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 text-xs text-[#1E3A8A] dark:text-[#BFDBFE]">
              <Sparkles className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA] shrink-0" />
              <span>
                Կա {autoCategorizableItems.length} «Այլ» գործարք, որոնք համապատասխանում են նախկին վերնագրերին
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                onAutoCategorizeTransactions(
                  autoCategorizableItems.map(({ tx, prediction }) => ({
                    id: tx.id,
                    category: prediction.category,
                    incomeKind: prediction.incomeKind,
                  }))
                )
              }
              className="min-h-[30px] px-3 py-1 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] dark:bg-[#3B82F6] dark:hover:bg-[#60A5FA] text-white dark:text-[#060B16] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <Sparkles className="w-3 h-3" />
              <span>Ավտոմատ դասակարգել ({autoCategorizableItems.length})</span>
            </button>
          </div>
        )}

        {/* Transactions Rows */}
        {filteredTransactions.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyStatePlaceholder
              icon={filterType === 'pending' ? Clock : Receipt}
              title={
                filterType === 'pending'
                  ? 'Այս ամսում սպասվող նախածախսեր չկան'
                  : hasActiveFilters
                    ? 'Որոնմանը կամ զտիչներին համապատասխան գործարքներ չկան'
                    : 'Այս ցիկլում գործարքներ դեռ գրանցված չեն'
              }
              description={
                hasActiveFilters
                  ? 'Փորձեք փոխել կատեգորիան, ամսաթիվը կամ մաքրել որոնման դաշտը։'
                  : 'Գրանցեք ձեր առաջին եկամուտը կամ ծախսը մեկ պատուհանից։'
              }
              actionLabel={
                hasActiveFilters
                  ? 'Մաքրել զտիչները'
                  : '+ Ավելացնել գործարք'
              }
              onAction={
                hasActiveFilters
                  ? clearLedgerFilters
                  : onOpenNewTransactionModal
              }
            />
          </div>
        ) : (
          <>
            <div className="sm:hidden px-3.5 py-2 border-b border-[#F1F5F9] dark:border-[#1E293B] bg-[#F8FAFC]/75 dark:bg-[#0B1120]/60 flex items-center justify-between text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              <span>Սեղմեք՝ խմբագրելու · Սահեցրեք ձախ՝ ջնջելու</span>
            </div>

            <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
              <AnimatePresence initial={false}>
                {filteredTransactions.map((tx) => (
                  <SwipeableTransactionRow
                    key={tx.id}
                    tx={tx}
                    currency={currency}
                    todayISO={todayISO}
                    isEditing={false}
                    isOpen={openSwipeTxId === tx.id}
                    onOpenChange={setOpenSwipeTxId}
                    onStartSwipe={(id) => {
                      setOpenSwipeTxId((prev) =>
                        prev && prev !== id ? null : prev
                      );
                    }}
                    onEdit={onEditTransaction}
                    onDelete={(id) => {
                      setOpenSwipeTxId((prev) => (prev === id ? null : prev));
                      onDeleteTransaction(id);
                    }}
                    onConfirmPreExpense={onConfirmPreExpense}
                  />
                ))}
              </AnimatePresence>
            </div>

            <div className="px-4 sm:px-6 py-3 border-t border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums">
              <div className="flex items-center gap-2">
                <span>Ցուցադրված է {filteredTransactions.length} գործարք</span>
                {hasActiveFilters && (
                  <>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={clearLedgerFilters}
                      className="text-[#2563EB] dark:text-[#60A5FA] font-medium hover:underline cursor-pointer"
                    >
                      Մաքրել զտիչները
                    </button>
                  </>
                )}
              </div>
              <span className="font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Զուտ (փաստացի)՝ {filteredNet > 0 ? '+' : ''}
                {formatMoney(filteredNet, currency)}
              </span>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
