import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, signInWithGoogle, signOutFirebase } from '../firebase';
import { CloudSyncStatus } from '../components/TopNav';
import {
  FullWorkspaceSnapshot,
  WorkspaceSettingsPayload,
  canonicalSerialize,
  checkCloudWorkspaceExists,
  collectionBuilders,
  ensureUserDocuments,
  fetchCloudWorkspaceSnapshot,
  getBudgetDocId,
  subscribeUserWorkspace,
  syncCollectionItems,
  uploadFullWorkspaceToCloud,
  upsertWorkspaceSettings,
} from '../services/firestoreSync';
import {
  getInitialBudgets,
  getInitialCards,
  getInitialHabits,
  getInitialNotes,
  getInitialPrimaryIncome,
  getInitialRecurringBills,
  getInitialSavingsGoals,
  getInitialTasks,
  getInitialTransactions,
  normalizeNotificationSettings,
} from '../data/defaults';
import {
  BankCard,
  BudgetLimit,
  CustomCategory,
  DebtItem,
  FocusGoal,
  FocusSession,
  Habit,
  Note,
  NotificationSettings,
  PrimaryIncomeConfig,
  RecurringBill,
  SavingsGoal,
  Task,
  Transaction,
} from '../types';

export interface CloudConflictState {
  userId: string;
  localSnapshot: FullWorkspaceSnapshot;
  cloudSnapshot: FullWorkspaceSnapshot;
}

function mergeByKey<T>(
  cloudItems: T[],
  localItems: T[],
  getKey: (item: T) => string,
  getTimestamp?: (item: T) => string,
  resolveOverride?: (cloudItem: T, localItem: T) => T
): T[] {
  const map = new Map<string, T>();
  for (const item of cloudItems) {
    map.set(getKey(item), item);
  }
  for (const item of localItems) {
    const key = getKey(item);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      continue;
    }
    if (getTimestamp) {
      const localTs = getTimestamp(item) || '';
      const cloudTs = getTimestamp(existing) || '';
      if (localTs > cloudTs) {
        map.set(key, resolveOverride ? resolveOverride(existing, item) : item);
      }
    }
  }
  return Array.from(map.values());
}

export function mergeWorkspaces(
  cloud: FullWorkspaceSnapshot,
  local: FullWorkspaceSnapshot
): FullWorkspaceSnapshot {
  const mergedCustomCategories = mergeByKey(
    cloud.settings?.customCategories ?? [],
    local.settings?.customCategories ?? [],
    (c) => `${c.type}:${c.name.trim().toLowerCase()}`
  ).slice(0, 40);

  const cloudPrimary = cloud.settings?.primaryIncome;
  const localPrimary = local.settings?.primaryIncome;
  const primaryIncome =
    cloudPrimary && cloudPrimary.enabled
      ? cloudPrimary
      : localPrimary && localPrimary.enabled
        ? localPrimary
        : (cloudPrimary ?? localPrimary ?? getInitialPrimaryIncome());

  return {
    transactions: mergeByKey(
      cloud.transactions,
      local.transactions,
      (t) => t.id,
      (t) => `${t.date || ''}|${t.createdAt || ''}`,
      (cloudTx, localTx) => ({
        ...localTx,
        createdAt: cloudTx.createdAt || localTx.createdAt,
      })
    ).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    cards: mergeByKey(
      cloud.cards,
      local.cards,
      (c) => c.id,
      (c) => c.createdAt || '',
      (cloudCard, localCard) => ({
        ...localCard,
        createdAt: cloudCard.createdAt || localCard.createdAt,
      })
    ),
    tasks: mergeByKey(
      cloud.tasks,
      local.tasks,
      (t) => t.id,
      (t) => t.createdAt || '',
      (cloudTask, localTask) => ({
        ...localTask,
        createdAt: cloudTask.createdAt || localTask.createdAt,
      })
    ),
    notes: mergeByKey(
      cloud.notes,
      local.notes,
      (n) => n.id,
      (n) => n.updatedAt || ''
    ),
    budgets: mergeByKey(cloud.budgets, local.budgets, (b) => b.category),
    recurringBills: mergeByKey(cloud.recurringBills, local.recurringBills, (b) => b.id),
    habits: mergeByKey(cloud.habits, local.habits, (h) => h.id),
    savingsGoals: mergeByKey(cloud.savingsGoals, local.savingsGoals, (g) => g.id),
    debts: mergeByKey(cloud.debts, local.debts, (d) => d.id),
    focusSessions: mergeByKey(cloud.focusSessions, local.focusSessions, (f) => f.id),
    settings: {
      primaryIncome,
      focusGoal: cloud.settings?.focusGoal ?? local.settings?.focusGoal ?? null,
      notificationSettings:
        cloud.settings?.notificationSettings ??
        local.settings?.notificationSettings ??
        normalizeNotificationSettings(),
      isDark: cloud.settings?.isDark ?? local.settings?.isDark ?? true,
      customCategories: mergedCustomCategories,
    },
  };
}

