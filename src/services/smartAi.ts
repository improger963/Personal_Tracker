import {
  BankCard,
  BudgetLimit,
  CustomCategory,
  DebtItem,
  FocusGoal,
  Habit,
  Note,
  RecurringBill,
  SavingsGoal,
  Task,
  TaskPriority,
  Transaction,
} from '../types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getLastNDaysISO } from '../data/defaults';
import {
  FxRatesToAmd,
  INTERNAL_TRANSFER_CATEGORY,
  computeCardStats,
  getTotalCardsInitialBalanceAMD,
} from '../utils/cardBalances';
import { computeBudgetForecast } from '../utils/budgetForecast';
import {
  SafeToSpendMetrics,
  computeCycleFinancials,
  isDateInCycle,
  shiftMonthKey,
} from '../utils/financialCycle';
import { isTaskCompletedOnDate, isTaskDueOnDate, isTaskOverdue } from '../utils/taskSchedule';

export interface AssistantSuggestedAction {
  kind:
    | 'add_transaction'
    | 'add_task'
    | 'add_note'
    | 'add_habit'
    | 'add_goal'
    | 'add_debt'
    | 'add_bill'
    | 'set_budget'
    | 'navigate';
  label: string;
  txType?: 'expense' | 'income';
  amount?: number;
  targetAmount?: number;
  limit?: number;
  title?: string;
  category?: string;
  priority?: TaskPriority;
  dueTime?: string;
  content?: string;
  person?: string;
  direction?: 'owed_to_me' | 'i_owe';
  frequency?: 'monthly' | 'daily';
  dayOfMonth?: number;
  route?:
    | 'budgets'
    | 'analytics'
    | 'bills'
    | 'goals'
    | 'debts'
    | 'ledger'
    | 'cards'
    | 'tasks'
    | 'habits'
    | 'focus'
    | 'notes';
}

export interface AssistantChatTurn {
  role: 'user' | 'model';
  text: string;
}

export interface SmartWorkspaceContext {
  todayISO: string;
  cycleLabel: string;
  cycleSummary: {
    income: number;
    expense: number;
    netSavings: number;
    openingBalance: number;
    realBalance: number;
    dailyAllowance: number;
    remainingTodayAllowance: number;
    remainingDays: number;
  };
  previousCycle: {
    income: number;
    expense: number;
    netSavings: number;
  };
  cards: Array<{ name: string; balance: number; isDefault?: boolean }>;
  topCategories: Array<{ category: string; spent: number }>;
  recentTransactions: Array<{
    date: string;
    type: 'income' | 'expense';
    amount: number;
    category: string;
    title: string;
    isPending?: boolean;
  }>;
  budgetForecast: {
    overallStatus: string;
    totalSpent: number;
    totalProjected: number;
    totalLimit: number;
    atRisk: Array<{ category: string; spent: number; projected: number; limit: number }>;
  };
  upcomingBills: Array<{
    title: string;
    amount: number;
    category: string;
    dayOfMonth: number;
    frequency: string;
  }>;
  savingsGoals: Array<{ title: string; saved: number; target: number }>;
  activeDebts: Array<{ person: string; direction: string; remaining: number }>;
  todayFocusGoal?: { title: string; completed: boolean } | null;
  todayTasks: Array<{ title: string; priority: string; done: boolean; dueTime?: string }>;
  overdueCount: number;
  habits: Array<{ title: string; doneToday: boolean; weekCount: number }>;
  notesSummary: Array<{ title: string; pinned?: boolean }>;
  activeBillsCount: number;
  customExpenseCategories?: string[];
  customIncomeCategories?: string[];
}

