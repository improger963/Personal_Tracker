import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import {
  AssistantSuggestedAction,
  SmartWorkspaceContext,
  askSmartAssistant,
} from '../services/smartAi';
import { formatMoney } from '../data/defaults';
import { FinancePageTab } from './finance/financeShared';
import { PlannerPageTab, TaskPriority } from '../types';

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
  onNavigateFinance: (page: FinancePageTab) => void;
  onNavigatePlanner: (page: PlannerPageTab) => void;
  onNavigateNotes: () => void;
}

const STARTER_PROMPTS = [
  'Ամփոփիր իմ ընթացիկ ֆինանսական վիճակը և գլխավոր ռիսկերը',
  'Որտե՞ղ կարող եմ կրճատել ծախսերս այս ցիկլում',
  'Կազմիր այսօրվա առաջնահերթ անելիքների պլանը',
  'Ինչպե՞ս արագացնել խնայողության նպատակներիս հասնելը',
];

export function SmartAssistantModal({
  onClose,
  initialPrompt,
  context,
  todayISO,
  defaultCardId,
  onAddTransaction,
  onAddTask,
  onAddNote,
  onNavigateFinance,
  onNavigatePlanner,
  onNavigateNotes,
}: SmartAssistantModalProps) {
  const prefersReducedMotion = useReducedMotion();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(initialPrompt ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoSentInitialRef = useRef(false);
  const requestAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      requestAbortRef.current?.abort();
    };
  }, [onClose]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const history = nextMessages.slice(-7, -1).map((m) => ({
        role: m.role,
        text: m.text,
      }));
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
          id: `m-${Date.now()}`,
          role: 'model',
          text: result.reply,
          actions: result.suggestedActions,
          executedActionKeys: [],
        },
      ]);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(
        err instanceof Error ? err.message : 'Հնարավոր չեղավ ստանալ պատասխան։'
      );
    } finally {
      if (requestAbortRef.current === controller) {
        setLoading(false);
        requestAbortRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (initialPrompt && !autoSentInitialRef.current) {
      autoSentInitialRef.current = true;
      setInput('');
      void sendMessage(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  const handleRunAction = (msgId: string, idx: number, action: AssistantSuggestedAction) => {
    const actionKey = `${msgId}:${idx}`;
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
        return;
      }
      if (r === 'tasks' || r === 'habits' || r === 'focus') {
        onNavigatePlanner(r);
        onClose();
        return;
      }
      if (r === 'notes') {
        onNavigateNotes();
        onClose();
        return;
      }
    }

    let didExecute = false;

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
      didExecute = true;
    } else if (action.kind === 'add_task') {
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
      didExecute = true;
    } else if (action.kind === 'add_note') {
      onAddNote({
        title: action.title?.trim() || action.label,
        content: action.content?.trim() || action.label,
        pinned: false,
      });
      didExecute = true;
    }

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
        className="w-full sm:max-w-2xl h-[88dvh] sm:h-[640px] max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-2xl border-t sm:border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between gap-3 shrink-0">
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
                  Օգնականը վերլուծում է ձեր ընթացիկ ցիկլի մնացորդը, ծախսերի կանխատեսումը,
                  նպատակներն ու այսօրվա անելիքները և առաջարկում կոնկրետ քայլեր։
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
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed space-y-2.5 ${
                    msg.role === 'user'
                      ? 'bg-[#2563EB] text-white'
                      : 'bg-[#F8FAFC] dark:bg-[#0B1120] border border-[#E2E8F0] dark:border-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC]'
                  }`}
                >
                  <p className="whitespace-pre-line break-words">{msg.text}</p>

                  {msg.role === 'model' && msg.actions && msg.actions.length > 0 && (
                    <div className="pt-2 border-t border-[#E2E8F0]/80 dark:border-[#1E293B] flex flex-wrap gap-2">
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
            ))
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-3 bg-[#F8FAFC] dark:bg-[#0B1120] border border-[#E2E8F0] dark:border-[#1E293B] inline-flex items-center gap-2 text-xs text-[#2563EB] dark:text-[#60A5FA] font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Վերլուծում եմ տվյալները…</span>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
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
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Գրեք հարց կամ հրահանգ (օր.՝ ինչպե՞ս պլանավորել բյուջեն)..."
            className="flex-1 min-w-0 min-h-[42px] px-3.5 py-2 text-sm rounded-xl input-field"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            aria-label="Ուղարկել հարցումը"
            className="min-h-[42px] px-4 py-2 rounded-xl btn-primary text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Հարցնել</span>
          </button>
        </form>
      </motion.div>
    </div>
  );
}
