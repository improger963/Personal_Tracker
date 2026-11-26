import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Coffee,
  Flame,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Timer,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { FocusGoal, FocusSession, NotificationSettings, Task } from '../types';
import { getLastNDaysISO, getTodayISO } from '../data/defaults';
import {
  canUseBrowserNotifications,
  playNotificationChime,
  speakNotificationText,
} from '../utils/notifications';
import { isTaskCompletedOnDate } from '../utils/taskSchedule';

interface FocusTimerCardProps {
  tasks: Task[];
  focusGoal: FocusGoal | null;
  focusSessions: FocusSession[];
  soundEnabled: boolean;
  browserNotifications: boolean;
  notificationSettings?: NotificationSettings;
  onCompleteSession: (session: Omit<FocusSession, 'id' | 'completedAt'>) => void;
  compact?: boolean;
}

interface PersistedTimerState {
  presetMin: number;
  mode: 'focus' | 'break';
  remainingSec: number;
  running: boolean;
  targetEndMs: number | null;
  taskId: string;
}

const TIMER_STORAGE_KEY = 'pa_focus_timer_v1';
const TIMER_SYNC_EVENT = 'pa-focus-timer-sync';
const LAST_COMPLETED_KEY = 'pa_focus_last_done_ms';
const SOUNDSCAPE_STORAGE_KEY = 'pa_focus_soundscape';
const DAILY_TARGET_MINUTES = 90;

type SoundscapeMode = 'none' | 'brown' | 'rain' | 'pulse';

const SOUNDSCAPE_OPTIONS: Array<{ id: SoundscapeMode; label: string }> = [
  { id: 'none', label: 'Լռություն' },
  { id: 'brown', label: 'Խորը ֆոն' },
  { id: 'rain', label: 'Անձրև' },
  { id: 'pulse', label: 'Ալֆա ռիթմ' },
];

const TIMER_PRESETS: Array<{
  minutes: number;
  mode: 'focus' | 'break';
  label: string;
}> = [
  { minutes: 25, mode: 'focus', label: '25ր Ֆոկուս' },
  { minutes: 45, mode: 'focus', label: '45ր Խորը' },
  { minutes: 5, mode: 'break', label: '5ր Դադար' },
  { minutes: 15, mode: 'break', label: '15ր Հանգիստ' },
];

function getDefaultTimerState(): PersistedTimerState {
  return {
    presetMin: 25,
    mode: 'focus',
    remainingSec: 25 * 60,
    running: false,
    targetEndMs: null,
    taskId: '',
  };
}

function loadTimerState(): PersistedTimerState {
  try {
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) return getDefaultTimerState();
    const parsed = JSON.parse(raw) as Partial<PersistedTimerState>;
    const presetMin =
      typeof parsed.presetMin === 'number' && parsed.presetMin > 0
        ? parsed.presetMin
        : 25;
    const mode = parsed.mode === 'break' ? 'break' : 'focus';
    const running = Boolean(parsed.running);
    const targetEndMs =
      typeof parsed.targetEndMs === 'number' ? parsed.targetEndMs : null;
    const remainingSec =
      running && targetEndMs
        ? Math.max(0, Math.ceil((targetEndMs - Date.now()) / 1000))
        : typeof parsed.remainingSec === 'number' && parsed.remainingSec >= 0
          ? parsed.remainingSec
          : presetMin * 60;

    return {
      presetMin,
      mode,
      remainingSec,
      running,
      targetEndMs,
      taskId: typeof parsed.taskId === 'string' ? parsed.taskId : '',
    };
  } catch {
    return getDefaultTimerState();
  }
}

function persistTimerState(next: PersistedTimerState) {
  try {
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(TIMER_SYNC_EVENT));
  } catch {
    // ignore storage quota errors
  }
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}ր`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}ժ ${m}ր` : `${h}ժ`;
}

