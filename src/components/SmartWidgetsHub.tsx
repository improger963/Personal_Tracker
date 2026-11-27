import { memo, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  CreditCard,
  Flame,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { SectionCard } from './layout/PagePrimitives';
import { Currency, FocusGoal, Habit, Task, Transaction } from '../types';
import { formatMoney, getTodayISO } from '../data/defaults';
import { SafeToSpendMetrics } from '../utils/financialCycle';
import { SubscriptionLeakDetector } from './finance/SubscriptionLeakDetector';

interface SmartWidgetsHubProps {
  currency: Currency;
  selectedMonth: string;
  cycleLabel: string;
  transactions: Transaction[];
  tasks: Task[];
  habits: Habit[];
  focusGoal: FocusGoal | null;
  safeToSpend: SafeToSpendMetrics;
  netWorth: number;
  totalIncome: number;
  totalExpense: number;
  onOpenAssistant: (prompt?: string) => void;
  onNavigateFinance: (page: any) => void;
  onNavigatePlanner: (page: any) => void;
}

const SMART_PROMPTS = [
  {
    id: 'budget-pace',
    title: 'Բյուջեի և ծախսերի տեմպի վերլուծություն',
    prompt: 'Վերլուծիր իմ ընթացիկ ամսվա ծախսերի տեմպը և տուր խորհուրդներ, թե որ կատեգորիաներում պետք է կրճատել ծախսերը։',
    icon: TrendingUp,
    category: 'Ֆինանսներ',
  },
  {
    id: 'runway-check',
    title: 'Կապիտալի և ֆինանսական պահուստի գնահատում',
    prompt: 'Գնահատիր իմ զուտ կապիտալը և ֆինանսական պահուստի տևողությունը (runway) առկա եկամուտների և ծախսերի հիման վրա։',
    icon: ShieldCheck,
    category: 'Կապիտալ',
  },
  {
    id: 'daily-focus',
    title: 'Այսօրվա առաջնահերթությունների պլանավորում',
    prompt: 'Հիմնվելով իմ չկատարված անելիքների և ֆոկուս նպատակի վրա՝ առաջարկիր այսօրվա օպտիմալ անելիքների հաջորդականություն։',
    icon: Zap,
    category: 'Արդյունավետություն',
  },
  {
    id: 'habit-streak',
    title: 'Սովորությունների և առօրյա ռիթմի օպտիմալացում',
    prompt: 'Վերլուծիր իմ սովորությունների կատարման հաճախականությունը և տուր գործնական խորհուրդներ կայուն առօրյա ռիթմ պահպանելու համար։',
    icon: Flame,
    category: 'Առօրյա',
  },
];

export const SmartWidgetsHub = memo(function SmartWidgetsHub({
  currency,
  selectedMonth,
  cycleLabel,
  transactions,
  tasks,
  habits,
  focusGoal,
  safeToSpend,
  netWorth,
  totalIncome,
  totalExpense,
  onOpenAssistant,
  onNavigateFinance,
  onNavigatePlanner,
}: SmartWidgetsHubProps) {
  const [activeTab, setActiveTab] = useState<'prompts' | 'health' | 'subscriptions' | 'quick'>('prompts');
  const todayISO = getTodayISO();

  const habitsDoneToday = useMemo(
    () => habits.filter((h) => h.completedDates.includes(todayISO)).length,
    [habits, todayISO]
  );

  const pendingTasksCount = useMemo(
    () => tasks.filter((t) => !t.completed).length,
    [tasks]
  );

  const savingsRate =
    totalIncome > 0
      ? Math.max(0, Math.round(((totalIncome - totalExpense) / totalIncome) * 100))
      : 0;

  return (
    <SectionCard
      title="Ինտեգրված խելացի վիջեթներ և AI օգնական"
      subtitle="Արագ մուտք դեպի կանխատեսումներ, բաժանորդագրությունների սկաներ և AI ակնթարթային հարցումներ"
      icon={Sparkles}
      headerRight={
        <div className="flex items-center gap-1 p-0.5 rounded-xl surface-subtle text-xs overflow-x-auto">
          {(
            [
              { id: 'prompts', label: 'AI Հարցումներ' },
              { id: 'health', label: 'Առողջության ինդեքս' },
              { id: 'subscriptions', label: 'Բաժանորդագրություններ' },
              { id: 'quick', label: 'Արագ գործողություններ' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[30px] px-3 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-[#0F172A] text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="space-y-4">
        {activeTab === 'prompts' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
              <span>Սեղմեք ցանկացած խելացի հարցման վրա՝ AI օգնականից ակնթարթային վերլուծություն ստանալու համար</span>
              <button
                type="button"
                onClick={() => onOpenAssistant()}
                className="font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Բացել ամբողջական զրույցը →</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SMART_PROMPTS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onOpenAssistant(item.prompt)}
                    className="group p-4 rounded-2xl border border-[#E2E8F0] dark:border-[#1E293B] bg-gradient-to-br from-[#F8FAFC] to-white dark:from-[#0B1120] dark:to-[#0F172A] hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md transition-all text-left flex items-start gap-3.5 cursor-pointer"
                  >
                    <span className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors shadow-xs mt-0.5">
                      <Icon className="w-4.5 h-4.5" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                          {item.category}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-[#94A3B8] group-hover:translate-x-0.5 transition-transform" />
                      </div>
                      <p className="text-xs sm:text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] line-clamp-1">
                        {item.prompt}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'health' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl border border-blue-500/25 bg-blue-500/8 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    Ֆինանսական առողջություն
                  </span>
                  <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="font-mono text-xl font-extrabold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
                  {savingsRate >= 20 ? 'Գերազանց (A+)' : savingsRate >= 10 ? 'Կայուն (B)' : 'Ուշադրություն (C)'}
                </p>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  Խնայողության տեմպ՝ {savingsRate}% · Զուտ կապիտալ՝ {formatMoney(netWorth, currency)}
                </p>
              </div>

              <div className="p-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    Առօրյա ռիթմ (Սովորություններ)
                  </span>
                  <Flame className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="font-mono text-xl font-extrabold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
                  {habits.length > 0 ? `${habitsDoneToday}/${habits.length} կատարված` : 'Սովորություններ չկան'}
                </p>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  {habitsDoneToday === habits.length && habits.length > 0
                    ? 'Բոլոր սովորություններն ավարտված են այսօր 🎉'
                    : 'Շարունակեք հետևել ձեր առօրյա կանոններին'}
                </p>
              </div>

              <div className="p-4 rounded-2xl border border-purple-500/25 bg-purple-500/8 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                    Անելիքների ծանրաբեռնվածություն
                  </span>
                  <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <p className="font-mono text-xl font-extrabold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
                  {pendingTasksCount} չկատարված
                </p>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  {focusGoal && !focusGoal.completed
                    ? `Ֆոկուս՝ ${focusGoal.title}`
                    : 'Սահմանեք օրվա գլխավոր ֆոկուսը'}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'subscriptions' && (
          <SubscriptionLeakDetector
            transactions={transactions}
            currency={currency}
            onOpenAssistant={onOpenAssistant}
          />
        )}

        {activeTab === 'quick' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => onNavigateFinance('ledger')}
              className="p-4 rounded-2xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] hover:border-blue-500 text-left space-y-2 group cursor-pointer transition-all"
            >
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <TrendingUp className="w-4 h-4" />
              </div>
              <p className="text-xs sm:text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                Ֆինանսական մատյան
              </p>
              <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                Դիտել եկամուտներն ու ծախսերը
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigatePlanner('tasks')}
              className="p-4 rounded-2xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] hover:border-blue-500 text-left space-y-2 group cursor-pointer transition-all"
            >
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <p className="text-xs sm:text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                Անելիքների կառավարիչ
              </p>
              <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                Կառավարել առաջադրանքները
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigatePlanner('focus')}
              className="p-4 rounded-2xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] hover:border-blue-500 text-left space-y-2 group cursor-pointer transition-all"
            >
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Zap className="w-4 h-4" />
              </div>
              <p className="text-xs sm:text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                Ֆոկուս ժամաչափ
              </p>
              <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                Պոմոդորո և ֆոնային ձայներ
              </p>
            </button>

            <button
              type="button"
              onClick={() => onOpenAssistant('Ինչպե՞ս կարող եմ բարելավել իմ բյուջեն և արդյունավետությունը այս ամիս։')}
              className="p-4 rounded-2xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] hover:border-blue-500 text-left space-y-2 group cursor-pointer transition-all"
            >
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Bot className="w-4 h-4" />
              </div>
              <p className="text-xs sm:text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                AI Խորհրդատու
              </p>
              <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                Անհատական ուղղորդում
              </p>
            </button>
          </div>
        )}
      </div>
    </SectionCard>
  );
});
