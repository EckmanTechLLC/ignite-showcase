/** prefers-reduced-motion: read once, kept current. Consumers read `.reduced` (never React state). */
export const motion = { reduced: false };

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  motion.reduced = mq.matches;
  mq.addEventListener?.('change', (e) => {
    motion.reduced = e.matches;
  });
}
