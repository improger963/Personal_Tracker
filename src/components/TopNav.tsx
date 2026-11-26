import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  AudioLines,
  Bell,
  BellRing,
  CalendarClock,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  CloudOff,
  Command,
  Download,
  Eye,
  EyeOff,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Mic,
  MicOff,
  Moon,
  NotebookPen,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  RotateCcw,
  Search,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Square,
  Sun,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from 'lucide-react';
import {
  AppNotificationItem,
  Currency,
  GeminiVoicePreset,
  NavSection,
  Note,
  NotificationSettings,
  NotificationSoundPreset,
  NotificationVoiceMode,
  Task,
} from '../types';
import { formatMoney } from '../data/defaults';
import { formatCycleLabel } from '../utils/financialCycle';
import { triggerHaptic } from '../utils/haptics';
import {
  GEMINI_VOICE_PRESETS,
  NOTIFICATION_SOUND_PRESETS,
  getBrowserSpeechVoices,
  playNotificationChime,
  speakNotificationText,
  stopNotificationVoice,
  subscribeVoicePlaybackState,
} from '../utils/notifications';

export type CloudSyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

interface TopNavProps {
  activeTab: NavSection;
  onSelectTab: (tab: NavSection) => void;
  onOpenNewModal: () => void;
  todayTasks: Task[];
  onToggleTask: (id: string) => void;
  dueNotes: Note[];
  onDismissNoteReminder: (id: string) => void;
  notifications: AppNotificationItem[];
  snoozedCount: number;
  notificationSettings: NotificationSettings;
  canUseBrowserNotifs: boolean;
  onToggleSound: () => void;
  onToggleBrowserNotifications: () => void;
  onUpdateNotificationSettings: (patch: Partial<NotificationSettings>) => void;
  onSpeakNotif: (item: AppNotificationItem) => void;
  onConfirmExpenseNotif: (item: AppNotificationItem) => void;
  onSkipExpenseNotif: (item: AppNotificationItem) => void;
  onSnoozeNotif: (id: string, minutes: number) => void;
  onClearSnoozes: () => void;
  editorialDate: string;
  selectedMonth: string;
  payday?: number;
  onShiftMonth: (delta: number) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  isPrivacyMode: boolean;
  onTogglePrivacy: () => void;
  onOpenCommandPalette: () => void;
  user: User | null;
  syncStatus: CloudSyncStatus;
  isOnline: boolean;
  onSignInGoogle: () => void;
  onSignOutGoogle: () => void;
  canInstallPWA: boolean;
  onInstallPWA: () => void;
  totalBalance?: number;
  currency?: Currency;
  children: React.ReactNode;
}

const NAV_ITEMS: {
  id: NavSection;
  label: string;
  subtitle: string;
  icon: typeof LayoutDashboard;
}[] = [
  {
    id: 'overview',
    label: 'Ընդհանուր',
    subtitle: 'Ամփոփ պատկեր',
    icon: LayoutDashboard,
  },
  {
    id: 'finance',
    label: 'Ֆինանսներ',
    subtitle: 'Մատյան և բյուջե',
    icon: Wallet,
  },
  {
    id: 'planner',
    label: 'Անելիքներ',
    subtitle: 'Օրակարգ և սովորություններ',
    icon: CheckSquare,
  },
  {
    id: 'notes',
    label: 'Նշումներ',
    subtitle: 'Մտքեր և հիշեցումներ',
    icon: NotebookPen,
  },
];

type NotifFilter = 'all' | 'payments' | 'schedule';

