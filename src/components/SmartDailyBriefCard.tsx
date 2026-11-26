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
  { icon: typeof AlertTriangle; iconClass: string; titleClass: string }
> = {
  alert: {
    icon: AlertTriangle,
    iconClass: 'text-rose-600 dark:text-rose-400',
    titleClass: 'text-rose-700 dark:text-rose-300',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-amber-600 dark:text-amber-400',
    titleClass: 'text-amber-800 dark:text-amber-300',
  },
  positive: {
    icon: CheckCircle2,
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    titleClass: 'text-emerald-700 dark:text-emerald-300',
  },
  info: {
    icon: Lightbulb,
    iconClass: 'text-[#2563EB] dark:text-[#60A5FA]',
    titleClass: 'text-[#0F172A] dark:text-[#F8FAFC]',
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
      headerRight={
        <button
          type="button"
          onClick={() => onOpenAssistant()}
          className="min-h-[34px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-[#F8FAFC] dark:bg-[#111A2E] text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA] hover:border-[#2563EB] dark:hover:border-[#3B82F6] inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Bot className="w-3.5 h-3.5 shrink-0" />
          <span>AI օգնական</span>
        </button>
      }
      noPadding
    >
      {insights.length === 0 ? (
        <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm text-[#475569] dark:text-[#CBD5E1]">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              Բոլոր ցուցանիշները կայուն են՝ բյուջեի գերազանցումներ կամ ժամկետանց անելիքներ չկան։
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              onOpenAssistant('Ամփոփիր իմ շաբաթական ֆինանսական և օրակարգային արդյունքները')
            }
            className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline inline-flex items-center gap-1 cursor-pointer self-start sm:self-auto whitespace-nowrap"
          >
            <span>Ստանալ AI ամփոփում</span>
            <ArrowRight className="w-3.5 h-3.5" />
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
                className="px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${style.iconClass}`} />
                  <div className="min-w-0 space-y-0.5">
                    <p className={`text-xs sm:text-sm font-semibold ${style.titleClass}`}>
                      {item.title}
                    </p>
                    <p className="pa-sensitive text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                      {item.description}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRunTarget(item.target)}
                  className="self-start sm:self-auto shrink-0 min-h-[32px] px-3 py-1 rounded-lg border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] hover:border-[#2563EB] dark:hover:border-[#3B82F6] text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA] inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
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
