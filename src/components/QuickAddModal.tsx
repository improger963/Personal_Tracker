import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Camera,
  Check,
  Coins,
  Loader2,
  Mic,
  NotebookPen,
  Plus,
  Square,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  INCOME_KINDS,
  SAVINGS_GOAL_CATEGORIES,
  getTodayISO,
  getTransactionIncomeKind,
} from '../data/defaults';
import { QUICK_AMOUNTS_AMD } from './finance/financeShared';
import { triggerHaptic } from '../utils/haptics';
import {
  SupportedFxCode,
  fetchLiveFxRates,
  fileToReceiptPayload,
  parseCommandWithAI,
  scanReceiptWithAI,
  transcribeAudioWithAI,
} from '../services/smartAi';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import {
  TitleHistorySuggestion,
  getTitleSuggestionsFromHistory,
  predictCategoryFromHistory,
} from '../utils/transactionAutoCategory';
import {
  BankCard,
  CardColor,
  CardCurrency,
  CardType,
  CustomCategory,
  DebtDirection,
  DebtItem,
  Habit,
  IncomeKind,
  Note,
  NoteChecklistItem,
  SavingsGoal,
  Task,
  TaskPriority,
  TaskRepeatInterval,
  TaskScheduleType,
  Transaction,
  TransactionType,
} from '../types';
import {
  ARMENIAN_BANK_PRESETS,
  CARD_COLORS,
  CARD_CURRENCIES,
  CARD_CURRENCY_META,
  CARD_TYPE_META,
  FxRatesToAmd,
  INTERNAL_TRANSFER_CATEGORY,
  computeCardStats,
  convertFromAMD,
  formatCardLabel,
  formatCardMoney,
  getDefaultCard,
  getTxAmountInCardCurrency,
  normalizeCardCurrency,
} from '../utils/cardBalances';
import {
  extractHashtags,
  mergeExpenseCategories,
  mergeIncomeCategories,
  normalizeTag,
  normalizeTags,
} from '../utils/customCategories';
import { formatMoney } from '../data/defaults';
import {
  TASK_REPEAT_INTERVAL_OPTIONS,
  TASK_SCHEDULE_OPTIONS,
  WEEKDAY_OPTIONS,
  getTaskScheduleType,
} from '../utils/taskSchedule';
import {
  SplitExpenseSection,
  SplitParticipant,
  computeSplitAllocations,
} from './modals/SplitExpenseSection';

export type QuickModalMode =
  | 'transaction'
  | 'card'
  | 'task'
  | 'habit'
  | 'note'
  | 'goal'
  | 'debt';

export type QuickModalState =
  | {
      mode: 'transaction';
      editing?: Transaction;
      prefill?: Partial<Omit<Transaction, 'id' | 'createdAt'>>;
    }
  | { mode: 'card'; editing?: BankCard }
  | { mode: 'task'; editing?: Task }
  | { mode: 'habit'; editing?: Habit }
  | { mode: 'note'; editing?: Note }
  | { mode: 'goal'; editing?: SavingsGoal }
  | { mode: 'debt'; editing?: DebtItem };

