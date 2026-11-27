import { useEffect } from 'react';
import { Share, PlusSquare, Smartphone, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

interface PWAInstallModalProps {
  onClose: () => void;
}

export function PWAInstallModal({ onClose }: PWAInstallModalProps) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#020617]/65 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-ios-guide-title"
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
        className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto scroll-container rounded-t-3xl sm:rounded-2xl border-t sm:border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-6 shadow-2xl space-y-4"
      >
        <div className="w-10 h-1 rounded-full bg-[#CBD5E1] dark:bg-[#334155] mx-auto -mt-1 sm:hidden shrink-0" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[#2563EB]/10 dark:bg-[#3B82F6]/15 text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4" />
            </span>
            <div>
              <h2
                id="pwa-ios-guide-title"
                className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]"
              >
                Տեղադրել iPhone / iPad-ում
              </h2>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                Արագ մուտք և օֆլայն աշխատանք
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Փակել պատուհանը"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ol className="space-y-3 text-xs sm:text-sm text-[#334155] dark:text-[#CBD5E1]">
          <li className="flex items-start gap-3 p-3 rounded-xl bg-[#F8FAFC] dark:bg-[#111A2E] border border-[#E2E8F0] dark:border-[#1E293B]">
            <span className="w-6 h-6 rounded-lg bg-[#2563EB] text-white text-xs font-mono font-bold flex items-center justify-center shrink-0">
              1
            </span>
            <div className="space-y-1">
              <p className="font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                Սեղմեք Safari-ի «Կիսվել» կոճակը
              </p>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] inline-flex items-center gap-1">
                <Share className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                <span>Էկրանի ներքևի վահանակում</span>
              </p>
            </div>
          </li>

          <li className="flex items-start gap-3 p-3 rounded-xl bg-[#F8FAFC] dark:bg-[#111A2E] border border-[#E2E8F0] dark:border-[#1E293B]">
            <span className="w-6 h-6 rounded-lg bg-[#2563EB] text-white text-xs font-mono font-bold flex items-center justify-center shrink-0">
              2
            </span>
            <div className="space-y-1">
              <p className="font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                Ընտրեք «Add to Home Screen» (Ավելացնել հիմնական էկրանին)
              </p>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] inline-flex items-center gap-1">
                <PlusSquare className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                <span>Եվ հաստատեք վերևի աջ անկյունում</span>
              </p>
            </div>
          </li>
        </ol>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto min-h-[42px] sm:min-h-[40px] px-4 py-2 rounded-xl btn-primary text-xs sm:text-sm"
          >
            Հասկանալի է
          </button>
        </div>
      </motion.div>
    </div>
  );
}
