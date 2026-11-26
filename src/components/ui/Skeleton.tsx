import { useEffect, useState } from 'react';
import { ArrowUp, LucideIcon } from 'lucide-react';
import { scrollToTopSmooth } from '../../utils/scroll';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`skeleton-shimmer rounded-xl ${className}`}
    />
  );
}

export type PageSkeletonVariant =
  | 'overview'
  | 'finance'
  | 'planner'
  | 'notes'
  | 'ledger'
  | 'cards'
  | 'budgets'
  | 'bills'
  | 'goals'
  | 'debts'
  | 'analytics'
  | 'tasks'
  | 'habits'
  | 'focus';

export function PageSkeleton({ variant }: { variant: PageSkeletonVariant }) {
  return (
    <div className="space-y-5 sm:space-y-6" aria-busy="true" aria-label="Բեռնվում է...">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-[#E2E8F0] dark:border-[#1E293B]">
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      <div className="surface-card p-4 sm:p-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>

      {variant === 'analytics' || variant === 'overview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
          <div className="lg:col-span-7 surface-card p-6 space-y-4">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-56 w-full" />
          </div>
          <div className="lg:col-span-5 surface-card p-6 space-y-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-56 w-full" />
          </div>
        </div>
      ) : (
        <div className="surface-card p-6 space-y-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}
    </div>
  );
}

interface EmptyStatePlaceholderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  className?: string;
}

export function EmptyStatePlaceholder({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
  className = '',
}: EmptyStatePlaceholderProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-[#CBD5E1]/90 dark:border-[#233049] bg-[#F8FAFC]/65 dark:bg-[#090F1B]/50 ${
        compact ? 'px-4 py-6' : 'px-6 py-10'
      } ${className}`}
    >
      <span
        className={`${
          compact ? 'w-9 h-9 mb-2.5' : 'w-11 h-11 mb-3'
        } rounded-xl border border-[#E2E8F0] dark:border-[#233049] bg-white dark:bg-[#11192B] text-[#475569] dark:text-[#94A3B8] flex items-center justify-center shrink-0`}
        aria-hidden="true"
      >
        <Icon className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
      </span>
      <p
        className={`${
          compact ? 'text-xs sm:text-sm' : 'text-sm'
        } font-semibold text-[#0F172A] dark:text-[#F8FAFC]`}
      >
        {title}
      </p>
      {description && (
        <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-3.5 min-h-[34px] px-3.5 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#233049] bg-white dark:bg-[#0D1422] text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA] hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function TopRouteProgressBar({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden="true"
      style={{ transformOrigin: 'left center' }}
      className={`fixed top-0 left-0 right-0 h-[2px] z-50 pointer-events-none bg-[#1D4ED8] dark:bg-[#60A5FA] transition-[transform,opacity] duration-200 ease-out will-change-transform ${
        active ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
      }`}
    />
  );
}

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let rafId = 0;
    const checkScroll = () => {
      rafId = 0;
      const shouldShow = window.scrollY > 360;
      setVisible((prev) => (prev === shouldShow ? prev : shouldShow));
    };

    const onScroll = () => {
      if (!rafId) {
        rafId = window.requestAnimationFrame(checkScroll);
      }
    };

    checkScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTopSmooth}
      aria-label="Վերադառնալ էջի վերև"
      title="Վերադառնալ վերև"
      className="fixed bottom-[calc(4.85rem+env(safe-area-inset-bottom))] md:bottom-6 left-3.5 sm:left-5 lg:left-[17.5rem] z-30 w-10 h-10 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-md text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#2563EB] dark:hover:border-[#3B82F6] hover:text-[#2563EB] dark:hover:text-[#60A5FA] shadow-lg flex items-center justify-center transition-[transform,opacity,color,border-color] duration-150 cursor-pointer"
    >
      <ArrowUp className="w-4 h-4" />
    </button>
  );
}
