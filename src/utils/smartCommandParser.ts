import { BankCard, NoteChecklistItem, TaskPriority, Transaction } from '../types';
import { getTodayISO } from '../data/defaults';
import { INTERNAL_TRANSFER_CATEGORY } from './cardBalances';
import { predictCategoryFromHistory } from './transactionAutoCategory';

export type SmartParsedAction =
  | {
      kind: 'transaction';
      txType: 'expense' | 'income';
      amount: number;
      title: string;
      category: string;
      date: string;
      cardId?: string;
      cardLabel?: string;
    }
  | {
      kind: 'task';
      title: string;
      date: string;
      dueTime?: string;
      priority: TaskPriority;
    }
  | {
      kind: 'note';
      title: string;
      content: string;
    };

export type Budget503020Bucket = 'needs' | 'wants' | 'savings';

const NEEDS_CATEGORIES = new Set([
  'Սնունդ',
  'Տրանսպորտ',
  'Կոմունալ',
  'Բնակարան',
  'Առողջություն',
  'Կրթություն',
]);

const WANTS_CATEGORIES = new Set(['Գնումներ', 'Ժամանց', 'Այլ']);

export function classify503020Category(category: string): Budget503020Bucket | 'transfer' {
  if (category === INTERNAL_TRANSFER_CATEGORY) return 'transfer';
  if (NEEDS_CATEGORIES.has(category)) return 'needs';
  if (WANTS_CATEGORIES.has(category)) return 'wants';
  return 'wants';
}

const KEYWORD_CATEGORY_RULES: Array<{
  category: string;
  txType?: 'expense' | 'income';
  keywords: string[];
}> = [
  {
    category: 'Սնունդ',
    txType: 'expense',
    keywords: [
      'սուրճ',
      'surj',
      'kofe',
      'coffee',
      'հաց',
      'hac',
      'սնունդ',
      'snund',
      'ճաշ',
      'chash',
      'ընթրիք',
      'նախաճաշ',
      'ռեստորան',
      'սրճարան',
      'պիցցա',
      'շաուրմա',
      'կաթ',
      'պանիր',
      'միս',
      'միրգ',
      'բանջար',
      'շուկա',
      'սուպերմարկետ',
      'yerevan city',
      'sas',
      'parma',
      'պարմա',
      'նոր զովք',
      'zovq',
      'կրպակ',
      'ջուր',
      'թեյ',
    ],
  },
  {
    category: 'Տրանսպորտ',
    txType: 'expense',
    keywords: [
      'տաքսի',
      'taxi',
      'gg',
      'yandex',
      'յանդեքս',
      'բենզին',
      'benzin',
      'գազ',
      'ավտոբուս',
      'մետրո',
      'metro',
      'տրանսպորտ',
      'կայանատեղի',
      'parking',
      'ավտո',
      'լվացում',
      'տեխզննում',
    ],
  },
  {
    category: 'Կոմունալ',
    txType: 'expense',
    keywords: [
      'լույս',
      'luys',
      'էլեկտր',
      'ջուր',
      'գազ',
      'կոմունալ',
      'komunal',
      'ինտերնետ',
      'internet',
      'ucom',
      'vivacell',
      'viva',
      'team',
      'բիլայն',
      'հեռախոս',
      'աղբ',
    ],
  },
  {
    category: 'Բնակարան',
    txType: 'expense',
    keywords: [
      'վարձ',
      'vardz',
      'բնակարան',
      'հիփոթեք',
      'վերանորոգ',
      'կահույք',
      'մաքրություն',
    ],
  },
  {
    category: 'Առողջություն',
    txType: 'expense',
    keywords: [
      'դեղատուն',
      'dexatun',
      'դեղ',
      'բժիշկ',
      'bjishk',
      'կլինիկա',
      'ատամնաբույժ',
      'անալիզ',
      'վիտամին',
      'առողջ',
      'սպորտ',
      'ֆիթնես',
      'gym',
    ],
  },
  {
    category: 'Գնումներ',
    txType: 'expense',
    keywords: [
      'հագուստ',
      'hagust',
      'կոշիկ',
      'koshik',
      'գնում',
      'gnum',
      'նվեր',
      'wildberries',
      'ozon',
      'amazon',
      'temu',
      'տեխնիկա',
      'խանութ',
      'կոսմետիկ',
      'օծանելիք',
    ],
  },
  {
    category: 'Ժամանց',
    txType: 'expense',
    keywords: [
      'կինո',
      'kino',
      'թատրոն',
      'համերգ',
      'ժամանց',
      'խաղ',
      'steam',
      'playstation',
      'netflix',
      'spotify',
      'youtube',
      'բար',
      'հանգիստ',
      'զբոսանք',
    ],
  },
  {
    category: 'Կրթություն',
    txType: 'expense',
    keywords: [
      'դասընթաց',
      'das',
      'կրթություն',
      'գիրք',
      'girq',
      'ուսում',
      'ուսման',
      'քոլեջ',
      'համալսարան',
      'թրեյնինգ',
      'սեմինար',
    ],
  },
  {
    category: 'Աշխատավարձ',
    txType: 'income',
    keywords: ['աշխատավարձ', 'ashxatavardz', 'salary', 'ավանս', 'avans'],
  },
  {
    category: 'Բոնուս',
    txType: 'income',
    keywords: ['բոնուս', 'bonus', 'պարգև', 'թեյավճար'],
  },
  {
    category: 'Ֆրիլանս',
    txType: 'income',
    keywords: ['ֆրիլանս', 'freelance', 'պատվեր', 'նախագիծ', 'ծրագիր'],
  },
  {
    category: 'Ներդրումներ',
    txType: 'income',
    keywords: ['տոկոս', 'դիվիդենտ', 'ավանդ', 'ներդրում', 'crypto', 'բաժնետոմս'],
  },
  {
    category: 'Նվեր',
    txType: 'income',
    keywords: ['նվեր', 'nver', 'շնորհավոր', 'վերադարձ', 'քեշբեք', 'cashback'],
  },
];

