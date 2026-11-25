import {
  Currency,
  IncomeKind,
  Note,
  NotificationSettings,
  PrimaryIncomeConfig,
  RecurringBill,
  Task,
  Transaction,
} from '../types';

export function getInitialNotificationSettings(): NotificationSettings {
  return {
    soundEnabled: true,
    browserNotifications: false,
  };
}

export function getInitialPrimaryIncome(): PrimaryIncomeConfig {
  return {
    enabled: false,
    title: 'Հիմնական աշխատավարձ',
    amount: 0,
    payday: 1,
    autoCredit: true,
    creditedCycles: [],
  };
}

export const INCOME_KINDS: { id: IncomeKind; label: string }[] = [
  { id: 'monthly', label: 'Ամսական' },
  { id: 'extra', label: 'Հավելյալ' },
  { id: 'one_time', label: 'Միանգամյա' },
];

export const INCOME_KIND_LABELS: Record<IncomeKind, string> = {
  monthly: 'Ամսական',
  extra: 'Հավելյալ',
  one_time: 'Միանգամյա',
};

export function getTransactionIncomeKind(tx: Transaction): IncomeKind {
  if (tx.incomeKind) return tx.incomeKind;
  if (tx.category === 'Աշխատավարձ') return 'monthly';
  if (tx.category === 'Նվեր' || tx.category === 'Այլ') return 'one_time';
  return 'extra';
}

export const INCOME_CATEGORIES = [
  'Աշխատավարձ',
  'Ֆրիլանս',
  'Բոնուս',
  'Ներդրումներ',
  'Նվեր',
  'Այլ',
] as const;

export const EXPENSE_CATEGORIES = [
  'Սնունդ',
  'Տրանսպորտ',
  'Կոմունալ',
  'Բնակարան',
  'Առողջություն',
  'Գնումներ',
  'Ժամանց',
  'Կրթություն',
  'Այլ',
] as const;

export const ARMENIAN_MONTHS = [
  'Հունվար',
  'Փետրվար',
  'Մարտ',
  'Ապրիլ',
  'Մայիս',
  'Հունիս',
  'Հուլիս',
  'Օգոստոս',
  'Սեպտեմբեր',
  'Հոկտեմբեր',
  'Նոյեմբեր',
  'Դեկտեմբեր',
] as const;

export const CURRENCY_CONFIG: Record<Currency, { symbol: string; label: string }> = {
  AMD: { symbol: '֏', label: 'ՀՀ դրամ (֏)' },
};

export function formatMoney(amount: number, _currency: Currency = 'AMD'): string {
  const formatted = new Intl.NumberFormat('hy-AM', {
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));

  return `${amount < 0 ? '-' : ''}${formatted} ֏`;
}

export function formatMonthLabel(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const monthName = ARMENIAN_MONTHS[monthIndex] ?? monthStr;
  return `${monthName} ${year}`;
}

export function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const monthIndex = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const monthName = ARMENIAN_MONTHS[monthIndex]?.slice(0, 3) ?? parts[1];
  return `${day} ${monthName}`;
}

