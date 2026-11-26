import { User } from 'firebase/auth';
import {
  Unsubscribe,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../firebase';
import {
  BudgetLimit,
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

export interface WorkspaceSettingsPayload {
  primaryIncome: PrimaryIncomeConfig;
  focusGoal: FocusGoal | null;
  notificationSettings: NotificationSettings;
  isDark: boolean;
}

export interface FullWorkspaceSnapshot {
  transactions: Transaction[];
  tasks: Task[];
  notes: Note[];
  budgets: BudgetLimit[];
  recurringBills: RecurringBill[];
  habits: Habit[];
  savingsGoals: SavingsGoal[];
  debts: DebtItem[];
  focusSessions: FocusSession[];
  settings?: WorkspaceSettingsPayload;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

function sanitizeString(val: unknown, maxLen: number, fallback = ''): string {
  if (typeof val !== 'string') return fallback;
  return val.slice(0, maxLen);
}

function sanitizeSafeId(raw: string, fallbackPrefix: string): string {
  if (VALID_ID_REGEX.test(raw) && raw.length >= 1 && raw.length <= 128) {
    return raw;
  }
  return `${fallbackPrefix}-${hashHex(raw)}`;
}

function hashHex(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function getBudgetDocId(category: string): string {
  return `budget-${hashHex(category)}`;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) {
        out[k] = sortJsonValue(v);
      }
    }
    return out;
  }
  return value;
}

export function canonicalSerialize(item: unknown): string {
  return JSON.stringify(sortJsonValue(item));
}

export async function ensureUserDocuments(user: User): Promise<void> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const displayName = sanitizeString(
    user.displayName || user.email?.split('@')[0] || 'Օգտատեր',
    120
  );

  try {
    const existingSnap = await getDoc(userRef);
    if (!existingSnap.exists()) {
      await setDoc(userRef, {
        userId: user.uid,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        displayName,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  const profilePath = `users/${user.uid}/private/profile`;
  const profileRef = doc(db, 'users', user.uid, 'private', 'profile');
  try {
    const profileSnap = await getDoc(profileRef);
    const email = sanitizeString(user.email || '', 200);
    if (!profileSnap.exists()) {
      await setDoc(profileRef, {
        userId: user.uid,
        email,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(profileRef, {
        email,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, profilePath);
  }
}

function buildTransactionDoc(
  tx: Transaction,
  userId: string,
  includeCreated: boolean
): Record<string, unknown> {
  const id = sanitizeSafeId(tx.id, 'tx');
  const payload: Record<string, unknown> = {
    userId,
    id,
    type: tx.type,
    amount: Math.max(1, Number(tx.amount) || 1),
    title: sanitizeString(tx.title.trim() || 'Գործարք', 200),
    category: sanitizeString(tx.category || 'Այլ', 80),
    date: sanitizeString(tx.date, 20),
    serverUpdatedAt: serverTimestamp(),
  };
  if (tx.type === 'income' && tx.incomeKind) {
    payload.incomeKind = tx.incomeKind;
  } else if (!includeCreated) {
    payload.incomeKind = deleteField();
  }
  if (tx.primaryCycleKey) {
    payload.primaryCycleKey = sanitizeString(tx.primaryCycleKey, 20);
  } else if (!includeCreated) {
    payload.primaryCycleKey = deleteField();
  }
  if (typeof tx.isPending === 'boolean') {
    payload.isPending = tx.isPending;
  } else if (!includeCreated) {
    payload.isPending = deleteField();
  }
  if (includeCreated) {
    payload.createdAt = sanitizeString(
      tx.createdAt || new Date().toISOString(),
      50
    );
    payload.serverCreatedAt = serverTimestamp();
  }
  return payload;
}

function buildTaskDoc(
  task: Task,
  userId: string,
  includeCreated: boolean
): Record<string, unknown> {
  const id = sanitizeSafeId(task.id, 'task');
  const payload: Record<string, unknown> = {
    userId,
    id,
    title: sanitizeString(task.title.trim() || 'Անելիք', 240),
    completed: Boolean(task.completed),
    priority: task.priority ?? 'medium',
    date: sanitizeString(task.date, 20),
    serverUpdatedAt: serverTimestamp(),
  };
  if (task.dueTime) {
    payload.dueTime = sanitizeString(task.dueTime, 10);
  } else if (!includeCreated) {
    payload.dueTime = deleteField();
  }
  if (task.scheduleType) {
    payload.scheduleType = task.scheduleType;
  } else if (!includeCreated) {
    payload.scheduleType = deleteField();
  }
  if (task.repeatInterval) {
    payload.repeatInterval = task.repeatInterval;
  } else if (!includeCreated) {
    payload.repeatInterval = deleteField();
  }
  if (
    typeof task.repeatEveryDays === 'number' &&
    Number.isFinite(task.repeatEveryDays)
  ) {
    payload.repeatEveryDays = Math.min(
      365,
      Math.max(1, Math.round(task.repeatEveryDays))
    );
  } else if (!includeCreated) {
    payload.repeatEveryDays = deleteField();
  }
  if (Array.isArray(task.selectedWeekdays)) {
    payload.selectedWeekdays = task.selectedWeekdays
      .filter((d) => typeof d === 'number' && d >= 0 && d <= 6)
      .slice(0, 7);
  } else if (!includeCreated) {
    payload.selectedWeekdays = deleteField();
  }
  if (Array.isArray(task.completedDates)) {
    payload.completedDates = task.completedDates
      .filter((d) => typeof d === 'string')
      .slice(-366);
  } else if (!includeCreated) {
    payload.completedDates = deleteField();
  }
  if (includeCreated) {
    payload.createdAt = sanitizeString(
      task.createdAt || new Date().toISOString(),
      50
    );
    payload.serverCreatedAt = serverTimestamp();
  }
  return payload;
}

function buildNoteDoc(
  note: Note,
  userId: string,
  includeCreated: boolean
): Record<string, unknown> {
  const id = sanitizeSafeId(note.id, 'note');
  const payload: Record<string, unknown> = {
    userId,
    id,
    title: sanitizeString(note.title.trim() || 'Առանց վերնագրի', 200),
    content: sanitizeString(note.content || '', 8000),
    pinned: Boolean(note.pinned),
    updatedAt: sanitizeString(note.updatedAt || new Date().toISOString(), 50),
    serverUpdatedAt: serverTimestamp(),
  };
  if (Array.isArray(note.checklist)) {
    payload.checklist = note.checklist.slice(0, 80).map((item, idx) => ({
      id: sanitizeSafeId(item.id || `chk-${idx}`, 'chk'),
      text: sanitizeString(item.text || '', 240),
      done: Boolean(item.done),
    }));
  } else if (!includeCreated) {
    payload.checklist = deleteField();
  }
  if (note.reminderDate) {
    payload.reminderDate = sanitizeString(note.reminderDate, 30);
  } else if (!includeCreated) {
    payload.reminderDate = deleteField();
  }
  if (includeCreated) {
    payload.serverCreatedAt = serverTimestamp();
  }
  return payload;
}

function buildBudgetDoc(
  budget: BudgetLimit,
  userId: string,
  includeCreated: boolean
): Record<string, unknown> {
  const id = getBudgetDocId(budget.category);
  const payload: Record<string, unknown> = {
    userId,
    id,
    category: sanitizeString(budget.category, 80),
    limit: Math.max(1, Number(budget.limit) || 1),
    serverUpdatedAt: serverTimestamp(),
  };
  if (includeCreated) {
    payload.serverCreatedAt = serverTimestamp();
  }
  return payload;
}

function buildBillDoc(
  bill: RecurringBill,
  userId: string,
  includeCreated: boolean
): Record<string, unknown> {
  const id = sanitizeSafeId(bill.id, 'bill');
  const payload: Record<string, unknown> = {
    userId,
    id,
    title: sanitizeString(bill.title.trim() || 'Վճարում', 200),
    amount: Math.max(0, Number(bill.amount) || 0),
    category: sanitizeString(bill.category || 'Կոմունալ', 80),
    dayOfMonth: Math.min(31, Math.max(1, Math.round(bill.dayOfMonth || 1))),
    serverUpdatedAt: serverTimestamp(),
  };
  if (bill.frequency) payload.frequency = bill.frequency;
  if (bill.reminderTime) {
    payload.reminderTime = sanitizeString(bill.reminderTime, 10);
  } else if (!includeCreated) {
    payload.reminderTime = deleteField();
  }
  if (Array.isArray(bill.dailyTimes)) {
    payload.dailyTimes = bill.dailyTimes
      .filter((t) => typeof t === 'string')
      .slice(0, 8);
  } else if (!includeCreated) {
    payload.dailyTimes = deleteField();
  }
  if (bill.scheduledDate) {
    payload.scheduledDate = sanitizeString(bill.scheduledDate, 20);
  } else if (!includeCreated) {
    payload.scheduledDate = deleteField();
  }
  if (bill.scheduledTime) {
    payload.scheduledTime = sanitizeString(bill.scheduledTime, 10);
  } else if (!includeCreated) {
    payload.scheduledTime = deleteField();
  }
  if (typeof bill.isVariableAmount === 'boolean') {
    payload.isVariableAmount = bill.isVariableAmount;
  } else if (!includeCreated) {
    payload.isVariableAmount = deleteField();
  }
  if (Array.isArray(bill.confirmedSlots)) {
    payload.confirmedSlots = bill.confirmedSlots
      .filter((s) => typeof s === 'string')
      .slice(-200);
  }
  if (Array.isArray(bill.skippedSlots)) {
    payload.skippedSlots = bill.skippedSlots
      .filter((s) => typeof s === 'string')
      .slice(-200);
  }
  if (typeof bill.active === 'boolean') payload.active = bill.active;
  if (includeCreated) {
    payload.serverCreatedAt = serverTimestamp();
  }
  return payload;
}

function buildHabitDoc(
  habit: Habit,
  userId: string,
  includeCreated: boolean
): Record<string, unknown> {
  const id = sanitizeSafeId(habit.id, 'habit');
  const payload: Record<string, unknown> = {
    userId,
    id,
    title: sanitizeString(habit.title.trim() || 'Սովորություն', 200),
    completedDates: Array.isArray(habit.completedDates)
      ? habit.completedDates.filter((d) => typeof d === 'string').slice(-366)
      : [],
    serverUpdatedAt: serverTimestamp(),
  };
  if (includeCreated) {
    payload.createdAt = sanitizeString(
      habit.createdAt || new Date().toISOString(),
      50
    );
    payload.serverCreatedAt = serverTimestamp();
  }
  return payload;
}

function buildSavingsGoalDoc(
  goal: SavingsGoal,
  userId: string,
  includeCreated: boolean
): Record<string, unknown> {
  const id = sanitizeSafeId(goal.id, 'goal');
  const payload: Record<string, unknown> = {
    userId,
    id,
    title: sanitizeString(goal.title.trim() || 'Նպատակ', 200),
    targetAmount: Math.max(1, Number(goal.targetAmount) || 1),
    currentAmount: Math.max(0, Number(goal.currentAmount) || 0),
    serverUpdatedAt: serverTimestamp(),
  };
  if (goal.deadline) {
    payload.deadline = sanitizeString(goal.deadline, 20);
  } else if (!includeCreated) {
    payload.deadline = deleteField();
  }
  if (goal.category) {
    payload.category = sanitizeString(goal.category, 80);
  } else if (!includeCreated) {
    payload.category = deleteField();
  }
  if (typeof goal.completed === 'boolean') {
    payload.completed = goal.completed;
  } else if (!includeCreated) {
    payload.completed = deleteField();
  }
  if (includeCreated) {
    payload.createdAt = sanitizeString(
      goal.createdAt || new Date().toISOString(),
      50
    );
    payload.serverCreatedAt = serverTimestamp();
  }
  return payload;
}

function buildDebtDoc(
  debt: DebtItem,
  userId: string,
  includeCreated: boolean
): Record<string, unknown> {
  const id = sanitizeSafeId(debt.id, 'debt');
  const payload: Record<string, unknown> = {
    userId,
    id,
    person: sanitizeString(debt.person.trim() || 'Անձ', 160),
    direction: debt.direction,
    totalAmount: Math.max(1, Number(debt.totalAmount) || 1),
    paidAmount: Math.max(0, Number(debt.paidAmount) || 0),
    settled: Boolean(debt.settled),
    serverUpdatedAt: serverTimestamp(),
  };
  if (debt.dueDate) {
    payload.dueDate = sanitizeString(debt.dueDate, 20);
  } else if (!includeCreated) {
    payload.dueDate = deleteField();
  }
  if (debt.note) {
    payload.note = sanitizeString(debt.note, 500);
  } else if (!includeCreated) {
    payload.note = deleteField();
  }
  if (includeCreated) {
    payload.createdAt = sanitizeString(
      debt.createdAt || new Date().toISOString(),
      50
    );
    payload.serverCreatedAt = serverTimestamp();
  }
  return payload;
}

function buildFocusSessionDoc(
  session: FocusSession,
  userId: string,
  includeCreated: boolean
): Record<string, unknown> {
  const id = sanitizeSafeId(session.id, 'focus');
  const payload: Record<string, unknown> = {
    userId,
    id,
    date: sanitizeString(session.date, 20),
    minutes: Math.min(240, Math.max(1, Math.round(session.minutes || 25))),
    mode: session.mode,
    label: sanitizeString(session.label.trim() || 'Ֆոկուս սեսիա', 240),
    serverUpdatedAt: serverTimestamp(),
  };
  if (session.taskId) {
    payload.taskId = sanitizeSafeId(session.taskId, 'task');
  } else if (!includeCreated) {
    payload.taskId = deleteField();
  }
  if (includeCreated) {
    payload.completedAt = sanitizeString(
      session.completedAt || new Date().toISOString(),
      50
    );
    payload.serverCreatedAt = serverTimestamp();
  }
  return payload;
}

function buildSettingsDoc(
  settings: WorkspaceSettingsPayload,
  userId: string,
  includeCreated: boolean
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    userId,
    primaryIncome: {
      enabled: Boolean(settings.primaryIncome.enabled),
      title: sanitizeString(settings.primaryIncome.title || 'Հիմնական աշխատավարձ', 120),
      amount: Math.max(0, Number(settings.primaryIncome.amount) || 0),
      payday: Math.min(
        31,
        Math.max(1, Math.round(settings.primaryIncome.payday || 1))
      ),
      autoCredit: Boolean(settings.primaryIncome.autoCredit),
      creditedCycles: (settings.primaryIncome.creditedCycles || [])
        .filter((c) => typeof c === 'string')
        .slice(-120),
    },
    focusGoal: settings.focusGoal
      ? {
          title: sanitizeString(settings.focusGoal.title, 200),
          completed: Boolean(settings.focusGoal.completed),
          date: sanitizeString(settings.focusGoal.date, 20),
        }
      : null,
    notificationSettings: {
      soundEnabled: Boolean(settings.notificationSettings.soundEnabled),
      browserNotifications: Boolean(
        settings.notificationSettings.browserNotifications
      ),
    },
    isDark: Boolean(settings.isDark),
    serverUpdatedAt: serverTimestamp(),
  };
  if (includeCreated) {
    payload.serverCreatedAt = serverTimestamp();
  }
  return payload;
}

export async function checkCloudWorkspaceExists(userId: string): Promise<boolean> {
  const settingsPath = `users/${userId}/settings/workspace`;
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'settings', 'workspace'));
    if (snap.exists()) return true;
    const txSnap = await getDocs(collection(db, 'users', userId, 'transactions'));
    return !txSnap.empty;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, settingsPath);
  }
}

export async function uploadFullWorkspaceToCloud(
  userId: string,
  snapshot: FullWorkspaceSnapshot
): Promise<void> {
  const ops: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }> = [];

  if (snapshot.settings) {
    ops.push({
      ref: doc(db, 'users', userId, 'settings', 'workspace'),
      data: buildSettingsDoc(snapshot.settings, userId, true),
    });
  }

  for (const tx of snapshot.transactions) {
    const id = sanitizeSafeId(tx.id, 'tx');
    ops.push({
      ref: doc(db, 'users', userId, 'transactions', id),
      data: buildTransactionDoc(tx, userId, true),
    });
  }
  for (const task of snapshot.tasks) {
    const id = sanitizeSafeId(task.id, 'task');
    ops.push({
      ref: doc(db, 'users', userId, 'tasks', id),
      data: buildTaskDoc(task, userId, true),
    });
  }
  for (const note of snapshot.notes) {
    const id = sanitizeSafeId(note.id, 'note');
    ops.push({
      ref: doc(db, 'users', userId, 'notes', id),
      data: buildNoteDoc(note, userId, true),
    });
  }
  for (const budget of snapshot.budgets) {
    const id = getBudgetDocId(budget.category);
    ops.push({
      ref: doc(db, 'users', userId, 'budgets', id),
      data: buildBudgetDoc(budget, userId, true),
    });
  }
  for (const bill of snapshot.recurringBills) {
    const id = sanitizeSafeId(bill.id, 'bill');
    ops.push({
      ref: doc(db, 'users', userId, 'recurringBills', id),
      data: buildBillDoc(bill, userId, true),
    });
  }
  for (const habit of snapshot.habits) {
    const id = sanitizeSafeId(habit.id, 'habit');
    ops.push({
      ref: doc(db, 'users', userId, 'habits', id),
      data: buildHabitDoc(habit, userId, true),
    });
  }
  for (const goal of snapshot.savingsGoals) {
    const id = sanitizeSafeId(goal.id, 'goal');
    ops.push({
      ref: doc(db, 'users', userId, 'savingsGoals', id),
      data: buildSavingsGoalDoc(goal, userId, true),
    });
  }
  for (const debt of snapshot.debts) {
    const id = sanitizeSafeId(debt.id, 'debt');
    ops.push({
      ref: doc(db, 'users', userId, 'debts', id),
      data: buildDebtDoc(debt, userId, true),
    });
  }
  for (const session of snapshot.focusSessions) {
    const id = sanitizeSafeId(session.id, 'focus');
    ops.push({
      ref: doc(db, 'users', userId, 'focusSessions', id),
      data: buildFocusSessionDoc(session, userId, true),
    });
  }

  // Commit in chunks of 400 (Firestore batch limit is 500)
  for (let i = 0; i < ops.length; i += 400) {
    const chunk = ops.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const op of chunk) {
      batch.set(op.ref, op.data);
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `users/${userId}`
      );
    }
  }
}

