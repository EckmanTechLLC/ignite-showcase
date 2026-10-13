/** True when the user asked for reduced motion; flows and tweens then stay still. */
export const motion = $state({ reduced: false });
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  motion.reduced = mq.matches;
  mq.addEventListener('change', (e) => (motion.reduced = e.matches));
}

const frameListeners = new Set<(ms: number) => void>();
let raf = 0;
let last = 0;

function frame(t: number): void {
  raf = requestAnimationFrame(frame);
  const ms = last ? t - last : 16.7;
  last = t;
  frameListeners.forEach((l) => l(ms));
}

/** Frame-time observer for the perf readout. Returns the unsubscribe function. */
export function onFrameTime(cb: (ms: number) => void): () => void {
  frameListeners.add(cb);
  if (!raf) raf = requestAnimationFrame(frame);
  return () => {
    frameListeners.delete(cb);
    if (!frameListeners.size) {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    }
  };
}
