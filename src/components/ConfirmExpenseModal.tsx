import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, X, Wallet } from 'lucide-react';
import { RecurringBill } from '../types';
import { formatMoney } from '../data/defaults';

interface ConfirmExpenseModalProps {
  bill: RecurringBill;
  slotKey: string;
  dateISO: string;
  onConfirm: (finalAmount: number) => void;
  onClose: () => void;
}

export function ConfirmExpenseModal({
  bill,
  onConfirm,
  onClose,
}: ConfirmExpenseModalProps) {
  const [amountInput, setAmountInput] = useState(
    bill.amount > 0 ? String(bill.amount) : ''
  );
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(amountInput);
    if (!num || num <= 0) {
      setError('Խնդրում ենք մուտքագրել հաստատված գումարը։');
      return;
    }
    setError('');
    onConfirm(num);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ծախսի հաստատման պատուհան"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border-t sm:border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] shadow-2xl overflow-hidden pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-0"
      >
        {/* iOS Native Bottom Sheet Grabber */}
        <div className="w-10 h-1 rounded-full bg-[#CBD5E1] dark:bg-[#334155] mx-auto mt-2.5 sm:hidden shrink-0" aria-hidden="true" />

        <div className="px-5 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#2563EB]/12 text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
              <Wallet className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                Հաստատել ծախսի գումարը
              </h3>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] truncate">
                {bill.title} · {bill.category}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Փակել պատուհանը"
            className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label
              htmlFor="confirm-amount"
              className="block text-xs font-medium text-[#475569] dark:text-[#CBD5E1] mb-1.5"
            >
              Վերջնական գումար (AMD)
            </label>
            <input
              id="confirm-amount"
              type="number"
              min="1"
              step="any"
              autoFocus
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="Մուտքագրեք փաստացի գումարը"
              className="w-full min-h-[46px] px-3.5 py-2.5 text-base font-mono tabular-nums rounded-xl input-field"
            />
            {bill.amount > 0 && (
              <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-1 tabular-nums">
                Նախնական գնահատական՝ {formatMoney(bill.amount)}
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#F1F5F9] dark:border-[#1E293B]">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-[#CBD5E1] dark:border-[#334155] text-xs font-medium text-[#475569] dark:text-[#CBD5E1] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
            >
              Չեղարկել
            </button>
            <button
              type="submit"
              className="min-h-[40px] px-4 py-2 rounded-xl btn-primary text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Check className="w-4 h-4" strokeWidth={2.5} />
              <span>Հաստատել և գրանցել</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
