import { BudgetLimit, Currency, IncomeKind, Transaction } from '../types';
import {
  INCOME_KIND_LABELS,
  formatMoney,
  formatShortDate,
  getTodayISO,
  getTransactionIncomeKind,
} from '../data/defaults';
import {
  formatCycleLabel,
  getCycleBounds,
  isDateInCycle,
} from './financialCycle';

export interface MonthlySummaryReportInput {
  selectedMonth: string;
  payday?: number;
  currency: Currency;
  transactions: Transaction[];
  budgets: BudgetLimit[];
  dailyBurnRate: number;
  projectedMonthlyExpense: number;
  elapsedDays: number;
  daysInSelectedMonth: number;
  isCurrentMonth: boolean;
}

export interface CategoryStat {
  category: string;
  amount: number;
  count: number;
  pct: number;
  budgetLimit?: number;
  budgetPct?: number;
}

export interface IncomeKindStat {
  id: IncomeKind;
  label: string;
  amount: number;
  count: number;
  pct: number;
}

export interface MonthlySummaryStats {
  selectedMonth: string;
  payday: number;
  cycleRangeText: string;
  monthLabel: string;
  currency: Currency;
  generatedAt: string;
  openingBalance: number;
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  realBalance: number;
  savingsPct: number | null;
  incomeCount: number;
  expenseCount: number;
  incomeByKind: IncomeKindStat[];
  incomeByCategory: CategoryStat[];
  expenseByCategory: CategoryStat[];
  sortedTransactions: Transaction[];
  dailyBurnRate: number;
  projectedMonthlyExpense: number;
  elapsedDays: number;
  daysInSelectedMonth: number;
  isCurrentMonth: boolean;
}

export function buildMonthlySummaryStats(
  input: MonthlySummaryReportInput
): MonthlySummaryStats {
  const payday = input.payday ?? 1;
  const bounds = getCycleBounds(input.selectedMonth, payday);
  const monthTxs = input.transactions.filter((t) =>
    isDateInCycle(t.date, input.selectedMonth, payday)
  );
  const openingBalance = input.transactions
    .filter((t) => t.date < bounds.startDate)
    .reduce((s, t) => s + (t.type === 'income' ? t.amount : (t.isPending ? 0 : -t.amount)), 0);

  const incomeTxs = monthTxs.filter((t) => t.type === 'income');
  const expenseTxs = monthTxs.filter((t) => t.type === 'expense' && !t.isPending);

  const totalIncome = incomeTxs.reduce((s, t) => s + t.amount, 0);
  const totalExpense = expenseTxs.reduce((s, t) => s + t.amount, 0);
  const netSavings = totalIncome - totalExpense;
  const realBalance = openingBalance + netSavings;
  const savingsPct =
    totalIncome > 0
      ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100)
      : null;

  const kinds: IncomeKind[] = ['monthly', 'extra', 'one_time'];
  const incomeByKind: IncomeKindStat[] = kinds.map((id) => {
    const matching = incomeTxs.filter((t) => getTransactionIncomeKind(t) === id);
    const amount = matching.reduce((s, t) => s + t.amount, 0);
    return {
      id,
      label: INCOME_KIND_LABELS[id],
      amount,
      count: matching.length,
      pct: totalIncome > 0 ? Math.round((amount / totalIncome) * 100) : 0,
    };
  });

  const incomeCatMap = incomeTxs.reduce<
    Record<string, { amount: number; count: number }>
  >((acc, t) => {
    const prev = acc[t.category] ?? { amount: 0, count: 0 };
    acc[t.category] = {
      amount: prev.amount + t.amount,
      count: prev.count + 1,
    };
    return acc;
  }, {});

  const incomeByCategory: CategoryStat[] = Object.entries(incomeCatMap)
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([category, info]) => ({
      category,
      amount: info.amount,
      count: info.count,
      pct: totalIncome > 0 ? Math.round((info.amount / totalIncome) * 100) : 0,
    }));

  const expenseCatMap = expenseTxs.reduce<
    Record<string, { amount: number; count: number }>
  >((acc, t) => {
    const prev = acc[t.category] ?? { amount: 0, count: 0 };
    acc[t.category] = {
      amount: prev.amount + t.amount,
      count: prev.count + 1,
    };
    return acc;
  }, {});

  const expenseByCategory: CategoryStat[] = Object.entries(expenseCatMap)
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([category, info]) => {
      const budget = input.budgets.find((b) => b.category === category);
      return {
        category,
        amount: info.amount,
        count: info.count,
        pct: totalExpense > 0 ? Math.round((info.amount / totalExpense) * 100) : 0,
        budgetLimit: budget?.limit,
        budgetPct:
          budget && budget.limit > 0
            ? Math.round((info.amount / budget.limit) * 100)
            : undefined,
      };
    });

  // Also include budgeted categories that had 0 spending this month
  for (const b of input.budgets) {
    if (!expenseCatMap[b.category]) {
      expenseByCategory.push({
        category: b.category,
        amount: 0,
        count: 0,
        pct: 0,
        budgetLimit: b.limit,
        budgetPct: 0,
      });
    }
  }

  const sortedTransactions = [...monthTxs].sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  return {
    selectedMonth: input.selectedMonth,
    payday,
    cycleRangeText: `${bounds.startDate} – ${bounds.endDate}`,
    monthLabel: formatCycleLabel(input.selectedMonth, payday),
    currency: input.currency,
    generatedAt: getTodayISO(),
    openingBalance,
    totalIncome,
    totalExpense,
    netSavings,
    realBalance,
    savingsPct,
    incomeCount: incomeTxs.length,
    expenseCount: expenseTxs.length,
    incomeByKind,
    incomeByCategory,
    expenseByCategory,
    sortedTransactions,
    dailyBurnRate: input.dailyBurnRate,
    projectedMonthlyExpense: input.projectedMonthlyExpense,
    elapsedDays: input.elapsedDays,
    daysInSelectedMonth: input.daysInSelectedMonth,
    isCurrentMonth: input.isCurrentMonth,
  };
}

