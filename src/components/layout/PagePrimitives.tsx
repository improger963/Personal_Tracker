import React from 'react';
import { ChevronLeft, ChevronRight, LucideIcon } from 'lucide-react';
import { formatCycleLabel } from '../../utils/financialCycle';

export function PageShell({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`space-y-5 sm:space-y-6 ${className}`}>{children}</div>;
}

interface MonthCycleNavProps {
  selectedMonth: string;
  payday: number;
  onShiftMonth: (delta: number) => void;
  className?: string;
}

export function MonthCycleNav({
  selectedMonth,
  payday,
  onShiftMonth,
  className = '',
}: MonthCycleNavProps) {
  return (
    <div
      className={`inline-flex items-center border border-[#CBD5E1]/90 dark:border-[#233049] rounded-xl bg-white dark:bg-[#0D1422] shadow-[0_1px_2px_rgba(15,23,42,0.03)] shrink-0 ${className}`}
    >
      <button
        type="button"
        onClick={() => onShiftMonth(-1)}
        aria-label="Նախորդ հաշվարկային ամիս"
        className="min-h-[38px] min-w-[34px] flex items-center justify-center text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#162033] rounded-l-xl transition-colors cursor-pointer"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="px-2.5 text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums whitespace-nowrap">
        {formatCycleLabel(selectedMonth, payday)}
      </span>
      <button
        type="button"
        onClick={() => onShiftMonth(1)}
        aria-label="Հաջորդ հաշվարկային ամիս"
        className="min-h-[38px] min-w-[34px] flex items-center justify-center text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#162033] rounded-r-xl transition-colors cursor-pointer"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col md:flex-row md:items-end justify-between gap-3.5 pb-5 border-b border-[#E2E8F0]/85 dark:border-[#1B2538]">
      <div className="min-w-0">
        <h1 className="font-display text-xl sm:text-[26px] leading-tight font-bold tracking-[-0.025em] text-[#0F172A] dark:text-[#F8FAFC] text-balance">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-xs sm:text-sm text-[#64748B] dark:text-[#94A3B8] truncate">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
      )}
    </header>
  );
}

export type MetricTone =
  | 'default'
  | 'positive'
  | 'negative'
  | 'accent'
  | 'warning';

