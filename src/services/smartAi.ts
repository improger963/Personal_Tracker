import {
  BankCard,
  BudgetLimit,
  DebtItem,
  Habit,
  RecurringBill,
  SavingsGoal,
  Task,
  TaskPriority,
  Transaction,
} from '../types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../data/defaults';
import { INTERNAL_TRANSFER_CATEGORY, computeCardStats } from '../utils/cardBalances';
import { computeBudgetForecast } from '../utils/budgetForecast';
import { SafeToSpendMetrics, isDateInCycle } from '../utils/financialCycle';
import { isTaskCompletedOnDate, isTaskDueOnDate, isTaskOverdue } from '../utils/taskSchedule';

export interface AssistantSuggestedAction {
  kind: 'add_transaction' | 'add_task' | 'add_note' | 'navigate';
  label: string;
  txType?: 'expense' | 'income';
  amount?: number;
  title?: string;
  category?: string;
  priority?: TaskPriority;
  dueTime?: string;
  content?: string;
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
  cards: Array<{ name: string; balance: number; isDefault?: boolean }>;
  topCategories: Array<{ category: string; spent: number }>;
  budgetForecast: {
    overallStatus: string;
    totalSpent: number;
    totalProjected: number;
    totalLimit: number;
    atRisk: Array<{ category: string; spent: number; projected: number; limit: number }>;
  };
  savingsGoals: Array<{ title: string; saved: number; target: number }>;
  activeDebts: Array<{ person: string; direction: string; remaining: number }>;
  todayTasks: Array<{ title: string; priority: string; done: boolean; dueTime?: string }>;
  overdueCount: number;
  habits: Array<{ title: string; doneToday: boolean }>;
  activeBillsCount: number;
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
    cards: cards.slice(0, 8).map((c) => ({
      name: c.name,
      balance: computeCardStats(c, transactions).currentBalance,
      isDefault: c.isDefault,
    })),
    topCategories,
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
    todayTasks,
    overdueCount,
    habits: habits.slice(0, 10).map((h) => ({
      title: h.title,
      doneToday: h.completedDates.includes(todayISO),
    })),
    activeBillsCount: recurringBills.filter((b) => b.active !== false).length,
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

export interface ScannedReceiptResult {
  amount: number;
  title: string;
  category: string;
  date: string;
  itemsSummary?: string;
}

export async function fileToReceiptPayload(
  file: File
): Promise<{ imageBase64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' }> {
  // Resize and normalize to crisp JPEG with white backdrop (<1.5MB) so transparent PNGs never turn black
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
