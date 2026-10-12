import { ref } from 'vue';

/** True when the user asked for reduced motion; JS-driven animation (fans, flow) then stays still. */
export const reducedMotion = ref(false);
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion.value = mq.matches;
  mq.addEventListener('change', (e) => (reducedMotion.value = e.matches));
}

type FrameFn = (dt: number) => void;
const callbacks = new Set<FrameFn>();
const frameListeners = new Set<(ms: number) => void>();
let raf = 0;
let last = 0;

/** Fans and dashes step at 30 Hz: visually smooth at their speeds, half the style/paint work of 60 Hz. */
const STEP_MS = 30;
let acc = 0;

function frame(t: number): void {
  raf = requestAnimationFrame(frame);
  const ms = last ? t - last : 16.7;
  last = t;
  acc += ms;
  if (acc >= STEP_MS && !reducedMotion.value) {
    const dt = Math.min(acc / 1000, 0.1);
    acc = 0;
    callbacks.forEach((cb) => cb(dt));
  } else if (acc >= STEP_MS) {
    acc = 0;
  }
  frameListeners.forEach((l) => l(ms));
}

/** One shared requestAnimationFrame loop for every spinning fan and flowing conductor. */
export function onFrame(cb: FrameFn): () => void {
  callbacks.add(cb);
  if (!raf) raf = requestAnimationFrame(frame);
  return () => callbacks.delete(cb);
}

/** Frame-time observers (perf readout). */
export function onFrameTime(cb: (ms: number) => void): () => void {
  frameListeners.add(cb);
  if (!raf) raf = requestAnimationFrame(frame);
  return () => frameListeners.delete(cb);
}