export function buildSmartWorkspaceContext(params: {
  todayISO: string;
  selectedMonth: string;
  cycleLabel: string;
  effectivePayday: number;
  cycleIncome: number;
  cycleExpense: number;
  openingBalance: number;
  realBalance: number;
  safeToSpend: SafeToSpendMetrics;
  transactions: Transaction[];
  cards: BankCard[];
  budgets: BudgetLimit[];
  savingsGoals: SavingsGoal[];
  debts: DebtItem[];
  tasks: Task[];
  habits: Habit[];
  recurringBills: RecurringBill[];
  notes?: Note[];
  focusGoal?: FocusGoal | null;
  customCategories?: CustomCategory[];
  fxRates?: FxRatesToAmd | null;
}): SmartWorkspaceContext {
  const {
    todayISO,
    selectedMonth,
    cycleLabel,
    effectivePayday,
    cycleIncome,
    cycleExpense,
    openingBalance,
    realBalance,
    safeToSpend,
    transactions,
    cards,
    budgets,
    savingsGoals,
    debts,
    tasks,
    habits,
    recurringBills,
    notes = [],
    focusGoal = null,
    customCategories = [],
    fxRates,
  } = params;

  const byCat = new Map<string, number>();
  for (const tx of transactions) {
    if (
      tx.type === 'expense' &&
      !tx.isPending &&
      tx.category !== INTERNAL_TRANSFER_CATEGORY &&
      isDateInCycle(tx.date, selectedMonth, effectivePayday)
    ) {
      byCat.set(tx.category, (byCat.get(tx.category) ?? 0) + tx.amount);
    }
  }
  const topCategories = Array.from(byCat.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([category, spent]) => ({ category, spent }));

  const prevMonthKey = shiftMonthKey(selectedMonth, -1);
  const cardsInitialBalance = getTotalCardsInitialBalanceAMD(cards, fxRates);
  const prevCycle = computeCycleFinancials(
    transactions,
    prevMonthKey,
    effectivePayday,
    todayISO,
    cardsInitialBalance
  );

  const recentTransactions = [...transactions]
    .filter((tx) => tx.category !== INTERNAL_TRANSFER_CATEGORY)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10)
    .map((tx) => ({
      date: tx.date,
      type: tx.type,
      amount: tx.amount,
      category: tx.category,
      title: tx.title,
      isPending: tx.isPending,
    }));

  const forecast = computeBudgetForecast({
    budgets,
    transactions,
    effectivePayday,
    todayISO,
    cycleKey: selectedMonth,
  });

  const todayTasks = tasks
    .filter((t) => isTaskDueOnDate(t, todayISO))
    .slice(0, 10)
    .map((t) => ({
      title: t.title,
      priority: t.priority,
      done: isTaskCompletedOnDate(t, todayISO),
      dueTime: t.dueTime,
    }));

  const overdueCount = tasks.filter((t) => isTaskOverdue(t, todayISO)).length;
  const last7Dates = new Set(getLastNDaysISO(7).map((d) => d.date));

  const upcomingBills = recurringBills
    .filter((b) => b.active !== false)
    .slice(0, 8)
    .map((b) => ({
      title: b.title,
      amount: b.amount,
      category: b.category,
      dayOfMonth: b.dayOfMonth,
      frequency: b.frequency ?? 'monthly',
    }));

  const notesSummary = [...notes]
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
    .slice(0, 6)
    .map((n) => ({
      title: n.title,
      pinned: n.pinned,
    }));

  return {
    todayISO,
    cycleLabel,
    cycleSummary: {
      income: cycleIncome,
      expense: cycleExpense,
      netSavings: cycleIncome - cycleExpense,
      openingBalance,
      realBalance,
      dailyAllowance: safeToSpend.dailyAllowance,
      remainingTodayAllowance: safeToSpend.remainingTodayAllowance,
      remainingDays: safeToSpend.remainingDaysInclusive,
    },
    previousCycle: {
      income: prevCycle.cycleIncome,
      expense: prevCycle.cycleExpense,
      netSavings: prevCycle.cycleNet,
    },
    cards: cards.slice(0, 8).map((c) => ({
      name: c.name,
      balance: computeCardStats(c, transactions, fxRates).currentBalanceAMD,
      isDefault: c.isDefault,
    })),
    topCategories,
    recentTransactions,
    budgetForecast: {
      overallStatus: forecast.overallStatus,
      totalSpent: forecast.totalSpent,
      totalProjected: forecast.totalProjected,
      totalLimit: forecast.totalLimit,
      atRisk: [...forecast.exceededCategories, ...forecast.atRiskCategories]
        .slice(0, 5)
        .map((c) => ({
          category: c.category,
          spent: c.spentSoFar,
          projected: c.projectedEndSpent,
          limit: c.limit,
        })),
    },
    upcomingBills,
    savingsGoals: savingsGoals.slice(0, 6).map((g) => ({
      title: g.title,
      saved: g.currentAmount,
      target: g.targetAmount,
    })),
    activeDebts: debts
      .filter((d) => !d.settled)
      .slice(0, 6)
      .map((d) => ({
        person: d.person,
        direction: d.direction,
        remaining: Math.max(0, d.totalAmount - d.paidAmount),
      })),
    todayFocusGoal:
      focusGoal && focusGoal.date === todayISO && focusGoal.title
        ? { title: focusGoal.title, completed: focusGoal.completed }
        : null,
    todayTasks,
    overdueCount,
    habits: habits.slice(0, 10).map((h) => ({
      title: h.title,
      doneToday: h.completedDates.includes(todayISO),
      weekCount: h.completedDates.filter((d) => last7Dates.has(d)).length,
    })),
    notesSummary,
    activeBillsCount: recurringBills.filter((b) => b.active !== false).length,
    customExpenseCategories: customCategories
      .filter((c) => c.type === 'expense')
      .map((c) => c.name),
    customIncomeCategories: customCategories
      .filter((c) => c.type === 'income')
      .map((c) => c.name),
  };
}

