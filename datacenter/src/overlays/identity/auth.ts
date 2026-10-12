import { computed, shallowRef } from 'vue';
import { HttpError, clearToken, getToken, login, logout, onUnauthorized, session, type Session } from '@ignite/client';
import { toast } from '../ui';

/** Role-generic names (ADR-005 section 7); the lab maps them to its three test accounts. */
export type Tier = 'anonymous' | 'viewer' | 'operator' | 'director';

export const current = shallowRef<Session | null>(null);

export const user = computed(() => {
  const u = current.value?.user ?? null;
  return u && !u.startsWith('api-key:') ? u : null;
});

export const tier = computed<Tier>(() => {
  const s = current.value;
  if (!s || !user.value || !getToken()) return 'anonymous';
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

export async function doLogout(): Promise<void> {
  try {
    await logout();
  } catch {
    clearToken();
  }
  await refreshSession();
  toast('Signed out', 'info');
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
