import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

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

function sanitizeText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function toSafeNumber(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.round(value);
}

function isSafeHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '64kb' }));

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
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

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

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