export function hasMeaningfulLocalWorkspaceData(local: FullWorkspaceSnapshot): boolean {
  const defaultTxIds = new Set(getInitialTransactions().map((t) => t.id));
  const defaultTaskIds = new Set(getInitialTasks().map((t) => t.id));
  const defaultNoteIds = new Set(getInitialNotes().map((n) => n.id));
  const defaultCardIds = new Set(getInitialCards().map((c) => c.id));
  const defaultGoalIds = new Set(getInitialSavingsGoals().map((g) => g.id));
  const defaultHabitIds = new Set(getInitialHabits().map((h) => h.id));
  const defaultBillIds = new Set(getInitialRecurringBills().map((b) => b.id));
  const defaultBudgetsSig = canonicalSerialize(getInitialBudgets());

  if (local.transactions.some((t) => !defaultTxIds.has(t.id))) return true;
  if (local.tasks.some((t) => !defaultTaskIds.has(t.id))) return true;
  if (local.notes.some((n) => !defaultNoteIds.has(n.id))) return true;
  if (local.cards.some((c) => !defaultCardIds.has(c.id))) return true;
  if (local.savingsGoals.some((g) => !defaultGoalIds.has(g.id))) return true;
  if (local.habits.some((h) => !defaultHabitIds.has(h.id))) return true;
  if (local.recurringBills.some((b) => !defaultBillIds.has(b.id))) return true;
  if (local.debts.length > 0 || local.focusSessions.length > 0) return true;
  if ((local.settings?.customCategories?.length ?? 0) > 0) return true;
  if (local.settings?.primaryIncome.enabled) return true;
  if (canonicalSerialize(local.budgets) !== defaultBudgetsSig) return true;

  // Detect edits to initial cards (e.g. changing initial balance)
  const initialCardBalances = new Map(
    getInitialCards().map((c) => [c.id, c.initialBalance])
  );
  if (
    local.cards.some(
      (c) =>
        initialCardBalances.has(c.id) &&
        initialCardBalances.get(c.id) !== c.initialBalance
    )
  ) {
    return true;
  }

  return false;
}

