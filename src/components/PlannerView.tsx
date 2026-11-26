import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Check,
  CheckSquare,
  Flame,
  Pencil,
  Plus,
  Repeat,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { EmptyStatePlaceholder } from './ui/Skeleton';
import { FocusTimerCard } from './FocusTimerCard';
import { scrollToTopInstant, scrollToTopSmooth } from '../utils/scroll';
import {
  FocusGoal,
  FocusSession,
  Habit,
  Task,
  TaskPriority,
  TaskScheduleType,
} from '../types';
import {
  formatShortDate,
  getLastNDaysISO,
  getTodayISO,
} from '../data/defaults';
import {
  TASK_SCHEDULE_OPTIONS,
  getTaskNextDueDate,
  getTaskScheduleLabel,
  getTaskScheduleType,
  isTaskCompletedOnDate,
  isTaskDueOnDate,
  isTaskOverdue,
  isTaskRepeating,
  isTaskUpcoming,
} from '../utils/taskSchedule';

interface PlannerViewProps {
  tasks: Task[];
  onOpenNewTaskModal: () => void;
  onEditTask: (task: Task) => void;
  onToggleTask: (id: string) => void;
  onUpdateTaskPriority: (id: string, priority: TaskPriority) => void;
  onDeleteTask: (id: string) => void;
  onClearCompleted: () => void;
  habits: Habit[];
  onOpenNewHabitModal: () => void;
  onEditHabit: (habit: Habit) => void;
  onToggleHabitDate: (habitId: string, date: string) => void;
  onDeleteHabit: (habitId: string) => void;
  focusGoal: FocusGoal | null;
  focusSessions: FocusSession[];
  soundEnabled: boolean;
  browserNotifications: boolean;
  onCompleteFocusSession: (session: Omit<FocusSession, 'id' | 'completedAt'>) => void;
}

type TaskSortMode = 'priority-desc' | 'priority-asc' | 'date-asc' | 'newest';
type TaskScopeMode = 'all' | 'today' | 'upcoming' | 'overdue';

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'Կարևոր',
  medium: 'Միջին',
  low: 'Սովորական',
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const PRIORITY_OPTIONS: {
  id: TaskPriority;
  label: string;
  dotClass: string;
  textClass: string;
}[] = [
  {
    id: 'high',
    label: 'Կարևոր',
    dotClass: 'bg-rose-600 dark:bg-rose-400',
    textClass: 'text-rose-600 dark:text-rose-400',
  },
  {
    id: 'medium',
    label: 'Միջին',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-600 dark:text-amber-400',
  },
  {
    id: 'low',
    label: 'Սովորական',
    dotClass: 'bg-slate-400 dark:bg-slate-500',
    textClass: 'text-[#64748B] dark:text-[#94A3B8]',
  },
];

function calculateStreak(completedDates: string[], daysList: string[]): number {
  const set = new Set(completedDates);
  let streak = 0;
  for (let i = daysList.length - 1; i >= 0; i--) {
    const d = daysList[i];
    if (set.has(d)) {
      streak++;
    } else if (i === daysList.length - 1) {
      continue;
    } else {
      break;
    }
  }
  return streak;
}

