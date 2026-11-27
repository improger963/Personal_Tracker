import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Clock,
  Copy,
  Pencil,
  Trash2,
} from 'lucide-react';
import { BankCard, Currency, Transaction } from '../../types';
import {
  INCOME_KIND_LABELS,
  formatMoney,
  formatShortDate,
  getTransactionIncomeKind,
} from '../../data/defaults';
import { formatCardLabel, formatCardMoney } from '../../utils/cardBalances';

interface SwipeableTransactionRowProps {
  tx: Transaction;
  card?: BankCard;
  currency: Currency;
  todayISO: string;
  isEditing: boolean;
  isOpen: boolean;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onOpenChange: (id: string | null) => void;
  onStartSwipe: (id: string) => void;
  onEdit: (tx: Transaction) => void;
  onDuplicate?: (tx: Transaction) => void;
  onDelete: (id: string) => void;
  onConfirmPreExpense: (id: string) => void;
}

const ACTION_WIDTH = 88;
const SNAP_THRESHOLD = 44;
const COMMIT_THRESHOLD = 148;
const VELOCITY_COMMIT = 0.55;

export function SwipeableTransactionRow({
  tx,
  card,
  currency,
  todayISO,
  isEditing,
  isOpen,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  onOpenChange,
  onStartSwipe,
  onEdit,
  onDuplicate,
  onDelete,
  onConfirmPreExpense,
}: SwipeableTransactionRowProps) {
  const prefersReducedMotion = useReducedMotion();
  const rowRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);

  const [isRemoving, setIsRemoving] = useState(false);
  const [isPastCommit, setIsPastCommit] = useState(false);

  const isDraggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const cleanupListenersRef = useRef<(() => void) | null>(null);

  const actionOpacity = useTransform(x, [0, -20, -ACTION_WIDTH], [0, 0.75, 1]);
  const iconScale = useTransform(
    x,
    [0, -ACTION_WIDTH, -COMMIT_THRESHOLD],
    [0.78, 1, 1.18]
  );

  const springTo = useCallback(
    (target: number) => {
      return animate(
        x,
        target,
        prefersReducedMotion
          ? { duration: 0.05 }
          : { type: 'spring', stiffness: 480, damping: 38 }
      );
    },
    [prefersReducedMotion, x]
  );

  useEffect(() => {
    if (isRemoving || isDraggingRef.current) return;
    const target = isOpen ? -ACTION_WIDTH : 0;
    if (Math.abs(x.get() - target) > 1) {
      springTo(target);
    }
  }, [isOpen, isRemoving, springTo, x]);

  useEffect(() => {
    return () => {
      cleanupListenersRef.current?.();
    };
  }, []);

  const commitDelete = useCallback(() => {
    if (isRemoving) return;
    setIsRemoving(true);
    onOpenChange(null);
    const width = rowRef.current?.offsetWidth ?? 360;
    const anim = animate(x, -width, {
      duration: prefersReducedMotion ? 0.04 : 0.17,
      ease: [0.22, 1, 0.36, 1],
    });
    anim.then(() => {
      onDelete(tx.id);
    });
  }, [isRemoving, onDelete, onOpenChange, prefersReducedMotion, tx.id, x]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isRemoving || e.button !== 0) return;

    const isTouchOrMobile =
      e.pointerType === 'touch' ||
      e.pointerType === 'pen' ||
      window.innerWidth < 640;
    if (!isTouchOrMobile) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, input, select')) return;

    cleanupListenersRef.current?.();

    const startX = e.clientX;
    const startY = e.clientY;
    const startTime = performance.now();
    const initialX = x.get();
    let directionLocked: 'x' | 'y' | null = null;
    let lastDx = 0;

    const detach = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      cleanupListenersRef.current = null;
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      lastDx = dx;

      if (directionLocked === null) {
        if (Math.hypot(dx, dy) < 7) return;
        if (Math.abs(dy) > Math.abs(dx) * 1.05) {
          directionLocked = 'y';
          detach();
          return;
        }
        directionLocked = 'x';
        isDraggingRef.current = true;
        suppressClickRef.current = true;
        onStartSwipe(tx.id);
      }

      const rowWidth = rowRef.current?.offsetWidth ?? 360;
      const commitDist = Math.min(COMMIT_THRESHOLD, rowWidth * 0.44);
      const rawX = initialX + dx;

      let nextX: number;
      if (rawX > 0) {
        nextX = Math.min(12, rawX * 0.16);
      } else if (rawX < -commitDist) {
        nextX = -commitDist - (Math.abs(rawX + commitDist) * 0.42);
      } else {
        nextX = rawX;
      }

      const maxLeft = Math.max(commitDist + 48, rowWidth * 0.72);
      const clamped = Math.max(-maxLeft, nextX);
      x.set(clamped);
      setIsPastCommit(clamped <= -commitDist);
    };

    const finishSwipe = (cancelled: boolean) => {
      detach();
      const wasHorizontal = directionLocked === 'x';
      isDraggingRef.current = false;
      setIsPastCommit(false);

      if (!wasHorizontal) return;

      const elapsed = Math.max(16, performance.now() - startTime);
      const velocityX = lastDx / elapsed;
      const currentX = x.get();
      const rowWidth = rowRef.current?.offsetWidth ?? 360;
      const commitDist = Math.min(COMMIT_THRESHOLD, rowWidth * 0.44);

      if (
        !cancelled &&
        (currentX <= -commitDist ||
          (velocityX <= -VELOCITY_COMMIT && lastDx <= -52))
      ) {
        commitDelete();
      } else if (
        !cancelled &&
        (currentX <= -SNAP_THRESHOLD || (velocityX <= -0.28 && lastDx < -22))
      ) {
        onOpenChange(tx.id);
        springTo(-ACTION_WIDTH);
      } else {
        onOpenChange(null);
        springTo(0);
      }

      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 90);
    };

    const onPointerUp = () => finishSwipe(false);
    const onPointerCancel = () => finishSwipe(true);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    cleanupListenersRef.current = detach;
  };

  const handleRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current || isRemoving) return;
    if ((e.target as HTMLElement).closest('button, a')) return;

    if (isOpen) {
      onOpenChange(null);
      return;
    }

    if (window.innerWidth < 640) {
      onEdit(tx);
    }
  };

  const cardMeta = card ? ` · ${formatCardLabel(card)}` : '';
  const tagsMeta =
    tx.tags && tx.tags.length > 0
      ? ` · ${tx.tags.map((tag) => `#${tag}`).join(' · ')}`
      : '';

  const desktopMeta = `${
    tx.type === 'income'
      ? `${INCOME_KIND_LABELS[getTransactionIncomeKind(tx)]} եկամուտ`
      : tx.isPending
        ? 'Սպասվող նախածախս'
        : 'Ծախս'
  } · ${tx.category}${cardMeta} · ${formatShortDate(tx.date)}${tx.date > todayISO ? ' (ապագա)' : ''}${tagsMeta}`;

  const mobileMeta = `${tx.category}${cardMeta} · ${formatShortDate(tx.date)}${
    tx.date > todayISO ? ' (ապագա)' : ''
  }${tagsMeta}`;

  const hasNativeFx =
    typeof tx.cardAmount === 'number' &&
    Number.isFinite(tx.cardAmount) &&
    tx.cardAmount > 0 &&
    tx.cardCurrency &&
    tx.cardCurrency !== 'AMD';

  return (
    <motion.div
      ref={rowRef}
      initial={false}
      exit={
        prefersReducedMotion
          ? { opacity: 0 }
          : {
              opacity: 0,
              height: 0,
              overflow: 'hidden',
              transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
            }
      }
      className="relative overflow-hidden"
    >
      {/* Swipe-revealed Delete Action Layer */}
      <motion.div
        style={{ opacity: actionOpacity }}
        className={`absolute inset-y-0 right-0 left-0 flex items-center justify-end transition-colors duration-150 ${
          isPastCommit
            ? 'bg-rose-700 dark:bg-rose-600'
            : 'bg-rose-600 dark:bg-rose-600/95'
        }`}
        aria-hidden={!isOpen && !isPastCommit}
      >
        <button
          type="button"
          tabIndex={isOpen ? 0 : -1}
          onClick={(e) => {
            e.stopPropagation();
            commitDelete();
          }}
          aria-label={`Ջնջել ${tx.title}`}
          className="h-full min-w-[88px] px-4 flex flex-col items-center justify-center gap-1 text-white font-semibold cursor-pointer active:bg-rose-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
        >
          <motion.span style={{ scale: iconScale }} className="inline-flex">
            <Trash2 className="w-4 h-4" />
          </motion.span>
          <span className="text-[11px] leading-none whitespace-nowrap">
            {isPastCommit ? 'Բաց թողեք' : 'Ջնջել'}
          </span>
        </button>
      </motion.div>

      {/* Foreground Sliding Row */}
      <motion.div
        style={{ x }}
        onPointerDown={selectionMode ? undefined : handlePointerDown}
        onClick={(e) => {
          if (selectionMode && onToggleSelect) {
            e.stopPropagation();
            onToggleSelect(tx.id);
            return;
          }
          handleRowClick(e);
        }}
        className={`relative z-10 touch-pan-y select-none sm:select-text group px-3.5 sm:px-6 py-3.5 min-h-[62px] sm:min-h-0 flex items-center justify-between gap-3 transition-colors ${
          isSelected
            ? 'bg-[#EFF6FF] dark:bg-[#172554]/65'
            : isEditing
              ? 'bg-[#EFF6FF] dark:bg-[#172554]'
              : tx.isPending
                ? 'bg-[#FFFBEB] dark:bg-[#191614] hover:bg-[#FEF3C7]/60 dark:hover:bg-[#1F1B17]'
                : 'bg-white dark:bg-[#0F172A] hover:bg-[#F8FAFC] dark:hover:bg-[#162033]'
        }`}
      >
        <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
          {selectionMode && onToggleSelect && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(tx.id);
              }}
              aria-label={`Ընտրել ${tx.title}`}
              aria-pressed={isSelected}
              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-[#2563EB] border-[#2563EB] dark:bg-[#3B82F6] dark:border-[#3B82F6] text-white dark:text-[#060B16]'
                  : 'border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0B1120]'
              }`}
            >
              {isSelected && <Check className="w-3 h-3" strokeWidth={2.7} />}
            </button>
          )}
          <span
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              tx.type === 'income'
                ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                : tx.isPending
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                  : 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
            }`}
            aria-hidden="true"
          >
            {tx.type === 'income' ? (
              <ArrowDownLeft className="w-4 h-4" />
            ) : tx.isPending ? (
              <Clock className="w-4 h-4" />
            ) : (
              <ArrowUpRight className="w-4 h-4" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-sm font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                {tx.title}
              </p>
              {tx.isPending && (
                <span className="shrink-0 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  · Նախածախս
                </span>
              )}
              {isEditing && (
                <span className="sm:hidden shrink-0 text-[11px] font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                  · Խմբագրվում է
                </span>
              )}
            </div>

            {/* Mobile compact single-line metadata */}
            <p className="sm:hidden text-xs text-[#64748B] dark:text-[#94A3B8] truncate tabular-nums mt-0.5">
              {mobileMeta}
            </p>
            {/* Tablet/Desktop richer metadata */}
            <p className="hidden sm:block text-xs text-[#64748B] dark:text-[#94A3B8] truncate tabular-nums mt-0.5">
              {desktopMeta}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {tx.isPending ? (
            <div className="flex items-center gap-2">
              <div className="text-right">
                <span className="pa-sensitive text-sm font-semibold font-mono tabular-nums whitespace-nowrap text-amber-600 dark:text-amber-400">
                  (-{formatMoney(tx.amount, currency)})
                </span>
                {hasNativeFx && tx.cardCurrency && (
                  <span className="pa-sensitive block text-[10px] font-mono text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                    ({formatCardMoney(tx.cardAmount!, tx.cardCurrency)})
                  </span>
                )}
                <span className="block text-[10px] text-[#94A3B8] tabular-nums">
                  չհանված
                </span>
              </div>

              {!selectionMode && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onConfirmPreExpense(tx.id);
                  }}
                  className="min-h-[38px] sm:min-h-[34px] px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-[#060B16] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shadow-xs"
                  title="Հաստատել որպես ծախս և հանել բալանսից"
                >
                  <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                  <span>Հաստատել</span>
                </button>
              )}
            </div>
          ) : (
            <div className="text-right sm:mr-1">
              <span
                className={`pa-sensitive text-sm font-semibold font-mono tabular-nums whitespace-nowrap block ${
                  tx.type === 'income'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-[#0F172A] dark:text-[#F8FAFC]'
                }`}
              >
                {tx.type === 'income' ? '+' : '-'}
                {formatMoney(tx.amount, currency)}
              </span>
              {hasNativeFx && tx.cardCurrency && (
                <span className="pa-sensitive block text-[10px] font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8]">
                  {tx.type === 'income' ? '+' : '-'}
                  {formatCardMoney(tx.cardAmount!, tx.cardCurrency)}
                </span>
              )}
            </div>
          )}

          {/* Desktop/Tablet inline action buttons (hidden in selectionMode) */}
          {!selectionMode && (
            <div className="hidden sm:flex items-center gap-1">
              {onDuplicate && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate(tx);
                  }}
                  title="Կրկնել այսօր"
                  aria-label={`Կրկնել ${tx.title}`}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#94A3B8] lg:opacity-60 lg:group-hover:opacity-100 hover:text-[#2563EB] dark:hover:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#172554]/50 transition-all cursor-pointer"
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(tx);
                }}
                aria-label={`Խմբագրել ${tx.title}`}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#94A3B8] lg:opacity-60 lg:group-hover:opacity-100 hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#E2E8F0]/60 dark:hover:bg-[#1E293B] transition-all cursor-pointer"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(tx.id);
                }}
                aria-label={`Ջնջել ${tx.title}`}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#94A3B8] lg:opacity-60 lg:group-hover:opacity-100 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