interface UseWorkspaceCloudSyncParams {
  transactions: Transaction[];
  setTransactions: (v: Transaction[]) => void;
  cards: BankCard[];
  setCards: (v: BankCard[]) => void;
  tasks: Task[];
  setTasks: (v: Task[]) => void;
  notes: Note[];
  setNotes: (v: Note[]) => void;
  budgets: BudgetLimit[];
  setBudgets: (v: BudgetLimit[]) => void;
  recurringBills: RecurringBill[];
  setRecurringBills: (v: RecurringBill[]) => void;
  habits: Habit[];
  setHabits: (v: Habit[]) => void;
  savingsGoals: SavingsGoal[];
  setSavingsGoals: (v: SavingsGoal[]) => void;
  debts: DebtItem[];
  setDebts: (v: DebtItem[]) => void;
  focusSessions: FocusSession[];
  setFocusSessions: (v: FocusSession[]) => void;
  primaryIncome: PrimaryIncomeConfig;
  setPrimaryIncome: (v: PrimaryIncomeConfig) => void;
  focusGoal: FocusGoal | null;
  setFocusGoal: (v: FocusGoal | null) => void;
  notificationSettings: NotificationSettings;
  setNotificationSettings: (v: NotificationSettings) => void;
  isDark: boolean;
  setIsDark: (v: boolean) => void;
  customCategories: CustomCategory[];
  setCustomCategories: (v: CustomCategory[]) => void;
  showToast: (msg: string) => void;
}

