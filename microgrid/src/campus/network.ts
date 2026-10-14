/** Power network of the campus (pure maths): signed injections at the trunk taps -> net flow per trunk segment and its colour group. */
export type Group = 'pv' | 'bess' | 'grid' | 'gen';

export interface Tap {
  id: string;
  /** Position along the trunk (world x). */
  x: number;
  /** kW injected into the trunk (positive = source, negative = load). */
  kw: number;
  group: Group;
}

export interface Seg {
  x0: number;
  x1: number;
  /** Net kW, positive = flowing east (towards the substation). */
  kw: number;
  group: Group;
}

const biggest = (acc: Record<Group, number>, fallback: Group): Group => {
  let best: Group = fallback;
  let max = 0.05;
  (Object.keys(acc) as Group[]).forEach((g) => {
    if (acc[g] > max) {
      max = acc[g];
      best = g;
    }
  });
  return best;
};

/** Segments between consecutive distinct tap positions, west to east. The grid is the last tap (at the substation). */
export function trunkSegments(taps: Tap[]): Seg[] {
  const xs = [...new Set(taps.map((t) => t.x))].sort((a, b) => a - b);
  const segs: Seg[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const west = taps.filter((t) => t.x <= xs[i]);
    const east = taps.filter((t) => t.x > xs[i]);
    const net = west.reduce((s, t) => s + t.kw, 0);
    const side = net >= 0 ? west : east;
    const acc: Record<Group, number> = { pv: 0, bess: 0, grid: 0, gen: 0 };
    for (const t of side) if (t.kw > 0) acc[t.group] += t.kw;
    segs.push({ x0: xs[i], x1: xs[i + 1], kw: net, group: biggest(acc, 'grid') });
  }
  return segs;
}

/** Particle spacing (world units) for a flow of |kw|: dense for big flows; null = no particles. */
export function spacingOf(kw: number): number | null {
  const a = Math.abs(kw);
  if (!Number.isFinite(a) || a < 0.8) return null;
  return Math.min(64, Math.max(9, 64 / (1 + a / 45)));
}

/** Particle speed (world units / s). */
export const speedOf = (kw: number): number => 38 + 52 * Math.min(1, Math.abs(kw) / 220);

/** Group that supplies the loads right now (for load leads): the biggest of grid import, PV, BESS discharge, genset. */
export function supplyGroup(grid: number, pv: number, bess: number, gen: number): Group {
  return biggest({ grid: Math.max(0, grid), pv: Math.max(0, pv), bess: Math.max(0, bess), gen: Math.max(0, gen) }, 'grid');
}
