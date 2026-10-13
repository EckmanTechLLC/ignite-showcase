import { createSignal } from 'solid-js';

/** True when the user asked for reduced motion: particles are off and flows stay still. */
const [reduced, setReduced] = createSignal(false);
export { reduced };
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  setReduced(mq.matches);
  mq.addEventListener('change', (e) => setReduced(e.matches));
}
