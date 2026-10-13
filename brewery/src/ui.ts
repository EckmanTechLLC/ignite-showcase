import { createSignal } from 'solid-js';

/** Help overlay (`?`, or `?about` in the URL) and the perf readout (`?perf` in the URL, `P` toggles). */
const params = new URLSearchParams(location.search);
export const [help, setHelp] = createSignal(params.has('about'));
export const perfEnabled = import.meta.env.DEV || params.has('perf');
export const [perfOpen, setPerfOpen] = createSignal(params.has('perf'));

/** One overlay panel at a time: B batch, T trends, A alarms, C controls, L login and audit. */
export type PanelKey = 'batch' | 'trends' | 'alarms' | 'controls' | 'identity';
export const [panel, setPanel] = createSignal<PanelKey | null>(null);
export const togglePanel = (k: PanelKey): void => void setPanel((p) => (p === k ? null : k));
export const closePanel = (): void => void setPanel(null);

export interface Toast {
  id: number;
  tone: 'ok' | 'warn' | 'alarm' | 'info';
  text: string;
}
export const [toasts, setToasts] = createSignal<Toast[]>([]);
let nextId = 1;
export function toast(text: string, tone: Toast['tone'] = 'info', ms = 4500): void {
  const t: Toast = { id: nextId++, tone, text };
  setToasts((l) => [...l.slice(-3), t]);
  window.setTimeout(() => setToasts((l) => l.filter((x) => x.id !== t.id)), ms);
}
