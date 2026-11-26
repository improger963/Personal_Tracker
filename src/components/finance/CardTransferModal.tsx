import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, ArrowLeftRight, X } from 'lucide-react';
import { BankCard, Currency, Transaction } from '../../types';
import { formatMoney, getTodayISO } from '../../data/defaults';
import {
  computeCardStats,
  formatCardLabel,
} from '../../utils/cardBalances';
import { QUICK_AMOUNTS_AMD } from './financeShared';

interface CardTransferModalProps {
  cards: BankCard[];
  transactions: Transaction[];
  currency: Currency;
  initialFromCardId?: string;
  onClose: () => void;
  onTransfer: (params: {
    fromCardId: string;
    toCardId: string;
    amount: number;
    date: string;
    note?: string;
  }) => void;
}

export function CardTransferModal({
  cards,
  transactions,
  currency,
  initialFromCardId,
  onClose,
  onTransfer,
}: CardTransferModalProps) {
  const prefersReducedMotion = useReducedMotion();
  const defaultFrom =
    initialFromCardId && cards.some((c) => c.id === initialFromCardId)
      ? initialFromCardId
      : cards[0]?.id ?? '';
  const defaultTo =
    cards.find((c) => c.id !== defaultFrom)?.id ?? '';

  const [fromCardId, setFromCardId] = useState(defaultFrom);
  const [toCardId, setToCardId] = useState(defaultTo);
  const [amountStr, setAmountStr] = useState('');
  const [date, setDate] = useState(getTodayISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const timer = window.setTimeout(() => amountRef.current?.focus(), 40);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(timer);
    };
  }, [onClose]);

  const cardStatsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeCardStats>>();
    for (const card of cards) {
      map.set(card.id, computeCardStats(card, transactions));
    }
    return map;
  }, [cards, transactions]);

  const fromStats = cardStatsMap.get(fromCardId);
  const toStats = cardStatsMap.get(toCardId);
  const parsedAmount = Number(amountStr);
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? Math.round(parsedAmount) : 0;

  const handleSwap = () => {
    setFromCardId(toCardId);
    setToCardId(fromCardId);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fromCardId || !toCardId) {
      setError('Ընտրեք երկու քարտ կամ դրամապանակ։');
      return;
    }
    if (fromCardId === toCardId) {
      setError('Ուղարկող և ստացող քարտերը պետք է տարբեր լինեն։');
      return;
    }
    if (!validAmount || validAmount <= 0) {
      setError('Մուտքագրեք ճիշտ գումար։');
      return;
    }

    onTransfer({
      fromCardId,
      toCardId,
      amount: validAmount,
      date: date || getTodayISO(),
      note: note.trim() || undefined,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#020617]/65 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-transfer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={
          prefersReducedMotion ? false : { opacity: 0, y: 16, scale: 0.98 }
        }
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: prefersReducedMotion ? 0.04 : 0.18,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto scroll-container rounded-t-3xl sm:rounded-2xl border-t sm:border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-6 shadow-2xl"
      >
        <div
          className="w-10 h-1 rounded-full bg-[#CBD5E1] dark:bg-[#334155] mx-auto -mt-1.5 mb-3.5 sm:hidden shrink-0"
          aria-hidden="true"
        />

        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#EFF6FF] dark:bg-[#172554] text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
              <ArrowLeftRight className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2
                id="card-transfer-title"
                className="font-display text-base sm:text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC]"
              >
                Քարտից քարտ փոխանցում
              </h2>
              <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                Մնացորդների ձեռքով տեղաշարժ քարտերի միջև
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Փակել պատուհանը"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                Որ քարտից (Ելք)
              </label>
              <select
                value={fromCardId}
                onChange={(e) => {
                  const next = e.target.value;
                  setFromCardId(next);
                  if (next === toCardId) {
                    const alt = cards.find((c) => c.id !== next);
                    if (alt) setToCardId(alt.id);
                  }
                }}
                className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
              >
                {cards.map((c) => {
                  const st = cardStatsMap.get(c.id);
                  return (
                    <option key={c.id} value={c.id}>
                      {formatCardLabel(c)} ({formatMoney(st?.currentBalance ?? c.initialBalance, currency)})
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleSwap}
                aria-label="Փոխել ուղղությունը"
                className="min-h-[32px] px-3 rounded-lg border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] text-xs font-medium text-[#2563EB] dark:text-[#60A5FA] hover:border-[#2563EB] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Փոխել տեղերը</span>
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                Որ քարտին (Մուտք)
              </label>
              <select
                value={toCardId}
                onChange={(e) => {
                  const next = e.target.value;
                  setToCardId(next);
                  if (next === fromCardId) {
                    const alt = cards.find((c) => c.id !== next);
                    if (alt) setFromCardId(alt.id);
                  }
                }}
                className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl input-field"
              >
                {cards.map((c) => {
                  const st = cardStatsMap.get(c.id);
                  return (
                    <option key={c.id} value={c.id}>
                      {formatCardLabel(c)} ({formatMoney(st?.currentBalance ?? c.initialBalance, currency)})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                Գումար (֏)
              </label>
              <input
                ref={amountRef}
                type="number"
                min="1"
                step="any"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="20000"
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                Ամսաթիվ
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {QUICK_AMOUNTS_AMD.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmountStr(String((Number(amountStr) || 0) + preset))}
                className="min-h-[32px] rounded-lg border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] hover:border-[#2563EB] dark:hover:border-[#3B82F6] text-[11px] font-mono tabular-nums text-[#475569] dark:text-[#CBD5E1] transition-all cursor-pointer"
              >
                +{preset.toLocaleString()}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
              Նշում (ըստ ցանկության)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Օրինակ՝ Կանխիկացում կամ համալրում"
              className="w-full min-h-[40px] px-3 py-2 text-sm rounded-xl input-field"
            />
          </div>

          {fromStats && toStats && validAmount > 0 && fromCardId !== toCardId && (
            <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] p-3 space-y-1.5 text-xs tabular-nums">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#64748B] dark:text-[#94A3B8] truncate">
                  {fromStats.card.name}
                </span>
                <span className="font-mono flex items-center gap-1.5 shrink-0">
                  <span className="text-[#64748B]">{formatMoney(fromStats.currentBalance, currency)}</span>
                  <ArrowRight className="w-3 h-3 text-[#94A3B8]" />
                  <strong className="text-rose-600 dark:text-rose-400">
                    {formatMoney(fromStats.currentBalance - validAmount, currency)}
                  </strong>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#64748B] dark:text-[#94A3B8] truncate">
                  {toStats.card.name}
                </span>
                <span className="font-mono flex items-center gap-1.5 shrink-0">
                  <span className="text-[#64748B]">{formatMoney(toStats.currentBalance, currency)}</span>
                  <ArrowRight className="w-3 h-3 text-[#94A3B8]" />
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    {formatMoney(toStats.currentBalance + validAmount, currency)}
                  </strong>
                </span>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] text-sm font-medium text-[#475569] dark:text-[#CBD5E1] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
            >
              Չեղարկել
            </button>
            <button
              type="submit"
              className="min-h-[40px] px-5 py-2 rounded-xl btn-primary text-sm"
            >
              Կատարել փոխանցում
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