export async function upsertWorkspaceSettings(
  userId: string,
  settings: WorkspaceSettingsPayload,
  alreadyExists: boolean
): Promise<void> {
  const path = `users/${userId}/settings/workspace`;
  const ref = doc(db, 'users', userId, 'settings', 'workspace');
  try {
    if (alreadyExists) {
      await updateDoc(ref, buildSettingsDoc(settings, userId, false));
    } else {
      await setDoc(ref, buildSettingsDoc(settings, userId, true));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncCollectionItems<T>(params: {
  userId: string;
  collectionName:
    | 'transactions'
    | 'tasks'
    | 'notes'
    | 'budgets'
    | 'recurringBills'
    | 'habits'
    | 'savingsGoals'
    | 'debts'
    | 'focusSessions';
  items: T[];
  getId: (item: T) => string;
  knownSerializedMap: Map<string, string>;
  buildDoc: (item: T, userId: string, includeCreated: boolean) => Record<string, unknown>;
  serializeForDiff: (item: T) => string;
}): Promise<void> {
  const {
    userId,
    collectionName,
    items,
    getId,
    knownSerializedMap,
    buildDoc,
    serializeForDiff,
  } = params;

  const currentIds = new Set<string>();
  const writes: Array<{ id: string; isNew: boolean; data: Record<string, unknown>; serialized: string }> = [];

  for (const item of items) {
    const id = getId(item);
    currentIds.add(id);
    const serialized = serializeForDiff(item);
    const prevSerialized = knownSerializedMap.get(id);
    if (prevSerialized === undefined) {
      writes.push({
        id,
        isNew: true,
        data: buildDoc(item, userId, true),
        serialized,
      });
    } else if (prevSerialized !== serialized) {
      writes.push({
        id,
        isNew: false,
        data: buildDoc(item, userId, false),
        serialized,
      });
    }
  }

  const deletions: string[] = [];
  for (const existingId of knownSerializedMap.keys()) {
    if (!currentIds.has(existingId)) {
      deletions.push(existingId);
    }
  }

  for (const w of writes) {
    const path = `users/${userId}/${collectionName}/${w.id}`;
    const ref = doc(db, 'users', userId, collectionName, w.id);
    knownSerializedMap.set(w.id, w.serialized);
    try {
      if (w.isNew) {
        await setDoc(ref, w.data);
      } else {
        await updateDoc(ref, w.data);
      }
    } catch (error) {
      handleFirestoreError(
        error,
        w.isNew ? OperationType.CREATE : OperationType.UPDATE,
        path
      );
    }
  }

  for (const delId of deletions) {
    const path = `users/${userId}/${collectionName}/${delId}`;
    knownSerializedMap.delete(delId);
    try {
      await deleteDoc(doc(db, 'users', userId, collectionName, delId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
}

export const collectionBuilders = {
  transactions: buildTransactionDoc,
  tasks: buildTaskDoc,
  notes: buildNoteDoc,
  budgets: buildBudgetDoc,
  recurringBills: buildBillDoc,
  habits: buildHabitDoc,
  savingsGoals: buildSavingsGoalDoc,
  debts: buildDebtDoc,
  focusSessions: buildFocusSessionDoc,
};

function stripServerMeta<T extends Record<string, unknown>>(raw: T): T {
  const clone = { ...raw };
  delete clone.userId;
  delete clone.serverCreatedAt;
  delete clone.serverUpdatedAt;
  return clone;
}

export function subscribeUserWorkspace(params: {
  userId: string;
  onTransactions: (items: Transaction[], known: Map<string, string>) => void;
  onTasks: (items: Task[], known: Map<string, string>) => void;
  onNotes: (items: Note[], known: Map<string, string>) => void;
  onBudgets: (items: BudgetLimit[], known: Map<string, string>) => void;
  onRecurringBills: (items: RecurringBill[], known: Map<string, string>) => void;
  onHabits: (items: Habit[], known: Map<string, string>) => void;
  onSavingsGoals: (items: SavingsGoal[], known: Map<string, string>) => void;
  onDebts: (items: DebtItem[], known: Map<string, string>) => void;
  onFocusSessions: (items: FocusSession[], known: Map<string, string>) => void;
  onSettings: (settings: WorkspaceSettingsPayload | null, exists: boolean) => void;
  onSynced?: () => void;
}): Unsubscribe {
  const { userId, onSynced } = params;
  const unsubs: Unsubscribe[] = [];

  const attachCollection = <T extends Record<string, unknown>>(
    name: string,
    getId: (item: T) => string,
    cb: (items: T[], known: Map<string, string>) => void
  ) => {
    const path = `users/${userId}/${name}`;
    const unsub = onSnapshot(
      collection(db, 'users', userId, name),
      (snap) => {
        const items: T[] = [];
        const known = new Map<string, string>();
        snap.forEach((docSnap) => {
          const clean = stripServerMeta(docSnap.data() as T);
          items.push(clean);
          known.set(getId(clean), canonicalSerialize(clean));
        });
        cb(items, known);
        onSynced?.();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
    unsubs.push(unsub);
  };

  attachCollection<Transaction & Record<string, unknown>>(
    'transactions',
    (item) => sanitizeSafeId(item.id, 'tx'),
    (items, known) => {
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      params.onTransactions(items, known);
    }
  );
  attachCollection<Task & Record<string, unknown>>(
    'tasks',
    (item) => sanitizeSafeId(item.id, 'task'),
    (items, known) => {
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      params.onTasks(items, known);
    }
  );
  attachCollection<Note & Record<string, unknown>>(
    'notes',
    (item) => sanitizeSafeId(item.id, 'note'),
    (items, known) => {
      items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      params.onNotes(items, known);
    }
  );
  attachCollection<BudgetLimit & Record<string, unknown>>(
    'budgets',
    (item) => getBudgetDocId(item.category),
    (items, known) => {
      const cleaned = items.map(({ category, limit }) => ({ category, limit }));
      const nextKnown = new Map<string, string>();
      for (const b of cleaned) {
        nextKnown.set(getBudgetDocId(b.category), canonicalSerialize(b));
      }
      void known;
      params.onBudgets(cleaned, nextKnown);
    }
  );
  attachCollection<RecurringBill & Record<string, unknown>>(
    'recurringBills',
    (item) => sanitizeSafeId(item.id, 'bill'),
    params.onRecurringBills
  );
  attachCollection<Habit & Record<string, unknown>>(
    'habits',
    (item) => sanitizeSafeId(item.id, 'habit'),
    params.onHabits
  );
  attachCollection<SavingsGoal & Record<string, unknown>>(
    'savingsGoals',
    (item) => sanitizeSafeId(item.id, 'goal'),
    params.onSavingsGoals
  );
  attachCollection<DebtItem & Record<string, unknown>>(
    'debts',
    (item) => sanitizeSafeId(item.id, 'debt'),
    params.onDebts
  );
  attachCollection<FocusSession & Record<string, unknown>>(
    'focusSessions',
    (item) => sanitizeSafeId(item.id, 'focus'),
    (items, known) => {
      items.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
      params.onFocusSessions(items, known);
    }
  );

  const settingsPath = `users/${userId}/settings/workspace`;
  const settingsUnsub = onSnapshot(
    doc(db, 'users', userId, 'settings', 'workspace'),
    (snap) => {
      if (!snap.exists()) {
        params.onSettings(null, false);
        return;
      }
      const data = snap.data();
      params.onSettings(
        {
          primaryIncome: data.primaryIncome as PrimaryIncomeConfig,
          focusGoal: (data.focusGoal as FocusGoal | null) ?? null,
          notificationSettings: data.notificationSettings as NotificationSettings,
          isDark: Boolean(data.isDark),
        },
        true
      );
      onSynced?.();
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, settingsPath);
    }
  );
  unsubs.push(settingsUnsub);

  return () => {
    unsubs.forEach((u) => u());
  };
}