async function parseJsonSafe<T>(res: Response): Promise<T> {
  const raw = await res.text();
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      res.ok
        ? 'Սերվերը վերադարձրեց անվավեր պատասխան։'
        : `Սերվերի սխալ (${res.status})։ Խնդրում ենք կրկին փորձել։`
    );
  }
}

export async function askSmartAssistant(params: {
  message: string;
  history: AssistantChatTurn[];
  context: SmartWorkspaceContext;
  signal?: AbortSignal;
}): Promise<{ reply: string; suggestedActions: AssistantSuggestedAction[] }> {
  const res = await fetch('/api/smart/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: params.signal,
    body: JSON.stringify({
      message: params.message,
      history: params.history,
      context: params.context,
    }),
  });
  const data = await parseJsonSafe<{
    reply?: string;
    suggestedActions?: AssistantSuggestedAction[];
    error?: string;
  }>(res);
  if (!res.ok || !data.reply) {
    throw new Error(data.error || 'Չհաջողվեց ստանալ պատասխան AI օգնականից։');
  }
  return {
    reply: data.reply,
    suggestedActions: Array.isArray(data.suggestedActions) ? data.suggestedActions : [],
  };
}

export async function askSmartAssistantStream(params: {
  message: string;
  history: AssistantChatTurn[];
  context: SmartWorkspaceContext;
  signal?: AbortSignal;
  onDelta: (chunk: string) => void;
  onActions?: (actions: AssistantSuggestedAction[]) => void;
}): Promise<{ reply: string; suggestedActions: AssistantSuggestedAction[] }> {
  const res = await fetch('/api/smart/assistant-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: params.signal,
    body: JSON.stringify({
      message: params.message,
      history: params.history,
      context: params.context,
    }),
  });

  if (!res.ok) {
    const errData = await parseJsonSafe<{ error?: string }>(res);
    throw new Error(errData.error || 'Չհաջողվեց ստանալ պատասխան AI օգնականից։');
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream') || !res.body) {
    const fallback = await askSmartAssistant({
      message: params.message,
      history: params.history,
      context: params.context,
      signal: params.signal,
    });
    params.onDelta(fallback.reply);
    if (fallback.suggestedActions.length > 0) {
      params.onActions?.(fallback.suggestedActions);
    }
    return fallback;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullReply = '';
  let suggestedActions: AssistantSuggestedAction[] = [];

  const handleFrame = (rawFrame: string) => {
    const lines = rawFrame.split('\n');
    let eventName = 'message';
    const dataParts: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataParts.push(line.slice(5).trim());
      }
    }

    if (dataParts.length === 0) return;
    const rawJson = dataParts.join('\n');
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawJson) as Record<string, unknown>;
    } catch {
      return;
    }

    if (eventName === 'delta' && typeof payload.text === 'string' && payload.text) {
      fullReply += payload.text;
      params.onDelta(payload.text);
    } else if (eventName === 'actions' && Array.isArray(payload.suggestedActions)) {
      suggestedActions = payload.suggestedActions as AssistantSuggestedAction[];
      params.onActions?.(suggestedActions);
    } else if (eventName === 'error' && typeof payload.error === 'string') {
      throw new Error(payload.error);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

    let splitIdx = buffer.indexOf('\n\n');
    while (splitIdx !== -1) {
      const frame = buffer.slice(0, splitIdx).trim();
      buffer = buffer.slice(splitIdx + 2);
      if (frame) handleFrame(frame);
      splitIdx = buffer.indexOf('\n\n');
    }
  }

  if (buffer.trim()) {
    handleFrame(buffer.trim());
  }

  if (!fullReply.trim()) {
    throw new Error('Չհաջողվեց ստանալ պատասխան AI օգնականից։');
  }

  return { reply: fullReply, suggestedActions };
}

