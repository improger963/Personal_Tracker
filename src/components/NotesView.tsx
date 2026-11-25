import { useState } from 'react';
import {
  CheckSquare,
  Pencil,
  Pin,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Note } from '../types';
import { formatReminderLabel, getTodayISO } from '../data/defaults';

interface NotesViewProps {
  notes: Note[];
  onAddNote: (note: Omit<Note, 'id' | 'updatedAt'>) => void;
  onUpdateNote: (id: string, updates: Omit<Note, 'id' | 'updatedAt' | 'pinned'>) => void;
  onTogglePin: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onConvertToTask: (note: Note) => void;
}

export function NotesView({
  notes,
  onAddNote,
  onUpdateNote,
  onTogglePin,
  onDeleteNote,
  onConvertToTask,
}: NotesViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [formError, setFormError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'pinned' | 'reminders'>('all');

  const todayISO = getTodayISO();

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setContent('');
    setReminderDate('');
    setFormError('');
  };

  const handleStartEdit = (note: Note) => {
    setEditingId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setReminderDate(note.reminderDate ?? '');
    setFormError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !content.trim()) {
      setFormError('Գրեք վերնագիր կամ նշման տեքստ։');
      return;
    }
    setFormError('');
    if (editingId) {
      onUpdateNote(editingId, {
        title: title.trim() || 'Առանց վերնագրի',
        content: content.trim(),
        reminderDate: reminderDate || undefined,
      });
    } else {
      onAddNote({
        title: title.trim() || 'Առանց վերնագրի',
        content: content.trim(),
        reminderDate: reminderDate || undefined,
        pinned: false,
      });
    }
    resetForm();
  };

  const filteredNotes = [...notes]
    .filter((n) => {
      if (filterMode === 'pinned') return n.pinned;
      if (filterMode === 'reminders') return Boolean(n.reminderDate);
      return true;
    })
    .filter((n) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
          Անձնական նշումներ և հիշեցումներ
        </h1>
        <p className="text-sm text-[#64748B] dark:text-[#94A3B8]">
          Մտքեր, ցուցակներ և կարևոր հիշեցումներ մեկ տեղում
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-4 min-w-0 surface-card p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
              {editingId ? 'Խմբագրել նշումը' : 'Նոր նշում'}
            </h3>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-medium text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] cursor-pointer"
              >
                Չեղարկել
              </button>
            )}
          </div>

          <div>
            <label
              htmlFor="note-title"
              className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1.5"
            >
              Վերնագիր
            </label>
            <input
              id="note-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Օրինակ՝ Գնումների ցուցակ"
              className="w-full min-h-[42px] px-3.5 py-2 text-sm rounded-xl input-field"
            />
          </div>

          <div>
            <label
              htmlFor="note-content"
              className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1.5"
            >
              Բովանդակություն
            </label>
            <textarea
              id="note-content"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Գրեք ձեր նշումը կամ հիշեցման մանրամասները..."
              className="w-full px-3.5 py-2.5 text-sm rounded-xl input-field resize-y"
            />
          </div>

          <div>
            <label
              htmlFor="note-reminder"
              className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1.5"
            >
              Հիշեցման օր և ժամ (ըստ ցանկության)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="note-reminder"
                type="datetime-local"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
                className="flex-1 min-w-0 min-h-[42px] px-3.5 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
              />
              {reminderDate && (
                <button
                  type="button"
                  onClick={() => setReminderDate('')}
                  aria-label="Մաքրել հիշեցման ժամանակը"
                  className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl border border-[#CBD5E1] dark:border-[#26334D] text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {formError && (
            <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">
              {formError}
            </p>
          )}

          <button
            type="submit"
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl btn-primary text-sm inline-flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{editingId ? 'Պահպանել փոփոխությունը' : 'Պահպանել նշումը'}</span>
          </button>
        </form>

        <div className="lg:col-span-8 min-w-0 space-y-4">
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

            <div className="relative w-full sm:w-64">
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

          {filteredNotes.length === 0 ? (
            <div className="surface-card p-10 text-center space-y-2">
              <p className="text-sm text-[#64748B] dark:text-[#94A3B8]">
                {notes.length === 0
                  ? 'Պահպանված նշումներ դեռ չկան։ Ստեղծեք առաջինը ձախ կողմի դաշտից։'
                  : 'Որոնմանը համապատասխան նշումներ չեն գտնվել։'}
              </p>
              {(filterMode !== 'all' || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode('all');
                    setSearchQuery('');
                  }}
                  className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
                >
                  Մաքրել զտիչները
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredNotes.map((note) => {
                const isDue =
                  Boolean(note.reminderDate) &&
                  note.reminderDate!.slice(0, 10) <= todayISO;

                return (
                  <article
                    key={note.id}
                    className={`surface-card p-5 min-w-0 flex flex-col justify-between gap-4 transition-colors ${
                      note.pinned
                        ? 'border-[#BFDBFE] dark:border-[#1E3A8A]'
                        : ''
                    }`}
                  >
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC] break-words min-w-0">
                          {note.title}
                        </h4>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onConvertToTask(note)}
                            title="Ավելացնել անելիքների մեջ"
                            aria-label={`Ավելացնել «${note.title}» որպես անելիք`}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-[#2563EB] dark:hover:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#172554]/50 transition-colors cursor-pointer"
                          >
                            <CheckSquare className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(note)}
                            aria-label={`Խմբագրել ${note.title}`}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onTogglePin(note.id)}
                            aria-label={
                              note.pinned ? 'Ապաամրացնել նշումը' : 'Ամրացնել նշումը'
                            }
                            className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl transition-colors cursor-pointer ${
                              note.pinned
                                ? 'text-[#2563EB] dark:text-[#60A5FA] bg-[#2563EB]/10 dark:bg-[#3B82F6]/15'
                                : 'text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B]'
                            }`}
                          >
                            <Pin className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (editingId === note.id) resetForm();
                              onDeleteNote(note.id);
                            }}
                            aria-label={`Ջնջել ${note.title}`}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
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
                          : 'Անձնական նշում'}
                      </span>
                      {note.pinned && (
                        <span className="text-[#2563EB] dark:text-[#60A5FA] font-semibold">
                          Ամրացված
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