interface QuickAddModalProps {
  modalState: QuickModalState;
  transactions: Transaction[];
  cards: BankCard[];
  customCategories?: CustomCategory[];
  fxRates?: FxRatesToAmd | null;
  onClose: () => void;
  onAddTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  onUpdateTransaction: (
    id: string,
    updates: Omit<Transaction, 'id' | 'createdAt'>
  ) => void;
  onAddCard: (card: Omit<BankCard, 'id' | 'createdAt'>) => void;
  onUpdateCard: (
    id: string,
    updates: Omit<BankCard, 'id' | 'createdAt'>
  ) => void;
  onAddTask: (task: Omit<Task, 'id' | 'completed' | 'createdAt'>) => void;
  onUpdateTask: (
    id: string,
    updates: Omit<Task, 'id' | 'completed' | 'createdAt'>
  ) => void;
  onAddHabit: (title: string) => void;
  onUpdateHabit: (habitId: string, title: string) => void;
  onAddNote: (note: Omit<Note, 'id' | 'updatedAt'>) => void;
  onUpdateNote: (
    id: string,
    updates: Omit<Note, 'id' | 'updatedAt' | 'pinned'>
  ) => void;
  onAddGoal: (goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => void;
  onUpdateGoal: (
    id: string,
    updates: Omit<SavingsGoal, 'id' | 'createdAt'>
  ) => void;
  onAddDebt: (debt: Omit<DebtItem, 'id' | 'createdAt'>) => void;
  onAddSplitDebts?: (debts: Array<Omit<DebtItem, 'id' | 'createdAt'>>) => void;
  onUpdateDebt: (
    id: string,
    updates: Omit<DebtItem, 'id' | 'createdAt'>
  ) => void;
}

const MODAL_TITLES_EDIT: Record<QuickModalMode, string> = {
  transaction: 'Խմբագրել գործարքը',
  card: 'Խմբագրել քարտը',
  task: 'Խմբագրել անելիքը',
  habit: 'Խմբագրել սովորությունը',
  note: 'Խմբագրել նշումը',
  goal: 'Խմբագրել նպատակը',
  debt: 'Խմբագրել պարտքը',
};

export function QuickAddModal({
  modalState,
  transactions,
  cards,
  customCategories = [],
  fxRates: initialFxRates = null,
  onClose,
  onAddTransaction,
  onUpdateTransaction,
  onAddCard,
  onUpdateCard,
  onAddTask,
  onUpdateTask,
  onAddHabit,
  onUpdateHabit,
  onAddNote,
  onUpdateNote,
  onAddGoal,
  onUpdateGoal,
  onAddDebt,
  onAddSplitDebts,
  onUpdateDebt,
}: QuickAddModalProps) {
  const prefersReducedMotion = useReducedMotion();
  const isEditing = Boolean(modalState.editing);
  const [mode, setMode] = useState<QuickModalMode>(modalState.mode);

  const editingTx =
    modalState.mode === 'transaction' ? modalState.editing : undefined;
  const txPrefill =
    modalState.mode === 'transaction' ? modalState.prefill : undefined;
  const editingCard =
    modalState.mode === 'card' ? modalState.editing : undefined;
  const editingTask =
    modalState.mode === 'task' ? modalState.editing : undefined;
  const editingHabit =
    modalState.mode === 'habit' ? modalState.editing : undefined;
  const editingNote =
    modalState.mode === 'note' ? modalState.editing : undefined;
  const editingGoal =
    modalState.mode === 'goal' ? modalState.editing : undefined;
  const editingDebt =
    modalState.mode === 'debt' ? modalState.editing : undefined;

  // Transaction state
  const [txType, setTxType] = useState<TransactionType>(
    editingTx?.type ?? txPrefill?.type ?? 'expense'
  );
  const [txIncomeKind, setTxIncomeKind] = useState<IncomeKind>(
    editingTx && editingTx.type === 'income'
      ? getTransactionIncomeKind(editingTx)
      : txPrefill?.incomeKind ?? 'monthly'
  );
  const [txAmount, setTxAmount] = useState(
    editingTx
      ? String(editingTx.amount)
      : txPrefill?.amount
        ? String(txPrefill.amount)
        : ''
  );
  const [txTitle, setTxTitle] = useState(
    editingTx?.title ?? txPrefill?.title ?? ''
  );
  const [txCategory, setTxCategory] = useState<string>(
    editingTx?.category ?? txPrefill?.category ?? EXPENSE_CATEGORIES[0]
  );
  const [txDate, setTxDate] = useState(
    editingTx?.date ?? txPrefill?.date ?? getTodayISO()
  );
  const [txCardId, setTxCardId] = useState<string>(() => {
    if (editingTx) return editingTx.cardId ?? '';
    if (txPrefill && txPrefill.cardId !== undefined) return txPrefill.cardId;
    return getDefaultCard(cards)?.id ?? '';
  });
  const [txIsPending, setTxIsPending] = useState(
    Boolean(editingTx?.isPending ?? txPrefill?.isPending)
  );
  const [userToggledPending, setUserToggledPending] = useState(
    Boolean(editingTx)
  );
  const [userSelectedCategory, setUserSelectedCategory] = useState(
    Boolean(editingTx || txPrefill?.category)
  );
  const [userSelectedIncomeKind, setUserSelectedIncomeKind] = useState(
    Boolean(editingTx)
  );
  const [isTxTitleFocused, setIsTxTitleFocused] = useState(false);
  const [txTags, setTxTags] = useState<string[]>(() =>
    normalizeTags(editingTx?.tags ?? txPrefill?.tags ?? [])
  );
  const [tagInput, setTagInput] = useState('');
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [splitIncludeSelf, setSplitIncludeSelf] = useState(true);
  const [splits, setSplits] = useState<SplitParticipant[]>([
    { id: 'sp-1', person: '', amountStr: '' },
  ]);

  // Card / Wallet state
  const [cardName, setCardName] = useState(editingCard?.name ?? '');
  const [cardLast4, setCardLast4] = useState(editingCard?.last4 ?? '');
  const [cardType, setCardType] = useState<CardType>(
    editingCard?.cardType ?? 'visa'
  );
  const [cardColor, setCardColor] = useState<CardColor>(
    editingCard?.color ?? 'blue'
  );
  const [cardCurrency, setCardCurrency] = useState<CardCurrency>(
    normalizeCardCurrency(editingCard?.currency ?? 'AMD')
  );
  const [cardInitialBalance, setCardInitialBalance] = useState(
    editingCard ? String(editingCard.initialBalance) : '0'
  );
  const [cardIsDefault, setCardIsDefault] = useState(
    editingCard ? Boolean(editingCard.isDefault) : cards.length === 0
  );

  // Task state
  const [taskTitle, setTaskTitle] = useState(editingTask?.title ?? '');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>(
    editingTask?.priority ?? 'medium'
  );
  const [taskDate, setTaskDate] = useState(editingTask?.date ?? getTodayISO());
  const [taskTime, setTaskTime] = useState(editingTask?.dueTime ?? '');
  const [taskScheduleType, setTaskScheduleType] = useState<TaskScheduleType>(
    editingTask ? getTaskScheduleType(editingTask) : 'one_time'
  );
  const [taskRepeatInterval, setTaskRepeatInterval] =
    useState<TaskRepeatInterval>(editingTask?.repeatInterval ?? 'weekly');
  const [taskRepeatEveryDays, setTaskRepeatEveryDays] = useState(
    String(editingTask?.repeatEveryDays ?? 2)
  );
  const [taskSelectedWeekdays, setTaskSelectedWeekdays] = useState<number[]>(
    editingTask?.selectedWeekdays && editingTask.selectedWeekdays.length > 0
      ? editingTask.selectedWeekdays
      : [1, 2, 3, 4, 5]
  );
  const [taskExpectedAmount, setTaskExpectedAmount] = useState(
    editingTask?.expectedAmount ? String(editingTask.expectedAmount) : ''
  );
  const [taskExpectedCategory, setTaskExpectedCategory] = useState(
    editingTask?.expectedCategory ?? EXPENSE_CATEGORIES[0]
  );

  // Habit state
  const [habitTitle, setHabitTitle] = useState(editingHabit?.title ?? '');

  // Note state
  const [noteTitle, setNoteTitle] = useState(editingNote?.title ?? '');
  const [noteContent, setNoteContent] = useState(editingNote?.content ?? '');
  const [noteReminder, setNoteReminder] = useState(
    editingNote?.reminderDate ?? ''
  );
  const [noteChecklist, setNoteChecklist] = useState<NoteChecklistItem[]>(
    editingNote?.checklist ?? []
  );
  const [newChecklistText, setNewChecklistText] = useState('');

  // Savings Goal state
  const [goalTitle, setGoalTitle] = useState(editingGoal?.title ?? '');
  const [goalTargetAmount, setGoalTargetAmount] = useState(
    editingGoal ? String(editingGoal.targetAmount) : ''
  );
  const [goalCurrentAmount, setGoalCurrentAmount] = useState(
    editingGoal ? String(editingGoal.currentAmount) : '0'
  );
  const [goalDeadline, setGoalDeadline] = useState(editingGoal?.deadline ?? '');
  const [goalCategory, setGoalCategory] = useState(
    editingGoal?.category ?? SAVINGS_GOAL_CATEGORIES[0]
  );

  // Debt state
  const [debtDirection, setDebtDirection] = useState<DebtDirection>(
    editingDebt?.direction ?? 'lent'
  );
  const [debtPerson, setDebtPerson] = useState(editingDebt?.person ?? '');
  const [debtTotalAmount, setDebtTotalAmount] = useState(
    editingDebt ? String(editingDebt.totalAmount) : ''
  );
  const [debtPaidAmount, setDebtPaidAmount] = useState(
    editingDebt ? String(editingDebt.paidAmount) : '0'
  );
  const [debtDueDate, setDebtDueDate] = useState(editingDebt?.dueDate ?? '');
  const [debtNote, setDebtNote] = useState(editingDebt?.note ?? '');

  const [error, setError] = useState('');
  const [receiptScanning, setReceiptScanning] = useState(false);
  const [receiptInfo, setReceiptInfo] = useState('');
  const [receiptItems, setReceiptItems] = useState<string[]>([]);
  const [receiptNoteSaved, setReceiptNoteSaved] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  // FX-to-AMD converter state
  const [inputCurrency, setInputCurrency] = useState<'AMD' | SupportedFxCode>('AMD');
  const [fxRates, setFxRates] = useState<Partial<Record<SupportedFxCode, number>>>(
    () => ({ ...(initialFxRates ?? {}) })
  );
  const [fxLoading, setFxLoading] = useState(false);
  const [customFxRate, setCustomFxRate] = useState('');

  // Voice dictation state
  const voiceRecorder = useVoiceRecorder();
  const [voiceTranscribing, setVoiceTranscribing] = useState(false);

  const amountRef = useRef<HTMLInputElement>(null);
  const cardInputRef = useRef<HTMLInputElement>(null);
  const taskInputRef = useRef<HTMLInputElement>(null);
  const habitInputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLInputElement>(null);
  const goalInputRef = useRef<HTMLInputElement>(null);
  const debtInputRef = useRef<HTMLInputElement>(null);

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
      if (mode === 'card') cardInputRef.current?.focus();
      if (mode === 'task') taskInputRef.current?.focus();
      if (mode === 'habit') habitInputRef.current?.focus();
      if (mode === 'note') noteInputRef.current?.focus();
      if (mode === 'goal') goalInputRef.current?.focus();
      if (mode === 'debt') debtInputRef.current?.focus();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [mode]);

  const effectiveFxRates = useMemo<FxRatesToAmd>(
    () => ({ ...(initialFxRates ?? {}), ...fxRates }),
    [initialFxRates, fxRates]
  );

