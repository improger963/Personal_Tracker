import { memo, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowUpDown,
  Bot,
  CalendarDays,
  Check,
  CheckSquare,
  Clock,
  Flame,
  Loader2,
  Pencil,
  Plus,
  Repeat,
  Search,
  Sparkles,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import {
  MetricStrip,
  PageHeader,
  PageShell,
  SectionCard,
  SubPageTabs,
} from './layout/PagePrimitives';
import { EmptyStatePlaceholder } from './ui/Skeleton';
import { FocusTimerCard } from './FocusTimerCard';
import { scrollToTopInstant } from '../utils/scroll';
import {
  BrokenDownSubtask,
  DayPlanResult,
  breakdownTaskWithAI,
  planDayWithAI,
} from '../services/smartAi';
import { getCurrentHHMM } from '../utils/notifications';
import {
  FocusGoal,
  FocusSession,
  Habit,
  NotificationSettings,
  PlannerPageTab,
  Task,
  TaskPriority,
  TaskScheduleType,
  Transaction,
} from '../types';
import {
  formatMoney,
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
  activePage: PlannerPageTab;
  onSelectPage: (page: PlannerPageTab) => void;
  tasks: Task[];
  transactions?: Transaction[];
  onConfirmPreExpense?: (txId: string) => void;
  onAddTask?: (task: Omit<Task, 'id' | 'completed' | 'createdAt'>) => void;
  onOpenNewTaskModal: () => void;
  onEditTask: (task: Task) => void;
  onToggleTask: (id: string) => void;
  onUpdateTaskPriority: (id: string, priority: TaskPriority) => void;
  onBatchUpdateTasks?: (
    updates: Array<{ id: string; dueTime?: string; priority?: TaskPriority }>
  ) => void;
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
  notificationSettings?: NotificationSettings;
  onCompleteFocusSession: (
    session: Omit<FocusSession, 'id' | 'completedAt'>
  ) => void;
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

export const PlannerView = memo(function PlannerView({
  activePage,
  onSelectPage,
  tasks,
  transactions = [],
  onConfirmPreExpense,
  onAddTask,
  onOpenNewTaskModal,
  onEditTask,
  onToggleTask,
  onUpdateTaskPriority,
  onBatchUpdateTasks,
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
  notificationSettings,
  onCompleteFocusSession,
}: PlannerViewProps) {
  const prefersReducedMotion = useReducedMotion();
  const txById = useMemo(
    () => new Map(transactions.map((t) => [t.id, t])),
    [transactions]
  );

  // Inline rapid task composer state
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskPriority, setQuickTaskPriority] =
    useState<TaskPriority>('medium');
  const [quickTaskTime, setQuickTaskTime] = useState('');
  const [aiBreakdownLoading, setAiBreakdownLoading] = useState(false);
  const [aiBreakdownError, setAiBreakdownError] = useState('');
  const [aiSubtasks, setAiSubtasks] = useState<
    Array<BrokenDownSubtask & { selected: boolean }>
  >([]);

  // AI Day Planner state
  const [dayPlanLoading, setDayPlanLoading] = useState(false);
  const [dayPlanError, setDayPlanError] = useState('');
  const [dayPlanPreview, setDayPlanPreview] = useState<DayPlanResult | null>(null);

  const handleQuickTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddTask) return;
    const trimmed = quickTaskTitle.trim();
    if (!trimmed) return;
    onAddTask({
      title: trimmed,
      priority: quickTaskPriority,
      date: getTodayISO(),
      dueTime: quickTaskTime || undefined,
      scheduleType: 'one_time',
    });
    setQuickTaskTitle('');
    setQuickTaskTime('');
    setAiSubtasks([]);
    setAiBreakdownError('');
  };

  const handleGenerateAISubtasks = async () => {
    const trimmed = quickTaskTitle.trim();
    if (!trimmed || aiBreakdownLoading) return;
    setAiBreakdownLoading(true);
    setAiBreakdownError('');
    try {
      const steps = await breakdownTaskWithAI({
        text: trimmed,
        todayISO: getTodayISO(),
      });
      if (steps.length === 0) {
        setAiBreakdownError('Չհաջողվեց ստեղծել քայլեր։ Փորձեք ավելի հստակ ձևակերպել։');
      } else {
        setAiSubtasks(steps.map((s) => ({ ...s, selected: true })));
      }
    } catch (err) {
      setAiBreakdownError(
        err instanceof Error ? err.message : 'Հնարավոր չեղավ ստանալ քայլերի պլան։'
      );
    } finally {
      setAiBreakdownLoading(false);
    }
  };

  const handleCommitAISubtasks = () => {
    if (!onAddTask) return;
    const chosen = aiSubtasks.filter((s) => s.selected);
    if (chosen.length === 0) return;
    const today = getTodayISO();
    chosen.forEach((step) => {
      onAddTask({
        title: step.title,
        priority: step.priority,
        date: today,
        dueTime: step.dueTime,
        scheduleType: 'one_time',
      });
    });
    setAiSubtasks([]);
    setQuickTaskTitle('');
    setAiBreakdownError('');
  };

  // Task filter & sort state
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [scope, setScope] = useState<TaskScopeMode>('all');
  const [scheduleFilter, setScheduleFilter] = useState<'all' | TaskScheduleType>(
    'all'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<TaskSortMode>('priority-desc');

  const todayISO = getTodayISO();
  const last7Days = useMemo(() => getLastNDaysISO(7), [todayISO]);

  const handlePlanDayAI = async () => {
    if (dayPlanLoading) return;
    const candidates = tasks
      .filter((t) => !isTaskCompletedOnDate(t, todayISO))
      .slice(0, 20)
      .map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority ?? 'medium',
        dueTime: t.dueTime,
        isOverdue: isTaskOverdue(t, todayISO),
      }));
    if (candidates.length === 0) {
      setDayPlanError('Պլանավորման համար ակտիվ անելիքներ չկան։');
      return;
    }
    setDayPlanLoading(true);
    setDayPlanError('');
    try {
      const plan = await planDayWithAI({
        todayISO,
        currentHHMM: getCurrentHHMM(),
        focusGoal: focusGoal?.title,
        tasks: candidates,
      });
      setDayPlanPreview(plan);
    } catch (err) {
      setDayPlanError(
        err instanceof Error ? err.message : 'Հնարավոր չեղավ կազմել օրվա պլանը։'
      );
    } finally {
      setDayPlanLoading(false);
    }
  };

  const handleApplyDayPlan = () => {
    if (!dayPlanPreview || !onBatchUpdateTasks) return;
    onBatchUpdateTasks(
      dayPlanPreview.allocations.map((a) => ({
        id: a.taskId,
        dueTime: a.dueTime,
        priority: a.priority,
      }))
    );
    setDayPlanPreview(null);
  };

  const {
    completedCount,
    completedOneTimeCount,
    activeCount,
    overdueCount,
    repeatingCount,
  } = useMemo(() => {
    let doneToday = 0;
    let doneOneTime = 0;
    let overdue = 0;
    let repeating = 0;
    for (const t of tasks) {
      if (isTaskCompletedOnDate(t, todayISO)) doneToday++;
      if (t.completed && !isTaskRepeating(t)) doneOneTime++;
      if (isTaskOverdue(t, todayISO)) overdue++;
      if (isTaskRepeating(t)) repeating++;
    }
    return {
      completedCount: doneToday,
      completedOneTimeCount: doneOneTime,
      activeCount: tasks.length - doneToday,
      overdueCount: overdue,
      repeatingCount: repeating,
    };
  }, [tasks, todayISO]);

  const { habitsDoneToday, weeklyRatePct, bestStreak } = useMemo(() => {
    if (habits.length === 0) {
      return { habitsDoneToday: 0, weeklyRatePct: 0, bestStreak: 0 };
    }
    let doneToday = 0;
    let weeklyChecks = 0;
    let maxStreak = 0;
    const dateList = last7Days.map((d) => d.date);
    for (const h of habits) {
      if (h.completedDates.includes(todayISO)) doneToday++;
      weeklyChecks += dateList.filter((d) => h.completedDates.includes(d)).length;
      const streak = calculateStreak(h.completedDates, dateList);
      if (streak > maxStreak) maxStreak = streak;
    }
    return {
      habitsDoneToday: doneToday,
      weeklyRatePct: Math.round((weeklyChecks / (habits.length * 7)) * 100),
      bestStreak: maxStreak,
    };
  }, [habits, last7Days, todayISO]);

  const { todayFocusMinutes, weekFocusMinutes } = useMemo(() => {
    const weekSet = new Set(last7Days.map((d) => d.date));
    let todayMin = 0;
    let weekMin = 0;
    for (const s of focusSessions) {
      if (s.mode !== 'focus') continue;
      const d = s.date || s.completedAt.slice(0, 10);
      if (d === todayISO) todayMin += s.minutes;
      if (weekSet.has(d)) weekMin += s.minutes;
    }
    return { todayFocusMinutes: todayMin, weekFocusMinutes: weekMin };
  }, [focusSessions, last7Days, todayISO]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...tasks]
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
      .filter((t) => (!q ? true : t.title.toLowerCase().includes(q)))
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
  }, [tasks, todayISO, filter, scope, scheduleFilter, searchQuery, sortBy]);

  const hasTaskFilters =
    filter !== 'all' ||
    scope !== 'all' ||
    scheduleFilter !== 'all' ||
    Boolean(searchQuery);

  const mobileTabItems = useMemo(
    () => [
      {
        id: 'tasks' as const,
        label: 'Անելիքներ',
        icon: CheckSquare,
        count: activeCount,
      },
      {
        id: 'habits' as const,
        label: 'Սովորություններ',
        icon: Flame,
        count: habits.length,
      },
      {
        id: 'focus' as const,
        label: 'Ֆոկուս և սեսիաներ',
        icon: Timer,
        count: focusSessions.length,
      },
    ],
    [activeCount, habits.length, focusSessions.length]
  );

  return (
    <div className="space-y-5">
      <SubPageTabs
        mobileOnly
        items={mobileTabItems}
        activeId={activePage}
        onSelect={onSelectPage}
        ariaLabel="Օրակարգի ենթաբաժիններ"
      />

      <AnimatePresence mode="wait" onExitComplete={scrollToTopInstant}>
        <motion.div
          key={activePage}
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
          style={{ willChange: 'transform, opacity' }}
        >
          {/* PAGE 1: TASKS */}
          {activePage === 'tasks' && (
            <PageShell>
              <PageHeader
                title="Անելիքներ և ժամանակացույց"
                subtitle={`${activeCount} ընթացիկ անելիք · ${overdueCount} ժամկետանց`}
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    {onBatchUpdateTasks && activeCount > 0 && (
                      <button
                        type="button"
                        disabled={dayPlanLoading}
                        onClick={() => void handlePlanDayAI()}
                        className="min-h-[38px] px-3 py-2 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-xs sm:text-sm font-semibold text-[#1D4ED8] dark:text-[#60A5FA] hover:border-[#2563EB] dark:hover:border-[#3B82F6] inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                      >
                        {dayPlanLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        ) : (
                          <Sparkles className="w-4 h-4 shrink-0" />
                        )}
                        <span>{dayPlanLoading ? 'Պլանավորում է…' : 'AI օրվա պլան'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onOpenNewTaskModal}
                      className="min-h-[38px] px-3.5 py-2 rounded-xl btn-primary text-xs sm:text-sm inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4 shrink-0" />
                      <span>Նոր անելիք</span>
                    </button>
                  </div>
                }
              />

              {dayPlanError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
                  <span>{dayPlanError}</span>
                  <button
                    type="button"
                    onClick={() => setDayPlanError('')}
                    className="text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {dayPlanPreview && (
                <SectionCard
                  title="AI առաջարկվող օրվա ժամանակացույց"
                  subtitle={dayPlanPreview.strategyTip}
                  icon={Sparkles}
                  headerRight={
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleApplyDayPlan}
                        className="min-h-[32px] px-3 py-1 rounded-lg btn-primary text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Կիրառել բոլորին ({dayPlanPreview.allocations.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDayPlanPreview(null)}
                        aria-label="Փակել առաջարկը"
                        className="min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  }
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {dayPlanPreview.allocations.map((alloc) => {
                      const matched = tasks.find((t) => t.id === alloc.taskId);
                      if (!matched) return null;
                      return (
                        <div
                          key={alloc.taskId}
                          className="px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="font-mono font-semibold text-[#2563EB] dark:text-[#60A5FA] tabular-nums shrink-0">
                              {alloc.dueTime}
                            </span>
                            <span className="truncate font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                              {matched.title}
                            </span>
                          </div>
                          <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8] shrink-0">
                            {PRIORITY_LABELS[alloc.priority]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              )}

              <MetricStrip
                items={[
                  {
                    id: 'active',
                    label: 'Ընթացիկ անելիքներ',
                    value: String(activeCount),
                    hint: `Ընդամենը՝ ${tasks.length}`,
                  },
                  {
                    id: 'done-today',
                    label: 'Կատարված այսօր',
                    value: String(completedCount),
                    tone: completedCount > 0 ? 'positive' : 'default',
                  },
                  {
                    id: 'overdue',
                    label: 'Ժամկետանց',
                    value: String(overdueCount),
                    tone: overdueCount > 0 ? 'negative' : 'default',
                  },
                  {
                    id: 'repeating',
                    label: 'Կրկնվող գրաֆիկ',
                    value: String(repeatingCount),
                    tone: 'accent',
                    action: {
                      label: 'Ֆոկուս →',
                      onClick: () => onSelectPage('focus'),
                    },
                  },
                ]}
              />

              <SectionCard noPadding>
                {onAddTask && (
                  <form
                    onSubmit={handleQuickTaskSubmit}
                    className="px-4 sm:px-6 py-3 bg-[#F8FAFC] dark:bg-[#0B1120] border-b border-[#E2E8F0] dark:border-[#1E293B] flex flex-col sm:flex-row sm:items-center gap-2"
                  >
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <Plus
                        className="w-4 h-4 text-[#2563EB] dark:text-[#60A5FA] shrink-0"
                        aria-hidden="true"
                      />
                      <input
                        type="text"
                        value={quickTaskTitle}
                        onChange={(e) => setQuickTaskTitle(e.target.value)}
                        placeholder="Արագ ավելացնել այսօրվա անելիքը (Enter)..."
                        aria-label="Արագ ավելացնել անելիք"
                        className="w-full min-h-[38px] px-3 py-1.5 text-sm rounded-xl input-field"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <select
                        value={quickTaskPriority}
                        onChange={(e) =>
                          setQuickTaskPriority(e.target.value as TaskPriority)
                        }
                        aria-label="Անելիքի առաջնահերթություն"
                        className="min-h-[38px] px-2.5 py-1.5 text-xs rounded-xl input-field cursor-pointer"
                      >
                        <option value="high">Կարևոր</option>
                        <option value="medium">Միջին</option>
                        <option value="low">Սովորական</option>
                      </select>
                      <input
                        type="time"
                        value={quickTaskTime}
                        onChange={(e) => setQuickTaskTime(e.target.value)}
                        aria-label="Հիշեցման ժամ"
                        title="Ոչ պարտադիր ժամ"
                        className="min-h-[38px] px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-xl input-field"
                      />
                      <button
                        type="submit"
                        disabled={!quickTaskTitle.trim()}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-xl btn-primary text-xs font-semibold disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        Ավելացնել
                      </button>
                      <button
                        type="button"
                        disabled={!quickTaskTitle.trim() || aiBreakdownLoading}
                        onClick={() => void handleGenerateAISubtasks()}
                        title="Տրոհել մեծ նպատակը 3-6 կոնկրետ քայլերի AI-ով"
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA] hover:border-[#2563EB] dark:hover:border-[#3B82F6] disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        {aiBreakdownLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Bot className="w-3.5 h-3.5" />
                        )}
                        <span>{aiBreakdownLoading ? 'Մշակում է…' : 'AI քայլեր'}</span>
                      </button>
                    </div>
                  </form>
                )}

                {aiBreakdownError && (
                  <div className="px-4 sm:px-6 py-2.5 bg-rose-500/8 border-b border-[#E2E8F0] dark:border-[#1E293B] text-xs text-rose-700 dark:text-rose-300">
                    {aiBreakdownError}
                  </div>
                )}

                {aiSubtasks.length > 0 && onAddTask && (
                  <div className="px-4 sm:px-6 py-3.5 bg-[#EFF6FF]/50 dark:bg-[#172554]/25 border-b border-[#E2E8F0] dark:border-[#1E293B] space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA] inline-flex items-center gap-1.5">
                        <Bot className="w-3.5 h-3.5" />
                        <span>Առաջարկվող քայլեր ({aiSubtasks.filter((s) => s.selected).length}/{aiSubtasks.length})</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCommitAISubtasks}
                          disabled={!aiSubtasks.some((s) => s.selected)}
                          className="min-h-[30px] px-3 py-1 rounded-lg btn-primary text-xs font-semibold disabled:opacity-45 whitespace-nowrap"
                        >
                          Ավելացնել ընտրվածները
                        </button>
                        <button
                          type="button"
                          onClick={() => setAiSubtasks([])}
                          aria-label="Փակել առաջարկվող քայլերը"
                          className="min-h-[30px] min-w-[30px] rounded-lg flex items-center justify-center text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {aiSubtasks.map((step, idx) => (
                        <button
                          key={`${step.title}-${idx}`}
                          type="button"
                          onClick={() =>
                            setAiSubtasks((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, selected: !item.selected } : item
                              )
                            )
                          }
                          className="px-3 py-2 rounded-xl border border-[#CBD5E1]/80 dark:border-[#26334D] bg-white dark:bg-[#0F172A] flex items-center gap-2 text-left text-xs cursor-pointer"
                        >
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              step.selected
                                ? 'bg-[#2563EB] border-[#2563EB] text-white'
                                : 'border-[#CBD5E1] dark:border-[#334155]'
                            }`}
                          >
                            {step.selected && <Check className="w-2.5 h-2.5" strokeWidth={2.8} />}
                          </span>
                          <span className="flex-1 min-w-0 truncate text-[#0F172A] dark:text-[#F8FAFC] font-medium">
                            {step.title}
                          </span>
                          <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8] shrink-0">
                            {PRIORITY_LABELS[step.priority]}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

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

                    <div className="flex items-center gap-2">
                      <ArrowUpDown
                        className="w-3.5 h-3.5 text-[#64748B] dark:text-[#94A3B8] shrink-0"
                        aria-hidden="true"
                      />
                      <select
                        value={sortBy}
                        onChange={(e) =>
                          setSortBy(e.target.value as TaskSortMode)
                        }
                        aria-label="Տեսակավորել անելիքները"
                        className="min-h-[34px] px-2.5 py-1 text-xs rounded-xl input-field cursor-pointer"
                      >
                        <option value="priority-desc">Կարևորից սովորական</option>
                        <option value="priority-asc">Սովորականից կարևոր</option>
                        <option value="date-asc">Ըստ ժամկետի</option>
                        <option value="newest">Նոր ավելացվածներ</option>
                      </select>
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
                      const linkedTx = task.linkedTxId
                        ? txById.get(task.linkedTxId)
                        : undefined;
                      const expectedAmt =
                        task.expectedAmount && task.expectedAmount > 0
                          ? task.expectedAmount
                          : linkedTx?.amount;
                      const expectedCat =
                        task.expectedCategory || linkedTx?.category;

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
                              <p
                                className={`text-sm break-words ${
                                  doneToday
                                    ? 'line-through text-[#94A3B8] dark:text-[#64748B]'
                                    : 'text-[#0F172A] dark:text-[#F8FAFC] font-medium'
                                }`}
                              >
                                {task.title}
                              </p>
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
                                <span
                                  className={`inline-flex items-center gap-1 ${
                                    repeating
                                      ? 'text-[#2563EB] dark:text-[#60A5FA] font-medium'
                                      : ''
                                  }`}
                                >
                                  {schedule === 'weekdays' ? (
                                    <CalendarDays className="w-3 h-3" />
                                  ) : repeating ? (
                                    <Repeat className="w-3 h-3" />
                                  ) : null}
                                  <span>{getTaskScheduleLabel(task)}</span>
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
                                {expectedAmt && expectedAmt > 0 && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="pa-sensitive font-mono text-amber-600 dark:text-amber-400 font-medium">
                                      Նախածախս՝ -{formatMoney(expectedAmt, 'AMD')}
                                      {expectedCat ? ` (${expectedCat})` : ''}
                                      {linkedTx && !linkedTx.isPending ? ' ✓' : ''}
                                    </span>
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
                            {linkedTx?.isPending && onConfirmPreExpense && (
                              <button
                                type="button"
                                onClick={() => onConfirmPreExpense(linkedTx.id)}
                                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 text-xs font-semibold cursor-pointer whitespace-nowrap"
                              >
                                Հաստատել ծախսը
                              </button>
                            )}

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
              </SectionCard>
            </PageShell>
          )}

          {/* PAGE 2: HABITS */}
          {activePage === 'habits' && (
            <PageShell>
              <PageHeader
                title="Ամենօրյա սովորություններ"
                subtitle={`${habits.length} սովորություն · վերջին 7 օրվա առաջընթաց`}
                actions={
                  <button
                    type="button"
                    onClick={onOpenNewHabitModal}
                    className="min-h-[38px] px-3.5 py-2 rounded-xl btn-primary text-xs sm:text-sm inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span>Նոր սովորություն</span>
                  </button>
                }
              />

              <MetricStrip
                items={[
                  {
                    id: 'total-habits',
                    label: 'Սովորություններ',
                    value: String(habits.length),
                  },
                  {
                    id: 'done-today',
                    label: 'Այսօր կատարված',
                    value: `${habitsDoneToday}/${habits.length}`,
                    tone:
                      habits.length > 0 && habitsDoneToday === habits.length
                        ? 'positive'
                        : 'accent',
                  },
                  {
                    id: 'weekly-rate',
                    label: 'Շաբաթական տեմպ',
                    value: `${weeklyRatePct}%`,
                    tone: weeklyRatePct >= 70 ? 'positive' : 'default',
                  },
                  {
                    id: 'best-streak',
                    label: 'Լավագույն սերիա',
                    value: `${bestStreak} օր`,
                    tone: bestStreak >= 3 ? 'warning' : 'default',
                  },
                ]}
              />

              <SectionCard noPadding>
                {habits.length === 0 ? (
                  <div className="p-5 sm:p-6">
                    <EmptyStatePlaceholder
                      icon={Flame}
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
                                      onClick={() =>
                                        onToggleHabitDate(habit.id, d.date)
                                      }
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
                                      {done && (
                                        <Check className="w-4 h-4" strokeWidth={2.5} />
                                      )}
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
                              <div className="font-mono tabular-nums">
                                {d.dayNum}
                              </div>
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
                                      onClick={() =>
                                        onToggleHabitDate(habit.id, d.date)
                                      }
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
                                      {done && (
                                        <Check className="w-4 h-4" strokeWidth={2.5} />
                                      )}
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
              </SectionCard>
            </PageShell>
          )}

          {/* PAGE 3: FOCUS TIMER & SESSIONS */}
          {activePage === 'focus' && (
            <PageShell>
              <PageHeader
                title="Ֆոկուս թայմեր և սեսիաներ"
                subtitle={
                  focusGoal
                    ? `Օրվա գլխավոր նպատակ՝ ${focusGoal.title}`
                    : 'Պոմոդորո սեսիաներ, ֆոնային հնչյուններ և կենտրոնացման վիճակագրություն'
                }
              />

              <MetricStrip
                items={[
                  {
                    id: 'today-focus',
                    label: 'Այսօրվա ֆոկուս',
                    value: `${todayFocusMinutes} ր`,
                    hint: 'Օրական թիրախ՝ 90 ր',
                    tone: todayFocusMinutes >= 90 ? 'positive' : 'accent',
                  },
                  {
                    id: 'week-focus',
                    label: 'Շաբաթական ֆոկուս',
                    value: `${weekFocusMinutes} ր`,
                    hint: 'Վերջին 7 օրում',
                  },
                  {
                    id: 'sessions-count',
                    label: 'Ավարտված սեսիաներ',
                    value: String(focusSessions.length),
                    tone: 'default',
                  },
                  {
                    id: 'daily-goal',
                    label: 'Օրվա նպատակ',
                    value: focusGoal
                      ? focusGoal.completed
                        ? 'Կատարված'
                        : 'Ընթացքում'
                      : 'Սահմանված չէ',
                    hint: focusGoal ? focusGoal.title : 'Կարգավորեք Ընդհանուր էջում',
                    tone: focusGoal?.completed ? 'positive' : 'default',
                  },
                ]}
              />

              <FocusTimerCard
                tasks={tasks}
                focusGoal={focusGoal}
                focusSessions={focusSessions}
                soundEnabled={soundEnabled}
                browserNotifications={browserNotifications}
                notificationSettings={notificationSettings}
                onCompleteSession={onCompleteFocusSession}
              />

              <SectionCard
                title="Վերջին ֆոկուս սեսիաները"
                subtitle={`Գրանցված է ${focusSessions.length} սեսիա`}
                icon={Clock}
                noPadding
              >
                {focusSessions.length === 0 ? (
                  <div className="p-5 sm:p-6">
                    <EmptyStatePlaceholder
                      compact
                      icon={Timer}
                      title="Ավարտված սեսիաներ դեռ չկան"
                      description="Սկսեք ձեր առաջին ֆոկուս սեսիան վերևի թայմերով՝ կենտրոնացման պատմությունը կառուցելու համար։"
                    />
                  </div>
                ) : (
                  <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
                    {focusSessions.slice(0, 8).map((s) => (
                      <div
                        key={s.id}
                        className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3 text-xs sm:text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                            {s.label || (s.mode === 'break' ? 'Ընդմիջում' : 'Կենտրոնացման սեսիա')}
                          </p>
                          <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                            {s.mode === 'break' ? 'Ընդմիջում' : 'Ֆոկուս'} ·{' '}
                            {formatShortDate(s.completedAt.slice(0, 10))} ·{' '}
                            <span className="font-mono">
                              {s.completedAt.slice(11, 16)}
                            </span>
                          </p>
                        </div>
                        <span className="font-mono font-semibold text-[#2563EB] dark:text-[#60A5FA] tabular-nums shrink-0">
                          {s.minutes} ր
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </PageShell>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
});
