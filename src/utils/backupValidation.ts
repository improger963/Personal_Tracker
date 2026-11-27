import {
  BankCard,
  BudgetLimit,
  CardColor,
  CardType,
  CustomCategory,
  DebtItem,
  FocusGoal,
  FocusSession,
  Habit,
  Note,
  NoteChecklistItem,
  PrimaryIncomeConfig,
  RecurringBill,
  SavingsGoal,
  Task,
  TaskPriority,
  TaskRepeatInterval,
  TaskScheduleType,
  Transaction,
} from '../types';
import { getTodayISO, normalizeNotificationSettings } from '../data/defaults';
import { clampPayday } from './financialCycle';
import { normalizeCardCurrency } from './cardBalances';
import { normalizeTags } from './customCategories';

export interface SanitizedBackupData {
  cards?: BankCard[];
  transactions?: Transaction[];
  tasks?: Task[];
  notes?: Note[];
  budgets?: BudgetLimit[];
  recurringBills?: RecurringBill[];
  habits?: Habit[];
  savingsGoals?: SavingsGoal[];
  debts?: DebtItem[];
  focusSessions?: FocusSession[];
  customCategories?: CustomCategory[];
  primaryIncome?: PrimaryIncomeConfig;
  focusGoal?: FocusGoal | null;
  notificationSettings?: ReturnType<typeof normalizeNotificationSettings>;
  importedRecordCount: number;
}

const VALID_CARD_TYPES = new Set<CardType>(['arca', 'visa', 'mastercard', 'other', 'cash']);
const VALID_CARD_COLORS = new Set<CardColor>(['blue', 'purple', 'emerald', 'amber', 'rose', 'slate']);
const VALID_TASK_PRIORITIES = new Set<TaskPriority>(['low', 'medium', 'high']);
const VALID_TASK_SCHEDULES = new Set<TaskScheduleType>(['one_time', 'daily', 'recurring', 'weekdays']);
const VALID_TASK_REPEATS = new Set<TaskRepeatInterval>(['weekly', 'biweekly', 'monthly', 'every_n_days']);

function isObj(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asStr(value: unknown, maxLen = 400): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function asIsoDate(value: unknown, fallback: string): string {
  const s = asStr(value, 16);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
}

function asTimeHHMM(value: unknown): string | undefined {
  const s = asStr(value, 8);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : undefined;
}

function asPosNum(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

function asNonNegNum(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback;
  return Math.round(value);
}

function asFiniteDecimal(value: unknown, fallback = 0, decimals = 2): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function asStrArray(value: unknown, maxItems = 500): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim())
    .slice(0, maxItems);
}

function fallbackId(prefix: string, idx: number): string {
  return `${prefix}-imp-${Date.now()}-${idx}`;
}

