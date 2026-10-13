import { computed, shallowRef } from 'vue';
import { HttpError, clearToken, getToken, login, logout, onUnauthorized, session, type Session } from '@ignite/client';
import { toast } from '../ui';

/** Role-generic names (ADR-005 section 7); the lab maps them to its three test accounts. */
export type Tier = 'anonymous' | 'viewer' | 'operator' | 'director';

export const current = shallowRef<Session | null>(null);

/** How the gateway identified the viewer. 'apiKey' (site key alone) counts as nobody. */
export const method = computed<'bearer' | 'web' | null>(() => {
  const m = current.value?.authMethod;
  return m === 'bearer' || m === 'web' ? m : null;
});

export const user = computed(() => {
  const u = current.value?.user ?? null;
  return method.value && u && !u.startsWith('api-key:') ? u : null;
});

export const canLogout = computed(() => method.value === 'bearer' && current.value?.canLogout === true);
export const securityLevels = computed(() => current.value?.securityLevels ?? []);

export const tier = computed<Tier>(() => {
  const s = current.value;
  if (!s || !user.value) return 'anonymous';
  if (s.permissions.canAdmin) return 'director';
  if (s.permissions.canWrite) return 'operator';
  return 'viewer';
});

export const TIER_LABEL: Record<Tier, string> = { anonymous: 'Anonymous', viewer: 'Viewer', operator: 'Operator', director: 'Director' };
export const canWrite = computed(() => tier.value === 'operator' || tier.value === 'director');
export const canAdmin = computed(() => tier.value === 'director');

/** Why a write action is unavailable, or '' when it is allowed. */
export const writeBlock = computed(() => (canWrite.value ? '' : tier.value === 'anonymous' ? 'Log in to operate' : 'Operator tier required'));
export const adminBlock = computed(() => (canAdmin.value ? '' : tier.value === 'anonymous' ? 'Log in to operate' : 'Director tier required'));

/** Audit profile injected by the gateway from the site's envVars; audit view is hidden when absent. */
export const auditProfile: string = (() => {
  const w = window as Window & { __IGNITE_ENV__?: { IGNITE_AUDIT_PROFILE?: string } };
  return w.__IGNITE_ENV__?.IGNITE_AUDIT_PROFILE ?? '';
})();

export async function refreshSession(): Promise<void> {
  try {
    current.value = await session();
    // A stored token the server did not accept (bearer wins when valid) is dead: drop it.
    if (current.value.authMethod !== 'bearer' && getToken()) clearToken();
  } catch {
    current.value = null;
  }
}

/** Throws a user-facing Error message on failure (401 stays generic, 429 mentions the lockout). */
export async function doLogin(username: string, password: string): Promise<void> {
  try {
    await login(username, password);
  } catch (e) {
    if (e instanceof HttpError && e.status === 429) throw new Error('Too many attempts. Wait a few minutes and try again.');
    if (e instanceof HttpError && e.status === 401) throw new Error('Login failed. Check the user name and password.');
    throw new Error('Login unavailable. Is the gateway reachable?');
  }
  await refreshSession();
  toast(`Signed in as ${TIER_LABEL[tier.value]}`, 'ok');
}

export async function doLogout(everywhere = false): Promise<void> {
  let loggedOut = 0;
  try {
    loggedOut = (await logout({ everywhere })).loggedOut;
  } catch {
    clearToken();
  }
  await refreshSession();
  if (loggedOut > 0) toast(method.value === 'web' ? `Signed out. Back to your gateway session (${user.value}).` : 'Signed out', 'info');
  else toast('No login session to end.', 'warn');
}

let started = false;
/** Restore a stored session and demote automatically when the server rejects the token. */
export function startAuth(): void {
  if (started) return;
  started = true;
  void refreshSession();
  onUnauthorized(() => {
    void refreshSession();
    toast('Session expired. You are read-only again.', 'warn');
  });
}
