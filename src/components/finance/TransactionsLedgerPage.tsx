import React, { memo, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  CheckSquare,
  Clock,
  Download,
  FileSpreadsheet,
  Plus,
  Receipt,
  Repeat,
  Search,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import {
  MetricStrip,
  MonthCycleNav,
  PageHeader,
  PageShell,
} from '../layout/PagePrimitives';
import { EmptyStatePlaceholder } from '../ui/Skeleton';
import { SwipeableTransactionRow } from './SwipeableTransactionRow';
import { StatementImportModal } from './StatementImportModal';
import {
  BankCard,
  Currency,
  CustomCategory,
  IncomeKind,
  PrimaryIncomeConfig,
  Transaction,
  TransactionType,
} from '../../types';
import {
  INCOME_KINDS,
  formatMoney,
  getTodayISO,
  getTransactionIncomeKind,
} from '../../data/defaults';
import { TxSortMode } from './financeShared';
import { findAutoCategorizableTransactions } from '../../utils/transactionAutoCategory';
import { FxRatesToAmd, formatCardLabel } from '../../utils/cardBalances';
import {
  mergeExpenseCategories,
  mergeIncomeCategories,
} from '../../utils/customCategories';
import { formatCycleLabel } from '../../utils/financialCycle';
import { RecurringBillSuggestion } from '../../utils/recurringBills';

const LEDGER_PAGE_SIZE = 50;

interface TransactionsLedgerPageProps {
  selectedMonth: string;
  onShiftMonth: (delta: number) => void;
  effectivePayday: number;
  currency: Currency;
  cards: BankCard[];
  customCategories?: CustomCategory[];
  fxRates?: FxRatesToAmd | null;
  filterCardId: string;
  onFilterCardChange: (cardId: string) => void;
  filterCategory?: string;
  onFilterCategoryChange?: (category: string) => void;
  filterTag?: string;
  onFilterTagChange?: (tag: string) => void;
  monthTransactions: Transaction[];
  allTransactions: Transaction[];
  onOpenNewTransactionModal: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onImportTransactions?: (
    items: Array<Omit<Transaction, 'id' | 'createdAt'>>
  ) => void;
  onAutoCategorizeTransactions?: (
    updates: Array<{ id: string; category: string; incomeKind?: IncomeKind }>
  ) => void;
  onDeleteTransaction: (id: string) => void;
  onDuplicateTransaction?: (tx: Transaction) => void;
  onBulkDeleteTransactions?: (ids: string[]) => void;
  onBulkAssignCard?: (ids: string[], cardId: string | undefined) => void;
  onConfirmPreExpense: (id: string) => void;
  onExportCSV: () => void;
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
  billSuggestions?: RecurringBillSuggestion[];
  onConvertSuggestionToBill?: (suggestion: RecurringBillSuggestion) => void;
  onOpenSuggestionInBills?: (suggestion: RecurringBillSuggestion) => void;
  onDismissBillSuggestion?: (key: string) => void;
  trendCard?: React.ReactNode;
  categoryPieCard?: React.ReactNode;
}

export const TransactionsLedgerPage = memo(function TransactionsLedgerPage({
  selectedMonth,
  onShiftMonth,
  effectivePayday,
  currency,
  cards,
  customCategories = [],
  fxRates,
  filterCardId,
  onFilterCardChange,
  filterCategory: controlledFilterCategory,
  onFilterCategoryChange,
  filterTag: controlledFilterTag,
  onFilterTagChange,
  monthTransactions,
  allTransactions,
  onOpenNewTransactionModal,
  onEditTransaction,
  onImportTransactions,
  onAutoCategorizeTransactions,
  onDeleteTransaction,
  onDuplicateTransaction,
  onBulkDeleteTransactions,
  onBulkAssignCard,
  onConfirmPreExpense,
  onExportCSV,
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
  billSuggestions = [],
  onConvertSuggestionToBill,
  onOpenSuggestionInBills,
  onDismissBillSuggestion,
  trendCard,
  categoryPieCard,
}: TransactionsLedgerPageProps) {
  const todayISO = getTodayISO();
  const cycleLabel = formatCycleLabel(selectedMonth, effectivePayday);

  const [openSwipeTxId, setOpenSwipeTxId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);

  const [searchAllMonths, setSearchAllMonths] = useState(false);
  const [filterType, setFilterType] = useState<'all' | TransactionType | 'pending'>('all');
  const [filterIncomeKind, setFilterIncomeKind] = useState<'all' | IncomeKind>('all');
  const [internalFilterCategory, setInternalFilterCategory] = useState<string>('all');
  const filterCategory = controlledFilterCategory ?? internalFilterCategory;
  const setFilterCategory = onFilterCategoryChange ?? setInternalFilterCategory;
  const [internalFilterTag, setInternalFilterTag] = useState<string>('all');
  const filterTag = controlledFilterTag ?? internalFilterTag;
  const setFilterTag = onFilterTagChange ?? setInternalFilterTag;
  const [filterDateMode, setFilterDateMode] = useState<'all' | 'specific' | 'range'>('all');
  const [filterDateSpecific, setFilterDateSpecific] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [txSort, setTxSort] = useState<TxSortMode>('date-desc');

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [visibleCount, setVisibleCount] = useState(LEDGER_PAGE_SIZE);

  const allCategories = useMemo(
    () =>
      Array.from(
        new Set([
          ...mergeExpenseCategories(customCategories),
          ...mergeIncomeCategories(customCategories),
        ])
      ),
    [customCategories]
  );

  const scopedTransactions = searchAllMonths ? allTransactions : monthTransactions;

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const tx of scopedTransactions) {
      if (!tx.tags) continue;
      for (const tag of tx.tags) {
        if (tag) tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [scopedTransactions]);

  const pendingCount = useMemo(
    () => scopedTransactions.filter((t) => t.type === 'expense' && t.isPending).length,
    [scopedTransactions]
  );

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

  const cardsById = useMemo(
    () => new Map(cards.map((c) => [c.id, c])),
    [cards]
  );

  const hasActiveFilters =
    searchAllMonths ||
    filterType !== 'all' ||
    filterIncomeKind !== 'all' ||
    filterCategory !== 'all' ||
    filterTag !== 'all' ||
    filterCardId !== 'all' ||
    filterDateMode !== 'all' ||
    searchQuery.trim() !== '';

  const clearLedgerFilters = () => {
    setSearchAllMonths(false);
    setFilterType('all');
    setFilterIncomeKind('all');
    setFilterCategory('all');
    setFilterTag('all');
    onFilterCardChange('all');
    setFilterDateMode('all');
    setFilterDateSpecific('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchQuery('');
  };

  useEffect(() => {
    setVisibleCount(LEDGER_PAGE_SIZE);
  }, [
    selectedMonth,
    searchAllMonths,
    filterType,
    filterIncomeKind,
    filterCategory,
    filterTag,
    filterCardId,
    filterDateMode,
    filterDateSpecific,
    filterDateFrom,
    filterDateTo,
    txSort,
    searchQuery,
  ]);

  const filteredTransactions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const qTag = q.replace(/^#/, '');
    const numericQ = q ? Number(q) : NaN;
    return scopedTransactions
      .filter((t) => {
        if (filterType === 'all') return true;
        if (filterType === 'pending') return t.type === 'expense' && t.isPending;
        if (t.type !== filterType) return false;
        return true;
      })
      .filter((t) => {
        if (filterType !== 'income' || filterIncomeKind === 'all') return true;
        return getTransactionIncomeKind(t) === filterIncomeKind;
      })
      .filter((t) =>
        filterCategory === 'all' ? true : t.category === filterCategory
      )
      .filter((t) =>
        filterTag === 'all'
          ? true
          : Boolean(
              t.tags?.some(
                (tag) => tag.toLowerCase() === filterTag.toLowerCase()
              )
            )
      )
      .filter((t) => {
        if (filterCardId === 'all') return true;
        if (filterCardId === 'unassigned') return !t.cardId;
        return t.cardId === filterCardId;
      })
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
        if (!q) return true;
        if (t.title.toLowerCase().includes(q)) return true;
        if (t.category.toLowerCase().includes(q)) return true;
        if (
          qTag &&
          t.tags?.some((tag) => tag.toLowerCase().includes(qTag))
        ) {
          return true;
        }
        const linkedCard = t.cardId ? cardsById.get(t.cardId) : undefined;
        if (linkedCard && formatCardLabel(linkedCard).toLowerCase().includes(q)) {
          return true;
        }
        const amountStr = String(t.amount);
        return (
          amountStr.includes(q) ||
          (numericQ > 0 && Math.abs(t.amount - numericQ) < 1)
        );
      })
      .sort((a, b) => {
        if (txSort === 'amount-desc') return b.amount - a.amount;
        if (txSort === 'amount-asc') return a.amount - b.amount;
        if (txSort === 'date-asc') return a.date.localeCompare(b.date);
        return b.date.localeCompare(a.date);
      });
  }, [
    scopedTransactions,
    filterType,
    filterIncomeKind,
    filterCategory,
    filterTag,
    filterCardId,
    filterDateMode,
    filterDateSpecific,
    filterDateFrom,
    filterDateTo,
    searchQuery,
    cardsById,
    txSort,
  ]);

  const visibleTransactions = useMemo(
    () => filteredTransactions.slice(0, visibleCount),
    [filteredTransactions, visibleCount]
  );

  const remainingCount = Math.max(
    0,
    filteredTransactions.length - visibleTransactions.length
  );

  const filteredNet = useMemo(
    () =>
      filteredTransactions.reduce(
        (sum, t) =>
          sum + (t.type === 'income' ? t.amount : t.isPending ? 0 : -t.amount),
        0
      ),
    [filteredTransactions]
  );

  return (
    <PageShell>
      <PageHeader
        title="Գործարքների մատյան"
        subtitle={`Մուտքեր, ելքեր, նախածախսեր և արագ որոնում · ${cycleLabel}`}
        actions={
          <>
            <MonthCycleNav
              selectedMonth={selectedMonth}
              payday={effectivePayday}
              onShiftMonth={onShiftMonth}
              className="lg:hidden"
            />
            {onImportTransactions && (
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] inline-flex items-center gap-1.5 hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                <span>Ներմուծել</span>
              </button>
            )}
            <button
              type="button"
              onClick={onExportCSV}
              disabled={allTransactions.length === 0}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] inline-flex items-center gap-1.5 hover:border-[#2563EB] dark:hover:border-[#3B82F6] disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={onOpenNewTransactionModal}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl btn-primary text-xs sm:text-sm inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Նոր գործարք</span>
            </button>
          </>
        }
      />

      <MetricStrip
        items={[
          {
            id: 'ledger-balance',
            label: 'Իրական բալանս',
            value: `${realBalance > 0 ? '+' : ''}${formatMoney(realBalance, currency)}`,
            hint: `${monthTransactions.length} գործարք ցիկլում`,
            tone: realBalance >= 0 ? 'accent' : 'negative',
            sensitive: true,
          },
          {
            id: 'ledger-income',
            label: 'Ամսվա եկամուտ',
            value: `+${formatMoney(totalIncome, currency)}`,
            hint:
              incomeDeltaPct !== null
                ? `${incomeDeltaPct >= 0 ? '+' : ''}${incomeDeltaPct}% նախ. ցիկլից`
                : undefined,
            tone: 'positive',
            sensitive: true,
          },
          {
            id: 'ledger-expense',
            label: 'Ամսվա ծախս',
            value: `-${formatMoney(totalExpense, currency)}`,
            hint:
              pendingExpense > 0
                ? `Նախածախս՝ ${formatMoney(pendingExpense, currency)}`
                : expenseDeltaPct !== null
                  ? `${expenseDeltaPct >= 0 ? '+' : ''}${expenseDeltaPct}% նախ. ցիկլից`
                  : undefined,
            tone: 'negative',
            sensitive: true,
          },
          {
            id: 'ledger-opening',
            label: 'Նախորդ մնացորդ',
            value: `${openingBalance > 0 ? '+' : ''}${formatMoney(openingBalance, currency)}`,
            sensitive: true,
            action:
              isCurrentCycle &&
              primaryIncome.enabled &&
              !hasCurrentPrimaryCredited
                ? {
                    label: '+ Գրանցել աշխատավարձը',
                    onClick: onManualCreditPrimaryIncome,
                  }
                : undefined,
          },
        ]}
      />

      {(trendCard || categoryPieCard) && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 sm:gap-6 items-stretch">
          {trendCard && (
            <div
              className={
                categoryPieCard
                  ? 'xl:col-span-7 min-w-0 flex flex-col'
                  : 'xl:col-span-12 min-w-0'
              }
            >
              {trendCard}
            </div>
          )}
          {categoryPieCard && (
            <div
              className={
                trendCard
                  ? 'xl:col-span-5 min-w-0 flex flex-col'
                  : 'xl:col-span-12 min-w-0'
              }
            >
              {categoryPieCard}
            </div>
          )}
        </div>
      )}

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

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="inline-flex items-center p-0.5 rounded-xl surface-subtle text-xs">
                <button
                  type="button"
                  onClick={() => setSearchAllMonths(false)}
                  className={`min-h-[32px] px-2.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    !searchAllMonths
                      ? 'bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                      : 'text-[#64748B] dark:text-[#94A3B8]'
                  }`}
                >
                  Այս ցիկլ
                </button>
                <button
                  type="button"
                  onClick={() => setSearchAllMonths(true)}
                  className={`min-h-[32px] px-2.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    searchAllMonths
                      ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                      : 'text-[#64748B] dark:text-[#94A3B8]'
                  }`}
                >
                  Բոլոր ամիսներ
                </button>
              </div>

              {filteredTransactions.length > 0 &&
                (onBulkDeleteTransactions || onBulkAssignCard) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectionMode((prev) => {
                        if (prev) setSelectedIds([]);
                        return !prev;
                      });
                    }}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      selectionMode
                        ? 'border-[#2563EB] bg-[#EFF6FF] dark:bg-[#172554]/60 text-[#1D4ED8] dark:text-[#60A5FA]'
                        : 'border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB]'
                    }`}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>{selectionMode ? 'Ավարտել' : 'Ընտրել'}</span>
                  </button>
                )}
            </div>
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

            {(availableTags.length > 0 || filterTag !== 'all') && (
              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                aria-label="Զտել ըստ թեգի"
                className="min-h-[38px] px-3 py-1.5 text-xs rounded-xl input-field flex-1 sm:flex-none"
              >
                <option value="all">Բոլոր #թեգերը</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    #{tag}
                  </option>
                ))}
              </select>
            )}

            {cards.length > 0 && (
              <select
                value={filterCardId}
                onChange={(e) => onFilterCardChange(e.target.value)}
                aria-label="Զտել ըստ քարտի կամ դրամապանակի"
                className="min-h-[38px] px-3 py-1.5 text-xs rounded-xl input-field flex-1 sm:flex-none"
              >
                <option value="all">Բոլոր քարտերը</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {formatCardLabel(c)}
                  </option>
                ))}
                <option value="unassigned">Առանց քարտի</option>
              </select>
            )}

            <select
              value={txSort}
              onChange={(e) => setTxSort(e.target.value as TxSortMode)}
              aria-label="Տեսակավորել գործարքները"
              className="min-h-[38px] px-3 py-1.5 text-xs rounded-xl input-field flex-1 sm:flex-none"
            >
              <option value="date-desc">Նորից հին</option>
              <option value="date-asc">Հնից նոր</option>
              <option value="amount-desc">Գումար՝ մեծից փոքր</option>
              <option value="amount-asc">Գումար՝ փոքրից մեծ</option>
            </select>

            <select
              value={filterDateMode}
              onChange={(e) =>
                setFilterDateMode(e.target.value as 'all' | 'specific' | 'range')
              }
              aria-label="Զտել ըստ օրվա"
              className="min-h-[38px] px-3 py-1.5 text-xs rounded-xl input-field flex-1 sm:flex-none"
            >
              <option value="all">Բոլոր օրերը</option>
              <option value="specific">Կոնկրետ օր</option>
              <option value="range">Ժամանակահատված</option>
            </select>

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
                placeholder="Որոնել (անուն, #թեգ, գումար)..."
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
                  <div className="px-2 py-1 text-[11px] font-semibold text-[#64748B] dark:text-[#94A3B8] flex items-center justify-between">
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
                          <span className="pa-sensitive">{formatMoney(Number(a), currency)}</span>
                          <span className="text-[10px] text-[#94A3B8] shrink-0 ml-2">գումար</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

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

          {/* Conditional Date Inputs */}
          {filterDateMode !== 'all' && (
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-[#F1F5F9] dark:border-[#1E293B]">
              {filterDateMode === 'specific' && (
                <div className="flex items-center gap-2">
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
                <div className="flex flex-wrap items-center gap-2">
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

              <button
                type="button"
                onClick={() => {
                  setFilterDateMode('all');
                  setFilterDateSpecific('');
                  setFilterDateFrom('');
                  setFilterDateTo('');
                }}
                className="text-[11px] font-medium text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
              >
                Մաքրել օրերը
              </button>
            </div>
          )}
        </div>

        {/* Auto-Categorize Existing 'Այլ' Transactions Banner */}
        {autoCategorizableItems.length > 0 && onAutoCategorizeTransactions && (
          <div className="px-4 sm:px-6 py-2.5 border-b border-[#E2E8F0] dark:border-[#1E293B] bg-[#EFF6FF]/70 dark:bg-[#172554]/30 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 text-xs text-[#1E3A8A] dark:text-[#BFDBFE]">
              <Wand2 className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-[#60A5FA] shrink-0" />
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
              className="min-h-[30px] px-3 py-1 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] dark:bg-[#3B82F6] dark:hover:bg-[#60A5FA] text-white dark:text-[#060B16] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <Wand2 className="w-3 h-3" />
              <span>Ավտոմատ դասակարգել ({autoCategorizableItems.length})</span>
            </button>
          </div>
        )}

        {/* Frequent Uncategorized Expenses -> Recurring Bills Prompt */}
        {billSuggestions.length > 0 && (
          <div className="px-4 sm:px-6 py-2.5 border-b border-[#E2E8F0] dark:border-[#1E293B] bg-amber-50/75 dark:bg-amber-950/25 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 text-xs text-amber-950 dark:text-amber-200 min-w-0">
              <Repeat className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="truncate sm:whitespace-normal tabular-nums">
                {billSuggestions.length === 1 ? (
                  <>
                    «{billSuggestions[0].title}» չդասակարգված ծախսը կրկնվել է{' '}
                    {billSuggestions[0].occurrences} անգամ (
                    <span className="pa-sensitive font-mono font-medium">
                      {formatMoney(billSuggestions[0].typicalAmount, currency)}
                    </span>
                    )
                  </>
                ) : (
                  <>
                    Հայտնաբերվել է {billSuggestions.length} հաճախակի չդասակարգված ծախս («
                    {billSuggestions[0].title}» և այլն)
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onConvertSuggestionToBill && (
                <button
                  type="button"
                  onClick={() => onConvertSuggestionToBill(billSuggestions[0])}
                  className="min-h-[30px] px-3 py-1 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] dark:bg-[#3B82F6] dark:hover:bg-[#60A5FA] text-white dark:text-[#060B16] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Repeat className="w-3 h-3" />
                  <span>
                    {billSuggestions.length === 1
                      ? 'Դարձնել կրկնվող վճար'
                      : `Դարձնել վճար (${billSuggestions[0].title})`}
                  </span>
                </button>
              )}
              {onOpenSuggestionInBills && (
                <button
                  type="button"
                  onClick={() => onOpenSuggestionInBills(billSuggestions[0])}
                  className="min-h-[30px] px-2.5 py-1 rounded-lg border border-amber-300/90 dark:border-amber-800/80 bg-white/80 dark:bg-[#0F172A] text-xs font-medium text-amber-900 dark:text-amber-200 hover:border-amber-500 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {billSuggestions.length > 1
                    ? `Դիտել բոլորը (${billSuggestions.length})`
                    : 'Կարգավորել'}
                </button>
              )}
              {onDismissBillSuggestion && (
                <button
                  type="button"
                  onClick={() => onDismissBillSuggestion(billSuggestions[0].key)}
                  aria-label="Թաքցնել առաջարկը"
                  title="Թաքցնել"
                  className="min-h-[30px] min-w-[30px] flex items-center justify-center rounded-lg text-amber-700/75 dark:text-amber-300/75 hover:bg-amber-200/50 dark:hover:bg-amber-900/40 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Bulk Multi-Select Action Bar */}
        {selectionMode && filteredTransactions.length > 0 && (
          <div className="px-4 sm:px-6 py-2.5 border-b border-[#E2E8F0] dark:border-[#1E293B] bg-[#EFF6FF]/85 dark:bg-[#172554]/50 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#1E3A8A] dark:text-[#BFDBFE] tabular-nums">
              <span>Ընտրված՝ {selectedIds.length}</span>
              <button
                type="button"
                onClick={() => {
                  if (selectedIds.length === filteredTransactions.length) {
                    setSelectedIds([]);
                  } else {
                    setSelectedIds(filteredTransactions.map((t) => t.id));
                  }
                }}
                className="text-[11px] font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
              >
                {selectedIds.length === filteredTransactions.length
                  ? 'Հանել բոլորը'
                  : `Ընտրել բոլորը (${filteredTransactions.length})`}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {cards.length > 0 && onBulkAssignCard && selectedIds.length > 0 && (
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    onBulkAssignCard(
                      selectedIds,
                      val === '__none__' ? undefined : val
                    );
                    e.target.value = '';
                  }}
                  aria-label="Կապել ընտրված գործարքները քարտի հետ"
                  className="min-h-[32px] px-2.5 py-1 text-xs rounded-lg input-field"
                >
                  <option value="" disabled>
                    Կապել քարտի հետ…
                  </option>
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatCardLabel(c)}
                    </option>
                  ))}
                  <option value="__none__">Հեռացնել քարտից</option>
                </select>
              )}

              {onBulkDeleteTransactions && selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onBulkDeleteTransactions(selectedIds);
                    setSelectedIds([]);
                    setSelectionMode(false);
                  }}
                  className="min-h-[32px] px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Ջնջել ({selectedIds.length})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setSelectedIds([]);
                  setSelectionMode(false);
                }}
                className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[#CBD5E1] dark:border-[#334155] text-xs font-medium text-[#475569] dark:text-[#CBD5E1] cursor-pointer"
              >
                Չեղարկել
              </button>
            </div>
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
              <span>
                {selectionMode
                  ? 'Ընտրեք գործարքները խմբային գործողության համար'
                  : 'Սեղմեք՝ խմբագրելու · Սահեցրեք ձախ՝ ջնջելու'}
              </span>
            </div>

            <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
              <AnimatePresence initial={false}>
                {visibleTransactions.map((tx) => (
                  <SwipeableTransactionRow
                    key={tx.id}
                    tx={tx}
                    card={tx.cardId ? cardsById.get(tx.cardId) : undefined}
                    currency={currency}
                    todayISO={todayISO}
                    isEditing={false}
                    isOpen={openSwipeTxId === tx.id}
                    selectionMode={selectionMode}
                    isSelected={selectedIds.includes(tx.id)}
                    onToggleSelect={(id) =>
                      setSelectedIds((prev) =>
                        prev.includes(id)
                          ? prev.filter((item) => item !== id)
                          : [...prev, id]
                      )
                    }
                    onOpenChange={setOpenSwipeTxId}
                    onStartSwipe={(id) => {
                      setOpenSwipeTxId((prev) =>
                        prev && prev !== id ? null : prev
                      );
                    }}
                    onEdit={onEditTransaction}
                    onDuplicate={onDuplicateTransaction}
                    onDelete={(id) => {
                      setOpenSwipeTxId((prev) => (prev === id ? null : prev));
                      onDeleteTransaction(id);
                    }}
                    onConfirmPreExpense={onConfirmPreExpense}
                  />
                ))}
              </AnimatePresence>
            </div>

            {remainingCount > 0 && (
              <div className="px-4 py-3 border-t border-[#F1F5F9] dark:border-[#1E293B] flex justify-center bg-white dark:bg-[#0F172A]">
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCount((prev) => prev + LEDGER_PAGE_SIZE)
                  }
                  className="min-h-[36px] px-4 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-[#F8FAFC] dark:bg-[#111A2E] hover:border-[#2563EB] dark:hover:border-[#3B82F6] text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] transition-colors cursor-pointer tabular-nums"
                >
                  Ցուցադրել ավելին (+{remainingCount})
                </button>
              </div>
            )}

            <div className="px-4 sm:px-6 py-3 border-t border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums">
              <div className="flex items-center gap-2">
                <span>
                  Ցուցադրված է {visibleTransactions.length}-ը{' '}
                  {filteredTransactions.length}-ից
                </span>
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
              <span className="pa-sensitive font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Զուտ (փաստացի)՝ {filteredNet > 0 ? '+' : ''}
                {formatMoney(filteredNet, currency)}
              </span>
            </div>
          </>
        )}
      </section>

      {showImportModal && onImportTransactions && (
        <StatementImportModal
          cards={cards}
          transactions={allTransactions}
          customCategories={customCategories}
          fxRates={fxRates}
          onClose={() => setShowImportModal(false)}
          onImportTransactions={onImportTransactions}
        />
      )}
    </PageShell>
  );
});
