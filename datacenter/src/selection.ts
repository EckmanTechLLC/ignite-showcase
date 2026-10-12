import { shallowRef } from 'vue';

export type Kind = 'rack' | 'crah' | 'chiller' | 'ups' | 'pdu' | 'utility' | 'generator' | 'ats';
export interface Target {
  kind: Kind;
  /** R01..R60, CRAH/chiller number, UPS letter, PDU name (A1..B3); empty for singletons. */
  id: string;
}

/** Clicked item. Overlays (task-57: trends, controls) consume this. */
export const selection = shallowRef<Target | null>(null);
/** Item under the pointer. */
export const hover = shallowRef<Target | null>(null);
/** Pointer position (viewport px) for the tooltip; updated on every move, separate so hover only changes with the target. */
export const pointer = shallowRef({ x: 0, y: 0 });

export const same = (a: Target | null, b: Target | null) => !!a && !!b && a.kind === b.kind && a.id === b.id;

export function select(t: Target | null): void {
  selection.value = t && same(selection.value, t) ? null : t;
}