export interface AISmartParsedItem {
  kind: 'transaction' | 'task' | 'note';
  txType?: 'expense' | 'income';
  amount?: number;
  title: string;
  category?: string;
  date?: string;
  dueTime?: string;
  priority?: TaskPriority;
  content?: string;
  cardHint?: string;
}

export async function parseCommandWithAI(params: {
  text: string;
  todayISO: string;
  cardNames: string[];
  signal?: AbortSignal;
}): Promise<AISmartParsedItem[]> {
  const res = await fetch('/api/smart/parse-command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: params.signal,
    body: JSON.stringify({
      text: params.text,
      todayISO: params.todayISO,
      cardNames: params.cardNames,
    }),
  });
  const data = await parseJsonSafe<{
    actions?: Array<Record<string, unknown>>;
    error?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(data.error || 'Չհաջողվեց վերլուծել հրամանը AI-ով։');
  }
  const raw = Array.isArray(data.actions) ? data.actions : [];
  return raw
    .map((item): AISmartParsedItem | null => {
      const kind =
        item.kind === 'transaction' || item.kind === 'task' || item.kind === 'note'
          ? item.kind
          : null;
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      if (!kind || !title) return null;
      const txType = item.txType === 'income' ? 'income' : 'expense';
      const validCats =
        txType === 'income'
          ? (INCOME_CATEGORIES as readonly string[])
          : (EXPENSE_CATEGORIES as readonly string[]);
      const rawCat = typeof item.category === 'string' ? item.category : '';
      const category = validCats.includes(rawCat) ? rawCat : 'Այլ';
      return {
        kind,
        txType,
        amount:
          typeof item.amount === 'number' && Number.isFinite(item.amount)
            ? Math.max(0, Math.round(item.amount))
            : undefined,
        title,
        category,
        date:
          typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
            ? item.date
            : params.todayISO,
        dueTime:
          typeof item.dueTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.dueTime)
            ? item.dueTime
            : undefined,
        priority:
          item.priority === 'high' || item.priority === 'low' ? item.priority : 'medium',
        content: typeof item.content === 'string' ? item.content.trim() : undefined,
        cardHint: typeof item.cardHint === 'string' ? item.cardHint.trim() : undefined,
      };
    })
    .filter((x): x is AISmartParsedItem => x !== null);
}

