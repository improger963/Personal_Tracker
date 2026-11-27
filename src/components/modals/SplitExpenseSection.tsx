import { Plus, Trash2, Users } from 'lucide-react';
import { formatMoney } from '../../data/defaults';

export interface SplitParticipant {
  id: string;
  person: string;
  amountStr: string;
}

export interface ComputedSplitResult {
  shares: Array<{ id: string; person: string; amount: number }>;
  totalLent: number;
  userShare: number;
  isValid: boolean;
  errorMessage: string | null;
}

export function computeSplitAllocations(params: {
  totalAmountAMD: number;
  splitMode: 'equal' | 'custom';
  includeSelf: boolean;
  splits: SplitParticipant[];
}): ComputedSplitResult {
  const { totalAmountAMD, splitMode, includeSelf, splits } = params;
  const total = Math.max(0, Math.round(totalAmountAMD));

  if (total <= 0) {
    return {
      shares: [],
      totalLent: 0,
      userShare: 0,
      isValid: false,
      errorMessage: 'Մուտքագրեք ծախսի գումարը՝ կիսելու համար։',
    };
  }

  const namedRows = splits.filter((s) => s.person.trim().length > 0);
  if (namedRows.length === 0) {
    return {
      shares: [],
      totalLent: 0,
      userShare: total,
      isValid: false,
      errorMessage: 'Ավելացրեք գոնե մեկ ընկերոջ անուն։',
    };
  }

  if (splitMode === 'equal') {
    const divisor = namedRows.length + (includeSelf ? 1 : 0);
    const perPerson = Math.round(total / Math.max(1, divisor));
    const shares = namedRows.map((s, idx) => {
      // Keep exact remainder when includeSelf is false
      if (!includeSelf && idx === namedRows.length - 1) {
        const prevSum = perPerson * (namedRows.length - 1);
        return {
          id: s.id,
          person: s.person.trim(),
          amount: Math.max(0, total - prevSum),
        };
      }
      return {
        id: s.id,
        person: s.person.trim(),
        amount: perPerson,
      };
    });
    const totalLent = shares.reduce((sum, s) => sum + s.amount, 0);
    const userShare = Math.max(0, total - totalLent);
    return {
      shares,
      totalLent,
      userShare,
      isValid: shares.every((s) => s.amount > 0) && totalLent <= total,
      errorMessage:
        totalLent > total
          ? 'Ընկերների բաժինները չեն կարող գերազանցել ընդհանուր ծախսը։'
          : null,
    };
  }

  // Custom mode
  const shares = namedRows.map((s) => {
    const parsed = Number(s.amountStr);
    const amount = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
    return {
      id: s.id,
      person: s.person.trim(),
      amount,
    };
  });

  const totalLent = shares.reduce((sum, s) => sum + s.amount, 0);
  const userShare = Math.max(0, total - totalLent);
  const hasZero = shares.some((s) => s.amount <= 0);
  const exceeds = totalLent > total;

  let errorMessage: string | null = null;
  if (hasZero) {
    errorMessage = 'Նշեք յուրաքանչյուր ընկերոջ գումարը։';
  } else if (exceeds) {
    errorMessage = 'Ընկերների բաժինների գումարը գերազանցում է ընդհանուր ծախսը։';
  }

  return {
    shares,
    totalLent,
    userShare,
    isValid: !hasZero && !exceeds && shares.length > 0,
    errorMessage,
  };
}

interface SplitExpenseSectionProps {
  totalAmountAMD: number;
  enabled: boolean;
  onToggleEnabled: (v: boolean) => void;
  splitMode: 'equal' | 'custom';
  onChangeMode: (m: 'equal' | 'custom') => void;
  includeSelf: boolean;
  onToggleIncludeSelf: (v: boolean) => void;
  splits: SplitParticipant[];
  onChangeSplits: (next: SplitParticipant[]) => void;
}

