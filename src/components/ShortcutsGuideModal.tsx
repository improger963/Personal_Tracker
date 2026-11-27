import { useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Command, Keyboard, Sparkles, X, Zap } from 'lucide-react';

interface ShortcutsGuideModalProps {
  onClose: () => void;
  onOpenCommandPalette?: () => void;
}

const SHORTCUTS = [
  { keys: ['Alt / ⌥', 'N'], label: 'Արագ ավելացնել նոր գործարք (եկամուտ կամ ծախս)' },
  { keys: ['Alt / ⌥', 'T'], label: 'Ֆոկուսանալ կամ բացել նոր անելիքի մուտքը' },
  { keys: ['Alt / ⌥', 'F'], label: 'Անցնել Ֆոկուս թայմեր բաժին' },
  { keys: ['⌘ / Ctrl', 'K'], label: 'Արագ որոնում և խելացի հրամաններ' },
  { keys: ['⌘ / Ctrl', 'Shift', 'H'], label: 'Թաքցնել / ցույց տալ գումարները (Գաղտնի ռեժիմ)' },
  { keys: ['?'], label: 'Բացել այս ուղեցույցը' },
  { keys: ['↑', '↓', 'Enter'], label: 'Նավարկել և կատարել հրամանների վահանակում' },
  { keys: ['Esc'], label: 'Փակել ակտիվ պատուհանը կամ ցանկը' },
];

const SMART_EXAMPLES = [
  { syntax: 'սուրճ 1500', desc: 'Արագ ծախս՝ ավտոմատ կատեգորիայով' },
  { syntax: 'տաքսի 1200 քարտ', desc: 'Ծախս՝ կապելով կոնկրետ քարտին կամ կանխիկին' },
  { syntax: '+բոնուս 50000', desc: 'Հավելյալ եկամուտ՝ ընտրված քարտին' },
  { syntax: 'անելիք զանգել բժշկին 16:30 !', desc: 'Կարևոր անելիք՝ նշված ժամով' },
  { syntax: 'նշում գնել նվեր մայրիկին', desc: 'Արագ անձնական նշում' },
];

export function ShortcutsGuideModal({
  onClose,
  onOpenCommandPalette,
}: ShortcutsGuideModalProps) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#020617]/65 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-guide-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: prefersReducedMotion ? 0.04 : 0.18,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="w-full sm:max-w-xl max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-2xl border-t sm:border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] shadow-2xl overflow-hidden"
      >
        <div
          className="w-10 h-1 rounded-full bg-[#CBD5E1] dark:bg-[#334155] mx-auto mt-2.5 sm:hidden shrink-0"
          aria-hidden="true"
        />

        <div className="px-5 sm:px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#EFF6FF] dark:bg-[#172554]/70 text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
              <Keyboard className="w-4.5 h-4.5" />
            </span>
            <div className="min-w-0">
              <h2
                id="shortcuts-guide-title"
                className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate"
              >
                Արագ ստեղներ և խելացի մուտք
              </h2>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] truncate">
                Կառավարեք ֆինանսներն ու օրակարգը վայրկյանների ընթացքում
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Փակել ուղեցույցը"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-container px-5 sm:px-6 py-5 space-y-5">
          {/* Keyboard Shortcuts */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1.5">
              <Command className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-[#60A5FA]" />
              <span>Ստեղնաշարային դյուրանցումներ</span>
            </h3>
            <div className="divide-y divide-[#F1F5F9] dark:divide-[#1E293B] rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] px-3.5">
              {SHORTCUTS.map((item) => (
                <div
                  key={item.label}
                  className="py-2.5 flex flex-wrap min-[380px]:flex-nowrap items-center justify-between gap-2 sm:gap-3 text-xs"
                >
                  <span className="text-[#334155] dark:text-[#CBD5E1] font-medium">
                    {item.label}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.keys.map((k) => (
                      <kbd
                        key={k}
                        className="px-2 py-0.5 rounded-md bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#26334D] text-[11px] font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC] shadow-2xs"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Smart Command Syntax */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Խելացի արագ մուտքի օրինակներ (⌘K)</span>
            </h3>
            <div className="space-y-1.5 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] p-3">
              {SMART_EXAMPLES.map((ex) => (
                <div
                  key={ex.syntax}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-1.5 border-b last:border-b-0 border-[#E2E8F0]/70 dark:border-[#1E293B]/70"
                >
                  <code className="text-xs font-mono font-semibold text-[#1D4ED8] dark:text-[#60A5FA]">
                    {ex.syntax}
                  </code>
                  <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                    {ex.desc}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Smart Capabilities Note */}
          <section className="p-3.5 rounded-xl border border-[#BFDBFE] dark:border-[#1E3A8A]/70 bg-[#EFF6FF]/65 dark:bg-[#172554]/35 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-[#2563EB] dark:text-[#60A5FA] shrink-0 mt-0.5" />
            <p className="text-xs text-[#334155] dark:text-[#CBD5E1] leading-relaxed">
              Հավելվածը նաև ավտոմատ կանխատեսում է կատեգորիաները, հայտնաբերում է
              կրկնվող վճարները և հաշվում է օրական անվտանգ սահմանաչափը՝ ըստ ձեր
              աշխատավարձի ցիկլի։
            </p>
          </section>
        </div>

        <div className="px-4 sm:px-6 py-3.5 pb-[calc(0.9rem+env(safe-area-inset-bottom))] border-t border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] flex flex-col-reverse min-[380px]:flex-row items-stretch min-[380px]:items-center sm:justify-end gap-2 shrink-0">
          {onOpenCommandPalette && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCommandPalette();
              }}
              className="min-h-[42px] sm:min-h-[40px] px-4 py-2 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] bg-white dark:bg-[#0F172A] text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA] hover:border-[#2563EB] transition-colors cursor-pointer"
            >
              Բացել արագ հրամանները (⌘K)
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] sm:min-h-[40px] px-4 py-2 rounded-xl btn-primary text-xs font-semibold cursor-pointer"
          >
            Փակել
          </button>
        </div>
      </motion.div>
    </div>
  );
}
