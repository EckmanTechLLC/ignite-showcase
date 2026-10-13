import { session, type Session } from '@ignite/client';

/** Read-only identity chip state (the login panel is task-68). 'apiKey' (the site key alone) counts as nobody. */
export const ident = $state<{ method: 'bearer' | 'web' | null; user: string | null; tier: string; levels: string[] }>({
  method: null,
  user: null,
  tier: 'Anonymous',
  levels: [],
});

function apply(s: Session | null): void {
  const m = s?.authMethod;
  ident.method = m === 'bearer' || m === 'web' ? m : null;
  const u = s?.user ?? null;
  ident.user = ident.method && u && !u.startsWith('api-key:') ? u : null;
  ident.tier = !s || !ident.user ? 'Anonymous' : s.permissions.canAdmin ? 'Director' : s.permissions.canWrite ? 'Operator' : 'Viewer';
  ident.levels = s?.securityLevels ?? [];
}

export async function refreshIdentity(): Promise<void> {
  try {
    apply(await session());
  } catch {
    apply(null);
  }
}

let started = false;
export function startIdentity(): void {
  if (started) return;
  started = true;
  void refreshIdentity();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void refreshIdentity());
}
