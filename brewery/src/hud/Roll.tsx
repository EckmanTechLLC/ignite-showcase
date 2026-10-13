import { createEffect, createSignal, onCleanup, untrack } from 'solid-js';
import { reduced } from '../motion';
import { num } from '../fmt';

/** A number that rolls to its new value instead of jumping (the sim steps once a second). */
export default function Roll(props: { value: number; digits?: number; prefix?: string; group?: boolean }) {
  const [shown, setShown] = createSignal(Number.NaN);
  let raf = 0;
  createEffect(() => {
    const to = props.value;
    if (!Number.isFinite(to)) {
      setShown(Number.NaN);
      return;
    }
    const from = untrack(shown);
    cancelAnimationFrame(raf);
    if (!Number.isFinite(from) || reduced()) {
      setShown(to);
      return;
    }
    const t0 = performance.now();
    const step = (now: number): void => {
      const k = Math.min(1, (now - t0) / 900);
      setShown(from + (to - from) * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });
  onCleanup(() => cancelAnimationFrame(raf));
  const text = () => {
    const v = shown();
    if (!Number.isFinite(v)) return '—';
    const d = props.digits ?? 0;
    return (props.prefix ?? '') + (props.group ? Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : num(Math.abs(v), d));
  };
  return <>{text()}</>;
}