export function useWorkspaceCloudSync(params: UseWorkspaceCloudSyncParams) {
  const {
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
  } = params;

  const [user, setUser] = useState<User | null>(null);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>('idle');
  const [cloudConflict, setCloudConflict] = useState<CloudConflictState | null>(null);
  const [resolvingConflict, setResolvingConflict] = useState(false);

  const knownMapsRef = useRef<{
    transactions: Map<string, string>;
    cards: Map<string, string>;
    tasks: Map<string, string>;
    notes: Map<string, string>;
    budgets: Map<string, string>;
    recurringBills: Map<string, string>;
    habits: Map<string, string>;
    savingsGoals: Map<string, string>;
    debts: Map<string, string>;
    focusSessions: Map<string, string>;
  }>({
    transactions: new Map(),
    cards: new Map(),
    tasks: new Map(),
    notes: new Map(),
    budgets: new Map(),
    recurringBills: new Map(),
    habits: new Map(),
    savingsGoals: new Map(),
    debts: new Map(),
    focusSessions: new Map(),
  });
  const settingsExistsRef = useRef(false);
  const cloudReadyRef = useRef(false);
  const isApplyingRemoteRef = useRef(false);
  const workspaceUnsubRef = useRef<(() => void) | null>(null);

  const latestWorkspaceRef = useRef<FullWorkspaceSnapshot>(
    null as unknown as FullWorkspaceSnapshot
  );
  latestWorkspaceRef.current = {
    transactions,
    cards,
    tasks,
    notes,
    budgets,
    recurringBills,
    habits,
    savingsGoals,
    debts,
    focusSessions,
    settings: {
      primaryIncome,
      focusGoal,
      notificationSettings,
      isDark,
      customCategories,
    },
  };

  const applySnapshotToLocal = useCallback(
    (snapshot: FullWorkspaceSnapshot) => {
      isApplyingRemoteRef.current = true;
      setTransactions(snapshot.transactions);
      setCards(snapshot.cards);
      setTasks(snapshot.tasks);
      setNotes(snapshot.notes);
      setBudgets(snapshot.budgets);
      setRecurringBills(snapshot.recurringBills);
      setHabits(snapshot.habits);
      setSavingsGoals(snapshot.savingsGoals);
      setDebts(snapshot.debts);
      setFocusSessions(snapshot.focusSessions);
      if (snapshot.settings) {
        if (snapshot.settings.primaryIncome) {
          setPrimaryIncome(snapshot.settings.primaryIncome);
        }
        setFocusGoal(snapshot.settings.focusGoal ?? null);
        if (snapshot.settings.notificationSettings) {
          setNotificationSettings(
            normalizeNotificationSettings(snapshot.settings.notificationSettings)
          );
        }
        setIsDark(Boolean(snapshot.settings.isDark));
        setCustomCategories(snapshot.settings.customCategories ?? []);
      }
      queueMicrotask(() => {
        isApplyingRemoteRef.current = false;
      });
    },
    [
      setBudgets,
      setCards,
      setCustomCategories,
      setDebts,
      setFocusGoal,
      setFocusSessions,
      setHabits,
      setIsDark,
      setNotes,
      setNotificationSettings,
      setPrimaryIncome,
      setRecurringBills,
      setSavingsGoals,
      setTasks,
      setTransactions,
    ]
  );

  const attachRealtimeSubscription = useCallback(
    (userId: string) => {
      if (workspaceUnsubRef.current) {
        workspaceUnsubRef.current();
        workspaceUnsubRef.current = null;
      }

      workspaceUnsubRef.current = subscribeUserWorkspace({
        userId,
        onTransactions: (items, known) => {
          isApplyingRemoteRef.current = true;
          knownMapsRef.current.transactions = known;
          setTransactions(items);
          queueMicrotask(() => {
            isApplyingRemoteRef.current = false;
          });
        },
        onCards: (items, known) => {
          isApplyingRemoteRef.current = true;
          knownMapsRef.current.cards = known;
          setCards(items);
          queueMicrotask(() => {
            isApplyingRemoteRef.current = false;
          });
        },
        onTasks: (items, known) => {
          isApplyingRemoteRef.current = true;
          knownMapsRef.current.tasks = known;
          setTasks(items);
          queueMicrotask(() => {
            isApplyingRemoteRef.current = false;
          });
        },
        onNotes: (items, known) => {
          isApplyingRemoteRef.current = true;
          knownMapsRef.current.notes = known;
          setNotes(items);
          queueMicrotask(() => {
            isApplyingRemoteRef.current = false;
          });
        },
        onBudgets: (items, known) => {
          isApplyingRemoteRef.current = true;
          knownMapsRef.current.budgets = known;
          setBudgets(items);
          queueMicrotask(() => {
            isApplyingRemoteRef.current = false;
          });
        },
        onRecurringBills: (items, known) => {
          isApplyingRemoteRef.current = true;
          knownMapsRef.current.recurringBills = known;
          setRecurringBills(items);
          queueMicrotask(() => {
            isApplyingRemoteRef.current = false;
          });
        },
        onHabits: (items, known) => {
          isApplyingRemoteRef.current = true;
          knownMapsRef.current.habits = known;
          setHabits(items);
          queueMicrotask(() => {
            isApplyingRemoteRef.current = false;
          });
        },
        onSavingsGoals: (items, known) => {
          isApplyingRemoteRef.current = true;
          knownMapsRef.current.savingsGoals = known;
          setSavingsGoals(items);
          queueMicrotask(() => {
            isApplyingRemoteRef.current = false;
          });
        },
        onDebts: (items, known) => {
          isApplyingRemoteRef.current = true;
          knownMapsRef.current.debts = known;
          setDebts(items);
          queueMicrotask(() => {
            isApplyingRemoteRef.current = false;
          });
        },
        onFocusSessions: (items, known) => {
          isApplyingRemoteRef.current = true;
          knownMapsRef.current.focusSessions = known;
          setFocusSessions(items);
          queueMicrotask(() => {
            isApplyingRemoteRef.current = false;
          });
        },
        onSettings: (settings, hasDoc) => {
          settingsExistsRef.current = hasDoc;
          if (settings) {
            isApplyingRemoteRef.current = true;
            if (settings.primaryIncome) {
              setPrimaryIncome(settings.primaryIncome);
            }
            setFocusGoal(settings.focusGoal ?? null);
            if (settings.notificationSettings) {
              setNotificationSettings(
                normalizeNotificationSettings(settings.notificationSettings)
              );
            }
            setIsDark(Boolean(settings.isDark));
            setCustomCategories(settings.customCategories ?? []);
            queueMicrotask(() => {
              isApplyingRemoteRef.current = false;
            });
          }
        },
        onSynced: () => {
          cloudReadyRef.current = true;
          setSyncStatus(navigator.onLine ? 'synced' : 'offline');
        },
      });
    },
    [
      setBudgets,
      setCards,
      setCustomCategories,
      setDebts,
      setFocusGoal,
      setFocusSessions,
      setHabits,
      setIsDark,
      setNotes,
      setNotificationSettings,
      setPrimaryIncome,
      setRecurringBills,
      setSavingsGoals,
      setTasks,
      setTransactions,
    ]
  );

  // Firebase Auth & Conflict-Safe Firestore Workspace Subscription
  useEffect(() => {
    let active = true;

    const authUnsub = onAuthStateChanged(auth, async (nextUser) => {
      if (workspaceUnsubRef.current) {
        workspaceUnsubRef.current();
        workspaceUnsubRef.current = null;
      }

      setUser(nextUser);
      setCloudConflict(null);
      cloudReadyRef.current = false;

      if (!nextUser) {
        Object.values(knownMapsRef.current).forEach((m) => m.clear());
        settingsExistsRef.current = false;
        setSyncStatus('idle');
        return;
      }

      setSyncStatus('syncing');
      try {
        await ensureUserDocuments(nextUser);
        const exists = await checkCloudWorkspaceExists(nextUser.uid);
        if (!active) return;

        if (!exists) {
          await uploadFullWorkspaceToCloud(
            nextUser.uid,
            latestWorkspaceRef.current
          );
          if (!active) return;
          attachRealtimeSubscription(nextUser.uid);
          return;
        }

        const localSnap = latestWorkspaceRef.current;
        if (hasMeaningfulLocalWorkspaceData(localSnap)) {
          const cloudSnap = await fetchCloudWorkspaceSnapshot(nextUser.uid);
          if (!active) return;
          if (cloudSnap) {
            setCloudConflict({
              userId: nextUser.uid,
              localSnapshot: localSnap,
              cloudSnapshot: cloudSnap,
            });
            setSyncStatus('synced');
            return;
          }
        }

        attachRealtimeSubscription(nextUser.uid);
      } catch (err) {
        console.error('Workspace cloud init failed:', err);
        setSyncStatus('error');
      }
    });

    return () => {
      active = false;
      authUnsub();
      if (workspaceUnsubRef.current) {
        workspaceUnsubRef.current();
        workspaceUnsubRef.current = null;
      }
    };
  }, [attachRealtimeSubscription]);

  const resolveMergeConflict = useCallback(async () => {
    if (!cloudConflict) return;
    setResolvingConflict(true);
    setSyncStatus('syncing');
    try {
      const merged = mergeWorkspaces(
        cloudConflict.cloudSnapshot,
        cloudConflict.localSnapshot
      );
      applySnapshotToLocal(merged);
      await uploadFullWorkspaceToCloud(
        cloudConflict.userId,
        merged,
        cloudConflict.cloudSnapshot
      );
      setCloudConflict(null);
      attachRealtimeSubscription(cloudConflict.userId);
      showToast('Տեղային և ամպային տվյալները հաջողությամբ միավորվեցին');
    } catch (err) {
      console.error('Merge failed:', err);
      setSyncStatus('error');
      showToast('Չհաջողվեց միավորել տվյալները։ Փորձեք կրկին։');
    } finally {
      setResolvingConflict(false);
    }
  }, [applySnapshotToLocal, attachRealtimeSubscription, cloudConflict, showToast]);

  const resolveUseCloudOnly = useCallback(() => {
    if (!cloudConflict) return;
    applySnapshotToLocal(cloudConflict.cloudSnapshot);
    const uid = cloudConflict.userId;
    setCloudConflict(null);
    attachRealtimeSubscription(uid);
    showToast('Ամպային տվյալները բեռնվեցին');
  }, [applySnapshotToLocal, attachRealtimeSubscription, cloudConflict, showToast]);

  const downloadConflictLocalBackup = useCallback(() => {
    if (!cloudConflict) return;
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      ...cloudConflict.localSnapshot.settings,
      ...cloudConflict.localSnapshot,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `personal-tracker-local-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Տեղային պահուստային ֆայլը ներբեռնվեց');
  }, [cloudConflict, showToast]);

  // Debounced Local -> Cloud Sync per collection
  useEffect(() => {
    if (!user || !cloudReadyRef.current || isApplyingRemoteRef.current) return;
    const t = window.setTimeout(async () => {
      try {
        setSyncStatus('syncing');
        await syncCollectionItems({
          userId: user.uid,
          collectionName: 'transactions',
          items: transactions,
          getId: (item) => item.id,
          knownSerializedMap: knownMapsRef.current.transactions,
          buildDoc: collectionBuilders.transactions,
          serializeForDiff: canonicalSerialize,
        });
        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      } catch {
        setSyncStatus('error');
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [user, transactions]);

  useEffect(() => {
    if (!user || !cloudReadyRef.current || isApplyingRemoteRef.current) return;
    const t = window.setTimeout(async () => {
      try {
        setSyncStatus('syncing');
        await syncCollectionItems({
          userId: user.uid,
          collectionName: 'cards',
          items: cards,
          getId: (item) => item.id,
          knownSerializedMap: knownMapsRef.current.cards,
          buildDoc: collectionBuilders.cards,
          serializeForDiff: canonicalSerialize,
        });
        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      } catch {
        setSyncStatus('error');
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [user, cards]);

  useEffect(() => {
    if (!user || !cloudReadyRef.current || isApplyingRemoteRef.current) return;
    const t = window.setTimeout(async () => {
      try {
        setSyncStatus('syncing');
        await syncCollectionItems({
          userId: user.uid,
          collectionName: 'tasks',
          items: tasks,
          getId: (item) => item.id,
          knownSerializedMap: knownMapsRef.current.tasks,
          buildDoc: collectionBuilders.tasks,
          serializeForDiff: canonicalSerialize,
        });
        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      } catch {
        setSyncStatus('error');
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [user, tasks]);

  useEffect(() => {
    if (!user || !cloudReadyRef.current || isApplyingRemoteRef.current) return;
    const t = window.setTimeout(async () => {
      try {
        setSyncStatus('syncing');
        await syncCollectionItems({
          userId: user.uid,
          collectionName: 'notes',
          items: notes,
          getId: (item) => item.id,
          knownSerializedMap: knownMapsRef.current.notes,
          buildDoc: collectionBuilders.notes,
          serializeForDiff: canonicalSerialize,
        });
        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      } catch {
        setSyncStatus('error');
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [user, notes]);

  useEffect(() => {
    if (!user || !cloudReadyRef.current || isApplyingRemoteRef.current) return;
    const t = window.setTimeout(async () => {
      try {
        setSyncStatus('syncing');
        await syncCollectionItems({
          userId: user.uid,
          collectionName: 'budgets',
          items: budgets,
          getId: (item) => getBudgetDocId(item.category),
          knownSerializedMap: knownMapsRef.current.budgets,
          buildDoc: collectionBuilders.budgets,
          serializeForDiff: (b) =>
            canonicalSerialize({ category: b.category, limit: b.limit }),
        });
        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      } catch {
        setSyncStatus('error');
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [user, budgets]);

  useEffect(() => {
    if (!user || !cloudReadyRef.current || isApplyingRemoteRef.current) return;
    const t = window.setTimeout(async () => {
      try {
        setSyncStatus('syncing');
        await syncCollectionItems({
          userId: user.uid,
          collectionName: 'recurringBills',
          items: recurringBills,
          getId: (item) => item.id,
          knownSerializedMap: knownMapsRef.current.recurringBills,
          buildDoc: collectionBuilders.recurringBills,
          serializeForDiff: canonicalSerialize,
        });
        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      } catch {
        setSyncStatus('error');
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [user, recurringBills]);

  useEffect(() => {
    if (!user || !cloudReadyRef.current || isApplyingRemoteRef.current) return;
    const t = window.setTimeout(async () => {
      try {
        setSyncStatus('syncing');
        await syncCollectionItems({
          userId: user.uid,
          collectionName: 'habits',
          items: habits,
          getId: (item) => item.id,
          knownSerializedMap: knownMapsRef.current.habits,
          buildDoc: collectionBuilders.habits,
          serializeForDiff: canonicalSerialize,
        });
        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      } catch {
        setSyncStatus('error');
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [user, habits]);

  useEffect(() => {
    if (!user || !cloudReadyRef.current || isApplyingRemoteRef.current) return;
    const t = window.setTimeout(async () => {
      try {
        setSyncStatus('syncing');
        await syncCollectionItems({
          userId: user.uid,
          collectionName: 'savingsGoals',
          items: savingsGoals,
          getId: (item) => item.id,
          knownSerializedMap: knownMapsRef.current.savingsGoals,
          buildDoc: collectionBuilders.savingsGoals,
          serializeForDiff: canonicalSerialize,
        });
        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      } catch {
        setSyncStatus('error');
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [user, savingsGoals]);

  useEffect(() => {
    if (!user || !cloudReadyRef.current || isApplyingRemoteRef.current) return;
    const t = window.setTimeout(async () => {
      try {
        setSyncStatus('syncing');
        await syncCollectionItems({
          userId: user.uid,
          collectionName: 'debts',
          items: debts,
          getId: (item) => item.id,
          knownSerializedMap: knownMapsRef.current.debts,
          buildDoc: collectionBuilders.debts,
          serializeForDiff: canonicalSerialize,
        });
        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      } catch {
        setSyncStatus('error');
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [user, debts]);

  useEffect(() => {
    if (!user || !cloudReadyRef.current || isApplyingRemoteRef.current) return;
    const t = window.setTimeout(async () => {
      try {
        setSyncStatus('syncing');
        await syncCollectionItems({
          userId: user.uid,
          collectionName: 'focusSessions',
          items: focusSessions,
          getId: (item) => item.id,
          knownSerializedMap: knownMapsRef.current.focusSessions,
          buildDoc: collectionBuilders.focusSessions,
          serializeForDiff: canonicalSerialize,
        });
        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      } catch {
        setSyncStatus('error');
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [user, focusSessions]);

  useEffect(() => {
    if (!user || !cloudReadyRef.current || isApplyingRemoteRef.current) return;
    const settingsPayload: WorkspaceSettingsPayload = {
      primaryIncome,
      focusGoal,
      notificationSettings,
      isDark,
      customCategories,
    };
    const t = window.setTimeout(async () => {
      try {
        setSyncStatus('syncing');
        await upsertWorkspaceSettings(
          user.uid,
          settingsPayload,
          settingsExistsRef.current
        );
        settingsExistsRef.current = true;
        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      } catch {
        setSyncStatus('error');
      }
    }, 450);
    return () => window.clearTimeout(t);
  }, [user, primaryIncome, focusGoal, notificationSettings, isDark, customCategories]);

  const handleSignInGoogle = useCallback(async () => {
    try {
      await signInWithGoogle();
      showToast('Մուտքը Google-ով հաջողվեց · ամպային սինքը միացված է');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        showToast('Google մուտքը չեղարկվեց');
      } else {
        showToast('Հնարավոր չեղավ մուտք գործել Google-ով');
      }
    }
  }, [showToast]);

  const handleSignOutGoogle = useCallback(async () => {
    try {
      await signOutFirebase();
      showToast('Դուրս եկաք Google հաշվից');
    } catch {
      showToast('Ելքի ժամանակ սխալ առաջացավ');
    }
  }, [showToast]);

  return {
    user,
    syncStatus,
    cloudConflict,
    resolvingConflict,
    resolveMergeConflict,
    resolveUseCloudOnly,
    downloadConflictLocalBackup,
    handleSignInGoogle,
    handleSignOutGoogle,
  };
}