export async function transcribeAudioWithAI(params: {
  audioBase64: string;
  mimeType: string;
}): Promise<string> {
  const res = await fetch('/api/smart/transcribe-audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await parseJsonSafe<{ text?: string; error?: string }>(res);
  if (!res.ok || !data.text) {
    throw new Error(data.error || 'Չհաջողվեց տեքստավորել ձայնագրությունը։');
  }
  return data.text.trim();
}

export interface DayPlanAllocation {
  taskId: string;
  dueTime: string;
  priority: TaskPriority;
}

export interface DayPlanResult {
  strategyTip: string;
  allocations: DayPlanAllocation[];
}

export async function planDayWithAI(params: {
  todayISO: string;
  currentHHMM: string;
  focusGoal?: string;
  tasks: Array<{
    id: string;
    title: string;
    priority: TaskPriority;
    dueTime?: string;
    isOverdue?: boolean;
  }>;
}): Promise<DayPlanResult> {
  const res = await fetch('/api/smart/plan-day', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await parseJsonSafe<{
    strategyTip?: string;
    allocations?: Array<Record<string, unknown>>;
    error?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(data.error || 'Չհաջողվեց կազմել օրվա պլանը։');
  }
  const allocations: DayPlanAllocation[] = Array.isArray(data.allocations)
    ? data.allocations
        .map((a): DayPlanAllocation | null => {
          const taskId = typeof a.taskId === 'string' ? a.taskId : '';
          const dueTime =
            typeof a.dueTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(a.dueTime)
              ? a.dueTime
              : '';
          if (!taskId || !dueTime) return null;
          return {
            taskId,
            dueTime,
            priority: a.priority === 'high' || a.priority === 'low' ? a.priority : 'medium',
          };
        })
        .filter((x): x is DayPlanAllocation => x !== null)
    : [];
  return {
    strategyTip: typeof data.strategyTip === 'string' ? data.strategyTip : '',
    allocations,
  };
}

export type SupportedFxCode = 'USD' | 'EUR' | 'RUB' | 'GEL';

export interface LiveFxRatesResult {
  base: 'AMD';
  rates: Record<SupportedFxCode, number>;
  updatedAt: string;
  cached?: boolean;
}

export async function fetchLiveFxRates(): Promise<LiveFxRatesResult> {
  const res = await fetch('/api/finance/fx-rates');
  const data = await parseJsonSafe<Partial<LiveFxRatesResult> & { error?: string }>(res);
  if (!res.ok || !data.rates) {
    throw new Error(
      data.error || 'Արտարժույթի փոխարժեքները ժամանակավորապես անհասանելի են։'
    );
  }
  return {
    base: 'AMD',
    rates: data.rates,
    updatedAt: data.updatedAt || new Date().toISOString(),
    cached: data.cached,
  };
}

export interface ScannedReceiptResult {
  amount: number;
  title: string;
  category: string;
  date: string;
  itemsSummary?: string;
  items?: string[];
}

export async function fileToReceiptPayload(
  file: File
): Promise<{ imageBase64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' }> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Չհաջողվեց բեռնել պատկերը։'));
      el.src = bitmapUrl;
    });

    const maxSide = 1400;
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Պատկերի մշակումն անհասանելի է։');
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const outMime = 'image/jpeg' as const;
    let dataUrl = canvas.toDataURL(outMime, 0.86);
    if (dataUrl.length > 3_500_000) {
      dataUrl = canvas.toDataURL(outMime, 0.72);
    }
    const commaIdx = dataUrl.indexOf(',');
    return {
      imageBase64: commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl,
      mimeType: outMime,
    };
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