export function generateMonthlySummaryText(stats: MonthlySummaryStats): string {
  const { currency } = stats;
  const hr = '────────────────────────────────────────────────────────';
  const lines: string[] = [
    'ԱՆՁՆԱԿԱՆ ՕԳՆԱԿԱՆ · ԱՄՍԱԿԱՆ ՖԻՆԱՆՍԱԿԱՆ ԱՄՓՈՓՈՒՄ',
    `Ժամանակահատված՝ ${stats.monthLabel} (${stats.cycleRangeText})`,
    `Արժույթ՝ ՀՀ դրամ (֏) · Կազմված է՝ ${stats.generatedAt}`,
    hr,
    '',
    '1. ԸՆԴՀԱՆՈՒՐ ԱՄՓՈՓՈՒՄ',
    `   • Նախորդ մնացորդ (ցիկլի սկիզբ)՝ ${stats.openingBalance > 0 ? '+' : ''}${formatMoney(stats.openingBalance, currency)}`,
    `   • Ընդհանուր եկամուտ (${stats.incomeCount} մուտք)՝ +${formatMoney(stats.totalIncome, currency)}`,
    `   • Ընդհանուր ծախս (${stats.expenseCount} ելք)՝ -${formatMoney(stats.totalExpense, currency)}`,
    `   • Ամսվա զուտ տարբերություն՝ ${stats.netSavings > 0 ? '+' : ''}${formatMoney(stats.netSavings, currency)}`,
    `   • Իրական բալանս (նախորդ մնացորդ + զուտ)՝ ${stats.realBalance > 0 ? '+' : ''}${formatMoney(stats.realBalance, currency)}`,
    stats.savingsPct !== null
      ? stats.netSavings >= 0
        ? `   • Խնայողության մակարդակ՝ ${stats.savingsPct}%`
        : `   • Գերծախսի մակարդակ՝ ${Math.abs(stats.savingsPct)}%`
      : '   • Խնայողության մակարդակ՝ —',
  ];

  if (stats.isCurrentMonth) {
    lines.push(
      `   • Օրական ծախսային տեմպ (${stats.elapsedDays}/${stats.daysInSelectedMonth} օր)՝ ${formatMoney(Math.round(stats.dailyBurnRate), currency)}/օր`
    );
    lines.push(
      `   • Կանխատեսվող ամսավերջի ծախս՝ ${formatMoney(stats.projectedMonthlyExpense, currency)}`
    );
  }

  lines.push('', hr, '2. ԵԿԱՄՈՒՏՆԵՐԻ ՎԻՃԱԿԱԳՐՈՒԹՅՈՒՆ', '');
  lines.push('   Ըստ եկամտի տեսակի․');
  for (const kind of stats.incomeByKind) {
    lines.push(
      `   • ${kind.label} (${kind.count} գործարք)՝ ${formatMoney(kind.amount, currency)} (${kind.pct}%)`
    );
  }

  lines.push('', '   Ըստ կատեգորիայի․');
  if (stats.incomeByCategory.length === 0) {
    lines.push('   • Գրանցված եկամուտներ չկան։');
  } else {
    for (const cat of stats.incomeByCategory) {
      lines.push(
        `   • ${cat.category} (${cat.count} գործարք)՝ +${formatMoney(cat.amount, currency)} (${cat.pct}%)`
      );
    }
  }

  lines.push('', hr, '3. ԾԱԽՍԵՐԻ ԿԱՏԵԳՈՐԻԱՆԵՐԻ ՎԻՃԱԿԱԳՐՈՒԹՅՈՒՆ', '');
  if (stats.expenseByCategory.length === 0) {
    lines.push('   • Գրանցված ծախսեր չկան։');
  } else {
    for (const cat of stats.expenseByCategory) {
      const budgetNote =
        cat.budgetLimit !== undefined
          ? ` | Բյուջե՝ ${formatMoney(cat.budgetLimit, currency)} (${cat.budgetPct ?? 0}%)`
          : '';
      lines.push(
        `   • ${cat.category} (${cat.count} գործարք)՝ -${formatMoney(cat.amount, currency)} (${cat.pct}%)${budgetNote}`
      );
    }
  }

  lines.push('', hr, `4. ԱՄՍՎԱ ԳՈՐԾԱՐՔՆԵՐ (${stats.sortedTransactions.length})`, '');
  if (stats.sortedTransactions.length === 0) {
    lines.push('   • Գրանցված գործարքներ չկան։');
  } else {
    for (const tx of stats.sortedTransactions) {
      const typeLabel =
        tx.type === 'income'
          ? `${INCOME_KIND_LABELS[getTransactionIncomeKind(tx)]} եկամուտ`
          : 'Ծախս';
      const sign = tx.type === 'income' ? '+' : '-';
      lines.push(
        `   ${tx.date} | ${typeLabel} | ${tx.category} | ${tx.title} | ${sign}${formatMoney(tx.amount, currency)}`
      );
    }
  }

  lines.push('', hr);
  return lines.join('\n');
}

