import { Task, TaskRepeatInterval, TaskScheduleType } from '../types';
import { daysBetweenISO, getDaysInCalendarMonth } from './financialCycle';

export const TASK_SCHEDULE_OPTIONS: {
  id: TaskScheduleType;
  label: string;
  shortLabel: string;
}[] = [
  { id: 'one_time', label: 'Միանգամյա', shortLabel: 'Միանգամյա' },
  { id: 'daily', label: 'Ամենօրյա', shortLabel: 'Ամենօրյա' },
  { id: 'recurring', label: 'Կրկնվող', shortLabel: 'Կրկնվող' },
  { id: 'weekdays', label: 'Օրերի ընտրությամբ', shortLabel: 'Օրերով' },
];

export const TASK_REPEAT_INTERVAL_OPTIONS: {
  id: TaskRepeatInterval;
  label: string;
}[] = [
  { id: 'weekly', label: 'Շաբաթական' },
  { id: 'biweekly', label: 'Երկու շաբաթը մեկ' },
  { id: 'monthly', label: 'Ամսական' },
  { id: 'every_n_days', label: 'Ամեն N օրը' },
];

// Monday-first weekday ordering for Armenian UI
export const WEEKDAY_OPTIONS: {
  day: number; // JS Date.getDay(): 0 = Sun .. 6 = Sat
  short: string;
  full: string;
}[] = [
  { day: 1, short: 'Երկ', full: 'Երկուշաբթի' },
  { day: 2, short: 'Երք', full: 'Երեքշաբթի' },
  { day: 3, short: 'Չրք', full: 'Չորեքշաբթի' },
  { day: 4, short: 'Հնգ', full: 'Հինգշաբթի' },
  { day: 5, short: 'Ուրբ', full: 'Ուրբաթ' },
  { day: 6, short: 'Շբթ', full: 'Շաբաթ' },
  { day: 0, short: 'Կիր', full: 'Կիրակի' },
];

export function getWeekdayFromISO(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y || 2026, (m || 1) - 1, d || 1).getDay();
}

export function addDaysToISO(dateISO: string, deltaDays: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const utc = new Date(Date.UTC(y || 2026, (m || 1) - 1, (d || 1) + deltaDays));
  const uy = utc.getUTCFullYear();
  const um = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const ud = String(utc.getUTCDate()).padStart(2, '0');
  return `${uy}-${um}-${ud}`;
}

export function getTaskScheduleType(task: Task): TaskScheduleType {
  return task.scheduleType ?? 'one_time';
}

export function isTaskRepeating(task: Task): boolean {
  return getTaskScheduleType(task) !== 'one_time';
}

export function isTaskCompletedOnDate(task: Task, dateISO: string): boolean {
  if (getTaskScheduleType(task) === 'one_time') {
    return Boolean(task.completed);
  }
  return Boolean(task.completedDates?.includes(dateISO));
}

export function isTaskDueOnDate(task: Task, dateISO: string): boolean {
  const scheduleType = getTaskScheduleType(task);
  if (scheduleType === 'one_time') {
    return task.date === dateISO;
  }

  const startDate = task.date || dateISO;
  if (dateISO < startDate) {
    return false;
  }

  if (scheduleType === 'daily') {
    return true;
  }

  if (scheduleType === 'weekdays') {
    const selected = task.selectedWeekdays ?? [];
    if (selected.length === 0) return false;
    const dow = getWeekdayFromISO(dateISO);
    return selected.includes(dow);
  }

  // scheduleType === 'recurring'
  const interval = task.repeatInterval ?? 'weekly';
  const diffDays = daysBetweenISO(startDate, dateISO);
  if (diffDays < 0) return false;

  if (interval === 'weekly') {
    return diffDays % 7 === 0;
  }
  if (interval === 'biweekly') {
    return diffDays % 14 === 0;
  }
  if (interval === 'monthly') {
    const targetDay = Number(startDate.slice(8, 10)) || 1;
    const [y, m, d] = dateISO.split('-').map(Number);
    const clampedTarget = Math.min(targetDay, getDaysInCalendarMonth(y, m));
    return d === clampedTarget;
  }

  const n = Math.max(1, Math.round(task.repeatEveryDays ?? 2));
  return diffDays % n === 0;
}

export function isTaskOverdue(task: Task, todayISO: string): boolean {
  return (
    getTaskScheduleType(task) === 'one_time' &&
    !task.completed &&
    task.date < todayISO
  );
}

export function getTaskNextDueDate(task: Task, todayISO: string): string | null {
  const scheduleType = getTaskScheduleType(task);
  if (scheduleType === 'one_time') {
    return task.date;
  }

  const start = task.date > todayISO ? task.date : todayISO;
  for (let offset = 0; offset <= 45; offset++) {
    const candidate = addDaysToISO(start, offset);
    if (isTaskDueOnDate(task, candidate)) {
      return candidate;
    }
  }
  return null;
}

export function isTaskUpcoming(task: Task, todayISO: string): boolean {
  const scheduleType = getTaskScheduleType(task);
  if (scheduleType === 'one_time') {
    return task.date > todayISO;
  }
  return !isTaskDueOnDate(task, todayISO);
}

export function formatWeekdaysSummary(weekdays: number[]): string {
  if (!weekdays || weekdays.length === 0) return 'Օր չի ընտրված';
  const unique = Array.from(new Set(weekdays));
  if (unique.length === 7) return 'Ամեն օր';

  const workdays = [1, 2, 3, 4, 5];
  if (
    unique.length === 5 &&
    workdays.every((d) => unique.includes(d))
  ) {
    return 'Աշխ. օրեր (Երկ–Ուրբ)';
  }

  if (unique.length === 2 && unique.includes(6) && unique.includes(0)) {
    return 'Հանգստյան (Շբթ–Կիր)';
  }

  const ordered = WEEKDAY_OPTIONS.filter((opt) => unique.includes(opt.day));
  return ordered.map((opt) => opt.short).join(', ');
}

export function getTaskScheduleLabel(task: Task): string {
  const scheduleType = getTaskScheduleType(task);
  if (scheduleType === 'one_time') return 'Միանգամյա';
  if (scheduleType === 'daily') return 'Ամենօրյա';
  if (scheduleType === 'weekdays') {
    return formatWeekdaysSummary(task.selectedWeekdays ?? []);
  }

  const interval = task.repeatInterval ?? 'weekly';
  if (interval === 'weekly') return 'Կրկնվող · Շաբաթական';
  if (interval === 'biweekly') return 'Կրկնվող · Երկշաբաթյա';
  if (interval === 'monthly') return 'Կրկնվող · Ամսական';
  const n = Math.max(1, Math.round(task.repeatEveryDays ?? 2));
  return `Կրկնվող · Ամեն ${n} օրը`;
}
