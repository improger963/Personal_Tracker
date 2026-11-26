import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  CheckSquare,
  Command,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  LayoutDashboard,
  Moon,
  NotebookPen,
  PiggyBank,
  Plus,
  Receipt,
  Search,
  Sparkles,
  Sun,
  Wallet,
  X,
} from 'lucide-react';
import {
  BankCard,
  Currency,
  DebtItem,
  NavSection,
  Note,
  SavingsGoal,
  Task,
  TaskPriority,
  Transaction,
} from '../types';
import { formatMoney, formatShortDate } from '../data/defaults';
import { computeCardStats } from '../utils/cardBalances';
import { SmartParsedAction, parseSmartCommand } from '../utils/smartCommandParser';
import { QuickModalMode } from './QuickAddModal';

interface CommandPaletteModalProps {
  onClose: () => void;
  currency: Currency;
  transactions: Transaction[];
  cards: BankCard[];
  tasks: Task[];
  notes: Note[];
  savingsGoals: SavingsGoal[];
  debts: DebtItem[];
  isDark: boolean;
  isPrivacyMode: boolean;
  onToggleTheme: () => void;
  onTogglePrivacy: () => void;
  onNavigate: (tab: NavSection) => void;
  onOpenNewModal: (mode: QuickModalMode) => void;
  onEditTransaction: (tx: Transaction) => void;
  onEditTask: (task: Task) => void;
  onEditNote: (note: Note) => void;
  onExportJSON: () => void;
  onExecuteSmartTransaction: (
    tx: Omit<Transaction, 'id' | 'createdAt'>
  ) => void;
  onExecuteSmartTask: (
    task: Omit<Task, 'id' | 'completed' | 'createdAt'>
  ) => void;
  onExecuteSmartNote: (note: Omit<Note, 'id' | 'updatedAt'>) => void;
}

interface ActionResultItem {
  id: string;
  label: string;
  subtitle: string;
  badge?: string;
  icon: typeof Search;
  iconClass: string;
  onRun: () => void;
}

const PRIORITY_BADGES: Record<TaskPriority, string> = {
  high: 'Կարևոր',
  medium: 'Միջին',
  low: 'Սովորական',
};

