import { createMemo, createRoot, createSignal } from 'solid-js';
import { tagStr } from './live/store';

/** What the user clicked in the plant. `id` is a vessel ("FV03", "Kettle"), a machine ("Filler") or a utility ("Boiler"). */
export type Selection =
  | { kind: 'vessel'; id: string }
  | { kind: 'line'; id: string }
  | { kind: 'util'; id: string }
  | { kind: 'batch'; id: string };

const [sel, setSel] = createSignal<Selection | null>(null);
export { sel, setSel };

/** Batch id ("BR0007") of the selection: the batch itself, or the batch a vessel / the line is carrying. */
export const selectedBatch = createRoot(() => createMemo<string>(() => {
  const s = sel();
  if (!s) return '';
  if (s.kind === 'batch') return s.id;
  if (s.kind === 'util') return '';
  if (s.kind === 'line') return tagStr('Packaging/Line/BatchId');
  const base = ['FV', 'BBT'].some((p) => s.id.startsWith(p)) ? `Cellar/${s.id}` : `Brewhouse/${s.id}`;
  return tagStr(`${base}/BatchId`);
}));

export const clearSelection = (): void => void setSel(null);

/** Hover state for the DOM tooltip: id as above or `batch:BR0007`, and client coordinates. */
export interface Hover {
  kind: 'vessel' | 'line' | 'util' | 'batch';
  id: string;
  x: number;
  y: number;
}
const [hover, setHover] = createSignal<Hover | null>(null);
export { hover, setHover };
