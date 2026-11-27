import 'dotenv/config';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CategoryInput {
  category: string;
  amount: number;
  pct?: number;
  budgetLimit?: number;
}

interface TopExpenseInput {
  title: string;
  category: string;
  amount: number;
}

interface SavingsAdviceRequestBody {
  cycleLabel?: unknown;
  monthKey?: unknown;
  totalIncome?: unknown;
  totalExpense?: unknown;
  projectedMonthlyExpense?: unknown;
  savingsPct?: unknown;
  currency?: unknown;
  categories?: unknown;
  topExpenses?: unknown;
}

interface GroundingSource {
  title: string;
  uri: string;
}

const VALID_TTS_VOICES = new Set(['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr']);

const EXPENSE_CATEGORY_LIST = [
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

const INCOME_CATEGORY_LIST = [
  'Աշխատավարձ',
  'Ֆրիլանս',
  'Բոնուս',
  'Ներդրումներ',
  'Նվեր',
  'Այլ',
] as const;

const VALID_RECEIPT_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VALID_ASSISTANT_ROUTES = new Set([
  'budgets',
  'analytics',
  'bills',
  'goals',
  'debts',
  'ledger',
  'cards',
  'tasks',
  'habits',
  'focus',
  'notes',
]);
const VALID_ACTION_KINDS = new Set([
  'add_transaction',
  'add_task',
  'add_note',
  'add_habit',
  'add_goal',
  'add_debt',
  'add_bill',
  'set_budget',
  'navigate',
]);
const VALID_PARSE_KINDS = new Set(['transaction', 'task', 'note']);
const VALID_AUDIO_MIMES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/mpeg',
]);

interface TTSRequestBody {
  text?: unknown;
  voiceName?: unknown;
  urgent?: unknown;
}

interface TTSAudioCacheEntry {
  audioBase64: string;
  createdAt: number;
}

const ttsAudioCache = new Map<string, TTSAudioCacheEntry>();
const TTS_CACHE_MAX = 40;
const TTS_CACHE_TTL_MS = 60 * 60 * 1000;

interface RateLimitBucket {
  timestamps: number[];
}

function createSlidingWindowLimiter(options: {
  maxRequests: number;
  windowMs: number;
}) {
  const buckets = new Map<string, RateLimitBucket>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const cutoff = now - options.windowMs;
    const rawIp = req.ip || req.socket.remoteAddress || 'unknown';
    const key = sanitizeText(rawIp, 64) || 'unknown';

    if (buckets.size > 1000) {
      for (const [k, b] of buckets.entries()) {
        b.timestamps = b.timestamps.filter((t) => t > cutoff);
        if (b.timestamps.length === 0) buckets.delete(k);
      }
    }

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      buckets.set(key, bucket);
    }
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

    if (bucket.timestamps.length >= options.maxRequests) {
      return res.status(429).json({
        error: 'Շատ հարցումներ կատարվեցին․ խնդրում ենք սպասել մի քանի վայրկյան։',
      });
    }

    bucket.timestamps.push(now);
    return next();
  };
}

interface FxRatesPayload {
  base: 'AMD';
  rates: Record<'USD' | 'EUR' | 'RUB' | 'GEL', number>;
  updatedAt: string;
  cached?: boolean;
}

let fxRatesCache: { payload: FxRatesPayload; fetchedAt: number } | null = null;
const FX_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function sanitizeText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function sanitizeMultilineText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

function toSafeNumber(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.round(value);
}

function normalizeIsoDate(value: unknown, fallback?: string): string {
  const cleaned = sanitizeText(value, 16);
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }
  if (fallback && /^\d{4}-\d{2}-\d{2}$/.test(fallback)) {
    return fallback;
  }
  return new Date().toISOString().slice(0, 10);
}

function normalizeTimeHHMM(value: unknown): string | undefined {
  const cleaned = sanitizeText(value, 8);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(cleaned) ? cleaned : undefined;
}

function safeParseModelJson<T>(rawText: string | undefined): T {
  const raw = (rawText ?? '').trim();
  if (!raw) return {} as T;
  const unwrapped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(unwrapped || '{}') as T;
}

function isSafeHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}

function extractCustomCategoriesFromContext(
  rawCtx: Record<string, unknown>
): { expenseCats: string[]; incomeCats: string[] } {
  const extraExp = Array.isArray(rawCtx.customExpenseCategories)
    ? rawCtx.customExpenseCategories
        .map((c) => sanitizeText(c, 40))
        .filter(Boolean)
        .slice(0, 30)
    : [];
  const extraInc = Array.isArray(rawCtx.customIncomeCategories)
    ? rawCtx.customIncomeCategories
        .map((c) => sanitizeText(c, 40))
        .filter(Boolean)
        .slice(0, 30)
    : [];

  return {
    expenseCats: Array.from(new Set([...EXPENSE_CATEGORY_LIST, ...extraExp])),
    incomeCats: Array.from(new Set([...INCOME_CATEGORY_LIST, ...extraInc])),
  };
}

