export type Kind = 'grid' | 'pv' | 'bess' | 'genset' | 'evbank' | 'charger' | 'bldg' | 'sun';
export interface Target {
  kind: Kind;
  /** A1..A4, B1/B2, C01..C10, 1..3; empty for singletons. */
  id: string;
}

// Plain state holders (task-68 overlays consume `sel.target` for click-to-trend).
export const sel = $state<{ target: Target | null; hover: Target | null; x: number; y: number }>({ target: null, hover: null, x: 0, y: 0 });

export const same = (a: Target | null, b: Target | null) => !!a && !!b && a.kind === b.kind && a.id === b.id;

export function select(t: Target | null): void {
  sel.target = t && same(sel.target, t) ? null : t;
}
