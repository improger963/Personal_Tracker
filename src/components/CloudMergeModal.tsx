import { Cloud, Download, GitMerge, Loader2, ShieldAlert } from 'lucide-react';
import { FullWorkspaceSnapshot } from '../services/firestoreSync';

interface CloudMergeModalProps {
  localSnapshot: FullWorkspaceSnapshot;
  cloudSnapshot: FullWorkspaceSnapshot;
  busy: boolean;
  onMerge: () => void;
  onUseCloudOnly: () => void;
  onDownloadLocalBackup: () => void;
}

export function CloudMergeModal({
  localSnapshot,
  cloudSnapshot,
  busy,
  onMerge,
  onUseCloudOnly,
  onDownloadLocalBackup,
}: CloudMergeModalProps) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-[#020617]/75 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloud-merge-title"
    >
      <div className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto scroll-container rounded-t-3xl sm:rounded-2xl border-t sm:border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] shadow-2xl">
        <div className="w-10 h-1 rounded-full bg-[#CBD5E1] dark:bg-[#334155] mx-auto mt-2.5 sm:hidden shrink-0" aria-hidden="true" />
        <div className="px-4 sm:px-5 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2
              id="cloud-merge-title"
              className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]"
            >
              Հայտնաբերվեցին տեղային և ամպային տվյալներ
            </h2>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
              Ընտրեք՝ ինչպես շարունակել, որպեսզի տեղային փոփոխությունները չկորչեն
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5 space-y-4">
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] space-y-1.5">
              <p className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">
                Այս սարքում (Տեղային)
              </p>
              <div className="text-xs text-[#0F172A] dark:text-[#F8FAFC] space-y-0.5 tabular-nums">
                <p>Գործարքներ՝ {localSnapshot.transactions.length}</p>
                <p>Քարտեր՝ {localSnapshot.cards.length}</p>
                <p>Անելիքներ՝ {localSnapshot.tasks.length}</p>
                <p>Նշումներ՝ {localSnapshot.notes.length}</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] space-y-1.5">
              <p className="text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA]">
                Ամպային հաշիվ
              </p>
              <div className="text-xs text-[#0F172A] dark:text-[#F8FAFC] space-y-0.5 tabular-nums">
                <p>Գործարքներ՝ {cloudSnapshot.transactions.length}</p>
                <p>Քարտեր՝ {cloudSnapshot.cards.length}</p>
                <p>Անելիքներ՝ {cloudSnapshot.tasks.length}</p>
                <p>Նշումներ՝ {cloudSnapshot.notes.length}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              disabled={busy}
              onClick={onMerge}
              className="w-full min-h-[44px] px-4 rounded-xl btn-primary text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <GitMerge className="w-4 h-4" />
              )}
              <span>Միավորել տեղայինն ու ամպայինը (խորհուրդ է տրվում)</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={onUseCloudOnly}
              className="w-full min-h-[42px] px-4 rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0B1120] hover:border-[#2563EB] text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Cloud className="w-4 h-4 text-[#2563EB] dark:text-[#60A5FA]" />
              <span>Օգտագործել միայն ամպայինը</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={onDownloadLocalBackup}
              className="w-full min-h-[40px] px-4 rounded-xl text-xs font-semibold text-[#475569] dark:text-[#CBD5E1] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Արտահանել տեղային պահուստ (.json)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