export function downloadMonthlySummaryText(stats: MonthlySummaryStats): void {
  const content = '\uFEFF' + generateMonthlySummaryText(stats);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `monthly-summary-${stats.selectedMonth}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(trimmed + '…').width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

export async function downloadMonthlySummaryPDF(
  stats: MonthlySummaryStats
): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Proceed with fallback fonts
    }
  }

  const PAGE_W = 1240; // ~150 DPI A4 portrait
  const PAGE_H = 1754;
  const MARGIN = 72;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const BOTTOM_LIMIT = PAGE_H - 88;
  const FONT_SANS =
    '"Noto Sans Armenian", "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif';
  const FONT_MONO =
    '"JetBrains Mono", "Noto Sans Armenian", ui-monospace, monospace';

  const pages: HTMLCanvasElement[] = [];
  let pageNum = 0;

  const createPage = (isContinuation = false) => {
    pageNum += 1;
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    // Top accent bar
    ctx.fillStyle = '#2563EB';
    ctx.fillRect(0, 0, PAGE_W, 10);

    // Page footer
    ctx.fillStyle = '#94A3B8';
    ctx.font = `500 18px ${FONT_SANS}`;
    ctx.textAlign = 'left';
    ctx.fillText(
      `Անձնական Օգնական · ${stats.monthLabel}`,
      MARGIN,
      PAGE_H - 36
    );
    ctx.textAlign = 'right';
    ctx.fillText(`Էջ ${pageNum}`, PAGE_W - MARGIN, PAGE_H - 36);
    ctx.textAlign = 'left';

    pages.push(canvas);

    if (isContinuation) {
      ctx.fillStyle = '#64748B';
      ctx.font = `600 20px ${FONT_SANS}`;
      ctx.fillText(
        `Ամսական ամփոփում (${stats.monthLabel}) — շարունակություն`,
        MARGIN,
        72
      );
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(MARGIN, 92);
      ctx.lineTo(PAGE_W - MARGIN, 92);
      ctx.stroke();
      return { ctx, y: 124 };
    }

    return { ctx, y: 68 };
  };

  let { ctx, y } = createPage(false);

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > BOTTOM_LIMIT) {
      const next = createPage(true);
      ctx = next.ctx;
      y = next.y;
    }
  };

  const drawSectionTitle = (title: string, subtitle?: string) => {
    ensureSpace(64);
    ctx.fillStyle = '#0F172A';
    ctx.font = `700 26px ${FONT_SANS}`;
    ctx.textAlign = 'left';
    ctx.fillText(title, MARGIN, y);
    if (subtitle) {
      ctx.fillStyle = '#64748B';
      ctx.font = `500 19px ${FONT_SANS}`;
      ctx.textAlign = 'right';
      ctx.fillText(subtitle, PAGE_W - MARGIN, y);
      ctx.textAlign = 'left';
    }
    y += 16;
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(PAGE_W - MARGIN, y);
    ctx.stroke();
    y += 26;
  };

  // Report Header
  ctx.fillStyle = '#2563EB';
  ctx.font = `700 19px ${FONT_SANS}`;
  ctx.fillText('ԱՆՁՆԱԿԱՆ ՕԳՆԱԿԱՆ · ԱՄՍԱԿԱՆ ՀԱՇՎԵՏՎՈՒԹՅՈՒՆ', MARGIN, y);
  y += 42;

  ctx.fillStyle = '#0F172A';
  ctx.font = `700 40px ${FONT_SANS}`;
  ctx.fillText(`Ամսական ամփոփում · ${stats.monthLabel}`, MARGIN, y);
  y += 32;

  ctx.fillStyle = '#64748B';
  ctx.font = `500 20px ${FONT_SANS}`;
  ctx.fillText(
    `Արժույթ՝ ՀՀ դրամ (֏)   ·   Կազմված է՝ ${stats.generatedAt}   ·   Գործարքներ՝ ${stats.sortedTransactions.length}`,
    MARGIN,
    y
  );
  y += 36;

  // 3 KPI Summary Cards
  const cardGap = 20;
  const cardW = (CONTENT_W - cardGap * 2) / 3;
  const cardH = 136;

  const kpis = [
    {
      label: 'Ընդհանուր եկամուտ',
      value: `+${formatMoney(stats.totalIncome, stats.currency)}`,
      sub: `${stats.incomeCount} մուտք · Նախ. մնացորդ՝ ${formatMoney(stats.openingBalance, stats.currency)}`,
      valueColor: '#059669',
      bgColor: '#F8FAFC',
    },
    {
      label: 'Ընդհանուր ծախս',
      value: `-${formatMoney(stats.totalExpense, stats.currency)}`,
      sub: `${stats.expenseCount} ելք`,
      valueColor: '#E11D48',
      bgColor: '#F8FAFC',
    },
    {
      label: 'Իրական բալանս',
      value: `${stats.realBalance > 0 ? '+' : ''}${formatMoney(stats.realBalance, stats.currency)}`,
      sub:
        stats.savingsPct !== null
          ? `Զուտ՝ ${stats.netSavings > 0 ? '+' : ''}${formatMoney(stats.netSavings, stats.currency)} (${stats.savingsPct}%)`
          : `Զուտ՝ ${formatMoney(stats.netSavings, stats.currency)}`,
      valueColor: stats.realBalance >= 0 ? '#0F172A' : '#E11D48',
      bgColor: '#EFF6FF',
    },
  ];

  kpis.forEach((kpi, idx) => {
    const cx = MARGIN + idx * (cardW + cardGap);
    drawRoundedRect(ctx, cx, y, cardW, cardH, 16);
    ctx.fillStyle = kpi.bgColor;
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#64748B';
    ctx.font = `600 18px ${FONT_SANS}`;
    ctx.fillText(kpi.label, cx + 22, y + 36);

    ctx.fillStyle = kpi.valueColor;
    ctx.font = `700 28px ${FONT_MONO}`;
    ctx.fillText(fitText(ctx, kpi.value, cardW - 44), cx + 22, y + 78);

    ctx.fillStyle = '#64748B';
    ctx.font = `500 17px ${FONT_SANS}`;
    ctx.fillText(fitText(ctx, kpi.sub, cardW - 44), cx + 22, y + 112);
  });
  y += cardH + 24;

  // Projected Spending strip when current month
  if (stats.isCurrentMonth && stats.projectedMonthlyExpense > 0) {
    ensureSpace(74);
    drawRoundedRect(ctx, MARGIN, y, CONTENT_W, 56, 12);
    ctx.fillStyle = '#F8FAFC';
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#475569';
    ctx.font = `600 19px ${FONT_SANS}`;
    ctx.fillText(
      `Օրական տեմպ (${stats.elapsedDays}/${stats.daysInSelectedMonth} օր)՝ ${formatMoney(Math.round(stats.dailyBurnRate), stats.currency)}/օր`,
      MARGIN + 20,
      y + 35
    );
    ctx.textAlign = 'right';
    ctx.fillStyle = '#2563EB';
    ctx.font = `700 19px ${FONT_SANS}`;
    ctx.fillText(
      `Կանխատեսվող ամսավերջի ծախս՝ ${formatMoney(stats.projectedMonthlyExpense, stats.currency)}`,
      PAGE_W - MARGIN - 20,
      y + 35
    );
    ctx.textAlign = 'left';
    y += 78;
  } else {
    y += 16;
  }

  // Section 2: Income Statistics (By Kind & By Category)
  drawSectionTitle(
    'Եկամուտների վիճակագրություն',
    `Ընդամենը՝ +${formatMoney(stats.totalIncome, stats.currency)}`
  );

  // Income by Kind 3-column mini cards
  ensureSpace(108);
  const kindCardW = (CONTENT_W - cardGap * 2) / 3;
  stats.incomeByKind.forEach((k, idx) => {
    const cx = MARGIN + idx * (kindCardW + cardGap);
    drawRoundedRect(ctx, cx, y, kindCardW, 88, 12);
    ctx.fillStyle = '#F8FAFC';
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#475569';
    ctx.font = `600 18px ${FONT_SANS}`;
    ctx.fillText(k.label, cx + 18, y + 32);

    ctx.fillStyle = '#0F172A';
    ctx.font = `700 22px ${FONT_MONO}`;
    ctx.fillText(
      fitText(ctx, formatMoney(k.amount, stats.currency), kindCardW - 36),
      cx + 18,
      y + 66
    );

    ctx.textAlign = 'right';
    ctx.fillStyle = '#64748B';
    ctx.font = `600 18px ${FONT_MONO}`;
    ctx.fillText(`${k.pct}%`, cx + kindCardW - 18, y + 32);
    ctx.textAlign = 'left';
  });
  y += 112;

  // Income Categories Table
  if (stats.incomeByCategory.length === 0) {
    ensureSpace(44);
    ctx.fillStyle = '#64748B';
    ctx.font = `500 20px ${FONT_SANS}`;
    ctx.fillText('Այս ամսում գրանցված եկամուտներ չկան։', MARGIN, y + 10);
    y += 42;
  } else {
    ensureSpace(46);
    ctx.fillStyle = '#64748B';
    ctx.font = `700 18px ${FONT_SANS}`;
    ctx.fillText('Եկամտի կատեգորիա', MARGIN + 12, y);
    ctx.textAlign = 'center';
    ctx.fillText('Քանակ', MARGIN + CONTENT_W * 0.52, y);
    ctx.fillText('Մասնաբաժին', MARGIN + CONTENT_W * 0.70, y);
    ctx.textAlign = 'right';
    ctx.fillText('Գումար', PAGE_W - MARGIN - 12, y);
    ctx.textAlign = 'left';
    y += 14;

    stats.incomeByCategory.forEach((cat, idx) => {
      ensureSpace(46);
      if (idx % 2 === 0) {
        ctx.fillStyle = '#F8FAFC';
        drawRoundedRect(ctx, MARGIN, y, CONTENT_W, 40, 8);
        ctx.fill();
      }
      const textY = y + 26;
      ctx.fillStyle = '#0F172A';
      ctx.font = `600 19px ${FONT_SANS}`;
      ctx.fillText(fitText(ctx, cat.category, CONTENT_W * 0.42), MARGIN + 12, textY);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#475569';
      ctx.font = `500 19px ${FONT_MONO}`;
      ctx.fillText(String(cat.count), MARGIN + CONTENT_W * 0.52, textY);
      ctx.fillText(`${cat.pct}%`, MARGIN + CONTENT_W * 0.70, textY);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#059669';
      ctx.font = `700 19px ${FONT_MONO}`;
      ctx.fillText(
        `+${formatMoney(cat.amount, stats.currency)}`,
        PAGE_W - MARGIN - 12,
        textY
      );
      ctx.textAlign = 'left';
      y += 44;
    });
    y += 18;
  }

  // Section 3: Expense Categories Statistics
  drawSectionTitle(
    'Ծախսերի կատեգորիաների վիճակագրություն',
    `Ընդամենը՝ -${formatMoney(stats.totalExpense, stats.currency)}`
  );

  if (stats.expenseByCategory.length === 0) {
    ensureSpace(44);
    ctx.fillStyle = '#64748B';
    ctx.font = `500 20px ${FONT_SANS}`;
    ctx.fillText('Այս ամսում գրանցված ծախսեր չկան։', MARGIN, y + 10);
    y += 42;
  } else {
    ensureSpace(46);
    ctx.fillStyle = '#64748B';
    ctx.font = `700 18px ${FONT_SANS}`;
    ctx.fillText('Կատեգորիա', MARGIN + 12, y);
    ctx.textAlign = 'center';
    ctx.fillText('Քանակ', MARGIN + CONTENT_W * 0.40, y);
    ctx.fillText('Մասնաբաժին', MARGIN + CONTENT_W * 0.54, y);
    ctx.fillText('Բյուջե', MARGIN + CONTENT_W * 0.74, y);
    ctx.textAlign = 'right';
    ctx.fillText('Ծախսված', PAGE_W - MARGIN - 12, y);
    ctx.textAlign = 'left';
    y += 14;

    stats.expenseByCategory.forEach((cat, idx) => {
      ensureSpace(48);
      if (idx % 2 === 0) {
        ctx.fillStyle = '#F8FAFC';
        drawRoundedRect(ctx, MARGIN, y, CONTENT_W, 42, 8);
        ctx.fill();
      }
      const textY = y + 27;
      ctx.fillStyle = '#0F172A';
      ctx.font = `600 19px ${FONT_SANS}`;
      ctx.fillText(fitText(ctx, cat.category, CONTENT_W * 0.34), MARGIN + 12, textY);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#475569';
      ctx.font = `500 19px ${FONT_MONO}`;
      ctx.fillText(String(cat.count), MARGIN + CONTENT_W * 0.40, textY);
      ctx.fillText(`${cat.pct}%`, MARGIN + CONTENT_W * 0.54, textY);

      if (cat.budgetLimit !== undefined) {
        const over = (cat.budgetPct ?? 0) >= 100;
        ctx.fillStyle = over ? '#E11D48' : '#475569';
        ctx.font = `500 18px ${FONT_MONO}`;
        ctx.fillText(
          `${formatMoney(cat.budgetLimit, stats.currency)} (${cat.budgetPct ?? 0}%)`,
          MARGIN + CONTENT_W * 0.74,
          textY
        );
      } else {
        ctx.fillStyle = '#94A3B8';
        ctx.font = `500 18px ${FONT_SANS}`;
        ctx.fillText('—', MARGIN + CONTENT_W * 0.74, textY);
      }

      ctx.textAlign = 'right';
      ctx.fillStyle = cat.amount > 0 ? '#E11D48' : '#64748B';
      ctx.font = `700 19px ${FONT_MONO}`;
      ctx.fillText(
        cat.amount > 0
          ? `-${formatMoney(cat.amount, stats.currency)}`
          : formatMoney(0, stats.currency),
        PAGE_W - MARGIN - 12,
        textY
      );
      ctx.textAlign = 'left';
      y += 46;
    });
    y += 18;
  }

  // Section 4: Monthly Ledger Transactions
  if (stats.sortedTransactions.length > 0) {
    drawSectionTitle(
      'Ամսվա գործարքների մատյան',
      `${stats.sortedTransactions.length} գրանցում`
    );

    ensureSpace(44);
    ctx.fillStyle = '#64748B';
    ctx.font = `700 18px ${FONT_SANS}`;
    ctx.fillText('Ամսաթիվ', MARGIN + 12, y);
    ctx.fillText('Աղբյուր / Նպատակ', MARGIN + 148, y);
    ctx.fillText('Կատեգորիա և տեսակ', MARGIN + 560, y);
    ctx.textAlign = 'right';
    ctx.fillText('Գումար', PAGE_W - MARGIN - 12, y);
    ctx.textAlign = 'left';
    y += 14;

    stats.sortedTransactions.forEach((tx, idx) => {
      ensureSpace(44);
      if (idx % 2 === 0) {
        ctx.fillStyle = '#F8FAFC';
        drawRoundedRect(ctx, MARGIN, y, CONTENT_W, 38, 8);
        ctx.fill();
      }
      const textY = y + 25;

      ctx.fillStyle = '#64748B';
      ctx.font = `500 17px ${FONT_MONO}`;
      ctx.fillText(formatShortDate(tx.date), MARGIN + 12, textY);

      ctx.fillStyle = '#0F172A';
      ctx.font = `600 18px ${FONT_SANS}`;
      ctx.fillText(fitText(ctx, tx.title, 390), MARGIN + 148, textY);

      const kindText =
        tx.type === 'income'
          ? `${INCOME_KIND_LABELS[getTransactionIncomeKind(tx)]} · ${tx.category}`
          : `Ծախս · ${tx.category}`;
      ctx.fillStyle = '#475569';
      ctx.font = `500 17px ${FONT_SANS}`;
      ctx.fillText(fitText(ctx, kindText, 300), MARGIN + 560, textY);

      ctx.textAlign = 'right';
      ctx.fillStyle = tx.type === 'income' ? '#059669' : '#0F172A';
      ctx.font = `700 18px ${FONT_MONO}`;
      ctx.fillText(
        `${tx.type === 'income' ? '+' : '-'}${formatMoney(tx.amount, stats.currency)}`,
        PAGE_W - MARGIN - 12,
        textY
      );
      ctx.textAlign = 'left';
      y += 42;
    });
  }

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  pages.forEach((canvas, idx) => {
    if (idx > 0) doc.addPage();
    const imgData = canvas.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
  });

  doc.save(`monthly-summary-${stats.selectedMonth}.pdf`);
}