export const TopNav = memo(function TopNav({
  activeTab,
  onSelectTab,
  onOpenNewModal,
  todayTasks,
  onToggleTask,
  dueNotes,
  onDismissNoteReminder,
  notifications,
  snoozedCount,
  notificationSettings,
  canUseBrowserNotifs,
  onToggleSound,
  onToggleBrowserNotifications,
  onUpdateNotificationSettings,
  onSpeakNotif,
  onConfirmExpenseNotif,
  onSkipExpenseNotif,
  onSnoozeNotif,
  onClearSnoozes,
  editorialDate,
  selectedMonth,
  payday = 1,
  onShiftMonth,
  isDark,
  onToggleTheme,
  isPrivacyMode,
  onTogglePrivacy,
  onOpenCommandPalette,
  user,
  syncStatus,
  isOnline,
  onSignInGoogle,
  onSignOutGoogle,
  canInstallPWA,
  onInstallPWA,
  totalBalance = 0,
  currency = 'AMD',
  children,
}: TopNavProps) {
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [notifSettingsOpen, setNotifSettingsOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<NotifFilter>('all');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);
  const accountPopoverRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const unsub = subscribeVoicePlaybackState(setIsSpeaking);
    return unsub;
  }, []);

  useEffect(() => {
    const loadVoices = () => {
      setBrowserVoices(getBrowserSpeechVoices());
    };
    loadVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
      return () => {
        window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
      };
    }
    return undefined;
  }, []);

  const todayCount = todayTasks.length;
  const totalBellCount = notifications.length;
  const { urgentCount, paymentCount, scheduleCount } = useMemo(() => {
    let urgent = 0;
    let payment = 0;
    let schedule = 0;
    for (const n of notifications) {
      if (n.status === 'overdue' || n.status === 'due_now') urgent++;
      if (
        n.kind === 'daily_expense' ||
        n.kind === 'planned_expense' ||
        n.kind === 'monthly_bill' ||
        n.kind === 'budget_alert' ||
        n.kind === 'debt'
      ) {
        payment++;
      } else if (n.kind === 'task' || n.kind === 'note') {
        schedule++;
      }
    }
    return {
      urgentCount: urgent,
      paymentCount: payment,
      scheduleCount: schedule,
    };
  }, [notifications]);

  const { filteredNotifications, dueNotifications, upcomingNotifications } =
    useMemo(() => {
      const filtered = notifications.filter((n) => {
        if (notifFilter === 'payments') {
          return (
            n.kind === 'daily_expense' ||
            n.kind === 'planned_expense' ||
            n.kind === 'monthly_bill' ||
            n.kind === 'budget_alert' ||
            n.kind === 'debt'
          );
        }
        if (notifFilter === 'schedule') {
          return n.kind === 'task' || n.kind === 'note';
        }
        return true;
      });
      return {
        filteredNotifications: filtered,
        dueNotifications: filtered.filter(
          (n) => n.status === 'overdue' || n.status === 'due_now'
        ),
        upcomingNotifications: filtered.filter((n) => n.status === 'upcoming'),
      };
    }, [notifications, notifFilter]);

  const activeMeta =
    NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];

  useEffect(() => {
    if (!remindersOpen && !accountMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        remindersOpen &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setRemindersOpen(false);
      }
      if (
        accountMenuOpen &&
        accountPopoverRef.current &&
        !accountPopoverRef.current.contains(e.target as Node)
      ) {
        setAccountMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRemindersOpen(false);
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [remindersOpen, accountMenuOpen]);

  const syncStatusMeta: Record<
    CloudSyncStatus,
    { label: string; dotClass: string }
  > = {
    idle: {
      label: 'Անցանց պահոց',
      dotClass: 'bg-slate-400',
    },
    syncing: {
      label: 'Համաժամեցում...',
      dotClass: 'bg-[#2563EB] dark:bg-[#60A5FA] animate-pulse',
    },
    synced: {
      label: 'Համաժամեցված',
      dotClass: 'bg-emerald-500',
    },
    offline: {
      label: 'Օֆլայն ռեժիմ',
      dotClass: 'bg-amber-500',
    },
    error: {
      label: 'Սինքի սխալ',
      dotClass: 'bg-rose-500',
    },
  };
  const effectiveSyncStatus: CloudSyncStatus = !isOnline
    ? 'offline'
    : syncStatus;
  const currentSyncMeta = syncStatusMeta[effectiveSyncStatus];
  const userInitial = (
    user?.displayName?.trim()?.[0] ||
    user?.email?.trim()?.[0] ||
    'Օ'
  ).toUpperCase();

  return (
    <>
      {/* Desktop Left Workspace Rail (lg+) */}
      <aside
        aria-label="Աշխատանքային վահանակ"
        className="hidden lg:flex lg:flex-col lg:justify-between lg:w-64 lg:shrink-0 lg:sticky lg:top-0 lg:h-dvh border-r border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0C1220] px-4 py-5"
      >
        <div className="space-y-6">
          <button
            type="button"
            onClick={() => onSelectTab('overview')}
            className="w-full flex items-center gap-3 px-2 py-1 text-left cursor-pointer group"
          >
            <span className="w-9 h-9 rounded-xl bg-[#2563EB] dark:bg-[#3B82F6] text-white dark:text-[#060B16] flex items-center justify-center shadow-xs shrink-0 group-hover:scale-[1.03] transition-transform">
              <Sparkles className="w-4 h-4" strokeWidth={2.2} />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-base font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC] truncate">
                Անձնական Օգնական
              </span>
              <span className="block text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                Ֆինանսներ և օրակարգ
              </span>
            </span>
          </button>

          <nav className="space-y-1" aria-label="Հիմնական նավիգացիա">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const showBadge = item.id === 'planner' && todayCount > 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  aria-label={
                    showBadge
                      ? `${item.label} (${todayCount} այսօրվա անելիք)`
                      : item.label
                  }
                  className={`relative w-full min-h-[46px] px-3 py-2.5 rounded-xl flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer ${
                    isActive
                      ? 'text-[#1D4ED8] dark:text-[#60A5FA]'
                      : 'text-[#475569] dark:text-[#94A3B8] hover:bg-[#F1F5F9] dark:hover:bg-[#162033] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-sidebar-active"
                      transition={
                        prefersReducedMotion
                          ? { duration: 0.01 }
                          : { type: 'spring', stiffness: 420, damping: 34 }
                      }
                      className="absolute inset-0 rounded-xl bg-[#EFF6FF] dark:bg-[#172554]/65 border border-[#BFDBFE]/60 dark:border-[#1E3A8A]/60"
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-3 min-w-0">
                    <Icon
                      className="w-[18px] h-[18px] shrink-0"
                      strokeWidth={isActive ? 2.2 : 1.85}
                    />
                    <span className="min-w-0">
                      <span
                        className={`block text-sm truncate ${
                          isActive ? 'font-semibold' : 'font-medium'
                        }`}
                      >
                        {item.label}
                      </span>
                    </span>
                  </span>
                  {showBadge && (
                    <span className="relative z-10 min-w-[20px] h-[20px] px-1.5 rounded-full bg-[#2563EB] dark:bg-[#3B82F6] text-white dark:text-[#060B16] text-[11px] font-mono font-bold tabular-nums inline-flex items-center justify-center leading-none shrink-0">
                      {todayCount > 99 ? '99+' : todayCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Bottom Controls */}
        <div className="space-y-2.5 pt-4 border-t border-[#E2E8F0] dark:border-[#1E293B]">
          {user ? (
            <div className="p-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'Օգտատեր'}
                      className="w-8 h-8 rounded-full object-cover shrink-0 border border-[#CBD5E1] dark:border-[#334155]"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-[#2563EB]/15 text-[#2563EB] dark:text-[#60A5FA] text-xs font-bold flex items-center justify-center shrink-0">
                      {userInitial}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                      {user.displayName || user.email || 'Google հաշիվ'}
                    </p>
                    <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1.5 truncate">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${currentSyncMeta.dotClass}`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{currentSyncMeta.label}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onSignOutGoogle}
                  title="Դուրս գալ"
                  aria-label="Դուրս գալ Google հաշվից"
                  className="min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center text-[#64748B] dark:text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={onSignInGoogle}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-[#F8FAFC] dark:bg-[#111A2E] text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] flex items-center justify-between hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer"
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  <Cloud className="w-4 h-4 text-[#2563EB] dark:text-[#60A5FA] shrink-0" />
                  <span className="truncate">Մուտք Google-ով</span>
                </span>
                <span className="text-[11px] text-[#2563EB] dark:text-[#60A5FA] shrink-0">
                  Սինք
                </span>
              </button>
              {!isOnline && (
                <p className="px-1 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <CloudOff className="w-3.5 h-3.5 shrink-0" />
                  <span>Օֆլայն · տվյալները պահվում են տեղում</span>
                </p>
              )}
            </div>
          )}

          {canInstallPWA && (
            <button
              type="button"
              onClick={onInstallPWA}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[#BFDBFE] dark:border-[#1E3A8A]/70 bg-[#EFF6FF]/70 dark:bg-[#172554]/45 text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA] flex items-center justify-between hover:bg-[#EFF6FF] dark:hover:bg-[#172554]/70 transition-colors cursor-pointer"
            >
              <span className="inline-flex items-center gap-2 min-w-0">
                <Download className="w-4 h-4 shrink-0" />
                <span className="truncate">Տեղադրել հավելվածը</span>
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenCommandPalette}
            aria-label="Արագ մուտք և որոնում (Ctrl+K)"
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] text-xs font-medium text-[#334155] dark:text-[#CBD5E1] flex items-center justify-between hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer"
          >
            <span className="inline-flex items-center gap-2 min-w-0">
              <Search className="w-4 h-4 text-[#2563EB] dark:text-[#60A5FA] shrink-0" />
              <span className="truncate">Արագ հրամաններ</span>
            </span>
            <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white dark:bg-[#0B1120] border border-[#E2E8F0] dark:border-[#26334D] text-[10px] font-mono text-[#64748B] dark:text-[#94A3B8]">
              <Command className="w-2.5 h-2.5" />K
            </kbd>
          </button>

          <button
            type="button"
            onClick={onTogglePrivacy}
            aria-pressed={isPrivacyMode}
            aria-label={isPrivacyMode ? 'Ցույց տալ գումարները' : 'Թաքցնել գումարները'}
            className={`w-full min-h-[40px] px-3 py-2 rounded-xl border text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
              isPrivacyMode
                ? 'border-[#2563EB]/50 bg-[#EFF6FF] dark:bg-[#172554]/50 text-[#1D4ED8] dark:text-[#60A5FA]'
                : 'border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] text-[#334155] dark:text-[#CBD5E1] hover:border-[#2563EB] dark:hover:border-[#3B82F6]'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {isPrivacyMode ? (
                <EyeOff className="w-4 h-4 shrink-0" />
              ) : (
                <Eye className="w-4 h-4 text-[#64748B] dark:text-[#94A3B8] shrink-0" />
              )}
              <span>{isPrivacyMode ? 'Գաղտնի ռեժիմ (Միացված)' : 'Թաքցնել գումարները'}</span>
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Անցնել լուսավոր ռեժիմի' : 'Անցնել մութ ռեժիմի'}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] text-xs font-medium text-[#334155] dark:text-[#CBD5E1] flex items-center justify-between hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer"
          >
            <span className="inline-flex items-center gap-2">
              {isDark ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-[#2563EB]" />
              )}
              <span>{isDark ? 'Լուսավոր ռեժիմ' : 'Մութ ռեժիմ'}</span>
            </span>
            <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              Փոխել
            </span>
          </button>
        </div>
      </aside>

      {/* Top Contextual Header + Main Content Column */}
      <div className="flex-1 min-w-0 flex flex-col pb-24 md:pb-12">
        <header className="h-16 border-b border-[#E2E8F0] dark:border-[#1E293B] bg-white/85 dark:bg-[#0C1220]/85 backdrop-blur-md sticky top-0 z-30">
          <div className="max-w-6xl mx-auto h-full px-3.5 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
            {/* Left: Mobile/Tablet Brand OR Desktop Active Context */}
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => onSelectTab('overview')}
                className="lg:hidden flex items-center gap-2.5 min-w-0 cursor-pointer"
              >
                <span className="w-8 h-8 rounded-xl bg-[#2563EB] dark:bg-[#3B82F6] text-white dark:text-[#060B16] flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" strokeWidth={2.2} />
                </span>
                <span className="font-display text-base font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC] truncate">
                  Անձնական Օգնական
                </span>
              </button>

              <div className="hidden lg:block min-w-0">
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] flex items-center gap-2 truncate">
                  <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                    {activeMeta.label}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{editorialDate}</span>
                </p>
              </div>
            </div>

            {/* Persistent Pinned Live Balance Header Pill (Always in front of user's eyes) */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSelectTab('finance')}
                title="Անցնել Ֆինանսներ · Ընդհանուր մնացորդ"
                aria-label={`Ընդհանուր մնացորդ՝ ${formatMoney(totalBalance, currency)}`}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-[#2563EB]/30 dark:border-[#3B82F6]/40 bg-[#EFF6FF] dark:bg-[#172554]/60 text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA] hover:border-[#2563EB] transition-all cursor-pointer shadow-xs"
              >
                <Wallet className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline text-[#475569] dark:text-[#94A3B8] font-medium">Բալանս՝</span>
                <span className="pa-sensitive font-mono font-bold tabular-nums">
                  {formatMoney(totalBalance, currency)}
                </span>
              </button>
            </div>

            {/* Tablet Horizontal Navigation (md to lg) */}
            <nav
              className="hidden md:flex lg:hidden items-center gap-1 p-1 rounded-xl surface-subtle"
              aria-label="Հիմնական նավիգացիա"
            >
              {NAV_ITEMS.map((item) => {
                const isActive = activeTab === item.id;
                const showBadge = item.id === 'planner' && todayCount > 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectTab(item.id)}
                    aria-label={
                      showBadge
                        ? `${item.label} (${todayCount} այսօրվա անելիք)`
                        : item.label
                    }
                    className={`relative min-h-[36px] px-3 py-1 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'text-[#2563EB] dark:text-[#60A5FA] font-semibold'
                        : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="nav-tablet-active"
                        transition={
                          prefersReducedMotion
                            ? { duration: 0.01 }
                            : { type: 'spring', stiffness: 420, damping: 34 }
                        }
                        className="absolute inset-0 rounded-lg bg-white dark:bg-[#0F172A] shadow-xs"
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative z-10">{item.label}</span>
                    {showBadge && (
                      <span className="relative z-10 min-w-[18px] h-[18px] px-1 rounded-full bg-[#2563EB] dark:bg-[#3B82F6] text-white dark:text-[#060B16] text-[10px] font-mono font-bold tabular-nums inline-flex items-center justify-center leading-none">
                        {todayCount > 99 ? '99+' : todayCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Right: Month Switcher (Desktop), Reminder Bell, Primary CTA */}
            <div className="flex items-center gap-2 shrink-0">
              {(activeTab === 'overview' || activeTab === 'finance') && (
                <div className="hidden lg:inline-flex items-center border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl bg-[#F8FAFC] dark:bg-[#111A2E]">
                  <button
                    type="button"
                    onClick={() => onShiftMonth(-1)}
                    aria-label="Նախորդ ամիս"
                    className="min-h-[38px] min-w-[36px] flex items-center justify-center text-[#64748B] dark:text-[#94A3B8] hover:bg-[#E2E8F0]/60 dark:hover:bg-[#1E293B] rounded-l-xl transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-3 text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums whitespace-nowrap">
                    {formatCycleLabel(selectedMonth, payday)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onShiftMonth(1)}
                    aria-label="Հաջորդ ամիս"
                    className="min-h-[38px] min-w-[36px] flex items-center justify-center text-[#64748B] dark:text-[#94A3B8] hover:bg-[#E2E8F0]/60 dark:hover:bg-[#1E293B] rounded-r-xl transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={onOpenCommandPalette}
                title="Արագ որոնում և հրամաններ (Ctrl+K)"
                aria-label="Արագ որոնում և հրամաններ"
                className="min-h-[40px] min-w-[40px] lg:px-3 flex items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer"
              >
                <Search className="w-4 h-4" />
                <span className="hidden xl:inline text-xs font-medium">Որոնում</span>
                <kbd className="hidden xl:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white dark:bg-[#0B1120] border border-[#E2E8F0] dark:border-[#26334D] text-[10px] font-mono text-[#64748B] dark:text-[#94A3B8]">
                  ⌘K
                </kbd>
              </button>

              <button
                type="button"
                onClick={onTogglePrivacy}
                aria-pressed={isPrivacyMode}
                title={isPrivacyMode ? 'Ցույց տալ գումարները (Ctrl+Shift+H)' : 'Թաքցնել գումարները (Ctrl+Shift+H)'}
                aria-label={isPrivacyMode ? 'Ցույց տալ գումարները' : 'Թաքցնել գումարները'}
                className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                  isPrivacyMode
                    ? 'border-[#2563EB]/60 bg-[#EFF6FF] dark:bg-[#172554]/60 text-[#1D4ED8] dark:text-[#60A5FA]'
                    : 'border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB] dark:hover:border-[#3B82F6]'
                }`}
              >
                {isPrivacyMode ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>

              {!isOnline && (
                <span
                  title="Օֆլայն ռեժիմ"
                  aria-label="Օֆլայն ռեժիմ"
                  className="lg:hidden min-h-[40px] min-w-[36px] px-2 flex items-center justify-center rounded-xl border border-amber-300/60 dark:border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                >
                  <CloudOff className="w-4 h-4" />
                </span>
              )}

              {canInstallPWA && (
                <button
                  type="button"
                  onClick={onInstallPWA}
                  title="Տեղադրել հավելվածը"
                  aria-label="Տեղադրել հավելվածը"
                  className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[#BFDBFE] dark:border-[#1E3A8A] bg-[#EFF6FF] dark:bg-[#172554]/50 text-[#2563EB] dark:text-[#60A5FA] transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                </button>
              )}

              <div className="relative lg:hidden" ref={accountPopoverRef}>
                {user ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setAccountMenuOpen((prev) => !prev)}
                      aria-expanded={accountMenuOpen}
                      aria-label="Ամպային հաշիվ և համաժամեցում"
                      className="relative min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer"
                    >
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName || 'Օգտատեր'}
                          className="w-6 h-6 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="w-6 h-6 rounded-full bg-[#2563EB]/15 text-[#2563EB] dark:text-[#60A5FA] text-[11px] font-bold flex items-center justify-center">
                          {userInitial}
                        </span>
                      )}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-[#0C1220] ${currentSyncMeta.dotClass}`}
                        aria-hidden="true"
                      />
                    </button>

                    <AnimatePresence>
                      {accountMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 4, scale: 0.98 }}
                          transition={{ duration: 0.14 }}
                          role="dialog"
                          aria-label="Google հաշիվ"
                          className="absolute right-0 mt-2 w-60 rounded-2xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] shadow-2xl z-50 p-3 space-y-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                              {user.displayName || 'Google հաշիվ'}
                            </p>
                            {user.email && (
                              <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                                {user.email}
                              </p>
                            )}
                            <p className="mt-1 text-[11px] text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1.5">
                              {effectiveSyncStatus === 'syncing' ? (
                                <RefreshCw className="w-3 h-3 animate-spin text-[#2563EB] dark:text-[#60A5FA]" />
                              ) : (
                                <span
                                  className={`w-2 h-2 rounded-full ${currentSyncMeta.dotClass}`}
                                  aria-hidden="true"
                                />
                              )}
                              <span>{currentSyncMeta.label}</span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setAccountMenuOpen(false);
                              onSignOutGoogle();
                            }}
                            className="w-full min-h-[34px] px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-500/30 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Դուրս գալ հաշվից</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={onSignInGoogle}
                    title="Մուտք Google-ով"
                    aria-label="Մուտք Google-ով՝ տվյալների սինքի համար"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] text-[#2563EB] dark:text-[#60A5FA] hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer"
                  >
                    <Cloud className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={isDark ? 'Անցնել լուսավոր ռեժիմի' : 'Անցնել մութ ռեժիմի'}
                className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB] dark:hover:border-[#3B82F6] transition-colors cursor-pointer"
              >
                {isDark ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-[#2563EB]" />
                )}
              </button>

              {/* Pro Notification Center Bell & Popover */}
              <div className="relative" ref={popoverRef}>
                <button
                  type="button"
                  onClick={() => setRemindersOpen((prev) => !prev)}
                  aria-expanded={remindersOpen}
                  aria-haspopup="dialog"
                  aria-label={
                    totalBellCount > 0
                      ? `Ծանուցումների կենտրոն (${totalBellCount} ակտիվ)`
                      : 'Ծանուցումների կենտրոն'
                  }
                  className={`relative min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                    remindersOpen
                      ? 'border-[#2563EB] dark:border-[#3B82F6] bg-[#EFF6FF] dark:bg-[#172554]/50 text-[#2563EB] dark:text-[#60A5FA]'
                      : urgentCount > 0
                        ? 'border-rose-300 dark:border-rose-500/40 bg-rose-500/5 text-rose-600 dark:text-rose-400 hover:border-rose-400'
                        : 'border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111A2E] text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB] dark:hover:border-[#3B82F6]'
                  }`}
                >
                  <Bell className="w-4 h-4" />
                  {totalBellCount > 0 && (
                    <span
                      className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-mono font-bold tabular-nums flex items-center justify-center leading-none shadow-xs ${
                        urgentCount > 0
                          ? 'bg-rose-600 text-white'
                          : 'bg-[#2563EB] dark:bg-[#3B82F6] text-white dark:text-[#060B16]'
                      }`}
                    >
                      {totalBellCount > 99 ? '99+' : totalBellCount}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {remindersOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.98 }}
                      transition={{ duration: 0.14 }}
                      role="dialog"
                      aria-label="Պրո ծանուցումների կենտրոն"
                      className="fixed inset-x-3.5 top-[4.25rem] max-h-[calc(100dvh-5.5rem)] sm:max-h-none sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[26rem] rounded-2xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] shadow-2xl z-50 overflow-hidden flex flex-col"
                    >
                      {/* Header + Sound / Voice / Browser Notification Toggles */}
                      <div className="px-4 py-3 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-display text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                              {notifSettingsOpen ? 'Ձայն և ձայնային ծանուցումներ' : 'Պրո ծանուցումներ'}
                            </span>
                            {!notifSettingsOpen && urgentCount > 0 && (
                              <span className="text-[10px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded-md bg-rose-500/12 text-rose-600 dark:text-rose-400">
                                {urgentCount} հասունացած
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                            {notifSettingsOpen
                              ? 'Կարգավորեք հնչյունները և խոսքը'
                              : `${totalBellCount} ակտիվ հիշեցում`}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={onToggleSound}
                            title={
                              notificationSettings.soundEnabled
                                ? 'Ձայնային ազդանշանը միացված է'
                                : 'Ձայնային ազդանշանը անջատված է'
                            }
                            aria-label={
                              notificationSettings.soundEnabled
                                ? 'Անջատել ծանուցման ձայնը'
                                : 'Միացնել ծանուցման ձայնը'
                            }
                            className={`min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center border transition-colors cursor-pointer ${
                              notificationSettings.soundEnabled
                                ? 'border-[#BFDBFE] dark:border-[#2563EB]/40 bg-[#EFF6FF] dark:bg-[#172554]/60 text-[#2563EB] dark:text-[#60A5FA]'
                                : 'border-[#E2E8F0] dark:border-[#1E293B] text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                            }`}
                          >
                            {notificationSettings.soundEnabled ? (
                              <Volume2 className="w-3.5 h-3.5" />
                            ) : (
                              <VolumeX className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              onUpdateNotificationSettings({
                                voiceEnabled: !notificationSettings.voiceEnabled,
                              })
                            }
                            title={
                              notificationSettings.voiceEnabled
                                ? 'Ձայնային ընթերցումը միացված է'
                                : 'Ձայնային ընթերցումը անջատված է'
                            }
                            aria-label={
                              notificationSettings.voiceEnabled
                                ? 'Անջատել ձայնային ընթերցումը'
                                : 'Միացնել ձայնային ընթերցումը'
                            }
                            className={`min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center border transition-colors cursor-pointer ${
                              notificationSettings.voiceEnabled
                                ? 'border-violet-300 dark:border-violet-500/40 bg-violet-500/12 text-violet-600 dark:text-violet-400'
                                : 'border-[#E2E8F0] dark:border-[#1E293B] text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                            }`}
                          >
                            {notificationSettings.voiceEnabled ? (
                              <Mic className="w-3.5 h-3.5" />
                            ) : (
                              <MicOff className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {canUseBrowserNotifs && (
                            <button
                              type="button"
                              onClick={onToggleBrowserNotifications}
                              title={
                                notificationSettings.browserNotifications
                                  ? 'Բրաուզերի ծանուցումները միացված են'
                                  : 'Միացնել բրաուզերի ծանուցումները'
                              }
                              aria-label="Միացնել կամ անջատել բրաուզերի ծանուցումները"
                              className={`min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center border transition-colors cursor-pointer ${
                                notificationSettings.browserNotifications
                                  ? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'border-[#E2E8F0] dark:border-[#1E293B] text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                              }`}
                            >
                              <BellRing className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setNotifSettingsOpen((prev) => !prev)}
                            title="Ձայնի և խոսքի կարգավորումներ"
                            aria-label="Ձայնի և խոսքի կարգավորումներ"
                            aria-expanded={notifSettingsOpen}
                            className={`min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center border transition-colors cursor-pointer ${
                              notifSettingsOpen
                                ? 'border-[#2563EB] dark:border-[#3B82F6] bg-[#2563EB] text-white dark:bg-[#3B82F6] dark:text-[#060B16]'
                                : 'border-[#E2E8F0] dark:border-[#1E293B] text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                            }`}
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {notifSettingsOpen ? (
                        <div className="max-h-[25rem] overflow-y-auto scroll-container p-4 space-y-4">
                          {/* Section 1: Sound Alerts & Presets */}
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] inline-flex items-center gap-1.5">
                                <Volume2 className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                                <span>Հնչյունային ազդանշան</span>
                              </span>
                              <button
                                type="button"
                                onClick={onToggleSound}
                                className={`min-h-[26px] px-2.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                                  notificationSettings.soundEnabled
                                    ? 'border-[#2563EB]/40 bg-[#EFF6FF] dark:bg-[#172554]/60 text-[#2563EB] dark:text-[#60A5FA]'
                                    : 'border-[#E2E8F0] dark:border-[#1E293B] text-[#64748B] dark:text-[#94A3B8]'
                                }`}
                              >
                                {notificationSettings.soundEnabled ? 'Միացված է' : 'Անջատված է'}
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-1.5">
                              {NOTIFICATION_SOUND_PRESETS.map((preset) => {
                                const selected =
                                  (notificationSettings.soundPreset ?? 'chime') === preset.id;
                                return (
                                  <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => {
                                      onUpdateNotificationSettings({
                                        soundEnabled: true,
                                        soundPreset: preset.id as NotificationSoundPreset,
                                      });
                                      playNotificationChime({
                                        preset: preset.id,
                                        volume: notificationSettings.soundVolume ?? 0.75,
                                      });
                                    }}
                                    className={`p-2 rounded-xl border text-left transition-colors cursor-pointer ${
                                      selected
                                        ? 'border-[#2563EB] dark:border-[#3B82F6] bg-[#EFF6FF]/80 dark:bg-[#172554]/50'
                                        : 'border-[#E2E8F0] dark:border-[#1E293B] hover:border-[#94A3B8] dark:hover:border-[#334155]'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span
                                        className={`text-[11px] font-semibold truncate ${
                                          selected
                                            ? 'text-[#1D4ED8] dark:text-[#60A5FA]'
                                            : 'text-[#0F172A] dark:text-[#F8FAFC]'
                                        }`}
                                      >
                                        {preset.label}
                                      </span>
                                      <Play className="w-2.5 h-2.5 text-[#64748B] dark:text-[#94A3B8] shrink-0" />
                                    </div>
                                    <p className="text-[10px] text-[#64748B] dark:text-[#94A3B8] truncate mt-0.5">
                                      {preset.description}
                                    </p>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Volume + Urgent Tone */}
                            <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] p-2.5 space-y-2">
                              <div className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="text-[#475569] dark:text-[#CBD5E1] font-medium">
                                  Ձայնի բարձրություն
                                </span>
                                <span className="font-mono font-semibold tabular-nums text-[#0F172A] dark:text-[#F8FAFC]">
                                  {Math.round((notificationSettings.soundVolume ?? 0.75) * 100)}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min={10}
                                max={100}
                                step={5}
                                value={Math.round((notificationSettings.soundVolume ?? 0.75) * 100)}
                                onChange={(e) =>
                                  onUpdateNotificationSettings({
                                    soundVolume: Number(e.target.value) / 100,
                                  })
                                }
                                aria-label="Ծանուցման ձայնի բարձրություն"
                                className="w-full accent-[#2563EB] cursor-pointer"
                              />
                              <div className="flex items-center justify-between gap-2 pt-1">
                                <label className="flex items-center gap-2 text-[11px] text-[#475569] dark:text-[#CBD5E1] cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={notificationSettings.urgentSoundEnabled !== false}
                                    onChange={(e) =>
                                      onUpdateNotificationSettings({
                                        urgentSoundEnabled: e.target.checked,
                                      })
                                    }
                                    className="rounded accent-[#2563EB]"
                                  />
                                  <span>Հատուկ տոն ուշացածների համար</span>
                                </label>
                                <button
                                  type="button"
                                  onClick={() =>
                                    playNotificationChime({
                                      preset: notificationSettings.soundPreset ?? 'chime',
                                      volume: notificationSettings.soundVolume ?? 0.75,
                                      urgent: notificationSettings.urgentSoundEnabled !== false,
                                    })
                                  }
                                  className="text-[11px] font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer shrink-0"
                                >
                                  Փորձել
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Section 2: Spoken Voice Alerts */}
                          <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] inline-flex items-center gap-1.5">
                                <AudioLines className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                                <span>Ձայնային ընթերցում (Խոսք)</span>
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateNotificationSettings({
                                    voiceEnabled: !notificationSettings.voiceEnabled,
                                  })
                                }
                                className={`min-h-[26px] px-2.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                                  notificationSettings.voiceEnabled
                                    ? 'border-violet-400/50 bg-violet-500/12 text-violet-700 dark:text-violet-300'
                                    : 'border-[#E2E8F0] dark:border-[#1E293B] text-[#64748B] dark:text-[#94A3B8]'
                                }`}
                              >
                                {notificationSettings.voiceEnabled ? 'Միացված է' : 'Անջատված է'}
                              </button>
                            </div>

                            {/* Voice Engine Mode */}
                            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl surface-subtle">
                              {(
                                [
                                  { id: 'auto', label: 'Ավտոմատ' },
                                  { id: 'gemini', label: 'Բնական AI' },
                                  { id: 'browser', label: 'Համակարգ' },
                                ] as Array<{ id: NotificationVoiceMode; label: string }>
                              ).map((mode) => {
                                const active =
                                  (notificationSettings.voiceMode ?? 'auto') === mode.id;
                                return (
                                  <button
                                    key={mode.id}
                                    type="button"
                                    onClick={() =>
                                      onUpdateNotificationSettings({ voiceMode: mode.id })
                                    }
                                    className={`min-h-[28px] px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                                      active
                                        ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                                        : 'text-[#64748B] dark:text-[#94A3B8]'
                                    }`}
                                  >
                                    {mode.label}
                                  </button>
                                );
                              })}
                            </div>

                            {/* AI Voice Personas */}
                            {(notificationSettings.voiceMode ?? 'auto') !== 'browser' && (
                              <div className="space-y-1.5">
                                <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                                  Հայերեն ձայնի տոնայնություն
                                </p>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {GEMINI_VOICE_PRESETS.map((voice) => {
                                    const selected =
                                      (notificationSettings.voicePreset ?? 'Kore') === voice.id;
                                    return (
                                      <button
                                        key={voice.id}
                                        type="button"
                                        onClick={() => {
                                          const nextSettings: NotificationSettings = {
                                            ...notificationSettings,
                                            voiceEnabled: true,
                                            voicePreset: voice.id as GeminiVoicePreset,
                                          };
                                          onUpdateNotificationSettings({
                                            voiceEnabled: true,
                                            voicePreset: voice.id as GeminiVoicePreset,
                                          });
                                          void speakNotificationText(
                                            `Բարև, սա ${voice.label} ձայնն է ծանուցումների համար։`,
                                            nextSettings
                                          );
                                        }}
                                        className={`p-2 rounded-xl border text-left transition-colors cursor-pointer ${
                                          selected
                                            ? 'border-violet-500/70 bg-violet-500/10'
                                            : 'border-[#E2E8F0] dark:border-[#1E293B] hover:border-[#94A3B8] dark:hover:border-[#334155]'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-1">
                                          <span
                                            className={`text-[11px] font-semibold ${
                                              selected
                                                ? 'text-violet-700 dark:text-violet-300'
                                                : 'text-[#0F172A] dark:text-[#F8FAFC]'
                                            }`}
                                          >
                                            {voice.label}
                                          </span>
                                          <Play className="w-2.5 h-2.5 text-[#64748B] dark:text-[#94A3B8]" />
                                        </div>
                                        <p className="text-[10px] text-[#64748B] dark:text-[#94A3B8] truncate mt-0.5">
                                          {voice.description}
                                        </p>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* System SpeechSynthesis Voice Fallback Selector */}
                            {browserVoices.length > 0 && (
                              <div className="space-y-1">
                                <label
                                  htmlFor="pa-browser-voice-select"
                                  className="block text-[11px] text-[#64748B] dark:text-[#94A3B8]"
                                >
                                  Սարքի ներկառուցված ձայն (օֆլայն պահուստ)
                                </label>
                                <select
                                  id="pa-browser-voice-select"
                                  value={notificationSettings.browserVoiceURI ?? ''}
                                  onChange={(e) =>
                                    onUpdateNotificationSettings({
                                      browserVoiceURI: e.target.value,
                                    })
                                  }
                                  className="w-full min-h-[34px] px-2.5 py-1 rounded-xl input-field text-[11px]"
                                >
                                  <option value="">Ավտոմատ (լավագույն հասանելի)</option>
                                  {browserVoices.slice(0, 30).map((v) => (
                                    <option key={v.voiceURI} value={v.voiceURI}>
                                      {v.name} ({v.lang})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {/* Speech Rate + Test Voice Button */}
                            <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                              <div className="inline-flex items-center gap-1 p-0.5 rounded-lg surface-subtle">
                                {[0.85, 1, 1.15, 1.3].map((rate) => {
                                  const active =
                                    Math.abs((notificationSettings.voiceRate ?? 1) - rate) < 0.03;
                                  return (
                                    <button
                                      key={rate}
                                      type="button"
                                      onClick={() =>
                                        onUpdateNotificationSettings({ voiceRate: rate })
                                      }
                                      className={`px-2 py-1 rounded-md text-[10px] font-mono font-semibold tabular-nums cursor-pointer transition-colors ${
                                        active
                                          ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] shadow-xs'
                                          : 'text-[#64748B] dark:text-[#94A3B8]'
                                      }`}
                                    >
                                      {rate}x
                                    </button>
                                  );
                                })}
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  if (isSpeaking) {
                                    stopNotificationVoice();
                                  } else {
                                    void speakNotificationText(
                                      'Հիշեցում․ Մթերային գնումներ, 15,000 դրամ, ժամը 18:30-ին։',
                                      notificationSettings
                                    );
                                  }
                                }}
                                className={`min-h-[30px] px-3 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                                  isSpeaking
                                    ? 'bg-rose-500/12 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-500/40'
                                    : 'bg-violet-600 hover:bg-violet-700 text-white'
                                }`}
                              >
                                {isSpeaking ? (
                                  <>
                                    <Square className="w-3 h-3 fill-current" />
                                    <span>Կանգնեցնել</span>
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-3 h-3" />
                                    <span>Փորձարկել խոսքը</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Section 3: Quiet Hours */}
                          <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] inline-flex items-center gap-1.5">
                                <Moon className="w-3.5 h-3.5 text-[#64748B] dark:text-[#94A3B8]" />
                                <span>Լուռ ժամեր</span>
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateNotificationSettings({
                                    quietHoursEnabled: !notificationSettings.quietHoursEnabled,
                                  })
                                }
                                className={`min-h-[26px] px-2.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                                  notificationSettings.quietHoursEnabled
                                    ? 'border-emerald-400/50 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                                    : 'border-[#E2E8F0] dark:border-[#1E293B] text-[#64748B] dark:text-[#94A3B8]'
                                }`}
                              >
                                {notificationSettings.quietHoursEnabled ? 'Միացված է' : 'Անջատված է'}
                              </button>
                            </div>

                            {notificationSettings.quietHoursEnabled && (
                              <div className="grid grid-cols-2 gap-2">
                                <label className="text-[10px] text-[#64748B] dark:text-[#94A3B8] space-y-1">
                                  <span>Սկիզբ</span>
                                  <input
                                    type="time"
                                    value={notificationSettings.quietHoursStart ?? '22:30'}
                                    onChange={(e) =>
                                      onUpdateNotificationSettings({
                                        quietHoursStart: e.target.value,
                                      })
                                    }
                                    className="w-full min-h-[32px] px-2 py-1 rounded-lg input-field font-mono text-xs tabular-nums"
                                  />
                                </label>
                                <label className="text-[10px] text-[#64748B] dark:text-[#94A3B8] space-y-1">
                                  <span>Ավարտ</span>
                                  <input
                                    type="time"
                                    value={notificationSettings.quietHoursEnd ?? '08:00'}
                                    onChange={(e) =>
                                      onUpdateNotificationSettings({
                                        quietHoursEnd: e.target.value,
                                      })
                                    }
                                    className="w-full min-h-[32px] px-2 py-1 rounded-lg input-field font-mono text-xs tabular-nums"
                                  />
                                </label>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                      {/* Filter Tabs */}
                      <div className="px-3 py-2 border-b border-[#F1F5F9] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] flex items-center gap-1">
                        {[
                          {
                            id: 'all' as const,
                            label: `Բոլորը (${totalBellCount})`,
                          },
                          {
                            id: 'payments' as const,
                            label: `Վճարումներ (${paymentCount})`,
                          },
                          {
                            id: 'schedule' as const,
                            label: `Օրակարգ (${scheduleCount})`,
                          },
                        ].map((tab) => {
                          const active = notifFilter === tab.id;
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => setNotifFilter(tab.id)}
                              className={`flex-1 min-h-[30px] px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                                active
                                  ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] shadow-xs font-semibold'
                                  : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                              }`}
                            >
                              {tab.label}
                            </button>
                          );
                        })}
                      </div>

                      {filteredNotifications.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                          <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                            Ընտրված բաժնում ակտիվ հիշեցումներ չկան։
                          </p>
                        </div>
                      ) : (
                        <div className="max-h-[22rem] overflow-y-auto scroll-container">
                          {[
                            {
                              title: 'Պահանջում է հաստատում',
                              list: dueNotifications,
                              highlight: true,
                            },
                            {
                              title: 'Առաջիկա և օրակարգ',
                              list: upcomingNotifications,
                              highlight: false,
                            },
                          ].map(
                            (group) =>
                              group.list.length > 0 && (
                                <div key={group.title}>
                                  <div className="px-4 py-1.5 bg-[#F8FAFC] dark:bg-[#0B1120]/80 border-y border-[#F1F5F9] dark:border-[#1E293B] flex items-center justify-between">
                                    <span
                                      className={`text-[10px] font-semibold uppercase tracking-wider ${
                                        group.highlight
                                          ? 'text-rose-600 dark:text-rose-400'
                                          : 'text-[#64748B] dark:text-[#94A3B8]'
                                      }`}
                                    >
                                      {group.title}
                                    </span>
                                    <span className="text-[10px] font-mono tabular-nums text-[#94A3B8]">
                                      {group.list.length}
                                    </span>
                                  </div>
                                  <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
                                    {group.list.map((item) => {
                                      const isExpense =
                                        item.kind === 'daily_expense' ||
                                        item.kind === 'planned_expense' ||
                                        item.kind === 'monthly_bill';
                                      const isOverdue = item.status === 'overdue';
                                      const isDueNow = item.status === 'due_now';

                                      if (isExpense) {
                                        const Icon =
                                          item.kind === 'daily_expense'
                                            ? Repeat
                                            : item.kind === 'planned_expense'
                                              ? CalendarClock
                                              : BellRing;
                                        return (
                                          <div
                                            key={item.id}
                                            className={`px-4 py-3 space-y-2 transition-colors ${
                                              isOverdue
                                                ? 'bg-rose-500/[0.04]'
                                                : isDueNow
                                                  ? 'bg-[#EFF6FF]/60 dark:bg-[#172554]/25'
                                                  : 'hover:bg-[#F8FAFC] dark:hover:bg-[#162033]'
                                            }`}
                                          >
                                            <div className="flex items-start justify-between gap-2.5">
                                              <div className="flex items-start gap-2.5 min-w-0">
                                                <span
                                                  className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                                    isOverdue
                                                      ? 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
                                                      : isDueNow
                                                        ? 'bg-[#2563EB]/12 text-[#2563EB] dark:text-[#60A5FA]'
                                                        : 'bg-[#F1F5F9] dark:bg-[#1E293B] text-[#64748B] dark:text-[#94A3B8]'
                                                  }`}
                                                >
                                                  <Icon className="w-3.5 h-3.5" />
                                                </span>
                                                <div className="min-w-0">
                                                  <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                                                    {item.title}
                                                  </p>
                                                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate tabular-nums">
                                                    {item.subtitle}
                                                  </p>
                                                </div>
                                              </div>
                                              {item.amount !== undefined && (
                                                <span className="text-xs font-mono font-bold tabular-nums text-[#0F172A] dark:text-[#F8FAFC] shrink-0">
                                                  {formatMoney(item.amount)}
                                                </span>
                                              )}
                                            </div>

                                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                              <button
                                                type="button"
                                                onClick={() => onSpeakNotif(item)}
                                                title="Լսել ձայնային ընթերցմամբ"
                                                aria-label={`Լսել «${item.title}» ծանուցումը`}
                                                className="min-h-[28px] min-w-[28px] px-1.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-[#26334D] text-[#64748B] dark:text-[#94A3B8] hover:text-[#2563EB] dark:hover:text-[#60A5FA] hover:border-[#2563EB] inline-flex items-center justify-center cursor-pointer transition-colors mr-auto"
                                              >
                                                <Volume2 className="w-3 h-3" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  onSnoozeNotif(item.id, 15)
                                                }
                                                className="min-h-[28px] px-2 py-1 rounded-lg border border-[#E2E8F0] dark:border-[#26334D] text-[11px] font-medium text-[#475569] dark:text-[#CBD5E1] hover:border-[#2563EB] dark:hover:border-[#3B82F6] inline-flex items-center gap-1 cursor-pointer transition-colors"
                                              >
                                                <Clock className="w-3 h-3" />
                                                <span>15ր</span>
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  onSkipExpenseNotif(item)
                                                }
                                                className="min-h-[28px] px-2 py-1 rounded-lg border border-[#E2E8F0] dark:border-[#26334D] text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 inline-flex items-center gap-1 cursor-pointer transition-colors"
                                              >
                                                <SkipForward className="w-3 h-3" />
                                                <span>Բաց թողնել</span>
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  onConfirmExpenseNotif(item)
                                                }
                                                className="min-h-[28px] px-2.5 py-1 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] dark:bg-[#3B82F6] dark:hover:bg-[#60A5FA] text-white dark:text-[#060B16] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                                              >
                                                <Check
                                                  className="w-3 h-3"
                                                  strokeWidth={2.5}
                                                />
                                                <span>Հաստատել</span>
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      }

                                      if (item.kind === 'task' && item.taskId) {
                                        return (
                                          <div
                                            key={item.id}
                                            className="px-4 py-2.5 flex items-start gap-2.5 hover:bg-[#F8FAFC] dark:hover:bg-[#162033] transition-colors"
                                          >
                                            <button
                                              type="button"
                                              onClick={() =>
                                                onToggleTask(item.taskId!)
                                              }
                                              aria-label={`Նշել «${item.title}» կատարված`}
                                              className="mt-0.5 w-4 h-4 rounded-md border border-[#CBD5E1] dark:border-[#334155] hover:border-[#2563EB] dark:hover:border-[#3B82F6] flex items-center justify-center shrink-0 cursor-pointer transition-colors group"
                                            >
                                              <Check
                                                className="w-2.5 h-2.5 opacity-0 group-hover:opacity-70 text-[#2563EB] dark:text-[#60A5FA]"
                                                strokeWidth={2.7}
                                              />
                                            </button>
                                            <div className="min-w-0 flex-1">
                                              <p className="text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] leading-snug">
                                                {item.title}
                                              </p>
                                              <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5 tabular-nums">
                                                {item.subtitle}
                                              </p>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => onSpeakNotif(item)}
                                              title="Լսել ձայնային ընթերցմամբ"
                                              aria-label={`Լսել «${item.title}» անելիքը`}
                                              className="min-h-[26px] min-w-[26px] flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-[#2563EB] dark:hover:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#172554]/50 transition-colors cursor-pointer shrink-0"
                                            >
                                              <Volume2 className="w-3 h-3" />
                                            </button>
                                          </div>
                                        );
                                       }
                                      if (item.kind === 'budget_alert') {
                                        const isExceeded = item.status === 'overdue';
                                        return (
                                          <div
                                            key={item.id}
                                            className={`px-4 py-3 space-y-2.5 transition-colors border-l-2 ${
                                              isExceeded
                                                ? 'bg-rose-500/[0.06] border-rose-500 dark:bg-rose-950/20'
                                                : 'bg-amber-500/[0.08] border-amber-500 dark:bg-amber-950/25'
                                            }`}
                                          >
                                            <div className="flex items-start justify-between gap-2.5">
                                              <div className="flex items-start gap-2.5 min-w-0">
                                                <span
                                                  className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                                    isExceeded
                                                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                                      : 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                                                  }`}
                                                >
                                                  <AlertTriangle className="w-3.5 h-3.5" />
                                                </span>
                                                <div className="min-w-0">
                                                  <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span
                                                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                        isExceeded
                                                          ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                                                          : 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                                                      }`}
                                                    >
                                                      {isExceeded ? 'Գերազանցված բյուջե' : '80% շեմի ահազանգ'}
                                                    </span>
                                                    {item.ratio !== undefined && (
                                                      <span className="text-[10px] font-mono font-semibold text-[#64748B] dark:text-[#94A3B8]">
                                                        {item.ratio}%
                                                      </span>
                                                    )}
                                                  </div>
                                                  <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate mt-0.5">
                                                    {item.title}
                                                  </p>
                                                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate tabular-nums">
                                                    {item.subtitle}
                                                  </p>
                                                </div>
                                              </div>
                                              {item.amount !== undefined && (
                                                <span
                                                  className={`text-xs font-mono font-bold tabular-nums shrink-0 ${
                                                    isExceeded
                                                      ? 'text-rose-600 dark:text-rose-400'
                                                      : 'text-amber-600 dark:text-amber-400'
                                                  }`}
                                                >
                                                  {formatMoney(item.amount)}
                                                </span>
                                              )}
                                            </div>

                                            {item.ratio !== undefined && (
                                              <div className="h-1.5 w-full rounded-full bg-[#E2E8F0] dark:bg-[#1E293B] overflow-hidden">
                                                <div
                                                  className={`h-full rounded-full ${
                                                    isExceeded ? 'bg-rose-500' : 'bg-amber-500'
                                                  }`}
                                                  style={{ width: `${Math.min(100, item.ratio)}%` }}
                                                />
                                              </div>
                                            )}

                                            <div className="flex items-center justify-between gap-1.5">
                                              <button
                                                type="button"
                                                onClick={() => onSpeakNotif(item)}
                                                title="Լսել ձայնային ընթերցմամբ"
                                                aria-label={`Լսել «${item.title}» ահազանգը`}
                                                className="min-h-[26px] min-w-[26px] flex items-center justify-center rounded-lg border border-amber-500/25 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15 transition-colors cursor-pointer"
                                              >
                                                <Volume2 className="w-3 h-3" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setRemindersOpen(false);
                                                  onSelectTab('finance');
                                                }}
                                                className="min-h-[26px] px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 text-[11px] font-semibold cursor-pointer transition-colors"
                                              >
                                                Կարգավորել բյուջեն
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      }

                                      if (item.kind === 'debt') {
                                        return (
                                          <div
                                            key={item.id}
                                            className={`px-4 py-3 space-y-2 transition-colors border-l-2 ${
                                              isOverdue
                                                ? 'bg-rose-500/[0.06] border-rose-500 dark:bg-rose-950/20'
                                                : 'bg-[#EFF6FF]/50 border-[#2563EB] dark:bg-[#172554]/25'
                                            }`}
                                          >
                                            <div className="flex items-start justify-between gap-2.5">
                                              <div className="flex items-start gap-2.5 min-w-0">
                                                <span
                                                  className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                                    isOverdue
                                                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                                      : 'bg-[#2563EB]/12 text-[#2563EB] dark:text-[#60A5FA]'
                                                  }`}
                                                >
                                                  <HandCoins className="w-3.5 h-3.5" />
                                                </span>
                                                <div className="min-w-0">
                                                  <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                                                    {item.title}
                                                  </p>
                                                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate tabular-nums">
                                                    {item.subtitle}
                                                  </p>
                                                </div>
                                              </div>
                                              {item.amount !== undefined && (
                                                <span className="text-xs font-mono font-bold tabular-nums text-[#0F172A] dark:text-[#F8FAFC] shrink-0">
                                                  {formatMoney(item.amount)}
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex items-center justify-between gap-1.5">
                                              <button
                                                type="button"
                                                onClick={() => onSpeakNotif(item)}
                                                title="Լսել ձայնային ընթերցմամբ"
                                                aria-label={`Լսել «${item.title}» հիշեցումը`}
                                                className="min-h-[26px] min-w-[26px] flex items-center justify-center rounded-lg border border-[#2563EB]/25 text-[#2563EB] dark:text-[#60A5FA] hover:bg-[#2563EB]/10 transition-colors cursor-pointer"
                                              >
                                                <Volume2 className="w-3 h-3" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  try {
                                                    localStorage.setItem(
                                                      'pa_finance_active_page',
                                                      'goals_debts'
                                                    );
                                                  } catch {
                                                    // ignore
                                                  }
                                                  setRemindersOpen(false);
                                                  onSelectTab('finance');
                                                }}
                                                className="min-h-[26px] px-2.5 py-1 rounded-lg bg-[#2563EB]/12 hover:bg-[#2563EB]/20 text-[#2563EB] dark:text-[#60A5FA] text-[11px] font-semibold cursor-pointer transition-colors"
                                              >
                                                Դիտել պարտքերը
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      }

                                      return (
                                        <div
                                          key={item.id}
                                          className="px-4 py-2.5 flex items-start justify-between gap-2.5 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
                                        >
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setRemindersOpen(false);
                                              onSelectTab('notes');
                                            }}
                                            className="min-w-0 flex-1 text-left cursor-pointer"
                                          >
                                            <p className="text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] leading-snug truncate">
                                              {item.title}
                                            </p>
                                            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5 tabular-nums">
                                              {item.subtitle}
                                            </p>
                                          </button>
                                          <div className="flex items-center gap-0.5 shrink-0">
                                            <button
                                              type="button"
                                              onClick={() => onSpeakNotif(item)}
                                              title="Լսել ձայնային ընթերցմամբ"
                                              aria-label={`Լսել «${item.title}» նշումը`}
                                              className="min-h-[26px] min-w-[26px] flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-[#2563EB] dark:hover:text-[#60A5FA] hover:bg-[#E2E8F0]/60 dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
                                            >
                                              <Volume2 className="w-3 h-3" />
                                            </button>
                                            {item.noteId && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  onDismissNoteReminder(
                                                    item.noteId!
                                                  )
                                                }
                                                aria-label={`Փակել «${item.title}» հիշեցումը`}
                                                className="min-h-[26px] min-w-[26px] flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#E2E8F0]/60 dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
                                              >
                                                <X className="w-3.5 h-3.5" />
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )
                          )}
                        </div>
                      )}
                        </>
                      )}

                      <div className="px-4 py-2.5 border-t border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setRemindersOpen(false);
                              onSelectTab('finance');
                            }}
                            className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] inline-flex items-center gap-1 hover:underline cursor-pointer"
                          >
                            <span>Վճարումներ</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRemindersOpen(false);
                              onSelectTab('planner');
                            }}
                            className="text-xs font-semibold text-[#475569] dark:text-[#CBD5E1] inline-flex items-center gap-1 hover:underline cursor-pointer"
                          >
                            <span>Օրակարգ</span>
                          </button>
                        </div>

                        {snoozedCount > 0 ? (
                          <button
                            type="button"
                            onClick={onClearSnoozes}
                            className="text-[11px] font-medium text-amber-600 dark:text-amber-400 inline-flex items-center gap-1 hover:underline cursor-pointer tabular-nums"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Վերականգնել ({snoozedCount})</span>
                          </button>
                        ) : dueNotes.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setRemindersOpen(false);
                              onSelectTab('notes');
                            }}
                            className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer tabular-nums"
                          >
                            Նշումներ ({dueNotes.length})
                          </button>
                        ) : null}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onOpenNewModal();
                }}
                className="hidden md:inline-flex min-h-[40px] px-3 sm:px-4 py-2 rounded-xl btn-primary text-xs sm:text-sm items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>Նոր գրառում</span>
              </button>
            </div>
          </div>
        </header>

        {children}

        {/* Mobile Fixed Bottom Dock (< md) */}
        <nav
          aria-label="Բջջային նավիգացիա"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-[calc(3.85rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-white/95 dark:bg-[#0C1220]/95 backdrop-blur-xl border-t border-[#E2E8F0]/90 dark:border-[#1E293B]/90 grid grid-cols-5 items-center px-1 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.35)] select-none"
        >
          {/* Tab 1: Overview */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onSelectTab('overview');
            }}
            aria-label="Ընդհանուր ամփոփ պատկեր"
            className={`relative h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer active:scale-95 ${
              activeTab === 'overview'
                ? 'text-[#2563EB] dark:text-[#60A5FA] font-semibold'
                : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
            }`}
          >
            {activeTab === 'overview' && (
              <motion.span
                layoutId="nav-mobile-indicator"
                transition={
                  prefersReducedMotion
                    ? { duration: 0.01 }
                    : { type: 'spring', stiffness: 450, damping: 34 }
                }
                className="absolute top-0 w-8 h-0.5 rounded-full bg-[#2563EB] dark:bg-[#3B82F6]"
                aria-hidden="true"
              />
            )}
            <LayoutDashboard className="w-5 h-5" strokeWidth={activeTab === 'overview' ? 2.2 : 1.75} />
            <span className="text-[10px] leading-none whitespace-nowrap">Ընդհանուր</span>
          </button>

          {/* Tab 2: Finance */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onSelectTab('finance');
            }}
            aria-label="Ֆինանսներ և բյուջե"
            className={`relative h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer active:scale-95 ${
              activeTab === 'finance'
                ? 'text-[#2563EB] dark:text-[#60A5FA] font-semibold'
                : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
            }`}
          >
            {activeTab === 'finance' && (
              <motion.span
                layoutId="nav-mobile-indicator"
                transition={
                  prefersReducedMotion
                    ? { duration: 0.01 }
                    : { type: 'spring', stiffness: 450, damping: 34 }
                }
                className="absolute top-0 w-8 h-0.5 rounded-full bg-[#2563EB] dark:bg-[#3B82F6]"
                aria-hidden="true"
              />
            )}
            <Wallet className="w-5 h-5" strokeWidth={activeTab === 'finance' ? 2.2 : 1.75} />
            <span className="text-[10px] leading-none whitespace-nowrap">Ֆինանսներ</span>
          </button>

          {/* Center: Raised Floating Quick Action (+) Button */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onOpenNewModal();
              }}
              aria-label="Նոր գրառում (արագ ավելացում)"
              className="w-12 h-12 -mt-4 rounded-full bg-gradient-to-tr from-[#2563EB] to-[#38BDF8] dark:from-[#3B82F6] dark:to-[#60A5FA] text-white flex items-center justify-center shadow-lg shadow-blue-500/35 border-[2.5px] border-white dark:border-[#0C1220] active:scale-90 transition-transform cursor-pointer shrink-0"
            >
              <Plus className="w-6 h-6" strokeWidth={2.6} />
            </button>
          </div>

          {/* Tab 3: Planner */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onSelectTab('planner');
            }}
            aria-label={`Անելիքներ (${todayCount} այսօր)`}
            className={`relative h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer active:scale-95 ${
              activeTab === 'planner'
                ? 'text-[#2563EB] dark:text-[#60A5FA] font-semibold'
                : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
            }`}
          >
            {activeTab === 'planner' && (
              <motion.span
                layoutId="nav-mobile-indicator"
                transition={
                  prefersReducedMotion
                    ? { duration: 0.01 }
                    : { type: 'spring', stiffness: 450, damping: 34 }
                }
                className="absolute top-0 w-8 h-0.5 rounded-full bg-[#2563EB] dark:bg-[#3B82F6]"
                aria-hidden="true"
              />
            )}
            <span className="relative inline-flex items-center justify-center">
              <CheckSquare className="w-5 h-5" strokeWidth={activeTab === 'planner' ? 2.2 : 1.75} />
              {todayCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[#2563EB] dark:bg-[#3B82F6] text-white dark:text-[#060B16] text-[9px] font-mono font-bold tabular-nums flex items-center justify-center leading-none shadow-xs">
                  {todayCount > 99 ? '99+' : todayCount}
                </span>
              )}
            </span>
            <span className="text-[10px] leading-none whitespace-nowrap">Անելիքներ</span>
          </button>

          {/* Tab 4: Notes */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onSelectTab('notes');
            }}
            aria-label="Նշումներ և մտքեր"
            className={`relative h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer active:scale-95 ${
              activeTab === 'notes'
                ? 'text-[#2563EB] dark:text-[#60A5FA] font-semibold'
                : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
            }`}
          >
            {activeTab === 'notes' && (
              <motion.span
                layoutId="nav-mobile-indicator"
                transition={
                  prefersReducedMotion
                    ? { duration: 0.01 }
                    : { type: 'spring', stiffness: 450, damping: 34 }
                }
                className="absolute top-0 w-8 h-0.5 rounded-full bg-[#2563EB] dark:bg-[#3B82F6]"
                aria-hidden="true"
              />
            )}
            <NotebookPen className="w-5 h-5" strokeWidth={activeTab === 'notes' ? 2.2 : 1.75} />
            <span className="text-[10px] leading-none whitespace-nowrap">Նշումներ</span>
          </button>
        </nav>
      </div>
    </>
  );
});
