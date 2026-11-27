import { User } from 'firebase/auth';
import {
  Unsubscribe,
  collection,
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
import { normalizeNotificationSettings } from '../data/defaults';
import { normalizeCardCurrency } from '../utils/cardBalances';
import { normalizeTags } from '../utils/customCategories';

export interface WorkspaceSettingsPayload {
  primaryIncome: PrimaryIncomeConfig;
  focusGoal: FocusGoal | null;
  notificationSettings: NotificationSettings;
  isDark: boolean;
  customCategories?: CustomCategory[];
}

export interface FullWorkspaceSnapshot {
  transactions: Transaction[];
  cards: BankCard[];
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
  if (typeof tx.cardAmount === 'number' && Number.isFinite(tx.cardAmount) && tx.cardAmount > 0) {
    payload.cardAmount = Math.round(tx.cardAmount * 100) / 100;
  } else if (!includeCreated) {
    payload.cardAmount = deleteField();
  }
  if (tx.cardCurrency) {
    payload.cardCurrency = normalizeCardCurrency(tx.cardCurrency);
  } else if (!includeCreated) {
    payload.cardCurrency = deleteField();
  }
  const cleanTags = normalizeTags(tx.tags);
  if (cleanTags.length > 0) {
    payload.tags = cleanTags.map((t) => sanitizeString(t, 40));
  } else if (!includeCreated) {
    payload.tags = deleteField();
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
  if (tx.cardId) {
    payload.cardId = sanitizeSafeId(tx.cardId, 'card');
  } else if (!includeCreated) {
    payload.cardId = deleteField();
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

function buildBankCardDoc(
  card: BankCard,
  userId: string,
  includeCreated: boolean
): Record<string, unknown> {
  const id = sanitizeSafeId(card.id, 'card');
  const currency = normalizeCardCurrency(card.currency);
  const rawBalance = Number(card.initialBalance);
  const rounded =
    currency === 'AMD'
      ? Math.round(rawBalance)
      : Math.round(rawBalance * 100) / 100;
  const safeBalance = Number.isFinite(rawBalance)
    ? Math.min(1_000_000_000, Math.max(-100_000_000, rounded))
    : 0;
  const payload: Record<string, unknown> = {
    userId,
    id,
    name: sanitizeString(card.name.trim() || 'Քարտ', 120),
    last4: sanitizeString((card.last4 || '').trim(), 10),
    cardType: card.cardType,
    color: card.color,
    initialBalance: safeBalance,
    currency,
    isDefault: Boolean(card.isDefault),
    serverUpdatedAt: serverTimestamp(),
  };
  if (includeCreated) {
    payload.createdAt = sanitizeString(
      card.createdAt || new Date().toISOString(),
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
  if (
    typeof task.expectedAmount === 'number' &&
    Number.isFinite(task.expectedAmount) &&
    task.expectedAmount > 0
  ) {
    payload.expectedAmount = Math.round(task.expectedAmount);
  } else if (!includeCreated) {
    payload.expectedAmount = deleteField();
  }
  if (task.expectedCategory && task.expectedCategory.trim()) {
    payload.expectedCategory = sanitizeString(task.expectedCategory.trim(), 80);
  } else if (!includeCreated) {
    payload.expectedCategory = deleteField();
  }
  if (task.linkedTxId && task.linkedTxId.trim()) {
    payload.linkedTxId = sanitizeSafeId(task.linkedTxId.trim(), 'tx');
  } else if (!includeCreated) {
    payload.linkedTxId = deleteField();
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

function sanitizeCustomCategories(raw?: CustomCategory[]): CustomCategory[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CustomCategory[] = [];
  for (const cat of raw) {
    if (!cat || typeof cat !== 'object') continue;
    const name = sanitizeString(cat.name?.trim() || '', 80);
    if (!name) continue;
    const type = cat.type === 'income' ? 'income' : 'expense';
    const key = `${type}:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: sanitizeSafeId(cat.id || `cat-${out.length + 1}`, 'cat'),
      name,
      type,
      color: sanitizeString(cat.color || '#2563EB', 24) || '#2563EB',
    });
    if (out.length >= 40) break;
  }
  return out;
}

function buildSettingsDoc(
  settings: WorkspaceSettingsPayload,
  userId: string,
  includeCreated: boolean
): Record<string, unknown> {
  const customCategories = sanitizeCustomCategories(settings.customCategories);
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
    notificationSettings: (() => {
      const normalized = normalizeNotificationSettings(
        settings.notificationSettings
      );
      return {
        soundEnabled: normalized.soundEnabled,
        browserNotifications: normalized.browserNotifications,
        soundPreset: normalized.soundPreset ?? 'chime',
        urgentSoundEnabled: normalized.urgentSoundEnabled !== false,
        soundVolume: normalized.soundVolume ?? 0.75,
        voiceEnabled: Boolean(normalized.voiceEnabled),
        voiceMode: normalized.voiceMode ?? 'auto',
        voicePreset: normalized.voicePreset ?? 'Kore',
        browserVoiceURI: sanitizeString(normalized.browserVoiceURI ?? '', 200),
        voiceRate: normalized.voiceRate ?? 1,
        quietHoursEnabled: Boolean(normalized.quietHoursEnabled),
        quietHoursStart: sanitizeString(normalized.quietHoursStart ?? '22:30', 10),
        quietHoursEnd: sanitizeString(normalized.quietHoursEnd ?? '08:00', 10),
      };
    })(),
    isDark: Boolean(settings.isDark),
    serverUpdatedAt: serverTimestamp(),
  };
  if (customCategories.length > 0) {
    payload.customCategories = customCategories;
  } else if (!includeCreated) {
    payload.customCategories = deleteField();
  }
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

function stripServerMeta<T extends Record<string, unknown>>(raw: T): T {
  const clone = { ...raw };
  delete clone.userId;
  delete clone.serverCreatedAt;
  delete clone.serverUpdatedAt;
  return clone;
}

export async function fetchCloudWorkspaceSnapshot(
  userId: string
): Promise<FullWorkspaceSnapshot | null> {
  try {
    const [
      settingsSnap,
      txSnap,
      cardsSnap,
      tasksSnap,
      notesSnap,
      budgetsSnap,
      billsSnap,
      habitsSnap,
      goalsSnap,
      debtsSnap,
      focusSnap,
    ] = await Promise.all([
      getDoc(doc(db, 'users', userId, 'settings', 'workspace')),
      getDocs(collection(db, 'users', userId, 'transactions')),
      getDocs(collection(db, 'users', userId, 'cards')),
      getDocs(collection(db, 'users', userId, 'tasks')),
      getDocs(collection(db, 'users', userId, 'notes')),
      getDocs(collection(db, 'users', userId, 'budgets')),
      getDocs(collection(db, 'users', userId, 'recurringBills')),
      getDocs(collection(db, 'users', userId, 'habits')),
      getDocs(collection(db, 'users', userId, 'savingsGoals')),
      getDocs(collection(db, 'users', userId, 'debts')),
      getDocs(collection(db, 'users', userId, 'focusSessions')),
    ]);

    const readCollection = <T extends Record<string, unknown>>(
      snap: Awaited<ReturnType<typeof getDocs>>
    ): T[] => {
      const list: T[] = [];
      snap.forEach((d) => {
        list.push(stripServerMeta(d.data() as T));
      });
      return list;
    };

    let settings: WorkspaceSettingsPayload | undefined;
    if (settingsSnap.exists()) {
      const data = settingsSnap.data();
      settings = {
        primaryIncome: data.primaryIncome as PrimaryIncomeConfig,
        focusGoal: (data.focusGoal as FocusGoal | null) ?? null,
        notificationSettings: normalizeNotificationSettings(
          data.notificationSettings as Partial<NotificationSettings>
        ),
        isDark: Boolean(data.isDark),
        customCategories: Array.isArray(data.customCategories)
          ? (data.customCategories as CustomCategory[])
          : [],
      };
    }

    const budgetsRaw = readCollection<BudgetLimit & Record<string, unknown>>(budgetsSnap);

    return {
      transactions: readCollection<Transaction & Record<string, unknown>>(txSnap).sort(
        (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')
      ),
      cards: readCollection<BankCard & Record<string, unknown>>(cardsSnap),
      tasks: readCollection<Task & Record<string, unknown>>(tasksSnap),
      notes: readCollection<Note & Record<string, unknown>>(notesSnap),
      budgets: budgetsRaw.map(({ category, limit }) => ({ category, limit })),
      recurringBills: readCollection<RecurringBill & Record<string, unknown>>(billsSnap),
      habits: readCollection<Habit & Record<string, unknown>>(habitsSnap),
      savingsGoals: readCollection<SavingsGoal & Record<string, unknown>>(goalsSnap),
      debts: readCollection<DebtItem & Record<string, unknown>>(debtsSnap),
      focusSessions: readCollection<FocusSession & Record<string, unknown>>(focusSnap),
      settings,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${userId}`);
    return null;
  }
}

export async function uploadFullWorkspaceToCloud(
  userId: string,
  snapshot: FullWorkspaceSnapshot,
  existingCloud?: FullWorkspaceSnapshot
): Promise<void> {
  const ops: Array<{
    kind: 'set' | 'update';
    ref: ReturnType<typeof doc>;
    data: Record<string, unknown>;
  }> = [];

  if (snapshot.settings) {
    const settingsAlreadyExists = Boolean(existingCloud?.settings);
    ops.push({
      kind: settingsAlreadyExists ? 'update' : 'set',
      ref: doc(db, 'users', userId, 'settings', 'workspace'),
      data: buildSettingsDoc(snapshot.settings, userId, !settingsAlreadyExists),
    });
  }

  const pushCollectionOps = <T>(
    collectionName: string,
    items: T[],
    existingItems: T[] | undefined,
    getDocId: (item: T) => string,
    buildDoc: (item: T, uid: string, includeCreated: boolean) => Record<string, unknown>,
    serialize: (item: T) => string = canonicalSerialize
  ) => {
    const existingMap = new Map<string, string>();
    for (const ex of existingItems ?? []) {
      existingMap.set(getDocId(ex), serialize(ex));
    }
    for (const item of items) {
      const docId = getDocId(item);
      const prevSerialized = existingMap.get(docId);
      if (prevSerialized === undefined) {
        ops.push({
          kind: 'set',
          ref: doc(db, 'users', userId, collectionName, docId),
          data: buildDoc(item, userId, true),
        });
      } else if (prevSerialized !== serialize(item)) {
        ops.push({
          kind: 'update',
          ref: doc(db, 'users', userId, collectionName, docId),
          data: buildDoc(item, userId, false),
        });
      }
    }
  };

  pushCollectionOps(
    'transactions',
    snapshot.transactions,
    existingCloud?.transactions,
    (tx) => sanitizeSafeId(tx.id, 'tx'),
    buildTransactionDoc
  );
  pushCollectionOps(
    'cards',
    snapshot.cards ?? [],
    existingCloud?.cards,
    (card) => sanitizeSafeId(card.id, 'card'),
    buildBankCardDoc
  );
  pushCollectionOps(
    'tasks',
    snapshot.tasks,
    existingCloud?.tasks,
    (task) => sanitizeSafeId(task.id, 'task'),
    buildTaskDoc
  );
  pushCollectionOps(
    'notes',
    snapshot.notes,
    existingCloud?.notes,
    (note) => sanitizeSafeId(note.id, 'note'),
    buildNoteDoc
  );
  pushCollectionOps(
    'budgets',
    snapshot.budgets,
    existingCloud?.budgets,
    (budget) => getBudgetDocId(budget.category),
    buildBudgetDoc,
    (b) => canonicalSerialize({ category: b.category, limit: b.limit })
  );
  pushCollectionOps(
    'recurringBills',
    snapshot.recurringBills,
    existingCloud?.recurringBills,
    (bill) => sanitizeSafeId(bill.id, 'bill'),
    buildBillDoc
  );
  pushCollectionOps(
    'habits',
    snapshot.habits,
    existingCloud?.habits,
    (habit) => sanitizeSafeId(habit.id, 'habit'),
    buildHabitDoc
  );
  pushCollectionOps(
    'savingsGoals',
    snapshot.savingsGoals,
    existingCloud?.savingsGoals,
    (goal) => sanitizeSafeId(goal.id, 'goal'),
    buildSavingsGoalDoc
  );
  pushCollectionOps(
    'debts',
    snapshot.debts,
    existingCloud?.debts,
    (debt) => sanitizeSafeId(debt.id, 'debt'),
    buildDebtDoc
  );
  pushCollectionOps(
    'focusSessions',
    snapshot.focusSessions,
    existingCloud?.focusSessions,
    (session) => sanitizeSafeId(session.id, 'focus'),
    buildFocusSessionDoc
  );

  for (let i = 0; i < ops.length; i += 400) {
    const chunk = ops.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.kind === 'update') {
        batch.update(op.ref, op.data);
      } else {
        batch.set(op.ref, op.data);
      }
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
    | 'cards'
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
  const batchOps: Array<
    | { kind: 'set'; id: string; data: Record<string, unknown>; serialized: string }
    | { kind: 'update'; id: string; data: Record<string, unknown>; serialized: string }
    | { kind: 'delete'; id: string }
  > = [];

  for (const item of items) {
    const id = getId(item);
    currentIds.add(id);
    const serialized = serializeForDiff(item);
    const prevSerialized = knownSerializedMap.get(id);
    if (prevSerialized === undefined) {
      batchOps.push({
        kind: 'set',
        id,
        data: buildDoc(item, userId, true),
        serialized,
      });
    } else if (prevSerialized !== serialized) {
      batchOps.push({
        kind: 'update',
        id,
        data: buildDoc(item, userId, false),
        serialized,
      });
    }
  }

  for (const existingId of knownSerializedMap.keys()) {
    if (!currentIds.has(existingId)) {
      batchOps.push({ kind: 'delete', id: existingId });
    }
  }

  if (batchOps.length === 0) return;

  for (let i = 0; i < batchOps.length; i += 400) {
    const chunk = batchOps.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const op of chunk) {
      const ref = doc(db, 'users', userId, collectionName, op.id);
      if (op.kind === 'set') {
        batch.set(ref, op.data);
      } else if (op.kind === 'update') {
        batch.update(ref, op.data);
      } else {
        batch.delete(ref);
      }
    }
    try {
      await batch.commit();
      for (const op of chunk) {
        if (op.kind === 'delete') {
          knownSerializedMap.delete(op.id);
        } else {
          knownSerializedMap.set(op.id, op.serialized);
        }
      }
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `users/${userId}/${collectionName}`
      );
    }
  }
}

export const collectionBuilders = {
  transactions: buildTransactionDoc,
  cards: buildBankCardDoc,
  tasks: buildTaskDoc,
  notes: buildNoteDoc,
  budgets: buildBudgetDoc,
  recurringBills: buildBillDoc,
  habits: buildHabitDoc,
  savingsGoals: buildSavingsGoalDoc,
  debts: buildDebtDoc,
  focusSessions: buildFocusSessionDoc,
};

export function subscribeUserWorkspace(params: {
  userId: string;
  onTransactions: (items: Transaction[], known: Map<string, string>) => void;
  onCards: (items: BankCard[], known: Map<string, string>) => void;
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
  attachCollection<BankCard & Record<string, unknown>>(
    'cards',
    (item) => sanitizeSafeId(item.id, 'card'),
    (items, known) => {
      items.sort((a, b) => {
        if (Boolean(a.isDefault) !== Boolean(b.isDefault)) {
          return a.isDefault ? -1 : 1;
        }
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });
      params.onCards(items, known);
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
          notificationSettings: normalizeNotificationSettings(
            data.notificationSettings as Partial<NotificationSettings>
          ),
          isDark: Boolean(data.isDark),
          customCategories: Array.isArray(data.customCategories)
            ? (data.customCategories as CustomCategory[])
            : [],
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