export function SplitExpenseSection({
  totalAmountAMD,
  enabled,
  onToggleEnabled,
  splitMode,
  onChangeMode,
  includeSelf,
  onToggleIncludeSelf,
  splits,
  onChangeSplits,
}: SplitExpenseSectionProps) {
  const computed = computeSplitAllocations({
    totalAmountAMD,
    splitMode,
    includeSelf,
    splits,
  });

  const equalPerPerson =
    splitMode === 'equal' && totalAmountAMD > 0
      ? Math.round(
          totalAmountAMD / Math.max(1, splits.length + (includeSelf ? 1 : 0))
        )
      : 0;

  const handleAddPerson = () => {
    onChangeSplits([
      ...splits,
      {
        id: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        person: '',
        amountStr: '',
      },
    ]);
  };

  const handleRemovePerson = (id: string) => {
    if (splits.length <= 1) return;
    onChangeSplits(splits.filter((s) => s.id !== id));
  };

  const handleUpdatePerson = (
    id: string,
    patch: Partial<Pick<SplitParticipant, 'person' | 'amountStr'>>
  ) => {
    onChangeSplits(
      splits.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  };

  return (
    <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC]/80 dark:bg-[#0B1120] p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-[#0F172A] dark:text-[#F8FAFC] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-[#CBD5E1] dark:border-[#334155] accent-[#2563EB]"
          />
          <Users className="w-4 h-4 text-[#2563EB] dark:text-[#60A5FA] shrink-0" />
          <span>Կիսել ընկերների հետ (ավտոմատ պարտք)</span>
        </label>
      </div>

      {enabled && (
        <div className="space-y-3 pt-1 border-t border-[#E2E8F0] dark:border-[#1E293B]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center p-0.5 rounded-lg border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] text-xs">
              <button
                type="button"
                onClick={() => onChangeMode('equal')}
                className={`min-h-[28px] px-2.5 rounded-md font-medium transition-colors cursor-pointer ${
                  splitMode === 'equal'
                    ? 'bg-[#2563EB] text-white dark:bg-[#3B82F6] dark:text-[#060B16]'
                    : 'text-[#64748B] dark:text-[#94A3B8]'
                }`}
              >
                Հավասար
              </button>
              <button
                type="button"
                onClick={() => onChangeMode('custom')}
                className={`min-h-[28px] px-2.5 rounded-md font-medium transition-colors cursor-pointer ${
                  splitMode === 'custom'
                    ? 'bg-[#2563EB] text-white dark:bg-[#3B82F6] dark:text-[#060B16]'
                    : 'text-[#64748B] dark:text-[#94A3B8]'
                }`}
              >
                Առանձին գումար
              </button>
            </div>

            {splitMode === 'equal' && (
              <label className="inline-flex items-center gap-1.5 text-xs text-[#475569] dark:text-[#CBD5E1] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeSelf}
                  onChange={(e) => onToggleIncludeSelf(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-[#CBD5E1] dark:border-[#334155] accent-[#2563EB]"
                />
                <span>Ներառել ինձ</span>
              </label>
            )}
          </div>

          <div className="space-y-2">
            {splits.map((sp, idx) => (
              <div
                key={sp.id}
                className="flex flex-wrap min-[380px]:flex-nowrap items-center gap-2"
              >
                <input
                  type="text"
                  value={sp.person}
                  onChange={(e) =>
                    handleUpdatePerson(sp.id, { person: e.target.value })
                  }
                  placeholder={`Ընկեր ${idx + 1} (օր. Արամ)`}
                  className="flex-1 min-w-[120px] min-h-[38px] sm:min-h-[36px] px-2.5 py-1.5 text-xs rounded-lg input-field"
                />

                {splitMode === 'custom' ? (
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={sp.amountStr}
                    onChange={(e) =>
                      handleUpdatePerson(sp.id, { amountStr: e.target.value })
                    }
                    placeholder="Բաժին (֏)"
                    className="w-24 min-[380px]:w-28 min-h-[38px] sm:min-h-[36px] px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-lg input-field"
                  />
                ) : (
                  <span className="pa-sensitive w-20 min-[380px]:w-24 text-right text-xs font-mono tabular-nums text-[#475569] dark:text-[#CBD5E1] shrink-0">
                    {equalPerPerson > 0
                      ? formatMoney(equalPerPerson, 'AMD')
                      : '—'}
                  </span>
                )}

                {splits.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemovePerson(sp.id)}
                    aria-label="Հեռացնել մասնակցին"
                    className="min-h-[38px] min-w-[38px] sm:min-h-[34px] sm:min-w-[34px] flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={handleAddPerson}
              className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-xs font-medium text-[#2563EB] dark:text-[#60A5FA] hover:border-[#2563EB] inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ավելացնել ընկեր</span>
            </button>

            {totalAmountAMD > 0 && computed.shares.length > 0 && (
              <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums text-right">
                <span className="pa-sensitive">
                  Քո մասնաբաժինը՝{' '}
                  <strong className="font-mono text-[#0F172A] dark:text-[#F8FAFC]">
                    {formatMoney(computed.userShare, 'AMD')}
                  </strong>
                </span>
                {' · '}
                <span>
                  Կստեղծվի {computed.shares.length} «Ինձ են պարտք» գրառում
                </span>
              </div>
            )}
          </div>

          {computed.errorMessage && (
            <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">
              {computed.errorMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