export interface MetricStripItem {
  id: string;
  label: string;
  value: string;
  hint?: string;
  tone?: MetricTone;
  sensitive?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const TONE_TEXT_CLASS: Record<MetricTone, string> = {
  default: 'text-[#0F172A] dark:text-[#F8FAFC]',
  positive: 'text-emerald-600 dark:text-emerald-400',
  negative: 'text-rose-600 dark:text-rose-400',
  accent: 'text-[#1D4ED8] dark:text-[#60A5FA]',
  warning: 'text-amber-600 dark:text-amber-400',
};

export function MetricStrip({ items }: { items: MetricStripItem[] }) {
  return (
    <section
      aria-label="Հիմնական ցուցանիշներ"
      className="surface-card overflow-hidden grid grid-cols-2 lg:grid-cols-4"
    >
      {items.map((item, idx) => {
        const borderClasses =
          idx === 0
            ? ''
            : idx === 1
              ? 'border-l border-[#E2E8F0]/80 dark:border-[#1B2538]'
              : idx === 2
                ? 'border-t lg:border-t-0 lg:border-l border-[#E2E8F0]/80 dark:border-[#1B2538]'
                : 'border-t border-l lg:border-t-0 border-[#E2E8F0]/80 dark:border-[#1B2538]';

        return (
          <div
            key={item.id}
            className={`min-w-0 px-4 py-4 sm:px-5 sm:py-4.5 ${borderClasses}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] sm:text-xs font-medium text-[#64748B] dark:text-[#94A3B8] truncate">
                {item.label}
              </p>
              {item.action && !item.hint && (
                <button
                  type="button"
                  onClick={item.action.onClick}
                  className="text-[11px] font-semibold text-[#1D4ED8] dark:text-[#60A5FA] hover:underline cursor-pointer whitespace-nowrap shrink-0"
                >
                  {item.action.label}
                </button>
              )}
            </div>
            <p
              className={`mt-1.5 font-mono text-base sm:text-lg lg:text-[21px] leading-snug font-semibold tracking-tight tabular-nums truncate ${
                item.sensitive ? 'pa-sensitive ' : ''
              }${TONE_TEXT_CLASS[item.tone ?? 'default']}`}
            >
              {item.value}
            </p>
            {(item.hint || (item.action && item.hint)) && (
              <div className="mt-1.5 flex items-center justify-between gap-2 min-w-0">
                {item.hint && (
                  <p
                    className={`text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate tabular-nums ${
                      item.sensitive ? 'pa-sensitive' : ''
                    }`}
                  >
                    {item.hint}
                  </p>
                )}
                {item.action && (
                  <button
                    type="button"
                    onClick={item.action.onClick}
                    className="text-[11px] font-semibold text-[#1D4ED8] dark:text-[#60A5FA] hover:underline cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {item.action.label}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

export interface SubPageTabItem<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

interface SubPageTabsProps<T extends string> {
  items: SubPageTabItem<T>[];
  activeId: T;
  onSelect: (id: T) => void;
  mobileOnly?: boolean;
  ariaLabel?: string;
}

export function SubPageTabs<T extends string>({
  items,
  activeId,
  onSelect,
  mobileOnly = false,
  ariaLabel = 'Ենթաբաժիններ',
}: SubPageTabsProps<T>) {
  return (
    <nav
      aria-label={ariaLabel}
      className={`${
        mobileOnly ? 'lg:hidden ' : ''
      }flex items-center gap-1 border-b border-[#E2E8F0]/85 dark:border-[#1B2538] overflow-x-auto`}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-current={active ? 'page' : undefined}
            className={`min-h-[42px] px-3 py-2 text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 border-b-2 -mb-px transition-colors duration-150 cursor-pointer ${
              active
                ? 'border-[#1D4ED8] dark:border-[#60A5FA] text-[#1D4ED8] dark:text-[#60A5FA] font-semibold'
                : 'border-transparent text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
            <span>{item.label}</span>
            {typeof item.count === 'number' && (
              <span className="font-mono text-[11px] tabular-nums opacity-65">
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

interface SectionCardProps {
  title?: string;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  noPadding?: boolean;
  ariaLabel?: string;
}

export function SectionCard({
  title,
  subtitle,
  icon: Icon,
  headerRight,
  children,
  className = '',
  bodyClassName = '',
  noPadding = false,
  ariaLabel,
}: SectionCardProps) {
  return (
    <section
      aria-label={ariaLabel ?? title}
      className={`surface-card overflow-hidden min-w-0 ${className}`}
    >
      {(title || headerRight) && (
        <div className="px-4 sm:px-6 py-4 border-b border-[#E2E8F0]/80 dark:border-[#1B2538] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <span className="w-7 h-7 rounded-lg border border-[#E2E8F0] dark:border-[#233049] bg-[#F8FAFC] dark:bg-[#11192B] text-[#475569] dark:text-[#94A3B8] flex items-center justify-center shrink-0">
                <Icon className="w-3.5 h-3.5" />
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h2 className="font-display text-sm sm:text-[15px] font-semibold tracking-tight text-[#0F172A] dark:text-[#F8FAFC] truncate">
                  {title}
                </h2>
              )}
              {subtitle && (
                <div className="text-[11px] sm:text-xs text-[#64748B] dark:text-[#94A3B8] truncate">
                  {subtitle}
                </div>
              )}
            </div>
          </div>
          {headerRight && (
            <div className="flex items-center gap-2 shrink-0">{headerRight}</div>
          )}
        </div>
      )}
      <div className={noPadding ? bodyClassName : `p-4 sm:p-6 ${bodyClassName}`}>
        {children}
      </div>
    </section>
  );
}
