import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  INCOME_KINDS,
  getTodayISO,
} from '../data/defaults';
import {
  IncomeKind,
  Note,
  Task,
  TaskPriority,
  Transaction,
  TransactionType,
} from '../types';

interface QuickAddModalProps {
  initialMode: 'transaction' | 'task' | 'note';
  onClose: () => void;
  onAddTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  onAddTask: (task: Omit<Task, 'id' | 'completed' | 'createdAt'>) => void;
  onAddNote: (note: Omit<Note, 'id' | 'updatedAt'>) => void;
}

export function QuickAddModal({
  initialMode,
  onClose,
  onAddTransaction,
  onAddTask,
  onAddNote,
}: QuickAddModalProps) {
  const [mode, setMode] = useState<'transaction' | 'task' | 'note'>(initialMode);

  const [txType, setTxType] = useState<TransactionType>('expense');
  const [txIncomeKind, setTxIncomeKind] = useState<IncomeKind>('monthly');
  const [txAmount, setTxAmount] = useState('');
  const [txTitle, setTxTitle] = useState('');
  const [txCategory, setTxCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [txDate, setTxDate] = useState(getTodayISO());
  const [txIsPending, setTxIsPending] = useState(false);
  const [userToggledPending, setUserToggledPending] = useState(false);

  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium');
  const [taskDate, setTaskDate] = useState(getTodayISO());
  const [taskTime, setTaskTime] = useState('');

  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteReminder, setNoteReminder] = useState('');

  const [error, setError] = useState('');

  const amountRef = useRef<HTMLInputElement>(null);
  const taskInputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (mode === 'transaction') amountRef.current?.focus();
      if (mode === 'task') taskInputRef.current?.focus();
      if (mode === 'note') noteInputRef.current?.focus();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [mode]);

  const handleTxTypeChange = (next: TransactionType) => {
    setTxType(next);
    if (next === 'income') {
      setTxIncomeKind('monthly');
      setTxCategory(INCOME_CATEGORIES[0]);
    } else {
      setTxCategory(EXPENSE_CATEGORIES[0]);
    }
  };

  const handleIncomeKindChange = (kind: IncomeKind) => {
    setTxIncomeKind(kind);
    if (kind === 'monthly') setTxCategory('Աշխատավարձ');
    else if (kind === 'extra') setTxCategory('Ֆրիլանս');
    else setTxCategory('Նվեր');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'transaction') {
      const amount = Number(txAmount);
      if (!amount || amount <= 0 || !txTitle.trim()) {
        setError('Լրացրեք գումարը և նկարագրությունը։');
        return;
      }
      onAddTransaction({
        type: txType,
        incomeKind: txType === 'income' ? txIncomeKind : undefined,
        amount,
        title: txTitle.trim(),
        category: txCategory,
        date: txDate || getTodayISO(),
        isPending: txType === 'expense' ? txIsPending : false,
      });
      onClose();
      return;
    }

    if (mode === 'task') {
      if (!taskTitle.trim()) {
        setError('Մուտքագրեք անելիքի անվանումը։');
        return;
      }
      onAddTask({
        title: taskTitle.trim(),
        priority: taskPriority,
        dueTime: taskTime || undefined,
        date: taskDate || getTodayISO(),
      });
      onClose();
      return;
    }

    if (!noteTitle.trim() && !noteContent.trim()) {
      setError('Լրացրեք նշման վերնագիրը կամ տեքստը։');
      return;
    }
    onAddNote({
      title: noteTitle.trim() || 'Առանց վերնագրի',
      content: noteContent.trim(),
      reminderDate: noteReminder || undefined,
      pinned: false,
    });
    onClose();
  };

  const categories = txType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#020617]/65 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-add-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2
            id="quick-add-title"
            className="font-display text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC]"
          >
            Արագ գրանցում
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Փակել պատուհանը"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl surface-subtle mb-5">
          {(
            [
              { id: 'transaction', label: 'Ֆինանսներ' },
              { id: 'task', label: 'Անելիք' },
              { id: 'note', label: 'Նշում' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setMode(tab.id);
                setError('');
              }}
              className={`min-h-[38px] rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                mode === tab.id
                  ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                  : 'text-[#64748B] dark:text-[#94A3B8]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'transaction' && (
            <>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl surface-subtle">
                <button
                  type="button"
                  onClick={() => handleTxTypeChange('expense')}
                  className={`min-h-[36px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    txType === 'expense'
                      ? 'bg-white dark:bg-[#0F172A] text-rose-600 dark:text-rose-400 shadow-xs'
                      : 'text-[#64748B] dark:text-[#94A3B8]'
                  }`}
                >
                  Ծախս
                </button>
                <button
                  type="button"
                  onClick={() => handleTxTypeChange('income')}
                  className={`min-h-[36px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    txType === 'income'
                      ? 'bg-white dark:bg-[#0F172A] text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-[#64748B] dark:text-[#94A3B8]'
                  }`}
                >
                  Եկամուտ
                </button>
              </div>

              {txType === 'income' && (
                <div>
                  <span className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                    Եկամտի տեսակ
                  </span>
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl surface-subtle">
                    {INCOME_KINDS.map((kind) => (
                      <button
                        key={kind.id}
                        type="button"
                        onClick={() => handleIncomeKindChange(kind.id)}
                        className={`min-h-[34px] rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          txIncomeKind === kind.id
                            ? 'bg-white dark:bg-[#0F172A] text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs'
                            : 'text-[#64748B] dark:text-[#94A3B8]'
                        }`}
                      >
                        {kind.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                    Գումար
                  </label>
                  <input
                    ref={amountRef}
                    type="number"
                    min="1"
                    step="any"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    placeholder="10000"
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                    Ամսաթիվ
                  </label>
                  <input
                    type="date"
                    value={txDate}
                    onChange={(e) => {
                      const nextDate = e.target.value;
                      setTxDate(nextDate);
                      if (nextDate > getTodayISO() && txType === 'expense' && !userToggledPending) {
                        setTxIsPending(true);
                      }
                    }}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                  {txType === 'income' ? 'Աղբյուր' : 'Նպատակ'}
                </label>
                <input
                  type="text"
                  value={txTitle}
                  onChange={(e) => setTxTitle(e.target.value)}
                  placeholder={
                    txType === 'income'
                      ? 'Օրինակ՝ Աշխատավարձ'
                      : 'Օրինակ՝ Սուրճ և ընդմիջում'
                  }
                  className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                  Կատեգորիա
                </label>
                <select
                  value={txCategory}
                  onChange={(e) => setTxCategory(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {txType === 'expense' && (
                <label className="flex items-center gap-2 text-xs text-[#475569] dark:text-[#CBD5E1] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={txIsPending}
                    onChange={(e) => {
                      setUserToggledPending(true);
                      setTxIsPending(e.target.checked);
                    }}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <span>Նշել որպես նախածախս (չհանել բալանսից)</span>
                  {txDate > getTodayISO() && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">
                      Ապագա ամսաթիվ
                    </span>
                  )}
                </label>
              )}
            </>
          )}

          {mode === 'task' && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                  Անելիքի անվանում
                </label>
                <input
                  ref={taskInputRef}
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Օրինակ՝ Վճարել ինտերնետի հաշիվը"
                  className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
                />
              </div>
              <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                    Առաջնահերթություն
                  </label>
                  <select
                    value={taskPriority}
                    onChange={(e) =>
                      setTaskPriority(e.target.value as TaskPriority)
                    }
                    className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
                  >
                    <option value="high">Կարևոր</option>
                    <option value="medium">Միջին</option>
                    <option value="low">Սովորական</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                    Ամսաթիվ
                  </label>
                  <input
                    type="date"
                    value={taskDate}
                    onChange={(e) => setTaskDate(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                    Ժամ (ընտրովի)
                  </label>
                  <input
                    type="time"
                    value={taskTime}
                    onChange={(e) => setTaskTime(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
                  />
                </div>
              </div>
            </>
          )}

          {mode === 'note' && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                  Վերնագիր
                </label>
                <input
                  ref={noteInputRef}
                  type="text"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Կարճ վերնագիր"
                  className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                  Նշում
                </label>
                <textarea
                  rows={3}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Գրեք մանրամասները..."
                  className="w-full px-3 py-2 text-sm rounded-xl input-field resize-y"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                  Հիշեցում (ըստ ցանկության)
                </label>
                <input
                  type="datetime-local"
                  value={noteReminder}
                  onChange={(e) => setNoteReminder(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
                />
              </div>
            </>
          )}

          {error && (
            <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] text-sm font-medium text-[#475569] dark:text-[#CBD5E1] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
            >
              Չեղարկել
            </button>
            <button
              type="submit"
              className="min-h-[42px] px-5 py-2 rounded-xl btn-primary text-sm"
            >
              Պահպանել
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
