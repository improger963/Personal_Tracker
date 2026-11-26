export function scrollToTopInstant(): void {
  if (typeof window === 'undefined') return;
  try {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  } catch {
    window.scrollTo(0, 0);
  }
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

export function scrollToTopSmooth(): void {
  if (typeof window === 'undefined') return;
  const prefersReduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: (prefersReduced ? 'instant' : 'smooth') as ScrollBehavior,
    });
  } catch {
    window.scrollTo(0, 0);
  }
}
