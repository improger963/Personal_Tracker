import React from 'react';
import { Currency } from '../../types';
import { formatMoney } from '../../data/defaults';
import { formatCycleLabel } from '../../utils/financialCycle';

export type FinancePageTab = 'ledger' | 'budgets' | 'goals_debts' | 'analytics';
export type TxSortMode = 'date-desc' | 'amount-desc' | 'amount-asc';

export const DONUT_COLORS = [
  '#3B82F6', // electric cobalt
  '#10B981', // emerald
  '#F43F5E', // rose
  '#8B5CF6', // violet
  '#F59E0B', // amber
  '#06B6D4', // cyan
  '#64748B', // slate
];

export const QUICK_AMOUNTS_AMD = [1000, 5000, 10000, 50000];

export function formatAxisCompact(value: number): string {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (abs >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return String(Math.round(value));
}

export function calcDeltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export interface MonthlyPoint {
  monthKey: string;
  label: string;
  income: number;
  expense: number;
}

export interface CategoryComparisonPoint {
  category: string;
  spent: number;
  limit: number;
}

export interface CategoryDonutPoint {
  category: string;
  amount: number;
  pct: number;
  color: string;
  budgetLimit?: number;
}

export interface CustomTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  currency: Currency;
}

export function MonthlyHealthTooltip({
  active,
  payload,
  currency,
  payday = 1,
}: CustomTooltipProps & { payday?: number }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as MonthlyPoint | undefined;
  if (!row) return null;
  const net = row.income - row.expense;

  return (
    <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] px-3.5 py-2.5 shadow-xl text-xs space-y-1.5 min-w-[180px]">
      <p className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
        {formatCycleLabel(row.monthKey, payday)}
      </p>
      <div className="space-y-1 tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-[#64748B] dark:text-[#94A3B8]">
            <span className="w-2 h-2 rounded-xs bg-emerald-500" />
            <span>Եկամուտ</span>
          </span>
          <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
            +{formatMoney(row.income, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-[#64748B] dark:text-[#94A3B8]">
            <span className="w-2 h-2 rounded-xs bg-rose-500" />
            <span>Ծախս</span>
          </span>
          <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
            -{formatMoney(row.expense, currency)}
          </span>
        </div>
      </div>
      <div className="pt-1 border-t border-[#F1F5F9] dark:border-[#1E293B] flex items-center justify-between gap-4 tabular-nums">
        <span className="text-[#64748B] dark:text-[#94A3B8]">Մնացորդ</span>
        <span
          className={`font-mono font-semibold ${
            net >= 0
              ? 'text-[#0F172A] dark:text-[#F8FAFC]'
              : 'text-rose-600 dark:text-rose-400'
          }`}
        >
          {net > 0 ? '+' : ''}
          {formatMoney(net, currency)}
        </span>
      </div>
    </div>
  );
}

export function CategoryDonutTooltip({
  active,
  payload,
  currency,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as CategoryDonutPoint | undefined;
  if (!row) return null;

  return (
    <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] px-3.5 py-2.5 shadow-xl text-xs space-y-1.5 min-w-[180px]">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: row.color }}
          />
          <span>{row.category}</span>
        </span>
        <span className="font-mono font-semibold text-[#64748B] dark:text-[#94A3B8] tabular-nums">
          {row.pct}%
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 tabular-nums">
        <span className="text-[#64748B] dark:text-[#94A3B8]">Ծախսված</span>
        <span className="font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
          {formatMoney(row.amount, currency)}
        </span>
      </div>
      {row.budgetLimit !== undefined && row.budgetLimit > 0 && (
        <div className="pt-1 border-t border-[#F1F5F9] dark:border-[#1E293B] flex items-center justify-between gap-4 tabular-nums">
          <span className="text-[#64748B] dark:text-[#94A3B8]">Բյուջե</span>
          <span className="font-mono font-semibold text-[#2563EB] dark:text-[#60A5FA]">
            {Math.round((row.amount / row.budgetLimit) * 100)}% /{' '}
            {formatMoney(row.budgetLimit, currency)}
          </span>
        </div>
      )}
    </div>
  );
}

export function CategoryBudgetTooltip({
  active,
  payload,
  currency,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as CategoryComparisonPoint | undefined;
  if (!row) return null;
  const diff = row.limit - row.spent;

  return (
    <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] px-3.5 py-2.5 shadow-xl text-xs space-y-1.5 min-w-[180px]">
      <p className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
        {row.category}
      </p>
      <div className="space-y-1 tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-[#64748B] dark:text-[#94A3B8]">
            <span className="w-2 h-2 rounded-xs bg-[#3B82F6]" />
            <span>Ծախսված</span>
          </span>
          <span className="font-mono font-semibold text-[#2563EB] dark:text-[#60A5FA]">
            {formatMoney(row.spent, currency)}
          </span>
        </div>
        {row.limit > 0 && (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-[#64748B] dark:text-[#94A3B8]">
                <span className="w-2 h-2 rounded-xs bg-slate-400" />
                <span>Սահմանաչափ</span>
              </span>
              <span className="font-mono font-semibold text-[#475569] dark:text-[#CBD5E1]">
                {formatMoney(row.limit, currency)}
              </span>
            </div>
            <div className="pt-1 border-t border-[#F1F5F9] dark:border-[#1E293B] flex items-center justify-between gap-4">
              <span className="text-[#64748B] dark:text-[#94A3B8]">
                {diff >= 0 ? 'Մնացորդ' : 'Գերազանցում'}
              </span>
              <span
                className={`font-mono font-semibold ${
                  diff >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {formatMoney(Math.abs(diff), currency)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