function formatMMSS(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const FocusTimerCard = memo(function FocusTimerCard({
  tasks,
  focusGoal,
  focusSessions,
  soundEnabled,
  browserNotifications,
  notificationSettings,
  onCompleteSession,
  compact = false,
}: FocusTimerCardProps) {
  const [timer, setTimer] = useState<PersistedTimerState>(loadTimerState);
  const [soundscape, setSoundscape] = useState<SoundscapeMode>(() => {
    try {
      const saved = localStorage.getItem(SOUNDSCAPE_STORAGE_KEY);
      if (
        saved === 'brown' ||
        saved === 'rain' ||
        saved === 'pulse' ||
        saved === 'none'
      ) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'none';
  });
  const timerRef = useRef(timer);
  timerRef.current = timer;
  const finishingRef = useRef(false);
  const soundscapeCleanupRef = useRef<(() => void) | null>(null);
  const todayISO = getTodayISO();

  const handleSelectSoundscape = (nextMode: SoundscapeMode) => {
    setSoundscape(nextMode);
    try {
      localStorage.setItem(SOUNDSCAPE_STORAGE_KEY, nextMode);
    } catch {
      // ignore
    }
  };

  const pendingTasks = useMemo(
    () =>
      tasks
        .filter((t) => !isTaskCompletedOnDate(t, todayISO))
        .slice(0, 15),
    [tasks, todayISO]
  );

  const selectedLabel = useMemo(() => {
    if (timer.mode === 'break') return 'Ընդմիջում';
    if (timer.taskId === '__focus_goal__' && focusGoal) {
      return focusGoal.title;
    }
    const found = tasks.find((t) => t.id === timer.taskId);
    if (found) return found.title;
    if (focusGoal && !focusGoal.completed) return focusGoal.title;
    return 'Խորը կենտրոնացում';
  }, [timer.mode, timer.taskId, focusGoal, tasks]);

  const finishSession = useCallback(
    (minutesCompleted: number, stateSnapshot: PersistedTimerState) => {
      if (finishingRef.current) return;
      finishingRef.current = true;

      const dedupeKey = stateSnapshot.targetEndMs
        ? String(stateSnapshot.targetEndMs)
        : String(Math.floor(Date.now() / 3000));
      try {
        if (localStorage.getItem(LAST_COMPLETED_KEY) === dedupeKey) {
          finishingRef.current = false;
          return;
        }
        localStorage.setItem(LAST_COMPLETED_KEY, dedupeKey);
      } catch {
        // ignore
      }

      const resetState: PersistedTimerState = {
        ...stateSnapshot,
        running: false,
        targetEndMs: null,
        remainingSec: stateSnapshot.presetMin * 60,
      };
      setTimer(resetState);
      persistTimerState(resetState);

      if (soundEnabled) {
        playNotificationChime({
          preset: notificationSettings?.soundPreset ?? 'chime',
          volume: notificationSettings?.soundVolume ?? 0.75,
        });
      }
      if (notificationSettings?.voiceEnabled) {
        const spokenTitle =
          stateSnapshot.mode === 'focus'
            ? `Ֆոկուս սեսիան ավարտվեց, ${selectedLabel}, ${minutesCompleted} րոպե`
            : `Ընդմիջումն ավարտվեց, ժամանակն է վերադառնալ գործին`;
        window.setTimeout(() => {
          void speakNotificationText(spokenTitle, notificationSettings);
        }, soundEnabled ? 350 : 40);
      }
      if (
        browserNotifications &&
        canUseBrowserNotifications() &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification(
            stateSnapshot.mode === 'focus'
              ? 'Ֆոկուս սեսիան ավարտվեց'
              : 'Ընդմիջումն ավարտվեց',
            {
              body: `${selectedLabel} · ${minutesCompleted} րոպե`,
            }
          );
        } catch {
          // ignore
        }
      }

      onCompleteSession({
        date: getTodayISO(),
        minutes: Math.max(1, minutesCompleted),
        mode: stateSnapshot.mode,
        label: selectedLabel,
        taskId:
          stateSnapshot.taskId &&
          stateSnapshot.taskId !== '__focus_goal__'
            ? stateSnapshot.taskId
            : undefined,
      });

      window.setTimeout(() => {
        finishingRef.current = false;
      }, 300);
    },
    [soundEnabled, browserNotifications, notificationSettings, selectedLabel, onCompleteSession]
  );

  // Listen to storage / cross-component timer sync events
  useEffect(() => {
    const syncFromStorage = () => {
      setTimer(loadTimerState());
    };
    window.addEventListener('storage', syncFromStorage);
    window.addEventListener(TIMER_SYNC_EVENT, syncFromStorage);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener(TIMER_SYNC_EVENT, syncFromStorage);
    };
  }, []);

  // Countdown tick without recreating interval every second
  useEffect(() => {
    if (!timer.running || !timer.targetEndMs) return;

    const targetEnd = timer.targetEndMs;
    const tick = () => {
      const rem = Math.ceil((targetEnd - Date.now()) / 1000);
      if (rem <= 0) {
        const snapshot = timerRef.current;
        finishSession(snapshot.presetMin, snapshot);
      } else {
        setTimer((prev) =>
          prev.remainingSec === rem ? prev : { ...prev, remainingSec: rem }
        );
      }
    };

    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [timer.running, timer.targetEndMs, finishSession]);

  // Procedural Web Audio API soundscape generator while timer is actively running
  useEffect(() => {
    const stopActiveSoundscape = () => {
      if (soundscapeCleanupRef.current) {
        soundscapeCleanupRef.current();
        soundscapeCleanupRef.current = null;
      }
    };

    stopActiveSoundscape();
    if (!timer.running || soundscape === 'none') {
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioCtx();
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
      masterGain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.6);
      masterGain.connect(ctx.destination);

      if (soundscape === 'pulse') {
        const oscLeft = ctx.createOscillator();
        const oscRight = ctx.createOscillator();
        const oscSub = ctx.createOscillator();
        const subGain = ctx.createGain();

        oscLeft.type = 'sine';
        oscRight.type = 'sine';
        oscSub.type = 'sine';
        oscLeft.frequency.value = 174;
        oscRight.frequency.value = 184; // 10Hz gentle alpha beat
        oscSub.frequency.value = 87;
        subGain.gain.value = 0.25;

        oscLeft.connect(masterGain);
        oscRight.connect(masterGain);
        oscSub.connect(subGain);
        subGain.connect(masterGain);

        oscLeft.start();
        oscRight.start();
        oscSub.start();

        soundscapeCleanupRef.current = () => {
          try {
            oscLeft.stop();
            oscRight.stop();
            oscSub.stop();
            void ctx?.close();
          } catch {
            // ignore
          }
        };
      } else {
        const bufferSize = ctx.sampleRate * 3;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        if (soundscape === 'brown') {
          let lastOut = 0;
          for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            lastOut = (lastOut + 0.02 * white) / 1.02;
            data[i] = lastOut * 3.2;
          }
        } else {
          // Pink/rain-textured broadband noise
          let b0 = 0;
          let b1 = 0;
          let b2 = 0;
          for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99765 * b0 + white * 0.099046;
            b1 = 0.963 * b1 + white * 0.2965164;
            b2 = 0.57 * b2 + white * 1.0526913;
            data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.18;
          }
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = soundscape === 'brown' ? 'lowpass' : 'bandpass';
        filter.frequency.value = soundscape === 'brown' ? 380 : 1200;
        filter.Q.value = soundscape === 'brown' ? 0.7 : 0.55;

        source.connect(filter);
        filter.connect(masterGain);
        source.start();

        soundscapeCleanupRef.current = () => {
          try {
            source.stop();
            void ctx?.close();
          } catch {
            // ignore
          }
        };
      }
    } catch {
      if (ctx) {
        void ctx.close();
      }
    }

    return stopActiveSoundscape;
  }, [timer.running, soundscape]);

  const handleSelectPreset = (minutes: number, mode: 'focus' | 'break') => {
    const next: PersistedTimerState = {
      ...timer,
      presetMin: minutes,
      mode,
      remainingSec: minutes * 60,
      running: false,
      targetEndMs: null,
    };
    setTimer(next);
    persistTimerState(next);
  };

  const handleToggleRun = () => {
    if (timer.running) {
      const rem = timer.targetEndMs
        ? Math.max(1, Math.ceil((timer.targetEndMs - Date.now()) / 1000))
        : timer.remainingSec;
      const next: PersistedTimerState = {
        ...timer,
        running: false,
        targetEndMs: null,
        remainingSec: rem,
      };
      setTimer(next);
      persistTimerState(next);
    } else {
      const baseSec =
        timer.remainingSec > 0 ? timer.remainingSec : timer.presetMin * 60;
      const next: PersistedTimerState = {
        ...timer,
        running: true,
        remainingSec: baseSec,
        targetEndMs: Date.now() + baseSec * 1000,
      };
      setTimer(next);
      persistTimerState(next);
    }
  };

  const handleReset = () => {
    const next: PersistedTimerState = {
      ...timer,
      running: false,
      targetEndMs: null,
      remainingSec: timer.presetMin * 60,
    };
    setTimer(next);
    persistTimerState(next);
  };

  const handleFinishEarly = () => {
    const elapsedSec = timer.presetMin * 60 - timer.remainingSec;
    const mins = Math.max(1, Math.round(elapsedSec / 60));
    finishSession(mins, timer);
  };

  const handleAdjustMinutes = (deltaMinutes: number) => {
    const nextPresetMin = Math.min(120, Math.max(5, timer.presetMin + deltaMinutes));
    if (timer.running && timer.targetEndMs) {
      const nextRemSec = Math.max(60, timer.remainingSec + deltaMinutes * 60);
      const next: PersistedTimerState = {
        ...timer,
        presetMin: nextPresetMin,
        remainingSec: nextRemSec,
        targetEndMs: Date.now() + nextRemSec * 1000,
      };
      setTimer(next);
      persistTimerState(next);
    } else {
      const nextRemSec = Math.min(
        nextPresetMin * 60,
        Math.max(60, timer.remainingSec + deltaMinutes * 60)
      );
      const next: PersistedTimerState = {
        ...timer,
        presetMin: nextPresetMin,
        remainingSec: nextRemSec,
      };
      setTimer(next);
      persistTimerState(next);
    }
  };

  const totalSec = timer.presetMin * 60;
  const progress =
    totalSec > 0 ? Math.min(1, Math.max(0, 1 - timer.remainingSec / totalSec)) : 0;
  const ringRadius = compact ? 36 : 44;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - progress);

  // Weekly stats (last 7 days)
  const last7Days = useMemo(() => getLastNDaysISO(7), []);
  const weeklyStats = useMemo(() => {
    const daySet = new Set(last7Days.map((d) => d.date));
    const focusOnly = focusSessions.filter(
      (s) => s.mode === 'focus' && daySet.has(s.date)
    );
    const totalMinutes = focusOnly.reduce((sum, s) => sum + s.minutes, 0);
    const todayMinutes = focusOnly
      .filter((s) => s.date === todayISO)
      .reduce((sum, s) => sum + s.minutes, 0);
    const perDay = last7Days.map((d) => ({
      ...d,
      minutes: focusOnly
        .filter((s) => s.date === d.date)
        .reduce((sum, s) => sum + s.minutes, 0),
    }));
    const maxDayMin = Math.max(25, ...perDay.map((d) => d.minutes));
    return {
      totalMinutes,
      todayMinutes,
      sessionsCount: focusOnly.length,
      perDay,
      maxDayMin,
    };
  }, [focusSessions, last7Days, todayISO]);

  const elapsedMinutes = Math.floor((totalSec - timer.remainingSec) / 60);

  return (
    <section
      aria-label="Ֆոկուս ժամաչափ և շաբաթական արդյունավետություն"
      className="surface-card p-4 sm:p-5 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              timer.mode === 'break'
                ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                : 'bg-[#2563EB]/10 dark:bg-[#3B82F6]/15 text-[#2563EB] dark:text-[#60A5FA]'
            }`}
          >
            {timer.mode === 'break' ? (
              <Coffee className="w-4 h-4" />
            ) : (
              <Timer className="w-4 h-4" />
            )}
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-sm sm:text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC] flex items-center gap-2">
              <span>Ֆոկուս ժամաչափ</span>
              {timer.running && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Ակտիվ
                </span>
              )}
            </h3>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] truncate tabular-nums">
              Այսօր՝ {formatDuration(weeklyStats.todayMinutes)} · Շաբաթվա ընդ.՝{' '}
              {formatDuration(weeklyStats.totalMinutes)} ({weeklyStats.sessionsCount}{' '}
              սեսիա)
            </p>
          </div>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl surface-subtle self-start sm:self-auto">
          {TIMER_PRESETS.map((preset) => {
            const active =
              timer.presetMin === preset.minutes && timer.mode === preset.mode;
            return (
              <button
                key={`${preset.mode}-${preset.minutes}`}
                type="button"
                onClick={() => handleSelectPreset(preset.minutes, preset.mode)}
                className={`min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                  active
                    ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                    : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        {/* Left: Ring + Time + Controls */}
        <div className="lg:col-span-7 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-4 shrink-0">
            <div className="relative flex items-center justify-center shrink-0">
              <svg
                width={compact ? 88 : 104}
                height={compact ? 88 : 104}
                viewBox={compact ? '0 0 88 88' : '0 0 104 104'}
                className="-rotate-90"
                aria-hidden="true"
              >
                <circle
                  cx={compact ? 44 : 52}
                  cy={compact ? 44 : 52}
                  r={ringRadius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  className="text-[#E2E8F0] dark:text-[#1E293B]"
                />
                <circle
                  cx={compact ? 44 : 52}
                  cy={compact ? 44 : 52}
                  r={ringRadius}
                  fill="none"
                  stroke={timer.mode === 'break' ? '#10B981' : '#3B82F6'}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  className="transition-[stroke-dashoffset] duration-300"
                />
              </svg>
              <span className="absolute font-mono text-base sm:text-lg font-bold tabular-nums text-[#0F172A] dark:text-[#F8FAFC]">
                {formatMMSS(timer.remainingSec)}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleRun}
                  className={`min-h-[38px] px-4 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] ${
                    timer.running
                      ? 'border border-amber-400/60 bg-amber-500/12 text-amber-700 dark:text-amber-300'
                      : 'btn-primary'
                  }`}
                >
                  {timer.running ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>Դադար</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>
                        {timer.remainingSec < totalSec ? 'Շարունակել' : 'Սկսել'}
                      </span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleAdjustMinutes(-5)}
                  disabled={timer.presetMin <= 5}
                  aria-label="Նվազեցնել 5 րոպեով"
                  title="-5 րոպե"
                  className="min-h-[38px] px-2 flex items-center justify-center rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] transition-colors cursor-pointer disabled:opacity-40"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjustMinutes(5)}
                  disabled={timer.presetMin >= 120}
                  aria-label="Ավելացնել 5 րոպե"
                  title="+5 րոպե"
                  className="min-h-[38px] px-2 flex items-center justify-center rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] transition-colors cursor-pointer disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  aria-label="Վերակայել ժամաչափը"
                  title="Վերակայել"
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                {elapsedMinutes >= 1 && (
                  <button
                    type="button"
                    onClick={handleFinishEarly}
                    aria-label="Գրանցել ավարտված րոպեները"
                    title="Ավարտել և գրանցել հիմա"
                    className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-semibold inline-flex items-center gap-1 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Գրանցել</span>
                  </button>
                )}
              </div>

              {timer.mode === 'focus' && (
                <select
                  value={timer.taskId}
                  onChange={(e) => {
                    const next: PersistedTimerState = {
                      ...timer,
                      taskId: e.target.value,
                    };
                    setTimer(next);
                    persistTimerState(next);
                  }}
                  aria-label="Կապել անելիքի կամ նպատակի հետ"
                  className="w-full sm:max-w-[260px] min-h-[34px] px-2.5 py-1 text-xs rounded-xl input-field"
                >
                  <option value="">
                    {focusGoal && !focusGoal.completed
                      ? `Ֆոկուս՝ ${focusGoal.title}`
                      : 'Ազատ կենտրոնացում'}
                  </option>
                  {focusGoal && (
                    <option value="__focus_goal__">
                      Նպատակ՝ {focusGoal.title}
                    </option>
                  )}
                  {pendingTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              )}

              {/* Soundscape ambient selector */}
              <div className="flex flex-wrap items-center gap-1 pt-0.5">
                <span className="inline-flex items-center gap-1 text-[11px] text-[#64748B] dark:text-[#94A3B8] mr-1">
                  {soundscape === 'none' ? (
                    <VolumeX className="w-3 h-3" />
                  ) : (
                    <Volume2 className="w-3 h-3 text-[#2563EB] dark:text-[#60A5FA]" />
                  )}
                  <span>Ֆոն․</span>
                </span>
                {SOUNDSCAPE_OPTIONS.map((opt) => {
                  const active = soundscape === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectSoundscape(opt.id)}
                      className={`min-h-[26px] px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#EFF6FF] dark:bg-[#172554]/70 text-[#2563EB] dark:text-[#60A5FA] font-semibold'
                          : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right: 7-Day Weekly Focus Bar Breakdown */}
        <div className="lg:col-span-5 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              <span>7-օրյա ֆոկուս ակտիվություն</span>
            </span>
            <span className="inline-flex items-center gap-1 font-mono font-semibold text-[#2563EB] dark:text-[#60A5FA] tabular-nums">
              <Clock className="w-3 h-3" />
              {formatDuration(weeklyStats.totalMinutes)}
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1.5 items-end h-14 pt-1">
            {weeklyStats.perDay.map((d) => {
              const barPct =
                d.minutes > 0
                  ? Math.max(18, Math.round((d.minutes / weeklyStats.maxDayMin) * 100))
                  : 8;
              const isToday = d.date === todayISO;
              return (
                <div
                  key={d.date}
                  className="flex flex-col items-center justify-end h-full gap-1"
                  title={`${d.weekday} (${d.dayNum}): ${d.minutes} րոպե`}
                >
                  <div className="w-full flex-1 flex items-end justify-center">
                    <div
                      className={`w-full max-w-[18px] rounded-t-md transition-all ${
                        d.minutes > 0
                          ? isToday
                            ? 'bg-[#2563EB] dark:bg-[#3B82F6]'
                            : 'bg-[#93C5FD] dark:bg-[#1D4ED8]'
                          : 'bg-[#E2E8F0] dark:bg-[#1E293B]'
                      }`}
                      style={{ height: `${barPct}%` }}
                    />
                  </div>
                  <span
                    className={`text-[10px] leading-none ${
                      isToday
                        ? 'font-bold text-[#2563EB] dark:text-[#60A5FA]'
                        : 'text-[#64748B] dark:text-[#94A3B8]'
                    }`}
                  >
                    {d.weekday}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="pt-1 border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-1.5">
            <div className="flex items-center justify-between text-[11px] tabular-nums">
              <span className="text-[#64748B] dark:text-[#94A3B8]">
                Օրվա թիրախ ({DAILY_TARGET_MINUTES}ր)
              </span>
              <span className="font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                {weeklyStats.todayMinutes}/{DAILY_TARGET_MINUTES}ր (
                {Math.min(
                  100,
                  Math.round(
                    (weeklyStats.todayMinutes / DAILY_TARGET_MINUTES) * 100
                  )
                )}
                %)
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[#E2E8F0] dark:bg-[#1E293B] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  weeklyStats.todayMinutes >= DAILY_TARGET_MINUTES
                    ? 'bg-emerald-500'
                    : 'bg-[#2563EB] dark:bg-[#3B82F6]'
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      weeklyStats.todayMinutes > 0 ? 5 : 0,
                      Math.round(
                        (weeklyStats.todayMinutes / DAILY_TARGET_MINUTES) * 100
                      )
                    )
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});
