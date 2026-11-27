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
    iconWrapClass: string;
    titleClass: string;
    bgClass: string;
  }
> = {
  alert: {
    icon: AlertTriangle,
    iconClass: 'text-rose-600 dark:text-rose-400',
    iconWrapClass: 'border-rose-500/25 bg-rose-500/[0.08]',
    titleClass: 'text-rose-700 dark:text-rose-300',
    bgClass: 'bg-rose-500/[0.025] dark:bg-rose-500/[0.045]',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-amber-600 dark:text-amber-400',
    iconWrapClass: 'border-amber-500/25 bg-amber-500/[0.08]',
    titleClass: 'text-amber-800 dark:text-amber-300',
    bgClass: 'bg-amber-500/[0.025] dark:bg-amber-500/[0.045]',
  },
  positive: {
    icon: CheckCircle2,
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    iconWrapClass: 'border-emerald-500/25 bg-emerald-500/[0.08]',
    titleClass: 'text-emerald-700 dark:text-emerald-300',
    bgClass: 'bg-emerald-500/[0.02] dark:bg-emerald-500/[0.04]',
  },
  info: {
    icon: Lightbulb,
    iconClass: 'text-[#1D4ED8] dark:text-[#60A5FA]',
    iconWrapClass: 'border-[#BFDBFE] dark:border-[#1E3A8A]/60 bg-[#EFF6FF]/80 dark:bg-[#172554]/50',
    titleClass: 'text-[#0F172A] dark:text-[#F8FAFC]',
    bgClass: '',
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
          className="min-h-[34px] px-3 py-1.5 rounded-xl border border-[#BFDBFE] dark:border-[#1E3A8A]/70 bg-[#EFF6FF]/85 dark:bg-[#172554]/45 text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA] hover:bg-[#DBEAFE]/70 dark:hover:bg-[#172554]/75 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Bot className="w-3.5 h-3.5 shrink-0" />
          <span>AI օգնական</span>
        </button>
      }
      noPadding
    >
      {insights.length === 0 ? (
        <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-500/[0.03] dark:bg-emerald-500/[0.045]">
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
            className="text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA] hover:underline inline-flex items-center gap-1 cursor-pointer self-start sm:self-auto whitespace-nowrap"
          >
            <span>Ստանալ AI ամփոփում</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="divide-y divide-[#F1F5F9] dark:divide-[#1B2538]">
          {insights.map((item) => {
            const style = SEVERITY_STYLES[item.severity];
            const Icon = style.icon;
            return (
              <div
                key={item.id}
                className={`px-4 sm:px-6 py-3.5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors hover:bg-[#F8FAFC]/70 dark:hover:bg-[#111A2D]/60 ${style.bgClass}`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${style.iconWrapClass}`}
                  >
                    <Icon className={`w-4 h-4 ${style.iconClass}`} />
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <p className={`text-xs sm:text-sm font-semibold ${style.titleClass}`}>
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
                  className="self-start sm:self-auto shrink-0 min-h-[34px] px-3 py-1.5 rounded-xl btn-secondary text-xs text-[#1D4ED8] dark:text-[#60A5FA] inline-flex items-center gap-1.5 whitespace-nowrap"
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