function sanitizeAssistantActions(
  rawActions: Array<Record<string, unknown>>,
  expenseCats: string[],
  incomeCats: string[]
) {
  return rawActions
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const kind =
        typeof item.kind === 'string' && VALID_ACTION_KINDS.has(item.kind)
          ? item.kind
          : null;
      const label = sanitizeText(item.label, 80);
      if (!kind || !label) return null;

      if (kind === 'navigate') {
        const route =
          typeof item.route === 'string' && VALID_ASSISTANT_ROUTES.has(item.route)
            ? item.route
            : null;
        if (!route) return null;
        return { kind, label, route };
      }

      if (kind === 'add_transaction') {
        const txType = item.txType === 'income' ? 'income' : 'expense';
        const amount = toSafeNumber(item.amount, 0);
        if (amount <= 0) return null;
        const validCats = txType === 'income' ? incomeCats : expenseCats;
        const rawCat = sanitizeText(item.category, 40);
        const category = validCats.includes(rawCat) ? rawCat : 'Այլ';
        return {
          kind,
          label,
          txType,
          amount,
          title: sanitizeText(item.title, 120) || label,
          category,
        };
      }

      if (kind === 'add_task') {
        return {
          kind,
          label,
          title: sanitizeText(item.title, 140) || label,
          priority:
            item.priority === 'high' || item.priority === 'low'
              ? item.priority
              : 'medium',
          dueTime: normalizeTimeHHMM(item.dueTime),
        };
      }

      if (kind === 'add_habit') {
        const title = sanitizeText(item.title, 100) || label;
        return { kind, label, title };
      }

      if (kind === 'add_goal') {
        const targetAmount = toSafeNumber(item.targetAmount ?? item.amount, 0);
        if (targetAmount <= 0) return null;
        return {
          kind,
          label,
          title: sanitizeText(item.title, 100) || label,
          targetAmount,
        };
      }

      if (kind === 'add_debt') {
        const amount = toSafeNumber(item.amount, 0);
        const person = sanitizeText(item.person || item.title, 80);
        if (amount <= 0 || !person) return null;
        return {
          kind,
          label,
          person,
          amount,
          direction: item.direction === 'owed_to_me' ? 'owed_to_me' : 'i_owe',
          title: sanitizeText(item.title, 100) || undefined,
        };
      }

      if (kind === 'add_bill') {
        const amount = toSafeNumber(item.amount, 0);
        if (amount <= 0) return null;
        const rawCat = sanitizeText(item.category, 40);
        const category = expenseCats.includes(rawCat) ? rawCat : 'Կոմունալ';
        const frequency = item.frequency === 'daily' ? 'daily' : 'monthly';
        const rawDay = toSafeNumber(item.dayOfMonth, 10);
        const dayOfMonth = Math.min(31, Math.max(1, rawDay || 10));
        return {
          kind,
          label,
          title: sanitizeText(item.title, 100) || label,
          amount,
          category,
          frequency,
          dayOfMonth,
        };
      }

      if (kind === 'set_budget') {
        const limit = toSafeNumber(item.limit ?? item.amount, 0);
        const rawCat = sanitizeText(item.category, 40);
        if (limit <= 0 || !expenseCats.includes(rawCat)) {
          return null;
        }
        return {
          kind,
          label,
          category: rawCat,
          limit,
        };
      }

      return {
        kind,
        label,
        title: sanitizeText(item.title, 120) || label,
        content: sanitizeMultilineText(item.content, 1000) || label,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 5);
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const port = Number(process.env.PORT) || 3000;

  app.disable('x-powered-by');
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '6mb' }));

  const generalAiLimiter = createSlidingWindowLimiter({
    maxRequests: 30,
    windowMs: 60_000,
  });
  const heavyAiLimiter = createSlidingWindowLimiter({
    maxRequests: 15,
    windowMs: 60_000,
  });

  app.use('/api/smart/scan-receipt', heavyAiLimiter);
  app.use('/api/smart/transcribe-audio', heavyAiLimiter);
  app.use('/api/notifications/tts', heavyAiLimiter);
  app.use('/api/smart', generalAiLimiter);
  app.use('/api/finance', generalAiLimiter);

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      env: process.env.NODE_ENV || 'development',
      aiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/smart/assistant', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return res.status(503).json({
        error:
          'GEMINI_API_KEY-ն կարգավորված չէ սերվերում։ Ավելացրեք այն Settings > Secrets բաժնում՝ խելացի օգնականից օգտվելու համար։',
      });
    }

    const body = (req.body ?? {}) as {
      message?: unknown;
      history?: unknown;
      context?: unknown;
    };
    const userMessage = sanitizeMultilineText(body.message, 1500);
    if (!userMessage) {
      return res.status(400).json({ error: 'Հարցման տեքստը դատարկ է։' });
    }

    const rawHistory = Array.isArray(body.history) ? body.history.slice(-8) : [];
    const historyTurns = rawHistory
      .map((turn): { role: 'user' | 'model'; text: string } | null => {
        if (!turn || typeof turn !== 'object') return null;
        const obj = turn as Record<string, unknown>;
        const role = obj.role === 'model' ? 'model' : obj.role === 'user' ? 'user' : null;
        const text = sanitizeMultilineText(obj.text, 1200);
        if (!role || !text) return null;
        return { role, text };
      })
      .filter((x): x is { role: 'user' | 'model'; text: string } => x !== null);

    const rawCtx =
      body.context && typeof body.context === 'object'
        ? (body.context as Record<string, unknown>)
        : {};
    const { expenseCats, incomeCats } = extractCustomCategoriesFromContext(rawCtx);
    const contextJson = JSON.stringify(rawCtx).slice(0, 12000);

    try {
      const ai = createGeminiClient(apiKey);
      const contents = [
        ...historyTurns.map((t) => ({
          role: t.role,
          parts: [{ text: t.text }],
        })),
        {
          role: 'user' as const,
          parts: [
            {
              text: `Օգտատիրոջ ընթացիկ տվյալների ամփոփում (JSON):\n${contextJson}\n\nՕգտատիրոջ հարցը՝\n${userMessage}`,
            },
          ],
        },
      ];

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction: `Դու «Անձնական Օգնական» հավելվածի խելացի անձնական ֆինանսական և օրակարգային օգնականն ես։
- Պատասխանիր այն լեզվով, որով դիմել է օգտատերը (հիմնականում հայերեն, կամ ռուսերեն/անգլերեն, եթե հարցը այդ լեզվով է)։
- Հիմնվիր բացառապես տրամադրված իրական JSON տվյալների վրա (բալանս, նախորդ ցիկլի համեմատություն, վերջին գործարքներ, առաջիկա պարտադիր վճարներ, բյուջեի կանխատեսում, անելիքներ, օրվա գլխավոր նպատակ, սովորություններ, նշումներ, նպատակներ, պարտքեր)։ Մի հորինիր թվեր։
- Եթե հարցը վերաբերում է գնում կամ ծախս թույլ տալուն («կարո՞ղ եմ թույլ տալ...»), հաշվի առ ազատ մնացորդը (realBalance), օրական սահմանաչափը (dailyAllowance), մնացած օրերը և առաջիկա վճարները։
- Պատասխանը պահիր հստակ, գործնական և կարճ (3-6 նախադասություն կամ հստակ կետեր)։
- Եթե օգտատիրոջ հարցից բխում է կոնկրետ գործողություն, վերադարձրու նաև suggestedActions զանգվածը (առավելագույնը 5 գործողություն) հետևյալ տեսակներից՝
  * add_transaction (գործարք՝ txType, amount, title, category)
  * add_task (անելիք՝ title, priority, dueTime)
  * add_note (նշում՝ title, content)
  * add_habit (նոր սովորություն՝ title)
  * add_goal (խնայողական նպատակ՝ title, targetAmount)
  * add_debt (պարտք՝ person, amount, direction='owed_to_me'|'i_owe', title)
  * add_bill (կրկնվող վճար՝ title, amount, category, frequency='monthly'|'daily', dayOfMonth)
  * set_budget (ամսական բյուջե՝ category, limit)
  * navigate (բացել էջ՝ route: 'budgets'|'analytics'|'bills'|'goals'|'debts'|'ledger'|'cards'|'tasks'|'habits'|'focus'|'notes')
- Թույլատրելի ծախսի կատեգորիաներ՝ ${expenseCats.join(', ')}։ Թույլատրելի եկամտի կատեգորիաներ՝ ${incomeCats.join(', ')}։`,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description: 'Հստակ, օգտակար պատասխան օգտատիրոջ հարցին',
              },
              suggestedActions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    kind: {
                      type: Type.STRING,
                      description:
                        'One of: add_transaction, add_task, add_note, add_habit, add_goal, add_debt, add_bill, set_budget, navigate',
                    },
                    label: {
                      type: Type.STRING,
                      description: 'Short clickable button label in Armenian/user language',
                    },
                    txType: { type: Type.STRING },
                    amount: { type: Type.NUMBER },
                    targetAmount: { type: Type.NUMBER },
                    limit: { type: Type.NUMBER },
                    title: { type: Type.STRING },
                    category: { type: Type.STRING },
                    priority: { type: Type.STRING },
                    dueTime: { type: Type.STRING },
                    content: { type: Type.STRING },
                    person: { type: Type.STRING },
                    direction: { type: Type.STRING },
                    frequency: { type: Type.STRING },
                    dayOfMonth: { type: Type.NUMBER },
                    route: {
                      type: Type.STRING,
                      description:
                        'One of: budgets, analytics, bills, goals, debts, ledger, cards, tasks, habits, focus, notes',
                    },
                  },
                  required: ['kind', 'label'],
                },
              },
            },
            required: ['reply'],
          },
        },
      });

      const parsed = safeParseModelJson<{
        reply?: string;
        suggestedActions?: Array<Record<string, unknown>>;
      }>(response.text);

      const safeReply = sanitizeMultilineText(parsed.reply, 4000);
      if (!safeReply) {
        return res.status(502).json({
          error: 'Չհաջողվեց ստանալ պատասխան AI օգնականից։',
        });
      }

      const rawActions = Array.isArray(parsed.suggestedActions)
        ? parsed.suggestedActions
        : [];
      const actions = sanitizeAssistantActions(rawActions, expenseCats, incomeCats);

      return res.json({
        reply: safeReply,
        suggestedActions: actions,
      });
    } catch (error) {
      console.error('Smart assistant error:', error);
      return res.status(502).json({
        error: 'Խելացի օգնականը ժամանակավորապես անհասանելի է։ Փորձեք կրկին։',
      });
    }
  });

  app.post('/api/smart/assistant-stream', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return res.status(503).json({
        error:
          'GEMINI_API_KEY-ն կարգավորված չէ սերվերում։ Ավելացրեք այն Settings > Secrets բաժնում՝ խելացի օգնականից օգտվելու համար։',
      });
    }

    const body = (req.body ?? {}) as {
      message?: unknown;
      history?: unknown;
      context?: unknown;
    };
    const userMessage = sanitizeMultilineText(body.message, 1500);
    if (!userMessage) {
      return res.status(400).json({ error: 'Հարցման տեքստը դատարկ է։' });
    }

    const rawHistory = Array.isArray(body.history) ? body.history.slice(-8) : [];
    const historyTurns = rawHistory
      .map((turn): { role: 'user' | 'model'; text: string } | null => {
        if (!turn || typeof turn !== 'object') return null;
        const obj = turn as Record<string, unknown>;
        const role = obj.role === 'model' ? 'model' : obj.role === 'user' ? 'user' : null;
        const text = sanitizeMultilineText(obj.text, 1200);
        if (!role || !text) return null;
        return { role, text };
      })
      .filter((x): x is { role: 'user' | 'model'; text: string } => x !== null);

    const rawCtx =
      body.context && typeof body.context === 'object'
        ? (body.context as Record<string, unknown>)
        : {};
    const { expenseCats, incomeCats } = extractCustomCategoriesFromContext(rawCtx);
    const contextJson = JSON.stringify(rawCtx).slice(0, 12000);

    let aborted = false;
    req.on('close', () => {
      aborted = true;
    });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const writeEvent = (event: string, data: unknown) => {
      if (aborted || res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const ai = createGeminiClient(apiKey);
      const contents = [
        ...historyTurns.map((t) => ({
          role: t.role,
          parts: [{ text: t.text }],
        })),
        {
          role: 'user' as const,
          parts: [
            {
              text: `Օգտատիրոջ ընթացիկ տվյալների ամփոփում (JSON):\n${contextJson}\n\nՕգտատիրոջ հարցը՝\n${userMessage}`,
            },
          ],
        },
      ];

      const stream = await ai.models.generateContentStream({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction: `Դու «Անձնական Օգնական» հավելվածի խելացի անձնական ֆինանսական և օրակարգային օգնականն ես։
- Պատասխանիր այն լեզվով, որով դիմել է օգտատերը (հիմնականում հայերեն, կամ ռուսերեն/անգլերեն, եթե հարցը այդ լեզվով է)։
- Հիմնվիր բացառապես տրամադրված իրական JSON տվյալների վրա (բալանս, նախորդ ցիկլի համեմատություն, վերջին գործարքներ, առաջիկա պարտադիր վճարներ, բյուջեի կանխատեսում, անելիքներ, օրվա գլխավոր նպատակ, սովորություններ, նշումներ, նպատակներ, պարտքեր)։ Մի հորինիր թվեր։
- Եթե հարցը վերաբերում է գնում կամ ծախս թույլ տալուն («կարո՞ղ եմ թույլ տալ...»), հաշվի առ ազատ մնացորդը (realBalance), օրական սահմանաչափը (dailyAllowance), մնացած օրերը և առաջիկա վճարները։
- Պատասխանը պահիր հստակ, գործնական և կարճ (3-6 նախադասություն կամ հստակ կետեր)։ Վերադարձրու միայն մաքուր ընթերցելի տեքստ՝ առանց JSON կոդի։`,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      let fullReply = '';
      for await (const chunk of stream) {
        if (aborted) break;
        const deltaText = chunk.text ?? '';
        if (deltaText) {
          fullReply += deltaText;
          writeEvent('delta', { text: deltaText });
        }
      }

      if (!aborted && fullReply.trim()) {
        try {
          const actionsRes = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: `Օգտատիրոջ հարցը՝ "${userMessage}"
Օգնականի պատասխանը՝ "${fullReply.slice(0, 2000)}"
Եթե պատասխանից կամ հարցից բխում են կոնկրետ 1-5 գործողություններ, արդյունահանիր suggestedActions ցանկը (այլապես՝ դատարկ զանգված)։
Թույլատրելի ծախսի կատեգորիաներ՝ ${expenseCats.join(', ')}։ Թույլատրելի եկամտի կատեգորիաներ՝ ${incomeCats.join(', ')}։`,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  suggestedActions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        kind: {
                          type: Type.STRING,
                          description:
                            'One of: add_transaction, add_task, add_note, add_habit, add_goal, add_debt, add_bill, set_budget, navigate',
                        },
                        label: { type: Type.STRING },
                        txType: { type: Type.STRING },
                        amount: { type: Type.NUMBER },
                        targetAmount: { type: Type.NUMBER },
                        limit: { type: Type.NUMBER },
                        title: { type: Type.STRING },
                        category: { type: Type.STRING },
                        priority: { type: Type.STRING },
                        dueTime: { type: Type.STRING },
                        content: { type: Type.STRING },
                        person: { type: Type.STRING },
                        direction: { type: Type.STRING },
                        frequency: { type: Type.STRING },
                        dayOfMonth: { type: Type.NUMBER },
                        route: { type: Type.STRING },
                      },
                      required: ['kind', 'label'],
                    },
                  },
                },
                required: ['suggestedActions'],
              },
            },
          });

          const parsedActions = safeParseModelJson<{
            suggestedActions?: Array<Record<string, unknown>>;
          }>(actionsRes.text);
          const actions = sanitizeAssistantActions(
            Array.isArray(parsedActions.suggestedActions)
              ? parsedActions.suggestedActions
              : [],
            expenseCats,
            incomeCats
          );
          if (actions.length > 0) {
            writeEvent('actions', { suggestedActions: actions });
          }
        } catch (actionErr) {
          console.warn('Stream actions extraction skipped:', actionErr);
        }
      }

      if (!aborted) {
        writeEvent('done', {});
        res.end();
      }
    } catch (error) {
      console.error('Smart assistant stream error:', error);
      if (!aborted) {
        writeEvent('error', {
          error: 'Խելացի օգնականը ժամանակավորապես անհասանելի է։ Փորձեք կրկին։',
        });
        res.end();
      }
    }
  });

  app.post('/api/smart/parse-command', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY-ն կարգավորված չէ սերվերում։',
      });
    }

    const body = (req.body ?? {}) as {
      text?: unknown;
      todayISO?: unknown;
      cardNames?: unknown;
    };
    const text = sanitizeText(body.text, 500);
    const todayISO = normalizeIsoDate(body.todayISO);
    const cardNames = Array.isArray(body.cardNames)
      ? body.cardNames.map((n) => sanitizeText(n, 40)).filter(Boolean).slice(0, 10)
      : [];

    if (!text) {
      return res.status(400).json({ error: 'Մուտքագրեք տեքստ վերլուծության համար։' });
    }

    try {
      const ai = createGeminiClient(apiKey);
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Այսօրվա ամսաթիվն է ${todayISO}։ Օգտատիրոջ քարտերը՝ ${cardNames.join(', ') || 'նշված չեն'}։
Օգտատիրոջ մուտքագրած ազատ տեքստը (կարող է լինել հայերեն, ռուսերեն կամ անգլերեն, նաև մի քանի գործողություն մեկ նախադասության մեջ)՝
"${text}"

Փոխակերպիր սա կառուցվածքային գործողությունների (transaction, task, note)։
Թույլատրելի ծախսի կատեգորիաներ՝ ${EXPENSE_CATEGORY_LIST.join(', ')}։
Թույլատրելի եկամտի կատեգորիաներ՝ ${INCOME_CATEGORY_LIST.join(', ')}։`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              actions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    kind: {
                      type: Type.STRING,
                      description: 'One of: transaction, task, note',
                    },
                    txType: {
                      type: Type.STRING,
                      description: 'expense or income (when kind=transaction)',
                    },
                    amount: {
                      type: Type.NUMBER,
                      description: 'Positive integer AMD amount (when kind=transaction)',
                    },
                    title: { type: Type.STRING },
                    category: { type: Type.STRING },
                    date: {
                      type: Type.STRING,
                      description: 'YYYY-MM-DD format',
                    },
                    dueTime: {
                      type: Type.STRING,
                      description: 'Optional HH:MM for tasks',
                    },
                    priority: {
                      type: Type.STRING,
                      description: 'high, medium, or low (for tasks)',
                    },
                    content: {
                      type: Type.STRING,
                      description: 'Body text (for notes)',
                    },
                    cardHint: {
                      type: Type.STRING,
                      description: 'Matched card name if user mentioned a card or cash',
                    },
                  },
                  required: ['kind', 'title'],
                },
              },
            },
            required: ['actions'],
          },
        },
      });

      const parsed = safeParseModelJson<{
        actions?: Array<Record<string, unknown>>;
      }>(response.text);
      const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [];
      const actions = rawActions
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const kind = typeof item.kind === 'string' && VALID_PARSE_KINDS.has(item.kind)
            ? item.kind
            : null;
          const title = sanitizeText(item.title, 140);
          if (!kind || !title) return null;

          if (kind === 'transaction') {
            const txType = item.txType === 'income' ? 'income' : 'expense';
            const amount = toSafeNumber(item.amount, 0);
            if (amount <= 0) return null;
            const validCats =
              txType === 'income'
                ? (INCOME_CATEGORY_LIST as readonly string[])
                : (EXPENSE_CATEGORY_LIST as readonly string[]);
            const rawCat = sanitizeText(item.category, 40);
            return {
              kind,
              txType,
              amount,
              title,
              category: validCats.includes(rawCat) ? rawCat : 'Այլ',
              date: normalizeIsoDate(item.date, todayISO),
              cardHint: sanitizeText(item.cardHint, 40) || undefined,
            };
          }

          if (kind === 'task') {
            return {
              kind,
              title,
              date: normalizeIsoDate(item.date, todayISO),
              dueTime: normalizeTimeHHMM(item.dueTime),
              priority:
                item.priority === 'high' || item.priority === 'low'
                  ? item.priority
                  : 'medium',
            };
          }

          return {
            kind,
            title,
            date: normalizeIsoDate(item.date, todayISO),
            content: sanitizeMultilineText(item.content, 1000) || title,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .slice(0, 6);
      return res.json({ actions });
    } catch (error) {
      console.error('Smart parse-command error:', error);
      return res.status(502).json({
        error: 'Չհաջողվեց վերլուծել տեքստը AI-ով։',
      });
    }
  });

  app.post('/api/smart/scan-receipt', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY-ն կարգավորված չէ սերվերում։',
      });
    }

    const body = (req.body ?? {}) as {
      imageBase64?: unknown;
      mimeType?: unknown;
      todayISO?: unknown;
    };

    const mimeType =
      typeof body.mimeType === 'string' && VALID_RECEIPT_MIMES.has(body.mimeType)
        ? body.mimeType
        : '';
    const rawBase64 = typeof body.imageBase64 === 'string'
      ? body.imageBase64
          .trim()
          .replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '')
          .replace(/\s+/g, '')
      : '';
    const todayISO = normalizeIsoDate(body.todayISO);

    if (
      !mimeType ||
      !rawBase64 ||
      rawBase64.length > 5_500_000 ||
      !/^[A-Za-z0-9+/=]+$/.test(rawBase64)
    ) {
      return res.status(400).json({
        error: 'Անվավեր կամ չափազանց մեծ պատկեր (թույլատրելի են JPG, PNG, WebP մինչև 4 ՄԲ)։',
      });
    }

    try {
      const ai = createGeminiClient(apiKey);
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: rawBase64,
              },
            },
            {
              text: `Սա վճարման կտրոն, ՀԴՄ անդորրագիր կամ հաշիվ-ապրանքագիր է։ Այսօրվա ամսաթիվն է ${todayISO}։
Առանձնացրու՝
- ընդհանուր գումարը (միայն ամբողջական թիվ, սովորաբար ՀՀ դրամ / AMD)
- խանութի կամ ծառայության հակիրճ անվանումը հայերեն կամ բնօրինակ անվամբ
- ամսաթիվը (YYYY-MM-DD, եթե կտրոնում չի երևում՝ ${todayISO})
- ամենահամապատասխան կատեգորիան այս ցանկից՝ ${EXPENSE_CATEGORY_LIST.join(', ')}
- հակիրճ ապրանքների ամփոփում (մինչև 100 նիշ)
- առանձին ապրանքների կամ տողերի ցուցակը (items, մինչև 15 տող, օր. «Կաթ 1լ — 650 ֏»)։`,
            },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              amount: { type: Type.NUMBER },
              title: { type: Type.STRING },
              category: { type: Type.STRING },
              date: { type: Type.STRING },
              itemsSummary: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['amount', 'title', 'category', 'date'],
          },
        },
      });

      const parsed = safeParseModelJson<{
        amount?: number;
        title?: string;
        category?: string;
        date?: string;
        itemsSummary?: string;
        items?: unknown[];
      }>(response.text);

      const safeAmount =
        typeof parsed.amount === 'number' && Number.isFinite(parsed.amount) && parsed.amount > 0
          ? Math.round(parsed.amount)
          : 0;
      const safeCategory = EXPENSE_CATEGORY_LIST.includes(
        parsed.category as (typeof EXPENSE_CATEGORY_LIST)[number]
      )
        ? parsed.category!
        : 'Այլ';
      const safeDate = normalizeIsoDate(parsed.date, todayISO);
      const safeItems = Array.isArray(parsed.items)
        ? parsed.items
            .map((line) => sanitizeText(line, 100))
            .filter(Boolean)
            .slice(0, 15)
        : [];

      return res.json({
        amount: safeAmount,
        title: sanitizeText(parsed.title, 80) || 'Կտրոնի գնում',
        category: safeCategory,
        date: safeDate,
        itemsSummary: sanitizeText(parsed.itemsSummary, 140),
        items: safeItems,
      });
    } catch (error) {
      console.error('Receipt scan error:', error);
      return res.status(502).json({
        error: 'Չհաջողվեց կարդալ կտրոնը։ Համոզվեք, որ պատկերը հստակ է և կրկին փորձեք։',
      });
    }
  });

  app.post('/api/smart/breakdown-task', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY-ն կարգավորված չէ սերվերում։',
      });
    }

    const body = (req.body ?? {}) as { text?: unknown; todayISO?: unknown };
    const text = sanitizeMultilineText(body.text, 1000);
    const todayISO = normalizeIsoDate(body.todayISO);

    if (!text) {
      return res.status(400).json({ error: 'Տեքստը դատարկ է։' });
    }

    try {
      const ai = createGeminiClient(apiKey);
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Այսօրվա ամսաթիվն է ${todayISO}։ Տրոհիր հետևյալ նպատակը կամ նշումը 3-ից 6 հստակ, իրականացվող անելիքների (հայերենով, կամ օգտատիրոջ գրած լեզվով)՝
"${text}"`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    priority: {
                      type: Type.STRING,
                      description: 'high, medium, or low',
                    },
                    dueTime: {
                      type: Type.STRING,
                      description: 'Optional HH:MM time if obvious',
                    },
                  },
                  required: ['title', 'priority'],
                },
              },
            },
            required: ['tasks'],
          },
        },
      });

      const parsed = safeParseModelJson<{
        tasks?: Array<{ title?: string; priority?: string; dueTime?: string }>;
      }>(response.text);

      const tasks = Array.isArray(parsed.tasks)
        ? parsed.tasks
            .slice(0, 6)
            .map((t) => ({
              title: sanitizeText(t.title, 140),
              priority:
                t.priority === 'high' || t.priority === 'low' ? t.priority : 'medium',
              dueTime: normalizeTimeHHMM(t.dueTime),
            }))
            .filter((t) => t.title.length > 0)
        : [];

      return res.json({ tasks });
    } catch (error) {
      console.error('Task breakdown error:', error);
      return res.status(502).json({
        error: 'Չհաջողվեց ստեղծել քայլերի պլանը։',
      });
    }
  });

  app.post('/api/smart/transcribe-audio', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY-ն կարգավորված չէ սերվերում։',
      });
    }

    const body = (req.body ?? {}) as {
      audioBase64?: unknown;
      mimeType?: unknown;
    };

    const rawMime =
      typeof body.mimeType === 'string'
        ? body.mimeType.split(';')[0].trim().toLowerCase()
        : '';
    const mimeType = VALID_AUDIO_MIMES.has(rawMime) ? rawMime : '';
    const rawBase64 =
      typeof body.audioBase64 === 'string'
        ? body.audioBase64
            .trim()
            .replace(/^data:audio\/[a-zA-Z0-9+.-]+;base64,/, '')
            .replace(/\s+/g, '')
        : '';

    if (
      !mimeType ||
      !rawBase64 ||
      rawBase64.length > 5_500_000 ||
      !/^[A-Za-z0-9+/=]+$/.test(rawBase64)
    ) {
      return res.status(400).json({
        error: 'Անվավեր կամ չափազանց երկար ձայնագրություն։',
      });
    }

    try {
      const ai = createGeminiClient(apiKey);
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: 'Ճշգրիտ գրի առ այս ձայնագրության խոսքը (հայերեն, ռուսերեն կամ անգլերեն՝ ինչպես արտաբերված է)։ Գումարներն ու ժամերը գրիր թվերով (օրինակ՝ 4500 դրամ, 18:30)։ Վերադարձրու միայն մաքուր տեքստը՝ առանց ներածության կամ մեկնաբանությունների։',
              },
              {
                inlineData: {
                  mimeType,
                  data: rawBase64,
                },
              },
            ],
          },
        ],
      });

      const transcribed = sanitizeMultilineText(response.text, 1000);
      if (!transcribed) {
        return res.status(502).json({
          error: 'Ձայնագրությունում խոսք չհայտնաբերվեց։ Փորձեք ավելի հստակ խոսել։',
        });
      }

      return res.json({ text: transcribed });
    } catch (error) {
      console.error('Audio transcription error:', error);
      return res.status(502).json({
        error: 'Չհաջողվեց տեքստավորել ձայնագրությունը։',
      });
    }
  });

  app.post('/api/smart/plan-day', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY-ն կարգավորված չէ սերվերում։',
      });
    }

    const body = (req.body ?? {}) as {
      todayISO?: unknown;
      currentHHMM?: unknown;
      focusGoal?: unknown;
      tasks?: unknown;
    };

    const todayISO = normalizeIsoDate(body.todayISO);
    const currentHHMM = normalizeTimeHHMM(body.currentHHMM) || '09:00';
    const focusGoal = sanitizeText(body.focusGoal, 160);
    const rawTasks = Array.isArray(body.tasks) ? body.tasks.slice(0, 25) : [];
    const cleanTasks = rawTasks
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const obj = item as Record<string, unknown>;
        const id = sanitizeText(obj.id, 80);
        const title = sanitizeText(obj.title, 140);
        if (!id || !title) return null;
        return {
          id,
          title,
          priority:
            obj.priority === 'high' || obj.priority === 'low' ? obj.priority : 'medium',
          dueTime: normalizeTimeHHMM(obj.dueTime),
          isOverdue: Boolean(obj.isOverdue),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (cleanTasks.length === 0) {
      return res.status(400).json({ error: 'Պլանավորման համար ակտիվ անելիքներ չկան։' });
    }

    const validIds = new Set(cleanTasks.map((t) => t.id));

    try {
      const ai = createGeminiClient(apiKey);
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Այսօրվա ամսաթիվն է ${todayISO}, ընթացիկ ժամը՝ ${currentHHMM}։
Օրվա գլխավոր նպատակը՝ ${focusGoal || 'նշված չէ'}։
Ակտիվ անելիքները (JSON)՝
${JSON.stringify(cleanTasks)}

Կազմիր իրատեսական օրվա ժամանակացույց՝
1. Որոշիր յուրաքանչյուր անելիքի համար օպտիմալ ժամ (dueTime HH:MM ֆորմատով, առանց ժամերի համընկնման, ընթացիկ ժամից՝ ${currentHHMM} հետո կամ հաջորդ աշխատանքային բլոկներում մինչև 22:00) և խորհուրդ տրվող առաջնահերթություն (high/medium/low)։ Առաջնահերթություն տուր ժամկետանց և կարևոր գործերին ու օրվա գլխավոր նպատակին։
2. Ավելացրու 1-2 նախադասությամբ հակիրճ ռազմավարական խորհուրդ հայերենով (strategyTip)։`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              strategyTip: { type: Type.STRING },
              allocations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    taskId: { type: Type.STRING },
                    dueTime: { type: Type.STRING },
                    priority: { type: Type.STRING },
                  },
                  required: ['taskId', 'dueTime', 'priority'],
                },
              },
            },
            required: ['strategyTip', 'allocations'],
          },
        },
      });

      const parsed = safeParseModelJson<{
        strategyTip?: string;
        allocations?: Array<{ taskId?: string; dueTime?: string; priority?: string }>;
      }>(response.text);

      const seenIds = new Set<string>();
      const allocations = Array.isArray(parsed.allocations)
        ? parsed.allocations
            .map((a) => {
              const taskId = sanitizeText(a.taskId, 80);
              const dueTime = normalizeTimeHHMM(a.dueTime);
              if (!taskId || !dueTime || !validIds.has(taskId) || seenIds.has(taskId)) {
                return null;
              }
              seenIds.add(taskId);
              return {
                taskId,
                dueTime,
                priority:
                  a.priority === 'high' || a.priority === 'low' ? a.priority : 'medium',
              };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
        : [];

      if (allocations.length === 0) {
        return res.status(502).json({
          error: 'Չհաջողվեց կազմել օրվա ժամանակացույցը։',
        });
      }

      return res.json({
        strategyTip:
          sanitizeText(parsed.strategyTip, 320) ||
          'Առաջնահերթ դրված են ժամկետանց և բարձր կարևորության անելիքները։',
        allocations,
      });
    } catch (error) {
      console.error('Plan day error:', error);
      return res.status(502).json({
        error: 'Չհաջողվեց կազմել օրվա պլանը AI-ով։',
      });
    }
  });

  app.post('/api/smart/analyze-subscriptions', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return res.status(503).json({
        error:
          'GEMINI_API_KEY-ն կարգավորված չէ սերվերում։ Ավելացրեք այն Settings > Secrets բաժնում՝ խելացի վերլուծությունից օգտվելու համար։',
      });
    }

    const body = (req.body ?? {}) as {
      subscriptions?: unknown;
      totalMonthlySpend?: unknown;
      currency?: unknown;
    };

    const rawSubs = Array.isArray(body.subscriptions) ? body.subscriptions.slice(0, 20) : [];
    const cleanSubs = rawSubs
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const obj = item as Record<string, unknown>;
        const title = sanitizeText(obj.title, 100);
        const category = sanitizeText(obj.category, 50) || 'Այլ';
        const amount = toSafeNumber(obj.amount, 0);
        const count = toSafeNumber(obj.count, 1);
        const distinctMonths = toSafeNumber(obj.distinctMonths, 1);
        const matchReason = sanitizeText(obj.matchReason, 32) || 'keyword';
        const latestDate = normalizeIsoDate(obj.latestDate);
        if (!title || amount <= 0) return null;
        return {
          title,
          category,
          amount,
          count,
          distinctMonths,
          matchReason,
          latestDate,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (cleanSubs.length === 0) {
      return res.status(400).json({
        error: 'Վերլուծության համար կրկնվող բաժանորդագրություններ չեն փոխանցվել։',
      });
    }

    const computedTotal = cleanSubs.reduce((sum, s) => sum + s.amount, 0);
    const totalMonthlySpend = toSafeNumber(body.totalMonthlySpend, computedTotal) || computedTotal;
    const currency = sanitizeText(body.currency, 8) || 'AMD';

    try {
      const ai = createGeminiClient(apiKey);
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Օգտատիրոջ գործարքների պատմությունից հայտնաբերվել են հետևյալ կրկնվող բաժանորդագրություններն ու ամսական արտահոսքերը (${cleanSubs.length} հատ, ընդհանուր ամսական ծախսը՝ ${totalMonthlySpend.toLocaleString('en-US')} ${currency}):
${JSON.stringify(cleanSubs, null, 2)}

Վերլուծիր այս բաժանորդագրությունները և հայերենով վերադարձրու կառուցվածքային JSON՝
1. recommendation: Անպայման ներառիր հակիրճ ու հստակ ամփոփ խորհուրդ հետևյալ ձևաչափի ոճով՝ «Դուք ամսական ծախսում եք X ֏՝ Y բաժանորդագրության վրա։ Դիտարկեք Z-ը չեղարկելը, եթե չեք օգտագործում։», որտեղ X-ը ընդհանուր ամսական գումարն է, Y-ը՝ բաժանորդագրությունների քանակը, իսկ Z-ը՝ կոնկրետ թեկնածու բաժանորդագրությունը իրական ցանկից (ավելացրու նաև 1 կարճ գործնական բացատրություն)։
2. cancelCandidate: Զուտ թեկնածու ծառայության անունը (Z) ցանկից։
3. potentialMonthlySavings: Ենթադրվող ամսական խնայողությունը միայն թվով (${currency})։
4. tips: 2-ից 3 շատ կարճ գործնական խորհուրդ հայերենով՝ կրկնվող ծախսերը կրճատելու համար։`,
        config: {
          systemInstruction:
            'Դու խնայողության և բաժանորդագրությունների աուդիտի խելացի ֆինանսական վերլուծաբան ես։ Հիմնվիր բացառապես տրամադրված իրական թվերի և ծառայությունների վրա, մի հորինիր ծառայություններ։ Պատասխանիր գրագետ հայերենով։',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recommendation: {
                type: Type.STRING,
                description:
                  'Concise Armenian recommendation card headline following "Դուք ամսական ծախսում եք X ֏՝ Y բաժանորդագրության վրա։ Դիտարկեք Z-ը չեղարկելը, եթե չեք օգտագործում։"',
              },
              cancelCandidate: {
                type: Type.STRING,
                description: 'Specific subscription or recurring expense name to review/cancel',
              },
              potentialMonthlySavings: {
                type: Type.NUMBER,
                description: 'Estimated monthly savings in AMD',
              },
              tips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'recommendation',
              'cancelCandidate',
              'potentialMonthlySavings',
              'tips',
            ],
          },
        },
      });

      const parsed = safeParseModelJson<{
        recommendation?: string;
        cancelCandidate?: string;
        potentialMonthlySavings?: number;
        tips?: unknown[];
      }>(response.text);

      const recommendation = sanitizeMultilineText(parsed.recommendation, 500);
      if (!recommendation) {
        return res.status(502).json({
          error: 'Չհաջողվեց ստանալ խելացի վերլուծություն AI-ից։',
        });
      }

      const cancelCandidate =
        sanitizeText(parsed.cancelCandidate, 100) || cleanSubs[0].title;
      const potentialMonthlySavings =
        toSafeNumber(parsed.potentialMonthlySavings, cleanSubs[0].amount) ||
        cleanSubs[0].amount;
      const tips = Array.isArray(parsed.tips)
        ? parsed.tips
            .map((t) => sanitizeText(t, 180))
            .filter(Boolean)
            .slice(0, 3)
        : [];

      return res.json({
        recommendation,
        cancelCandidate,
        potentialMonthlySavings,
        tips,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Analyze subscriptions error:', error);
      return res.status(502).json({
        error: 'Բաժանորդագրությունների AI վերլուծությունը ժամանակավորապես անհասանելի է։',
      });
    }
  });

  app.get('/api/finance/fx-rates', async (_req: Request, res: Response) => {
    const now = Date.now();
    if (fxRatesCache && now - fxRatesCache.fetchedAt < FX_CACHE_TTL_MS) {
      return res.json({ ...fxRatesCache.payload, cached: true });
    }

    try {
      const upstream = await fetch('https://open.er-api.com/v6/latest/AMD', {
        signal: AbortSignal.timeout(7000),
      });
      if (!upstream.ok) {
        throw new Error(`FX upstream HTTP ${upstream.status}`);
      }
      const data = (await upstream.json()) as {
        result?: string;
        time_last_update_utc?: string;
        rates?: Record<string, number>;
      };
      const rawRates = data.rates ?? {};
      const invert = (code: string): number => {
        const perAmd = rawRates[code];
        if (typeof perAmd !== 'number' || !Number.isFinite(perAmd) || perAmd <= 0) {
          return 0;
        }
        return Math.round((1 / perAmd) * 100) / 100;
      };

      const rates: Record<'USD' | 'EUR' | 'RUB' | 'GEL', number> = {
        USD: invert('USD'),
        EUR: invert('EUR'),
        RUB: invert('RUB'),
        GEL: invert('GEL'),
      };

      if (rates.USD <= 0 && rates.EUR <= 0) {
        throw new Error('FX rates missing');
      }

      const payload: FxRatesPayload = {
        base: 'AMD',
        rates,
        updatedAt: data.time_last_update_utc || new Date().toISOString(),
      };
      fxRatesCache = { payload, fetchedAt: now };
      return res.json({ ...payload, cached: false });
    } catch (error) {
      console.error('FX rates fetch error:', error);
      if (fxRatesCache) {
        return res.json({ ...fxRatesCache.payload, cached: true });
      }
      return res.status(502).json({
        error: 'Արտարժույթի փոխարժեքները ժամանակավորապես անհասանելի են։ Կարող եք մուտքագրել փոխարժեքը ձեռքով։',
      });
    }
  });

  app.post('/api/finance/savings-advice', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return res.status(503).json({
        error:
          'GEMINI_API_KEY-ն կարգավորված չէ սերվերում։ Ավելացրեք այն միջավայրի փոփոխականներում՝ խորհուրդներ ստանալու համար։',
      });
    }

    const body = (req.body ?? {}) as SavingsAdviceRequestBody;
    const cycleLabel = sanitizeText(body.cycleLabel, 80) || 'Ընթացիկ ամիս';
    const totalIncome = toSafeNumber(body.totalIncome, 0);
    const totalExpense = toSafeNumber(body.totalExpense, 0);
    const projectedMonthlyExpense = toSafeNumber(
      body.projectedMonthlyExpense,
      totalExpense
    );
    const savingsPct =
      typeof body.savingsPct === 'number' && Number.isFinite(body.savingsPct)
        ? Math.max(-999, Math.min(100, Math.round(body.savingsPct)))
        : null;

    const rawCategories = Array.isArray(body.categories) ? body.categories : [];
    const categories: CategoryInput[] = rawCategories
      .slice(0, 15)
      .map((item): CategoryInput | null => {
        if (!item || typeof item !== 'object') return null;
        const obj = item as Record<string, unknown>;
        const category = sanitizeText(obj.category, 60);
        const amount = toSafeNumber(obj.amount, -1);
        if (!category || amount <= 0) return null;
        const pct =
          typeof obj.pct === 'number' && Number.isFinite(obj.pct)
            ? Math.max(0, Math.min(100, Math.round(obj.pct)))
            : undefined;
        const budgetLimit =
          typeof obj.budgetLimit === 'number' &&
          Number.isFinite(obj.budgetLimit) &&
          obj.budgetLimit > 0
            ? Math.round(obj.budgetLimit)
            : undefined;
        return { category, amount, pct, budgetLimit };
      })
      .filter((x): x is CategoryInput => x !== null);

    if (totalExpense <= 0 && categories.length === 0) {
      return res.status(400).json({
        error: 'Ընթացիկ ամսում ծախսերի տվյալներ չկան վերլուծության համար։',
      });
    }

    const rawTopExpenses = Array.isArray(body.topExpenses) ? body.topExpenses : [];
    const topExpenses: TopExpenseInput[] = rawTopExpenses
      .slice(0, 8)
      .map((item): TopExpenseInput | null => {
        if (!item || typeof item !== 'object') return null;
        const obj = item as Record<string, unknown>;
        const title = sanitizeText(obj.title, 70);
        const category = sanitizeText(obj.category, 50);
        const amount = toSafeNumber(obj.amount, -1);
        if (!title || !category || amount <= 0) return null;
        return { title, category, amount };
      })
      .filter((x): x is TopExpenseInput => x !== null);

    const categoriesSummary =
      categories.length > 0
        ? categories
            .map((c) => {
              const pctPart = c.pct !== undefined ? ` (${c.pct}%)` : '';
              const budgetPart =
                c.budgetLimit !== undefined
                  ? `, սահմանված բյուջե՝ ${c.budgetLimit.toLocaleString('en-US')} AMD`
                  : '';
              return `- ${c.category}: ${c.amount.toLocaleString('en-US')} AMD${pctPart}${budgetPart}`;
            })
            .join('\n')
        : 'Կատեգորիաների մանրամասներ չկան';

    const topExpensesSummary =
      topExpenses.length > 0
        ? topExpenses
            .map(
              (e) =>
                `- ${e.title} (${e.category}): ${e.amount.toLocaleString('en-US')} AMD`
            )
            .join('\n')
        : 'Չկան';

    const prompt = `Օգտատիրոջ ${cycleLabel} հաշվարկային շրջանի ֆինանսական պատկերն է՝
- Ընդհանուր եկամուտ՝ ${totalIncome.toLocaleString('en-US')} AMD
- Ընդհանուր հաստատված ծախս՝ ${totalExpense.toLocaleString('en-US')} AMD
- Կանխատեսվող ամսական ծախս՝ ${projectedMonthlyExpense.toLocaleString('en-US')} AMD
- Խնայողության մակարդակ՝ ${savingsPct !== null ? `${savingsPct}%` : 'անհայտ (եկամուտը նշված չէ)'}

Ծախսերը՝ ըստ կատեգորիաների.
${categoriesSummary}

Խոշոր կամ հիմնական ծախսային գրառումները.
${topExpensesSummary}

Հիմնվելով Google Search-ի արդիական ֆինանսական գրագիտության մեթոդների և ծախսերի օպտիմալացման գործնական ռազմավարությունների վրա՝ պատրաստիր «Ամսվա խնայողության խորհուրդ» հայերենով.
1. **Հակիրճ գնահատական** (1-2 նախադասությամբ՝ գնահատելով ընթացիկ ծախսային կառուցվածքը և ամենածանր կատեգորիաները)։
2. **4 կոնկրետ խնայողության խորհուրդ** (համարակալված ցուցակով՝ 1., 2., 3., 4.), որոնցից յուրաքանչյուրը կապված է վերևի կատեգորիաներից մեկի կամ բյուջեի հետ, ներառում է կիրառելի քայլ և մոտավոր խնայողության պոտենցիալ ՀՀ դրամով (AMD)։
Պատասխանը պահիր հստակ, բարեհամբույր և կոկիկ ձևաչափված, առանց ավելորդ ներածության։`;

    try {
      const ai = createGeminiClient(apiKey);

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'Դու փորձառու անձնական ֆինանսական խորհրդատու ես։ Պատասխանիր բացառապես գրագետ հայերենով։ Օգտագործիր Google Search գործիքը՝ արդիական և գործնական խնայողության մոտեցումներ (օրինակ՝ 50/30/20 կանոն, մթերքների պլանավորում, կոմունալ արդյունավետություն, բաժանորդագրությունների աուդիտ, կանխիկի/քարտի վերահսկում) ներառելու համար՝ հարմարեցված օգտատիրոջ իրական ծախսերին ՀՀ դրամով (AMD)։ Մի հորինիր թվեր, որոնք չկան տվյալներում կամ հաշվարկված չեն որպես գնահատական։',
          tools: [{ googleSearch: {} }],
        },
      });

      const advice = response.text?.trim();
      if (!advice) {
        return res.status(502).json({
          error: 'Չհաջողվեց ստանալ պատասխան Gemini ծառայությունից։ Խնդրում ենք կրկին փորձել։',
        });
      }

      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const rawChunks = groundingMetadata?.groundingChunks ?? [];
      const seenUris = new Set<string>();
      const sources: GroundingSource[] = [];

      for (const chunk of rawChunks) {
        const uri = chunk.web?.uri?.trim();
        const title = chunk.web?.title?.trim();
        if (uri && isSafeHttpUrl(uri) && !seenUris.has(uri)) {
          seenUris.add(uri);
          sources.push({
            title: title || new URL(uri).hostname,
            uri,
          });
        }
      }

      const searchQueries = Array.isArray(groundingMetadata?.webSearchQueries)
        ? groundingMetadata.webSearchQueries
            .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
            .slice(0, 6)
        : [];

      return res.json({
        advice,
        sources: sources.slice(0, 6),
        searchQueries,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to generate savings advice:', error);
      const message =
        error instanceof Error && error.message.toLowerCase().includes('api key')
          ? 'API բանալին անվավեր է կամ բացակայում է։'
          : 'Տեղի ունեցավ սխալ խնայողության խորհուրդները ստանալիս։ Խնդրում ենք փորձել կրկին։';
      return res.status(502).json({ error: message });
    }
  });

  app.post('/api/notifications/tts', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY-ն կարգավորված չէ սերվերում։',
        fallbackRecommended: true,
      });
    }

    const body = (req.body ?? {}) as TTSRequestBody;
    const text = sanitizeText(body.text, 600);
    if (!text) {
      return res.status(400).json({ error: 'Ձայնային տեքստը դատարկ է։' });
    }

    const requestedVoice =
      typeof body.voiceName === 'string' && VALID_TTS_VOICES.has(body.voiceName)
        ? body.voiceName
        : 'Kore';
    const urgent = Boolean(body.urgent);
    const style = urgent
      ? 'Clear, attentive, polite personal assistant delivering an urgent financial or schedule reminder in Armenian.'
      : 'Warm, clear, calm personal assistant delivering a helpful reminder in Armenian.';

    const cacheKey = `${requestedVoice}:${urgent ? '1' : '0'}:${text}`;
    const now = Date.now();
    // Evict expired cache entries before lookup
    for (const [k, entry] of ttsAudioCache.entries()) {
      if (now - entry.createdAt >= TTS_CACHE_TTL_MS) {
        ttsAudioCache.delete(k);
      }
    }
    const cached = ttsAudioCache.get(cacheKey);
    if (cached && now - cached.createdAt < TTS_CACHE_TTL_MS) {
      ttsAudioCache.delete(cacheKey);
      ttsAudioCache.set(cacheKey, cached);
      return res.json({
        audioBase64: cached.audioBase64,
        mimeType: 'audio/wav',
        voiceName: requestedVoice,
        cached: true,
      });
    }

    try {
      const ai = createGeminiClient(apiKey);

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text,
                speechMetadata: {
                  style,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: requestedVoice },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!base64Audio) {
        return res.status(502).json({
          error: 'Չհաջողվեց ստեղծել ձայնային ծանուցումը։',
          fallbackRecommended: true,
        });
      }

      if (ttsAudioCache.size >= TTS_CACHE_MAX) {
        const oldestKey = ttsAudioCache.keys().next().value;
        if (oldestKey) ttsAudioCache.delete(oldestKey);
      }
      ttsAudioCache.set(cacheKey, { audioBase64: base64Audio, createdAt: Date.now() });

      return res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
        voiceName: requestedVoice,
      });
    } catch (error) {
      console.error('Failed to synthesize notification voice:', error);
      return res.status(502).json({
        error: 'Ձայնային սինթեզը ժամանակավորապես անհասանելի է։',
        fallbackRecommended: true,
      });
    }
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API երթուղին չի գտնվել։' });
  });

  app.use(
    (
      err: unknown,
      _req: Request,
      res: Response,
      next: NextFunction
    ) => {
      if (res.headersSent) return next(err);
      const status =
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        typeof (err as { status?: unknown }).status === 'number'
          ? (err as { status: number }).status
          : 500;
      if (status === 413) {
        return res
          .status(413)
          .json({ error: 'Ուղարկված տվյալների չափը գերազանցում է թույլատրելի սահմանը։' });
      }
      if (err instanceof SyntaxError && status === 400) {
        return res.status(400).json({ error: 'Սխալ JSON հարցման ձևաչափ։' });
      }
      console.error('Unhandled server error:', err);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: 'Ներքին սերվերային սխալ։',
      });
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: disableHmr ? false : { server: httpServer },
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    const indexHtmlPath = path.join(distDir, 'index.html');
    app.use(
      express.static(distDir, {
        maxAge: '7d',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.get('*', (_req: Request, res: Response) => {
      if (!fs.existsSync(indexHtmlPath)) {
        return res.status(503).send('Հավելվածը դեռ հավաքված չէ (npm run build)։');
      }
      res.setHeader('Cache-Control', 'no-cache');
      return res.sendFile(indexHtmlPath);
    });
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, closing server gracefully...`);
    httpServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
