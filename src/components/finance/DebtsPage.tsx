import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calculator,
  Check,
  HandCoins,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  MetricStrip,
  PageHeader,
  PageShell,
  SectionCard,
} from '../layout/PagePrimitives';
import { EmptyStatePlaceholder } from '../ui/Skeleton';
import { Currency, DebtDirection, DebtItem } from '../../types';
import {
  ARMENIAN_MONTHS,
  formatMoney,
  formatShortDate,
  getTodayISO,
} from '../../data/defaults';

interface DebtsPageProps {
  currency: Currency;
  debts: DebtItem[];
  onOpenNewDebtModal: () => void;
  onEditDebt: (debt: DebtItem) => void;
  onRecordDebtPayment: (
    debtId: string,
    amount: number,
    recordInLedger: boolean
  ) => void;
  onDeleteDebt: (debtId: string) => void;
}

export function DebtsPage({
  currency,
  debts,
  onOpenNewDebtModal,
  onEditDebt,
  onRecordDebtPayment,
  onDeleteDebt,
}: DebtsPageProps) {
  const todayISO = getTodayISO();

  const [debtFilter, setDebtFilter] = useState<
    'all' | DebtDirection | 'settled'
  >('all');
  const [debtPayModal, setDebtPayModal] = useState<DebtItem | null>(null);
  const [debtPayAmount, setDebtPayAmount] = useState('');
  const [debtRecordLedger, setDebtRecordLedger] = useState(true);
  const [monthlyPace, setMonthlyPace] = useState<number>(50000);

  useEffect(() => {
    if (!debtPayModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDebtPayModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [debtPayModal]);

  const debtTotals = useMemo(() => {
    let activeLent = 0;
    let activeBorrowed = 0;
    let activeCount = 0;
    for (const d of debts) {
      if (d.settled) continue;
      activeCount += 1;
      const rem = Math.max(0, d.totalAmount - d.paidAmount);
      if (d.direction === 'lent') activeLent += rem;
      else activeBorrowed += rem;
    }
    return {
      activeLent,
      activeBorrowed,
      netPosition: activeLent - activeBorrowed,
      activeCount,
    };
  }, [debts]);

  const filteredDebts = useMemo(() => {
    return [...debts]
      .filter((d) => {
        if (debtFilter === 'settled') return d.settled;
        if (debtFilter === 'lent') return !d.settled && d.direction === 'lent';
        if (debtFilter === 'borrowed')
          return !d.settled && d.direction === 'borrowed';
        return true;
      })
      .sort((a, b) => {
        if (a.settled !== b.settled) return Number(a.settled) - Number(b.settled);
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [debts, debtFilter]);

  const openDebtPayment = (debt: DebtItem) => {
    const remaining = Math.max(1, debt.totalAmount - debt.paidAmount);
    setDebtPayModal(debt);
    setDebtPayAmount(String(remaining));
    setDebtRecordLedger(true);
  };

  const submitDebtPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtPayModal) return;
    const amt = Math.round(Number(debtPayAmount));
    if (!amt || amt <= 0) return;
    onRecordDebtPayment(debtPayModal.id, amt, debtRecordLedger);
    setDebtPayModal(null);
    setDebtPayAmount('');
  };

  const formatProjectedMonth = (monthsAhead: number) => {
    const now = new Date();
    const target = new Date(
      now.getFullYear(),
      now.getMonth() + monthsAhead,
      1
    );
    const mName = ARMENIAN_MONTHS[target.getMonth()] ?? '';
    return `${mName} ${target.getFullYear()}`;
  };

  return (
    <PageShell>
      <PageHeader
        title="Պարտքեր և փոխառություններ"
        subtitle="Հետևեք տրված և վերցված գումարներին, մասնակի մարումներին ու ժամկետներին"
        actions={
          <button
            type="button"
            onClick={onOpenNewDebtModal}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl btn-primary text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Նոր պարտք / փոխառություն</span>
          </button>
        }
      />

      <MetricStrip
        items={[
          {
            id: 'debts-lent',
            label: 'Ինձ են պարտք (ակտիվ)',
            value: `+${formatMoney(debtTotals.activeLent, currency)}`,
            tone: 'positive',
            sensitive: true,
          },
          {
            id: 'debts-borrowed',
            label: 'Ես եմ պարտք (ակտիվ)',
            value: `-${formatMoney(debtTotals.activeBorrowed, currency)}`,
            tone: 'negative',
            sensitive: true,
          },
          {
            id: 'debts-net',
            label: 'Զուտ պարտքային դիրք',
            value: `${debtTotals.netPosition > 0 ? '+' : ''}${formatMoney(debtTotals.netPosition, currency)}`,
            tone: debtTotals.netPosition >= 0 ? 'default' : 'negative',
            sensitive: true,
          },
          {
            id: 'debts-active',
            label: 'Ակտիվ գրառումներ',
            value: String(debtTotals.activeCount),
            hint: `Ընդամենը ${debts.length} գրառում`,
          },
        ]}
      />

      <SectionCard
        title="Գրառումների ցանկ"
        icon={HandCoins}
        noPadding
        headerRight={
          <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl surface-subtle">
            {(
              [
                { id: 'all', label: 'Բոլորը' },
                { id: 'lent', label: 'Ինձ են պարտք' },
                { id: 'borrowed', label: 'Պարտք եմ' },
                { id: 'settled', label: 'Մարված' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDebtFilter(tab.id)}
                className={`min-h-[30px] px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  debtFilter === tab.id
                    ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                    : 'text-[#64748B] dark:text-[#94A3B8]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
      >
        {filteredDebts.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyStatePlaceholder
              compact
              icon={HandCoins}
              title={
                debts.length === 0
                  ? 'Գրանցված պարտքեր կամ փոխառություններ չկան'
                  : 'Ընտրված զտիչով գրառումներ չկան'
              }
              description={
                debts.length === 0
                  ? 'Գրանցեք ընկերներին տված կամ վերցված գումարները՝ հիշեցումներ ստանալու համար։'
                  : 'Փոխեք զտիչը՝ մյուս գրառումները տեսնելու համար։'
              }
              actionLabel={
                debts.length === 0 ? '+ Ավելացնել գրառում' : 'Ցույց տալ բոլորը'
              }
              onAction={
                debts.length === 0
                  ? onOpenNewDebtModal
                  : () => setDebtFilter('all')
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
            {filteredDebts.map((debt) => {
              const remaining = Math.max(0, debt.totalAmount - debt.paidAmount);
              const pct = Math.min(
                100,
                Math.round(
                  (debt.paidAmount / Math.max(1, debt.totalAmount)) * 100
                )
              );
              const isLent = debt.direction === 'lent';
              const isOverdue =
                !debt.settled && Boolean(debt.dueDate) && debt.dueDate! < todayISO;

              return (
                <div
                  key={debt.id}
                  className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 hover:bg-[#F8FAFC] dark:hover:bg-[#162033] transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span
                      className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        debt.settled
                          ? 'bg-[#F1F5F9] dark:bg-[#1E293B] text-[#64748B]'
                          : isLent
                            ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {isLent ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                          {debt.person}
                        </p>
                        <span
                          className={`text-xs font-medium ${
                            debt.settled
                              ? 'text-[#64748B] dark:text-[#94A3B8]'
                              : isLent
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          ·{' '}
                          {debt.settled
                            ? 'Մարված է'
                            : isLent
                              ? 'Ինձ է պարտք'
                              : 'Պարտք եմ'}
                        </span>
                        {debt.dueDate && (
                          <span
                            className={`text-[11px] font-mono tabular-nums ${
                              isOverdue
                                ? 'text-rose-600 dark:text-rose-400 font-semibold'
                                : 'text-[#64748B] dark:text-[#94A3B8]'
                            }`}
                          >
                            · Ժամկետ՝ {formatShortDate(debt.dueDate)}
                            {isOverdue ? ' (ուշացած)' : ''}
                          </span>
                        )}
                      </div>

                      {debt.note && (
                        <p className="text-xs text-[#64748B] dark:text-[#94A3B8] break-words">
                          {debt.note}
                        </p>
                      )}

                      <div className="flex items-center gap-3 max-w-sm">
                        <div className="flex-1 h-1.5 rounded-full bg-[#E2E8F0] dark:bg-[#1E293B] overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              debt.settled
                                ? 'bg-emerald-500'
                                : isLent
                                  ? 'bg-emerald-500'
                                  : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.max(4, pct)}%` }}
                          />
                        </div>
                        <span className="pa-sensitive text-[11px] font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8]">
                          {pct}% ({formatMoney(debt.paidAmount, currency)} /{' '}
                          {formatMoney(debt.totalAmount, currency)})
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pl-12 sm:pl-0">
                    <div className="text-left sm:text-right mr-1">
                      <span className="block text-[10px] text-[#64748B] dark:text-[#94A3B8]">
                        {debt.settled ? 'Ընդամենը' : 'Մնացորդ'}
                      </span>
                      <span
                        className={`pa-sensitive text-sm font-bold font-mono tabular-nums ${
                          debt.settled
                            ? 'text-[#64748B] dark:text-[#94A3B8] line-through'
                            : isLent
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {formatMoney(
                          debt.settled ? debt.totalAmount : remaining,
                          currency
                        )}
                      </span>
                    </div>

                    {!debt.settled && (
                      <button
                        type="button"
                        onClick={() => openDebtPayment(debt)}
                        className="min-h-[34px] px-3 py-1.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] dark:bg-[#3B82F6] dark:hover:bg-[#60A5FA] text-white dark:text-[#060B16] text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Վճարում</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onEditDebt(debt)}
                      aria-label={`Խմբագրել ${debt.person}`}
                      className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#E2E8F0]/60 dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteDebt(debt.id)}
                      aria-label={`Ջնջել ${debt.person}`}
                      className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {debtTotals.activeBorrowed > 0 && (
        <SectionCard
          title="Պարտքերի մարման հաշվիչ"
          subtitle="Ընտրեք ամսական վճարման չափը՝ տեսնելու մարման ավարտի ամիսը"
          icon={Calculator}
          headerRight={
            <div className="flex flex-wrap items-center gap-1.5">
              {[25000, 50000, 100000, 150000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setMonthlyPace(preset)}
                  className={`min-h-[34px] px-2.5 py-1 rounded-xl border text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                    monthlyPace === preset
                      ? 'border-[#2563EB] bg-[#EFF6FF] dark:bg-[#172554] text-[#1D4ED8] dark:text-[#60A5FA] font-semibold'
                      : 'border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB]'
                  }`}
                >
                  {formatMoney(preset, currency)}
                </button>
              ))}
              <input
                type="number"
                min="1000"
                step="5000"
                value={monthlyPace}
                onChange={(e) =>
                  setMonthlyPace(Math.max(1000, Number(e.target.value) || 0))
                }
                aria-label="Ամսական մարում"
                className="w-28 min-h-[34px] px-2.5 py-1 text-xs font-mono tabular-nums rounded-xl input-field"
              />
            </div>
          }
        >
          {(() => {
            const months = Math.max(
              1,
              Math.ceil(debtTotals.activeBorrowed / Math.max(1, monthlyPace))
            );
            return (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[#475569] dark:text-[#CBD5E1] tabular-nums">
                  Վերցված{' '}
                  <strong className="pa-sensitive font-mono text-[#0F172A] dark:text-[#F8FAFC]">
                    {formatMoney(debtTotals.activeBorrowed, currency)}
                  </strong>{' '}
                  պարտքի լրիվ մարման ժամկետ՝
                </p>
                <p className="text-sm sm:text-base font-semibold text-[#2563EB] dark:text-[#60A5FA] tabular-nums">
                  ~{months} ամիս · Ավարտ՝ {formatProjectedMonth(months)}
                </p>
              </div>
            );
          })()}
        </SectionCard>
      )}

      {/* Debt Repayment Dialog */}
      {debtPayModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#020617]/65 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDebtPayModal(null);
          }}
        >
          <form
            onSubmit={submitDebtPayment}
            className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                {debtPayModal.direction === 'lent'
                  ? `Վերադարձ · ${debtPayModal.person}`
                  : `Մարում · ${debtPayModal.person}`}
              </h3>
              <button
                type="button"
                onClick={() => setDebtPayModal(null)}
                aria-label="Փակել"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-[#64748B] dark:text-[#94A3B8]">
                  Վճարման գումար (֏)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setDebtPayAmount(
                      String(
                        Math.max(
                          0,
                          debtPayModal.totalAmount - debtPayModal.paidAmount
                        )
                      )
                    )
                  }
                  className="text-[#2563EB] dark:text-[#60A5FA] font-semibold hover:underline cursor-pointer tabular-nums"
                >
                  Ամբողջ մնացորդը (
                  {formatMoney(
                    Math.max(
                      0,
                      debtPayModal.totalAmount - debtPayModal.paidAmount
                    ),
                    currency
                  )}
                  )
                </button>
              </div>
              <input
                type="number"
                min="1"
                max={Math.max(
                  1,
                  debtPayModal.totalAmount - debtPayModal.paidAmount
                )}
                step="any"
                value={debtPayAmount}
                onChange={(e) => setDebtPayAmount(e.target.value)}
                autoFocus
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl input-field"
              />
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] cursor-pointer">
              <input
                type="checkbox"
                checked={debtRecordLedger}
                onChange={(e) => setDebtRecordLedger(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded cursor-pointer"
              />
              <span className="text-xs text-[#475569] dark:text-[#CBD5E1] leading-snug">
                {debtPayModal.direction === 'lent'
                  ? 'Գրանցել որպես եկամուտ գործարքների մատյանում'
                  : 'Գրանցել որպես ծախս գործարքների մատյանում'}
              </span>
            </label>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDebtPayModal(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] text-xs font-medium text-[#475569] dark:text-[#CBD5E1] cursor-pointer"
              >
                Չեղարկել
              </button>
              <button
                type="submit"
                className="min-h-[40px] px-4 py-2 rounded-xl btn-primary text-xs font-semibold"
              >
                Հաստատել վճարումը
              </button>
            </div>
          </form>
        </div>
      )}
    </PageShell>
  );
}
