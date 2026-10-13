/** The OEE waterfall from the shift counters: planned minutes down to the minutes that made good cans. */
export interface WfStep {
  name: string;
  /** Minutes of the step (a loss is shown as a drop). */
  minutes: number;
  kind: 'total' | 'loss' | 'good';
}

export interface Wf {
  steps: WfStep[];
  /** Minutes that produced good cans (run time x performance x quality). */
  goodMin: number;
}

/**
 * planned -> (down time = availability loss) -> run time -> (speed shortfall = performance loss) -> (rejects = quality
 * loss) -> good time. Returns null while the shift has no planned time yet.
 */
export function waterfall(plannedMin: number, runMin: number, downMin: number, perf: number, quality: number): Wf | null {
  if (![plannedMin, runMin, downMin, perf, quality].every(Number.isFinite) || plannedMin <= 0) return null;
  const run = Math.max(0, Math.min(runMin, plannedMin));
  const down = Math.max(0, Math.min(downMin, plannedMin));
  const p = Math.min(1, Math.max(0, perf));
  const q = Math.min(1, Math.max(0, quality));
  const eff = run * p;
  const good = eff * q;
  return {
    goodMin: good,
    steps: [
      { name: 'Planned', minutes: plannedMin, kind: 'total' },
      { name: 'Availability loss', minutes: down, kind: 'loss' },
      { name: 'Performance loss', minutes: run - eff, kind: 'loss' },
      { name: 'Quality loss', minutes: eff - good, kind: 'loss' },
      { name: 'Good time', minutes: good, kind: 'good' },
    ],
  };
}

/** Invisible base + visible bar for a stacked-bar waterfall: each loss hangs from the running total. */
export function bars(wf: Wf): { base: number[]; value: number[] } {
  const base: number[] = [];
  const value: number[] = [];
  let level = wf.steps[0].minutes;
  wf.steps.forEach((s, i) => {
    if (i === 0) {
      base.push(0);
      value.push(s.minutes);
    } else if (s.kind === 'loss') {
      level -= s.minutes;
      base.push(Math.max(0, level));
      value.push(s.minutes);
    } else {
      base.push(0);
      value.push(s.minutes);
    }
  });
  return { base, value };
}
