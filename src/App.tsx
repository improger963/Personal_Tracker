import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { RotateCcw, X } from 'lucide-react';
import { TopNav } from './components/TopNav';
import type { QuickModalMode, QuickModalState } from './components/QuickAddModal';
import {
  FinancePageTab,
  normalizeFinancePageTab,
} from './components/finance/financeShared';
import { NotificationAlerts } from './components/NotificationAlerts';
import {
  PageSkeleton,
  ScrollToTopButton,
  TopRouteProgressBar,
} from './components/ui/Skeleton';
import { AppLockGate, AppLockSettingsModal } from './components/AppLockGate';
import { CloudMergeModal } from './components/CloudMergeModal';
import { STORAGE_KEYS } from './constants/storageKeys';
import { scrollToTopInstant, scrollToTopSmooth } from './utils/scroll';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useOnlineStatus, usePWAInstall } from './hooks/usePWAInstall';
import { useAppLock } from './hooks/useAppLock';
import { useWorkspaceCloudSync } from './hooks/useWorkspaceCloudSync';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { triggerMilestoneConfetti } from './utils/confetti';

const loadOverviewView = () =>
  import('./components/OverviewView').then((m) => ({ default: m.OverviewView }));
const loadFinanceView = () =>
  import('./components/FinanceView').then((m) => ({ default: m.FinanceView }));
const loadPlannerView = () =>
  import('./components/PlannerView').then((m) => ({ default: m.PlannerView }));
const loadNotesView = () =>
  import('./components/NotesView').then((m) => ({ default: m.NotesView }));

const OverviewView = lazy(loadOverviewView);
const FinanceView = lazy(loadFinanceView);
const PlannerView = lazy(loadPlannerView);
const NotesView = lazy(loadNotesView);

const QuickAddModal = lazy(() =>
  import('./components/QuickAddModal').then((m) => ({ default: m.QuickAddModal }))
);
const ConfirmExpenseModal = lazy(() =>
  import('./components/ConfirmExpenseModal').then((m) => ({
    default: m.ConfirmExpenseModal,
  }))
);
const PWAInstallModal = lazy(() =>
  import('./components/PWAInstallModal').then((m) => ({
    default: m.PWAInstallModal,
  }))
);
const CommandPaletteModal = lazy(() =>
  import('./components/CommandPaletteModal').then((m) => ({
    default: m.CommandPaletteModal,
  }))
);
const SmartAssistantModal = lazy(() =>
  import('./components/SmartAssistantModal').then((m) => ({
    default: m.SmartAssistantModal,
  }))
);
const ShortcutsGuideModal = lazy(() =>
  import('./components/ShortcutsGuideModal').then((m) => ({
    default: m.ShortcutsGuideModal,
  }))
);
import { buildSmartWorkspaceContext, fetchLiveFxRates } from './services/smartAi';
import {
  ARMENIAN_MONTHS,
  formatMoney,
  getInitialBudgets,
  getInitialCards,
  getInitialDebts,
  getInitialFocusSessions,
  getInitialHabits,
  getInitialNotes,
  getInitialNotificationSettings,
  getInitialPrimaryIncome,
  getInitialRecurringBills,
  getInitialSavingsGoals,
  getInitialTasks,
  getInitialTransactions,
  getTodayISO,
  getTransactionIncomeKind,
  normalizeNotificationSettings,
} from './data/defaults';
import {
  computeCycleFinancials,
  computeSafeToSpend,
  formatCycleLabel,
  getCycleBounds,
  getCycleDayMetrics,
  getCycleKeyForDate,
  getDateInCycleForDay,
  getEffectivePayday,
  shiftMonthKey,
} from './utils/financialCycle';
import {
  buildAppNotifications,
  canUseBrowserNotifications,
  formatNotificationForSpeech,
  getBillFrequency,
  getCurrentHHMM,
  playNotificationAlertSequence,
  playNotificationChime,
  sendBrowserNotification,
  speakNotificationText,
} from './utils/notifications';
import {
  isTaskCompletedOnDate,
  isTaskDueOnDate,
  isTaskRepeating,
} from './utils/taskSchedule';
import {
  FxRatesToAmd,
  INTERNAL_TRANSFER_CATEGORY,
  convertToAMD,
  formatCardMoney,
  getTotalCardsInitialBalanceAMD,
  normalizeCardCurrency,
} from './utils/cardBalances';
import { computeNetWorthAndRunway } from './utils/netWorthAndRunway';
import { isMonthlyBillSettledForCycle } from './utils/recurringBills';
import { sanitizeBackupPayload } from './utils/backupValidation';
import {
  AppNotificationItem,
  BankCard,
  BudgetLimit,
  CustomCategory,
  DebtItem,
  FocusGoal,
  FocusSession,
  Habit,
  IncomeKind,
  NavSection,
  Note,
  NotificationSettings,
  PlannerPageTab,
  PrimaryIncomeConfig,
  RecurringBill,
  SavingsGoal,
  Task,
  TaskPriority,
  Transaction,
} from './types';

const ARMENIAN_WEEKDAYS_FULL = [
  'Կիրակի',
  'Երկուշաբթի',
  'Երեքշաբթի',
  'Չորեքշաբթի',
  'Հինգշաբթի',
  'Ուրբաթ',
  'Շաբաթ',
];

