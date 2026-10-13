export type PanelKey = 'trends' | 'alarms' | 'controls' | 'identity';

export interface Toast {
  id: number;
  tone: 'ok' | 'warn' | 'alarm' | 'info';
  text: string;
}

/** Overlay state: one panel at a time (keys T trends, A alarms, C controls, L login/audit), help on `?`, toasts. */
export const ui = $state<{ help: boolean; panel: PanelKey | null; toasts: Toast[] }>({
  help: new URLSearchParams(location.search).has('about'),
  panel: null,
  toasts: [],
});

export function togglePanel(k: PanelKey): void {
  ui.panel = ui.panel === k ? null : k;
}

let nextId = 1;
export function toast(text: string, tone: Toast['tone'] = 'info', ms = 4500): void {
  const t: Toast = { id: nextId++, tone, text };
  ui.toasts = [...ui.toasts.slice(-3), t];
  window.setTimeout(() => {
    ui.toasts = ui.toasts.filter((x) => x.id !== t.id);
  }, ms);
}