export function CommandPaletteModal({
  onClose,
  currency,
  transactions,
  cards,
  tasks,
  notes,
  savingsGoals,
  debts,
  isDark,
  isPrivacyMode,
  onToggleTheme,
  onTogglePrivacy,
  onNavigate,
  onOpenNewModal,
  onEditTransaction,
  onEditTask,
  onEditNote,
  onExportJSON,
  onExecuteSmartTransaction,
  onExecuteSmartTask,
  onExecuteSmartNote,
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const parsedCommand = useMemo<SmartParsedAction | null>(
    () => parseSmartCommand(query, transactions, cards),
    [query, transactions, cards]
  );

  const cardBalanceMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cards) {
      map.set(c.id, computeCardStats(c, transactions).currentBalance);
    }
    return map;
  }, [cards, transactions]);

  const executeParsed = (action: SmartParsedAction) => {
    if (action.kind === 'transaction') {
      onExecuteSmartTransaction({
        type: action.txType,
        incomeKind: action.txType === 'income' ? 'extra' : undefined,
        amount: action.amount,
        title: action.title,
        category: action.category,
        date: action.date,
        cardId: action.cardId,
      });
    } else if (action.kind === 'task') {
      onExecuteSmartTask({
        title: action.title,
        date: action.date,
        dueTime: action.dueTime,
        priority: action.priority,
        scheduleType: 'one_time',
      });
    } else {
      onExecuteSmartNote({
        title: action.title,
        content: action.content,
        pinned: false,
      });
    }
    onClose();
  };

  const results = useMemo<ActionResultItem[]>(() => {
    const q = query.trim().toLowerCase();
    const items: ActionResultItem[] = [];

    if (parsedCommand) {
      if (parsedCommand.kind === 'transaction') {
        items.push({
          id: 'smart-exec-tx',
          label: `${parsedCommand.txType === 'income' ? 'Գրանցել եկամուտ' : 'Գրանցել ծախս'}՝ ${parsedCommand.title}`,
          subtitle: `${formatMoney(parsedCommand.amount, currency)} · ${parsedCommand.category}${
            parsedCommand.cardLabel ? ` · ${parsedCommand.cardLabel}` : ''
          } · ${formatShortDate(parsedCommand.date)}`,
          badge: 'Enter ↵',
          icon: parsedCommand.txType === 'income' ? ArrowDownLeft : ArrowUpRight,
          iconClass:
            parsedCommand.txType === 'income'
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
          onRun: () => executeParsed(parsedCommand),
        });
      } else if (parsedCommand.kind === 'task') {
        items.push({
          id: 'smart-exec-task',
          label: `Ավելացնել անելիք՝ ${parsedCommand.title}`,
          subtitle: `${formatShortDate(parsedCommand.date)}${
            parsedCommand.dueTime ? `, ${parsedCommand.dueTime}` : ''
          } · ${PRIORITY_BADGES[parsedCommand.priority]}`,
          badge: 'Enter ↵',
          icon: CheckSquare,
          iconClass: 'bg-[#2563EB]/15 text-[#2563EB] dark:text-[#60A5FA]',
          onRun: () => executeParsed(parsedCommand),
        });
      } else {
        items.push({
          id: 'smart-exec-note',
          label: `Ստեղծել նշում՝ ${parsedCommand.title}`,
          subtitle: parsedCommand.content,
          badge: 'Enter ↵',
          icon: NotebookPen,
          iconClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
          onRun: () => executeParsed(parsedCommand),
        });
      }
    }

    const staticActions: ActionResultItem[] = [
      {
        id: 'act-new-tx',
        label: 'Նոր գործարք (եկամուտ / ծախս)',
        subtitle: 'Բացել գործարքների ավելացման պատուհանը',
        icon: Plus,
        iconClass: 'bg-[#2563EB]/12 text-[#2563EB] dark:text-[#60A5FA]',
        onRun: () => {
          onOpenNewModal('transaction');
          onClose();
        },
      },
      {
        id: 'act-new-task',
        label: 'Նոր անելիք',
        subtitle: 'Ավելացնել միանգամյա կամ կրկնվող առաջադրանք',
        icon: CheckSquare,
        iconClass: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
        onRun: () => {
          onOpenNewModal('task');
          onClose();
        },
      },
      {
        id: 'act-new-note',
        label: 'Նոր նշում կամ ցուցակ',
        subtitle: 'Արագ գրառում, գնումների ցուցակ կամ հիշեցում',
        icon: NotebookPen,
        iconClass: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
        onRun: () => {
          onOpenNewModal('note');
          onClose();
        },
      },
      {
        id: 'act-privacy',
        label: isPrivacyMode
          ? 'Անջատել գաղտնի ռեժիմը'
          : 'Միացնել գաղտնի ռեժիմը (Թաքցնել գումարները)',
        subtitle: 'Կոծկում է բոլոր մնացորդներն ու գումարները էկրանի վրա',
        badge: '⌘⇧H',
        icon: isPrivacyMode ? Eye : EyeOff,
        iconClass: 'bg-purple-500/12 text-purple-600 dark:text-purple-400',
        onRun: () => {
          onTogglePrivacy();
          onClose();
        },
      },
      {
        id: 'act-theme',
        label: isDark ? 'Անցնել լուսավոր թեմայի' : 'Անցնել մութ թեմայի',
        subtitle: 'Փոխել հավելվածի տեսքը',
        icon: isDark ? Sun : Moon,
        iconClass: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
        onRun: () => {
          onToggleTheme();
          onClose();
        },
      },
      {
        id: 'nav-overview',
        label: 'Բացել «Ընդհանուր» էջը',
        subtitle: 'Ամփոփ պատկեր, ֆոկուս և արագ մուտք',
        icon: LayoutDashboard,
        iconClass: 'bg-slate-500/12 text-[#475569] dark:text-[#94A3B8]',
        onRun: () => {
          onNavigate('overview');
          onClose();
        },
      },
      {
        id: 'nav-finance',
        label: 'Բացել «Ֆինանսներ» էջը',
        subtitle: 'Մատյան, բյուջեներ, քարտեր, նպատակներ և վերլուծություն',
        icon: Wallet,
        iconClass: 'bg-slate-500/12 text-[#475569] dark:text-[#94A3B8]',
        onRun: () => {
          onNavigate('finance');
          onClose();
        },
      },
      {
        id: 'nav-planner',
        label: 'Բացել «Անելիքներ» էջը',
        subtitle: 'Օրակարգ, սովորություններ և ֆոկուս թայմեր',
        icon: CalendarDays,
        iconClass: 'bg-slate-500/12 text-[#475569] dark:text-[#94A3B8]',
        onRun: () => {
          onNavigate('planner');
          onClose();
        },
      },
      {
        id: 'nav-notes',
        label: 'Բացել «Նշումներ» էջը',
        subtitle: 'Մտքեր, ցուցակներ և հիշեցումներ',
        icon: NotebookPen,
        iconClass: 'bg-slate-500/12 text-[#475569] dark:text-[#94A3B8]',
        onRun: () => {
          onNavigate('notes');
          onClose();
        },
      },
      {
        id: 'act-export-json',
        label: 'Արտահանել ամբողջ տվյալները (JSON)',
        subtitle: 'Պահեստային կրկնօրինակի ներբեռնում',
        icon: Download,
        iconClass: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
        onRun: () => {
          onExportJSON();
          onClose();
        },
      },
    ];

    if (!q) {
      return [...items, ...staticActions.slice(0, 7)];
    }

    for (const act of staticActions) {
      if (
        act.label.toLowerCase().includes(q) ||
        act.subtitle.toLowerCase().includes(q)
      ) {
        items.push(act);
      }
    }

    // Search Cards
    for (const c of cards) {
      if (
        c.name.toLowerCase().includes(q) ||
        (c.last4 && c.last4.includes(q))
      ) {
        const bal = cardBalanceMap.get(c.id) ?? c.initialBalance;
        items.push({
          id: `card-${c.id}`,
          label: c.name,
          subtitle: `Քարտ / դրամապանակ · Մնացորդ՝ ${formatMoney(bal, currency)}`,
          badge: 'Քարտ',
          icon: CreditCard,
          iconClass: 'bg-[#2563EB]/12 text-[#2563EB] dark:text-[#60A5FA]',
          onRun: () => {
            onNavigate('finance');
            onClose();
          },
        });
      }
    }

    // Search Transactions (latest 6 matches)
    const matchingTxs = transactions
      .filter(
        (tx) =>
          tx.title.toLowerCase().includes(q) ||
          tx.category.toLowerCase().includes(q) ||
          String(tx.amount).includes(q)
      )
      .slice(0, 6);

    for (const tx of matchingTxs) {
      items.push({
        id: `tx-${tx.id}`,
        label: tx.title,
        subtitle: `${tx.type === 'income' ? '+' : '-'}${formatMoney(tx.amount, currency)} · ${tx.category} · ${formatShortDate(tx.date)}`,
        badge: 'Խմբագրել',
        icon: Receipt,
        iconClass:
          tx.type === 'income'
            ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
            : 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
        onRun: () => {
          onEditTransaction(tx);
          onClose();
        },
      });
    }

    // Search Tasks (top 5 matches)
    const matchingTasks = tasks
      .filter((t) => t.title.toLowerCase().includes(q))
      .slice(0, 5);
    for (const t of matchingTasks) {
      items.push({
        id: `task-${t.id}`,
        label: t.title,
        subtitle: `${formatShortDate(t.date)}${t.dueTime ? `, ${t.dueTime}` : ''} · ${
          t.completed ? 'Կատարված' : PRIORITY_BADGES[t.priority]
        }`,
        badge: 'Անելիք',
        icon: CheckSquare,
        iconClass: 'bg-[#2563EB]/12 text-[#2563EB] dark:text-[#60A5FA]',
        onRun: () => {
          onEditTask(t);
          onClose();
        },
      });
    }

    // Search Notes (top 4 matches)
    const matchingNotes = notes
      .filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          (n.checklist ?? []).some((c) => c.text.toLowerCase().includes(q))
      )
      .slice(0, 4);
    for (const n of matchingNotes) {
      items.push({
        id: `note-${n.id}`,
        label: n.title || 'Առանց վերնագրի նշում',
        subtitle: n.content.slice(0, 72) || `${n.checklist?.length ?? 0} կետ`,
        badge: 'Նշում',
        icon: NotebookPen,
        iconClass: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
        onRun: () => {
          onEditNote(n);
          onClose();
        },
      });
    }

    // Search Goals & Debts
    for (const g of savingsGoals) {
      if (g.title.toLowerCase().includes(q)) {
        items.push({
          id: `goal-${g.id}`,
          label: g.title,
          subtitle: `Խնայողության նպատակ · ${formatMoney(g.currentAmount, currency)} / ${formatMoney(g.targetAmount, currency)}`,
          badge: 'Նպատակ',
          icon: PiggyBank,
          iconClass: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
          onRun: () => {
            onNavigate('finance');
            onClose();
          },
        });
      }
    }

    for (const d of debts) {
      if (
        d.person.toLowerCase().includes(q) ||
        (d.note && d.note.toLowerCase().includes(q))
      ) {
        items.push({
          id: `debt-${d.id}`,
          label: d.person,
          subtitle: `${d.direction === 'lent' ? 'Ինձ են պարտք' : 'Պարտք եմ'} · Մնացորդ՝ ${formatMoney(
            Math.max(0, d.totalAmount - d.paidAmount),
            currency
          )}`,
          badge: 'Պարտք',
          icon: Wallet,
          iconClass: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
          onRun: () => {
            onNavigate('finance');
            onClose();
          },
        });
      }
    }

    return items;
  }, [
    query,
    parsedCommand,
    currency,
    cards,
    cardBalanceMap,
    transactions,
    tasks,
    notes,
    savingsGoals,
    debts,
    isDark,
    isPrivacyMode,
    onClose,
    onEditNote,
    onEditTask,
    onEditTransaction,
    onExportJSON,
    onNavigate,
    onOpenNewModal,
    onTogglePrivacy,
    onToggleTheme,
  ]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          results.length === 0 ? 0 : (prev + 1) % results.length
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          results.length === 0
            ? 0
            : (prev - 1 + results.length) % results.length
        );
      } else if (e.key === 'Enter' && results.length > 0) {
        e.preventDefault();
        const item = results[selectedIndex] ?? results[0];
        item?.onRun();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, results, selectedIndex]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[#080C14]/70 backdrop-blur-xs p-3 sm:p-6 pt-[8vh] sm:pt-[12vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Արագ որոնում և հրամանների վահանակ"
    >
      <div className="w-full max-w-xl bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-2xl shadow-2xl overflow-hidden">
        {/* Search & Smart Command Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#E2E8F0] dark:border-[#1E293B]">
          <Search className="w-4.5 h-4.5 text-[#2563EB] dark:text-[#60A5FA] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Գրեք «սուրճ 1500», «+ավանս 80000», «անելիք զանգել 16:00» կամ փնտրեք…"
            className="flex-1 min-w-0 bg-transparent text-sm text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] dark:placeholder:text-[#64748B] focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Մաքրել"
              className="min-h-[28px] min-w-[28px] flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-[#F1F5F9] dark:bg-[#1E293B] text-[10px] font-mono text-[#64748B] dark:text-[#94A3B8]">
              <Command className="w-2.5 h-2.5" />K
            </kbd>
          )}
        </div>

        {/* Helpful Hint Strip */}
        <div className="px-4 py-2 bg-[#F8FAFC] dark:bg-[#0B1120] border-b border-[#E2E8F0] dark:border-[#1E293B] flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
          <span className="inline-flex items-center gap-1 font-medium text-[#2563EB] dark:text-[#60A5FA]">
            <Sparkles className="w-3 h-3" />
            Խելացի մուտք.
          </span>
          <button
            type="button"
            onClick={() => setQuery('սուրճ 1500')}
            className="hover:text-[#0F172A] dark:hover:text-[#F8FAFC] cursor-pointer"
          >
            «սուրճ 1500»
          </button>
          <button
            type="button"
            onClick={() => setQuery('+բոնուս 50000')}
            className="hover:text-[#0F172A] dark:hover:text-[#F8FAFC] cursor-pointer"
          >
            «+բոնուս 50000»
          </button>
          <button
            type="button"
            onClick={() => setQuery('անելիք զանգել բժշկին 16:30 !')}
            className="hover:text-[#0F172A] dark:hover:text-[#F8FAFC] cursor-pointer"
          >
            «անելիք զանգել 16:30 !»
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[54vh] overflow-y-auto scroll-container p-2 space-y-1">
          {results.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#64748B] dark:text-[#94A3B8]">
              Որոնման արդյունքներ չգտնվեցին
            </div>
          ) : (
            results.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={item.onRun}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#EFF6FF] dark:bg-[#172554]/60'
                      : 'hover:bg-[#F8FAFC] dark:hover:bg-[#111A2E]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${item.iconClass}`}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                        {item.label}
                      </p>
                      <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate tabular-nums">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  {item.badge && (
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-white dark:bg-[#0B1120] border border-[#E2E8F0] dark:border-[#26334D] text-[#475569] dark:text-[#CBD5E1] shrink-0">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
