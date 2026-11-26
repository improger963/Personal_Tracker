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
  | 'budgets'
  | 'goals_debts'
  | 'analytics';

export function PageSkeleton({ variant }: { variant: PageSkeletonVariant }) {
  if (variant === 'overview') {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Բեռնվում է...">
        <div className="surface-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
          <Skeleton className="h-10 w-full sm:w-72" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
          <div className="lg:col-span-7 surface-card p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2.5">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-10 w-52" />
                <Skeleton className="h-3.5 w-72" />
              </div>
              <Skeleton className="h-9 w-28" />
            </div>
            <Skeleton className="h-24 w-full" />
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#E2E8F0] dark:border-[#1E293B]">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          </div>

          <div className="lg:col-span-5 surface-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-7 w-24" />
            </div>
            <Skeleton className="h-10 w-full" />
            <div className="space-y-2.5">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          <div className="surface-card p-5 space-y-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
          <div className="surface-card p-5 space-y-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="surface-card p-5 space-y-3 md:col-span-2 lg:col-span-1">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'finance') {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Բեռնվում է...">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-44" />
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <Skeleton className="h-[54px] rounded-2xl" />
          <Skeleton className="h-[54px] rounded-2xl" />
          <Skeleton className="h-[54px] rounded-2xl" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-7 surface-card p-6 space-y-4">
            <Skeleton className="h-6 w-60" />
            <Skeleton className="h-[240px] w-full" />
          </div>
          <div className="xl:col-span-5 surface-card p-6 space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-[240px] w-full" />
          </div>
        </div>

        <div className="surface-card p-6 space-y-3">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </div>
    );
  }

  if (variant === 'ledger') {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Բեռնվում է...">
        <div className="surface-card p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 surface-card p-6 space-y-4">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
          <div className="lg:col-span-8 surface-card p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'budgets') {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Բեռնվում է...">
        <div className="surface-card p-6 space-y-3">
          <Skeleton className="h-6 w-56" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 surface-card p-6 space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
          <div className="lg:col-span-6 surface-card p-6 space-y-4">
            <Skeleton className="h-6 w-52" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'goals_debts') {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Բեռնվում է...">
        <div className="surface-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-9 w-28" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
          </div>
        </div>
        <div className="surface-card p-6 space-y-3">
          <Skeleton className="h-6 w-52" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  if (variant === 'analytics') {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Բեռնվում է...">
        <div className="surface-card p-6 space-y-4">
          <Skeleton className="h-6 w-48" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </div>
        <div className="surface-card p-6 space-y-4">
          <Skeleton className="h-6 w-60" />
          <Skeleton className="h-[220px] w-full" />
        </div>
      </div>
    );
  }

  if (variant === 'planner') {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Բեռնվում է...">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-52" />
          </div>
          <Skeleton className="h-10 w-52" />
        </div>
        <div className="surface-card p-5 space-y-3.5">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-9 w-72 max-w-full" />
        </div>
        <div className="surface-card p-5 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" aria-busy="true" aria-label="Բեռնվում է...">
      <div className="space-y-2">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 surface-card p-6 space-y-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
        <div className="lg:col-span-8 space-y-4">
          <div className="flex justify-between gap-3">
            <Skeleton className="h-10 w-56" />
            <Skeleton className="h-10 w-56" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        </div>
      </div>
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
      className={`flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-[#CBD5E1]/90 dark:border-[#26334D] bg-[#F8FAFC]/70 dark:bg-[#0B1120]/45 ${
        compact ? 'px-4 py-6' : 'px-6 py-10'
      } ${className}`}
    >
      <span
        className={`${
          compact ? 'w-9 h-9 mb-2.5' : 'w-11 h-11 mb-3'
        } rounded-xl bg-[#EFF6FF] dark:bg-[#172554]/60 text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0`}
        aria-hidden="true"
      >
        <Icon className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
      </span>
      <p
        className={`${
          compact ? 'text-xs sm:text-sm' : 'text-sm'
        } font-semibold text-[#334155] dark:text-[#E2E8F0]`}
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
          className="mt-3 min-h-[34px] px-3.5 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer"
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
      className={`fixed top-0 left-0 right-0 h-[2.5px] z-50 pointer-events-none bg-gradient-to-r from-[#2563EB] via-[#38BDF8] to-[#2563EB] dark:from-[#3B82F6] dark:via-[#60A5FA] dark:to-[#3B82F6] shadow-[0_0_8px_rgba(37,99,235,0.45)] transition-[transform,opacity] duration-200 ease-out will-change-transform ${
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
