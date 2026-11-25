import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
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
  INCOME_KIND_LABELS,
  formatMoney,
  formatShortDate,
  getTodayISO,
  getTransactionIncomeKind,
} from '../../data/defaults';
import { QUICK_AMOUNTS_AMD, TxSortMode } from './financeShared';

interface TransactionsLedgerPageProps {
  selectedMonth: string;
  effectivePayday: number;
  currency: Currency;
  monthTransactions: Transaction[];
  allTransactions: Transaction[];
  onAddTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  onUpdateTransaction: (
    id: string,
    updates: Omit<Transaction, 'id' | 'createdAt'>
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
  onAddTransaction,
  onUpdateTransaction,
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

  // Composer & Edit state
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [type, setType] = useState<TransactionType>('expense');
  const [incomeKind, setIncomeKind] = useState<IncomeKind>('monthly');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [date, setDate] = useState(todayISO);
  const [isPending, setIsPending] = useState(false);
  const [userManuallySetPending, setUserManuallySetPending] = useState(false);
  const [formError, setFormError] = useState('');

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

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
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

  const resetComposer = () => {
    setEditingTxId(null);
    setIncomeKind('monthly');
    setAmount('');
    setTitle('');
    setIsPending(false);
    setUserManuallySetPending(false);
    setFormError('');
  };

  const handleStartEditTx = (tx: Transaction) => {
    setEditingTxId(tx.id);
    setType(tx.type);
    setIncomeKind(
      tx.type === 'income' ? getTransactionIncomeKind(tx) : 'monthly'
    );
    setAmount(String(tx.amount));
    setTitle(tx.title);
    setCategory(tx.category);
    setDate(tx.date);
    setIsPending(Boolean(tx.isPending));
    setUserManuallySetPending(true);
    setFormError('');
  };

  const handleTypeSwitch = (nextType: TransactionType) => {
    setType(nextType);
    if (nextType === 'income') {
      setIncomeKind('monthly');
      setCategory(INCOME_CATEGORIES[0]);
      setIsPending(false);
    } else {
      setCategory(EXPENSE_CATEGORIES[0]);
      if (date > todayISO && !userManuallySetPending) {
        setIsPending(true);
      }
    }
  };

  const handleIncomeKindSwitch = (kind: IncomeKind) => {
    setIncomeKind(kind);
    if (!editingTxId) {
      if (kind === 'monthly') setCategory('Աշխատավարձ');
      else if (kind === 'extra') setCategory('Ֆրիլանս');
      else setCategory('Նվեր');
    }
  };

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    // If user picks a future date and hasn't manually overridden the pending toggle, suggest pre-expense
    if (newDate > todayISO && type === 'expense' && !userManuallySetPending) {
      setIsPending(true);
    }
  };

  const handleQuickPreset = (val: number) => {
    const current = Number(amount) || 0;
    setAmount(String(current + val));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      setFormError('Խնդրում ենք մուտքագրել ճիշտ գումար։');
      return;
    }
    if (!title.trim()) {
      setFormError(
        type === 'income'
          ? 'Նշեք եկամտի աղբյուրը։'
          : 'Նշեք ծախսի նպատակը։'
      );
      return;
    }

    setFormError('');
    const payload = {
      type,
      incomeKind: type === 'income' ? incomeKind : undefined,
      amount: numericAmount,
      title: title.trim(),
      category,
      date: date || todayISO,
      isPending: type === 'expense' ? isPending : false,
    };

