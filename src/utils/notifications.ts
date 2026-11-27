import {
  AppNotificationItem,
  BudgetLimit,
  DebtItem,
  GeminiVoicePreset,
  Note,
  NotificationSettings,
  NotificationSoundPreset,
  RecurringBill,
  Task,
  Transaction,
} from '../types';
import { formatMoney, formatShortDate } from '../data/defaults';
import {
  daysBetweenISO,
  getCycleDayMetrics,
  getCycleKeyForDate,
  getDateInCycleForDay,
  isDateInCycle,
  shiftMonthKey,
} from './financialCycle';
import { isMonthlyBillSettledForCycle } from './recurringBills';
import {
  getTaskScheduleLabel,
  isTaskCompletedOnDate,
  isTaskDueOnDate,
  isTaskRepeating,
} from './taskSchedule';

export const NOTIFICATION_SOUND_PRESETS: Array<{
  id: NotificationSoundPreset;
  label: string;
  description: string;
}> = [
  { id: 'chime', label: 'Մաքուր զանգակ', description: 'Նուրբ երկնոտ ազդանշան' },
  { id: 'bell', label: 'Բյուրեղյա զանգ', description: 'Պարզ ակորդային հնչյուն' },
  { id: 'marimba', label: 'Մարիմբա', description: 'Փափուկ փայտային արպեջիո' },
  { id: 'pulse', label: 'Ազդանշան', description: 'Ժամանակակից կրկնակի տոն' },
  { id: 'zen', label: 'Հանգիստ', description: 'Տաք մեղմ ակորդ' },
];

export const GEMINI_VOICE_PRESETS: Array<{
  id: GeminiVoicePreset;
  label: string;
  description: string;
}> = [
  { id: 'Kore', label: 'Կորե', description: 'Հստակ և բարեհամբույր' },
  { id: 'Zephyr', label: 'Զեֆիր', description: 'Մեղմ և պարզ' },
  { id: 'Puck', label: 'Փաք', description: 'Եռանդուն և աշխույժ' },
  { id: 'Charon', label: 'Քարոն', description: 'Հանգիստ և խորը' },
  { id: 'Fenrir', label: 'Ֆենրիր', description: 'Վստահ և արտահայտիչ' },
];

export function getCurrentHHMM(date = new Date()): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function isWithinQuietHours(
  settings: NotificationSettings,
  currentHHMM = getCurrentHHMM()
): boolean {
  if (!settings.quietHoursEnabled) return false;
  const start = settings.quietHoursStart || '22:30';
  const end = settings.quietHoursEnd || '08:00';
  if (start === end) return false;
  if (start < end) {
    return currentHHMM >= start && currentHHMM < end;
  }
  return currentHHMM >= start || currentHHMM < end;
}

export function getBillFrequency(
  bill: RecurringBill
): 'monthly' | 'daily' | 'planned' {
  return bill.frequency ?? 'monthly';
}

export function getDailyPresetTimes(count: number): string[] {
  if (count <= 1) return ['10:00'];
  if (count === 2) return ['09:30', '18:30'];
  if (count === 3) return ['09:00', '14:00', '20:00'];
  if (count === 4) return ['09:00', '13:00', '17:00', '21:00'];
  return ['08:30', '12:00', '15:30', '18:30', '21:00'];
}

