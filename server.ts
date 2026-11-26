import 'dotenv/config';
import express, { type Request, type Response } from 'express';
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
const VALID_ACTION_KINDS = new Set(['add_transaction', 'add_task', 'add_note', 'navigate']);
const VALID_PARSE_KINDS = new Set(['transaction', 'task', 'note']);

interface TTSRequestBody {
  text?: unknown;
  voiceName?: unknown;
  urgent?: unknown;
}

const ttsAudioCache = new Map<string, string>();
const TTS_CACHE_MAX = 40;

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

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '6mb' }));

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
    const contextJson = JSON.stringify(rawCtx).slice(0, 6500);

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
- Հիմնվիր բացառապես տրամադրված իրական JSON տվյալների վրա (բալանս, եկամուտ, ծախս, բյուջեի կանխատեսում, անելիքներ, սովորություններ, նպատակներ, պարտքեր)։ Մի հորինիր թվեր։
- Պատասխանը պահիր հստակ, գործնական և կարճ (3-6 նախադասություն կամ հստակ կետեր)։
- Եթե օգտատիրոջ հարցից բխում է կոնկրետ գործողություն (գրանցել գործարք, ավելացնել անելիք, ստեղծել նշում, կամ բացել համապատասխան էջը՝ 'budgets', 'analytics', 'bills', 'goals', 'debts', 'tasks', 'habits', 'focus', 'notes'), վերադարձրու նաև suggestedActions զանգվածը (առավելագույնը 3 գործողություն)։`,
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
                        'One of: add_transaction, add_task, add_note, navigate',
                    },
                    label: {
                      type: Type.STRING,
                      description: 'Short clickable button label in Armenian/user language',
                    },
                    txType: { type: Type.STRING },
                    amount: { type: Type.NUMBER },
                    title: { type: Type.STRING },
                    category: { type: Type.STRING },
                    priority: { type: Type.STRING },
                    dueTime: { type: Type.STRING },
                    content: { type: Type.STRING },
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
      const actions = rawActions
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const kind = typeof item.kind === 'string' && VALID_ACTION_KINDS.has(item.kind)
            ? item.kind
            : null;
          const label = sanitizeText(item.label, 80);
          if (!kind || !label) return null;

          if (kind === 'navigate') {
            const route = typeof item.route === 'string' && VALID_ASSISTANT_ROUTES.has(item.route)
              ? item.route
              : null;
            if (!route) return null;
            return { kind, label, route };
          }

          if (kind === 'add_transaction') {
            const txType = item.txType === 'income' ? 'income' : 'expense';
            const amount = toSafeNumber(item.amount, 0);
            if (amount <= 0) return null;
            const validCats =
              txType === 'income'
                ? (INCOME_CATEGORY_LIST as readonly string[])
                : (EXPENSE_CATEGORY_LIST as readonly string[]);
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

          return {
            kind,
            label,
            title: sanitizeText(item.title, 120) || label,
            content: sanitizeMultilineText(item.content, 1000) || label,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .slice(0, 3);

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
- հակիրճ ապրանքների ամփոփում (մինչև 100 նիշ)։`,
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

      return res.json({
        amount: safeAmount,
        title: sanitizeText(parsed.title, 80) || 'Կտրոնի գնում',
        category: safeCategory,
        date: safeDate,
        itemsSummary: sanitizeText(parsed.itemsSummary, 140),
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
    const text = sanitizeText(body.text, 320);
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
    const cached = ttsAudioCache.get(cacheKey);
    if (cached) {
      ttsAudioCache.delete(cacheKey);
      ttsAudioCache.set(cacheKey, cached);
      return res.json({
        audioBase64: cached,
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
      ttsAudioCache.set(cacheKey, base64Audio);

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
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