export async function scanReceiptWithAI(params: {
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  todayISO: string;
}): Promise<ScannedReceiptResult> {
  const res = await fetch('/api/smart/scan-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await parseJsonSafe<Partial<ScannedReceiptResult> & { error?: string }>(res);
  if (!res.ok) {
    throw new Error(data.error || 'Չհաջողվեց սկանավորել կտրոնը։');
  }
  const items = Array.isArray(data.items)
    ? data.items
        .filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
        .map((line) => line.trim())
        .slice(0, 15)
    : [];
  return {
    amount:
      typeof data.amount === 'number' && Number.isFinite(data.amount) && data.amount > 0
        ? Math.round(data.amount)
        : 0,
    title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'Կտրոնի գնում',
    category:
      typeof data.category === 'string' &&
      (EXPENSE_CATEGORIES as readonly string[]).includes(data.category)
        ? data.category
        : 'Այլ',
    date:
      typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date)
        ? data.date
        : params.todayISO,
    itemsSummary: typeof data.itemsSummary === 'string' ? data.itemsSummary.trim() : undefined,
    items: items.length > 0 ? items : undefined,
  };
}

export interface BrokenDownSubtask {
  title: string;
  priority: TaskPriority;
  dueTime?: string;
}

export async function breakdownTaskWithAI(params: {
  text: string;
  todayISO: string;
}): Promise<BrokenDownSubtask[]> {
  const res = await fetch('/api/smart/breakdown-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await parseJsonSafe<{
    tasks?: Array<Record<string, unknown>>;
    error?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(data.error || 'Չհաջողվեց ստեղծել քայլերի պլանը։');
  }
  const raw = Array.isArray(data.tasks) ? data.tasks : [];
  return raw
    .map((item): BrokenDownSubtask | null => {
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      if (!title) return null;
      return {
        title: title.slice(0, 140),
        priority:
          item.priority === 'high' || item.priority === 'low' ? item.priority : 'medium',
        dueTime:
          typeof item.dueTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.dueTime)
            ? item.dueTime
            : undefined,
      };
    })
    .filter((x): x is BrokenDownSubtask => x !== null);
}

export interface SubscriptionAnalyzeItem {
  title: string;
  category: string;
  amount: number;
  count: number;
  distinctMonths: number;
  matchReason: string;
  latestDate: string;
}

export interface SubscriptionAnalysisResult {
  recommendation: string;
  cancelCandidate: string;
  potentialMonthlySavings: number;
  tips: string[];
  generatedAt: string;
}

export async function analyzeSubscriptionsWithAI(params: {
  subscriptions: SubscriptionAnalyzeItem[];
  totalMonthlySpend: number;
  currency?: string;
  signal?: AbortSignal;
}): Promise<SubscriptionAnalysisResult> {
  const res = await fetch('/api/smart/analyze-subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: params.signal,
    body: JSON.stringify({
      subscriptions: params.subscriptions,
      totalMonthlySpend: params.totalMonthlySpend,
      currency: params.currency ?? 'AMD',
    }),
  });
  const data = await parseJsonSafe<Partial<SubscriptionAnalysisResult> & { error?: string }>(res);
  if (!res.ok || !data.recommendation) {
    throw new Error(
      data.error || 'Չհաջողվեց ստանալ բաժանորդագրությունների AI վերլուծությունը։'
    );
  }
  return {
    recommendation: data.recommendation.trim(),
    cancelCandidate:
      typeof data.cancelCandidate === 'string' ? data.cancelCandidate.trim() : '',
    potentialMonthlySavings:
      typeof data.potentialMonthlySavings === 'number' &&
      Number.isFinite(data.potentialMonthlySavings)
        ? Math.max(0, Math.round(data.potentialMonthlySavings))
        : 0,
    tips: Array.isArray(data.tips)
      ? data.tips.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      : [],
    generatedAt: data.generatedAt || new Date().toISOString(),
  };
}

