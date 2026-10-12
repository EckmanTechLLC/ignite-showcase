import { useSyncExternalStore } from 'react';

/** Which slide-in panels are open, plus toasts. A tiny module store; panels are independent of the scene. */

export type PanelId = 'telemetry' | 'alarms' | 'controls' | 'identity' | 'help';

type Listener = () => void;

let open: ReadonlySet<PanelId> = new Set();
const panelListeners = new Set<Listener>();

export function togglePanel(id: PanelId, on?: boolean): void {
  const next = new Set(open);
  const want = on ?? !next.has(id);
  if (want) next.add(id);
  else next.delete(id);
  open = next;
  for (const l of [...panelListeners]) l();
}

export function closeAllPanels(): void {
  if (open.size === 0) return;
  open = new Set();
  for (const l of [...panelListeners]) l();
}

export function usePanels(): ReadonlySet<PanelId> {
  return useSyncExternalStore(
    (cb) => {
      panelListeners.add(cb);
      return () => panelListeners.delete(cb);
    },
    () => open,
  );
}

// --- toasts ---

export interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'warn' | 'bad';
}

let toasts: readonly Toast[] = [];
let nextId = 1;
const toastListeners = new Set<Listener>();

export function toast(text: string, tone: Toast['tone'] = 'ok', ms = 4500): void {
  const t: Toast = { id: nextId++, text, tone };
  toasts = [...toasts.slice(-3), t];
  for (const l of [...toastListeners]) l();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    for (const l of [...toastListeners]) l();
  }, ms);
}

export function useToasts(): readonly Toast[] {
  return useSyncExternalStore(
    (cb) => {
      toastListeners.add(cb);
      return () => toastListeners.delete(cb);
    },
    () => toasts,
  );
}

/** True while the browser tab is visible; pollers pause otherwise. */
export const visible = (): boolean => typeof document === 'undefined' || document.visibilityState === 'visible';

export const isOpen = (id: PanelId): boolean => open.has(id);