export function buildAppNotifications(params: {
  bills: RecurringBill[];
  transactions: Transaction[];
  tasks: Task[];
  notes: Note[];
  budgets?: BudgetLimit[];
  debts?: DebtItem[];
  selectedMonth?: string;
  todayISO: string;
  currentHHMM: string;
  effectivePayday: number;
}): AppNotificationItem[] {
  const {
    bills,
    transactions,
    tasks,
    notes,
    budgets = [],
    debts = [],
    selectedMonth,
    todayISO,
    effectivePayday,
  } = params;

  const activeCycleKey = getCycleKeyForDate(todayISO, effectivePayday);
  const targetCycleForBudget = selectedMonth || activeCycleKey;
  const items: AppNotificationItem[] = [];

  // Evaluate budget alerts (80%+ or exceeded) & proactive spending trends
  if (budgets.length > 0) {
    const cycleKeys = Array.from(new Set([activeCycleKey, targetCycleForBudget]));

    for (const cKey of cycleKeys) {
      const isLiveCycle = cKey === activeCycleKey;
      const cycleTxs = transactions.filter(
        (t) =>
          isDateInCycle(t.date, cKey, effectivePayday) &&
          t.type === 'expense' &&
          !t.isPending
      );
      const spentByCategory = cycleTxs.reduce<Record<string, number>>(
        (acc, t) => {
          acc[t.category] = (acc[t.category] ?? 0) + t.amount;
          return acc;
        },
        {}
      );

      const cycleMetrics = getCycleDayMetrics(cKey, effectivePayday, todayISO);

      for (const b of budgets) {
        const spent = spentByCategory[b.category] ?? 0;
        if (b.limit > 0) {
          if (spent >= 0.8 * b.limit) {
            const ratio = Math.round((spent / b.limit) * 100);
            const isExceeded = spent >= b.limit;
            const stage = isExceeded ? 'exceeded' : 'warning80';
            const cycleSuffix = isLiveCycle ? '' : ` (${cKey})`;

            items.push({
              id: `budget:${b.category}:${cKey}:${stage}`,
              kind: 'budget_alert',
              title: isExceeded
                ? `Բյուջեն գերազանցված է · ${b.category}${cycleSuffix}`
                : `Բյուջեի 80% շեմի զգուշացում · ${b.category}${cycleSuffix}`,
              subtitle: isExceeded
                ? `Բյուջեն գերազանցված է (${ratio}%): ${formatMoney(spent)} / ${formatMoney(b.limit)}`
                : `Ծախսվել է բյուջեի ${ratio}%-ը (${formatMoney(spent)} / ${formatMoney(b.limit)}, մնաց՝ ${formatMoney(b.limit - spent)})`,
              amount: spent,
              budgetLimit: b.limit,
              ratio,
              category: b.category,
              dueDate: todayISO,
              status: isExceeded ? 'overdue' : 'due_now',
            });
          } else if (
            isLiveCycle &&
            cycleMetrics.elapsedDays >= 3 &&
            cycleMetrics.totalDays > 0
          ) {
            const projectedSpend = Math.round(
              (spent / cycleMetrics.elapsedDays) * cycleMetrics.totalDays
            );
            if (projectedSpend > b.limit) {
              const projRatio = Math.round((projectedSpend / b.limit) * 100);
              items.push({
                id: `budget_trend:${b.category}:${cKey}:pacing`,
                kind: 'budget_alert',
                title: `Բյուջեի գերազանցման կանխատեսում · ${b.category}`,
                subtitle: `Ընթացիկ տեմպով ամսվա վերջին կծախսեք ${formatMoney(projectedSpend)} (կանխատեսվող՝ ${projRatio}%, սահմանաչափ՝ ${formatMoney(b.limit)})`,
                amount: projectedSpend,
                budgetLimit: b.limit,
                ratio: projRatio,
                category: b.category,
                dueDate: todayISO,
                status: 'due_now',
              });
            }
          }
        }
      }
    }
  }

  for (const bill of bills) {
    if (bill.active === false) continue;
    const freq = getBillFrequency(bill);

    if (freq === 'daily') {
      const times = [...(bill.dailyTimes ?? ['10:00'])].sort();
      for (const time of times) {
        const slotKey = `${todayISO}@${time}`;
        if (bill.confirmedSlots?.includes(slotKey)) continue;
        if (bill.skippedSlots?.includes(slotKey)) continue;

        const isDue = true;
        items.push({
          id: `daily:${bill.id}:${slotKey}`,
          kind: 'daily_expense',
          title: bill.title,
          subtitle: `Ամենօրյա ծախս · ${time}-ի հիշեցում`,
          amount: bill.amount,
          category: bill.category,
          dueDate: todayISO,
          dueTime: time,
          status: isDue ? 'due_now' : 'upcoming',
          billId: bill.id,
          slotKey,
        });
      }
    } else if (freq === 'planned') {
      if (bill.confirmedSlots?.includes('planned')) continue;
      if (bill.skippedSlots?.includes('planned')) continue;
      const sDate = bill.scheduledDate || todayISO;
      const sTime = bill.scheduledTime || '09:00';
      const diffDays = daysBetweenISO(todayISO, sDate);
      if (diffDays > 7) continue;

      const status =
        sDate < todayISO
          ? 'overdue'
          : sDate === todayISO
            ? 'due_now'
            : 'upcoming';

      items.push({
        id: `planned:${bill.id}:${sDate}@${sTime}`,
        kind: 'planned_expense',
        title: bill.title,
        subtitle:
          status === 'overdue'
            ? `Ուշացած պլանավորված ծախս · ${formatShortDate(sDate)}, ${sTime}`
            : `Պլանավորված ծախս · ${sDate === todayISO ? 'Այսօր' : formatShortDate(sDate)}, ${sTime}`,
        amount: bill.amount,
        category: bill.category,
        dueDate: sDate,
        dueTime: sTime,
        status,
        billId: bill.id,
        slotKey: 'planned',
      });
    } else {
      const candidateCycles = [activeCycleKey, shiftMonthKey(activeCycleKey, 1)];
      for (const cKey of candidateCycles) {
        const slotKey = `monthly:${cKey}`;
        const cycleTxs = transactions.filter((tx) =>
          isDateInCycle(tx.date, cKey, effectivePayday)
        );
        if (isMonthlyBillSettledForCycle(bill, cKey, cycleTxs)) continue;

        const dueDate = getDateInCycleForDay(
          cKey,
          effectivePayday,
          bill.dayOfMonth
        );
        const rTime = bill.reminderTime || '10:00';
        const diffDays = daysBetweenISO(todayISO, dueDate);
        if (diffDays > 3) continue;

        const status =
          dueDate < todayISO
            ? 'overdue'
            : dueDate === todayISO
              ? 'due_now'
              : 'upcoming';

        items.push({
          id: `monthly:${bill.id}:${cKey}`,
          kind: 'monthly_bill',
          title: bill.title,
          subtitle:
            status === 'overdue'
              ? `Ամսական վճարում (ուշացած) · Ամսվա ${bill.dayOfMonth}-ին`
              : `Ամսական վճարում · ${dueDate === todayISO ? `Այսօր, ${rTime}` : formatShortDate(dueDate)}`,
          amount: bill.amount,
          category: bill.category,
          dueDate,
          dueTime: rTime,
          status,
          billId: bill.id,
          slotKey,
        });
        break;
      }
    }
  }

  for (const task of tasks) {
    if (!isTaskDueOnDate(task, todayISO) || isTaskCompletedOnDate(task, todayISO)) {
      continue;
    }
    const prefix = isTaskRepeating(task) ? getTaskScheduleLabel(task) : 'Անելիք';
    items.push({
      id: `task:${task.id}:${todayISO}`,
      kind: 'task',
      title: task.title,
      subtitle: task.dueTime
        ? `${prefix} · Այսօր ${task.dueTime}`
        : `${prefix} · Այսօր`,
      dueDate: todayISO,
      dueTime: task.dueTime,
      status: 'due_now',
      taskId: task.id,
    });
  }

  for (const note of notes) {
    if (!note.reminderDate) continue;
    const [dPart, tPart] = note.reminderDate.split('T');
    if (dPart > todayISO) continue;
    const status = dPart < todayISO ? 'overdue' : 'due_now';
    items.push({
      id: `note:${note.id}`,
      kind: 'note',
      title: note.title,
      subtitle: `Նշում · ${formatShortDate(dPart)}${tPart ? `, ${tPart}` : ''}`,
      dueDate: dPart,
      dueTime: tPart,
      status,
      noteId: note.id,
    });
  }

  // Pre-expense / planned expense reminders
  for (const tx of transactions) {
    if (tx.type !== 'expense' || !tx.isPending) continue;
    if (tx.date > todayISO) continue;
    const isOverdue = tx.date < todayISO;
    items.push({
      id: `pre_expense:${tx.id}`,
      kind: 'planned_expense',
      title: `Սպասվող նախածախս · ${tx.title}`,
      subtitle: `${formatMoney(tx.amount)} · ${tx.category} (${tx.date === todayISO ? 'Այսօր' : formatShortDate(tx.date)})`,
      amount: tx.amount,
      category: tx.category,
      dueDate: tx.date,
      status: isOverdue ? 'overdue' : 'due_now',
      txId: tx.id,
    });
  }

  // Debt due-date reminders
  for (const debt of debts) {
    if (debt.settled || !debt.dueDate) continue;
    const remaining = Math.max(0, debt.totalAmount - debt.paidAmount);
    if (remaining <= 0) continue;
    const diffDays = daysBetweenISO(todayISO, debt.dueDate);
    if (diffDays > 3) continue;
    const status =
      debt.dueDate < todayISO
        ? 'overdue'
        : debt.dueDate === todayISO
          ? 'due_now'
          : 'upcoming';
    items.push({
      id: `debt:${debt.id}`,
      kind: 'debt',
      title:
        debt.direction === 'lent'
          ? `Վերադարձի ժամկետ · ${debt.person}`
          : `Պարտքի վճարման ժամկետ · ${debt.person}`,
      subtitle:
        status === 'overdue'
          ? `Ուշացած (${formatShortDate(debt.dueDate)}) · ${debt.direction === 'lent' ? 'Պետք է վերադարձնի' : 'Վերադարձնել'}`
          : `${debt.dueDate === todayISO ? 'Այսօր' : formatShortDate(debt.dueDate)} · Մնացորդ՝ ${formatMoney(remaining)}`,
      amount: remaining,
      dueDate: debt.dueDate,
      status,
      debtId: debt.id,
    });
  }

  const statusRank: Record<AppNotificationItem['status'], number> = {
    overdue: 0,
    due_now: 1,
    upcoming: 2,
  };
  const kindRank: Record<AppNotificationItem['kind'], number> = {
    budget_alert: 0,
    daily_expense: 1,
    planned_expense: 2,
    monthly_bill: 3,
    debt: 4,
    note: 5,
    task: 6,
  };

  return items.sort((a, b) => {
    const sDiff = statusRank[a.status] - statusRank[b.status];
    if (sDiff !== 0) return sDiff;
    const dDiff = a.dueDate.localeCompare(b.dueDate);
    if (dDiff !== 0) return dDiff;
    const tDiff = (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99');
    if (tDiff !== 0) return tDiff;
    return kindRank[a.kind] - kindRank[b.kind];
  });
}

// Shared AudioContext so rapid previews and notifications never leak contexts
let sharedAudioCtx: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

interface ToneNote {
  freq: number;
  offset: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  harmonicFreq?: number;
}

function getPresetNotes(
  preset: NotificationSoundPreset,
  urgent: boolean
): ToneNote[] {
  switch (preset) {
    case 'bell':
      return urgent
        ? [
            { freq: 587.33, offset: 0, duration: 0.24, type: 'triangle', gain: 0.14, harmonicFreq: 1174.66 },
            { freq: 880, offset: 0.11, duration: 0.28, type: 'sine', gain: 0.15, harmonicFreq: 1760 },
            { freq: 1174.66, offset: 0.24, duration: 0.34, type: 'sine', gain: 0.12 },
          ]
        : [
            { freq: 523.25, offset: 0, duration: 0.3, type: 'sine', gain: 0.12, harmonicFreq: 1046.5 },
            { freq: 659.25, offset: 0.08, duration: 0.34, type: 'sine', gain: 0.1 },
            { freq: 783.99, offset: 0.16, duration: 0.42, type: 'sine', gain: 0.09 },
          ];
    case 'marimba':
      return urgent
        ? [
            { freq: 587.33, offset: 0, duration: 0.16, type: 'triangle', gain: 0.16 },
            { freq: 739.99, offset: 0.09, duration: 0.16, type: 'triangle', gain: 0.16 },
            { freq: 880, offset: 0.18, duration: 0.18, type: 'triangle', gain: 0.17 },
            { freq: 1174.66, offset: 0.29, duration: 0.26, type: 'sine', gain: 0.14 },
          ]
        : [
            { freq: 587.33, offset: 0, duration: 0.18, type: 'triangle', gain: 0.14 },
            { freq: 739.99, offset: 0.09, duration: 0.19, type: 'triangle', gain: 0.13 },
            { freq: 880, offset: 0.18, duration: 0.28, type: 'sine', gain: 0.12 },
          ];
    case 'pulse':
      return urgent
        ? [
            { freq: 783.99, offset: 0, duration: 0.12, type: 'sine', gain: 0.15 },
            { freq: 987.77, offset: 0.13, duration: 0.14, type: 'sine', gain: 0.16 },
            { freq: 783.99, offset: 0.32, duration: 0.12, type: 'sine', gain: 0.15 },
            { freq: 987.77, offset: 0.45, duration: 0.24, type: 'sine', gain: 0.17 },
          ]
        : [
            { freq: 698.46, offset: 0, duration: 0.14, type: 'sine', gain: 0.13 },
            { freq: 880, offset: 0.15, duration: 0.22, type: 'sine', gain: 0.13 },
          ];
    case 'zen':
      return urgent
        ? [
            { freq: 440, offset: 0, duration: 0.35, type: 'sine', gain: 0.13, harmonicFreq: 880 },
            { freq: 659.25, offset: 0.14, duration: 0.38, type: 'sine', gain: 0.12 },
            { freq: 880, offset: 0.28, duration: 0.45, type: 'sine', gain: 0.11 },
          ]
        : [
            { freq: 349.23, offset: 0, duration: 0.45, type: 'sine', gain: 0.1 },
            { freq: 523.25, offset: 0.08, duration: 0.48, type: 'sine', gain: 0.09 },
            { freq: 659.25, offset: 0.16, duration: 0.55, type: 'sine', gain: 0.08 },
          ];
    case 'chime':
    default:
      return urgent
        ? [
            { freq: 659.25, offset: 0, duration: 0.18, type: 'sine', gain: 0.14, harmonicFreq: 1318.5 },
            { freq: 880, offset: 0.1, duration: 0.22, type: 'sine', gain: 0.15 },
            { freq: 1046.5, offset: 0.23, duration: 0.3, type: 'sine', gain: 0.14 },
          ]
        : [
            { freq: 659.25, offset: 0, duration: 0.28, type: 'sine', gain: 0.12, harmonicFreq: 1318.5 },
            { freq: 880, offset: 0.11, duration: 0.34, type: 'sine', gain: 0.12 },
          ];
  }
}

export function playNotificationChime(options?: {
  preset?: NotificationSoundPreset;
  volume?: number;
  urgent?: boolean;
}): void {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;

    const preset = options?.preset ?? 'chime';
    const volume =
      typeof options?.volume === 'number' && Number.isFinite(options.volume)
        ? Math.min(1, Math.max(0.05, options.volume))
        : 0.75;
    const urgent = Boolean(options?.urgent);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(volume, ctx.currentTime);
    masterGain.connect(ctx.destination);

    const startTime = ctx.currentTime + 0.015;
    const notes = getPresetNotes(preset, urgent);

    notes.forEach((n) => {
      const t0 = startTime + n.offset;
      const peak = n.gain ?? 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type ?? 'sine';
      osc.frequency.setValueAtTime(n.freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.duration);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t0);
      osc.stop(t0 + n.duration + 0.03);

      if (n.harmonicFreq) {
        const harmOsc = ctx.createOscillator();
        const harmGain = ctx.createGain();
        harmOsc.type = 'sine';
        harmOsc.frequency.setValueAtTime(n.harmonicFreq, t0);
        harmGain.gain.setValueAtTime(0.0001, t0);
        harmGain.gain.exponentialRampToValueAtTime(peak * 0.25, t0 + 0.015);
        harmGain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.duration * 0.7);
        harmOsc.connect(harmGain);
        harmGain.connect(masterGain);
        harmOsc.start(t0);
        harmOsc.stop(t0 + n.duration * 0.75);
      }
    });
  } catch {
    // Ignore audio restrictions
  }
}