  const cardStatsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeCardStats>>();
    for (const c of cards) {
      map.set(c.id, computeCardStats(c, transactions, effectiveFxRates));
    }
    return map;
  }, [cards, transactions, effectiveFxRates]);

  const selectedCardStats = txCardId ? cardStatsMap.get(txCardId) : undefined;
  const selectedCardCurrency = selectedCardStats?.currency ?? 'AMD';

  const autoCategoryPrediction = useMemo(
    () =>
      predictCategoryFromHistory(txTitle, txType, transactions, {
        excludeTxId: editingTx?.id,
      }),
    [txTitle, txType, transactions, editingTx?.id]
  );

  const txTitleSuggestions = useMemo(
    () => getTitleSuggestionsFromHistory(txTitle, txType, transactions, 5),
    [txTitle, txType, transactions]
  );

  const getDefaultTxCategory = (
    nextType: TransactionType,
    nextKind: IncomeKind
  ) => {
    if (nextType === 'expense') return EXPENSE_CATEGORIES[0];
    if (nextKind === 'monthly') return 'Աշխատավարձ';
    if (nextKind === 'extra') return 'Ֆրիլանս';
    return 'Նվեր';
  };

  const handleTxTypeChange = (next: TransactionType) => {
    setTxType(next);
    setUserSelectedCategory(false);
    setUserSelectedIncomeKind(false);
    const pred = predictCategoryFromHistory(txTitle, next, transactions, {
      excludeTxId: editingTx?.id,
    });
    if (next === 'income') {
      const nextKind = pred?.incomeKind ?? 'monthly';
      setTxIncomeKind(nextKind);
      setTxCategory(pred?.category ?? getDefaultTxCategory('income', nextKind));
      setTxIsPending(false);
    } else {
      setTxCategory(pred?.category ?? EXPENSE_CATEGORIES[0]);
      if (txDate > getTodayISO() && !userToggledPending) {
        setTxIsPending(true);
      }
    }
  };

  const handleIncomeKindChange = (kind: IncomeKind) => {
    setTxIncomeKind(kind);
    setUserSelectedIncomeKind(true);
    if (!editingTx && !userSelectedCategory && !autoCategoryPrediction) {
      setTxCategory(getDefaultTxCategory('income', kind));
    }
  };

  const handleTxTitleChange = (nextTitle: string) => {
    setTxTitle(nextTitle);
    if (!userSelectedCategory) {
      const pred = predictCategoryFromHistory(nextTitle, txType, transactions, {
        excludeTxId: editingTx?.id,
      });
      if (pred) {
        setTxCategory(pred.category);
        if (txType === 'income' && !userSelectedIncomeKind && pred.incomeKind) {
          setTxIncomeKind(pred.incomeKind);
        }
      } else if (!editingTx) {
        setTxCategory(getDefaultTxCategory(txType, txIncomeKind));
      }
    }
  };

  const handleSelectTxTitleSuggestion = (sug: TitleHistorySuggestion) => {
    setTxTitle(sug.title);
    setTxCategory(sug.category);
    if (txType === 'income' && sug.incomeKind) {
      setTxIncomeKind(sug.incomeKind);
      setUserSelectedIncomeKind(false);
    }
    setUserSelectedCategory(false);
    setIsTxTitleFocused(false);
  };

  const handleQuickPreset = (val: number) => {
    const current = Number(txAmount) || 0;
    setTxAmount(String(current + val));
  };

  const handleReceiptFileChange = async (file: File | undefined) => {
    if (!file || receiptScanning) return;
    setError('');
    setReceiptInfo('');
    setReceiptItems([]);
    setReceiptNoteSaved(false);
    setReceiptScanning(true);
    try {
      const payload = await fileToReceiptPayload(file);
      const result = await scanReceiptWithAI({
        ...payload,
        todayISO: getTodayISO(),
      });
      setTxType('expense');
      setInputCurrency('AMD');
      if (result.amount > 0) setTxAmount(String(result.amount));
      if (result.title) setTxTitle(result.title);
      if (result.category) {
        setTxCategory(result.category);
        setUserSelectedCategory(true);
      }
      if (result.date) setTxDate(result.date);
      if (result.items && result.items.length > 0) {
        setReceiptItems(result.items);
      }
      setReceiptInfo(
        result.itemsSummary
          ? `Կտրոնը կարդացվեց · ${result.itemsSummary}`
          : 'Կտրոնի տվյալները լրացվեցին'
      );
      triggerHaptic('light');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Չհաջողվեց կարդալ կտրոնը։'
      );
    } finally {
      setReceiptScanning(false);
    }
  };

  const handleSaveReceiptAsNote = () => {
    if (receiptItems.length === 0 || receiptNoteSaved) return;
    onAddNote({
      title: `${txTitle.trim() || 'Կտրոնի գնումներ'} · ${txDate}`,
      content: receiptInfo || '',
      checklist: receiptItems.map((line, i) => ({
        id: `rcpt-${Date.now()}-${i}`,
        text: line,
        done: true,
      })),
      pinned: false,
    });
    setReceiptNoteSaved(true);
    triggerHaptic('light');
  };

  const handleSelectCurrency = async (nextCur: 'AMD' | SupportedFxCode) => {
    setInputCurrency(nextCur);
    if (nextCur === 'AMD') {
      setCustomFxRate('');
      return;
    }
    if (fxRates[nextCur] && fxRates[nextCur]! > 0) {
      setCustomFxRate(String(fxRates[nextCur]));
      return;
    }
    setFxLoading(true);
    try {
      const live = await fetchLiveFxRates();
      setFxRates(live.rates);
      if (live.rates[nextCur] > 0) {
        setCustomFxRate(String(live.rates[nextCur]));
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Փոխարժեքը հնարավոր չեղավ ստանալ․ մուտքագրեք ձեռքով։'
      );
    } finally {
      setFxLoading(false);
    }
  };

  const effectiveRate =
    inputCurrency === 'AMD'
      ? 1
      : Math.max(0, Number(customFxRate) || fxRates[inputCurrency] || 0);
  const convertedAmountAMD =
    inputCurrency === 'AMD'
      ? Math.round(Number(txAmount) || 0)
      : Math.round((Number(txAmount) || 0) * effectiveRate);

  const handleQuickVoiceToggle = async () => {
    setError('');
    if (voiceRecorder.isRecording) {
      const payload = await voiceRecorder.stopRecording();
      if (!payload) return;
      setVoiceTranscribing(true);
      try {
        const text = await transcribeAudioWithAI({
          audioBase64: payload.audioBase64,
          mimeType: payload.mimeType,
        });
        if (mode === 'transaction') {
          const parsed = await parseCommandWithAI({
            text,
            todayISO: getTodayISO(),
            cardNames: cards.map((c) => c.name),
          });
          const txItem = parsed.find((p) => p.kind === 'transaction');
          if (txItem) {
            setTxType(txItem.txType === 'income' ? 'income' : 'expense');
            setInputCurrency('AMD');
            if (txItem.amount && txItem.amount > 0) {
              setTxAmount(String(txItem.amount));
            }
            setTxTitle(txItem.title);
            if (txItem.category) {
              setTxCategory(txItem.category);
              setUserSelectedCategory(true);
            }
            if (txItem.date) setTxDate(txItem.date);
            if (txItem.cardHint) {
              const matched = cards.find(
                (c) =>
                  c.name.toLowerCase().includes(txItem.cardHint!.toLowerCase()) ||
                  (txItem.cardHint!.toLowerCase().includes('կանխիկ') &&
                    c.cardType === 'cash')
              );
              if (matched) setTxCardId(matched.id);
            }
          } else {
            setTxTitle(text);
          }
        } else if (mode === 'task') {
          const parsed = await parseCommandWithAI({
            text,
            todayISO: getTodayISO(),
            cardNames: [],
          });
          const taskItem = parsed.find((p) => p.kind === 'task');
          if (taskItem) {
            setTaskTitle(taskItem.title);
            if (taskItem.date) setTaskDate(taskItem.date);
            if (taskItem.dueTime) setTaskTime(taskItem.dueTime);
            if (taskItem.priority) setTaskPriority(taskItem.priority);
          } else {
            setTaskTitle(text);
          }
        } else if (mode === 'note') {
          setNoteContent((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text));
          if (!noteTitle.trim()) {
            setNoteTitle(text.slice(0, 48));
          }
        }
        triggerHaptic('light');
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Չհաջողվեց մշակել ձայնային հրահանգը։'
        );
      } finally {
        setVoiceTranscribing(false);
      }
    } else {
      await voiceRecorder.startRecording();
    }
  };

  const handleAddChecklistItem = () => {
    const trimmed = newChecklistText.trim();
    if (!trimmed) return;
    setNoteChecklist((prev) => [
      ...prev,
      {
        id: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        text: trimmed,
        done: false,
      },
    ]);
    setNewChecklistText('');
  };

  const handleAddTag = (rawValue: string) => {
    const tag = normalizeTag(rawValue);
    if (!tag) return;
    setTxTags((prev) => normalizeTags([...prev, tag]));
    setTagInput('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'transaction') {
      const rawAmount = Number(txAmount);
      if (!rawAmount || rawAmount <= 0) {
        setError('Խնդրում ենք մուտքագրել ճիշտ գումար։');
        return;
      }
      if (inputCurrency !== 'AMD' && effectiveRate <= 0) {
        setError(`Նշեք ${inputCurrency} → AMD փոխարժեքը։`);
        return;
      }
      const amount = inputCurrency === 'AMD' ? Math.round(rawAmount) : convertedAmountAMD;
      if (!amount || amount <= 0) {
        setError('Խնդրում ենք մուտքագրել ճիշտ գումար։');
        return;
      }
      const { cleanText, tags: inlineTags } = extractHashtags(txTitle.trim());
      const baseTitle = cleanText || txTitle.trim();
      if (!baseTitle) {
        setError(
          txType === 'income'
            ? 'Նշեք եկամտի աղբյուրը։'
            : 'Նշեք ծախսի նպատակը։'
        );
        return;
      }
      const finalTitle =
        inputCurrency !== 'AMD' && !baseTitle.includes(inputCurrency)
          ? `${baseTitle} (${rawAmount} ${inputCurrency})`
          : baseTitle;

      const mergedTags = normalizeTags([
        ...txTags,
        ...inlineTags,
        ...(tagInput.trim() ? [tagInput.trim()] : []),
      ]);

      let splitSharesToCreate: Array<{ person: string; amount: number }> = [];
      if (!isEditing && txType === 'expense' && splitEnabled) {
        const splitRes = computeSplitAllocations({
          totalAmountAMD: amount,
          splitMode,
          includeSelf: splitIncludeSelf,
          splits,
        });
        if (!splitRes.isValid) {
          setError(splitRes.errorMessage || 'Ստուգեք կիսվող ծախսի տվյալները։');
          return;
        }
        splitSharesToCreate = splitRes.shares.map((s) => ({
          person: s.person,
          amount: s.amount,
        }));
      }

      let cardAmount: number | undefined;
      let cardCurrency: CardCurrency | undefined;
      if (selectedCardStats && selectedCardCurrency !== 'AMD') {
        cardCurrency = selectedCardCurrency;
        cardAmount =
          inputCurrency === selectedCardCurrency
            ? Math.round(rawAmount * 100) / 100
            : convertFromAMD(amount, selectedCardCurrency, effectiveFxRates);
      } else if (inputCurrency !== 'AMD') {
        cardCurrency = inputCurrency;
        cardAmount = Math.round(rawAmount * 100) / 100;
      }

      const payload: Omit<Transaction, 'id' | 'createdAt'> = {
        type: txType,
        incomeKind: txType === 'income' ? txIncomeKind : undefined,
        amount,
        title: finalTitle,
        category: txCategory,
        date: txDate || getTodayISO(),
        isPending: txType === 'expense' ? txIsPending : false,
        cardId: txCardId || undefined,
        ...(cardAmount !== undefined && cardCurrency
          ? { cardAmount, cardCurrency }
          : {}),
        ...(mergedTags.length > 0 ? { tags: mergedTags } : {}),
      };
      if (editingTx) {
        onUpdateTransaction(editingTx.id, payload);
      } else {
        onAddTransaction(payload);
        if (splitSharesToCreate.length > 0) {
          const splitDebts: Array<Omit<DebtItem, 'id' | 'createdAt'>> =
            splitSharesToCreate.map((s) => ({
              person: s.person,
              direction: 'lent',
              totalAmount: s.amount,
              paidAmount: 0,
              settled: false,
              note: `Կիսված ծախս՝ ${finalTitle}`,
            }));
          if (onAddSplitDebts) {
            onAddSplitDebts(splitDebts);
          } else {
            splitDebts.forEach((d) => onAddDebt(d));
          }
        }
      }
      onClose();
      return;
    }

    if (mode === 'card') {
      const trimmedName = cardName.trim();
      if (!trimmedName) {
        setError('Մուտքագրեք քարտի կամ դրամապանակի անունը։');
        return;
      }
      const parsedBalance = Number(cardInitialBalance || 0);
      if (!Number.isFinite(parsedBalance)) {
        setError('Մուտքագրեք ճիշտ սկզբնական բալանս։');
        return;
      }
      const normalizedCur = normalizeCardCurrency(cardCurrency);
      const roundedInitial =
        normalizedCur === 'AMD'
          ? Math.round(parsedBalance)
          : Math.round(parsedBalance * 100) / 100;
      const payload: Omit<BankCard, 'id' | 'createdAt'> = {
        name: trimmedName.slice(0, 120),
        last4: cardType === 'cash' ? '' : cardLast4.replace(/\D/g, '').slice(0, 4),
        cardType,
        color: cardColor,
        initialBalance: roundedInitial,
        currency: normalizedCur,
        isDefault: cardIsDefault,
      };
      if (editingCard) {
        onUpdateCard(editingCard.id, payload);
      } else {
        onAddCard(payload);
      }
      onClose();
      return;
    }

    if (mode === 'task') {
      if (!taskTitle.trim()) {
        setError('Մուտքագրեք անելիքի անվանումը։');
        return;
      }
      if (taskScheduleType === 'weekdays' && taskSelectedWeekdays.length === 0) {
        setError('Ընտրեք շաբաթվա առնվազն մեկ օր։');
        return;
      }
      const parsedEveryDays = Math.max(
        1,
        Math.round(Number(taskRepeatEveryDays) || 2)
      );
      const parsedExpected = Number(taskExpectedAmount);
      const expectedAmount =
        Number.isFinite(parsedExpected) && parsedExpected > 0
          ? Math.round(parsedExpected)
          : undefined;
      const payload: Omit<Task, 'id' | 'completed' | 'createdAt'> = {
        title: taskTitle.trim(),
        priority: taskPriority,
        dueTime: taskTime || undefined,
        date: taskDate || getTodayISO(),
        scheduleType: taskScheduleType,
        repeatInterval:
          taskScheduleType === 'recurring' ? taskRepeatInterval : undefined,
        repeatEveryDays:
          taskScheduleType === 'recurring' &&
          taskRepeatInterval === 'every_n_days'
            ? parsedEveryDays
            : undefined,
        selectedWeekdays:
          taskScheduleType === 'weekdays' ? taskSelectedWeekdays : undefined,
        completedDates:
          taskScheduleType !== 'one_time'
            ? editingTask?.completedDates ?? []
            : undefined,
        ...(expectedAmount
          ? {
              expectedAmount,
              expectedCategory: taskExpectedCategory || EXPENSE_CATEGORIES[0],
            }
          : {}),
        ...(editingTask?.linkedTxId ? { linkedTxId: editingTask.linkedTxId } : {}),
      };
      if (editingTask) {
        onUpdateTask(editingTask.id, payload);
      } else {
        onAddTask(payload);
      }
      onClose();
      return;
    }

    if (mode === 'habit') {
      if (!habitTitle.trim()) {
        setError('Մուտքագրեք սովորության անվանումը։');
        return;
      }
      if (editingHabit) {
        onUpdateHabit(editingHabit.id, habitTitle.trim());
      } else {
        onAddHabit(habitTitle.trim());
      }
      onClose();
      return;
    }

    if (mode === 'goal') {
      if (!goalTitle.trim()) {
        setError('Մուտքագրեք խնայողության նպատակի անվանումը։');
        return;
      }
      const targetAmount = Math.round(Number(goalTargetAmount));
      const currentAmount = Math.max(0, Math.round(Number(goalCurrentAmount) || 0));
      if (!targetAmount || targetAmount <= 0) {
        setError('Մուտքագրեք ճիշտ նպատակային գումար։');
        return;
      }
      const payload: Omit<SavingsGoal, 'id' | 'createdAt'> = {
        title: goalTitle.trim(),
        targetAmount,
        currentAmount,
        deadline: goalDeadline || undefined,
        category: goalCategory || undefined,
        completed: currentAmount >= targetAmount,
      };
      if (editingGoal) {
        onUpdateGoal(editingGoal.id, payload);
      } else {
        onAddGoal(payload);
      }
      onClose();
      return;
    }

    if (mode === 'debt') {
      if (!debtPerson.trim()) {
        setError('Մուտքագրեք անձի կամ կազմակերպության անունը։');
        return;
      }
      const totalAmount = Math.round(Number(debtTotalAmount));
      const paidAmount = Math.max(0, Math.round(Number(debtPaidAmount) || 0));
      if (!totalAmount || totalAmount <= 0) {
        setError('Մուտքագրեք ճիշտ ընդհանուր գումար։');
        return;
      }
      if (paidAmount > totalAmount) {
        setError('Վճարված գումարը չի կարող գերազանցել ընդհանուր գումարը։');
        return;
      }
      const payload: Omit<DebtItem, 'id' | 'createdAt'> = {
        person: debtPerson.trim(),
        direction: debtDirection,
        totalAmount,
        paidAmount,
        dueDate: debtDueDate || undefined,
        note: debtNote.trim() || undefined,
        settled: paidAmount >= totalAmount,
      };
      if (editingDebt) {
        onUpdateDebt(editingDebt.id, payload);
      } else {
        onAddDebt(payload);
      }
      onClose();
      return;
    }

    // Note mode
    const cleanedChecklist = noteChecklist
      .map((item) => ({ ...item, text: item.text.trim() }))
      .filter((item) => item.text.length > 0);

    if (
      !noteTitle.trim() &&
      !noteContent.trim() &&
      cleanedChecklist.length === 0
    ) {
      setError('Լրացրեք նշման վերնագիրը, տեքստը կամ ցուցակի կետերը։');
      return;
    }
    if (editingNote) {
      onUpdateNote(editingNote.id, {
        title: noteTitle.trim() || 'Առանց վերնագրի',
        content: noteContent.trim(),
        checklist: cleanedChecklist.length > 0 ? cleanedChecklist : undefined,
        reminderDate: noteReminder || undefined,
      });
    } else {
      onAddNote({
        title: noteTitle.trim() || 'Առանց վերնագրի',
        content: noteContent.trim(),
        checklist: cleanedChecklist.length > 0 ? cleanedChecklist : undefined,
        reminderDate: noteReminder || undefined,
        pinned: false,
      });
    }
    onClose();
  };

  const categories = useMemo(() => {
    const base: string[] =
      txType === 'income'
        ? mergeIncomeCategories(customCategories)
        : mergeExpenseCategories(customCategories);
    if (
      editingTx?.category === INTERNAL_TRANSFER_CATEGORY &&
      !base.includes(INTERNAL_TRANSFER_CATEGORY)
    ) {
      base.push(INTERNAL_TRANSFER_CATEGORY);
    }
    return base;
  }, [txType, editingTx?.category, customCategories]);

  const expenseCategoriesForTask = useMemo(
    () => mergeExpenseCategories(customCategories),
    [customCategories]
  );

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
        initial={
          prefersReducedMotion ? false : { opacity: 0, y: 16, scale: 0.98 }
        }
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: prefersReducedMotion ? 0.04 : 0.18,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto scroll-container rounded-t-3xl sm:rounded-2xl border-t sm:border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-6 shadow-2xl"
      >
        {/* iOS Native Bottom Sheet Grabber */}
        <div className="w-10 h-1 rounded-full bg-[#CBD5E1] dark:bg-[#334155] mx-auto -mt-1.5 mb-3.5 sm:hidden shrink-0" aria-hidden="true" />

        <div className="flex items-center justify-between gap-4 mb-4">
          <h2
            id="quick-add-title"
            className="font-display text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC]"
          >
            {isEditing ? MODAL_TITLES_EDIT[mode] : 'Նոր գրառում'}
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

        {/* Mode Tabs (hidden when editing an existing item) */}
        {!isEditing && (
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 p-1 rounded-xl surface-subtle mb-5">
            {(
              [
                { id: 'transaction', label: 'Ֆինանս' },
                { id: 'card', label: 'Քարտ' },
                { id: 'task', label: 'Անելիք' },
                { id: 'habit', label: 'Սովոր.' },
                { id: 'note', label: 'Նշում' },
                { id: 'goal', label: 'Նպատակ' },
                { id: 'debt', label: 'Պարտք' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setMode(tab.id);
                  setError('');
                }}
                className={`min-h-[36px] px-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  mode === tab.id
                    ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                    : 'text-[#64748B] dark:text-[#94A3B8]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'transaction' && (
            <>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl surface-subtle">
                <button
                  type="button"
                  onClick={() => handleTxTypeChange('expense')}
                  className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
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
                  className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    txType === 'income'
                      ? 'bg-white dark:bg-[#0F172A] text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-[#64748B] dark:text-[#94A3B8]'
                  }`}
                >
                  Եկամուտ
                </button>
              </div>

              {!isEditing && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120]">
                    <input
                      ref={receiptInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        void handleReceiptFileChange(f);
                        e.target.value = '';
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                        {voiceRecorder.isRecording
                          ? 'Լսում եմ… թելադրեք ծախսը կամ եկամուտը'
                          : voiceTranscribing
                            ? 'Ձայնագրությունը վերլուծվում է…'
                            : receiptInfo || 'Լրացրեք կտրոնի նկարից կամ թելադրեք ձայնով'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {voiceRecorder.isSupported && (
                        <button
                          type="button"
                          disabled={voiceTranscribing || receiptScanning}
                          onClick={() => void handleQuickVoiceToggle()}
                          className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                            voiceRecorder.isRecording
                              ? 'bg-rose-600 border-rose-600 text-white'
                              : 'border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#2563EB]'
                          }`}
                        >
                          {voiceTranscribing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : voiceRecorder.isRecording ? (
                            <>
                              <Square className="w-3 h-3 fill-current" />
                              <span className="font-mono tabular-nums">{voiceRecorder.elapsedSec}վ</span>
                            </>
                          ) : (
                            <>
                              <Mic className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                              <span>Ձայնով</span>
                            </>
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={receiptScanning || voiceRecorder.isRecording}
                        onClick={() => receiptInputRef.current?.click()}
                        className="shrink-0 min-h-[32px] px-2.5 py-1 rounded-lg border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA] hover:border-[#2563EB] dark:hover:border-[#3B82F6] inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {receiptScanning ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Camera className="w-3.5 h-3.5" />
                        )}
                        <span>{receiptScanning ? 'Կարդում է…' : 'Սկան կտրոն'}</span>
                      </button>
                    </div>
                  </div>

                  {receiptItems.length > 0 && (
                    <div className="px-3 py-2.5 rounded-xl border border-[#CBD5E1]/70 dark:border-[#26334D] bg-[#EFF6FF]/45 dark:bg-[#172554]/25 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-[#1D4ED8] dark:text-[#60A5FA]">
                          Կտրոնի ապրանքներ ({receiptItems.length})
                        </span>
                        <button
                          type="button"
                          disabled={receiptNoteSaved}
                          onClick={handleSaveReceiptAsNote}
                          className="min-h-[26px] px-2 py-0.5 rounded-md border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-[11px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#2563EB] inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                        >
                          {receiptNoteSaved ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span>Պահպանվեց նշումներում</span>
                            </>
                          ) : (
                            <>
                              <NotebookPen className="w-3 h-3 text-[#2563EB] dark:text-[#60A5FA]" />
                              <span>Պահել նաև որպես նշում</span>
                            </>
                          )}
                        </button>
                      </div>
                      <ul className="max-h-24 overflow-y-auto scroll-container space-y-0.5 text-[11px] text-[#475569] dark:text-[#CBD5E1]">
                        {receiptItems.map((line, i) => (
                          <li key={`${line}-${i}`} className="truncate">
                            · {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

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

              <div>
                <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
                        Գումար ({inputCurrency})
                      </label>
                      <div className="inline-flex items-center gap-1">
                        {(['AMD', 'USD', 'EUR', 'RUB', 'GEL'] as const).map((code) => (
                          <button
                            key={code}
                            type="button"
                            onClick={() => void handleSelectCurrency(code)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold cursor-pointer transition-colors ${
                              inputCurrency === code
                                ? 'bg-[#2563EB] text-white'
                                : 'bg-[#F1F5F9] dark:bg-[#1E293B] text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                            }`}
                          >
                            {code}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      ref={amountRef}
                      type="number"
                      min={inputCurrency === 'AMD' ? '1' : '0.01'}
                      step="any"
                      value={txAmount}
                      onChange={(e) => setTxAmount(e.target.value)}
                      placeholder={inputCurrency === 'AMD' ? '10000' : '100'}
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
                        if (
                          nextDate > getTodayISO() &&
                          txType === 'expense' &&
                          !userToggledPending
                        ) {
                          setTxIsPending(true);
                        }
                      }}
                      className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
                    />
                  </div>
                </div>

                {inputCurrency !== 'AMD' && (
                  <div className="mt-2 px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="inline-flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                      <span className="text-[#64748B] dark:text-[#94A3B8]">
                        1 {inputCurrency} =
                      </span>
                      {fxLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2563EB]" />
                      ) : (
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={customFxRate}
                          onChange={(e) => setCustomFxRate(e.target.value)}
                          placeholder="Փոխարժեք"
                          aria-label={`${inputCurrency} փոխարժեք`}
                          className="w-20 min-h-[28px] px-2 py-0.5 text-xs font-mono tabular-nums rounded-lg input-field"
                        />
                      )}
                      <span className="text-[#64748B] dark:text-[#94A3B8]">֏</span>
                    </div>
                    <span className="pa-sensitive font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
                      = {formatMoney(convertedAmountAMD)}
                    </span>
                  </div>
                )}

                {inputCurrency === 'AMD' && (
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {QUICK_AMOUNTS_AMD.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleQuickPreset(preset)}
                        className="min-h-[32px] rounded-lg border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] hover:border-[#2563EB] dark:hover:border-[#3B82F6] text-[11px] font-mono tabular-nums text-[#475569] dark:text-[#CBD5E1] active:scale-[0.96] transition-all cursor-pointer"
                      >
                        +{preset.toLocaleString()}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                  {txType === 'income' ? 'Եկամտի աղբյուր' : 'Ծախսի նպատակ'}
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  value={txTitle}
                  onChange={(e) => handleTxTitleChange(e.target.value)}
                  onFocus={() => setIsTxTitleFocused(true)}
                  onBlur={() => {
                    setTimeout(() => setIsTxTitleFocused(false), 180);
                  }}
                  placeholder={
                    txType === 'income'
                      ? 'Օրինակ՝ Աշխատավարձ կամ պատվեր'
                      : 'Օրինակ՝ Սուպերմարկետ կամ կոմունալ'
                  }
                  className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
                />

                {isTxTitleFocused && txTitleSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl shadow-xl z-40 p-1.5 space-y-0.5 text-xs max-h-48 overflow-y-auto scroll-container">
                    <p className="px-2 py-1 text-[11px] font-semibold text-[#64748B] dark:text-[#94A3B8]">
                      Նախկին վերնագրեր
                    </p>
                    {txTitleSuggestions.map((sug) => (
                      <button
                        key={`${sug.title}-${sug.category}`}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectTxTitleSuggestion(sug);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] flex items-center justify-between gap-2 transition-colors cursor-pointer"
                      >
                        <span className="truncate font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                          {sug.title}
                        </span>
                        <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-[#EFF6FF] dark:bg-[#172554] text-[#2563EB] dark:text-[#60A5FA]">
                          {sug.category}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
                    Կատեգորիա
                  </label>
                  {autoCategoryPrediction &&
                    !userSelectedCategory &&
                    autoCategoryPrediction.category === txCategory && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#1D4ED8] dark:text-[#60A5FA]"
                        title={`Հիմնված է նախկին «${autoCategoryPrediction.matchedTitle}» գրանցման վրա`}
                      >
                        <Wand2 className="w-3 h-3" />
                        <span>Ավտոմատ ընտրված</span>
                      </span>
                    )}
                </div>
                <select
                  value={txCategory}
                  onChange={(e) => {
                    setUserSelectedCategory(true);
                    setTxCategory(e.target.value);
                  }}
                  className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                {autoCategoryPrediction &&
                  !userSelectedCategory &&
                  autoCategoryPrediction.category === txCategory && (
                    <p className="mt-1 text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                      Նախկին «{autoCategoryPrediction.matchedTitle}» վերնագրի հիման վրա
                    </p>
                  )}
                {userSelectedCategory &&
                  autoCategoryPrediction &&
                  autoCategoryPrediction.category !== txCategory && (
                    <button
                      type="button"
                      onClick={() => {
                        setTxCategory(autoCategoryPrediction.category);
                        setUserSelectedCategory(false);
                      }}
                      className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-[#1D4ED8] dark:text-[#60A5FA] hover:underline cursor-pointer text-left"
                    >
                      <Wand2 className="w-3 h-3 shrink-0" />
                      <span>
                        Ընտրել «{autoCategoryPrediction.category}» (նախկին «
                        {autoCategoryPrediction.matchedTitle}»-ով)
                      </span>
                    </button>
                  )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                  #Թեգեր (ըստ ցանկության)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.endsWith(',')) {
                        handleAddTag(val.slice(0, -1));
                      } else {
                        setTagInput(val);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tagInput.trim()) {
                        e.preventDefault();
                        handleAddTag(tagInput);
                      }
                    }}
                    placeholder="Օրինակ՝ գործուղում, ընտանիք (Enter)"
                    className="flex-1 min-w-0 min-h-[38px] px-3 py-1.5 text-xs sm:text-sm rounded-xl input-field"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTag(tagInput)}
                    disabled={!tagInput.trim()}
                    className="min-h-[38px] px-3 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-[#F8FAFC] dark:bg-[#111A2E] text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:border-[#2563EB] disabled:opacity-45 cursor-pointer shrink-0"
                  >
                    + #թեգ
                  </button>
                </div>
                {txTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {txTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setTxTags((prev) => prev.filter((t) => t !== tag))
                        }
                        title="Սեղմեք՝ հեռացնելու համար"
                        className="px-2 py-1 rounded-lg border border-[#E2E8F0] dark:border-[#26334D] bg-[#F8FAFC] dark:bg-[#111A2E] text-xs font-mono text-[#1D4ED8] dark:text-[#60A5FA] hover:border-rose-400 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>#{tag}</span>
                        <X className="w-3 h-3 opacity-70" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
                    Քարտ / Դրամապանակ
                  </label>
                  {cards.length === 0 && !isEditing && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('card');
                        setError('');
                      }}
                      className="text-[11px] font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
                    >
                      + Ավելացնել քարտ
                    </button>
                  )}
                </div>
                <select
                  value={txCardId}
                  onChange={(e) => setTxCardId(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
                >
                  {cards.map((card) => {
                    const stats = cardStatsMap.get(card.id);
                    const cur = normalizeCardCurrency(card.currency);
                    const bal = stats?.currentBalance ?? card.initialBalance;
                    return (
                      <option key={card.id} value={card.id}>
                        {formatCardLabel(card)} ({formatCardMoney(bal, cur)})
                      </option>
                    );
                  })}
                  <option value="">Առանց քարտի (չկապված)</option>
                </select>

                {selectedCardStats && convertedAmountAMD > 0 && (() => {
                  const rawNum = Number(txAmount) || 0;
                  const editingContribution =
                    editingTx && editingTx.cardId === txCardId
                      ? editingTx.type === 'income'
                        ? getTxAmountInCardCurrency(
                            editingTx,
                            selectedCardCurrency,
                            effectiveFxRates
                          )
                        : editingTx.isPending
                          ? 0
                          : -getTxAmountInCardCurrency(
                              editingTx,
                              selectedCardCurrency,
                              effectiveFxRates
                            )
                      : 0;
                  const nextNativeAmount =
                    selectedCardCurrency === 'AMD'
                      ? convertedAmountAMD
                      : inputCurrency === selectedCardCurrency
                        ? rawNum
                        : convertFromAMD(
                            convertedAmountAMD,
                            selectedCardCurrency,
                            effectiveFxRates
                          );
                  const nextContribution =
                    txType === 'income' ? nextNativeAmount : -nextNativeAmount;
                  const projectedCardBalance =
                    selectedCardStats.currentBalance -
                    editingContribution +
                    nextContribution;

                  return (
                    <p className="mt-1 text-[11px] font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8]">
                      {txType === 'expense' && txIsPending ? (
                        'Սպասվող նախածախս · քարտի բալանսից դեռ չի հանվի'
                      ) : (
                        <>
                          Քարտի բալանսը կդառնա՝{' '}
                          <strong
                            className={`pa-sensitive ${
                              txType === 'income'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-[#0F172A] dark:text-[#F8FAFC]'
                            }`}
                          >
                            {formatCardMoney(projectedCardBalance, selectedCardCurrency)}
                          </strong>
                        </>
                      )}
                    </p>
                  );
                })()}
              </div>

              {txType === 'expense' && (
                <div
                  className={`p-3 rounded-xl border transition-all ${
                    txIsPending
                      ? 'border-amber-400/60 bg-amber-500/10 dark:bg-amber-500/15'
                      : 'border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E]'
                  }`}
                >
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={txIsPending}
                      onChange={(e) => {
                        setUserToggledPending(true);
                        setTxIsPending(e.target.checked);
                      }}
                      className="w-4 h-4 mt-0.5 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                    <div className="space-y-0.5 select-none">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                          Նշել որպես նախածախս (սպասվող)
                        </span>
                        {txDate > getTodayISO() && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
                            Ապագա ամսաթիվ
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                        Ծախսը չի հանվի բալանսից մինչև այն չհաստատեք։
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {!isEditing && txType === 'expense' && (
                <SplitExpenseSection
                  totalAmountAMD={convertedAmountAMD}
                  enabled={splitEnabled}
                  onToggleEnabled={setSplitEnabled}
                  splitMode={splitMode}
                  onChangeMode={setSplitMode}
                  includeSelf={splitIncludeSelf}
                  onToggleIncludeSelf={setSplitIncludeSelf}
                  splits={splits}
                  onChangeSplits={setSplits}
                />
              )}
            </>
          )}

          {mode === 'card' && (
            <>
              <div>
                <span className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1.5">
                  Արագ ընտրություն (բանկ / դրամապանակ)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {ARMENIAN_BANK_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setCardName(preset.name);
                        setCardType(preset.cardType);
                        setCardColor(preset.color);
                      }}
                      className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] hover:border-[#2563EB] dark:hover:border-[#3B82F6] text-xs font-medium text-[#334155] dark:text-[#CBD5E1] transition-colors cursor-pointer"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                  Քարտի կամ դրամապանակի անուն
                </label>
                <input
                  ref={cardInputRef}
                  type="text"
                  maxLength={120}
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  placeholder="Օրինակ՝ Ամերիաբանկ Visa կամ Կանխիկ"
                  className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
                />
              </div>

              <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                    Արժույթ
                  </label>
                  <select
                    value={cardCurrency}
                    onChange={(e) =>
                      setCardCurrency(normalizeCardCurrency(e.target.value))
                    }
                    className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
                  >
                    {CARD_CURRENCIES.map((cur) => (
                      <option key={cur} value={cur}>
                        {CARD_CURRENCY_META[cur].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                    Սկզբնական բալանս ({CARD_CURRENCY_META[cardCurrency].symbol})
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={cardInitialBalance}
                    onChange={(e) => setCardInitialBalance(e.target.value)}
                    placeholder="0"
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                    Տեսակ
                  </label>
                  <select
                    value={cardType}
                    onChange={(e) => setCardType(e.target.value as CardType)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
                  >
                    {(Object.keys(CARD_TYPE_META) as CardType[]).map((t) => (
                      <option key={t} value={t}>
                        {CARD_TYPE_META[t].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {cardType !== 'cash' && (
                <div>
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                    Վերջին 4 թվերը (ըստ ցանկության)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={cardLast4}
                    onChange={(e) =>
                      setCardLast4(e.target.value.replace(/\D/g, '').slice(0, 4))
                    }
                    placeholder="4589"
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums tracking-widest rounded-xl input-field"
                  />
                </div>
              )}

              <div>
                <span className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1.5">
                  Քարտի գույն
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {CARD_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCardColor(c.id)}
                      aria-pressed={cardColor === c.id}
                      className={`min-h-[34px] px-2.5 py-1 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                        cardColor === c.id
                          ? 'border-[#2563EB] bg-[#EFF6FF] dark:bg-[#172554] text-[#0F172A] dark:text-[#F8FAFC]'
                          : 'border-[#E2E8F0] dark:border-[#1E293B] text-[#64748B] dark:text-[#94A3B8] hover:border-[#CBD5E1]'
                      }`}
                    >
                      <span className={`w-3 h-3 rounded-full ${c.dotClass}`} />
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] cursor-pointer">
                <input
                  type="checkbox"
                  checked={cardIsDefault}
                  onChange={(e) => setCardIsDefault(e.target.checked)}
                  className="w-4 h-4 rounded text-[#2563EB] focus:ring-[#2563EB] cursor-pointer"
                />
                <span className="text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                  Դարձնել հիմնական քարտ (ավտոմատ ընտրվող նոր գործարքներում)
                </span>
              </label>

              <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                Առանց բանկային միացման․ քարտի մուտքերն ու ելքերը կառավարում եք դուք ձեռքով, իսկ բալանսը հաշվարկվում է ավտոմատ։
              </p>
            </>
          )}

          {mode === 'task' && (
            <>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
                    Անելիքի անվանում
                  </label>
                  {voiceRecorder.isSupported && (
                    <button
                      type="button"
                      disabled={voiceTranscribing}
                      onClick={() => void handleQuickVoiceToggle()}
                      className={`min-h-[26px] px-2 py-0.5 rounded-md border text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                        voiceRecorder.isRecording
                          ? 'bg-rose-600 border-rose-600 text-white'
                          : 'border-[#E2E8F0] dark:border-[#26334D] bg-[#F8FAFC] dark:bg-[#0B1120] text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB]'
                      }`}
                    >
                      {voiceTranscribing ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : voiceRecorder.isRecording ? (
                        <>
                          <Square className="w-2.5 h-2.5 fill-current" />
                          <span className="font-mono tabular-nums">{voiceRecorder.elapsedSec}վ</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-3 h-3 text-[#2563EB] dark:text-[#60A5FA]" />
                          <span>Ձայնով</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <input
                  ref={taskInputRef}
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Օրինակ՝ Վճարել ինտերնետի հաշիվը"
                  className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                  Պարբերականություն
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-xl surface-subtle">
                  {TASK_SCHEDULE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTaskScheduleType(opt.id)}
                      className={`min-h-[34px] px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        taskScheduleType === opt.id
                          ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                          : 'text-[#64748B] dark:text-[#94A3B8]'
                      }`}
                    >
                      {opt.shortLabel}
                    </button>
                  ))}
                </div>
              </div>

              {taskScheduleType === 'recurring' && (
                <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                      Կրկնության հաճախականություն
                    </label>
                    <select
                      value={taskRepeatInterval}
                      onChange={(e) =>
                        setTaskRepeatInterval(
                          e.target.value as TaskRepeatInterval
                        )
                      }
                      className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm rounded-xl input-field"
                    >
                      {TASK_REPEAT_INTERVAL_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {taskRepeatInterval === 'every_n_days' && (
                    <div>
                      <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                        Ամեն քանի՞ օրը մեկ
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={taskRepeatEveryDays}
                        onChange={(e) => setTaskRepeatEveryDays(e.target.value)}
                        className="w-full min-h-[40px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
                      />
                    </div>
                  )}
                </div>
              )}

              {taskScheduleType === 'weekdays' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
                      Ընտրեք շաբաթվա օրերը
                    </span>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() =>
                          setTaskSelectedWeekdays([1, 2, 3, 4, 5])
                        }
                        className="text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
                      >
                        Աշխ. օրեր
                      </button>
                      <span className="text-[#CBD5E1] dark:text-[#334155]">
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => setTaskSelectedWeekdays([6, 0])}
                        className="text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
                      >
                        Հանգստյան
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {WEEKDAY_OPTIONS.map((wd) => {
                      const active = taskSelectedWeekdays.includes(wd.day);
                      return (
                        <button
                          key={wd.day}
                          type="button"
                          onClick={() =>
                            setTaskSelectedWeekdays((prev) =>
                              prev.includes(wd.day)
                                ? prev.filter((d) => d !== wd.day)
                                : [...prev, wd.day]
                            )
                          }
                          aria-pressed={active}
                          className={`min-h-[36px] rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#2563EB] border-[#2563EB] dark:bg-[#3B82F6] dark:border-[#3B82F6] text-white dark:text-[#060B16]'
                              : 'border-[#CBD5E1] dark:border-[#26334D] text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB]'
                          }`}
                        >
                          {wd.short}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

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
                    {taskScheduleType === 'one_time'
                      ? 'Ամսաթիվ'
                      : 'Սկզբի ամսաթիվ'}
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

              <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC]/80 dark:bg-[#0B1120] p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#475569] dark:text-[#CBD5E1]">
                    Նախատեսվող ծախս (ըստ ցանկության)
                  </span>
                  <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                    Ավտոմատ նախածախս մատյանում
                  </span>
                </div>
                <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2.5">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={taskExpectedAmount}
                    onChange={(e) => setTaskExpectedAmount(e.target.value)}
                    placeholder="Գումար (֏), օր. 8000"
                    className="w-full min-h-[38px] px-3 py-1.5 text-xs sm:text-sm font-mono tabular-nums rounded-xl input-field"
                  />
                  <select
                    value={taskExpectedCategory}
                    onChange={(e) => setTaskExpectedCategory(e.target.value)}
                    disabled={!Number(taskExpectedAmount)}
                    className="w-full min-h-[38px] px-3 py-1.5 text-xs sm:text-sm rounded-xl input-field disabled:opacity-50"
                  >
                    {expenseCategoriesForTask.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {mode === 'habit' && (
            <div>
              <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                Սովորության անվանում
              </label>
              <input
                ref={habitInputRef}
                type="text"
                value={habitTitle}
                onChange={(e) => setHabitTitle(e.target.value)}
                placeholder="Օրինակ՝ 20 րոպե անգլերեն կամ 2 լիտր ջուր"
                className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl input-field"
              />
              <p className="mt-1.5 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                Սովորությունները կհետևվեն ամեն օր «Անելիքներ → Սովորություններ» բաժնում։
              </p>
            </div>
          )}

          {mode === 'note' && (
            <>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
                    Վերնագիր
                  </label>
                  {voiceRecorder.isSupported && (
                    <button
                      type="button"
                      disabled={voiceTranscribing}
                      onClick={() => void handleQuickVoiceToggle()}
                      className={`min-h-[26px] px-2 py-0.5 rounded-md border text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                        voiceRecorder.isRecording
                          ? 'bg-rose-600 border-rose-600 text-white'
                          : 'border-[#E2E8F0] dark:border-[#26334D] bg-[#F8FAFC] dark:bg-[#0B1120] text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB]'
                      }`}
                    >
                      {voiceTranscribing ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : voiceRecorder.isRecording ? (
                        <>
                          <Square className="w-2.5 h-2.5 fill-current" />
                          <span className="font-mono tabular-nums">{voiceRecorder.elapsedSec}վ</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-3 h-3 text-[#2563EB] dark:text-[#60A5FA]" />
                          <span>Թելադրել</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <input
                  ref={noteInputRef}
                  type="text"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Օրինակ՝ Սուպերմարկետի գնումներ"
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

              {/* Interactive Checklist Builder */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
                  Կետերի ցուցակ / Գնումներ (ըստ ցանկության)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newChecklistText}
                    onChange={(e) => setNewChecklistText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddChecklistItem();
                      }
                    }}
                    placeholder="Ավելացնել կետ (Enter)..."
                    className="flex-1 min-w-0 min-h-[38px] px-3 py-1.5 text-xs sm:text-sm rounded-xl input-field"
                  />
                  <button
                    type="button"
                    onClick={handleAddChecklistItem}
                    aria-label="Ավելացնել ցուցակի կետ"
                    className="min-h-[38px] min-w-[38px] rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-[#F8FAFC] dark:bg-[#111A2E] text-[#2563EB] dark:text-[#60A5FA] hover:border-[#2563EB] flex items-center justify-center cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {noteChecklist.length > 0 && (
                  <div className="max-h-36 overflow-y-auto scroll-container space-y-1.5 p-2 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120]">
                    {noteChecklist.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setNoteChecklist((prev) =>
                              prev.map((c) =>
                                c.id === item.id ? { ...c, done: !c.done } : c
                              )
                            )
                          }
                          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                        >
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              item.done
                                ? 'bg-[#2563EB] border-[#2563EB] text-white'
                                : 'border-[#CBD5E1] dark:border-[#334155]'
                            }`}
                          >
                            {item.done && <Check className="w-2.5 h-2.5" />}
                          </span>
                          <span
                            className={`truncate ${
                              item.done
                                ? 'line-through text-[#94A3B8]'
                                : 'text-[#0F172A] dark:text-[#F8FAFC]'
                            }`}
                          >
                            {item.text}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setNoteChecklist((prev) =>
                              prev.filter((c) => c.id !== item.id)
                            )
                          }
                          aria-label={`Հեռացնել ${item.text}`}
                          className="text-[#94A3B8] hover:text-rose-500 p-1 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                  Հիշեցում (ըստ ցանկության)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="datetime-local"
                    value={noteReminder}
                    onChange={(e) => setNoteReminder(e.target.value)}
                    className="flex-1 min-w-0 min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
                  />
                  {noteReminder && (
                    <button
                      type="button"
                      onClick={() => setNoteReminder('')}
                      aria-label="Մաքրել հիշեցումը"
                      className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl border border-[#CBD5E1] dark:border-[#26334D] text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] cursor-pointer shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {mode === 'goal' && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                  Նպատակի անվանում (Գանձանակ)
                </label>
                <input
                  ref={goalInputRef}
                  type="text"
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  placeholder="Օրինակ՝ Ամառային ճամփորդություն կամ Նոր նոութբուք"
                  className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
                />
              </div>

              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                    Նպատակային գումար (֏)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={goalTargetAmount}
                    onChange={(e) => setGoalTargetAmount(e.target.value)}
                    placeholder="500000"
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                    Արդեն հավաքված (֏)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={goalCurrentAmount}
                    onChange={(e) => setGoalCurrentAmount(e.target.value)}
                    placeholder="0"
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                    Կատեգորիա
                  </label>
                  <select
                    value={goalCategory}
                    onChange={(e) => setGoalCategory(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
                  >
                    {SAVINGS_GOAL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                    Վերջնաժամկետ (ըստ ցանկության)
                  </label>
                  <input
                    type="date"
                    value={goalDeadline}
                    onChange={(e) => setGoalDeadline(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
                  />
                </div>
              </div>
            </>
          )}

          {mode === 'debt' && (
            <>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl surface-subtle">
                <button
                  type="button"
                  onClick={() => setDebtDirection('lent')}
                  className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    debtDirection === 'lent'
                      ? 'bg-white dark:bg-[#0F172A] text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-[#64748B] dark:text-[#94A3B8]'
                  }`}
                >
                  Ինձ են պարտք
                </button>
                <button
                  type="button"
                  onClick={() => setDebtDirection('borrowed')}
                  className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    debtDirection === 'borrowed'
                      ? 'bg-white dark:bg-[#0F172A] text-rose-600 dark:text-rose-400 shadow-xs'
                      : 'text-[#64748B] dark:text-[#94A3B8]'
                  }`}
                >
                  Ես եմ պարտք
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                  Անձի կամ կազմակերպության անուն
                </label>
                <input
                  ref={debtInputRef}
                  type="text"
                  value={debtPerson}
                  onChange={(e) => setDebtPerson(e.target.value)}
                  placeholder="Օրինակ՝ Արամ"
                  className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
                />
              </div>

              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                    Ընդհանուր գումար (֏)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={debtTotalAmount}
                    onChange={(e) => setDebtTotalAmount(e.target.value)}
                    placeholder="50000"
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                    Արդեն մարված (֏)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={debtPaidAmount}
                    onChange={(e) => setDebtPaidAmount(e.target.value)}
                    placeholder="0"
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                    Վերադարձի ժամկետ (ընտրովի)
                  </label>
                  <input
                    type="date"
                    value={debtDueDate}
                    onChange={(e) => setDebtDueDate(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                    Նշում (ըստ ցանկության)
                  </label>
                  <input
                    type="text"
                    value={debtNote}
                    onChange={(e) => setDebtNote(e.target.value)}
                    placeholder="Օրինակ՝ ճաշի համար"
                    className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
                  />
                </div>
              </div>
            </>
          )}

          {(error || voiceRecorder.error) && (
            <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">
              {error || voiceRecorder.error}
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
              {isEditing ? 'Պահպանել փոփոխությունը' : 'Պահպանել'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
