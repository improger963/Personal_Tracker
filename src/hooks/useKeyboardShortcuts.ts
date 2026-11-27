import { useEffect } from 'react';
import { QuickModalMode } from '../components/QuickAddModal';
import { NavSection, PlannerPageTab } from '../types';

interface UseKeyboardShortcutsOptions {
  onOpenNewModal: (mode: QuickModalMode) => void;
  onNavigateTab: (tab: NavSection) => void;
  onNavigatePlannerPage: (page: PlannerPageTab) => void;
  enabled?: boolean;
}

const ALT_SHORTCUT_KEYS = new Map<string, 'n' | 't' | 'f'>([
  ['KeyN', 'n'],
  ['KeyT', 't'],
  ['KeyF', 'f'],
]);

function resolveAltShortcutKey(e: KeyboardEvent): 'n' | 't' | 'f' | null {
  const byCode = ALT_SHORTCUT_KEYS.get(e.code);
  if (byCode) return byCode;

  const lower = e.key.toLowerCase();
  if (lower === 'n' || lower === '˜') return 'n';
  if (lower === 't' || lower === '†') return 't';
  if (lower === 'f' || lower === 'ƒ') return 'f';
  return null;
}

export function useKeyboardShortcuts({
  onOpenNewModal,
  onNavigateTab,
  onNavigatePlannerPage,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
        return;
      }

      const action = resolveAltShortcutKey(e);
      if (!action) return;

      const target = e.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      // Allow Alt+N from anywhere; skip Alt+T / Alt+F only when user is actively typing in a contentEditable or select
      if (
        isTyping &&
        action !== 'n' &&
        (target instanceof HTMLSelectElement || Boolean(target?.isContentEditable))
      ) {
        return;
      }

      if (action === 'n') {
        e.preventDefault();
        onOpenNewModal('transaction');
      } else if (action === 't') {
        e.preventDefault();
        const inlineTaskInput = document.getElementById(
          'quick-task-input'
        ) as HTMLInputElement | null;
        if (inlineTaskInput && inlineTaskInput.offsetParent !== null) {
          inlineTaskInput.focus();
          inlineTaskInput.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
          onOpenNewModal('task');
        }
      } else if (action === 'f') {
        e.preventDefault();
        onNavigateTab('planner');
        onNavigatePlannerPage('focus');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onOpenNewModal, onNavigateTab, onNavigatePlannerPage]);
}
