import {
  AppNotificationItem,
  BudgetLimit,
  DebtItem,
  Note,
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
} from './financialCycle';
import {
  getTaskScheduleLabel,
  isTaskCompletedOnDate,
  isTaskDueOnDate,
  isTaskRepeating,
} from './taskSchedule';

export function getCurrentHHMM(date = new Date()): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
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

        const isDue = true; // active daily reminders
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
      const slotKey = `monthly:${activeCycleKey}`;
      if (bill.skippedSlots?.includes(slotKey)) continue;

      const alreadyPaidThisCycle = transactions.some(
        (tx) =>
          tx.type === 'expense' &&
          isDateInCycle(tx.date, activeCycleKey, effectivePayday) &&
          tx.title.toLowerCase() === bill.title.toLowerCase()
      );
      if (alreadyPaidThisCycle) continue;

      const dueDate = getDateInCycleForDay(
        activeCycleKey,
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
        id: `monthly:${bill.id}:${activeCycleKey}`,
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
    if (tx.date > todayISO) continue; // Future ones will notify when their day arrives
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

export function playNotificationChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [659.25, 880];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.11 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.3);
    });

    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 900);
  } catch {
    // Ignore audio restrictions
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