type UndoToastState = {
  id: number;
  message: string;
  onUndo?: () => void;
  actionLabel?: string;
};

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getTodayEditorialDate(): string {
  const now = new Date();
  return `${ARMENIAN_WEEKDAYS_FULL[now.getDay()]}, ${now.getDate()} ${ARMENIAN_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

export default function App() {
  const prefersReducedMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState<NavSection>('overview');
  const [rawFinancePage, setRawFinancePage] = useLocalStorage<string>(
    STORAGE_KEYS.FINANCE_ACTIVE_PAGE,
    'ledger'
  );
  const financePage = useMemo(
    () => normalizeFinancePageTab(rawFinancePage),
    [rawFinancePage]
  );
  const [plannerPage, setPlannerPage] = useLocalStorage<PlannerPageTab>(
    STORAGE_KEYS.PLANNER_ACTIVE_PAGE,
    'tasks'
  );
  const [isRouteTransitioning, setIsRouteTransitioning] = useState(false);
  const routeTimerRef = useRef<number | null>(null);
  const [todayKey, setTodayKey] = useState<string>(getTodayISO);
  const [currentHHMM, setCurrentHHMM] = useState<string>(() => getCurrentHHMM());
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isDark, setIsDark] = useLocalStorage<boolean>(STORAGE_KEYS.THEME_DARK, true);

  const triggerRouteTransition = useCallback(() => {
    setIsRouteTransitioning(true);
    if (routeTimerRef.current) window.clearTimeout(routeTimerRef.current);
    routeTimerRef.current = window.setTimeout(() => {
      setIsRouteTransitioning(false);
    }, 280);
  }, []);

  const handleSelectTab = useCallback(
    (tab: NavSection) => {
      setActiveTab((prev) => {
        if (tab === prev) {
          scrollToTopSmooth();
          return prev;
        }
        triggerRouteTransition();
        return tab;
      });
    },
    [triggerRouteTransition]
  );

  const handleSelectFinancePage = useCallback(
    (page: FinancePageTab) => {
      if (activeTab === 'finance' && financePage === page) {
        scrollToTopSmooth();
        return;
      }
      setRawFinancePage(page);
      setActiveTab('finance');
      triggerRouteTransition();
    },
    [activeTab, financePage, setRawFinancePage, triggerRouteTransition]
  );

  const handleSelectPlannerPage = useCallback(
    (page: PlannerPageTab) => {
      if (activeTab === 'planner' && plannerPage === page) {
        scrollToTopSmooth();
        return;
      }
      setPlannerPage(page);
      setActiveTab('planner');
      triggerRouteTransition();
    },
    [activeTab, plannerPage, setPlannerPage, triggerRouteTransition]
  );

  useEffect(() => {
    return () => {
      if (routeTimerRef.current) window.clearTimeout(routeTimerRef.current);
    };
  }, []);

  // Prefetch lazy view chunks during idle time for instant tab transitions
  useEffect(() => {
    const prefetchAll = () => {
      void loadOverviewView();
      void loadFinanceView();
      void loadPlannerView();
      void loadNotesView();
    };
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === 'function') {
      const id = win.requestIdleCallback(prefetchAll, { timeout: 2000 });
      return () => {
        win.cancelIdleCallback?.(id);
      };
    }
    const timer = window.setTimeout(prefetchAll, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  const [primaryIncome, setPrimaryIncome] = useLocalStorage<PrimaryIncomeConfig>(
    STORAGE_KEYS.PRIMARY_INCOME,
    getInitialPrimaryIncome
  );
  const effectivePayday = getEffectivePayday(primaryIncome);

  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    getCycleKeyForDate(getTodayISO(), effectivePayday)
  );

  const [transactions, setTransactions] = useLocalStorage<Transaction[]>(
    STORAGE_KEYS.TRANSACTIONS,
    getInitialTransactions
  );
  const [cards, setCards] = useLocalStorage<BankCard[]>(
    STORAGE_KEYS.CARDS,
    getInitialCards
  );
  const [tasks, setTasks] = useLocalStorage<Task[]>(
    STORAGE_KEYS.TASKS,
    getInitialTasks
  );
  const [notes, setNotes] = useLocalStorage<Note[]>(
    STORAGE_KEYS.NOTES,
    getInitialNotes
  );
  const [budgets, setBudgets] = useLocalStorage<BudgetLimit[]>(
    STORAGE_KEYS.BUDGETS,
    getInitialBudgets
  );
  const [recurringBills, setRecurringBills] = useLocalStorage<RecurringBill[]>(
    STORAGE_KEYS.RECURRING_BILLS,
    getInitialRecurringBills
  );
  const [habits, setHabits] = useLocalStorage<Habit[]>(
    STORAGE_KEYS.HABITS,
    getInitialHabits
  );
  const [savingsGoals, setSavingsGoals] = useLocalStorage<SavingsGoal[]>(
    STORAGE_KEYS.SAVINGS_GOALS,
    getInitialSavingsGoals
  );
  const [debts, setDebts] = useLocalStorage<DebtItem[]>(
    STORAGE_KEYS.DEBTS,
    getInitialDebts
  );
  const [focusSessions, setFocusSessions] = useLocalStorage<FocusSession[]>(
    STORAGE_KEYS.FOCUS_SESSIONS,
    getInitialFocusSessions
  );
  const [focusGoal, setFocusGoal] = useLocalStorage<FocusGoal | null>(
    STORAGE_KEYS.FOCUS_GOAL,
    null
  );
  const [customCategories, setCustomCategories] = useLocalStorage<CustomCategory[]>(
    STORAGE_KEYS.CUSTOM_CATEGORIES,
    []
  );
  const [rawNotificationSettings, setNotificationSettings] =
    useLocalStorage<NotificationSettings>(
      STORAGE_KEYS.NOTIFICATION_SETTINGS,
      getInitialNotificationSettings
    );
  const notificationSettings = useMemo(
    () => normalizeNotificationSettings(rawNotificationSettings),
    [rawNotificationSettings]
  );
  const [snoozedUntilMap, setSnoozedUntilMap] = useLocalStorage<
    Record<string, number>
  >(STORAGE_KEYS.NOTIF_SNOOZED, {});
  const [dismissedBannerIds, setDismissedBannerIds] = useState<string[]>([]);
  const [confirmModalState, setConfirmModalState] = useState<{
    bill: RecurringBill;
    slotKey: string;
    dateISO: string;
    item?: AppNotificationItem;
  } | null>(null);

  const isOnline = useOnlineStatus();
  const {
    canInstall: canInstallPWA,
    showIOSGuide,
    setShowIOSGuide,
    promptInstall,
  } = usePWAInstall();

  const [isPrivacyMode, setIsPrivacyMode] = useLocalStorage<boolean>(
    STORAGE_KEYS.PRIVACY_MODE,
    false
  );
  const [liveFxRates, setLiveFxRates] = useState<FxRatesToAmd | null>(null);
  const appLock = useAppLock();
  const [appLockSettingsOpen, setAppLockSettingsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsGuideOpen, setShortcutsGuideOpen] = useState(false);
  const [assistantModalState, setAssistantModalState] = useState<{
    open: boolean;
    initialPrompt?: string;
  }>({ open: false });
  const [modalState, setModalState] = useState<QuickModalState | null>(null);
  const [toast, setToast] = useState<UndoToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const alertedIdsRef = useRef<Set<string>>(new Set());

  const showToast = useCallback(
    (message: string, onUndo?: () => void, actionLabel?: string) => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      setToast({ id: Date.now(), message, onUndo, actionLabel });
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
      }, 5000);
    },
    []
  );

  const {
    user,
    syncStatus,
    cloudConflict,
    resolvingConflict,
    resolveMergeConflict,
    resolveUseCloudOnly,
    downloadConflictLocalBackup,
    handleSignInGoogle,
    handleSignOutGoogle,
  } = useWorkspaceCloudSync({
    transactions,
    setTransactions,
    cards,
    setCards,
    tasks,
    setTasks,
    notes,
    setNotes,
    budgets,
    setBudgets,
    recurringBills,
    setRecurringBills,
    habits,
    setHabits,
    savingsGoals,
    setSavingsGoals,
    debts,
    setDebts,
    focusSessions,
    setFocusSessions,
    primaryIncome,
    setPrimaryIncome,
    focusGoal,
    setFocusGoal,
    notificationSettings,
    setNotificationSettings,
    isDark,
    setIsDark,
    customCategories,
    setCustomCategories,
    showToast,
  });

  useEffect(() => {
    let active = true;
    fetchLiveFxRates()
      .then((res) => {
        if (active && res?.rates) {
          setLiveFxRates(res.rates);
        }
      })
      .catch(() => {
        // Fallback FX rates from cardBalances.ts remain active when offline
      });
    return () => {
      active = false;
    };
  }, []);

  // Minute-boundary aligned clock sync (no wasted 15s full-App re-renders)
  useEffect(() => {
    let timeoutId: number | null = null;
    const syncClock = () => {
      const current = getTodayISO();
      const hhmm = getCurrentHHMM();
      setTodayKey((prev) => (prev === current ? prev : current));
      setCurrentHHMM((prev) => (prev === hhmm ? prev : hhmm));
    };

    const scheduleNextMinute = () => {
      const now = new Date();
      const msUntilNextMinute =
        (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 50;
      timeoutId = window.setTimeout(() => {
        syncClock();
        scheduleNextMinute();
      }, Math.max(500, msUntilNextMinute));
    };

    const handleVisibilityOrFocus = () => {
      syncClock();
      setNowMs(Date.now());
    };

    scheduleNextMinute();
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, []);

  // Single targeted timeout for the next active snooze expiry (zero idle timers)
  useEffect(() => {
    const now = Date.now();
    let nextExpiry = Infinity;
    for (const until of Object.values(snoozedUntilMap)) {
      if (typeof until === 'number' && until > now && until < nextExpiry) {
        nextExpiry = until;
      }
    }
    if (!Number.isFinite(nextExpiry)) return;
    const delay = Math.max(50, nextExpiry - now + 25);
    const id = window.setTimeout(() => {
      setNowMs(Date.now());
    }, delay);
    return () => window.clearTimeout(id);
  }, [snoozedUntilMap, nowMs]);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    const root = document.documentElement;
    if (isPrivacyMode) {
      root.classList.add('pa-privacy');
    } else {
      root.classList.remove('pa-privacy');
    }
  }, [isPrivacyMode]);

  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      } else if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === 'h'
      ) {
        e.preventDefault();
        setIsPrivacyMode((prev) => !prev);
      } else if (
        e.key === '?' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        const target = e.target as HTMLElement | null;
        const isTyping =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          Boolean(target?.isContentEditable);
        if (!isTyping) {
          e.preventDefault();
          setShortcutsGuideOpen((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [setIsPrivacyMode]);

  useKeyboardShortcuts({
    onOpenNewModal: (mode) => setModalState({ mode }),
    onNavigateTab: handleSelectTab,
    onNavigatePlannerPage: handleSelectPlannerPage,
  });

  const cardsInitialBalance = useMemo(
    () => getTotalCardsInitialBalanceAMD(cards, liveFxRates),
    [cards, liveFxRates]
  );
  const defaultCardId = useMemo(
    () => cards.find((c) => c.isDefault)?.id ?? cards[0]?.id,
    [cards]
  );

  // Automatic payday salary crediting & new cycle rollover when payday arrives
  useEffect(() => {
    if (
      !primaryIncome.enabled ||
      !primaryIncome.autoCredit ||
      primaryIncome.amount <= 0
    ) {
      return;
    }

    const activeCycleKey = getCycleKeyForDate(todayKey, primaryIncome.payday);
    const bounds = getCycleBounds(activeCycleKey, primaryIncome.payday);

    if (
      todayKey >= bounds.startDate &&
      !primaryIncome.creditedCycles.includes(activeCycleKey)
    ) {
      const alreadyExists = transactions.some(
        (t) =>
          t.primaryCycleKey === activeCycleKey ||
          (t.type === 'income' &&
            getTransactionIncomeKind(t) === 'monthly' &&
            t.date >= bounds.startDate &&
            t.date <= bounds.endDate &&
            t.title.toLowerCase() === primaryIncome.title.toLowerCase())
      );

      if (!alreadyExists) {
        const newTx: Transaction = {
          id: createId('tx'),
          type: 'income',
          incomeKind: 'monthly',
          amount: primaryIncome.amount,
          title: primaryIncome.title,
          category: 'Աշխատավարձ',
          date: bounds.startDate,
          createdAt: new Date().toISOString(),
          primaryCycleKey: activeCycleKey,
          ...(defaultCardId ? { cardId: defaultCardId } : {}),
        };
        setTransactions((prev) => [newTx, ...prev]);
        showToast(
          `Նոր հաշվարկային ամիսը սկսվեց · «${primaryIncome.title}» (+${formatMoney(primaryIncome.amount)})`
        );
      }

      setPrimaryIncome((prev) =>
        prev.creditedCycles.includes(activeCycleKey)
          ? prev
          : {
              ...prev,
              creditedCycles: [...prev.creditedCycles, activeCycleKey],
            }
      );
      setSelectedMonth(activeCycleKey);
    }
  }, [primaryIncome, todayKey, transactions, setTransactions, setPrimaryIncome, defaultCardId]);

  const handleSavePrimaryIncome = (
    config: Omit<PrimaryIncomeConfig, 'creditedCycles'>
  ) => {
    const activeCycleKey = getCycleKeyForDate(todayKey, config.payday);
    const bounds = getCycleBounds(activeCycleKey, config.payday);
    const wasEnabled = primaryIncome.enabled;

    let updatedCreditedCycles = primaryIncome.creditedCycles;

    if (config.autoCredit && config.amount > 0 && todayKey >= bounds.startDate) {
      const targetTx = transactions.find(
        (t) =>
          t.primaryCycleKey === activeCycleKey ||
          (!wasEnabled && t.id === 'tx-1')
      );

      if (targetTx) {
        setTransactions((prev) =>
          prev.map((t) =>
            t.id === targetTx.id
              ? {
                  ...t,
                  type: 'income',
                  incomeKind: 'monthly',
                  title: config.title,
                  amount: config.amount,
                  category: 'Աշխատավարձ',
                  date: bounds.startDate,
                  primaryCycleKey: activeCycleKey,
                }
              : t
          )
        );
      } else {
        const hasSameTitleInCycle = transactions.some(
          (t) =>
            t.type === 'income' &&
            getTransactionIncomeKind(t) === 'monthly' &&
            t.date >= bounds.startDate &&
            t.date <= bounds.endDate &&
            t.title.toLowerCase() === config.title.toLowerCase()
        );
        if (!hasSameTitleInCycle) {
          const newTx: Transaction = {
            id: createId('tx'),
            type: 'income',
            incomeKind: 'monthly',
            amount: config.amount,
            title: config.title,
            category: 'Աշխատավարձ',
            date: bounds.startDate,
            createdAt: new Date().toISOString(),
            primaryCycleKey: activeCycleKey,
            ...(defaultCardId ? { cardId: defaultCardId } : {}),
          };
          setTransactions((prev) => [newTx, ...prev]);
        }
      }

      updatedCreditedCycles = Array.from(
        new Set([...primaryIncome.creditedCycles, activeCycleKey])
      );
    }

    setPrimaryIncome({
      ...config,
      creditedCycles: updatedCreditedCycles,
    });
    setSelectedMonth(activeCycleKey);
    showToast(
      `Հաշվարկային ցիկլը կարգավորվեց ամսվա ${config.payday}-ով`
    );
  };

  const handleDisablePrimaryIncome = () => {
    setPrimaryIncome((prev) => ({
      ...prev,
      enabled: false,
    }));
    setSelectedMonth(getCycleKeyForDate(todayKey, 1));
    showToast('Հաշվարկային ցիկլը վերադարձվեց օրացույցային ամսվան');
  };

  const handleManualCreditPrimaryIncome = () => {
    if (!primaryIncome.enabled || primaryIncome.amount <= 0) return;
    const bounds = getCycleBounds(selectedMonth, primaryIncome.payday);
    const newTx: Transaction = {
      id: createId('tx'),
      type: 'income',
      incomeKind: 'monthly',
      amount: primaryIncome.amount,
      title: primaryIncome.title,
      category: 'Աշխատավարձ',
      date: bounds.startDate,
      createdAt: new Date().toISOString(),
      primaryCycleKey: selectedMonth,
      ...(defaultCardId ? { cardId: defaultCardId } : {}),
    };
    setTransactions((prev) => [newTx, ...prev]);
    setPrimaryIncome((prev) => ({
      ...prev,
      creditedCycles: Array.from(
        new Set([...prev.creditedCycles, selectedMonth])
      ),
    }));
    showToast(
      `Գրանցվեց «${primaryIncome.title}» (+${formatMoney(primaryIncome.amount)})`
    );
  };

  const handleAddTransaction = (
    tx: Omit<Transaction, 'id' | 'createdAt'>
  ) => {
    const newTx: Transaction = {
      ...tx,
      id: createId('tx'),
      createdAt: new Date().toISOString(),
    };
    setTransactions((prev) => [newTx, ...prev]);
    setSelectedMonth(getCycleKeyForDate(tx.date, effectivePayday));
    showToast('Գործարքը գրանցվեց');
  };

  const handleBulkAddTransactions = (
    items: Array<Omit<Transaction, 'id' | 'createdAt'>>
  ) => {
    if (items.length === 0) return;
    const nowIso = new Date().toISOString();
    const created: Transaction[] = items.map((tx, idx) => ({
      ...tx,
      id: `${createId('tx')}-${idx}`,
      createdAt: nowIso,
    }));
    const prevSnapshot = transactions;
    setTransactions((prev) => [...created, ...prev]);
    showToast(`${created.length} գործարք ներմուծվեց`, () => {
      setTransactions(prevSnapshot);
    });
  };

  const handleAddCustomCategory = (cat: Omit<CustomCategory, 'id'>) => {
    const trimmed = cat.name.trim();
    if (!trimmed) return;
    const exists = customCategories.some(
      (c) =>
        c.type === cat.type &&
        c.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      showToast('Այդ անունով կատեգորիա արդեն գոյություն ունի');
      return;
    }
    const created: CustomCategory = {
      ...cat,
      name: trimmed,
      id: createId('cat'),
    };
    setCustomCategories((prev) => [...prev, created]);
    showToast(`«${trimmed}» կատեգորիան ավելացվեց`);
  };

  const handleDeleteCustomCategory = (id: string) => {
    const removed = customCategories.find((c) => c.id === id);
    if (!removed) return;
    setCustomCategories((prev) => prev.filter((c) => c.id !== id));
    showToast(`«${removed.name}» կատեգորիան հեռացվեց`, () => {
      setCustomCategories((prev) => [...prev, removed]);
    });
  };

  const handleUpdateTransaction = (
    id: string,
    updates: Omit<Transaction, 'id' | 'createdAt'>
  ) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
    setSelectedMonth(getCycleKeyForDate(updates.date, effectivePayday));
    showToast('Գործարքը թարմացվեց');
  };

  const handleAutoCategorizeTransactions = (
    updates: Array<{ id: string; category: string; incomeKind?: IncomeKind }>
  ) => {
    if (updates.length === 0) return;
    const previousSnapshot = transactions;
    const updateMap = new Map(updates.map((u) => [u.id, u]));
    setTransactions((prev) =>
      prev.map((t) => {
        const patch = updateMap.get(t.id);
        if (!patch) return t;
        return {
          ...t,
          category: patch.category,
          ...(t.type === 'income' && patch.incomeKind
            ? { incomeKind: patch.incomeKind }
            : {}),
        };
      })
    );
    showToast(`${updates.length} գործարք ավտոմատ դասակարգվեց`, () => {
      setTransactions(previousSnapshot);
    });
  };

  const handleDeleteTransaction = (id: string) => {
    const removed = transactions.find((t) => t.id === id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    if (removed) {
      showToast('Գործարքը ջնջվեց', () => {
        setTransactions((prev) => [removed, ...prev]);
      });
    }
  };

  const handleDuplicateTransaction = (tx: Transaction) => {
    const duplicated: Transaction = {
      ...tx,
      id: createId('tx'),
      date: todayKey,
      isPending: false,
      createdAt: new Date().toISOString(),
    };
    setTransactions((prev) => [duplicated, ...prev]);
    setSelectedMonth(getCycleKeyForDate(todayKey, effectivePayday));
    showToast(`Գործարքը կրկնվեց այսօր («${tx.title}»)`, () => {
      setTransactions((prev) => prev.filter((item) => item.id !== duplicated.id));
    });
  };

  const handleBulkDeleteTransactions = (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const previousSnapshot = transactions;
    setTransactions((prev) => prev.filter((t) => !idSet.has(t.id)));
    showToast(`${ids.length} գործարք ջնջվեց`, () => {
      setTransactions(previousSnapshot);
    });
  };

  const handleBulkAssignCard = (ids: string[], cardId: string | undefined) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const previousSnapshot = transactions;
    setTransactions((prev) =>
      prev.map((t) => (idSet.has(t.id) ? { ...t, cardId } : t))
    );
    showToast(`${ids.length} գործարքի քարտը թարմացվեց`, () => {
      setTransactions(previousSnapshot);
    });
  };

  const handleRepeatMonthlyIncomes = (
    sourceIncomes: Transaction[],
    monthKey: string
  ) => {
    if (sourceIncomes.length === 0) return;
    const nowIso = new Date().toISOString();
    const newTxs: Transaction[] = sourceIncomes.map((src) => {
      const origDay = Math.min(31, Math.max(1, Number(src.date.slice(8, 10)) || 5));
      return {
        id: createId('tx'),
        type: 'income',
        incomeKind: 'monthly',
        amount: src.amount,
        title: src.title,
        category: src.category,
        date: getDateInCycleForDay(monthKey, effectivePayday, origDay),
        createdAt: nowIso,
        ...((src.cardId ?? defaultCardId)
          ? { cardId: src.cardId ?? defaultCardId }
          : {}),
      };
    });
    setTransactions((prev) => [...newTxs, ...prev]);
    showToast(`${newTxs.length} ամսական եկամուտ գրանցվեց`);
  };

  // Manual Bank Cards & Wallets Handlers (no banking APIs)
  const handleAddCard = (card: Omit<BankCard, 'id' | 'createdAt'>) => {
    const newCard: BankCard = {
      ...card,
      isDefault: cards.length === 0 ? true : Boolean(card.isDefault),
      id: createId('card'),
      createdAt: new Date().toISOString(),
    };
    setCards((prev) => {
      const normalized = newCard.isDefault
        ? prev.map((c) => ({ ...c, isDefault: false }))
        : prev;
      return [...normalized, newCard];
    });
    showToast('Քարտը ավելացվեց');
  };

  const handleUpdateCard = (
    id: string,
    updates: Omit<BankCard, 'id' | 'createdAt'>
  ) => {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          return { ...c, ...updates };
        }
        return updates.isDefault ? { ...c, isDefault: false } : c;
      })
    );
    showToast('Քարտը թարմացվեց');
  };

  const handleDeleteCard = (id: string) => {
    const prevCards = cards;
    const prevTransactions = transactions;
    const target = cards.find((c) => c.id === id);
    if (!target) return;

    setCards((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      if (target.isDefault && filtered.length > 0 && !filtered.some((c) => c.isDefault)) {
        return filtered.map((c, idx) =>
          idx === 0 ? { ...c, isDefault: true } : c
        );
      }
      return filtered;
    });

    setTransactions((prev) =>
      prev.map((t) =>
        t.cardId === id ? { ...t, cardId: undefined } : t
      )
    );

    showToast('Քարտը ջնջվեց', () => {
      setCards(prevCards);
      setTransactions(prevTransactions);
    });
  };

  const handleSetDefaultCard = (id: string) => {
    setCards((prev) =>
      prev.map((c) => ({ ...c, isDefault: c.id === id }))
    );
    showToast('Հիմնական քարտը թարմացվեց');
  };

  const handleQuickCardTransaction = useCallback(
    (type: 'income' | 'expense', cardId: string) => {
      setModalState({
        mode: 'transaction',
        prefill: {
          type,
          cardId,
        },
      });
    },
    []
  );

  const handleTransferBetweenCards = ({
    fromCardId,
    toCardId,
    amount,
    toAmount,
    amountAMD,
    date,
    note,
  }: {
    fromCardId: string;
    toCardId: string;
    amount: number;
    toAmount?: number;
    amountAMD?: number;
    date: string;
    note?: string;
  }) => {
    const fromCard = cards.find((c) => c.id === fromCardId);
    const toCard = cards.find((c) => c.id === toCardId);
    if (!fromCard || !toCard || fromCardId === toCardId || amount <= 0) return;

    const fromCurrency = normalizeCardCurrency(fromCard.currency);
    const toCurrency = normalizeCardCurrency(toCard.currency);
    const debitAMD = Math.max(
      1,
      Math.round(amountAMD ?? convertToAMD(amount, fromCurrency, liveFxRates))
    );
    const resolvedToAmount =
      toAmount && toAmount > 0
        ? toAmount
        : fromCurrency === toCurrency
          ? amount
          : toCurrency === 'AMD'
            ? debitAMD
            : Math.round((debitAMD / convertToAMD(1, toCurrency, liveFxRates)) * 100) / 100;

    const prevTransactions = transactions;
    const nowIso = new Date().toISOString();
    const baseTitle = `Փոխանցում՝ ${fromCard.name} -> ${toCard.name}`;
    const fullTitle = note ? `${baseTitle} (${note})` : baseTitle;

    const outTx: Transaction = {
      id: createId('tx'),
      type: 'expense',
      amount: debitAMD,
      ...(fromCurrency !== 'AMD'
        ? {
            cardAmount: Math.round(amount * 100) / 100,
            cardCurrency: fromCurrency,
          }
        : {}),
      title: fullTitle,
      category: INTERNAL_TRANSFER_CATEGORY,
      date,
      cardId: fromCardId,
      createdAt: nowIso,
    };
    const inTx: Transaction = {
      id: createId('tx'),
      type: 'income',
      incomeKind: 'one_time',
      amount: debitAMD,
      ...(toCurrency !== 'AMD'
        ? {
            cardAmount: Math.round(resolvedToAmount * 100) / 100,
            cardCurrency: toCurrency,
          }
        : {}),
      title: fullTitle,
      category: INTERNAL_TRANSFER_CATEGORY,
      date,
      cardId: toCardId,
      createdAt: nowIso,
    };

    setTransactions((prev) => [inTx, outTx, ...prev]);
    setSelectedMonth(getCycleKeyForDate(date, effectivePayday));
    showToast(
      `Փոխանցումը կատարվեց (${formatCardMoney(amount, fromCurrency)})`,
      () => {
        setTransactions(prevTransactions);
      }
    );
  };

  const handleSaveBudget = (category: string, limit: number) => {
    setBudgets((prev) => {
      const exists = prev.some((b) => b.category === category);
      if (exists) {
        return prev.map((b) =>
          b.category === category ? { ...b, limit } : b
        );
      }
      return [...prev, { category, limit }];
    });
    showToast(`${category} կատեգորիայի բյուջեն պահպանվեց`);
  };

  const handleDeleteBudget = (category: string) => {
    const removed = budgets.find((b) => b.category === category);
    setBudgets((prev) => prev.filter((b) => b.category !== category));
    if (removed) {
      showToast('Բյուջեի սահմանաչափը հեռացվեց', () => {
        setBudgets((prev) => [...prev, removed]);
      });
    }
  };

  const handleAddRecurringBill = (bill: Omit<RecurringBill, 'id'>) => {
    setRecurringBills((prev) => [
      ...prev,
      { ...bill, id: createId('bill') },
    ]);
    showToast('Կրկնվող վճարումը ավելացվեց');
  };

  const handleDeleteRecurringBill = (id: string) => {
    const removed = recurringBills.find((b) => b.id === id);
    setRecurringBills((prev) => prev.filter((b) => b.id !== id));
    if (removed) {
      showToast('Վճարումը հեռացվեց', () => {
        setRecurringBills((prev) => [...prev, removed]);
      });
    }
  };

  const handleUpdateRecurringBill = (
    id: string,
    updates: Omit<RecurringBill, 'id'>
  ) => {
    setRecurringBills((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updates } : b))
    );
    showToast('Կրկնվող վճարումը թարմացվեց');
  };

  const handleToggleBillActive = (id: string) => {
    const target = recurringBills.find((b) => b.id === id);
    if (!target) return;
    const nextActive = target.active === false;
    setRecurringBills((prev) =>
      prev.map((b) => (b.id === id ? { ...b, active: nextActive } : b))
    );
    showToast(
      nextActive
        ? `«${target.title}» վճարումը ակտիվացվեց`
        : `«${target.title}» վճարումը դադարեցվեց`
    );
  };

  const handlePayAllRecurringBills = (
    billsToPay: RecurringBill[],
    monthKey: string
  ) => {
    if (billsToPay.length === 0) return;
    const nowIso = new Date().toISOString();
    const newTxs: Transaction[] = billsToPay.map((bill) => ({
      id: createId('tx'),
      type: 'expense',
      amount: bill.amount,
      title: bill.title,
      category: bill.category,
      date: getDateInCycleForDay(monthKey, effectivePayday, bill.dayOfMonth),
      createdAt: nowIso,
      ...(defaultCardId ? { cardId: defaultCardId } : {}),
    }));
    setTransactions((prev) => [...newTxs, ...prev]);
    showToast(`${newTxs.length} վճարում գրանցվեց`);
  };

  const handleConfirmBillSlot = (
    billId: string,
    slotKey: string,
    dateISO: string,
    overrideAmount?: number
  ) => {
    const bill = recurringBills.find((b) => b.id === billId);
    if (!bill) return;

    if (bill.isVariableAmount && overrideAmount === undefined) {
      setConfirmModalState({ bill, slotKey, dateISO });
      return;
    }

    const finalAmount =
      overrideAmount !== undefined ? overrideAmount : bill.amount;

    const newTx: Transaction = {
      id: createId('tx'),
      type: 'expense',
      amount: finalAmount,
      title: bill.title,
      category: bill.category,
      date: dateISO || todayKey,
      createdAt: new Date().toISOString(),
      ...(defaultCardId ? { cardId: defaultCardId } : {}),
    };
    setTransactions((prev) => [newTx, ...prev]);
    setRecurringBills((prev) =>
      prev.map((b) =>
        b.id === billId
          ? {
              ...b,
              confirmedSlots: Array.from(
                new Set([...(b.confirmedSlots ?? []), slotKey])
              ),
              skippedSlots: (b.skippedSlots ?? []).filter((s) => s !== slotKey),
            }
          : b
      )
    );
    setConfirmModalState(null);
    showToast(
      `Հաստատվեց «${bill.title}» (-${formatMoney(finalAmount)})`
    );
  };

  const handleSkipBillSlot = (billId: string, slotKey: string) => {
    setRecurringBills((prev) =>
      prev.map((b) =>
        b.id === billId
          ? {
              ...b,
              skippedSlots: Array.from(
                new Set([...(b.skippedSlots ?? []), slotKey])
              ),
            }
          : b
      )
    );
    showToast('Հիշեցումը բաց թողնվեց');
  };

  const handleConfirmPreExpense = useCallback(
    (txId: string) => {
      const target = transactions.find((t) => t.id === txId);
      if (!target) return;
      setTransactions((prev) =>
        prev.map((t) => (t.id === txId ? { ...t, isPending: false } : t))
      );
      showToast(
        `Հաստատվեց «${target.title}» ծախսը (-${formatMoney(target.amount)})`
      );
    },
    [setTransactions, showToast, transactions]
  );

  const handleConfirmExpenseNotification = (
    item: AppNotificationItem,
    overrideAmount?: number
  ) => {
    if (item.txId) {
      handleConfirmPreExpense(item.txId);
      setSnoozedUntilMap((prev) => {
        if (!(item.id in prev)) return prev;
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }
    if (!item.billId) return;
    const bill = recurringBills.find((b) => b.id === item.billId);
    if (!bill) return;

    if (bill.isVariableAmount && overrideAmount === undefined) {
      setConfirmModalState({
        bill,
        slotKey: item.slotKey || 'planned',
        dateISO: item.dueDate || todayKey,
        item,
      });
      return;
    }

    const finalAmount =
      overrideAmount !== undefined ? overrideAmount : bill.amount;

    if (item.kind === 'monthly_bill') {
      const cycleKey = getCycleKeyForDate(item.dueDate, effectivePayday);
      const newTx: Transaction = {
        id: createId('tx'),
        type: 'expense',
        amount: finalAmount,
        title: bill.title,
        category: bill.category,
        date: getDateInCycleForDay(cycleKey, effectivePayday, bill.dayOfMonth),
        createdAt: new Date().toISOString(),
        ...(defaultCardId ? { cardId: defaultCardId } : {}),
      };
      setTransactions((prev) => [newTx, ...prev]);
      showToast(
        `Հաստատվեց «${bill.title}» (-${formatMoney(finalAmount)})`
      );
    } else {
      handleConfirmBillSlot(
        bill.id,
        item.slotKey || 'planned',
        item.dueDate || todayKey,
        finalAmount
      );
    }

    setConfirmModalState(null);
    if (item) {
      setSnoozedUntilMap((prev) => {
        if (!(item.id in prev)) return prev;
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }
  };

  const handleSkipExpenseNotification = (item: AppNotificationItem) => {
    if (item.billId && item.slotKey) {
      handleSkipBillSlot(item.billId, item.slotKey);
    }
    setSnoozedUntilMap((prev) => {
      if (!(item.id in prev)) return prev;
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
  };

  const handleSnoozeNotification = (id: string, minutes: number) => {
    alertedIdsRef.current.delete(id);
    setSnoozedUntilMap((prev) => ({
      ...prev,
      [id]: Date.now() + minutes * 60_000,
    }));
    showToast(`Հիշեցումը հետաձգվեց ${minutes} րոպեով`);
  };

  const handleClearSnoozes = () => {
    setSnoozedUntilMap({});
    setDismissedBannerIds([]);
    showToast('Հետաձգված ծանուցումները վերականգնվեցին');
  };

  const handleToggleSound = () => {
    const nextEnabled = !notificationSettings.soundEnabled;
    setNotificationSettings((prev) => ({
      ...normalizeNotificationSettings(prev),
      soundEnabled: nextEnabled,
    }));
    if (nextEnabled) {
      playNotificationChime({
        preset: notificationSettings.soundPreset ?? 'chime',
        volume: notificationSettings.soundVolume ?? 0.75,
      });
    }
  };

  const handleUpdateNotificationSettings = (
    patch: Partial<NotificationSettings>
  ) => {
    setNotificationSettings((prev) =>
      normalizeNotificationSettings({
        ...normalizeNotificationSettings(prev),
        ...patch,
      })
    );
  };

  const handleSpeakNotification = (item: AppNotificationItem) => {
    const spoken = formatNotificationForSpeech(item);
    void speakNotificationText(spoken, notificationSettings, {
      urgent: item.status === 'overdue',
    });
  };

  const handleToggleBrowserNotifications = async () => {
    if (notificationSettings.browserNotifications) {
      setNotificationSettings((prev) => ({
        ...prev,
        browserNotifications: false,
      }));
      showToast('Բրաուզերի ծանուցումները անջատվեցին');
      return;
    }

    if (!canUseBrowserNotifications()) {
      showToast('Այս բրաուզերը չի աջակցում արտաքին ծանուցումներին');
      return;
    }

    try {
      let perm = Notification.permission;
      if (perm === 'default') {
        perm = await Notification.requestPermission();
      }
      if (perm === 'granted') {
        setNotificationSettings((prev) => ({
          ...prev,
          browserNotifications: true,
        }));
        showToast('Բրաուզերի ծանուցումները միացվեցին');
      } else {
        setNotificationSettings((prev) => ({
          ...prev,
          browserNotifications: false,
        }));
        showToast('Բրաուզերի ծանուցումների թույլտվությունը մերժված է');
      }
    } catch {
      showToast('Այս միջավայրում բրաուզերի ծանուցումները սահմանափակված են');
    }
  };

  const handleAddTask = (task: Omit<Task, 'id' | 'completed' | 'createdAt'>) => {
    const nowIso = new Date().toISOString();
    let linkedTxId = task.linkedTxId;

    if (task.expectedAmount && task.expectedAmount > 0 && !linkedTxId) {
      const pendingTx: Transaction = {
        id: createId('tx'),
        type: 'expense',
        amount: Math.round(task.expectedAmount),
        title: task.title,
        category: task.expectedCategory || 'Այլ',
        date: task.date,
        isPending: true,
        createdAt: nowIso,
        ...(defaultCardId ? { cardId: defaultCardId } : {}),
      };
      linkedTxId = pendingTx.id;
      setTransactions((prev) => [pendingTx, ...prev]);
    }

    const newTask: Task = {
      ...task,
      ...(linkedTxId ? { linkedTxId } : {}),
      id: createId('task'),
      completed: false,
      createdAt: nowIso,
    };
    setTasks((prev) => [newTask, ...prev]);
    showToast(
      linkedTxId
        ? 'Անելիքը և սպասվող նախածախսը ավելացվեցին'
        : 'Անելիքը ավելացվեց'
    );
  };

  const handleToggleTask = useCallback(
    (id: string) => {
      const target = tasks.find((t) => t.id === id);
      const becomingCompleted = target
        ? !isTaskCompletedOnDate(target, todayKey)
        : false;

      let celebratedAllDone = false;
      if (becomingCompleted) {
        const nextTasks = tasks.map((t) => {
          if (t.id !== id) return t;
          if (isTaskRepeating(t)) {
            const existing = t.completedDates ?? [];
            const hasToday = existing.includes(todayKey);
            return {
              ...t,
              completedDates: hasToday
                ? existing.filter((d) => d !== todayKey)
                : [...existing, todayKey],
            };
          }
          return { ...t, completed: !t.completed };
        });

        const todayTasks = nextTasks.filter(
          (t) => isTaskDueOnDate(t, todayKey) || (!isTaskRepeating(t) && t.date <= todayKey)
        );
        const allDone =
          todayTasks.length > 0 &&
          todayTasks.every((t) => isTaskCompletedOnDate(t, todayKey));
        if (allDone) {
          celebratedAllDone = true;
          triggerMilestoneConfetti();
        }
      }

      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          if (isTaskRepeating(t)) {
            const existing = t.completedDates ?? [];
            const hasToday = existing.includes(todayKey);
            return {
              ...t,
              completedDates: hasToday
                ? existing.filter((d) => d !== todayKey)
                : [...existing, todayKey],
            };
          }
          return { ...t, completed: !t.completed };
        })
      );

      const linkedTx =
        becomingCompleted && target?.linkedTxId
          ? transactions.find((tx) => tx.id === target.linkedTxId && tx.isPending)
          : undefined;

      if (celebratedAllDone && linkedTx && target) {
        showToast(
          `🎉 Այսօրվա բոլոր անելիքները կատարված են! Հաստատե՞լ «${target.title}» (${formatMoney(linkedTx.amount)}) նախածախսը`,
          () => handleConfirmPreExpense(linkedTx.id),
          'Հաստատել ծախսը'
        );
      } else if (celebratedAllDone) {
        showToast('🎉 Շնորհավորում ենք! Այսօրվա բոլոր անելիքները կատարված են!');
      } else if (linkedTx && target) {
        showToast(
          `«${target.title}» կատարվեց․ հաստատե՞լ ${formatMoney(linkedTx.amount)} նախածախսը`,
          () => handleConfirmPreExpense(linkedTx.id),
          'Հաստատել ծախսը'
        );
      }
    },
    [handleConfirmPreExpense, setTasks, showToast, tasks, todayKey, transactions]
  );

  const handleUpdateTask = (
    id: string,
    updates: Omit<Task, 'id' | 'completed' | 'createdAt'>
  ) => {
    const existing = tasks.find((t) => t.id === id);
    let nextLinkedTxId = existing?.linkedTxId;

    if (existing?.linkedTxId) {
      const existingPendingTx = transactions.find(
        (tx) => tx.id === existing.linkedTxId && tx.isPending
      );
      if (existingPendingTx) {
        if (updates.expectedAmount && updates.expectedAmount > 0) {
          setTransactions((prev) =>
            prev.map((tx) =>
              tx.id === existingPendingTx.id
                ? {
                    ...tx,
                    amount: Math.round(updates.expectedAmount!),
                    title: updates.title,
                    category: updates.expectedCategory || 'Այլ',
                    date: updates.date,
                  }
                : tx
            )
          );
        } else {
          setTransactions((prev) =>
            prev.filter((tx) => tx.id !== existingPendingTx.id)
          );
          nextLinkedTxId = undefined;
        }
      }
    } else if (updates.expectedAmount && updates.expectedAmount > 0) {
      const pendingTx: Transaction = {
        id: createId('tx'),
        type: 'expense',
        amount: Math.round(updates.expectedAmount),
        title: updates.title,
        category: updates.expectedCategory || 'Այլ',
        date: updates.date,
        isPending: true,
        createdAt: new Date().toISOString(),
        ...(defaultCardId ? { cardId: defaultCardId } : {}),
      };
      nextLinkedTxId = pendingTx.id;
      setTransactions((prev) => [pendingTx, ...prev]);
    }

    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              ...updates,
              linkedTxId: nextLinkedTxId,
            }
          : t
      )
    );
    showToast('Անելիքը թարմացվեց');
  };

  const handleUpdateTaskPriority = (id: string, priority: TaskPriority) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, priority } : t))
    );
  };

  const handleBatchUpdateTasks = useCallback(
    (updates: Array<{ id: string; dueTime?: string; priority?: TaskPriority }>) => {
      if (updates.length === 0) return;
      const prevTasks = tasks;
      const updateMap = new Map(updates.map((u) => [u.id, u]));
      setTasks((prev) =>
        prev.map((t) => {
          const patch = updateMap.get(t.id);
          if (!patch) return t;
          return {
            ...t,
            ...(patch.dueTime !== undefined ? { dueTime: patch.dueTime } : {}),
            ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
          };
        })
      );
      showToast(`Օրվա ժամանակացույցը թարմացվեց (${updates.length} անելիք)`, () => {
        setTasks(prevTasks);
      });
    },
    [setTasks, showToast, tasks]
  );

  const handleDeleteTask = (id: string) => {
    const removed = tasks.find((t) => t.id === id);
    const removedLinkedPendingTx = removed?.linkedTxId
      ? transactions.find((tx) => tx.id === removed.linkedTxId && tx.isPending)
      : undefined;

    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (removedLinkedPendingTx) {
      setTransactions((prev) =>
        prev.filter((tx) => tx.id !== removedLinkedPendingTx.id)
      );
    }

    if (removed) {
      showToast('Անելիքը ջնջվեց', () => {
        setTasks((prev) => [removed, ...prev]);
        if (removedLinkedPendingTx) {
          setTransactions((prev) => [removedLinkedPendingTx, ...prev]);
        }
      });
    }
  };

  const handleClearCompletedTasks = () => {
    const removedList = tasks.filter((t) => t.completed && !isTaskRepeating(t));
    setTasks((prev) => prev.filter((t) => !(t.completed && !isTaskRepeating(t))));
    if (removedList.length > 0) {
      showToast('Կատարված միանգամյա անելիքները մաքրվեցին', () => {
        setTasks((prev) => [...removedList, ...prev]);
      });
    }
  };

  const handleAddHabit = (title: string) => {
    setHabits((prev) => [
      ...prev,
      {
        id: createId('habit'),
        title,
        completedDates: [],
        createdAt: new Date().toISOString(),
      },
    ]);
    showToast('Սովորությունը ավելացվեց');
  };

  const handleToggleHabitDate = useCallback(
    (habitId: string, date: string) => {
      setHabits((prev) =>
        prev.map((h) => {
          if (h.id !== habitId) return h;
          const exists = h.completedDates.includes(date);
          return {
            ...h,
            completedDates: exists
              ? h.completedDates.filter((d) => d !== date)
              : [...h.completedDates, date],
          };
        })
      );
    },
    [setHabits]
  );

  const handleUpdateHabit = (habitId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setHabits((prev) =>
      prev.map((h) => (h.id === habitId ? { ...h, title: trimmed } : h))
    );
    showToast('Սովորությունը թարմացվեց');
  };

  const handleDeleteHabit = (habitId: string) => {
    const removed = habits.find((h) => h.id === habitId);
    setHabits((prev) => prev.filter((h) => h.id !== habitId));
    if (removed) {
      showToast('Սովորությունը ջնջվեց', () => {
        setHabits((prev) => [...prev, removed]);
      });
    }
  };

  const handleAddNote = (note: Omit<Note, 'id' | 'updatedAt'>) => {
    const newNote: Note = {
      ...note,
      id: createId('note'),
      updatedAt: new Date().toISOString(),
    };
    setNotes((prev) => [newNote, ...prev]);
    showToast('Նշումը պահպանվեց');
  };

  const handleUpdateNote = (
    id: string,
    updates: Omit<Note, 'id' | 'updatedAt' | 'pinned'>
  ) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, ...updates, updatedAt: new Date().toISOString() }
          : n
      )
    );
    showToast('Նշումը թարմացվեց');
  };

  const handleTogglePinNote = (id: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n))
    );
  };

  const handleDismissNoteReminder = (id: string) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, reminderDate: undefined, updatedAt: new Date().toISOString() }
          : n
      )
    );
    showToast('Նշման հիշեցումը փակվեց');
  };

  const handleConvertNoteToTask = (note: Note) => {
    const [datePart, timePart] = note.reminderDate
      ? note.reminderDate.split('T')
      : [getTodayISO(), undefined];
    handleAddTask({
      title: note.title || note.content.slice(0, 60),
      priority: note.pinned ? 'high' : 'medium',
      date: datePart || getTodayISO(),
      dueTime: timePart || undefined,
    });
    showToast('Նշումը ավելացվեց անելիքների ցանկում');
  };

  const handleCreateTasksFromNoteAI = useCallback(
    (
      noteTitle: string,
      steps: Array<{ title: string; priority: TaskPriority; dueTime?: string }>
    ) => {
      if (steps.length === 0) return;
      const nowIso = new Date().toISOString();
      const created: Task[] = steps.map((step) => ({
        id: createId('task'),
        title: step.title,
        priority: step.priority,
        date: todayKey,
        dueTime: step.dueTime,
        scheduleType: 'one_time',
        completed: false,
        createdAt: nowIso,
      }));
      setTasks((prev) => [...created, ...prev]);
      showToast(`«${noteTitle}» նշումից ստեղծվեց ${created.length} անելիք`);
    },
    [setTasks, showToast, todayKey]
  );

  const handleDeleteNote = (id: string) => {
    const removed = notes.find((n) => n.id === id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (removed) {
      showToast('Նշումը ջնջվեց', () => {
        setNotes((prev) => [removed, ...prev]);
      });
    }
  };

  const handleToggleNoteChecklistItem = (noteId: string, itemId: string) => {
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id !== noteId || !n.checklist) return n;
        return {
          ...n,
          checklist: n.checklist.map((item) =>
            item.id === itemId ? { ...item, done: !item.done } : item
          ),
          updatedAt: new Date().toISOString(),
        };
      })
    );
  };

  const handleLogShoppingExpense = (note: Note, estimatedTotal?: number) => {
    setModalState({
      mode: 'transaction',
      prefill: {
        type: 'expense',
        title: note.title,
        category: 'Գնումներ',
        date: getTodayISO(),
        ...(estimatedTotal && estimatedTotal > 0 ? { amount: estimatedTotal } : {}),
      },
    });
  };



  // Savings Goals Handlers
  const handleAddGoal = (goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => {
    const isReached = goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount;
    const next: SavingsGoal = {
      ...goal,
      completed: isReached,
      id: createId('goal'),
      createdAt: new Date().toISOString(),
    };
    setSavingsGoals((prev) => [next, ...prev]);
    if (isReached) {
      triggerMilestoneConfetti();
      showToast(`🎉 Շնորհավորում ենք! «${next.title}» նպատակը արդեն կատարված է!`);
    } else {
      showToast('Խնայողության նպատակը ստեղծվեց');
    }
  };

  const handleUpdateGoal = (
    id: string,
    updates: Omit<SavingsGoal, 'id' | 'createdAt'>
  ) => {
    const existing = savingsGoals.find((g) => g.id === id);
    const isReached =
      updates.targetAmount > 0 && updates.currentAmount >= updates.targetAmount;
    const isNewlyReached = isReached && !existing?.completed;

    setSavingsGoals((prev) =>
      prev.map((g) =>
        g.id === id
          ? {
              ...g,
              ...updates,
              completed: isReached,
            }
          : g
      )
    );

    if (isNewlyReached) {
      triggerMilestoneConfetti();
      showToast(`🎉 Շնորհավորում ենք! «${updates.title}» նպատակը հաջողությամբ կատարվեց!`);
    } else {
      showToast('Նպատակը թարմացվեց');
    }
  };

  const handleAdjustGoal = (
    goalId: string,
    delta: number,
    recordInLedger: boolean
  ) => {
    const target = savingsGoals.find((g) => g.id === goalId);
    if (!target || delta === 0) return;

    const nextAmount = Math.max(0, target.currentAmount + delta);
    const appliedDelta = nextAmount - target.currentAmount;
    if (appliedDelta === 0) return;

    const isReached = target.targetAmount > 0 && nextAmount >= target.targetAmount;
    const isNewlyCompleted = isReached && !target.completed;

    setSavingsGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? {
              ...g,
              currentAmount: nextAmount,
              completed: g.targetAmount > 0 && nextAmount >= g.targetAmount,
            }
          : g
      )
    );

    if (recordInLedger) {
      const tx: Transaction = {
        id: createId('tx'),
        type: appliedDelta > 0 ? 'expense' : 'income',
        ...(appliedDelta < 0 ? { incomeKind: 'one_time' as const } : {}),
        amount: Math.abs(appliedDelta),
        title:
          appliedDelta > 0
            ? `Գանձանակ՝ ${target.title}`
            : `Գանձանակից՝ ${target.title}`,
        category: appliedDelta > 0 ? 'Խնայողություն' : 'Այլ',
        date: getTodayISO(),
        createdAt: new Date().toISOString(),
        ...(defaultCardId ? { cardId: defaultCardId } : {}),
      };
      setTransactions((prev) => [tx, ...prev]);
    }

    if (isNewlyCompleted) {
      triggerMilestoneConfetti();
      showToast(`🎉 Շնորհավորում ենք! «${target.title}» նպատակը հաջողությամբ կատարվեց!`);
    } else {
      showToast(
        appliedDelta > 0
          ? `Գանձանակը համալրվեց (+${formatMoney(appliedDelta)})`
          : `Գանձանակից հանվեց (${formatMoney(Math.abs(appliedDelta))})`
      );
    }
  };

  const handleDeleteGoal = (goalId: string) => {
    const removed = savingsGoals.find((g) => g.id === goalId);
    setSavingsGoals((prev) => prev.filter((g) => g.id !== goalId));
    if (removed) {
      showToast('Նպատակը ջնջվեց', () => {
        setSavingsGoals((prev) => [removed, ...prev]);
      });
    }
  };

  // Debts & IOUs Handlers
  const handleAddDebt = (debt: Omit<DebtItem, 'id' | 'createdAt'>) => {
    const next: DebtItem = {
      ...debt,
      id: createId('debt'),
      createdAt: new Date().toISOString(),
    };
    setDebts((prev) => [next, ...prev]);
    showToast('Պարտքի գրառումը ավելացվեց');
  };

  const handleAddSplitDebts = (items: Array<Omit<DebtItem, 'id' | 'createdAt'>>) => {
    if (items.length === 0) return;
    const nowIso = new Date().toISOString();
    const created: DebtItem[] = items.map((debt, idx) => ({
      ...debt,
      id: `${createId('debt')}-${idx}`,
      createdAt: nowIso,
    }));
    setDebts((prev) => [...created, ...prev]);
    showToast(`Գրանցվեց ${created.length} կիսված պարտք`);
  };

  const handleUpdateDebt = (
    id: string,
    updates: Omit<DebtItem, 'id' | 'createdAt'>
  ) => {
    setDebts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...updates } : d))
    );
    showToast('Պարտքի գրառումը թարմացվեց');
  };

  const handleRecordDebtPayment = (
    debtId: string,
    amount: number,
    recordInLedger: boolean
  ) => {
    const target = debts.find((d) => d.id === debtId);
    if (!target || amount <= 0) return;

    const remaining = Math.max(0, target.totalAmount - target.paidAmount);
    const applied = Math.min(remaining, Math.round(amount));
    if (applied <= 0) return;

    const nextPaid = target.paidAmount + applied;
    const isNowSettled = nextPaid >= target.totalAmount;

    setDebts((prev) =>
      prev.map((d) =>
        d.id === debtId
          ? {
              ...d,
              paidAmount: nextPaid,
              settled: isNowSettled,
            }
          : d
      )
    );

    if (recordInLedger) {
      const tx: Transaction = {
        id: createId('tx'),
        type: target.direction === 'lent' ? 'income' : 'expense',
        ...(target.direction === 'lent' ? { incomeKind: 'one_time' as const } : {}),
        amount: applied,
        title:
          target.direction === 'lent'
            ? `Վերադարձված պարտք՝ ${target.person}`
            : `Պարտքի մարում՝ ${target.person}`,
        category: 'Այլ',
        date: getTodayISO(),
        createdAt: new Date().toISOString(),
        ...(defaultCardId ? { cardId: defaultCardId } : {}),
      };
      setTransactions((prev) => [tx, ...prev]);
    }

    showToast(
      isNowSettled
        ? `«${target.person}» պարտքը ամբողջությամբ մարվեց`
        : `Գրանցվեց մարում՝ ${formatMoney(applied)}`
    );
  };

  const handleDeleteDebt = (debtId: string) => {
    const removed = debts.find((d) => d.id === debtId);
    setDebts((prev) => prev.filter((d) => d.id !== debtId));
    if (removed) {
      showToast('Պարտքի գրառումը ջնջվեց', () => {
        setDebts((prev) => [removed, ...prev]);
      });
    }
  };

  // Focus Sessions Handler
  const handleCompleteFocusSession = useCallback(
    (session: Omit<FocusSession, 'id' | 'completedAt'>) => {
      const next: FocusSession = {
        ...session,
        id: createId('focus'),
        completedAt: new Date().toISOString(),
      };
      setFocusSessions((prev) => [next, ...prev]);
      showToast(`Ֆոկուս սեսիան գրանցվեց (${session.minutes} րոպե)`);
    },
    [setFocusSessions, showToast]
  );

  const handleSaveFocusGoal = useCallback(
    (title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const today = getTodayISO();
      setFocusGoal((prev) => ({
        title: trimmed,
        completed: prev && prev.date === today ? prev.completed : false,
        date: today,
      }));
      showToast('Օրվա ֆոկուս նպատակը պահպանվեց');
    },
    [setFocusGoal, showToast]
  );

  const handleToggleFocusGoal = useCallback(() => {
    const today = getTodayISO();
    setFocusGoal((prev) => {
      if (!prev || prev.date !== today) return prev;
      return { ...prev, completed: !prev.completed };
    });
  }, [setFocusGoal]);

  const handleClearFocusGoal = useCallback(() => {
    const previous = focusGoal ?? null;
    setFocusGoal(null);
    if (previous) {
      showToast('Օրվա ֆոկուս նպատակը հեռացվեց', () => {
        setFocusGoal(previous);
      });
    }
  }, [focusGoal, setFocusGoal, showToast]);

  const handleExportJSON = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      currency: 'AMD',
      primaryIncome,
      customCategories,
      cards,
      transactions,
      tasks,
      notes,
      budgets,
      recurringBills,
      habits,
      savingsGoals,
      debts,
      focusSessions,
      focusGoal,
      notificationSettings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `assistant-backup-${getTodayISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Պահուստային ֆայլը ներբեռնվեց');
  };

  const handleImportJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result));
        const parsed = sanitizeBackupPayload(raw);
        if (!parsed) {
          showToast('Ֆայլում վավեր տվյալներ չեն գտնվել');
          return;
        }
        if (parsed.cards) setCards(parsed.cards);
        if (parsed.transactions) setTransactions(parsed.transactions);
        if (parsed.tasks) setTasks(parsed.tasks);
        if (parsed.notes) setNotes(parsed.notes);
        if (parsed.budgets) setBudgets(parsed.budgets);
        if (parsed.recurringBills) setRecurringBills(parsed.recurringBills);
        if (parsed.habits) setHabits(parsed.habits);
        if (parsed.savingsGoals) setSavingsGoals(parsed.savingsGoals);
        if (parsed.debts) setDebts(parsed.debts);
        if (parsed.focusSessions) setFocusSessions(parsed.focusSessions);
        if (parsed.primaryIncome) setPrimaryIncome(parsed.primaryIncome);
        if (parsed.focusGoal !== undefined) setFocusGoal(parsed.focusGoal);
        if (parsed.customCategories) setCustomCategories(parsed.customCategories);
        if (parsed.notificationSettings) {
          setNotificationSettings(parsed.notificationSettings);
        }
        showToast(
          `Վերականգնվեց ${parsed.importedRecordCount} գրառում և կարգավորում`
        );
      } catch {
        showToast('Ֆայլի ձևաչափը սխալ է');
      }
    };
    reader.readAsText(file);
  };

  const defaultModalMode: QuickModalMode =
    activeTab === 'finance'
      ? financePage === 'cards'
        ? 'card'
        : financePage === 'goals'
          ? 'goal'
          : financePage === 'debts'
            ? 'debt'
            : 'transaction'
      : activeTab === 'planner'
        ? plannerPage === 'habits'
          ? 'habit'
          : 'task'
        : activeTab === 'notes'
          ? 'note'
          : 'transaction';

  const todayISO = todayKey;
  const todayPendingTasks = useMemo(() => {
    const priorityRank: Record<TaskPriority, number> = {
      high: 0,
      medium: 1,
      low: 2,
    };
    return [...tasks]
      .filter((t) => isTaskDueOnDate(t, todayISO) && !isTaskCompletedOnDate(t, todayISO))
      .sort((a, b) => {
        const pDiff =
          priorityRank[a.priority ?? 'medium'] -
          priorityRank[b.priority ?? 'medium'];
        if (pDiff !== 0) return pDiff;
        return (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99');
      });
  }, [tasks, todayISO]);

  const dueNoteReminders = useMemo(
    () =>
      [...notes]
        .filter((n) => Boolean(n.reminderDate) && n.reminderDate!.slice(0, 10) <= todayISO)
        .sort((a, b) => (a.reminderDate ?? '').localeCompare(b.reminderDate ?? '')),
    [notes, todayISO]
  );

  const safeToSpend = useMemo(() => {
    const cycleDayMetrics = getCycleDayMetrics(
      selectedMonth,
      effectivePayday,
      todayISO
    );
    const cycleFin = computeCycleFinancials(
      transactions,
      selectedMonth,
      effectivePayday,
      todayISO,
      cardsInitialBalance
    );
    const unpaidBillsTotal = recurringBills
      .filter(
        (bill) =>
          bill.active !== false &&
          getBillFrequency(bill) === 'monthly' &&
          !isMonthlyBillSettledForCycle(
            bill,
            selectedMonth,
            cycleFin.cycleTransactions
          )
      )
      .reduce((sum, b) => sum + b.amount, 0);

    return computeSafeToSpend({
      availableBalance: cycleDayMetrics.isCurrentCycle
        ? cycleFin.liveRealBalance
        : cycleFin.cycleEndBalance,
      unpaidBillsTotal,
      pendingExpensesTotal: cycleFin.cyclePendingExpense,
      cycleMetrics: cycleDayMetrics,
      transactions,
      todayISO,
    });
  }, [transactions, recurringBills, selectedMonth, effectivePayday, todayISO, cardsInitialBalance]);

  const allNotifications = useMemo(
    () =>
      buildAppNotifications({
        bills: recurringBills,
        transactions,
        tasks,
        notes,
        budgets,
        debts,
        selectedMonth,
        todayISO,
        currentHHMM,
        effectivePayday,
      }),
    [
      recurringBills,
      transactions,
      tasks,
      notes,
      budgets,
      debts,
      selectedMonth,
      todayISO,
      currentHHMM,
      effectivePayday,
    ]
  );

  const { activeNotifications, snoozedCount, dueFloatingAlerts } = useMemo(() => {
    const active = allNotifications.filter(
      (n) => nowMs >= (snoozedUntilMap[n.id] ?? 0)
    );
    const dismissedSet = new Set(dismissedBannerIds);
    const dueFloating = active.filter(
      (n) =>
        (n.kind === 'daily_expense' ||
          n.kind === 'planned_expense' ||
          n.kind === 'monthly_bill' ||
          n.kind === 'budget_alert') &&
        (n.status === 'due_now' || n.status === 'overdue') &&
        !dismissedSet.has(n.id)
    );
    return {
      activeNotifications: active,
      snoozedCount: allNotifications.length - active.length,
      dueFloatingAlerts: dueFloating,
    };
  }, [allNotifications, nowMs, snoozedUntilMap, dismissedBannerIds]);

  useEffect(() => {
    const newlyDue = activeNotifications.filter((n) => {
      if (alertedIdsRef.current.has(n.id)) return false;
      const isFinanceDue =
        (n.kind === 'daily_expense' ||
          n.kind === 'planned_expense' ||
          n.kind === 'monthly_bill' ||
          n.kind === 'budget_alert') &&
        (n.status === 'due_now' || n.status === 'overdue');
      const isScheduledScheduleDue =
        (n.kind === 'task' || n.kind === 'note') &&
        Boolean(n.dueTime) &&
        n.dueTime! <= currentHHMM;
      return isFinanceDue || isScheduledScheduleDue;
    });
    if (newlyDue.length === 0) return;

    newlyDue.forEach((n) => alertedIdsRef.current.add(n.id));
    playNotificationAlertSequence(newlyDue, notificationSettings, currentHHMM);
    if (notificationSettings.browserNotifications) {
      newlyDue.forEach((n) => sendBrowserNotification(n));
    }
  }, [activeNotifications, notificationSettings, currentHHMM]);

  const editorialDate = useMemo(() => getTodayEditorialDate(), [todayISO]);
  const activeFocusGoal = useMemo(
    () => (focusGoal && focusGoal.date === todayISO ? focusGoal : null),
    [focusGoal, todayISO]
  );
  const canUseBrowserNotifs = useMemo(() => canUseBrowserNotifications(), []);

  const handleOpenDefaultModal = useCallback(() => {
    setModalState({ mode: defaultModalMode });
  }, [defaultModalMode]);
  const handleShiftMonth = useCallback((delta: number) => {
    setSelectedMonth((prev) => shiftMonthKey(prev, delta));
  }, []);
  const handleToggleTheme = useCallback(() => {
    setIsDark((prev) => !prev);
  }, [setIsDark]);
  const handleOpenOverviewModal = useCallback(
    (mode: QuickModalState['mode']) => setModalState({ mode }),
    []
  );

  const cycleFin = useMemo(
    () =>
      computeCycleFinancials(
        transactions,
        selectedMonth,
        effectivePayday,
        todayISO,
        cardsInitialBalance
      ),
    [transactions, selectedMonth, effectivePayday, todayISO, cardsInitialBalance]
  );
  const totalBalance = cycleFin.cycleEndBalance;

  const netWorthSummary = useMemo(
    () =>
      computeNetWorthAndRunway({
        cards,
        transactions,
        savingsGoals,
        debts,
        recurringBills,
        fxRates: liveFxRates,
        selectedMonth,
        effectivePayday,
        todayISO,
      }),
    [
      cards,
      transactions,
      savingsGoals,
      debts,
      recurringBills,
      liveFxRates,
      selectedMonth,
      effectivePayday,
      todayISO,
    ]
  );

  const smartWorkspaceContext = useMemo(
    () =>
      buildSmartWorkspaceContext({
        todayISO,
        selectedMonth,
        cycleLabel: formatCycleLabel(selectedMonth, effectivePayday),
        effectivePayday,
        cycleIncome: cycleFin.cycleIncome,
        cycleExpense: cycleFin.cycleExpense,
        openingBalance: cycleFin.openingBalance,
        realBalance: totalBalance,
        safeToSpend,
        transactions,
        cards,
        budgets,
        savingsGoals,
        debts,
        tasks,
        habits,
        recurringBills,
        notes,
        focusGoal: activeFocusGoal,
        customCategories,
        fxRates: liveFxRates,
      }),
    [
      todayISO,
      selectedMonth,
      effectivePayday,
      cycleFin.cycleIncome,
      cycleFin.cycleExpense,
      cycleFin.openingBalance,
      totalBalance,
      safeToSpend,
      transactions,
      cards,
      budgets,
      savingsGoals,
      debts,
      tasks,
      habits,
      recurringBills,
      notes,
      activeFocusGoal,
      customCategories,
      liveFxRates,
    ]
  );

  const handleOpenAssistant = useCallback((initialPrompt?: string) => {
    setAssistantModalState({ open: true, initialPrompt });
  }, []);

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row bg-[#F5F6F8] bg-[radial-gradient(ellipse_85%_45%_at_60%_-12%,rgba(37,99,235,0.055),transparent_70%)] dark:bg-[#070B12] dark:bg-[radial-gradient(ellipse_85%_45%_at_60%_-12%,rgba(59,130,246,0.09),transparent_70%)] text-[#0F172A] dark:text-[#F8FAFC] overflow-x-clip">
      <TopRouteProgressBar active={isRouteTransitioning} />

      <TopNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        financePage={financePage}
        onSelectFinancePage={handleSelectFinancePage}
        plannerPage={plannerPage}
        onSelectPlannerPage={handleSelectPlannerPage}
        onOpenNewModal={handleOpenDefaultModal}
        todayTasks={todayPendingTasks}
        onToggleTask={handleToggleTask}
        dueNotes={dueNoteReminders}
        onDismissNoteReminder={handleDismissNoteReminder}
        notifications={activeNotifications}
        snoozedCount={snoozedCount}
        notificationSettings={notificationSettings}
        canUseBrowserNotifs={canUseBrowserNotifs}
        onToggleSound={handleToggleSound}
        onToggleBrowserNotifications={handleToggleBrowserNotifications}
        onUpdateNotificationSettings={handleUpdateNotificationSettings}
        onSpeakNotif={handleSpeakNotification}
        onConfirmExpenseNotif={handleConfirmExpenseNotification}
        onSkipExpenseNotif={handleSkipExpenseNotification}
        onSnoozeNotif={handleSnoozeNotification}
        onClearSnoozes={handleClearSnoozes}
        editorialDate={editorialDate}
        selectedMonth={selectedMonth}
        payday={effectivePayday}
        onShiftMonth={handleShiftMonth}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
        isPrivacyMode={isPrivacyMode}
        onTogglePrivacy={() => setIsPrivacyMode((prev) => !prev)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onOpenAssistant={() => handleOpenAssistant()}
        onOpenShortcutsGuide={() => setShortcutsGuideOpen(true)}
        user={user}
        syncStatus={syncStatus}
        isOnline={isOnline}
        onSignInGoogle={handleSignInGoogle}
        onSignOutGoogle={handleSignOutGoogle}
        isAppLockEnabled={appLock.isEnabled}
        onOpenAppLockSettings={() => setAppLockSettingsOpen(true)}
        onLockNow={appLock.lockNow}
        canInstallPWA={canInstallPWA}
        onInstallPWA={promptInstall}
        totalBalance={totalBalance}
        currency="AMD"
      >
        <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-7 min-w-0">
          <AnimatePresence mode="wait" onExitComplete={scrollToTopInstant}>
            <motion.div
              key={activeTab}
              initial={
                prefersReducedMotion
                  ? false
                  : { opacity: 0, y: 12, scale: 0.996 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: -8, scale: 0.996 }
              }
              transition={{
                duration: prefersReducedMotion ? 0.04 : 0.2,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{ willChange: 'transform, opacity' }}
            >
              <Suspense
                fallback={
                  <PageSkeleton
                    variant={
                      activeTab === 'finance'
                        ? financePage
                        : activeTab === 'planner'
                          ? plannerPage
                          : activeTab
                    }
                  />
                }
              >
                {activeTab === 'overview' && (
                  <OverviewView
                    selectedMonth={selectedMonth}
                    onShiftMonth={handleShiftMonth}
                    primaryIncome={primaryIncome}
                    transactions={transactions}
                    cards={cards}
                    fxRates={liveFxRates}
                    netWorthSummary={netWorthSummary}
                    tasks={tasks}
                    notes={notes}
                    budgets={budgets}
                    recurringBills={recurringBills}
                    habits={habits}
                    focusGoal={activeFocusGoal}
                    safeToSpend={safeToSpend}
                    savingsGoals={savingsGoals}
                    debts={debts}
                    onSaveFocusGoal={handleSaveFocusGoal}
                    onToggleFocusGoal={handleToggleFocusGoal}
                    onClearFocusGoal={handleClearFocusGoal}
                    onToggleTask={handleToggleTask}
                    onToggleHabitDate={handleToggleHabitDate}
                    onNavigate={handleSelectTab}
                    onNavigateFinance={handleSelectFinancePage}
                    onNavigatePlanner={handleSelectPlannerPage}
                    onOpenNewModal={handleOpenOverviewModal}
                    onOpenAssistant={handleOpenAssistant}
                    onConfirmPreExpense={handleConfirmPreExpense}
                    onAddTransaction={handleAddTransaction}
                    onOpenTransactionWithPrefill={(prefill) =>
                      setModalState({ mode: 'transaction', prefill })
                    }
                  />
                )}

                {activeTab === 'finance' && (
                  <FinanceView
                    activePage={financePage}
                    onSelectPage={handleSelectFinancePage}
                    selectedMonth={selectedMonth}
                    onChangeMonth={setSelectedMonth}
                    primaryIncome={primaryIncome}
                    onSavePrimaryIncome={handleSavePrimaryIncome}
                    onDisablePrimaryIncome={handleDisablePrimaryIncome}
                    onManualCreditPrimaryIncome={handleManualCreditPrimaryIncome}
                    transactions={transactions}
                    onAddTransaction={handleAddTransaction}
                    onBulkAddTransactions={handleBulkAddTransactions}
                    onOpenNewTransactionModal={() =>
                      setModalState({ mode: 'transaction' })
                    }
                    onEditTransaction={(tx) =>
                      setModalState({ mode: 'transaction', editing: tx })
                    }
                    onAutoCategorizeTransactions={handleAutoCategorizeTransactions}
                    onDeleteTransaction={handleDeleteTransaction}
                    onDuplicateTransaction={handleDuplicateTransaction}
                    onBulkDeleteTransactions={handleBulkDeleteTransactions}
                    onBulkAssignCard={handleBulkAssignCard}
                    onRepeatMonthlyIncomes={handleRepeatMonthlyIncomes}
                    onNotify={showToast}
                    customCategories={customCategories}
                    onAddCustomCategory={handleAddCustomCategory}
                    onDeleteCustomCategory={handleDeleteCustomCategory}
                    fxRates={liveFxRates}
                    netWorthSummary={netWorthSummary}
                    budgets={budgets}
                    onSaveBudget={handleSaveBudget}
                    onDeleteBudget={handleDeleteBudget}
                    recurringBills={recurringBills}
                    onAddRecurringBill={handleAddRecurringBill}
                    onUpdateRecurringBill={handleUpdateRecurringBill}
                    onToggleBillActive={handleToggleBillActive}
                    onDeleteRecurringBill={handleDeleteRecurringBill}
                    onPayAllRecurringBills={handlePayAllRecurringBills}
                    onConfirmBillSlot={handleConfirmBillSlot}
                    onSkipBillSlot={handleSkipBillSlot}
                    onConfirmPreExpense={handleConfirmPreExpense}
                    currentHHMM={currentHHMM}
                    safeToSpend={safeToSpend}
                    savingsGoals={savingsGoals}
                    onOpenNewGoalModal={() => setModalState({ mode: 'goal' })}
                    onEditGoal={(goal) =>
                      setModalState({ mode: 'goal', editing: goal })
                    }
                    onAdjustGoal={handleAdjustGoal}
                    onDeleteGoal={handleDeleteGoal}
                    debts={debts}
                    onOpenNewDebtModal={() => setModalState({ mode: 'debt' })}
                    onEditDebt={(debt) =>
                      setModalState({ mode: 'debt', editing: debt })
                    }
                    onRecordDebtPayment={handleRecordDebtPayment}
                    onDeleteDebt={handleDeleteDebt}
                    cards={cards}
                    onOpenNewCardModal={() => setModalState({ mode: 'card' })}
                    onEditCard={(card) =>
                      setModalState({ mode: 'card', editing: card })
                    }
                    onDeleteCard={handleDeleteCard}
                    onSetDefaultCard={handleSetDefaultCard}
                    onQuickCardTransaction={handleQuickCardTransaction}
                    onTransferBetweenCards={handleTransferBetweenCards}
                    onExportJSON={handleExportJSON}
                    onImportJSON={handleImportJSON}
                    onOpenAssistant={handleOpenAssistant}
                  />
                )}

                {activeTab === 'planner' && (
                  <PlannerView
                    activePage={plannerPage}
                    onSelectPage={handleSelectPlannerPage}
                    tasks={tasks}
                    transactions={transactions}
                    onConfirmPreExpense={handleConfirmPreExpense}
                    onOpenNewTaskModal={() => setModalState({ mode: 'task' })}
                    onAddTask={handleAddTask}
                    onEditTask={(task) =>
                      setModalState({ mode: 'task', editing: task })
                    }
                    onToggleTask={handleToggleTask}
                    onUpdateTaskPriority={handleUpdateTaskPriority}
                    onBatchUpdateTasks={handleBatchUpdateTasks}
                    onDeleteTask={handleDeleteTask}
                    onClearCompleted={handleClearCompletedTasks}
                    habits={habits}
                    onOpenNewHabitModal={() => setModalState({ mode: 'habit' })}
                    onEditHabit={(habit) =>
                      setModalState({ mode: 'habit', editing: habit })
                    }
                    onToggleHabitDate={handleToggleHabitDate}
                    onDeleteHabit={handleDeleteHabit}
                    focusGoal={activeFocusGoal}
                    focusSessions={focusSessions}
                    soundEnabled={notificationSettings.soundEnabled}
                    browserNotifications={notificationSettings.browserNotifications}
                    notificationSettings={notificationSettings}
                    onCompleteFocusSession={handleCompleteFocusSession}
                  />
                )}

                {activeTab === 'notes' && (
                  <NotesView
                    notes={notes}
                    onOpenNewNoteModal={() => setModalState({ mode: 'note' })}
                    onEditNote={(note) =>
                      setModalState({ mode: 'note', editing: note })
                    }
                    onTogglePin={handleTogglePinNote}
                    onDeleteNote={handleDeleteNote}
                    onConvertToTask={handleConvertNoteToTask}
                    onToggleChecklistItem={handleToggleNoteChecklistItem}
                    onLogShoppingExpense={handleLogShoppingExpense}
                    onCreateTasksFromNoteAI={handleCreateTasksFromNoteAI}
                  />
                )}

              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </TopNav>

      <ScrollToTopButton />

      {/* Non-intrusive Undo / Feedback Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.16 }}
            className="fixed bottom-[calc(4.35rem+env(safe-area-inset-bottom))] md:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-50 border border-[#CBD5E1] dark:border-[#334155] bg-[#0F172A] dark:bg-[#F8FAFC] text-[#F8FAFC] dark:text-[#0F172A] px-4 py-3 rounded-2xl shadow-2xl flex items-center justify-between sm:justify-start gap-3 text-xs sm:text-sm"
            role="status"
          >
            <span className="font-medium">{toast.message}</span>
            {toast.onUndo && (
              <button
                type="button"
                onClick={() => {
                  toast.onUndo?.();
                  setToast(null);
                }}
                className="inline-flex items-center gap-1 font-semibold text-[#60A5FA] dark:text-[#2563EB] hover:underline cursor-pointer shrink-0"
              >
                {!toast.actionLabel && <RotateCcw className="w-3.5 h-3.5" />}
                <span>{toast.actionLabel ?? 'Հետարկել'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Փակել ծանուցումը"
              className="opacity-70 hover:opacity-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <NotificationAlerts
        alerts={dueFloatingAlerts}
        onConfirmExpense={handleConfirmExpenseNotification}
        onSnooze={handleSnoozeNotification}
        onSkipExpense={handleSkipExpenseNotification}
        onSpeakAlert={handleSpeakNotification}
        onDismissBanner={(id) =>
          setDismissedBannerIds((prev) =>
            prev.includes(id) ? prev : [...prev, id]
          )
        }
      />

      <Suspense fallback={null}>
        {confirmModalState && (
          <ConfirmExpenseModal
            bill={confirmModalState.bill}
            slotKey={confirmModalState.slotKey}
            dateISO={confirmModalState.dateISO}
            onConfirm={(finalAmount) => {
              if (confirmModalState.item) {
                handleConfirmExpenseNotification(
                  confirmModalState.item,
                  finalAmount
                );
              } else {
                handleConfirmBillSlot(
                  confirmModalState.bill.id,
                  confirmModalState.slotKey,
                  confirmModalState.dateISO,
                  finalAmount
                );
              }
            }}
            onClose={() => setConfirmModalState(null)}
          />
        )}

        {modalState && (
          <QuickAddModal
            modalState={modalState}
            transactions={transactions}
            cards={cards}
            customCategories={customCategories}
            fxRates={liveFxRates}
            onClose={() => setModalState(null)}
            onAddTransaction={handleAddTransaction}
            onUpdateTransaction={handleUpdateTransaction}
            onAddCard={handleAddCard}
            onUpdateCard={handleUpdateCard}
            onAddTask={handleAddTask}
            onUpdateTask={handleUpdateTask}
            onAddHabit={handleAddHabit}
            onUpdateHabit={handleUpdateHabit}
            onAddNote={handleAddNote}
            onUpdateNote={handleUpdateNote}
            onAddGoal={handleAddGoal}
            onUpdateGoal={handleUpdateGoal}
            onAddDebt={handleAddDebt}
            onAddSplitDebts={handleAddSplitDebts}
            onUpdateDebt={handleUpdateDebt}
          />
        )}

        {showIOSGuide && (
          <PWAInstallModal onClose={() => setShowIOSGuide(false)} />
        )}

        {commandPaletteOpen && (
          <CommandPaletteModal
            onClose={() => setCommandPaletteOpen(false)}
            currency="AMD"
            transactions={transactions}
            cards={cards}
            tasks={tasks}
            notes={notes}
            savingsGoals={savingsGoals}
            debts={debts}
            isDark={isDark}
            isPrivacyMode={isPrivacyMode}
            onToggleTheme={handleToggleTheme}
            onTogglePrivacy={() => setIsPrivacyMode((prev) => !prev)}
            onNavigate={handleSelectTab}
            onNavigateFinance={handleSelectFinancePage}
            onNavigatePlanner={handleSelectPlannerPage}
            onOpenNewModal={(mode) => setModalState({ mode })}
            onEditTransaction={(tx) =>
              setModalState({ mode: 'transaction', editing: tx })
            }
            onEditTask={(task) => setModalState({ mode: 'task', editing: task })}
            onEditNote={(note) => setModalState({ mode: 'note', editing: note })}
            onExportJSON={handleExportJSON}
            onExecuteSmartTransaction={handleAddTransaction}
            onExecuteSmartTask={handleAddTask}
            onExecuteSmartNote={handleAddNote}
            onOpenAssistant={handleOpenAssistant}
            onOpenShortcutsGuide={() => setShortcutsGuideOpen(true)}
          />
        )}

        {shortcutsGuideOpen && (
          <ShortcutsGuideModal
            onClose={() => setShortcutsGuideOpen(false)}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          />
        )}

        {assistantModalState.open && (
          <SmartAssistantModal
            onClose={() => setAssistantModalState({ open: false })}
            initialPrompt={assistantModalState.initialPrompt}
            context={smartWorkspaceContext}
            todayISO={todayISO}
            defaultCardId={defaultCardId}
            notificationSettings={notificationSettings}
            onAddTransaction={handleAddTransaction}
            onAddTask={handleAddTask}
            onAddNote={handleAddNote}
            onAddHabit={handleAddHabit}
            onAddGoal={handleAddGoal}
            onAddDebt={handleAddDebt}
            onAddRecurringBill={handleAddRecurringBill}
            onSaveBudget={handleSaveBudget}
            onNavigateFinance={(page) => {
              handleSelectFinancePage(page);
              setAssistantModalState({ open: false });
            }}
            onNavigatePlanner={(page) => {
              handleSelectPlannerPage(page);
              setAssistantModalState({ open: false });
            }}
            onNavigateNotes={() => {
              handleSelectTab('notes');
              setAssistantModalState({ open: false });
            }}
          />
        )}
      </Suspense>

      {cloudConflict && (
        <CloudMergeModal
          localSnapshot={cloudConflict.localSnapshot}
          cloudSnapshot={cloudConflict.cloudSnapshot}
          busy={resolvingConflict}
          onMerge={() => void resolveMergeConflict()}
          onUseCloudOnly={resolveUseCloudOnly}
          onDownloadLocalBackup={downloadConflictLocalBackup}
        />
      )}

      {appLockSettingsOpen && (
        <AppLockSettingsModal
          isEnabled={appLock.isEnabled}
          autoLockOnHide={appLock.autoLockOnHide}
          isBiometricsSupported={appLock.isBiometricsSupported}
          hasBiometrics={appLock.hasBiometrics}
          onEnablePin={appLock.enablePinLock}
          onChangePin={appLock.changePin}
          onDisablePin={appLock.disablePinLock}
          onToggleAutoLock={appLock.toggleAutoLockOnHide}
          onEnrollBiometrics={appLock.enrollBiometrics}
          onRemoveBiometrics={appLock.removeBiometrics}
          onLockNow={appLock.lockNow}
          onClose={() => setAppLockSettingsOpen(false)}
        />
      )}

      {appLock.isLocked && (
        <AppLockGate
          hasBiometrics={appLock.hasBiometrics}
          lockoutUntil={appLock.lockoutUntil}
          onUnlockWithPin={appLock.unlockWithPin}
          onUnlockWithBiometrics={appLock.unlockWithBiometrics}
        />
      )}
    </div>
  );
}
