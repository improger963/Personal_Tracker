import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Delete,
  Fingerprint,
  KeyRound,
  Lock,
  ShieldCheck,
  ShieldOff,
  X,
} from 'lucide-react';
import { BrandMark } from './BrandMark';

interface AppLockGateProps {
  hasBiometrics: boolean;
  lockoutUntil: number | null;
  onUnlockWithPin: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  onUnlockWithBiometrics: () => Promise<{ ok: boolean; error?: string }>;
}

export function AppLockGate({
  hasBiometrics,
  lockoutUntil,
  onUnlockWithPin,
  onUnlockWithBiometrics,
}: AppLockGateProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const isLockedOut = Boolean(lockoutUntil && nowMs < lockoutUntil);
  const remainingLockoutSecs =
    lockoutUntil && nowMs < lockoutUntil
      ? Math.max(1, Math.ceil((lockoutUntil - nowMs) / 1000))
      : 0;

  useEffect(() => {
    if (!lockoutUntil) return;
    const current = Date.now();
    setNowMs(current);
    if (current >= lockoutUntil) return;
    const id = window.setInterval(() => {
      const nextNow = Date.now();
      setNowMs(nextNow);
      if (nextNow >= lockoutUntil) {
        window.clearInterval(id);
        setError(null);
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [lockoutUntil]);

  const submitPin = async (candidate: string) => {
    if (candidate.length !== 4 || checking || isLockedOut) return;
    setChecking(true);
    setError(null);
    const res = await onUnlockWithPin(candidate);
    setChecking(false);
    if (!res.ok) {
      setError(res.error || 'Սխալ PIN կոդ։');
      setPin('');
    }
  };

  const handleDigit = (digit: string) => {
    if (checking || isLockedOut) return;
    setError(null);
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) {
      void submitPin(next);
    }
  };

  const handleBackspace = () => {
    if (checking || isLockedOut || pin.length === 0) return;
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isLockedOut) return;
      if (/^\d$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, checking, isLockedOut]);

  const handleBiometricClick = async () => {
    setError(null);
    const res = await onUnlockWithBiometrics();
    if (!res.ok && res.error) {
      setError(res.error);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#F5F6F8] dark:bg-[#070B12] px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-label="Հավելվածի կողպում"
    >
      <div className="w-full max-w-xs space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-[#1D4ED8]/10 dark:bg-[#3B82F6]/15 flex items-center justify-center text-[#1D4ED8] dark:text-[#60A5FA]">
            <BrandMark className="w-8 h-8" />
          </div>
          <div>
            <h1 className="font-display text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
              Հավելվածը պաշտպանված է
            </h1>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1">
              Մուտքագրեք 4-նիշանոց PIN կոդը՝ շարունակելու համար
            </p>
          </div>
        </div>

        {/* PIN Dots */}
        <div className="flex items-center justify-center gap-4 py-1">
          {[0, 1, 2, 3].map((idx) => {
            const filled = idx < pin.length;
            return (
              <span
                key={idx}
                className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                  filled
                    ? 'bg-[#2563EB] border-[#2563EB] scale-110'
                    : 'border-[#CBD5E1] dark:border-[#334155] bg-transparent'
                }`}
              />
            );
          })}
        </div>

        {(isLockedOut || error) && (
          <p className="text-xs font-medium text-rose-600 dark:text-rose-400 min-h-[16px] tabular-nums">
            {isLockedOut
              ? `Չափազանց շատ սխալ փորձեր․ սպասեք ${remainingLockoutSecs} վայրկյան`
              : error}
          </p>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 max-w-[260px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              disabled={checking || isLockedOut}
              onClick={() => handleDigit(d)}
              className="h-14 rounded-2xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] hover:border-[#2563EB] dark:hover:border-[#3B82F6] text-xl font-semibold font-mono text-[#0F172A] dark:text-[#F8FAFC] active:scale-95 transition-all cursor-pointer disabled:opacity-45"
            >
              {d}
            </button>
          ))}

          {hasBiometrics ? (
            <button
              type="button"
              onClick={() => void handleBiometricClick()}
              aria-label="Ապակողպել կենսաչափական տվյալով"
              className="h-14 rounded-2xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] hover:border-[#2563EB] text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center active:scale-95 transition-all cursor-pointer"
            >
              <Fingerprint className="w-6 h-6" />
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            disabled={checking || isLockedOut}
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] hover:border-[#2563EB] dark:hover:border-[#3B82F6] text-xl font-semibold font-mono text-[#0F172A] dark:text-[#F8FAFC] active:scale-95 transition-all cursor-pointer disabled:opacity-45"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            aria-label="Ջնջել վերջին թիվը"
            className="h-14 rounded-2xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] hover:border-rose-500 text-[#64748B] dark:text-[#94A3B8] flex items-center justify-center active:scale-95 transition-all cursor-pointer"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface AppLockSettingsModalProps {
  isEnabled: boolean;
  autoLockOnHide: boolean;
  isBiometricsSupported: boolean;
  hasBiometrics: boolean;
  onEnablePin: (pin: string) => Promise<void>;
  onChangePin: (currentPin: string, nextPin: string) => Promise<void>;
  onDisablePin: (currentPin: string) => Promise<void>;
  onToggleAutoLock: () => void;
  onEnrollBiometrics: () => Promise<{ ok: boolean; error?: string }>;
  onRemoveBiometrics: () => void;
  onLockNow: () => void;
  onClose: () => void;
}

export function AppLockSettingsModal({
  isEnabled,
  autoLockOnHide,
  isBiometricsSupported,
  hasBiometrics,
  onEnablePin,
  onChangePin,
  onDisablePin,
  onToggleAutoLock,
  onEnrollBiometrics,
  onRemoveBiometrics,
  onLockNow,
  onClose,
}: AppLockSettingsModalProps) {
  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [mode, setMode] = useState<'status' | 'change' | 'disable'>('status');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!/^\d{4}$/.test(pinInput)) {
      setError('PIN կոդը պետք է բաղկացած լինի 4 թվանշանից։');
      return;
    }
    if (pinInput !== confirmPinInput) {
      setError('PIN կոդերը չեն համընկնում։');
      return;
    }
    setBusy(true);
    try {
      await onEnablePin(pinInput);
      setPinInput('');
      setConfirmPinInput('');
      setSuccessMsg('PIN պաշտպանությունը միացված է։');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Սխալ առաջացավ։');
    } finally {
      setBusy(false);
    }
  };

  const handleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!/^\d{4}$/.test(pinInput)) {
      setError('Նոր PIN կոդը պետք է լինի 4 թվանշան։');
      return;
    }
    if (pinInput !== confirmPinInput) {
      setError('Նոր PIN կոդերը չեն համընկնում։');
      return;
    }
    setBusy(true);
    try {
      await onChangePin(currentPinInput, pinInput);
      setCurrentPinInput('');
      setPinInput('');
      setConfirmPinInput('');
      setMode('status');
      setSuccessMsg('PIN կոդը թարմացվեց։');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Սխալ առաջացավ։');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onDisablePin(currentPinInput);
      setCurrentPinInput('');
      setMode('status');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Սխալ PIN կոդ։');
    } finally {
      setBusy(false);
    }
  };

  const handleBiometricsToggle = async () => {
    setError(null);
    setSuccessMsg(null);
    if (hasBiometrics) {
      onRemoveBiometrics();
      setSuccessMsg('Կենսաչափական մուտքն անջատվեց։');
      return;
    }
    const res = await onEnrollBiometrics();
    if (res.ok) {
      setSuccessMsg('Կենսաչափական ապակողպումը միացվեց։');
    } else if (res.error) {
      setError(res.error);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#020617]/65 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="applock-settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border-t sm:border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[#EFF6FF] dark:bg-[#172554]/70 text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center">
              <ShieldCheck className="w-4.5 h-4.5" />
            </span>
            <div>
              <h2
                id="applock-settings-title"
                className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]"
              >
                Անվտանգություն և PIN կողպեք
              </h2>
              <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                {isEnabled ? 'Պաշտպանությունը ակտիվ է' : 'Պաշտպանությունը միացված չէ'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Փակել"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {!isEnabled ? (
            <form onSubmit={handleEnable} className="space-y-3">
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                Սահմանեք 4-նիշանոց PIN կոդ՝ հավելվածը տեղային սարքում կողպելու և
                անձնական տվյալները պաշտպանելու համար։
              </p>
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                  Նոր 4-նիշ PIN կոդ
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  className="w-full min-h-[42px] px-3.5 rounded-xl input-field font-mono text-center text-lg tracking-[0.5em]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                  Կրկնեք PIN կոդը
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmPinInput}
                  onChange={(e) =>
                    setConfirmPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  placeholder="••••"
                  className="w-full min-h-[42px] px-3.5 rounded-xl input-field font-mono text-center text-lg tracking-[0.5em]"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-[42px] rounded-xl btn-primary text-xs font-semibold flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                <span>Միացնել PIN պաշտպանությունը</span>
              </button>
            </form>
          ) : mode === 'status' ? (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                    Ավտոմատ կողպում ծալելիս
                  </p>
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                    Անմիջապես պահանջել PIN էջից դուրս գալուց հետո
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onToggleAutoLock}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    autoLockOnHide
                      ? 'bg-[#2563EB] text-white'
                      : 'bg-[#E2E8F0] dark:bg-[#1E293B] text-[#475569] dark:text-[#94A3B8]'
                  }`}
                >
                  {autoLockOnHide ? 'Միացված' : 'Անջատված'}
                </button>
              </div>

              {isBiometricsSupported && (
                <div className="p-3.5 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                      Face ID / Մատնահետք
                    </p>
                    <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                      Արագ ապակողպում սարքի կենսաչափությամբ
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleBiometricsToggle()}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      hasBiometrics
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#E2E8F0] dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC]'
                    }`}
                  >
                    {hasBiometrics ? 'Միացված' : 'Միացնել'}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onLockNow();
                    onClose();
                  }}
                  className="min-h-[40px] px-3 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#2563EB] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Կողպել հիմա</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode('change');
                  }}
                  className="min-h-[40px] px-3 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#2563EB] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Փոխել PIN-ը</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode('disable');
                }}
                className="w-full min-h-[38px] rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/8 inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ShieldOff className="w-3.5 h-3.5" />
                <span>Անջատել PIN պաշտպանությունը</span>
              </button>
            </div>
          ) : mode === 'change' ? (
            <form onSubmit={handleChange} className="space-y-3">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={currentPinInput}
                onChange={(e) =>
                  setCurrentPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                placeholder="Ընթացիկ PIN (4 թիվ)"
                className="w-full min-h-[40px] px-3.5 rounded-xl input-field font-mono text-sm"
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Նոր PIN (4 թիվ)"
                className="w-full min-h-[40px] px-3.5 rounded-xl input-field font-mono text-sm"
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPinInput}
                onChange={(e) =>
                  setConfirmPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                placeholder="Կրկնեք նոր PIN-ը"
                className="w-full min-h-[40px] px-3.5 rounded-xl input-field font-mono text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('status')}
                  className="flex-1 min-h-[40px] rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] text-xs font-semibold text-[#64748B] cursor-pointer"
                >
                  Հետ
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 min-h-[40px] rounded-xl btn-primary text-xs font-semibold"
                >
                  Պահպանել
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleDisable} className="space-y-3">
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                Մուտքագրեք ընթացիկ PIN կոդը՝ կողպեքն անջատելու համար։
              </p>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={currentPinInput}
                onChange={(e) =>
                  setCurrentPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                placeholder="••••"
                className="w-full min-h-[42px] px-3.5 rounded-xl input-field font-mono text-center text-lg tracking-[0.5em]"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('status')}
                  className="flex-1 min-h-[40px] rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] text-xs font-semibold text-[#64748B] cursor-pointer"
                >
                  Հետ
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 min-h-[40px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Անջատել
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
