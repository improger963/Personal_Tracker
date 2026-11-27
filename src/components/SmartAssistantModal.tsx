import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  CheckCheck,
  Loader2,
  Mic,
  Plus,
  RotateCcw,
  Send,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  AssistantSuggestedAction,
  SmartWorkspaceContext,
  askSmartAssistant,
  askSmartAssistantStream,
  transcribeAudioWithAI,
} from '../services/smartAi';
import { formatMoney, getInitialNotificationSettings } from '../data/defaults';
import { FinancePageTab } from './finance/financeShared';
import {
  DebtItem,
  NotificationSettings,
  PlannerPageTab,
  RecurringBill,
  SavingsGoal,
  TaskPriority,
} from '../types';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import {
  speakNotificationText,
  stopNotificationVoice,
  subscribeVoicePlaybackState,
} from '../utils/notifications';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  actions?: AssistantSuggestedAction[];
  executedActionKeys?: string[];
}

interface SmartAssistantModalProps {
  onClose: () => void;
  initialPrompt?: string;
  context: SmartWorkspaceContext;
  todayISO: string;
  defaultCardId?: string;
  notificationSettings?: NotificationSettings;
  onAddTransaction: (tx: {
    type: 'income' | 'expense';
    amount: number;
    title: string;
    category: string;
    date: string;
    cardId?: string;
    incomeKind?: 'extra';
  }) => void;
  onAddTask: (task: {
    title: string;
    priority: TaskPriority;
    date: string;
    dueTime?: string;
    scheduleType: 'one_time';
  }) => void;
  onAddNote: (note: { title: string; content: string; pinned: boolean }) => void;
  onAddHabit?: (title: string) => void;
  onAddGoal?: (goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => void;
  onAddDebt?: (debt: Omit<DebtItem, 'id' | 'createdAt'>) => void;
  onAddRecurringBill?: (bill: Omit<RecurringBill, 'id'>) => void;
  onSaveBudget?: (category: string, limit: number) => void;
  onNavigateFinance: (page: FinancePageTab) => void;
  onNavigatePlanner: (page: PlannerPageTab) => void;
  onNavigateNotes: () => void;
}

const STARTER_PROMPTS = [
  'Ամփոփիր իմ ընթացիկ ֆինանսական վիճակը և գլխավոր ռիսկերը',
  'Կարո՞ղ եմ թույլ տալ 250,000 ֏ գնում այս ամիս',
  'Որտե՞ղ կարող եմ կրճատել ծախսերս այս ցիկլում',
  'Կազմիր այսօրվա առաջնահերթ անելիքների պլանը',
];

export function SmartAssistantModal({
  onClose,
  initialPrompt,
  context,
  todayISO,
  defaultCardId,
  notificationSettings,
  onAddTransaction,
  onAddTask,
  onAddNote,
  onAddHabit,
  onAddGoal,
  onAddDebt,
  onAddRecurringBill,
  onSaveBudget,
  onNavigateFinance,
  onNavigatePlanner,
  onNavigateNotes,
}: SmartAssistantModalProps) {
  const prefersReducedMotion = useReducedMotion();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(initialPrompt ?? '');
  const [loading, setLoading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [isTtsSpeaking, setIsTtsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoSentInitialRef = useRef(false);
  const requestAbortRef = useRef<AbortController | null>(null);

  const voiceRecorder = useVoiceRecorder();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const unsubSpeak = subscribeVoicePlaybackState((speaking) => {
      setIsTtsSpeaking(speaking);
      if (!speaking) setSpeakingMsgId(null);
    });
    return () => {
      window.removeEventListener('keydown', onKey);
      requestAbortRef.current?.abort();
      stopNotificationVoice();
      unsubSpeak();
    };
  }, [onClose]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);

  const sendMessage = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;

    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;

    setError(null);
    if (!textOverride) setInput('');

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
    };
    const streamId = `m-${Date.now() + 1}`;
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setLoading(true);
    setStreamingMsgId(streamId);

    const history = nextMessages.slice(-7, -1).map((m) => ({
      role: m.role,
      text: m.text,
    }));