    if (editingTxId) {
      onUpdateTransaction(editingTxId, payload);
    } else {
      onAddTransaction(payload);
    }
    resetComposer();
  };

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
    (sum, t) => sum + (t.type === 'income' ? t.amount : (t.isPending ? 0 : -t.amount)),
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

      {/* Main 2-Column Ledger Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Transaction Composer */}
        <section className="lg:col-span-4 min-w-0 surface-card p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
              {editingTxId ? 'Խմբագրել գործարքը' : 'Նոր գրանցում'}
            </h3>
            {editingTxId && (
              <button
                type="button"
                onClick={resetComposer}
                className="text-xs font-medium text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] cursor-pointer"
              >
                Չեղարկել
              </button>
            )}
          </div>

          {/* Type Toggle */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl surface-subtle mb-4">
            <button
              type="button"
              onClick={() => handleTypeSwitch('expense')}
              className={`min-h-[40px] rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                type === 'expense'
                  ? 'bg-white dark:bg-[#0F172A] text-rose-600 dark:text-rose-400 shadow-xs'
                  : 'text-[#64748B] dark:text-[#94A3B8]'
              }`}
            >
              Ծախս
            </button>
            <button
              type="button"
              onClick={() => handleTypeSwitch('income')}
              className={`min-h-[40px] rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                type === 'income'
                  ? 'bg-white dark:bg-[#0F172A] text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-[#64748B] dark:text-[#94A3B8]'
              }`}
            >
              Եկամուտ
            </button>
          </div>

          {type === 'income' && (
            <div className="mb-4">
              <span className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1.5">
                Եկամտի տեսակ
              </span>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-xl surface-subtle">
                {INCOME_KINDS.map((kind) => (
                  <button
                    key={kind.id}
                    type="button"
                    onClick={() => handleIncomeKindSwitch(kind.id)}
                    className={`min-h-[36px] rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      incomeKind === kind.id
                        ? 'bg-white dark:bg-[#0F172A] text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs'
                        : 'text-[#64748B] dark:text-[#94A3B8]'
                    }`}
                  >
                    {kind.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="tx-amount"
                className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1.5"
              >
                Գումար (֏)
              </label>
              <input
                id="tx-amount"
                type="number"
                min="1"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Օրինակ՝ 15000"
                className="w-full min-h-[42px] px-3.5 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
              />
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {QUICK_AMOUNTS_AMD.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleQuickPreset(preset)}
                    className="min-h-[30px] rounded-lg border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] hover:border-[#2563EB] dark:hover:border-[#3B82F6] text-[11px] font-mono tabular-nums text-[#475569] dark:text-[#CBD5E1] active:scale-[0.96] transition-all cursor-pointer"
                  >
                    +{preset.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="tx-title"
                className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1.5"
              >
                {type === 'income' ? 'Եկամտի աղբյուր' : 'Ծախսի նպատակ'}
              </label>
              <input
                id="tx-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  type === 'income'
                    ? 'Օրինակ՝ Աշխատավարձ կամ պատվեր'
                    : 'Օրինակ՝ Սուպերմարկետ կամ կոմունալ'
                }
                className="w-full min-h-[42px] px-3.5 py-2 text-sm rounded-xl input-field"
              />
            </div>

            <div>
              <label
                htmlFor="tx-category"
                className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1.5"
              >
                Կատեգորիա
              </label>
              <select
                id="tx-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full min-h-[42px] px-3.5 py-2 text-sm rounded-xl input-field"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="tx-date"
                className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1.5"
              >
                Ամսաթիվ
              </label>
              <input
                id="tx-date"
                type="date"
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full min-h-[42px] px-3.5 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
              />
            </div>

            {/* Pre-Expense (Նախածախս) Checkbox Option */}
            {type === 'expense' && (
              <div
                className={`p-3 rounded-xl border transition-all ${
                  isPending
                    ? 'border-amber-400/60 bg-amber-500/10 dark:bg-amber-500/15'
                    : 'border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E]'
                }`}
              >
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPending}
                    onChange={(e) => {
                      setUserManuallySetPending(true);
                      setIsPending(e.target.checked);
                    }}
                    className="w-4 h-4 mt-0.5 rounded text-amber-600 dark:text-amber-500 focus:ring-amber-500 cursor-pointer"
                  />
                  <div className="space-y-0.5 select-none">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                        Նշել որպես նախածախս (սպասվող)
                      </span>
                      {date > todayISO && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
                          Ապագա ամսաթիվ
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                      Ծախսը չի հանվի բալանսից մինչև այն չհաստատեք։
                    </p>
                  </div>
                </label>
              </div>
            )}

            {formError && (
              <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">
                {formError}
              </p>
            )}

            <button
              type="submit"
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl btn-primary text-sm inline-flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>
                {editingTxId
                  ? 'Պահպանել փոփոխությունը'
                  : type === 'income'
                    ? 'Գրանցել եկամուտ'
                    : isPending
                      ? 'Գրանցել որպես նախածախս'
                      : 'Գրանցել ծախս'}
              </span>
            </button>
          </form>
        </section>

        {/* Right: Transactions List, Search & Filters */}
        <section className="lg:col-span-8 min-w-0 surface-card overflow-hidden">
          <div className="p-4 sm:px-6 border-b border-[#E2E8F0] dark:border-[#1E293B] flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Type Switcher with Pre-Expenses */}
              <div className="inline-flex items-center gap-1 p-1 rounded-xl surface-subtle max-w-full">
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
                    className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
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

              {/* Filters & Search */}
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
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
                <div className="relative flex-1 min-w-[160px] sm:w-64">
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
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl shadow-xl z-50 p-2 space-y-2 text-xs max-h-64 overflow-y-auto">
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

          {/* Transactions Rows */}
          {filteredTransactions.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm text-[#64748B] dark:text-[#94A3B8]">
                {filterType === 'pending'
                  ? 'Այս ամսում սպասվող նախածախսեր չկան։'
                  : 'Ընտրված ամսվա կամ որոնման համար գործարքներ չեն գտնվել։'}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearLedgerFilters}
                  className="min-h-[38px] px-4 py-1.5 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] text-xs font-medium text-[#2563EB] dark:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#172554]/40 transition-colors cursor-pointer"
                >
                  Մաքրել զտիչները
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
                {filteredTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className={`group px-3.5 sm:px-6 py-3.5 flex items-center justify-between gap-2.5 sm:gap-3 hover:bg-[#F8FAFC] dark:hover:bg-[#162033] transition-colors ${
                      editingTxId === tx.id
                        ? 'bg-[#EFF6FF] dark:bg-[#172554]/40'
                        : tx.isPending
                          ? 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06]'
                          : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
                      <span
                        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          tx.type === 'income'
                            ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                            : tx.isPending
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                              : 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
                        }`}
                        aria-hidden="true"
                      >
                        {tx.type === 'income' ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : tx.isPending ? (
                          <Clock className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                            {tx.title}
                          </p>
                          {tx.isPending && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                              <Clock className="w-2.5 h-2.5" />
                              <span>Նախածախս</span>
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1.5 truncate mt-0.5">
                          <span>
                            {tx.type === 'income'
                              ? `${INCOME_KIND_LABELS[getTransactionIncomeKind(tx)]} եկամուտ`
                              : tx.isPending
                                ? 'Սպասվող նախածախս'
                                : 'Ծախս'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{tx.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {formatShortDate(tx.date)}
                            {tx.date > todayISO ? ' (ապագա)' : ''}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      {tx.isPending ? (
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <span className="text-xs sm:text-sm font-semibold font-mono tabular-nums whitespace-nowrap text-amber-600 dark:text-amber-400">
                              (-{formatMoney(tx.amount, currency)})
                            </span>
                            <span className="block text-[10px] text-[#94A3B8] tabular-nums">
                              չհանված
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => onConfirmPreExpense(tx.id)}
                            className="min-h-[34px] px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-[#060B16] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shadow-xs"
                            title="Հաստատել որպես ծախս և հանել բալանսից"
                          >
                            <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                            <span>Հաստատել</span>
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`text-xs sm:text-sm font-semibold font-mono tabular-nums whitespace-nowrap mr-0.5 sm:mr-1 ${
                            tx.type === 'income'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-[#0F172A] dark:text-[#F8FAFC]'
                          }`}
                        >
                          {tx.type === 'income' ? '+' : '-'}
                          {formatMoney(tx.amount, currency)}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleStartEditTx(tx)}
                        aria-label={`Խմբագրել ${tx.title}`}
                        className="min-h-[36px] min-w-[36px] sm:min-h-[38px] sm:min-w-[38px] flex items-center justify-center rounded-xl text-[#94A3B8] lg:opacity-60 lg:group-hover:opacity-100 hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#E2E8F0]/60 dark:hover:bg-[#1E293B] transition-all cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (editingTxId === tx.id) resetComposer();
                          onDeleteTransaction(tx.id);
                        }}
                        aria-label={`Ջնջել ${tx.title}`}
                        className="min-h-[36px] min-w-[36px] sm:min-h-[38px] sm:min-w-[38px] flex items-center justify-center rounded-xl text-[#94A3B8] lg:opacity-60 lg:group-hover:opacity-100 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
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
    </div>
  );
}
