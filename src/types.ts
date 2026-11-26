export type TransactionType = 'income' | 'expense';

export type IncomeKind = 'monthly' | 'extra' | 'one_time';

export type Currency = 'AMD';

export type NavSection = 'overview' | 'finance' | 'planner' | 'notes';

export type TaskPriority = 'low' | 'medium' | 'high';

export type TaskScheduleType = 'one_time' | 'daily' | 'recurring' | 'weekdays';

export type TaskRepeatInterval = 'weekly' | 'biweekly' | 'monthly' | 'every_n_days';

export interface Transaction {
  id: string;
  type: TransactionType;
  incomeKind?: IncomeKind;
  amount: number;
  title: string; // Source for income, purpose for expense
  category: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  primaryCycleKey?: string;
  isPending?: boolean; // When true, marked as pre-expense (նախածախս) and not deducted from balance until confirmed
  cardId?: string; // Optional card link (e.g. card-1)
}

export interface PrimaryIncomeConfig {
  enabled: boolean;
  title: string;
  amount: number;
  payday: number; // 1..31
  autoCredit: boolean;
  creditedCycles: string[];
}

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: TaskPriority;
  dueTime?: string;
  date: string; // YYYY-MM-DD (target date for one_time, start date for repeating)
  createdAt: string;
  scheduleType?: TaskScheduleType; // defaults to 'one_time'
  repeatInterval?: TaskRepeatInterval; // used when scheduleType === 'recurring'
  repeatEveryDays?: number; // used when repeatInterval === 'every_n_days'
  selectedWeekdays?: number[]; // 0..6 (Sun..Sat), used when scheduleType === 'weekdays'
  completedDates?: string[]; // YYYY-MM-DD[] for daily, recurring, and weekdays tasks
}

export interface NoteChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  checklist?: NoteChecklistItem[];
  reminderDate?: string; // YYYY-MM-DDTHH:mm or YYYY-MM-DD
  pinned: boolean;
  updatedAt: string;
}

export interface BudgetLimit {
  category: string;
  limit: number;
}

export type BillFrequency = 'monthly' | 'daily' | 'planned';

export interface RecurringBill {
  id: string;
  title: string;
  amount: number;
  category: string;
  frequency?: BillFrequency; // defaults to 'monthly'
  dayOfMonth: number; // 1..31 (for 'monthly')
  reminderTime?: string; // HH:mm (for 'monthly')
  dailyTimes?: string[]; // HH:mm[] (for 'daily', 1..8 reminders/day)
  scheduledDate?: string; // YYYY-MM-DD (for 'planned')
  scheduledTime?: string; // HH:mm (for 'planned')
  isVariableAmount?: boolean; // if true, amount is entered/confirmed upon confirmation
  confirmedSlots?: string[]; // e.g. 'YYYY-MM-DD@HH:mm' or 'planned'
  skippedSlots?: string[];
  active?: boolean; // defaults to true
}

export interface SavingsGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string; // YYYY-MM-DD
  category?: string;
  completed?: boolean;
  createdAt: string;
}

export type DebtDirection = 'lent' | 'borrowed';

export interface DebtItem {
  id: string;
  person: string;
  direction: DebtDirection; // 'lent' = Ինձ են պարտք, 'borrowed' = Պարտք եմ
  totalAmount: number;
  paidAmount: number;
  dueDate?: string; // YYYY-MM-DD
  note?: string;
  settled: boolean;
  createdAt: string;
}

export interface FocusSession {
  id: string;
  date: string; // YYYY-MM-DD
  minutes: number;
  mode: 'focus' | 'break';
  label: string;
  taskId?: string;
  completedAt: string;
}

export type NotificationSoundPreset =
  | 'chime'
  | 'bell'
  | 'marimba'
  | 'pulse'
  | 'zen';

export type NotificationVoiceMode = 'auto' | 'gemini' | 'browser';

export type GeminiVoicePreset = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';

export interface NotificationSettings {
  soundEnabled: boolean;
  browserNotifications: boolean;
  soundPreset?: NotificationSoundPreset;
  urgentSoundEnabled?: boolean;
  soundVolume?: number; // 0.1..1
  voiceEnabled?: boolean;
  voiceMode?: NotificationVoiceMode;
  voicePreset?: GeminiVoicePreset;
  browserVoiceURI?: string;
  voiceRate?: number; // 0.75..1.4
  quietHoursEnabled?: boolean;
  quietHoursStart?: string; // HH:mm
  quietHoursEnd?: string; // HH:mm
}

export type AppNotificationKind =
  | 'daily_expense'
  | 'planned_expense'
  | 'monthly_bill'
  | 'budget_alert'
  | 'debt'
  | 'task'
  | 'note';

export type AppNotificationStatus = 'overdue' | 'due_now' | 'upcoming';

export interface AppNotificationItem {
  id: string;
  kind: AppNotificationKind;
  title: string;
  subtitle: string;
  amount?: number;
  category?: string;
  budgetLimit?: number;
  ratio?: number;
  dueDate: string; // YYYY-MM-DD
  dueTime?: string; // HH:mm
  status: AppNotificationStatus;
  billId?: string;
  slotKey?: string;
  taskId?: string;
  noteId?: string;
  txId?: string;
  debtId?: string;
}

export interface Habit {
  id: string;
  title: string;
  completedDates: string[]; // YYYY-MM-DD[]
  createdAt: string;
}

export interface FocusGoal {
  title: string;
  completed: boolean;
  date: string; // YYYY-MM-DD
}

export type CardType = 'arca' | 'visa' | 'mastercard' | 'other' | 'cash';
export type CardColor = 'blue' | 'purple' | 'emerald' | 'amber' | 'rose' | 'slate';

export interface BankCard {
  id: string;
  name: string; // e.g. "Ameriabank Visa", "Idram Card", "Կանխիկ դրամապանակ"
  last4: string; // e.g. "4589" or empty
  cardType: CardType;
  color: CardColor;
  initialBalance: number;
  currency: 'AMD';
  isDefault?: boolean;
  createdAt: string;
}



