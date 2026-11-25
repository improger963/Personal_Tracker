import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Flame,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Habit, Task, TaskPriority } from '../types';
import {
  formatShortDate,
  getLastNDaysISO,
  getTodayISO,
} from '../data/defaults';

interface PlannerViewProps {
  tasks: Task[];
  onAddTask: (task: Omit<Task, 'id' | 'completed' | 'createdAt'>) => void;
  onToggleTask: (id: string) => void;
  onUpdateTask: (
    id: string,
    updates: Omit<Task, 'id' | 'completed' | 'createdAt'>
  ) => void;
  onUpdateTaskPriority: (id: string, priority: TaskPriority) => void;
  onDeleteTask: (id: string) => void;
  onClearCompleted: () => void;
  habits: Habit[];
  onAddHabit: (title: string) => void;
  onUpdateHabit: (habitId: string, title: string) => void;
  onToggleHabitDate: (habitId: string, date: string) => void;
  onDeleteHabit: (habitId: string) => void;
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
  onAddTask,
  onToggleTask,
  onUpdateTask,
  onUpdateTaskPriority,
  onDeleteTask,
  onClearCompleted,
  habits,
  onAddHabit,
  onUpdateHabit,
  onToggleHabitDate,
  onDeleteHabit,
}: PlannerViewProps) {
  const [subTab, setSubTab] = useState<'tasks' | 'habits'>('tasks');

  // Task creation state
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueTime, setDueTime] = useState('');
  const [date, setDate] = useState(getTodayISO());

  // Task filter & sort state
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [scope, setScope] = useState<TaskScopeMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<TaskSortMode>('priority-desc');

  // Inline task editing state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPriority, setEditPriority] = useState<TaskPriority>('medium');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');

  // Habit creation & editing state
  const [habitTitle, setHabitTitle] = useState('');
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [editHabitTitle, setEditHabitTitle] = useState('');

  const last7Days = getLastNDaysISO(7);
  const todayISO = getTodayISO();

  const handleTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAddTask({
      title: trimmed,
      priority,
      dueTime: dueTime || undefined,
      date: date || getTodayISO(),
    });
    setTitle('');
    setDueTime('');
  };

  const startEditTask = (task: Task) => {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditPriority(task.priority ?? 'medium');
    setEditDate(task.date);
    setEditTime(task.dueTime ?? '');
  };

  const cancelEditTask = () => {
    setEditingTaskId(null);
    setEditTitle('');
    setEditDate('');
    setEditTime('');
  };

  const handleSaveTaskEdit = (e: React.FormEvent, taskId: string) => {
    e.preventDefault();
    const trimmed = editTitle.trim();
    if (!trimmed) return;
    onUpdateTask(taskId, {
      title: trimmed,
      priority: editPriority,
      date: editDate || getTodayISO(),
      dueTime: editTime || undefined,
    });
    cancelEditTask();
  };

  const handleHabitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = habitTitle.trim();
    if (!trimmed) return;
    onAddHabit(trimmed);
    setHabitTitle('');
  };

  const startEditHabit = (habit: Habit) => {
    setEditingHabitId(habit.id);
    setEditHabitTitle(habit.title);
  };

  const saveEditHabit = (e: React.FormEvent, habitId: string) => {
    e.preventDefault();
    if (!editHabitTitle.trim()) return;
    onUpdateHabit(habitId, editHabitTitle);
    setEditingHabitId(null);
    setEditHabitTitle('');
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const activeCount = tasks.length - completedCount;
  const overdueCount = tasks.filter(
    (t) => !t.completed && t.date < todayISO
  ).length;

  const filteredTasks = [...tasks]
    .filter((t) => {
      if (filter === 'active') return !t.completed;
      if (filter === 'completed') return t.completed;
      return true;
    })
    .filter((t) => {
      if (scope === 'today') return t.date === todayISO;
      if (scope === 'upcoming') return t.date > todayISO;
      if (scope === 'overdue') return !t.completed && t.date < todayISO;
      return true;
    })
    .filter((t) => {
      if (!searchQuery.trim()) return true;
      return t.title.toLowerCase().includes(searchQuery.trim().toLowerCase());
    })
    .sort((a, b) => {
      if (a.completed !== b.completed) {
        return Number(a.completed) - Number(b.completed);
      }

      const pA = PRIORITY_RANK[a.priority ?? 'medium'];
      const pB = PRIORITY_RANK[b.priority ?? 'medium'];

      if (sortBy === 'priority-desc') {
        if (pA !== pB) return pA - pB;
        return `${a.date} ${a.dueTime ?? '99:99'}`.localeCompare(
          `${b.date} ${b.dueTime ?? '99:99'}`
        );
      }
      if (sortBy === 'priority-asc') {
        if (pA !== pB) return pB - pA;
        return `${a.date} ${a.dueTime ?? '99:99'}`.localeCompare(
          `${b.date} ${b.dueTime ?? '99:99'}`
        );
      }
      if (sortBy === 'date-asc') {
        const cmp = `${a.date} ${a.dueTime ?? '99:99'}`.localeCompare(
          `${b.date} ${b.dueTime ?? '99:99'}`
        );
        if (cmp !== 0) return cmp;
        return pA - pB;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

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

        <div className="inline-flex items-center gap-1 p-1 rounded-xl surface-subtle self-start">
          <button
            type="button"
            onClick={() => setSubTab('tasks')}
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
            onClick={() => setSubTab('habits')}
            className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'habits'
                ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                : 'text-[#64748B] dark:text-[#94A3B8]'
            }`}
          >
            Սովորություններ
          </button>
        </div>
      </div>

      {/* TASKS TAB */}
      {subTab === 'tasks' && (
        <>
          <form
            onSubmit={handleTaskSubmit}
            className="surface-card p-5 space-y-3"
          >
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ի՞նչ է պետք անել այսօր..."
                className="flex-1 min-h-[44px] px-4 py-2 text-sm rounded-xl input-field"
              />
              <button
                type="submit"
                className="min-h-[44px] px-5 py-2.5 rounded-xl btn-primary text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Ավելացնել</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  Առաջնահերթություն․
                </span>
                <div
                  className="inline-flex items-center gap-1 p-1 rounded-xl surface-subtle"
                  role="radiogroup"
                  aria-label="Ընտրել առաջնահերթություն"
                >
                  {PRIORITY_OPTIONS.map((opt) => {
                    const active = priority === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setPriority(opt.id)}
                        className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] font-semibold shadow-xs'
                            : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${opt.dotClass}`}
                          aria-hidden="true"
                        />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
                <div className="flex items-center gap-1.5 min-w-0">
                  <label
                    htmlFor="task-date"
                    className="text-xs text-[#64748B] dark:text-[#94A3B8] shrink-0"
                  >
                    Օր․
                  </label>
                  <input
                    id="task-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full min-h-[36px] px-2.5 py-1 text-xs font-mono tabular-nums rounded-lg input-field"
                  />
                </div>

                <div className="flex items-center gap-1.5 min-w-0">
                  <label
                    htmlFor="task-time"
                    className="text-xs text-[#64748B] dark:text-[#94A3B8] shrink-0"
                  >
                    Ժամ․
                  </label>
                  <input
                    id="task-time"
                    type="time"
                    value={dueTime}
                    onChange={(e) => setDueTime(e.target.value)}
                    className="w-full min-h-[36px] px-2.5 py-1 text-xs font-mono tabular-nums rounded-lg input-field"
                  />
                </div>
              </div>
            </div>
          </form>

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

                  {completedCount > 0 && (
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

            {filteredTasks.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <p className="text-sm text-[#64748B] dark:text-[#94A3B8]">
                  {tasks.length === 0
                    ? 'Դեռ անելիքներ չկան։ Ավելացրեք առաջինը վերևից։'
                    : 'Ընտրված զտիչներով անելիքներ չեն գտնվել։'}
                </p>
                {(filter !== 'all' || scope !== 'all' || searchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilter('all');
                      setScope('all');
                      setSearchQuery('');
                    }}
                    className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
                  >
                    Մաքրել զտիչները
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
                {filteredTasks.map((task) => {
                  const taskPriority = task.priority ?? 'medium';
                  const priorityMeta =
                    PRIORITY_OPTIONS.find((p) => p.id === taskPriority) ??
                    PRIORITY_OPTIONS[1];
                  const isOverdue = !task.completed && task.date < todayISO;
                  const isEditing = editingTaskId === task.id;

                  if (isEditing) {
                    return (
                      <form
                        key={task.id}
                        onSubmit={(e) => handleSaveTaskEdit(e, task.id)}
                        className="px-4 sm:px-6 py-3.5 bg-[#EFF6FF]/60 dark:bg-[#172554]/30 space-y-2.5"
                      >
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          autoFocus
                          className="w-full min-h-[40px] px-3 py-1.5 text-sm rounded-xl input-field"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={editPriority}
                              onChange={(e) =>
                                setEditPriority(e.target.value as TaskPriority)
                              }
                              aria-label="Առաջնահերթություն"
                              className="min-h-[36px] px-2.5 py-1 text-xs rounded-lg input-field"
                            >
                              <option value="high">Կարևոր</option>
                              <option value="medium">Միջին</option>
                              <option value="low">Սովորական</option>
                            </select>
                            <input
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="min-h-[36px] px-2.5 py-1 text-xs font-mono tabular-nums rounded-lg input-field"
                            />
                            <input
                              type="time"
                              value={editTime}
                              onChange={(e) => setEditTime(e.target.value)}
                              className="min-h-[36px] px-2.5 py-1 text-xs font-mono tabular-nums rounded-lg input-field"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={cancelEditTask}
                              className="min-h-[36px] px-3 py-1 rounded-lg border border-[#CBD5E1] dark:border-[#26334D] text-xs font-medium text-[#475569] dark:text-[#CBD5E1] cursor-pointer"
                            >
                              Չեղարկել
                            </button>
                            <button
                              type="submit"
                              className="min-h-[36px] px-3.5 py-1 rounded-lg btn-primary text-xs"
                            >
                              Պահպանել
                            </button>
                          </div>
                        </div>
                      </form>
                    );
                  }

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
                            task.completed
                              ? 'bg-[#2563EB] border-[#2563EB] dark:bg-[#3B82F6] dark:border-[#3B82F6] text-white dark:text-[#060B16]'
                              : 'border-[#CBD5E1] dark:border-[#334155]'
                          }`}
                        >
                          {task.completed && (
                            <Check className="w-3 h-3" strokeWidth={2.7} />
                          )}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm break-words ${
                              task.completed
                                ? 'line-through text-[#94A3B8] dark:text-[#64748B]'
                                : 'text-[#0F172A] dark:text-[#F8FAFC] font-medium'
                            }`}
                          >
                            {task.title}
                          </p>
                          <p className="text-xs text-[#64748B] dark:text-[#94A3B8] flex flex-wrap items-center gap-1.5 mt-0.5 tabular-nums">
                            <span
                              className={`inline-flex items-center gap-1.5 ${
                                !task.completed ? priorityMeta.textClass : ''
                              } ${
                                !task.completed && taskPriority === 'high'
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
                              className={
                                isOverdue
                                  ? 'text-rose-600 dark:text-rose-400 font-medium'
                                  : ''
                              }
                            >
                              {formatShortDate(task.date)}
                            </span>
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
                            {task.completed && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  Կատարված
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
                          onClick={() => startEditTask(task)}
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
        <div className="space-y-6">
          <form
            onSubmit={handleHabitSubmit}
            className="surface-card p-5 flex flex-col sm:flex-row gap-3"
          >
            <input
              type="text"
              value={habitTitle}
              onChange={(e) => setHabitTitle(e.target.value)}
              placeholder="Ավելացնել նոր սովորություն (օրինակ՝ 20 րոպե անգլերեն)..."
              className="flex-1 min-h-[44px] px-4 py-2 text-sm rounded-xl input-field"
            />
            <button
              type="submit"
              className="min-h-[44px] px-5 py-2.5 rounded-xl btn-primary text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Ավելացնել</span>
            </button>
          </form>

          <section className="surface-card overflow-hidden">
            {habits.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm text-[#64748B] dark:text-[#94A3B8]">
                  Սովորությունների ցանկը դատարկ է։ Ստեղծեք առաջինը վերևից։
                </p>
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
                            {editingHabitId === habit.id ? (
                              <form
                                onSubmit={(e) => saveEditHabit(e, habit.id)}
                                className="flex items-center gap-1.5"
                              >
                                <input
                                  type="text"
                                  value={editHabitTitle}
                                  onChange={(e) =>
                                    setEditHabitTitle(e.target.value)
                                  }
                                  autoFocus
                                  className="flex-1 min-w-0 min-h-[36px] px-2.5 py-1 text-sm rounded-lg input-field"
                                />
                                <button
                                  type="submit"
                                  aria-label="Պահպանել սովորությունը"
                                  className="min-h-[36px] min-w-[36px] rounded-lg btn-primary flex items-center justify-center shrink-0"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingHabitId(null)}
                                  aria-label="Չեղարկել"
                                  className="min-h-[36px] min-w-[36px] rounded-lg border border-[#CBD5E1] dark:border-[#26334D] flex items-center justify-center shrink-0"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </form>
                            ) : (
                              <>
                                <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] break-words">
                                  {habit.title}
                                </p>
                                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1.5 tabular-nums mt-0.5">
                                  <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  <span>Սերիա՝ {streak} օր</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{weeklyDone}/7 այս շաբաթ</span>
                                </p>
                              </>
                            )}
                          </div>
                          {editingHabitId !== habit.id && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => startEditHabit(habit)}
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
                          )}
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
                            {editingHabitId === habit.id ? (
                              <form
                                onSubmit={(e) => saveEditHabit(e, habit.id)}
                                className="flex items-center gap-1.5"
                              >
                                <input
                                  type="text"
                                  value={editHabitTitle}
                                  onChange={(e) =>
                                    setEditHabitTitle(e.target.value)
                                  }
                                  autoFocus
                                  className="flex-1 min-w-0 min-h-[34px] px-2.5 py-1 text-sm rounded-lg input-field"
                                />
                                <button
                                  type="submit"
                                  aria-label="Պահպանել սովորությունը"
                                  className="min-h-[34px] min-w-[34px] rounded-lg btn-primary flex items-center justify-center shrink-0"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingHabitId(null)}
                                  aria-label="Չեղարկել"
                                  className="min-h-[34px] min-w-[34px] rounded-lg border border-[#CBD5E1] dark:border-[#26334D] flex items-center justify-center shrink-0 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </form>
                            ) : (
                              <>
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
                              </>
                            )}
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
                              onClick={() => startEditHabit(habit)}
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
        </div>
      )}
    </div>
  );
}
