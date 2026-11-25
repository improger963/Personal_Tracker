export type TransactionType = 'income' | 'expense';

export type IncomeKind = 'monthly' | 'extra' | 'one_time';

export type Currency = 'AMD';

export type NavSection = 'overview' | 'finance' | 'planner' | 'notes';

export type TaskPriority = 'low' | 'medium' | 'high';

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
  date: string; // YYYY-MM-DD
  createdAt: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
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

export interface NotificationSettings {
  soundEnabled: boolean;
  browserNotifications: boolean;
}

export type AppNotificationKind =
  | 'daily_expense'
  | 'planned_expense'
  | 'monthly_bill'
  | 'budget_alert'
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