// Client-side TTS audio cache & playback controller
const clientVoiceAudioCache = new Map<string, string>();
const CLIENT_VOICE_CACHE_MAX = 24;
let activeHtmlAudio: HTMLAudioElement | null = null;
let activeTtsAbort: AbortController | null = null;
let voicePlaybackListeners: Array<(speaking: boolean) => void> = [];

function notifySpeakingListeners(speaking: boolean) {
  voicePlaybackListeners.forEach((cb) => {
    try {
      cb(speaking);
    } catch {
      // ignore
    }
  });
}

export function subscribeVoicePlaybackState(
  cb: (speaking: boolean) => void
): () => void {
  voicePlaybackListeners.push(cb);
  return () => {
    voicePlaybackListeners = voicePlaybackListeners.filter((fn) => fn !== cb);
  };
}

export function stopNotificationVoice(): void {
  if (activeTtsAbort) {
    activeTtsAbort.abort();
    activeTtsAbort = null;
  }
  if (activeHtmlAudio) {
    try {
      activeHtmlAudio.pause();
      activeHtmlAudio.currentTime = 0;
    } catch {
      // ignore
    }
    activeHtmlAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
  notifySpeakingListeners(false);
}

export function getBrowserSpeechVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return [];
  }
  try {
    const voices = window.speechSynthesis.getVoices();
    const scoreLang = (lang: string) => {
      const low = lang.toLowerCase();
      if (low.startsWith('hy')) return 0;
      if (low.startsWith('ru')) return 1;
      if (low.startsWith('en')) return 2;
      return 3;
    };
    return [...voices].sort((a, b) => {
      const s = scoreLang(a.lang) - scoreLang(b.lang);
      if (s !== 0) return s;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

export function formatNotificationForSpeech(item: AppNotificationItem): string {
  const clean = (raw: string) =>
    raw
      .replace(/֏/g, ' դրամ')
      .replace(/·/g, ', ')
      .replace(/\s+/g, ' ')
      .trim();

  const title = clean(item.title);
  const isOverdue = item.status === 'overdue';
  let prefix = 'Հիշեցում․ ';

  if (item.kind === 'budget_alert') {
    prefix = isOverdue ? 'Ուշադրություն, բյուջեի գերազանցում․ ' : 'Բյուջեի զգուշացում․ ';
  } else if (item.kind === 'task') {
    prefix = 'Անելիքի հիշեցում․ ';
  } else if (item.kind === 'note') {
    prefix = 'Նշման հիշեցում․ ';
  } else if (isOverdue) {
    prefix = 'Ուշացած վճարում․ ';
  } else if (
    item.kind === 'daily_expense' ||
    item.kind === 'planned_expense' ||
    item.kind === 'monthly_bill'
  ) {
    prefix = 'Վճարման հիշեցում․ ';
  }

  const parts = [prefix + title];
  if (item.amount !== undefined && item.kind !== 'budget_alert') {
    parts.push(`${Math.round(item.amount).toLocaleString('en-US')} դրամ`);
  }
  if (item.dueTime) {
    parts.push(`ժամը ${item.dueTime}-ին`);
  }
  if (item.kind === 'budget_alert' && item.ratio !== undefined) {
    parts.push(`ծախսվել է ${item.ratio} տոկոսը`);
  }

  return parts.join(', ').slice(0, 300);
}

export async function speakBrowserText(
  text: string,
  options?: {
    voiceURI?: string;
    rate?: number;
    volume?: number;
  }
): Promise<boolean> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }
  const cleanText = text.trim();
  if (!cleanText) return false;

  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      const voices = getBrowserSpeechVoices();
      const preferred =
        (options?.voiceURI
          ? voices.find((v) => v.voiceURI === options.voiceURI)
          : undefined) ||
        voices.find((v) => v.lang.toLowerCase().startsWith('hy')) ||
        voices[0];

      if (preferred) {
        utterance.voice = preferred;
        utterance.lang = preferred.lang;
      } else {
        utterance.lang = 'hy-AM';
      }

      utterance.rate =
        typeof options?.rate === 'number'
          ? Math.min(1.5, Math.max(0.7, options.rate))
          : 1;
      utterance.volume =
        typeof options?.volume === 'number'
          ? Math.min(1, Math.max(0.1, options.volume))
          : 0.85;

      notifySpeakingListeners(true);
      utterance.onend = () => {
        notifySpeakingListeners(false);
        resolve(true);
      };
      utterance.onerror = () => {
        notifySpeakingListeners(false);
        resolve(false);
      };
      synth.speak(utterance);
    } catch {
      notifySpeakingListeners(false);
      resolve(false);
    }
  });
}