function addDaysISO(baseISO: string, deltaDays: number): string {
  const [y, m, d] = baseISO.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripToken(text: string, regex: RegExp): string {
  return text.replace(regex, ' ').replace(/\s+/g, ' ').trim();
}

export function parseSmartCommand(
  rawInput: string,
  transactions: Transaction[] = [],
  cards: BankCard[] = []
): SmartParsedAction | null {
  const trimmed = rawInput.trim();
  if (trimmed.length < 2) return null;

  const todayISO = getTodayISO();
  let working = trimmed;

  // Determine date modifier
  let date = todayISO;
  if (/(^|\s)(վաղը|vaxy|vaghy|tomorrow)(\s|$)/i.test(working)) {
    date = addDaysISO(todayISO, 1);
    working = stripToken(working, /(^|\s)(վաղը|vaxy|vaghy|tomorrow)(?=\s|$)/gi);
  } else if (/(^|\s)(երեկ|erek|yesterday)(\s|$)/i.test(working)) {
    date = addDaysISO(todayISO, -1);
    working = stripToken(working, /(^|\s)(երեկ|erek|yesterday)(?=\s|$)/gi);
  } else if (/(^|\s)(այսօր|aysor|today)(\s|$)/i.test(working)) {
    date = todayISO;
    working = stripToken(working, /(^|\s)(այսօր|aysor|today)(?=\s|$)/gi);
  }

  // Check explicit Task prefix
  const taskPrefixMatch = working.match(
    /^(?:անելիք|գործ|հիշեցում|task|todo)\s*[:\-]?\s+(.+)$/i
  );
  if (taskPrefixMatch) {
    let body = taskPrefixMatch[1].trim();
    let priority: TaskPriority = 'medium';
    if (/!{2,}|կարևոր|շտապ/i.test(body)) {
      priority = 'high';
      body = stripToken(body, /!+|(^|\s)(կարևոր|շտապ)(?=\s|$)/gi);
    } else if (/!(?=\s|$)/.test(body)) {
      priority = 'high';
      body = stripToken(body, /!/g);
    }
    let dueTime: string | undefined;
    const timeMatch = body.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (timeMatch) {
      dueTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
      body = stripToken(body, /\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    }
    if (!body) return null;
    return {
      kind: 'task',
      title: body.charAt(0).toUpperCase() + body.slice(1),
      date,
      dueTime,
      priority,
    };
  }

  // Check explicit Note prefix
  const notePrefixMatch = working.match(
    /^(?:նշում|միտք|note)\s*[:\-]?\s+(.+)$/i
  );
  if (notePrefixMatch) {
    const body = notePrefixMatch[1].trim();
    if (!body) return null;
    const firstSpaceBreak = body.indexOf(' - ');
    const title =
      firstSpaceBreak > 0
        ? body.slice(0, firstSpaceBreak).trim()
        : body.slice(0, 48).trim();
    const content =
      firstSpaceBreak > 0 ? body.slice(firstSpaceBreak + 3).trim() : body;
    return {
      kind: 'note',
      title: title.charAt(0).toUpperCase() + title.slice(1),
      content,
    };
  }

  // Check Transaction pattern (contains an amount + word)
  // Supports "+50000 բոնուս", "սուրճ 1500", "1.5k կոֆե", "1500֏ սուրճ"
  let explicitSign: 'income' | 'expense' | null = null;
  if (/^\s*\+/.test(working) || /(^|\s)(եկամուտ|ekamut|ստացա|գումար\s*եկավ)(\s|$)/i.test(working)) {
    explicitSign = 'income';
    working = working.replace(/^\s*\+\s*/, '').trim();
    working = stripToken(working, /(^|\s)(եկամուտ|ekamut)(?=\s|$)/gi);
  } else if (/^\s*-/.test(working) || /(^|\s)(ծախս|caxs)(\s|$)/i.test(working)) {
    explicitSign = 'expense';
    working = working.replace(/^\s*-\s*/, '').trim();
    working = stripToken(working, /(^|\s)(ծախս|caxs)(?=\s|$)/gi);
  }

  // Extract amount token (skip times like 16:30 or dates like 2026-11-25)
  const amountRegex = /(?:^|\s)(\d[\d\s.,]{0,10}(?:[kկ])?)(?:\s*(?:֏|դրամ|դր|amd))?(?=\s|$)/gi;
  let matchedAmountStr = '';
  let parsedAmount = 0;

  for (const match of working.matchAll(amountRegex)) {
    const rawNum = match[1].trim();
    if (!rawNum) continue;
    const isK = /[kկ]$/i.test(rawNum);
    const cleaned = rawNum.replace(/[kկ\s]/gi, '').replace(/,/g, '.');
    const numeric = Number(cleaned);
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    const finalNum = Math.round(isK ? numeric * 1000 : numeric);
    // Avoid picking tiny single numbers unless > 10 or user wrote k/֏
    if (finalNum >= 10 && finalNum <= 100_000_000) {
      matchedAmountStr = match[0];
      parsedAmount = finalNum;
      break;
    }
  }

  if (parsedAmount > 0 && matchedAmountStr) {
    let titleRemainder = working.replace(matchedAmountStr, ' ').replace(/\s+/g, ' ').trim();

    // Match optional bank card / cash mention at end or inside phrase
    let matchedCard: BankCard | undefined;
    const lowerRemainder = titleRemainder.toLowerCase();

    for (const card of cards) {
      const cardNameLower = card.name.toLowerCase();
      const firstWord = cardNameLower.split(/\s+/)[0] || '';
      if (
        (card.last4 && lowerRemainder.includes(card.last4.toLowerCase())) ||
        lowerRemainder.includes(cardNameLower) ||
        (firstWord.length >= 3 &&
          new RegExp(`(^|\\s)${escapeRegExp(firstWord)}(\\s|$)`, 'i').test(lowerRemainder))
      ) {
        matchedCard = card;
        if (card.last4 && lowerRemainder.includes(card.last4.toLowerCase())) {
          titleRemainder = stripToken(titleRemainder, new RegExp(escapeRegExp(card.last4), 'gi'));
        } else if (lowerRemainder.includes(cardNameLower)) {
          titleRemainder = stripToken(titleRemainder, new RegExp(escapeRegExp(card.name), 'gi'));
        }
        break;
      }
    }

    if (!matchedCard && cards.length > 0) {
      if (/(^|\s)(կանխիկ|kanxik|cash)(\s|$)/i.test(lowerRemainder)) {
        matchedCard = cards.find((c) => c.cardType === 'cash');
        titleRemainder = stripToken(titleRemainder, /(^|\s)(կանխիկ|kanxik|cash)(?=\s|$)/gi);
      } else if (/(^|\s)(visa|վիզա)(\s|$)/i.test(lowerRemainder)) {
        matchedCard = cards.find((c) => c.cardType === 'visa');
      } else if (/(^|\s)(arca|արքա)(\s|$)/i.test(lowerRemainder)) {
        matchedCard = cards.find((c) => c.cardType === 'arca');
      } else if (/(^|\s)(master|մաստեր)(\s|$)/i.test(lowerRemainder)) {
        matchedCard = cards.find((c) => c.cardType === 'mastercard');
      } else {
        matchedCard = cards.find((c) => c.isDefault) || cards[0];
      }
    }

    const cleanedTitleRaw = titleRemainder.trim();
    const fallbackTitle =
      explicitSign === 'income' ? 'Եկամուտ' : 'Արագ ծախս';
    const titleBase = cleanedTitleRaw || fallbackTitle;
    const formattedTitle =
      titleBase.charAt(0).toUpperCase() + titleBase.slice(1);

    // Infer type and category from keywords + user transaction history
    let inferredType: 'income' | 'expense' = explicitSign ?? 'expense';
    let inferredCategory = inferredType === 'income' ? 'Այլ' : 'Այլ';

    const titleLower = titleBase.toLowerCase();
    for (const rule of KEYWORD_CATEGORY_RULES) {
      if (explicitSign && rule.txType && rule.txType !== explicitSign) continue;
      if (rule.keywords.some((kw) => titleLower.includes(kw))) {
        inferredCategory = rule.category;
        if (!explicitSign && rule.txType) {
          inferredType = rule.txType;
        }
        break;
      }
    }

    if (inferredCategory === 'Այլ' && transactions.length > 0) {
      const historyPred = predictCategoryFromHistory(
        titleBase,
        inferredType,
        transactions,
        { ignoreCategory: 'Այլ' }
      );
      if (historyPred) {
        inferredCategory = historyPred.category;
      }
    }

    return {
      kind: 'transaction',
      txType: inferredType,
      amount: parsedAmount,
      title: formattedTitle,
      category: inferredCategory,
      date,
      cardId: matchedCard?.id,
      cardLabel: matchedCard?.name,
    };
  }

  return null;
}

export function extractChecklistAmounts(items?: NoteChecklistItem[]): {
  totalEstimated: number;
  uncheckedEstimated: number;
  matchedCount: number;
} {
  if (!items || items.length === 0) {
    return { totalEstimated: 0, uncheckedEstimated: 0, matchedCount: 0 };
  }

  let totalEstimated = 0;
  let uncheckedEstimated = 0;
  let matchedCount = 0;

  for (const item of items) {
    // Match explicit currency/trailing numbers (e.g. "Կաթ 900", "Հաց - 450 ֏", "Պանիր 1800դր")
    const matches = item.text.match(
      /(?:^|\s|[-–:])(\d[\d\s]{1,7})\s*(?:֏|դրամ|դր|amd)?\s*$/i
    );
    if (!matches) continue;
    const numeric = Number(matches[1].replace(/\s+/g, ''));
    if (Number.isFinite(numeric) && numeric >= 50 && numeric <= 50_000_000) {
      matchedCount += 1;
      totalEstimated += numeric;
      if (!item.done) {
        uncheckedEstimated += numeric;
      }
    }
  }

  return { totalEstimated, uncheckedEstimated, matchedCount };
}