    let hasReceivedDelta = false;
    try {
      await askSmartAssistantStream({
        message: text,
        history,
        context,
        signal: controller.signal,
        onDelta: (chunk) => {
          if (controller.signal.aborted) return;
          if (!hasReceivedDelta) {
            hasReceivedDelta = true;
            setMessages((prev) => [
              ...prev,
              {
                id: streamId,
                role: 'model',
                text: chunk,
                actions: [],
                executedActionKeys: [],
              },
            ]);
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamId ? { ...m, text: m.text + chunk } : m
              )
            );
          }
        },
        onActions: (actions) => {
          if (controller.signal.aborted) return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamId ? { ...m, actions } : m
            )
          );
        },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!hasReceivedDelta && !controller.signal.aborted) {
        try {
          const result = await askSmartAssistant({
            message: text,
            history,
            context,
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          setMessages((prev) => [
            ...prev,
            {
              id: streamId,
              role: 'model',
              text: result.reply,
              actions: result.suggestedActions,
              executedActionKeys: [],
            },
          ]);
          return;
        } catch (fallbackErr) {
          if (fallbackErr instanceof DOMException && fallbackErr.name === 'AbortError') return;
          setError(
            fallbackErr instanceof Error
              ? fallbackErr.message
              : 'Հնարավոր չեղավ ստանալ պատասխան։'
          );
          return;
        }
      }
      setError(
        err instanceof Error ? err.message : 'Հնարավոր չեղավ ստանալ պատասխան։'
      );
    } finally {
      if (requestAbortRef.current === controller) {
        setLoading(false);
        setStreamingMsgId(null);
        requestAbortRef.current = null;
      }
    }
  };

  const handleStopStreaming = () => {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    setLoading(false);
    setStreamingMsgId(null);
  };

  useEffect(() => {
    if (initialPrompt && !autoSentInitialRef.current) {
      autoSentInitialRef.current = true;
      setInput('');
      void sendMessage(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  const executeSingleAction = (action: AssistantSuggestedAction): boolean => {
    if (action.kind === 'navigate' && action.route) {
      const r = action.route;
      if (
        r === 'budgets' ||
        r === 'analytics' ||
        r === 'bills' ||
        r === 'goals' ||
        r === 'debts' ||
        r === 'ledger' ||
        r === 'cards'
      ) {
        onNavigateFinance(r);
        onClose();
        return false;
      }
      if (r === 'tasks' || r === 'habits' || r === 'focus') {
        onNavigatePlanner(r);
        onClose();
        return false;
      }
      if (r === 'notes') {
        onNavigateNotes();
        onClose();
        return false;
      }
      return false;
    }

    if (action.kind === 'add_transaction' && action.amount && action.amount > 0) {
      onAddTransaction({
        type: action.txType === 'income' ? 'income' : 'expense',
        incomeKind: action.txType === 'income' ? 'extra' : undefined,
        amount: Math.round(action.amount),
        title: action.title?.trim() || action.label,
        category: action.category?.trim() || 'Այլ',
        date: todayISO,
        cardId: defaultCardId,
      });
      return true;
    }

    if (action.kind === 'add_task') {
      onAddTask({
        title: action.title?.trim() || action.label,
        priority:
          action.priority === 'high' || action.priority === 'low'
            ? action.priority
            : 'medium',
        date: todayISO,
        dueTime: action.dueTime,
        scheduleType: 'one_time',
      });
      return true;
    }

    if (action.kind === 'add_note') {
      onAddNote({
        title: action.title?.trim() || action.label,
        content: action.content?.trim() || action.label,
        pinned: false,
      });
      return true;
    }

    if (action.kind === 'add_habit' && onAddHabit) {
      const title = action.title?.trim() || action.label;
      if (!title) return false;
      onAddHabit(title);
      return true;
    }

    if (action.kind === 'add_goal' && onAddGoal) {
      const targetAmount = Math.round(Number(action.targetAmount ?? action.amount ?? 0));
      if (targetAmount <= 0) return false;
      onAddGoal({
        title: action.title?.trim() || action.label,
        targetAmount,
        currentAmount: 0,
        completed: false,
      });
      return true;
    }

    if (action.kind === 'add_debt' && onAddDebt) {
      const amount = Math.round(Number(action.amount ?? 0));
      const person = (action.person || action.title || '').trim();
      if (amount <= 0 || !person) return false;
      onAddDebt({
        person,
        direction: action.direction === 'owed_to_me' ? 'lent' : 'borrowed',
        totalAmount: amount,
        paidAmount: 0,
        note: action.title && action.title !== person ? action.title : undefined,
        settled: false,
      });
      return true;
    }

    if (action.kind === 'add_bill' && onAddRecurringBill) {
      const amount = Math.round(Number(action.amount ?? 0));
      if (amount <= 0) return false;
      onAddRecurringBill({
        title: action.title?.trim() || action.label,
        amount,
        category: action.category?.trim() || 'Կոմունալ',
        frequency: action.frequency === 'daily' ? 'daily' : 'monthly',
        dayOfMonth: Math.min(31, Math.max(1, Math.round(action.dayOfMonth ?? 10))),
        active: true,
      });
      return true;
    }

    if (action.kind === 'set_budget' && onSaveBudget) {
      const limit = Math.round(Number(action.limit ?? action.amount ?? 0));
      const category = action.category?.trim();
      if (limit <= 0 || !category) return false;
      onSaveBudget(category, limit);
      return true;
    }

    return false;
  };

  const handleRunAction = (
    msgId: string,
    idx: number,
    action: AssistantSuggestedAction
  ) => {
    const actionKey = `${msgId}:${idx}`;
    const didExecute = executeSingleAction(action);
    if (!didExecute) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? {
              ...m,
              executedActionKeys: [...(m.executedActionKeys ?? []), actionKey],
            }
          : m
      )
    );
  };

  const handleRunAllActions = (msg: ChatMessage) => {
    if (!msg.actions || msg.actions.length === 0) return;
    const newlyDone: string[] = [];
    msg.actions.forEach((action, idx) => {
      if (action.kind === 'navigate') return;
      const actionKey = `${msg.id}:${idx}`;
      if (msg.executedActionKeys?.includes(actionKey)) return;
      if (executeSingleAction(action)) {
        newlyDone.push(actionKey);
      }
    });
    if (newlyDone.length === 0) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? {
              ...m,
              executedActionKeys: [...(m.executedActionKeys ?? []), ...newlyDone],
            }
          : m
      )
    );
  };

  const handleVoiceToggle = async () => {
    setError(null);
    if (voiceRecorder.isRecording) {
      const payload = await voiceRecorder.stopRecording();
      if (!payload) return;
      setTranscribing(true);
      try {
        const text = await transcribeAudioWithAI({
          audioBase64: payload.audioBase64,
          mimeType: payload.mimeType,
        });
        setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
        inputRef.current?.focus();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Չհաջողվեց տեքստավորել ձայնագրությունը։'
        );
      } finally {
        setTranscribing(false);
      }
    } else {
      await voiceRecorder.startRecording();
    }
  };

  const handleSpeakReply = async (msg: ChatMessage) => {
    if (isTtsSpeaking && speakingMsgId === msg.id) {
      stopNotificationVoice();
      setSpeakingMsgId(null);
      return;
    }
    setSpeakingMsgId(msg.id);
    const activeSettings = notificationSettings ?? getInitialNotificationSettings();
    await speakNotificationText(msg.text, activeSettings, { maxChars: 600 });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#020617]/65 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="smart-assistant-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: prefersReducedMotion ? 0.04 : 0.18,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="w-full sm:max-w-2xl h-[90dvh] sm:h-[640px] max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-2xl border-t sm:border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] shadow-2xl overflow-hidden"
      >
        <div className="w-10 h-1 rounded-full bg-[#CBD5E1] dark:bg-[#334155] mx-auto mt-2.5 -mb-1 sm:hidden shrink-0" aria-hidden="true" />
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#EFF6FF] dark:bg-[#172554]/70 text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
              <Bot className="w-4.5 h-4.5" />
            </span>
            <div className="min-w-0">
              <h2
                id="smart-assistant-title"
                className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate"
              >
                Խելացի AI օգնական
              </h2>
              <p className="pa-sensitive text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate tabular-nums">
                {context.cycleLabel} · Բալանս՝ {formatMoney(context.cycleSummary.realBalance)} ·{' '}
                {context.todayTasks.length} անելիք այսօր
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  requestAbortRef.current?.abort();
                  requestAbortRef.current = null;
                  stopNotificationVoice();
                  setLoading(false);
                  setMessages([]);
                  setError(null);
                }}
                title="Նոր զրույց"
                aria-label="Սկսել նոր զրույց"
                className="min-h-[36px] px-2.5 py-1 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] text-xs font-medium text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Մաքրել</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Փակել AI օգնականը"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Conversation Body */}
        <div className="flex-1 overflow-y-auto scroll-container px-4 sm:px-6 py-4 space-y-4">
          {messages.length === 0 ? (
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  Հարցրեք ձեր ֆինանսների, բյուջեի կամ օրակարգի մասին
                </p>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                  Օգնականը վերլուծում է ձեր ընթացիկ ցիկլի մնացորդը, վերջին գործարքները,
                  բյուջեի կանխատեսումը, վճարումներն ու օրակարգը և կարող է ստեղծել
                  գործարքներ, բյուջեներ, նպատակներ, պարտքեր, սովորություններ կամ անելիքներ։
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    className="p-3 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] hover:border-[#2563EB] dark:hover:border-[#3B82F6] text-left text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] transition-colors cursor-pointer flex items-center justify-between gap-2"
                  >
                    <span className="leading-snug">{prompt}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA] shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const executableActions = (msg.actions ?? []).filter(
                (a, idx) =>
                  a.kind !== 'navigate' &&
                  !msg.executedActionKeys?.includes(`${msg.id}:${idx}`)
              );
              const isMsgSpeaking = isTtsSpeaking && speakingMsgId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-3.5 sm:px-4 py-3 text-sm leading-relaxed space-y-2.5 ${
                      msg.role === 'user'
                        ? 'bg-[#2563EB] text-white'
                        : 'bg-[#F8FAFC] dark:bg-[#0B1120] border border-[#E2E8F0] dark:border-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC]'
                    }`}
                  >
                    <p className="whitespace-pre-line break-words">{msg.text}</p>

                    {msg.role === 'model' && (
                      <div className="pt-1.5 border-t border-[#E2E8F0]/70 dark:border-[#1E293B] flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => void handleSpeakReply(msg)}
                          className="min-h-[28px] px-2.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] text-[11px] font-medium text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB] dark:hover:border-[#3B82F6] inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          {isMsgSpeaking ? (
                            <>
                              <VolumeX className="w-3.5 h-3.5 text-rose-500" />
                              <span>Կանգնեցնել</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                              <span>Լսել</span>
                            </>
                          )}
                        </button>

                        {executableActions.length >= 2 && (
                          <button
                            type="button"
                            onClick={() => handleRunAllActions(msg)}
                            className="min-h-[28px] px-2.5 py-1 rounded-lg bg-[#EFF6FF] dark:bg-[#172554] text-[11px] font-semibold text-[#1D4ED8] dark:text-[#60A5FA] hover:opacity-90 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            <span>Կատարել բոլորը ({executableActions.length})</span>
                          </button>
                        )}
                      </div>
                    )}

                    {msg.role === 'model' && msg.actions && msg.actions.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {msg.actions.map((action, idx) => {
                          const actionKey = `${msg.id}:${idx}`;
                          const done = msg.executedActionKeys?.includes(actionKey);
                          return (
                            <button
                              key={actionKey}
                              type="button"
                              disabled={done}
                              onClick={() => handleRunAction(msg.id, idx, action)}
                              className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                                done
                                  ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 cursor-default'
                                  : 'bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#26334D] text-[#1D4ED8] dark:text-[#60A5FA] hover:border-[#2563EB] dark:hover:border-[#3B82F6] cursor-pointer'
                              }`}
                            >
                              {done ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : action.kind === 'navigate' ? (
                                <ArrowRight className="w-3.5 h-3.5" />
                              ) : (
                                <Plus className="w-3.5 h-3.5" />
                              )}
                              <span>{done ? `${action.label} · Կատարված` : action.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {loading && !messages.some((m) => m.id === streamingMsgId) && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-3 bg-[#F8FAFC] dark:bg-[#0B1120] border border-[#E2E8F0] dark:border-[#1E293B] inline-flex items-center gap-2 text-xs text-[#2563EB] dark:text-[#60A5FA] font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Վերլուծում եմ տվյալները…</span>
              </div>
            </div>
          )}

          {(error || voiceRecorder.error) && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error || voiceRecorder.error}</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage();
          }}
          className="px-4 sm:px-6 py-3.5 pb-[calc(0.9rem+env(safe-area-inset-bottom))] border-t border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] flex items-center gap-2 shrink-0"
        >
          {voiceRecorder.isSupported && (
            <button
              type="button"
              disabled={loading || transcribing}
              onClick={() => void handleVoiceToggle()}
              aria-label={
                voiceRecorder.isRecording
                  ? 'Կանգնեցնել ձայնագրությունը'
                  : 'Ձայնային հարցում'
              }
              title={
                voiceRecorder.isRecording
                  ? 'Սեղմեք՝ ավարտելու համար'
                  : 'Հարցնել ձայնով'
              }
              className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-45 ${
                voiceRecorder.isRecording
                  ? 'bg-rose-600 border-rose-600 text-white'
                  : 'bg-white dark:bg-[#0F172A] border-[#CBD5E1] dark:border-[#26334D] text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB] dark:hover:border-[#3B82F6]'
              }`}
            >
              {transcribing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : voiceRecorder.isRecording ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span className="font-mono tabular-nums">{voiceRecorder.elapsedSec}վ</span>
                </>
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              voiceRecorder.isRecording
                ? 'Լսում եմ… խոսեք հայերենով'
                : transcribing
                  ? 'Ձայնագրությունը վերածվում է տեքստի…'
                  : 'Գրեք կամ թելադրեք հարց / հրահանգ…'
            }
            className="flex-1 min-w-0 min-h-[42px] px-3.5 py-2 text-sm rounded-xl input-field"
          />
          {loading ? (
            <button
              type="button"
              onClick={handleStopStreaming}
              aria-label="Կանգնեցնել պատասխանը"
              className="min-h-[42px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">Դադարեցնել</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || voiceRecorder.isRecording || transcribing}
              aria-label="Ուղարկել հարցումը"
              className="min-h-[42px] px-4 py-2 rounded-xl btn-primary text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Հարցնել</span>
            </button>
          )}
        </form>
      </motion.div>
    </div>
  );
}
