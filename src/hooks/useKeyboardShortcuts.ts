import { useEffect } from 'react';
import { QuickModalMode } from '../components/QuickAddModal';
import { NavSection, PlannerPageTab } from '../types';

interface UseKeyboardShortcutsOptions {
  onOpenNewModal: (mode: QuickModalMode) => void;
  onNavigateTab: (tab: NavSection) => void;
  onNavigatePlannerPage: (page: PlannerPageTab) => void;
  enabled?: boolean;
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
      // Check if user is typing inside an input/textarea/contenteditable
      const target = e.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      if (isTyping && !(e.altKey && e.key.toLowerCase() === 'n')) {
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const key = e.key.toLowerCase();
        if (key === 'n') {
          e.preventDefault();
          onOpenNewModal('transaction');
        } else if (key === 't') {
          e.preventDefault();
          onOpenNewModal('task');
        } else if (key === 'f') {
          e.preventDefault();
          onNavigateTab('planner');
          onNavigatePlannerPage('focus');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onOpenNewModal, onNavigateTab, onNavigatePlannerPage]);
}