async function playWavBase64(
  base64: string,
  options?: { volume?: number; rate?: number }
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const audio = new Audio(`data:audio/wav;base64,${base64}`);
      audio.volume =
        typeof options?.volume === 'number'
          ? Math.min(1, Math.max(0.05, options.volume))
          : 0.85;
      audio.playbackRate =
        typeof options?.rate === 'number'
          ? Math.min(1.4, Math.max(0.75, options.rate))
          : 1;
      activeHtmlAudio = audio;
      notifySpeakingListeners(true);

      const cleanup = (ok: boolean) => {
        if (activeHtmlAudio === audio) {
          activeHtmlAudio = null;
        }
        notifySpeakingListeners(false);
        resolve(ok);
      };

      audio.onended = () => cleanup(true);
      audio.onerror = () => cleanup(false);
      audio.play().catch(() => cleanup(false));
    } catch {
      notifySpeakingListeners(false);
      resolve(false);
    }
  });
}

export async function speakNotificationText(
  text: string,
  settings: NotificationSettings,
  options?: { urgent?: boolean; maxChars?: number }
): Promise<{ engine: 'gemini' | 'browser' | 'none'; error?: string }> {
  const cap = Math.min(600, Math.max(120, options?.maxChars ?? 360));
  const cleanText = text.trim().slice(0, cap);
  if (!cleanText) return { engine: 'none' };

  stopNotificationVoice();

  const voiceMode = settings.voiceMode ?? 'auto';
  const voiceName = settings.voicePreset ?? 'Kore';
  const volume = settings.soundVolume ?? 0.8;
  const rate = settings.voiceRate ?? 1;
  const urgent = Boolean(options?.urgent);

  if (voiceMode === 'auto' || voiceMode === 'gemini') {
    const cacheKey = `${voiceName}:${urgent ? '1' : '0'}:${cleanText}`;
    const cached = clientVoiceAudioCache.get(cacheKey);
    if (cached) {
      clientVoiceAudioCache.delete(cacheKey);
      clientVoiceAudioCache.set(cacheKey, cached);
      const played = await playWavBase64(cached, { volume, rate });
      if (played) {
        return { engine: 'gemini' };
      }
    }

    const abortController = new AbortController();
    activeTtsAbort = abortController;
    try {
      notifySpeakingListeners(true);
      const res = await fetch('/api/notifications/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          voiceName,
          urgent,
        }),
        signal: abortController.signal,
      });

      if (activeTtsAbort === abortController) {
        activeTtsAbort = null;
      }

      if (res.ok) {
        const data = (await res.json()) as { audioBase64?: string };
        if (data.audioBase64) {
          if (clientVoiceAudioCache.size >= CLIENT_VOICE_CACHE_MAX) {
            const oldestKey = clientVoiceAudioCache.keys().next().value;
            if (oldestKey) clientVoiceAudioCache.delete(oldestKey);
          }
          clientVoiceAudioCache.set(cacheKey, data.audioBase64);
          const played = await playWavBase64(data.audioBase64, { volume, rate });
          if (played) {
            return { engine: 'gemini' };
          }
        }
      }
    } catch {
      if (abortController.signal.aborted) {
        notifySpeakingListeners(false);
        return { engine: 'none' };
      }
    }
    notifySpeakingListeners(false);
    if (voiceMode === 'gemini') {
      // Still gracefully fall back to browser voice if Gemini key isn't set
      const ok = await speakBrowserText(cleanText, {
        voiceURI: settings.browserVoiceURI,
        rate,
        volume,
      });
      return {
        engine: ok ? 'browser' : 'none',
        error: ok ? undefined : 'AI ձայնային ծառայությունը անհասանելի է',
      };
    }
  }

  const ok = await speakBrowserText(cleanText, {
    voiceURI: settings.browserVoiceURI,
    rate,
    volume,
  });
  return { engine: ok ? 'browser' : 'none' };
}