export function sanitizeBackupPayload(raw: unknown): SanitizedBackupData | null {
  if (!isObj(raw)) return null;

  const today = getTodayISO();
  const nowIso = new Date().toISOString();
  const out: SanitizedBackupData = { importedRecordCount: 0 };
  let hasAnyRecognizedSection = false;

  if (Array.isArray(raw.cards)) {
    hasAnyRecognizedSection = true;
    const seen = new Set<string>();
    const cards: BankCard[] = [];
    raw.cards.forEach((item, idx) => {
      if (!isObj(item)) return;
      const name = asStr(item.name, 120);
      const id = asStr(item.id, 120) || fallbackId('card', idx);
      if (!name || seen.has(id)) return;
      seen.add(id);
      const currency = normalizeCardCurrency(item.currency);
      const initialBalance =
        currency === 'AMD'
          ? Math.round(asFiniteDecimal(item.initialBalance, 0, 0))
          : asFiniteDecimal(item.initialBalance, 0, 2);
      cards.push({
        id,
        name,
        last4: asStr(item.last4, 4).replace(/\D/g, ''),
        cardType: VALID_CARD_TYPES.has(item.cardType as CardType) ? (item.cardType as CardType) : 'other',
        color: VALID_CARD_COLORS.has(item.color as CardColor) ? (item.color as CardColor) : 'blue',
        initialBalance,
        currency,
        isDefault: Boolean(item.isDefault),
        createdAt: asStr(item.createdAt, 40) || nowIso,
      });
    });
    out.cards = cards;
    out.importedRecordCount += cards.length;
  }

  if (Array.isArray(raw.transactions)) {
    hasAnyRecognizedSection = true;
    const seen = new Set<string>();
    const txs: Transaction[] = [];
    raw.transactions.forEach((item, idx) => {
      if (!isObj(item)) return;
      const type = item.type === 'income' ? 'income' : item.type === 'expense' ? 'expense' : null;
      const amount = asPosNum(item.amount);
      const title = asStr(item.title, 180);
      const id = asStr(item.id, 120) || fallbackId('tx', idx);
      if (!type || !amount || !title || seen.has(id)) return;
      seen.add(id);
      const tx: Transaction = {
        id,
        type,
        amount,
        title,
        category: asStr(item.category, 80) || 'Այլ',
        date: asIsoDate(item.date, today),
        createdAt: asStr(item.createdAt, 40) || nowIso,
      };
      if (
        type === 'income' &&
        (item.incomeKind === 'monthly' || item.incomeKind === 'extra' || item.incomeKind === 'one_time')
      ) {
        tx.incomeKind = item.incomeKind;
      }
      if (typeof item.cardAmount === 'number' && Number.isFinite(item.cardAmount) && item.cardAmount > 0) {
        tx.cardAmount = asFiniteDecimal(item.cardAmount, 0, 2);
      }
      if (typeof item.cardCurrency === 'string') {
        tx.cardCurrency = normalizeCardCurrency(item.cardCurrency);
      }
      if (Array.isArray(item.tags)) {
        const cleanTags = normalizeTags(asStrArray(item.tags, 8));
        if (cleanTags.length > 0) tx.tags = cleanTags;
      }
      if (typeof item.primaryCycleKey === 'string' && /^\d{4}-\d{2}$/.test(item.primaryCycleKey)) {
        tx.primaryCycleKey = item.primaryCycleKey;
      }
      if (typeof item.isPending === 'boolean') tx.isPending = item.isPending;
      if (typeof item.cardId === 'string' && item.cardId.trim()) tx.cardId = item.cardId.trim();
      txs.push(tx);
    });
    out.transactions = txs;
    out.importedRecordCount += txs.length;
  }

  if (Array.isArray(raw.tasks)) {
    hasAnyRecognizedSection = true;
    const seen = new Set<string>();
    const tasks: Task[] = [];
    raw.tasks.forEach((item, idx) => {
      if (!isObj(item)) return;
      const title = asStr(item.title, 200);
      const id = asStr(item.id, 120) || fallbackId('task', idx);
      if (!title || seen.has(id)) return;
      seen.add(id);
      const task: Task = {
        id,
        title,
        completed: Boolean(item.completed),
        priority: VALID_TASK_PRIORITIES.has(item.priority as TaskPriority)
          ? (item.priority as TaskPriority)
          : 'medium',
        date: asIsoDate(item.date, today),
        createdAt: asStr(item.createdAt, 40) || nowIso,
      };
      const dueTime = asTimeHHMM(item.dueTime);
      if (dueTime) task.dueTime = dueTime;
      if (VALID_TASK_SCHEDULES.has(item.scheduleType as TaskScheduleType)) {
        task.scheduleType = item.scheduleType as TaskScheduleType;
      }
      if (VALID_TASK_REPEATS.has(item.repeatInterval as TaskRepeatInterval)) {
        task.repeatInterval = item.repeatInterval as TaskRepeatInterval;
      }
      if (typeof item.repeatEveryDays === 'number' && Number.isFinite(item.repeatEveryDays)) {
        task.repeatEveryDays = Math.min(365, Math.max(1, Math.round(item.repeatEveryDays)));
      }
      if (Array.isArray(item.selectedWeekdays)) {
        task.selectedWeekdays = item.selectedWeekdays.filter(
          (d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6
        );
      }
      if (Array.isArray(item.completedDates)) {
        task.completedDates = asStrArray(item.completedDates).filter((d) =>
          /^\d{4}-\d{2}-\d{2}$/.test(d)
        );
      }
      const expectedAmount = asPosNum(item.expectedAmount);
      if (expectedAmount) task.expectedAmount = expectedAmount;
      const expectedCategory = asStr(item.expectedCategory, 80);
      if (expectedCategory) task.expectedCategory = expectedCategory;
      const linkedTxId = asStr(item.linkedTxId, 120);
      if (linkedTxId) task.linkedTxId = linkedTxId;
      tasks.push(task);
    });
    out.tasks = tasks;
    out.importedRecordCount += tasks.length;
  }

  if (Array.isArray(raw.notes)) {
    hasAnyRecognizedSection = true;
    const seen = new Set<string>();
    const notes: Note[] = [];
    raw.notes.forEach((item, idx) => {
      if (!isObj(item)) return;
      const title = asStr(item.title, 200);
      const content = typeof item.content === 'string' ? item.content.slice(0, 6000) : '';
      const id = asStr(item.id, 120) || fallbackId('note', idx);
      if ((!title && !content && !Array.isArray(item.checklist)) || seen.has(id)) return;
      seen.add(id);
      const note: Note = {
        id,
        title: title || 'Նշում',
        content,
        pinned: Boolean(item.pinned),
        updatedAt: asStr(item.updatedAt, 40) || nowIso,
      };
      if (Array.isArray(item.checklist)) {
        const checklist: NoteChecklistItem[] = [];
        item.checklist.forEach((cl, cIdx) => {
          if (!isObj(cl)) return;
          const text = asStr(cl.text, 240);
          if (!text) return;
          checklist.push({
            id: asStr(cl.id, 80) || `${id}-c-${cIdx}`,
            text,
            done: Boolean(cl.done),
          });
        });
        if (checklist.length > 0) note.checklist = checklist;
      }
      const reminder = asStr(item.reminderDate, 20);
      if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(reminder)) {
        note.reminderDate = reminder;
      }
      notes.push(note);
    });
    out.notes = notes;
    out.importedRecordCount += notes.length;
  }

  if (Array.isArray(raw.budgets)) {
    hasAnyRecognizedSection = true;
    const byCategory = new Map<string, BudgetLimit>();
    raw.budgets.forEach((item) => {
      if (!isObj(item)) return;
      const category = asStr(item.category, 80);
      const limit = asPosNum(item.limit);
      if (!category || !limit) return;
      byCategory.set(category, { category, limit });
    });
    out.budgets = Array.from(byCategory.values());
    out.importedRecordCount += out.budgets.length;
  }

  if (Array.isArray(raw.recurringBills)) {
    hasAnyRecognizedSection = true;
    const seen = new Set<string>();
    const bills: RecurringBill[] = [];
    raw.recurringBills.forEach((item, idx) => {
      if (!isObj(item)) return;
      const title = asStr(item.title, 180);
      const amount = asNonNegNum(item.amount, 0);
      const id = asStr(item.id, 120) || fallbackId('bill', idx);
      if (!title || seen.has(id)) return;
      seen.add(id);
      const freq =
        item.frequency === 'daily' || item.frequency === 'planned' || item.frequency === 'monthly'
          ? item.frequency
          : 'monthly';
      const bill: RecurringBill = {
        id,
        title,
        amount,
        category: asStr(item.category, 80) || 'Այլ',
        frequency: freq,
        dayOfMonth: clampPayday(typeof item.dayOfMonth === 'number' ? item.dayOfMonth : 1),
        active: item.active !== false,
      };
      const reminderTime = asTimeHHMM(item.reminderTime);
      if (reminderTime) bill.reminderTime = reminderTime;
      if (Array.isArray(item.dailyTimes)) {
        const times = item.dailyTimes.map(asTimeHHMM).filter((t): t is string => Boolean(t));
        if (times.length > 0) bill.dailyTimes = times.slice(0, 8);
      }
      if (typeof item.scheduledDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.scheduledDate)) {
        bill.scheduledDate = item.scheduledDate;
      }
      const scheduledTime = asTimeHHMM(item.scheduledTime);
      if (scheduledTime) bill.scheduledTime = scheduledTime;
      if (typeof item.isVariableAmount === 'boolean') bill.isVariableAmount = item.isVariableAmount;
      if (Array.isArray(item.confirmedSlots)) bill.confirmedSlots = asStrArray(item.confirmedSlots, 300);
      if (Array.isArray(item.skippedSlots)) bill.skippedSlots = asStrArray(item.skippedSlots, 300);
      bills.push(bill);
    });
    out.recurringBills = bills;
    out.importedRecordCount += bills.length;
  }

  if (Array.isArray(raw.habits)) {
    hasAnyRecognizedSection = true;
    const seen = new Set<string>();
    const habits: Habit[] = [];
    raw.habits.forEach((item, idx) => {
      if (!isObj(item)) return;
      const title = asStr(item.title, 160);
      const id = asStr(item.id, 120) || fallbackId('habit', idx);
      if (!title || seen.has(id)) return;
      seen.add(id);
      habits.push({
        id,
        title,
        completedDates: asStrArray(item.completedDates, 1000).filter((d) =>
          /^\d{4}-\d{2}-\d{2}$/.test(d)
        ),
        createdAt: asStr(item.createdAt, 40) || nowIso,
      });
    });
    out.habits = habits;
    out.importedRecordCount += habits.length;
  }

  if (Array.isArray(raw.savingsGoals)) {
    hasAnyRecognizedSection = true;
    const seen = new Set<string>();
    const goals: SavingsGoal[] = [];
    raw.savingsGoals.forEach((item, idx) => {
      if (!isObj(item)) return;
      const title = asStr(item.title, 160);
      const targetAmount = asPosNum(item.targetAmount);
      const id = asStr(item.id, 120) || fallbackId('goal', idx);
      if (!title || !targetAmount || seen.has(id)) return;
      seen.add(id);
      const currentAmount = asNonNegNum(item.currentAmount, 0);
      const goal: SavingsGoal = {
        id,
        title,
        targetAmount,
        currentAmount,
        completed: typeof item.completed === 'boolean' ? item.completed : currentAmount >= targetAmount,
        createdAt: asStr(item.createdAt, 40) || nowIso,
      };
      if (typeof item.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.deadline)) {
        goal.deadline = item.deadline;
      }
      const cat = asStr(item.category, 80);
      if (cat) goal.category = cat;
      goals.push(goal);
    });
    out.savingsGoals = goals;
    out.importedRecordCount += goals.length;
  }

  if (Array.isArray(raw.debts)) {
    hasAnyRecognizedSection = true;
    const seen = new Set<string>();
    const debts: DebtItem[] = [];
    raw.debts.forEach((item, idx) => {
      if (!isObj(item)) return;
      const person = asStr(item.person, 160);
      const direction =
        item.direction === 'lent' || item.direction === 'borrowed' ? item.direction : null;
      const totalAmount = asPosNum(item.totalAmount);
      const id = asStr(item.id, 120) || fallbackId('debt', idx);
      if (!person || !direction || !totalAmount || seen.has(id)) return;
      seen.add(id);
      const paidAmount = Math.min(totalAmount, asNonNegNum(item.paidAmount, 0));
      const debt: DebtItem = {
        id,
        person,
        direction,
        totalAmount,
        paidAmount,
        settled: typeof item.settled === 'boolean' ? item.settled : paidAmount >= totalAmount,
        createdAt: asStr(item.createdAt, 40) || nowIso,
      };
      if (typeof item.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate)) {
        debt.dueDate = item.dueDate;
      }
      const note = asStr(item.note, 300);
      if (note) debt.note = note;
      debts.push(debt);
    });
    out.debts = debts;
    out.importedRecordCount += debts.length;
  }

  if (Array.isArray(raw.focusSessions)) {
    hasAnyRecognizedSection = true;
    const seen = new Set<string>();
    const sessions: FocusSession[] = [];
    raw.focusSessions.forEach((item, idx) => {
      if (!isObj(item)) return;
      const minutes = asPosNum(item.minutes);
      const label = asStr(item.label, 160);
      const id = asStr(item.id, 120) || fallbackId('focus', idx);
      if (!minutes || !label || seen.has(id)) return;
      seen.add(id);
      const session: FocusSession = {
        id,
        date: asIsoDate(item.date, today),
        minutes: Math.min(240, minutes),
        mode: item.mode === 'break' ? 'break' : 'focus',
        label,
        completedAt: asStr(item.completedAt, 40) || nowIso,
      };
      if (typeof item.taskId === 'string' && item.taskId.trim()) {
        session.taskId = item.taskId.trim();
      }
      sessions.push(session);
    });
    out.focusSessions = sessions;
    out.importedRecordCount += sessions.length;
  }

  if (Array.isArray(raw.customCategories)) {
    hasAnyRecognizedSection = true;
    const seen = new Set<string>();
    const cats: CustomCategory[] = [];
    raw.customCategories.forEach((item, idx) => {
      if (!isObj(item)) return;
      const name = asStr(item.name, 80);
      if (!name) return;
      const type = item.type === 'income' ? 'income' : 'expense';
      const dedupeKey = `${type}:${name.toLowerCase()}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      cats.push({
        id: asStr(item.id, 120) || fallbackId('cat', idx),
        name,
        type,
        color: asStr(item.color, 24) || '#2563EB',
      });
    });
    out.customCategories = cats.slice(0, 40);
  }

  if (isObj(raw.primaryIncome) && typeof raw.primaryIncome.payday === 'number') {
    hasAnyRecognizedSection = true;
    out.primaryIncome = {
      enabled: Boolean(raw.primaryIncome.enabled),
      title: asStr(raw.primaryIncome.title, 120) || 'Հիմնական աշխատավարձ',
      amount: asNonNegNum(raw.primaryIncome.amount, 0),
      payday: clampPayday(raw.primaryIncome.payday),
      autoCredit: raw.primaryIncome.autoCredit !== false,
      creditedCycles: asStrArray(raw.primaryIncome.creditedCycles, 120).filter((k) =>
        /^\d{4}-\d{2}$/.test(k)
      ),
    };
  }

  if (isObj(raw.focusGoal) && typeof raw.focusGoal.title === 'string') {
    hasAnyRecognizedSection = true;
    const title = asStr(raw.focusGoal.title, 160);
    if (title) {
      out.focusGoal = {
        title,
        completed: Boolean(raw.focusGoal.completed),
        date: asIsoDate(raw.focusGoal.date, today),
      };
    }
  }

  if (
    isObj(raw.notificationSettings) &&
    typeof raw.notificationSettings.soundEnabled === 'boolean'
  ) {
    hasAnyRecognizedSection = true;
    out.notificationSettings = normalizeNotificationSettings(
      raw.notificationSettings as Parameters<typeof normalizeNotificationSettings>[0]
    );
  }

  return hasAnyRecognizedSection ? out : null;
}