export function PlannerView({
  tasks,
  onOpenNewTaskModal,
  onEditTask,
  onToggleTask,
  onUpdateTaskPriority,
  onDeleteTask,
  onClearCompleted,
  habits,
  onOpenNewHabitModal,
  onEditHabit,
  onToggleHabitDate,
  onDeleteHabit,
  focusGoal,
  focusSessions,
  soundEnabled,
  browserNotifications,
  onCompleteFocusSession,
}: PlannerViewProps) {
  const prefersReducedMotion = useReducedMotion();
  const [subTab, setSubTab] = useState<'tasks' | 'habits'>('tasks');

  const handleSelectSubTab = (next: 'tasks' | 'habits') => {
    if (next === subTab) {
      scrollToTopSmooth();
      return;
    }
    setSubTab(next);
  };

  // Task filter & sort state
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [scope, setScope] = useState<TaskScopeMode>('all');
  const [scheduleFilter, setScheduleFilter] = useState<'all' | TaskScheduleType>(
    'all'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<TaskSortMode>('priority-desc');

  const last7Days = getLastNDaysISO(7);
  const todayISO = getTodayISO();

  const completedCount = tasks.filter((t) =>
    isTaskCompletedOnDate(t, todayISO)
  ).length;
  const completedOneTimeCount = tasks.filter(
    (t) => t.completed && !isTaskRepeating(t)
  ).length;
  const activeCount = tasks.length - completedCount;
  const overdueCount = tasks.filter((t) => isTaskOverdue(t, todayISO)).length;

  const filteredTasks = [...tasks]
    .filter((t) => {
      const doneToday = isTaskCompletedOnDate(t, todayISO);
      if (filter === 'active') return !doneToday;
      if (filter === 'completed') return doneToday;
      return true;
    })
    .filter((t) => {
      if (scope === 'today') return isTaskDueOnDate(t, todayISO);
      if (scope === 'upcoming') return isTaskUpcoming(t, todayISO);
      if (scope === 'overdue') return isTaskOverdue(t, todayISO);
      return true;
    })
    .filter((t) =>
      scheduleFilter === 'all' ? true : getTaskScheduleType(t) === scheduleFilter
    )
    .filter((t) => {
      if (!searchQuery.trim()) return true;
      return t.title.toLowerCase().includes(searchQuery.trim().toLowerCase());
    })
    .sort((a, b) => {
      const doneA = isTaskCompletedOnDate(a, todayISO);
      const doneB = isTaskCompletedOnDate(b, todayISO);
      if (doneA !== doneB) {
        return Number(doneA) - Number(doneB);
      }

      const pA = PRIORITY_RANK[a.priority ?? 'medium'];
      const pB = PRIORITY_RANK[b.priority ?? 'medium'];
      const nextA = getTaskNextDueDate(a, todayISO) ?? a.date;
      const nextB = getTaskNextDueDate(b, todayISO) ?? b.date;

      if (sortBy === 'priority-desc') {
        if (pA !== pB) return pA - pB;
        return `${nextA} ${a.dueTime ?? '99:99'}`.localeCompare(
          `${nextB} ${b.dueTime ?? '99:99'}`
        );
      }
      if (sortBy === 'priority-asc') {
        if (pA !== pB) return pB - pA;
        return `${nextA} ${a.dueTime ?? '99:99'}`.localeCompare(
          `${nextB} ${b.dueTime ?? '99:99'}`
        );
      }
      if (sortBy === 'date-asc') {
        const cmp = `${nextA} ${a.dueTime ?? '99:99'}`.localeCompare(
          `${nextB} ${b.dueTime ?? '99:99'}`
        );
        if (cmp !== 0) return cmp;
        return pA - pB;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

  const hasTaskFilters =
    filter !== 'all' ||
    scope !== 'all' ||
    scheduleFilter !== 'all' ||
    Boolean(searchQuery);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
            Պլանավորող և սովորություններ
          </h1>
          <p className="text-sm text-[#64748B] dark:text-[#94A3B8] tabular-nums">
            {activeCount} ընթացիկ անելիք · {habits.length} ամենօրյա սովորություն
            {overdueCount > 0 && (
              <span className="text-rose-600 dark:text-rose-400 font-medium">
                {' '}
                · {overdueCount} ժամկետանց
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl surface-subtle">
            <button
              type="button"
              onClick={() => handleSelectSubTab('tasks')}
              className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                subTab === 'tasks'
                  ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                  : 'text-[#64748B] dark:text-[#94A3B8]'
              }`}
            >
              Անելիքներ
            </button>
            <button
              type="button"
              onClick={() => handleSelectSubTab('habits')}
              className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                subTab === 'habits'
                  ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                  : 'text-[#64748B] dark:text-[#94A3B8]'
              }`}
            >
              Սովորություններ
            </button>
          </div>

          <button
            type="button"
            onClick={
              subTab === 'tasks' ? onOpenNewTaskModal : onOpenNewHabitModal
            }
            className="min-h-[40px] px-3.5 py-2 rounded-xl btn-primary text-xs sm:text-sm inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>
              {subTab === 'tasks' ? 'Նոր անելիք' : 'Նոր սովորություն'}
            </span>
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait" onExitComplete={scrollToTopInstant}>
        <motion.div
          key={subTab}
          initial={
            prefersReducedMotion ? false : { opacity: 0, y: 10, scale: 0.996 }
          }
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={
            prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.996 }
          }
          transition={{
            duration: prefersReducedMotion ? 0.04 : 0.18,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="space-y-6"
          style={{ willChange: 'transform, opacity' }}
        >
          {/* TASKS TAB */}
          {subTab === 'tasks' && (
            <>
              <FocusTimerCard
                tasks={tasks}
                focusGoal={focusGoal}
                focusSessions={focusSessions}
                soundEnabled={soundEnabled}
                browserNotifications={browserNotifications}
                onCompleteSession={onCompleteFocusSession}
              />

              <section className="surface-card overflow-hidden">
              <div className="px-4 sm:px-6 py-3.5 border-b border-[#E2E8F0] dark:border-[#1E293B] space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-1 p-1 rounded-xl surface-subtle">
                      {(
                        [
                          { id: 'all', label: 'Բոլորը' },
                          { id: 'active', label: 'Ընթացիկ' },
                          { id: 'completed', label: 'Կատարված' },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setFilter(tab.id)}
                          className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                            filter === tab.id
                              ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                              : 'text-[#64748B] dark:text-[#94A3B8]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="inline-flex items-center gap-1 p-1 rounded-xl surface-subtle">
                      {(
                        [
                          { id: 'all', label: 'Ամբողջը' },
                          { id: 'today', label: 'Այսօր' },
                          { id: 'upcoming', label: 'Առաջիկա' },
                          { id: 'overdue', label: 'Ժամկետանց' },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setScope(item.id)}
                          className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                            scope === item.id
                              ? 'bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] font-semibold shadow-xs'
                              : item.id === 'overdue' && overdueCount > 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-[#64748B] dark:text-[#94A3B8]'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 sm:flex-none sm:w-52 min-w-[160px]">
                      <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Որոնել անելիք..."
                        className="w-full min-h-[38px] pl-9 pr-3 py-1.5 text-xs sm:text-sm rounded-xl input-field"
                      />
                    </div>

                    {completedOneTimeCount > 0 && (
                      <button
                        type="button"
                        onClick={onClearCompleted}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] text-xs font-medium text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Մաքրել կատարվածները
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl surface-subtle max-w-full">
                    <button
                      type="button"
                      onClick={() => setScheduleFilter('all')}
                      className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        scheduleFilter === 'all'
                          ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                          : 'text-[#64748B] dark:text-[#94A3B8]'
                      }`}
                    >
                      Բոլոր տեսակները
                    </button>
                    {TASK_SCHEDULE_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setScheduleFilter(opt.id)}
                        className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          scheduleFilter === opt.id
                            ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                            : 'text-[#64748B] dark:text-[#94A3B8]'
                        }`}
                      >
                        {opt.shortLabel}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs text-[#64748B] dark:text-[#94A3B8]">
                      <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Տեսակավորել․</span>
                    </span>
                    <div
                      className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl surface-subtle max-w-full"
                      role="group"
                      aria-label="Անելիքների տեսակավորում"
                    >
                      <button
                        type="button"
                        onClick={() => setSortBy('priority-desc')}
                        aria-pressed={sortBy === 'priority-desc'}
                        className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                          sortBy === 'priority-desc'
                            ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                            : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                        }`}
                      >
                        <ArrowDown className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                        <span>Կարևորից</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSortBy('priority-asc')}
                        aria-pressed={sortBy === 'priority-asc'}
                        className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                          sortBy === 'priority-asc'
                            ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                            : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                        }`}
                      >
                        <ArrowUp className="w-3 h-3" />
                        <span>Սովորականից</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSortBy('date-asc')}
                        aria-pressed={sortBy === 'date-asc'}
                        className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          sortBy === 'date-asc'
                            ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                            : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                        }`}
                      >
                        Ըստ ժամկետի
                      </button>
                      <button
                        type="button"
                        onClick={() => setSortBy('newest')}
                        aria-pressed={sortBy === 'newest'}
                        className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          sortBy === 'newest'
                            ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                            : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                        }`}
                      >
                        Նորերը
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {filteredTasks.length === 0 ? (
                <div className="p-5 sm:p-6">
                  <EmptyStatePlaceholder
                    icon={CheckSquare}
                    title={
                      tasks.length === 0
                        ? 'Դեռ անելիքներ չկան'
                        : 'Ընտրված զտիչներով անելիքներ չեն գտնվել'
                    }
                    description={
                      tasks.length === 0
                        ? 'Ավելացրեք ձեր առաջին միանգամյա կամ կրկնվող անելիքը մեկ հպումով։'
                        : 'Փորձեք մաքրել զտիչները կամ փոխել որոնման բառը։'
                    }
                    actionLabel={
                      hasTaskFilters
                        ? 'Մաքրել զտիչները'
                        : '+ Ավելացնել անելիք'
                    }
                    onAction={
                      hasTaskFilters
                        ? () => {
                            setFilter('all');
                            setScope('all');
                            setScheduleFilter('all');
                            setSearchQuery('');
                          }
                        : onOpenNewTaskModal
                    }
                  />
                </div>
              ) : (
                <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
                  {filteredTasks.map((task) => {
                    const taskPriority = task.priority ?? 'medium';
                    const priorityMeta =
                      PRIORITY_OPTIONS.find((p) => p.id === taskPriority) ??
                      PRIORITY_OPTIONS[1];
                    const schedule = getTaskScheduleType(task);
                    const repeating = isTaskRepeating(task);
                    const doneToday = isTaskCompletedOnDate(task, todayISO);
                    const dueToday = isTaskDueOnDate(task, todayISO);
                    const nextDue = getTaskNextDueDate(task, todayISO);
                    const isOverdue = isTaskOverdue(task, todayISO);

                    return (
                      <div
                        key={task.id}
                        className="px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 hover:bg-[#F8FAFC] dark:hover:bg-[#162033] transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => onToggleTask(task.id)}
                          className="flex-1 min-w-0 min-h-[44px] flex items-center gap-3.5 text-left cursor-pointer"
                        >
                          <span
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                              doneToday
                                ? 'bg-[#2563EB] border-[#2563EB] dark:bg-[#3B82F6] dark:border-[#3B82F6] text-white dark:text-[#060B16]'
                                : 'border-[#CBD5E1] dark:border-[#334155]'
                            }`}
                          >
                            {doneToday && (
                              <Check className="w-3 h-3" strokeWidth={2.7} />
                            )}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p
                                className={`text-sm break-words ${
                                  doneToday
                                    ? 'line-through text-[#94A3B8] dark:text-[#64748B]'
                                    : 'text-[#0F172A] dark:text-[#F8FAFC] font-medium'
                                }`}
                              >
                                {task.title}
                              </p>
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                  repeating
                                    ? 'bg-[#EFF6FF] dark:bg-[#172554] text-[#2563EB] dark:text-[#60A5FA]'
                                    : 'bg-[#F1F5F9] dark:bg-[#1E293B] text-[#64748B] dark:text-[#94A3B8]'
                                }`}
                              >
                                {schedule === 'weekdays' ? (
                                  <CalendarDays className="w-2.5 h-2.5" />
                                ) : repeating ? (
                                  <Repeat className="w-2.5 h-2.5" />
                                ) : null}
                                <span>{getTaskScheduleLabel(task)}</span>
                              </span>
                            </div>
                            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] flex flex-wrap items-center gap-1.5 mt-0.5 tabular-nums">
                              <span
                                className={`inline-flex items-center gap-1.5 ${
                                  !doneToday ? priorityMeta.textClass : ''
                                } ${
                                  !doneToday && taskPriority === 'high'
                                    ? 'font-semibold'
                                    : ''
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${priorityMeta.dotClass}`}
                                  aria-hidden="true"
                                />
                                <span>{PRIORITY_LABELS[taskPriority]}</span>
                              </span>
                              <span aria-hidden="true">·</span>
                              {repeating ? (
                                <span
                                  className={
                                    dueToday
                                      ? 'text-[#2563EB] dark:text-[#60A5FA] font-medium'
                                      : ''
                                  }
                                >
                                  {dueToday
                                    ? 'Այսօր'
                                    : nextDue
                                      ? `Հաջորդը՝ ${formatShortDate(nextDue)}`
                                      : `Սկիզբ՝ ${formatShortDate(task.date)}`}
                                </span>
                              ) : (
                                <span
                                  className={
                                    isOverdue
                                      ? 'text-rose-600 dark:text-rose-400 font-medium'
                                      : ''
                                  }
                                >
                                  {formatShortDate(task.date)}
                                </span>
                              )}
                              {isOverdue && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-rose-600 dark:text-rose-400 font-semibold">
                                    Ժամկետանց
                                  </span>
                                </>
                              )}
                              {task.dueTime && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono">{task.dueTime}</span>
                                </>
                              )}
                              {doneToday && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-emerald-600 dark:text-emerald-400">
                                    {repeating ? 'Կատարված է այսօր' : 'Կատարված'}
                                  </span>
                                </>
                              )}
                            </p>
                          </div>
                        </button>

                        <div className="pl-8 sm:pl-0 flex items-center justify-between sm:justify-end gap-1.5 shrink-0">
                          <select
                            value={taskPriority}
                            onChange={(e) =>
                              onUpdateTaskPriority(
                                task.id,
                                e.target.value as TaskPriority
                              )
                            }
                            aria-label={`Փոխել ${task.title} առաջնահերթությունը`}
                            className="min-h-[34px] px-2.5 py-1 text-xs rounded-lg input-field cursor-pointer"
                          >
                            <option value="high">Կարևոր</option>
                            <option value="medium">Միջին</option>
                            <option value="low">Սովորական</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => onEditTask(task)}
                            aria-label={`Խմբագրել ${task.title}`}
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#E2E8F0]/60 dark:hover:bg-[#1E293B] transition-colors cursor-pointer shrink-0"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onDeleteTask(task.id)}
                            aria-label={`Ջնջել ${task.title}`}
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              </section>
            </>
          )}

          {/* HABITS TAB */}
          {subTab === 'habits' && (
            <section className="surface-card overflow-hidden">
              {habits.length === 0 ? (
                <div className="p-5 sm:p-6">
                  <EmptyStatePlaceholder
                    icon={Sparkles}
                    title="Սովորությունների ցանկը դատարկ է"
                    description="Ստեղծեք ամենօրյա սովորություն և հետևեք շաբաթական առաջընթացին։"
                    actionLabel="+ Ավելացնել սովորություն"
                    onAction={onOpenNewHabitModal}
                  />
                </div>
              ) : (
                <>
                  {/* Mobile Card Layout */}
                  <div className="sm:hidden divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
                    {habits.map((habit) => {
                      const streak = calculateStreak(
                        habit.completedDates,
                        last7Days.map((d) => d.date)
                      );
                      const weeklyDone = last7Days.filter((d) =>
                        habit.completedDates.includes(d.date)
                      ).length;

                      return (
                        <div key={habit.id} className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] break-words">
                                {habit.title}
                              </p>
                              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1.5 tabular-nums mt-0.5">
                                <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                <span>Սերիա՝ {streak} օր</span>
                                <span aria-hidden="true">·</span>
                                <span>{weeklyDone}/7 այս շաբաթ</span>
                              </p>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => onEditHabit(habit)}
                                aria-label={`Խմբագրել ${habit.title}`}
                                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteHabit(habit.id)}
                                aria-label={`Ջնջել ${habit.title}`}
                                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-7 gap-1 text-center">
                            {last7Days.map((d) => {
                              const done = habit.completedDates.includes(d.date);
                              return (
                                <div
                                  key={d.date}
                                  className="flex flex-col items-center gap-1.5"
                                >
                                  <span
                                    className={`text-[10px] leading-tight ${
                                      d.date === todayISO
                                        ? 'text-[#2563EB] dark:text-[#60A5FA] font-semibold'
                                        : 'text-[#64748B] dark:text-[#94A3B8]'
                                    }`}
                                  >
                                    {d.weekday}
                                    <span className="block font-mono tabular-nums">
                                      {d.dayNum}
                                    </span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => onToggleHabitDate(habit.id, d.date)}
                                    aria-label={`${habit.title} - ${d.date}`}
                                    aria-pressed={done}
                                    className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                                      done
                                        ? 'bg-emerald-600 border-emerald-600 text-white dark:bg-emerald-500 dark:border-emerald-500'
                                        : d.date === todayISO
                                          ? 'border-[#2563EB] dark:border-[#3B82F6] hover:bg-[#2563EB]/10'
                                          : 'border-[#CBD5E1] dark:border-[#26334D] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B]'
                                    }`}
                                  >
                                    {done && <Check className="w-4 h-4" strokeWidth={2.5} />}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Tablet & Desktop Table Layout */}
                  <div className="hidden sm:block">
                    <div className="px-6 py-3.5 border-b border-[#E2E8F0] dark:border-[#1E293B] grid grid-cols-12 items-center gap-2 text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
                      <div className="col-span-5">Սովորություն</div>
                      <div className="col-span-6 grid grid-cols-7 gap-1 text-center">
                        {last7Days.map((d) => (
                          <div
                            key={d.date}
                            className={
                              d.date === todayISO
                                ? 'text-[#2563EB] dark:text-[#60A5FA] font-semibold'
                                : ''
                            }
                          >
                            <div>{d.weekday}</div>
                            <div className="font-mono tabular-nums">{d.dayNum}</div>
                          </div>
                        ))}
                      </div>
                      <div className="col-span-1 text-right">Գործող.</div>
                    </div>

                    <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
                      {habits.map((habit) => {
                        const streak = calculateStreak(
                          habit.completedDates,
                          last7Days.map((d) => d.date)
                        );
                        const weeklyDone = last7Days.filter((d) =>
                          habit.completedDates.includes(d.date)
                        ).length;

                        return (
                          <div
                            key={habit.id}
                            className="px-6 py-3.5 grid grid-cols-12 items-center gap-2 hover:bg-[#F8FAFC] dark:hover:bg-[#162033] transition-colors"
                          >
                            <div className="col-span-5 min-w-0 pr-2">
                              <p className="text-sm font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                                {habit.title}
                              </p>
                              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1.5 tabular-nums mt-0.5">
                                <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                <span>Սերիա՝ {streak} օր</span>
                                <span aria-hidden="true">·</span>
                                <span>{weeklyDone}/7 այս շաբաթ</span>
                                <span aria-hidden="true">·</span>
                                <span>Ընդ. {habit.completedDates.length}</span>
                              </p>
                            </div>

                            <div className="col-span-6 grid grid-cols-7 gap-1 justify-items-center">
                              {last7Days.map((d) => {
                                const done = habit.completedDates.includes(d.date);
                                return (
                                  <button
                                    key={d.date}
                                    type="button"
                                    onClick={() => onToggleHabitDate(habit.id, d.date)}
                                    aria-label={`${habit.title} - ${d.date}`}
                                    aria-pressed={done}
                                    className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                                      done
                                        ? 'bg-emerald-600 border-emerald-600 text-white dark:bg-emerald-500 dark:border-emerald-500'
                                        : d.date === todayISO
                                          ? 'border-[#2563EB] dark:border-[#3B82F6] hover:bg-[#2563EB]/10'
                                          : 'border-[#CBD5E1] dark:border-[#26334D] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B]'
                                    }`}
                                  >
                                    {done && <Check className="w-4 h-4" strokeWidth={2.5} />}
                                  </button>
                                );
                              })}
                            </div>

                            <div className="col-span-1 flex justify-end gap-0.5">
                              <button
                                type="button"
                                onClick={() => onEditHabit(habit)}
                                aria-label={`Խմբագրել ${habit.title}`}
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteHabit(habit.id)}
                                aria-label={`Ջնջել ${habit.title}`}
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </section>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