export function formatReminderLabel(reminderStr?: string): string {
  if (!reminderStr) return '';
  const [datePart, timePart] = reminderStr.split('T');
  const dateLabel = formatShortDate(datePart);
  return timePart ? `${dateLabel}, ${timePart}` : dateLabel;
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentMonthKey(): string {
  return getTodayISO().slice(0, 7);
}

export function getInitialTransactions(): Transaction[] {
  const month = getCurrentMonthKey();
  const today = getTodayISO();
  return [
    {
      id: 'tx-1',
      type: 'income',
      incomeKind: 'monthly',
      amount: 420000,
      title: 'Հիմնական աշխատավարձ',
      category: 'Աշխատավարձ',
      date: `${month}-05`,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'tx-2',
      type: 'income',
      incomeKind: 'extra',
      amount: 85000,
      title: 'Վեբ դիզայնի պատվեր',
      category: 'Ֆրիլանս',
      date: `${month}-14`,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'tx-3',
      type: 'expense',
      amount: 24500,
      title: 'Մթերային գնումներ շաբաթվա համար',
      category: 'Սնունդ',
      date: today,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'tx-4',
      type: 'expense',
      amount: 18200,
      title: 'Էլեկտրաէներգիա և գազ',
      category: 'Կոմունալ',
      date: `${month}-12`,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'tx-5',
      type: 'expense',
      amount: 6500,
      title: 'Տաքսի և երթևեկություն',
      category: 'Տրանսպորտ',
      date: `${month}-19`,
      createdAt: new Date().toISOString(),
    },
  ];
}

export function getInitialTasks(): Task[] {
  const today = getTodayISO();
  return [
    {
      id: 'task-1',
      title: 'Ամփոփել ամսական կոմունալ վճարումները',
      completed: true,
      priority: 'high',
      dueTime: '10:30',
      date: today,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'task-2',
      title: 'Ուղարկել նախագծի հաշվետվությունը',
      completed: false,
      priority: 'high',
      dueTime: '15:00',
      date: today,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'task-3',
      title: 'Գնել թարմ մրգեր և սուրճ տան համար',
      completed: false,
      priority: 'medium',
      dueTime: '18:30',
      date: today,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'task-4',
      title: 'Երեկոյան 30 րոպե զբոսանք',
      completed: false,
      priority: 'low',
      dueTime: '20:00',
      date: today,
      createdAt: new Date().toISOString(),
    },
  ];
}

export function getInitialNotes(): Note[] {
  const today = getTodayISO();
  return [
    {
      id: 'note-1',
      title: 'Ամսական խնայողության նպատակ',
      content: 'Ամեն ամսվա եկամտի առնվազն 20%-ը տեղափոխել խնայողական հաշվին՝ մինչև մյուս ծախսերը պլանավորելը։',
      pinned: true,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'note-2',
      title: 'Հիշեցում․ Ատամնաբույժի այց',
      content: 'Չմոռանալ հաստատել հաջորդ շաբաթվա այցը և վերցնել բժշկական քարտը։',
      reminderDate: `${today}T11:00`,
      pinned: false,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'note-3',
      title: 'Կարդալու գրքերի ցանկ',
      content: '1. Atomic Habits\n2. Deep Work\n3. Psychology of Money',
      pinned: false,
      updatedAt: new Date().toISOString(),
    },
  ];
}

export const ARMENIAN_WEEKDAYS_SHORT = [
  'Կիր',
  'Երկ',
  'Երք',
  'Չրք',
  'Հնգ',
  'Ուրբ',
  'Շբթ',
] as const;

export function getLastNDaysISO(n: number): { date: string; weekday: string; dayNum: number }[] {
  const result: { date: string; weekday: string; dayNum: number }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    result.push({
      date: `${y}-${m}-${day}`,
      weekday: ARMENIAN_WEEKDAYS_SHORT[d.getDay()],
      dayNum: d.getDate(),
    });
  }
  return result;
}

export function getLastNMonthsKeys(selectedMonth: string, n: number): string[] {
  const [y, m] = selectedMonth.split('-').map(Number);
  const result: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

export function getInitialBudgets(): { category: string; limit: number }[] {
  return [
    { category: 'Սնունդ', limit: 90000 },
    { category: 'Տրանսպորտ', limit: 25000 },
    { category: 'Կոմունալ', limit: 35000 },
  ];
}

export function getInitialRecurringBills(): RecurringBill[] {
  return [
    {
      id: 'bill-1',
      title: 'Ինտերնետ և հեռուստատեսություն',
      amount: 9500,
      category: 'Կոմունալ',
      frequency: 'monthly',
      dayOfMonth: 15,
      reminderTime: '10:00',
      active: true,
    },
    {
      id: 'bill-2',
      title: 'Բջջային կապի փաթեթ',
      amount: 4500,
      category: 'Կոմունալ',
      frequency: 'monthly',
      dayOfMonth: 28,
      reminderTime: '10:00',
      active: true,
    },
  ];
}

export function getInitialHabits(): {
  id: string;
  title: string;
  completedDates: string[];
  createdAt: string;
}[] {
  const days = getLastNDaysISO(7);
  return [
    {
      id: 'habit-1',
      title: 'Խմել 2 լիտր ջուր',
      completedDates: [days[2].date, days[3].date, days[4].date, days[5].date],
      createdAt: new Date().toISOString(),
    },
    {
      id: 'habit-2',
      title: '30 րոպե ընթերցանություն',
      completedDates: [days[1].date, days[3].date, days[5].date],
      createdAt: new Date().toISOString(),
    },
    {
      id: 'habit-3',
      title: 'Առավոտյան մարզանք',
      completedDates: [days[4].date, days[5].date],
      createdAt: new Date().toISOString(),
    },
  ];
}

