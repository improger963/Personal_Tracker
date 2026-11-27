import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Bot,
  Calculator,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  Command,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  Flame,
  HandCoins,
  HelpCircle,
  LayoutDashboard,
  Loader2,
  Mic,
  Moon,
  NotebookPen,
  PiggyBank,
  Plus,
  Receipt,
  Search,
  Square,
  Sun,
  Target,
  Timer,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import {
  BankCard,
  Currency,
  DebtItem,
  NavSection,
  Note,
  PlannerPageTab,
  SavingsGoal,
  Task,
  TaskPriority,
  Transaction,
} from '../types';
import { FinancePageTab } from './finance/financeShared';
import { formatMoney, formatShortDate, getTodayISO } from '../data/defaults';
import { computeCardStats } from '../utils/cardBalances';
import { SmartParsedAction, parseSmartCommand } from '../utils/smartCommandParser';
import {
  AISmartParsedItem,
  parseCommandWithAI,
  transcribeAudioWithAI,
} from '../services/smartAi';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
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
  onNavigateFinance: (page: FinancePageTab) => void;
  onNavigatePlanner: (page: PlannerPageTab) => void;
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
  onOpenAssistant: (initialPrompt?: string) => void;
  onOpenShortcutsGuide?: () => void;
}

interface ActionResultItem {
  id: string;
  label: string;
  subtitle: string;
  badge?: string;
  sensitive?: boolean;
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
  onNavigateFinance,
  onNavigatePlanner,
  onOpenNewModal,
  onEditTransaction,
  onEditTask,
  onEditNote,
  onExportJSON,
  onExecuteSmartTransaction,
  onExecuteSmartTask,
  onExecuteSmartNote,
  onOpenAssistant,
  onOpenShortcutsGuide,
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [aiParsedItems, setAiParsedItems] = useState<AISmartParsedItem[]>([]);
  const [aiParsing, setAiParsing] = useState(false);
  const [aiParseError, setAiParseError] = useState('');
  const [voiceTranscribing, setVoiceTranscribing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  const voiceRecorder = useVoiceRecorder();

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      aiAbortRef.current?.abort();
    };
  }, []);

  const parsedCommand = useMemo<SmartParsedAction | null>(
    () => parseSmartCommand(query, transactions, cards),
    [query, transactions, cards]
  );

  const handleRunAIParse = async (overrideText?: string) => {
    const trimmed = (overrideText ?? query).trim();
    if (trimmed.length < 3 || aiParsing) return;
    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    setAiParsing(true);
    setAiParseError('');
    try {
      const items = await parseCommandWithAI({
        text: trimmed,
        todayISO: getTodayISO(),
        cardNames: cards.map((c) => c.name),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setAiParsedItems(items);
      if (items.length === 0) {
        setAiParseError('Առարկայական գործարք կամ անելիք չգտնվեց։ Կարող եք հարցնել AI օգնականին։');
      } else {
        setSelectedIndex(parsedCommand ? 1 : 0);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setAiParseError(
        err instanceof Error ? err.message : 'Հնարավոր չեղավ վերլուծել AI-ով։'
      );
    } finally {
      if (aiAbortRef.current === controller) {
        setAiParsing(false);
        aiAbortRef.current = null;
      }
    }
  };

  const handleVoiceCommandToggle = async () => {
    setAiParseError('');
    if (voiceRecorder.isRecording) {
      const payload = await voiceRecorder.stopRecording();
      if (!payload) return;
      setVoiceTranscribing(true);
      try {
        const transcribed = await transcribeAudioWithAI({
          audioBase64: payload.audioBase64,
          mimeType: payload.mimeType,
        });
        setQuery(transcribed);
        void handleRunAIParse(transcribed);
      } catch (err) {
        setAiParseError(
          err instanceof Error
            ? err.message
            : 'Չհաջողվեց վերծանել ձայնային հրամանը։'
        );
      } finally {
        setVoiceTranscribing(false);
      }
    } else {
      await voiceRecorder.startRecording();
    }
  };

  const executeAIItem = (item: AISmartParsedItem) => {
    const today = getTodayISO();
    if (item.kind === 'transaction' && item.amount && item.amount > 0) {
      const matchedCard = item.cardHint
        ? cards.find(
            (c) =>
              c.name.toLowerCase().includes(item.cardHint!.toLowerCase()) ||
              (item.cardHint!.toLowerCase().includes('կանխիկ') && c.cardType === 'cash')
          )
        : cards.find((c) => c.isDefault) || cards[0];
      onExecuteSmartTransaction({
        type: item.txType === 'income' ? 'income' : 'expense',
        incomeKind: item.txType === 'income' ? 'extra' : undefined,
        amount: item.amount,
        title: item.title,
        category: item.category || 'Այլ',
        date: item.date || today,
        cardId: matchedCard?.id,
      });
    } else if (item.kind === 'task') {
      onExecuteSmartTask({
        title: item.title,
        date: item.date || today,
        dueTime: item.dueTime,
        priority: item.priority || 'medium',
        scheduleType: 'one_time',
      });
    } else {
      onExecuteSmartNote({
        title: item.title,
        content: item.content || item.title,
        pinned: false,
      });
    }
    onClose();
  };

  const cardBalanceMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cards) {
      map.set(c.id, computeCardStats(c, transactions).currentBalance);
    }
    return map;
  }, [cards, transactions]);

  const executeParsed = (action: SmartParsedAction) => {
    if (action.kind === 'transaction') {
      const fallbackCardId =
        cards.find((c) => c.isDefault)?.id ?? cards[0]?.id;
      onExecuteSmartTransaction({
        type: action.txType,
        incomeKind: action.txType === 'income' ? 'extra' : undefined,
        amount: action.amount,
        title: action.title,
        category: action.category,
        date: action.date,
        cardId: action.cardId ?? fallbackCardId,
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
          sensitive: true,
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

    if (aiParsedItems.length > 0) {
      aiParsedItems.forEach((item, idx) => {
        if (item.kind === 'transaction' && item.amount) {
          items.push({
            id: `ai-parsed-${idx}`,
            label: `AI · ${item.txType === 'income' ? 'Եկամուտ' : 'Ծախս'}՝ ${item.title}`,
            subtitle: `${formatMoney(item.amount, currency)} · ${item.category || 'Այլ'}${
              item.cardHint ? ` · ${item.cardHint}` : ''
            } · ${formatShortDate(item.date || getTodayISO())}`,
            badge: 'AI',
            sensitive: true,
            icon: item.txType === 'income' ? ArrowDownLeft : ArrowUpRight,
            iconClass:
              item.txType === 'income'
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
            onRun: () => executeAIItem(item),
          });
        } else if (item.kind === 'task') {
          items.push({
            id: `ai-parsed-${idx}`,
            label: `AI · Անելիք՝ ${item.title}`,
            subtitle: `${formatShortDate(item.date || getTodayISO())}${
              item.dueTime ? `, ${item.dueTime}` : ''
            } · ${PRIORITY_BADGES[item.priority || 'medium']}`,
            badge: 'AI',
            icon: CheckSquare,
            iconClass: 'bg-[#2563EB]/15 text-[#2563EB] dark:text-[#60A5FA]',
            onRun: () => executeAIItem(item),
          });
        } else {
          items.push({
            id: `ai-parsed-${idx}`,
            label: `AI · Նշում՝ ${item.title}`,
            subtitle: item.content || item.title,
            badge: 'AI',
            icon: NotebookPen,
            iconClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
            onRun: () => executeAIItem(item),
          });
        }
      });
    }

    const staticActions: ActionResultItem[] = [
      {
        id: 'act-ai-assistant',
        label: query.trim()
          ? `Հարցնել AI օգնականին՝ «${query.trim().slice(0, 40)}»`
          : 'Բացել խելացի AI օգնականը',
        subtitle: 'Խորհուրդներ, բյուջեի վերլուծություն և անհատական պլանավորում',
        badge: 'AI',
        icon: Bot,
        iconClass: 'bg-[#2563EB]/15 text-[#2563EB] dark:text-[#60A5FA]',
        onRun: () => {
          onOpenAssistant(query.trim() || undefined);
          onClose();
        },
      },
      {
        id: 'act-affordability-sim',
        label: 'Կարո՞ղ եմ թույլ տալ գնումը (Սիմուլյատոր)',
        subtitle: 'Ստուգեք խոշոր գնման կամ ապառիկի ազդեցությունը ազատ միջոցների վրա',
        badge: 'Բյուջե',
        icon: Calculator,
        iconClass: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
        onRun: () => {
          onNavigateFinance('budgets');
          onClose();
        },
      },
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
        subtitle: 'Ամփոփ պատկեր, բալանս և օրվա ռիթմ',
        icon: LayoutDashboard,
        iconClass: 'bg-slate-500/12 text-[#475569] dark:text-[#94A3B8]',
        onRun: () => {
          onNavigate('overview');
          onClose();
        },
      },
      {
        id: 'nav-fin-ledger',
        label: 'Ֆինանսներ · Գործարքների մատյան',
        subtitle: 'Մուտքեր, ելքեր և քաղվածք',
        icon: Receipt,
        iconClass: 'bg-slate-500/12 text-[#475569] dark:text-[#94A3B8]',
        onRun: () => {
          onNavigateFinance('ledger');
          onClose();
        },
      },
      {
        id: 'nav-fin-cards',
        label: 'Ֆինանսներ · Քարտեր և դրամապանակներ',
        subtitle: 'Հաշիվների մնացորդներ և ներքին փոխանցումներ',
        icon: CreditCard,
        iconClass: 'bg-slate-500/12 text-[#475569] dark:text-[#94A3B8]',
        onRun: () => {
          onNavigateFinance('cards');
          onClose();
        },
      },
      {
        id: 'nav-fin-budgets',
        label: 'Ֆինանսներ · Բյուջե և աշխատավարձային ցիկլ',
        subtitle: 'Կատեգորիաների սահմանաչափեր և Safe-to-Spend',
        icon: Target,
        iconClass: 'bg-slate-500/12 text-[#475569] dark:text-[#94A3B8]',
        onRun: () => {
          onNavigateFinance('budgets');
          onClose();
        },
      },
      {
        id: 'nav-fin-bills',
        label: 'Ֆինանսներ · Կրկնվող վճարներ',
        subtitle: 'Ամսական, ամենօրյա և պլանային վճարումներ',
        icon: CalendarClock,
        iconClass: 'bg-slate-500/12 text-[#475569] dark:text-[#94A3B8]',
        onRun: () => {
          onNavigateFinance('bills');
          onClose();
        },
      },
      {
        id: 'nav-fin-goals',
        label: 'Ֆինանսներ · Խնայողության նպատակներ',
        subtitle: 'Գանձանակներ և կանխատեսման հաշվիչ',
        icon: PiggyBank,
        iconClass: 'bg-slate-500/12 text-[#475569] dark:text-[#94A3B8]',
        onRun: () => {
          onNavigateFinance('goals');
          onClose();
        },
      },
      {
        id: 'nav-fin-debts',
        label: 'Ֆինանսներ · Պարտքեր և փոխառություններ',
        subtitle: 'Տրված և վերցված գումարների վերահսկում',
        icon: HandCoins,
        iconClass: 'bg-slate-500/12 text-[#475569] dark:text-[#94A3B8]',
        onRun: () => {
          onNavigateFinance('debts');
          onClose();
        },
      },
      {
        id: 'nav-fin-analytics',
        label: 'Ֆինանսներ · Վերլուծություն և հաշվետվություններ',
        subtitle: 'Դինամիկա, AI խորհուրդներ, 50/30/20 և PDF արտահանում',
        icon: BarChart3,
        iconClass: 'bg-slate-500/12 text-[#475569] dark:text-[#94A3B8]',
        onRun: () => {
          onNavigateFinance('analytics');
          onClose();
        },
      },
      {
        id: 'nav-plan-tasks',
        label: 'Օրակարգ · Անելիքներ',
        subtitle: 'Առաջադրանքներ և ժամանակացույց',
        icon: CalendarDays,
        iconClass: 'bg-slate-500/12 text-[#475569] dark:text-[#94A3B8]',
        onRun: () => {
          onNavigatePlanner('tasks');
          onClose();
        },
      },
      {
        id: 'nav-plan-habits',
        label: 'Օրակարգ · Սովորություններ',
        subtitle: '7-օրյա մատրից և սերիաներ',
        icon: Flame,
        iconClass: 'bg-slate-500/12 text-[#475569] dark:text-[#94A3B8]',
        onRun: () => {
          onNavigatePlanner('habits');
          onClose();
        },
      },
      {
        id: 'nav-plan-focus',
        label: 'Օրակարգ · Ֆոկուս թայմեր',
        subtitle: 'Պոմոդորո և կենտրոնացման սեսիաներ',
        icon: Timer,
        iconClass: 'bg-slate-500/12 text-[#475569] dark:text-[#94A3B8]',
        onRun: () => {
          onNavigatePlanner('focus');
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
      ...(onOpenShortcutsGuide
        ? [
            {
              id: 'act-shortcuts-guide',
              label: 'Ստեղնաշարային դյուրանցումներ և խելացի մուտք',
              subtitle: 'Արագ ստեղներ և հրամանների օրինակներ',
              badge: '?',
              icon: HelpCircle,
              iconClass: 'bg-[#2563EB]/12 text-[#2563EB] dark:text-[#60A5FA]',
              onRun: () => {
                onClose();
                onOpenShortcutsGuide();
              },
            },
          ]
        : []),
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
          sensitive: true,
          icon: CreditCard,
          iconClass: 'bg-[#2563EB]/12 text-[#2563EB] dark:text-[#60A5FA]',
          onRun: () => {
            onNavigateFinance('cards');
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
        sensitive: true,
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
          sensitive: true,
          icon: PiggyBank,
          iconClass: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
          onRun: () => {
            onNavigateFinance('goals');
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
          sensitive: true,
          icon: Wallet,
          iconClass: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
          onRun: () => {
            onNavigateFinance('debts');
            onClose();
          },
        });
      }
    }

    return items;
  }, [
    query,
    parsedCommand,
    aiParsedItems,
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
    onExecuteSmartNote,
    onExecuteSmartTask,
    onExecuteSmartTransaction,
    onExportJSON,
    onNavigate,
    onNavigateFinance,
    onNavigatePlanner,
    onOpenAssistant,
    onOpenNewModal,
    onOpenShortcutsGuide,
    onTogglePrivacy,
    onToggleTheme,
  ]);

  useEffect(() => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setAiParsing(false);
    setSelectedIndex(0);
    setAiParsedItems([]);
    setAiParseError('');
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
        if (e.target instanceof HTMLButtonElement) return;
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
      className="fixed inset-0 z-50 flex items-start justify-center bg-[#080C14]/70 backdrop-blur-xs p-2.5 sm:p-6 pt-[4vh] sm:pt-[12vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Արագ որոնում և հրամանների վահանակ"
    >
      <div className="w-full max-w-xl max-h-[86dvh] sm:max-h-[78dvh] flex flex-col bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-2xl shadow-2xl overflow-hidden">
        {/* Search & Smart Command Input */}
        <div className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-3 sm:py-3.5 border-b border-[#E2E8F0] dark:border-[#1E293B] shrink-0">
          <Search className="w-4.5 h-4.5 text-[#2563EB] dark:text-[#60A5FA] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              voiceRecorder.isRecording
                ? 'Լսում եմ… թելադրեք գործարք կամ անելիք'
                : voiceTranscribing
                  ? 'Ձայնագրությունը վերլուծվում է…'
                  : 'Գրեք «սուրճ 1500», «+ավանս 80000», «անելիք զանգել 16:00» կամ թելադրեք…'
            }
            className="flex-1 min-w-0 bg-transparent text-sm text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] dark:placeholder:text-[#64748B] focus:outline-none"
          />
          {voiceRecorder.isSupported && (
            <button
              type="button"
              disabled={voiceTranscribing || aiParsing}
              onClick={() => void handleVoiceCommandToggle()}
              aria-label={
                voiceRecorder.isRecording
                  ? 'Կանգնեցնել ձայնագրությունը'
                  : 'Թելադրել հրաման ձայնով'
              }
              title="Թելադրել հրաման ձայնով"
              className={`min-h-[30px] px-2 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0 transition-colors disabled:opacity-50 ${
                voiceRecorder.isRecording
                  ? 'bg-rose-600 border-rose-600 text-white'
                  : 'border-[#E2E8F0] dark:border-[#26334D] bg-[#F8FAFC] dark:bg-[#0B1120] text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB]'
              }`}
            >
              {voiceTranscribing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : voiceRecorder.isRecording ? (
                <>
                  <Square className="w-3 h-3 fill-current" />
                  <span className="font-mono tabular-nums">{voiceRecorder.elapsedSec}վ</span>
                </>
              ) : (
                <Mic className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
              )}
            </button>
          )}
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
        <div className="px-4 py-2 bg-[#F8FAFC] dark:bg-[#0B1120] border-b border-[#E2E8F0] dark:border-[#1E293B] flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1 font-medium text-[#1D4ED8] dark:text-[#60A5FA]">
              <Zap className="w-3 h-3" />
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
          {query.trim().length >= 3 && (
            <button
              type="button"
              onClick={() => void handleRunAIParse()}
              disabled={aiParsing}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-[#1D4ED8] dark:text-[#60A5FA] font-semibold hover:border-[#2563EB] cursor-pointer disabled:opacity-50"
            >
              {aiParsing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Bot className="w-3 h-3" />
              )}
              <span>{aiParsing ? 'Վերլուծում է…' : 'Հասկանալ AI-ով'}</span>
            </button>
          )}
        </div>
        {(aiParseError || voiceRecorder.error) && (
          <div className="px-4 py-2 bg-amber-500/8 border-b border-[#E2E8F0] dark:border-[#1E293B] text-[11px] text-amber-700 dark:text-amber-300">
            {aiParseError || voiceRecorder.error}
          </div>
        )}

        {/* Results */}
        <div className="flex-1 min-h-0 overflow-y-auto scroll-container p-2 space-y-1">
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
                      <p
                        className={`text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate tabular-nums ${
                          item.sensitive ? 'pa-sensitive' : ''
                        }`}
                      >
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
