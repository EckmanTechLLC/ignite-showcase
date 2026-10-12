import { useEffect, useRef } from 'react';

/**
 * Text that changes faster than React should render (the mission clock, data age). A requestAnimationFrame
 * loop writes textContent directly; no React state, no re-render. `get` must be cheap.
 */
export function LiveText({ get, className, intervalMs = 80 }: { get: () => string; className?: string; intervalMs?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < intervalMs) return;
      last = now;
      const text = get();
      if (ref.current && ref.current.textContent !== text) ref.current.textContent = text;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [get, intervalMs]);
  return <span ref={ref} className={className} />;
}
