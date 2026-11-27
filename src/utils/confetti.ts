import confetti from 'canvas-confetti';

export function triggerMilestoneConfetti() {
  try {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'],
    });
  } catch {
    // ignore if canvas-confetti fails
  }
}
