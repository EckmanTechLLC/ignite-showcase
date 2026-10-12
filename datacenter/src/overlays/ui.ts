import { ref, shallowRef } from 'vue';

export type PanelKey = 'alarms' | 'trends' | 'controls' | 'identity' | 'help';

/** Panel currently open (one at a time). Keys: A alarms, T trends, C controls, L login/audit, ? help/about. */
export const panel = ref<PanelKey | null>(null);

export function togglePanel(k: PanelKey): void {
  panel.value = panel.value === k ? null : k;
}

export interface Toast {
  id: number;
  tone: 'ok' | 'warn' | 'alarm' | 'info';
  text: string;
}
export const toasts = shallowRef<Toast[]>([]);
let nextId = 1;

export function toast(text: string, tone: Toast['tone'] = 'info', ms = 4500): void {
  const t: Toast = { id: nextId++, tone, text };
  toasts.value = [...toasts.value.slice(-3), t];
  window.setTimeout(() => (toasts.value = toasts.value.filter((x) => x.id !== t.id)), ms);
}
