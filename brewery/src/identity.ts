import { createSignal } from 'solid-js';
import { clearToken, getToken, onUnauthorized, session, type Session } from '@ignite/client';

/** Identity as the gateway sees it, read-only in this task (login and audit arrive with the overlays). */
export type Method = 'bearer' | 'web' | null;
export const [identity, setIdentity] = createSignal<{ method: Method; user: string | null; levels: string[] }>({
  method: null,
  user: null,
  levels: [],
});

function apply(s: Session | null): void {
  const m = s?.authMethod;
  const method: Method = m === 'bearer' || m === 'web' ? m : null;
  const u = s?.user ?? null;
  setIdentity({ method, user: method && u && !u.startsWith('api-key:') ? u : null, levels: s?.securityLevels ?? [] });
}

export async function refreshIdentity(): Promise<void> {
  try {
    const s = await session();
    apply(s);
    // A stored token the server did not accept (bearer wins when valid) is dead: drop it.
    if (s.authMethod !== 'bearer' && getToken()) clearToken();
  } catch {
    apply(null);
  }
}

let started = false;
export function startIdentity(): void {
  if (started) return;
  started = true;
  void refreshIdentity();
  onUnauthorized(() => void refreshIdentity());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void refreshIdentity());
}