export function playNotificationAlertSequence(
  items: AppNotificationItem[],
  settings: NotificationSettings,
  currentHHMM = getCurrentHHMM()
): void {
  if (items.length === 0) return;
  if (isWithinQuietHours(settings, currentHHMM)) return;

  const hasUrgent = items.some((n) => n.status === 'overdue');
  const urgentTone = hasUrgent && settings.urgentSoundEnabled !== false;

  if (settings.soundEnabled) {
    playNotificationChime({
      preset: settings.soundPreset ?? 'chime',
      volume: settings.soundVolume ?? 0.75,
      urgent: urgentTone,
    });
  }

  if (settings.voiceEnabled) {
    const leadItem = items[0];
    const spoken =
      items.length > 1
        ? `${formatNotificationForSpeech(leadItem)}։ Եվ ևս ${items.length - 1} հիշեցում`
        : formatNotificationForSpeech(leadItem);
    const delayMs = settings.soundEnabled ? 360 : 40;
    window.setTimeout(() => {
      void speakNotificationText(spoken, settings, { urgent: urgentTone });
    }, delayMs);
  }
}

export function canUseBrowserNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function sendBrowserNotification(item: AppNotificationItem): void {
  try {
    if (!canUseBrowserNotifications()) return;
    if (Notification.permission !== 'granted') return;
    const body =
      item.amount !== undefined
        ? `${item.subtitle} · ${formatMoney(item.amount)}`
        : item.subtitle;
    new Notification(item.title, {
      body,
      tag: item.id,
    });
  } catch {
    // Ignore iframe notification errors
  }
}

