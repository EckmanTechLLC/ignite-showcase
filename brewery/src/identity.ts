import { createSignal } from 'solid-js';
import { HttpError, clearToken, getToken, login, logout, onUnauthorized, session, type Session } from '@ignite/client';
import { toast } from './ui';

/** Tier names are role-generic (ADR-005 section 7); the lab maps them to its three test accounts. */
export type Tier = 'Anonymous' | 'Viewer' | 'Operator' | 'Director';
export type Method = 'bearer' | 'web' | null;

/** Identity as the gateway sees it. 'apiKey' (the site key alone) counts as nobody. */
export const [identity, setIdentity] = createSignal<{ method: Method; user: string | null; tier: Tier; levels: string[]; canLogout: boolean }>({
  method: null,
  user: null,
  tier: 'Anonymous',
  levels: [],
  canLogout: false,
});

/** Tier gates for the overlays; each `*Block` is the reason shown on a disabled control, '' when allowed. */
export const canWrite = (): boolean => identity().tier === 'Operator' || identity().tier === 'Director';
export const canAdmin = (): boolean => identity().tier === 'Director';
export const writeBlock = (): string => (canWrite() ? '' : identity().tier === 'Anonymous' ? 'Log in to operate' : 'Operator tier required');
export const adminBlock = (): string => (canAdmin() ? '' : identity().tier === 'Anonymous' ? 'Log in to operate' : 'Director tier required');

/** Audit profile injected by the gateway from the site's envVars; the audit view is hidden when absent. */
export const auditProfile: string = (() => {
  const w = window as Window & { __IGNITE_ENV__?: { IGNITE_AUDIT_PROFILE?: string } };
  return w.__IGNITE_ENV__?.IGNITE_AUDIT_PROFILE ?? '';
})();

/** Pure mapping from a gateway session to the identity state (exported for tests). */
export function toIdentity(s: Session | null): ReturnType<typeof identity> {
  const m = s?.authMethod;
  const method: Method = m === 'bearer' || m === 'web' ? m : null;
  const u = s?.user ?? null;
  const user = method && u && !u.startsWith('api-key:') ? u : null;
  const tier: Tier = !s || !user ? 'Anonymous' : s.permissions.canAdmin ? 'Director' : s.permissions.canWrite ? 'Operator' : 'Viewer';
  return { method, user, tier, levels: s?.securityLevels ?? [], canLogout: method === 'bearer' && s?.canLogout === true };
}

export async function refreshIdentity(): Promise<void> {
  try {
    const s = await session();
    setIdentity(toIdentity(s));
    // A stored token the server did not accept (bearer wins when valid) is dead: drop it.
    if (s.authMethod !== 'bearer' && getToken()) clearToken();
  } catch {
    setIdentity(toIdentity(null));
  }
}

/** Throws a user-facing Error on failure (401 stays generic, 429 mentions the lockout). */
export async function doLogin(username: string, password: string): Promise<void> {
  try {
    await login(username, password);
  } catch (e) {
    if (e instanceof HttpError && e.status === 429) throw new Error('Too many attempts. Wait a few minutes and try again.');
    if (e instanceof HttpError && e.status === 401) throw new Error('Login failed. Check the user name and password.');
    throw new Error('Login unavailable. Is the gateway reachable?');
  }
  await refreshIdentity();
  toast(`Signed in as ${identity().tier}`, 'ok');
}

export async function doLogout(everywhere = false): Promise<void> {
  let loggedOut = 0;
  try {
    loggedOut = (await logout({ everywhere })).loggedOut;
  } catch {
    clearToken();
  }
  await refreshIdentity();
  if (loggedOut > 0) toast(identity().method === 'web' ? `Signed out. Back to your gateway session (${identity().user}).` : 'Signed out', 'info');
  else toast('No login session to end.', 'warn');
}

let started = false;
/** Restore a stored session; demote automatically when the server rejects the token or the tab comes back. */
export function startIdentity(): void {
  if (started) return;
  started = true;
  void refreshIdentity();
  onUnauthorized(() => {
    void refreshIdentity();
    toast('Session expired. You are read-only again.', 'warn');
  });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void refreshIdentity());
}
