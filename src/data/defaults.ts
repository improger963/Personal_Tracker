import {
  BankCard,
  Currency,
  DebtItem,
  FocusSession,
  IncomeKind,
  Note,
  NotificationSettings,
  PrimaryIncomeConfig,
  RecurringBill,
  SavingsGoal,
  Task,
  Transaction,
} from '../types';

export function getInitialNotificationSettings(): NotificationSettings {
  return {
    soundEnabled: true,
    browserNotifications: false,
    soundPreset: 'chime',
    urgentSoundEnabled: true,
    soundVolume: 0.75,
    voiceEnabled: false,
    voiceMode: 'auto',
    voicePreset: 'Kore',
    browserVoiceURI: '',
    voiceRate: 1,
    quietHoursEnabled: false,
    quietHoursStart: '22:30',
    quietHoursEnd: '08:00',
  };
}

export function normalizeNotificationSettings(
  raw?: Partial<NotificationSettings> | null
): NotificationSettings {
  const defaults = getInitialNotificationSettings();
  if (!raw || typeof raw !== 'object') return defaults;

  const validPresets = new Set(['chime', 'bell', 'marimba', 'pulse', 'zen']);
  const validVoiceModes = new Set(['auto', 'gemini', 'browser']);
  const validVoicePresets = new Set(['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr']);
  const hhmmRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

  return {
    soundEnabled:
      typeof raw.soundEnabled === 'boolean'
        ? raw.soundEnabled
        : defaults.soundEnabled,
    browserNotifications:
      typeof raw.browserNotifications === 'boolean'
        ? raw.browserNotifications
        : defaults.browserNotifications,
    soundPreset:
      typeof raw.soundPreset === 'string' && validPresets.has(raw.soundPreset)
        ? (raw.soundPreset as NotificationSettings['soundPreset'])
        : defaults.soundPreset,
    urgentSoundEnabled:
      typeof raw.urgentSoundEnabled === 'boolean'
        ? raw.urgentSoundEnabled
        : defaults.urgentSoundEnabled,
    soundVolume:
      typeof raw.soundVolume === 'number' && Number.isFinite(raw.soundVolume)
        ? Math.min(1, Math.max(0.1, Number(raw.soundVolume.toFixed(2))))
        : defaults.soundVolume,
    voiceEnabled:
      typeof raw.voiceEnabled === 'boolean'
        ? raw.voiceEnabled
        : defaults.voiceEnabled,
    voiceMode:
      typeof raw.voiceMode === 'string' && validVoiceModes.has(raw.voiceMode)
        ? (raw.voiceMode as NotificationSettings['voiceMode'])
        : defaults.voiceMode,
    voicePreset:
      typeof raw.voicePreset === 'string' && validVoicePresets.has(raw.voicePreset)
        ? (raw.voicePreset as NotificationSettings['voicePreset'])
        : defaults.voicePreset,
    browserVoiceURI:
      typeof raw.browserVoiceURI === 'string'
        ? raw.browserVoiceURI.slice(0, 200)
        : defaults.browserVoiceURI,
    voiceRate:
      typeof raw.voiceRate === 'number' && Number.isFinite(raw.voiceRate)
        ? Math.min(1.4, Math.max(0.75, Number(raw.voiceRate.toFixed(2))))
        : defaults.voiceRate,
    quietHoursEnabled:
      typeof raw.quietHoursEnabled === 'boolean'
        ? raw.quietHoursEnabled
        : defaults.quietHoursEnabled,
    quietHoursStart:
      typeof raw.quietHoursStart === 'string' && hhmmRegex.test(raw.quietHoursStart)
        ? raw.quietHoursStart
        : defaults.quietHoursStart,
    quietHoursEnd:
      typeof raw.quietHoursEnd === 'string' && hhmmRegex.test(raw.quietHoursEnd)
        ? raw.quietHoursEnd
        : defaults.quietHoursEnd,
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

export const SAVINGS_GOAL_CATEGORIES = [
  'Անվտանգության պահուստ',
  'Ճամփորդություն',
  'Տեխնիկա',
  'Ավտոմեքենա',
  'Բնակարան',
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

const AMD_NUMBER_FORMATTER = new Intl.NumberFormat('hy-AM', {
  maximumFractionDigits: 0,
});

export function formatMoney(amount: number, _currency: Currency = 'AMD'): string {
  const formatted = AMD_NUMBER_FORMATTER.format(Math.abs(amount));
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
      title: 'Շաբաթական սուպերմարկետի գնումներ',
      content: 'Գնումների արագ ցանկ տան համար․',
      checklist: [
        { id: 'chk-1', text: 'Թարմ մրգեր և բանջարեղեն', done: true },
        { id: 'chk-2', text: 'Կաթնամթերք և պանիր', done: false },
        { id: 'chk-3', text: 'Հավի կրծքամիս և ձու', done: false },
        { id: 'chk-4', text: 'Աղացած սուրճ', done: false },
      ],
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

export function getInitialSavingsGoals(): SavingsGoal[] {
  return [
    {
      id: 'goal-1',
      title: 'Անվտանգության պահուստ',
      targetAmount: 500000,
      currentAmount: 125000,
      category: 'Անվտանգության պահուստ',
      completed: false,
      createdAt: new Date().toISOString(),
    },
  ];
}

export function getInitialDebts(): DebtItem[] {
  return [];
}

export function getInitialFocusSessions(): FocusSession[] {
  return [];
}

export function getInitialCards(): BankCard[] {
  return [
    {
      id: 'card-1',
      name: 'Ամերիաբանկ Visa',
      last4: '4589',
      cardType: 'visa',
      color: 'blue',
      initialBalance: 150000,
      currency: 'AMD',
      isDefault: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'card-2',
      name: 'Կանխիկ դրամապանակ',
      last4: '',
      cardType: 'cash',
      color: 'emerald',
      initialBalance: 25000,
      currency: 'AMD',
      isDefault: false,
      createdAt: new Date().toISOString(),
    },
  ];
}



