import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Lightbulb,
} from 'lucide-react';
import { SectionCard } from './layout/PagePrimitives';
import {
  SmartInsightItem,
  SmartInsightSeverity,
  SmartInsightTarget,
} from '../utils/smartInsights';

interface SmartDailyBriefCardProps {
  insights: SmartInsightItem[];
  onRunTarget: (target: SmartInsightTarget) => void;
  onOpenAssistant: (prompt?: string) => void;
}

const SEVERITY_STYLES: Record<
  SmartInsightSeverity,
  {
    icon: typeof AlertTriangle;
    iconClass: string;
    titleClass: string;
    borderClass: string;
    bgClass: string;
  }
> = {
  alert: {
    icon: AlertTriangle,
    iconClass: 'text-rose-600 dark:text-rose-400',
    titleClass: 'text-rose-700 dark:text-rose-300',
    borderClass: 'border-l-4 border-l-rose-500',
    bgClass: 'bg-rose-500/[0.04] dark:bg-rose-500/[0.07]',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-amber-600 dark:text-amber-400',
    titleClass: 'text-amber-800 dark:text-amber-300',
    borderClass: 'border-l-4 border-l-amber-500',
    bgClass: 'bg-amber-500/[0.04] dark:bg-amber-500/[0.07]',
  },
  positive: {
    icon: CheckCircle2,
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    titleClass: 'text-emerald-700 dark:text-emerald-300',
    borderClass: 'border-l-4 border-l-emerald-500',
    bgClass: 'bg-emerald-500/[0.04] dark:bg-emerald-500/[0.07]',
  },
  info: {
    icon: Lightbulb,
    iconClass: 'text-blue-600 dark:text-blue-400',
    titleClass: 'text-[#0F172A] dark:text-[#F8FAFC]',
    borderClass: 'border-l-4 border-l-blue-500',
    bgClass: 'bg-blue-500/[0.03] dark:bg-blue-500/[0.06]',
  },
};

export function SmartDailyBriefCard({
  insights,
  onRunTarget,
  onOpenAssistant,
}: SmartDailyBriefCardProps) {
  return (
    <SectionCard
      title="Օրվա խելացի դիտարկումներ"
      subtitle="Ավտոմատ վերլուծություն բյուջեի տեմպի, անելիքների և վճարումների հիման վրա"
      icon={Bot}
      headerRight={
        <button
          type="button"
          onClick={() => onOpenAssistant()}
          className="min-h-[36px] px-3.5 py-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shadow-xs"
        >
          <Bot className="w-4 h-4 shrink-0" />
          <span>AI օգնական</span>
        </button>
      }
      noPadding
    >
      {insights.length === 0 ? (
        <div className="px-5 py-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06]">
          <div className="flex items-center gap-3 text-xs sm:text-sm text-[#475569] dark:text-[#CBD5E1]">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-medium">
              Բոլոր ցուցանիշները կայուն են՝ բյուջեի գերազանցումներ կամ ժամկետանց անելիքներ չկան։
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              onOpenAssistant('Ամփոփիր իմ շաբաթական ֆինանսական և օրակարգային արդյունքները')
            }
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer self-start sm:self-auto whitespace-nowrap"
          >
            <span>Ստանալ AI ամփոփում</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
          {insights.map((item) => {
            const style = SEVERITY_STYLES[item.severity];
            const Icon = style.icon;
            return (
              <div
                key={item.id}
                className={`px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors hover:bg-black/[0.01] dark:hover:bg-white/[0.02] ${style.borderClass} ${style.bgClass}`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className="w-8 h-8 rounded-xl bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                    <Icon className={`w-4 h-4 ${style.iconClass}`} />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className={`text-xs sm:text-sm font-bold ${style.titleClass}`}>
                      {item.title}
                    </p>
                    <p className="pa-sensitive text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRunTarget(item.target)}
                  className="self-start sm:self-auto shrink-0 min-h-[34px] px-3.5 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0B1120] hover:border-blue-500 dark:hover:border-blue-400 text-xs font-bold text-blue-600 dark:text-blue-400 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shadow-xs"
                >
                  <span>{item.actionLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
