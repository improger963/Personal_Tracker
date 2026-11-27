import { memo, useMemo, useState } from 'react';
import {
  Bot,
  Check,
  CheckSquare,
  Loader2,
  NotebookPen,
  Pencil,
  Pin,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import {
  MetricStrip,
  PageHeader,
  PageShell,
} from './layout/PagePrimitives';
import { EmptyStatePlaceholder } from './ui/Skeleton';
import { Note } from '../types';
import {
  formatMoney,
  formatReminderLabel,
  getTodayISO,
} from '../data/defaults';
import { extractChecklistAmounts } from '../utils/smartCommandParser';
import { breakdownTaskWithAI } from '../services/smartAi';
import { TaskPriority } from '../types';

interface NotesViewProps {
  notes: Note[];
  onOpenNewNoteModal: () => void;
  onEditNote: (note: Note) => void;
  onTogglePin: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onConvertToTask: (note: Note) => void;
  onToggleChecklistItem: (noteId: string, itemId: string) => void;
  onLogShoppingExpense: (note: Note, estimatedTotal?: number) => void;
  onCreateTasksFromNoteAI?: (
    noteTitle: string,
    tasks: Array<{ title: string; priority: TaskPriority; dueTime?: string }>
  ) => void;
}

export const NotesView = memo(function NotesView({
  notes,
  onOpenNewNoteModal,
  onEditNote,
  onTogglePin,
  onDeleteNote,
  onConvertToTask,
  onToggleChecklistItem,
  onLogShoppingExpense,
  onCreateTasksFromNoteAI,
}: NotesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'pinned' | 'reminders'>(
    'all'
  );
  const [breakingNoteId, setBreakingNoteId] = useState<string | null>(null);
  const [aiError, setAiError] = useState('');

  const todayISO = getTodayISO();

  const handleBreakdownNote = async (note: Note) => {
    if (!onCreateTasksFromNoteAI || breakingNoteId) return;
    const checklistText = (note.checklist ?? [])
      .filter((c) => !c.done)
      .map((c) => c.text)
      .join(', ');
    const combined = [note.title, note.content, checklistText]
      .filter(Boolean)
      .join('\n')
      .trim();
    if (!combined) return;
    setBreakingNoteId(note.id);
    setAiError('');
    try {
      const steps = await breakdownTaskWithAI({
        text: combined,
        todayISO,
      });
      if (steps.length > 0) {
        onCreateTasksFromNoteAI(note.title, steps);
      } else {
        setAiError('Նշումից չհաջողվեց առանձնացնել քայլեր։');
      }
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Հնարավոր չեղավ տրոհել նշումը AI-ով։'
      );
    } finally {
      setBreakingNoteId(null);
    }
  };

  const { pinnedCount, remindersCount, checklistNotesCount } = useMemo(() => {
    let pinned = 0;
    let reminders = 0;
    let checklists = 0;
    for (const n of notes) {
      if (n.pinned) pinned++;
      if (n.reminderDate) reminders++;
      if ((n.checklist?.length ?? 0) > 0) checklists++;
    }
    return {
      pinnedCount: pinned,
      remindersCount: reminders,
      checklistNotesCount: checklists,
    };
  }, [notes]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...notes]
      .filter((n) => {
        if (filterMode === 'pinned') return n.pinned;
        if (filterMode === 'reminders') return Boolean(n.reminderDate);
        return true;
      })
      .filter((n) => {
        if (!q) return true;
        const inChecklist = (n.checklist ?? []).some((c) =>
          c.text.toLowerCase().includes(q)
        );
        return (
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          inChecklist
        );
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [notes, filterMode, searchQuery]);

  const hasFilters = filterMode !== 'all' || Boolean(searchQuery);

  return (
    <PageShell>
      <PageHeader
        title="Անձնական նշումներ և հիշեցումներ"
        subtitle="Մտքեր, գնումների ցուցակներ և կարևոր հիշեցումներ մեկ տեղում"
        actions={
          <button
            type="button"
            onClick={onOpenNewNoteModal}
            className="min-h-[38px] px-3.5 py-2 rounded-xl btn-primary text-xs sm:text-sm inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Նոր նշում</span>
          </button>
        }
      />

      <MetricStrip
        items={[
          {
            id: 'total-notes',
            label: 'Ընդհանուր նշումներ',
            value: String(notes.length),
          },
          {
            id: 'pinned-notes',
            label: 'Ամրացված',
            value: String(pinnedCount),
            tone: pinnedCount > 0 ? 'accent' : 'default',
          },
          {
            id: 'reminder-notes',
            label: 'Ակտիվ հիշեցումներ',
            value: String(remindersCount),
            tone: remindersCount > 0 ? 'warning' : 'default',
          },
          {
            id: 'checklist-notes',
            label: 'Գնումների ցուցակներ',
            value: String(checklistNotesCount),
            tone: 'positive',
          },
        ]}
      />

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl surface-subtle self-start max-w-full">
          {(
            [
              { id: 'all', label: 'Բոլորը' },
              { id: 'pinned', label: 'Ամրացված' },
              { id: 'reminders', label: 'Հիշեցումներ' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterMode(tab.id)}
              className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                filterMode === tab.id
                  ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                  : 'text-[#64748B] dark:text-[#94A3B8]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Որոնել նշումներում..."
            className="w-full min-h-[38px] pl-9 pr-3 py-1.5 text-sm rounded-xl input-field"
          />
        </div>
      </div>

      {aiError && (
        <div className="px-4 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/8 text-xs text-rose-700 dark:text-rose-300">
          {aiError}
        </div>
      )}

      {filteredNotes.length === 0 ? (
        <div className="surface-card p-5 sm:p-6">
          <EmptyStatePlaceholder
            icon={NotebookPen}
            title={
              notes.length === 0
                ? 'Պահպանված նշումներ դեռ չկան'
                : 'Որոնմանը համապատասխան նշումներ չկան'
            }
            description={
              notes.length === 0
                ? 'Ստեղծեք ձեր առաջին նշումը, ցուցակը կամ հիշեցումը մեկ հպումով։'
                : 'Փորձեք փոխել զտիչները կամ մաքրել որոնման տեքստը։'
            }
            actionLabel={
              hasFilters ? 'Մաքրել զտիչները' : '+ Գրել առաջին նշումը'
            }
            onAction={
              hasFilters
                ? () => {
                    setFilterMode('all');
                    setSearchQuery('');
                  }
                : onOpenNewNoteModal
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map((note) => {
            const isDue =
              Boolean(note.reminderDate) &&
              note.reminderDate!.slice(0, 10) <= todayISO;
            const checklist = note.checklist ?? [];
            const doneCount = checklist.filter((c) => c.done).length;
            const checklistPct =
              checklist.length > 0
                ? Math.round((doneCount / checklist.length) * 100)
                : 0;
            const { totalEstimated, uncheckedEstimated, matchedCount } =
              extractChecklistAmounts(checklist);
            const expensePrefillAmount =
              uncheckedEstimated > 0
                ? uncheckedEstimated
                : totalEstimated > 0
                  ? totalEstimated
                  : undefined;

            return (
              <article
                key={note.id}
                className={`surface-card content-auto p-4 sm:p-5 min-w-0 flex flex-col justify-between gap-4 transition-colors ${
                  note.pinned
                    ? 'border-[#BFDBFE] dark:border-[#1E3A8A]'
                    : ''
                }`}
              >
                <div className="space-y-3 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC] break-words min-w-0">
                      {note.title}
                    </h2>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onConvertToTask(note)}
                        title="Ավելացնել անելիքների մեջ"
                        aria-label={`Ավելացնել «${note.title}» որպես անելիք`}
                        className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-[#2563EB] dark:hover:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#172554]/50 transition-colors cursor-pointer"
                      >
                        <CheckSquare className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditNote(note)}
                        aria-label={`Խմբագրել ${note.title}`}
                        className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onTogglePin(note.id)}
                        aria-label={
                          note.pinned ? 'Ապաամրացնել նշումը' : 'Ամրացնել նշումը'
                        }
                        className={`min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl transition-colors cursor-pointer ${
                          note.pinned
                            ? 'text-[#2563EB] dark:text-[#60A5FA] bg-[#2563EB]/10 dark:bg-[#3B82F6]/15'
                            : 'text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B]'
                        }`}
                      >
                        <Pin className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteNote(note.id)}
                        aria-label={`Ջնջել ${note.title}`}
                        className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {note.content && (
                    <p className="text-sm text-[#475569] dark:text-[#CBD5E1] leading-relaxed whitespace-pre-line break-words">
                      {note.content}
                    </p>
                  )}

                  {/* Interactive Checklist on Card */}
                  {checklist.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                        <span>
                          Կատարված՝ {doneCount}/{checklist.length}
                        </span>
                        <div className="flex items-center gap-2">
                          {matchedCount > 0 && (
                            <span className="pa-sensitive font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                              ≈ {formatMoney(totalEstimated)}
                            </span>
                          )}
                          <span className="font-mono font-semibold">
                            {checklistPct}%
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#E2E8F0] dark:bg-[#1E293B] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            doneCount === checklist.length
                              ? 'bg-emerald-500'
                              : 'bg-[#2563EB] dark:bg-[#3B82F6]'
                          }`}
                          style={{
                            width: `${
                              checklistPct > 0 ? Math.max(4, checklistPct) : 0
                            }%`,
                          }}
                        />
                      </div>

                      <div className="space-y-1 pt-1">
                        {checklist.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() =>
                              onToggleChecklistItem(note.id, item.id)
                            }
                            className="w-full min-h-[38px] sm:min-h-[32px] px-2 py-1.5 rounded-lg flex items-center gap-2.5 text-left text-xs hover:bg-[#F8FAFC] dark:hover:bg-[#162033] transition-colors cursor-pointer"
                          >
                            <span
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                item.done
                                  ? 'bg-[#2563EB] border-[#2563EB] dark:bg-[#3B82F6] dark:border-[#3B82F6] text-white dark:text-[#060B16]'
                                  : 'border-[#CBD5E1] dark:border-[#334155]'
                              }`}
                            >
                              {item.done && (
                                <Check className="w-2.5 h-2.5" strokeWidth={2.8} />
                              )}
                            </span>
                            <span
                              className={`break-words flex-1 ${
                                item.done
                                  ? 'line-through text-[#94A3B8] dark:text-[#64748B]'
                                  : 'text-[#0F172A] dark:text-[#F8FAFC]'
                              }`}
                            >
                              {item.text}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-[#F1F5F9] dark:border-[#1E293B] flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                  <span
                    className={
                      isDue
                        ? 'text-amber-600 dark:text-amber-400 font-medium'
                        : ''
                    }
                  >
                    {note.reminderDate
                      ? `Հիշեցում · ${formatReminderLabel(note.reminderDate)}`
                      : checklist.length > 0
                        ? `Ցուցակ · ${checklist.length} կետ`
                        : 'Անձնական նշում'}
                  </span>

                  <div className="flex flex-wrap items-center gap-2">
                    {onCreateTasksFromNoteAI &&
                      (note.content.trim().length > 10 || checklist.length > 0) && (
                        <button
                          type="button"
                          disabled={breakingNoteId === note.id}
                          onClick={() => void handleBreakdownNote(note)}
                          className="min-h-[34px] sm:min-h-[30px] px-2.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] text-[#1D4ED8] dark:text-[#60A5FA] hover:border-[#2563EB] text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                          title="Ստեղծել քայլերի անելիքներ AI-ով"
                        >
                          {breakingNoteId === note.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Bot className="w-3 h-3" />
                          )}
                          <span>AI քայլեր</span>
                        </button>
                      )}
                    {checklist.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          onLogShoppingExpense(note, expensePrefillAmount)
                        }
                        className="min-h-[34px] sm:min-h-[30px] px-2.5 py-1 rounded-lg bg-[#EFF6FF] dark:bg-[#172554]/60 text-[#2563EB] dark:text-[#60A5FA] hover:bg-[#DBEAFE] dark:hover:bg-[#172554] text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                        title="Բացել ծախսի գրանցումը այս ցուցակի վերնագրով"
                      >
                        <ShoppingBag className="w-3 h-3" />
                        <span>
                          {expensePrefillAmount ? (
                            <>
                              Գրանցել (
                              <span className="pa-sensitive font-mono tabular-nums">
                                {formatMoney(expensePrefillAmount)}
                              </span>
                              )
                            </>
                          ) : (
                            'Գրանցել որպես ծախս'
                          )}
                        </span>
                      </button>
                    )}
                    {note.pinned && (
                      <span className="text-[#2563EB] dark:text-[#60A5FA] font-semibold">
                        Ամրացված
                      </span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </PageShell>
  );
});
