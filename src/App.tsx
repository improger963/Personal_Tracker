import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import { TopNav } from './components/TopNav';
import { OverviewView } from './components/OverviewView';
import { FinanceView } from './components/FinanceView';
import { PlannerView } from './components/PlannerView';
import { NotesView } from './components/NotesView';
import { QuickAddModal } from './components/QuickAddModal';
import { NotificationAlerts } from './components/NotificationAlerts';
import { ConfirmExpenseModal } from './components/ConfirmExpenseModal';
import { useLocalStorage } from './hooks/useLocalStorage';
import {
  ARMENIAN_MONTHS,
  formatMoney,
  getInitialBudgets,
  getInitialHabits,
  getInitialNotes,
  getInitialNotificationSettings,
  getInitialPrimaryIncome,
  getInitialRecurringBills,
  getInitialTasks,
  getInitialTransactions,
  getTodayISO,
  getTransactionIncomeKind,
} from './data/defaults';
import {
  formatCycleLabel,
  getCycleBounds,
  getCycleKeyForDate,
  getDateInCycleForDay,
  getEffectivePayday,
  shiftMonthKey,
} from './utils/financialCycle';
import {
  buildAppNotifications,
  canUseBrowserNotifications,
  getCurrentHHMM,
  playNotificationChime,
  sendBrowserNotification,
} from './utils/notifications';
import {
  AppNotificationItem,
  BudgetLimit,
  FocusGoal,
  Habit,
  NavSection,
  Note,
  NotificationSettings,
  PrimaryIncomeConfig,
  RecurringBill,
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
};

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getTodayEditorialDate(): string {
  const now = new Date();
  return `${ARMENIAN_WEEKDAYS_FULL[now.getDay()]}, ${now.getDate()} ${ARMENIAN_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavSection>('overview');
  const [todayKey, setTodayKey] = useState<string>(getTodayISO);
  const [currentHHMM, setCurrentHHMM] = useState<string>(() => getCurrentHHMM());
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isDark, setIsDark] = useLocalStorage<boolean>('pa_theme_dark', true);

  const [primaryIncome, setPrimaryIncome] = useLocalStorage<PrimaryIncomeConfig>(
    'pa_primary_income',
    getInitialPrimaryIncome
  );
  const effectivePayday = getEffectivePayday(primaryIncome);

  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    getCycleKeyForDate(getTodayISO(), effectivePayday)
  );

  const [transactions, setTransactions] = useLocalStorage<Transaction[]>(
    'pa_transactions',
    getInitialTransactions
  );
  const [tasks, setTasks] = useLocalStorage<Task[]>(
    'pa_tasks',
    getInitialTasks
  );
  const [notes, setNotes] = useLocalStorage<Note[]>(
    'pa_notes',
    getInitialNotes
  );
  const [budgets, setBudgets] = useLocalStorage<BudgetLimit[]>(
    'pa_budgets',
    getInitialBudgets
  );
  const [recurringBills, setRecurringBills] = useLocalStorage<RecurringBill[]>(
    'pa_recurring_bills',
    getInitialRecurringBills
  );
  const [habits, setHabits] = useLocalStorage<Habit[]>(
    'pa_habits',
    getInitialHabits
  );
  const [focusGoal, setFocusGoal] = useLocalStorage<FocusGoal | null>(
    'pa_focus_goal',
    null
  );
  const [notificationSettings, setNotificationSettings] =
    useLocalStorage<NotificationSettings>(
      'pa_notification_settings',
      getInitialNotificationSettings
    );
  const [snoozedUntilMap, setSnoozedUntilMap] = useLocalStorage<
    Record<string, number>
  >('pa_notif_snoozed', {});
  const [dismissedBannerIds, setDismissedBannerIds] = useState<string[]>([]);
  const [confirmModalState, setConfirmModalState] = useState<{
    bill: RecurringBill;
    slotKey: string;
    dateISO: string;
    item?: AppNotificationItem;
  } | null>(null);

  const [modalMode, setModalMode] = useState<'transaction' | 'task' | 'note' | null>(null);
  const [toast, setToast] = useState<UndoToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const alertedIdsRef = useRef<Set<string>>(new Set());

  const showToast = (message: string, onUndo?: () => void) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), message, onUndo });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 5000);
  };

  useEffect(() => {
    const syncClock = () => {
      const current = getTodayISO();
      const hhmm = getCurrentHHMM();
      setTodayKey((prev) => (prev === current ? prev : current));
      setCurrentHHMM((prev) => (prev === hhmm ? prev : hhmm));
      setNowMs(Date.now());
    };
    const timer = window.setInterval(syncClock, 15_000);
    window.addEventListener('focus', syncClock);
    document.addEventListener('visibilitychange', syncClock);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', syncClock);
      document.removeEventListener('visibilitychange', syncClock);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

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
  }, [primaryIncome, todayKey, transactions, setTransactions, setPrimaryIncome]);

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

  const handleDeleteTransaction = (id: string) => {
    const removed = transactions.find((t) => t.id === id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    if (removed) {
      showToast('Գործարքը ջնջվեց', () => {
        setTransactions((prev) => [removed, ...prev]);
      });
    }
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
      };
    });
    setTransactions((prev) => [...newTxs, ...prev]);
    showToast(`${newTxs.length} ամսական եկամուտ գրանցվեց`);
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

  const handleConfirmPreExpense = (txId: string) => {
    const target = transactions.find((t) => t.id === txId);
    if (!target) return;
    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, isPending: false } : t))
    );
    showToast(`Հաստատվեց «${target.title}» ծախսը (-${formatMoney(target.amount)})`);
  };

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
    setNotificationSettings((prev) => ({
      ...prev,
      soundEnabled: !prev.soundEnabled,
    }));
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
    const newTask: Task = {
      ...task,
      id: createId('task'),
      completed: false,
      createdAt: new Date().toISOString(),
    };
    setTasks((prev) => [newTask, ...prev]);
  };

  const handleQuickAddTask = (title: string) => {
    handleAddTask({
      title,
      priority: 'medium',
      date: getTodayISO(),
    });
  };

  const handleToggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  const handleUpdateTask = (
    id: string,
    updates: Omit<Task, 'id' | 'completed' | 'createdAt'>
  ) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
    showToast('Անելիքը թարմացվեց');
  };

  const handleUpdateTaskPriority = (id: string, priority: TaskPriority) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, priority } : t))
    );
  };

  const handleDeleteTask = (id: string) => {
    const removed = tasks.find((t) => t.id === id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (removed) {
      showToast('Անելիքը ջնջվեց', () => {
        setTasks((prev) => [removed, ...prev]);
      });
    }
  };

  const handleClearCompletedTasks = () => {
    const removedList = tasks.filter((t) => t.completed);
    setTasks((prev) => prev.filter((t) => !t.completed));
    if (removedList.length > 0) {
      showToast('Կատարված անելիքները մաքրվեցին', () => {
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
  };

  const handleToggleHabitDate = (habitId: string, date: string) => {
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
  };

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

  const handleDeleteNote = (id: string) => {
    const removed = notes.find((n) => n.id === id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (removed) {
      showToast('Նշումը ջնջվեց', () => {
        setNotes((prev) => [removed, ...prev]);
      });
    }
  };

  const handleSaveFocusGoal = (title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const today = getTodayISO();
    setFocusGoal((prev) => ({
      title: trimmed,
      completed: prev && prev.date === today ? prev.completed : false,
      date: today,
    }));
    showToast('Օրվա ֆոկուս նպատակը պահպանվեց');
  };

  const handleToggleFocusGoal = () => {
    const today = getTodayISO();
    setFocusGoal((prev) => {
      if (!prev || prev.date !== today) return prev;
      return { ...prev, completed: !prev.completed };
    });
  };

  const handleClearFocusGoal = () => {
    const previous = focusGoal;
    setFocusGoal(null);
    if (previous) {
      showToast('Օրվա ֆոկուս նպատակը հեռացվեց', () => {
        setFocusGoal(previous);
      });
    }
  };

  const handleExportJSON = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      currency: 'AMD',
      primaryIncome,
      transactions,
      tasks,
      notes,
      budgets,
      recurringBills,
      habits,
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
        const parsed = JSON.parse(String(reader.result));
        if (Array.isArray(parsed.transactions)) setTransactions(parsed.transactions);
        if (Array.isArray(parsed.tasks)) setTasks(parsed.tasks);
        if (Array.isArray(parsed.notes)) setNotes(parsed.notes);
        if (Array.isArray(parsed.budgets)) setBudgets(parsed.budgets);
        if (Array.isArray(parsed.recurringBills))
          setRecurringBills(parsed.recurringBills);
        if (Array.isArray(parsed.habits)) setHabits(parsed.habits);
        if (
          parsed.primaryIncome &&
          typeof parsed.primaryIncome.payday === 'number'
        ) {
          setPrimaryIncome(parsed.primaryIncome);
        }
        if (parsed.focusGoal && typeof parsed.focusGoal.title === 'string') {
          setFocusGoal(parsed.focusGoal);
        }
        if (
          parsed.notificationSettings &&
          typeof parsed.notificationSettings.soundEnabled === 'boolean'
        ) {
          setNotificationSettings(parsed.notificationSettings);
        }
        showToast('Տվյալները հաջողությամբ վերականգնվեցին');
      } catch {
        showToast('Ֆայլի ձևաչափը սխալ է');
      }
    };
    reader.readAsText(file);
  };

  const defaultModalMode: 'transaction' | 'task' | 'note' =
    activeTab === 'planner'
      ? 'task'
      : activeTab === 'notes'
        ? 'note'
        : 'transaction';

  const todayISO = todayKey;
  const priorityRank: Record<TaskPriority, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  const todayPendingTasks = [...tasks]
    .filter((t) => !t.completed && t.date === todayISO)
    .sort((a, b) => {
      const pDiff =
        priorityRank[a.priority ?? 'medium'] -
        priorityRank[b.priority ?? 'medium'];
      if (pDiff !== 0) return pDiff;
      return (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99');
    });

  const dueNoteReminders = [...notes]
    .filter((n) => Boolean(n.reminderDate) && n.reminderDate!.slice(0, 10) <= todayISO)
    .sort((a, b) => (a.reminderDate ?? '').localeCompare(b.reminderDate ?? ''));

  const allNotifications = buildAppNotifications({
    bills: recurringBills,
    transactions,
    tasks,
    notes,
    budgets,
    selectedMonth,
    todayISO,
    currentHHMM,
    effectivePayday,
  });

  const activeNotifications = allNotifications.filter(
    (n) => nowMs >= (snoozedUntilMap[n.id] ?? 0)
  );
  const snoozedCount = allNotifications.length - activeNotifications.length;
  const dueFloatingAlerts = activeNotifications.filter(
    (n) =>
      (n.kind === 'daily_expense' ||
        n.kind === 'planned_expense' ||
        n.kind === 'monthly_bill' ||
        n.kind === 'budget_alert') &&
      (n.status === 'due_now' || n.status === 'overdue') &&
      !dismissedBannerIds.includes(n.id)
  );

  useEffect(() => {
    const newlyDue = activeNotifications.filter(
      (n) =>
        (n.kind === 'daily_expense' ||
          n.kind === 'planned_expense' ||
          n.kind === 'monthly_bill' ||
          n.kind === 'budget_alert') &&
        (n.status === 'due_now' || n.status === 'overdue') &&
        !alertedIdsRef.current.has(n.id)
    );
    if (newlyDue.length === 0) return;

    newlyDue.forEach((n) => alertedIdsRef.current.add(n.id));
    if (notificationSettings.soundEnabled) {
      playNotificationChime();
    }
    if (notificationSettings.browserNotifications) {
      newlyDue.forEach((n) => sendBrowserNotification(n));
    }
  }, [activeNotifications, notificationSettings]);

  const editorialDate = getTodayEditorialDate();

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row bg-[#F4F6FA] dark:bg-[#080C14] text-[#0F172A] dark:text-[#F8FAFC] overflow-x-clip">
      <TopNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenNewModal={() => setModalMode(defaultModalMode)}
        todayTasks={todayPendingTasks}
        onToggleTask={handleToggleTask}
        dueNotes={dueNoteReminders}
        onDismissNoteReminder={handleDismissNoteReminder}
        notifications={activeNotifications}
        snoozedCount={snoozedCount}
        notificationSettings={notificationSettings}
        canUseBrowserNotifs={canUseBrowserNotifications()}
        onToggleSound={handleToggleSound}
        onToggleBrowserNotifications={handleToggleBrowserNotifications}
        onConfirmExpenseNotif={handleConfirmExpenseNotification}
        onSkipExpenseNotif={handleSkipExpenseNotification}
        onSnoozeNotif={handleSnoozeNotification}
        onClearSnoozes={handleClearSnoozes}
        editorialDate={editorialDate}
        selectedMonth={selectedMonth}
        payday={effectivePayday}
        onShiftMonth={(delta) => setSelectedMonth(shiftMonthKey(selectedMonth, delta))}
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
      >
        <main className="flex-1 w-full max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-4 sm:pt-7 min-w-0">
          {/* Mobile & Tablet Preferences Strip (< lg) */}
          <div className="lg:hidden flex flex-wrap items-center justify-between gap-2.5 pb-4 mb-5 border-b border-[#E2E8F0] dark:border-[#1E293B]">
            <p className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
              {editorialDate}
            </p>
            {(activeTab === 'overview' || activeTab === 'finance') && (
              <div className="inline-flex items-center border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl bg-white dark:bg-[#0F172A]">
                <button
                  type="button"
                  onClick={() => setSelectedMonth(shiftMonthKey(selectedMonth, -1))}
                  aria-label="Նախորդ հաշվարկային ամիս"
                  className="min-h-[34px] min-w-[34px] flex items-center justify-center text-[#64748B] dark:text-[#94A3B8] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] rounded-l-xl transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2.5 text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums whitespace-nowrap">
                  {formatCycleLabel(selectedMonth, effectivePayday)}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedMonth(shiftMonthKey(selectedMonth, 1))}
                  aria-label="Հաջորդ հաշվարկային ամիս"
                  className="min-h-[34px] min-w-[34px] flex items-center justify-center text-[#64748B] dark:text-[#94A3B8] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] rounded-r-xl transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeTab === 'overview' && (
              <OverviewView
                selectedMonth={selectedMonth}
                primaryIncome={primaryIncome}
                transactions={transactions}
                tasks={tasks}
                notes={notes}
                budgets={budgets}
                habits={habits}
                focusGoal={
                  focusGoal && focusGoal.date === todayISO ? focusGoal : null
                }
                onSaveFocusGoal={handleSaveFocusGoal}
                onToggleFocusGoal={handleToggleFocusGoal}
                onClearFocusGoal={handleClearFocusGoal}
                onToggleTask={handleToggleTask}
                onQuickAddTask={handleQuickAddTask}
                onToggleHabitDate={handleToggleHabitDate}
                onNavigate={setActiveTab}
                onOpenNewModal={(mode) => setModalMode(mode)}
                onConfirmPreExpense={handleConfirmPreExpense}
              />
            )}

            {activeTab === 'finance' && (
              <FinanceView
                selectedMonth={selectedMonth}
                onChangeMonth={setSelectedMonth}
                primaryIncome={primaryIncome}
                onSavePrimaryIncome={handleSavePrimaryIncome}
                onDisablePrimaryIncome={handleDisablePrimaryIncome}
                onManualCreditPrimaryIncome={handleManualCreditPrimaryIncome}
                transactions={transactions}
                onAddTransaction={handleAddTransaction}
                onUpdateTransaction={handleUpdateTransaction}
                onDeleteTransaction={handleDeleteTransaction}
                onRepeatMonthlyIncomes={handleRepeatMonthlyIncomes}
                onNotify={showToast}
                budgets={budgets}
                onSaveBudget={handleSaveBudget}
                onDeleteBudget={handleDeleteBudget}
                recurringBills={recurringBills}
                onAddRecurringBill={handleAddRecurringBill}
                onUpdateRecurringBill={handleUpdateRecurringBill}
                onDeleteRecurringBill={handleDeleteRecurringBill}
                onPayAllRecurringBills={handlePayAllRecurringBills}
                onConfirmBillSlot={handleConfirmBillSlot}
                onSkipBillSlot={handleSkipBillSlot}
                onConfirmPreExpense={handleConfirmPreExpense}
                currentHHMM={currentHHMM}
                onExportJSON={handleExportJSON}
                onImportJSON={handleImportJSON}
              />
            )}

            {activeTab === 'planner' && (
              <PlannerView
                tasks={tasks}
                onAddTask={handleAddTask}
                onToggleTask={handleToggleTask}
                onUpdateTask={handleUpdateTask}
                onUpdateTaskPriority={handleUpdateTaskPriority}
                onDeleteTask={handleDeleteTask}
                onClearCompleted={handleClearCompletedTasks}
                habits={habits}
                onAddHabit={handleAddHabit}
                onUpdateHabit={handleUpdateHabit}
                onToggleHabitDate={handleToggleHabitDate}
                onDeleteHabit={handleDeleteHabit}
              />
            )}

            {activeTab === 'notes' && (
              <NotesView
                notes={notes}
                onAddNote={handleAddNote}
                onUpdateNote={handleUpdateNote}
                onTogglePin={handleTogglePinNote}
                onDeleteNote={handleDeleteNote}
                onConvertToTask={handleConvertNoteToTask}
              />
            )}
          </motion.div>
        </main>
      </TopNav>

      {/* Non-intrusive Undo / Feedback Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.16 }}
            className="fixed bottom-[4.75rem] md:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 border border-[#CBD5E1] dark:border-[#334155] bg-[#0F172A] dark:bg-[#F8FAFC] text-[#F8FAFC] dark:text-[#0F172A] px-4 py-2.5 rounded-xl shadow-xl flex items-center justify-between sm:justify-start gap-3 text-xs sm:text-sm"
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
                className="inline-flex items-center gap-1 font-semibold text-[#60A5FA] dark:text-[#2563EB] hover:underline cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Հետարկել</span>
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
        onDismissBanner={(id) =>
          setDismissedBannerIds((prev) =>
            prev.includes(id) ? prev : [...prev, id]
          )
        }
      />

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

      {modalMode && (
        <QuickAddModal
          initialMode={modalMode}
          onClose={() => setModalMode(null)}
          onAddTransaction={handleAddTransaction}
          onAddTask={handleAddTask}
          onAddNote={handleAddNote}
        />
      )}
    </div>
  );
}
