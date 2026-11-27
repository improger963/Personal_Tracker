import confetti from 'canvas-confetti';

export function triggerMilestoneConfetti(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const colors = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

    void confetti({
      particleCount: 70,
      spread: 68,
      origin: { y: 0.62 },
      colors,
      disableForReducedMotion: true,
    });

    window.setTimeout(() => {
      void confetti({
        particleCount: 45,
        angle: 60,
        spread: 55,
        origin: { x: 0.15, y: 0.65 },
        colors,
        disableForReducedMotion: true,
      });
      void confetti({
        particleCount: 45,
        angle: 120,
        spread: 55,
        origin: { x: 0.85, y: 0.65 },
        colors,
        disableForReducedMotion: true,
      });
    }, 140);
  } catch {
    // ignore if canvas-confetti fails in headless or restricted environments
  }
}
