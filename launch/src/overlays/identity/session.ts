import { useSyncExternalStore } from 'react';
import { clearToken, getToken, login as apiLogin, logout as apiLogout, onUnauthorized, session as apiSession, HttpError } from '@ignite/client';
import { toast } from '../ui';

/**
 * Session identity. Tiers are role-generic in the UI (ADR-005 section 7): Viewer (no write), Operator
 * (permissions.canWrite), Director (permissions.canAdmin). The server enforces; this only drives the UI.
 */

export type Tier = 'Viewer' | 'Operator' | 'Director';

export interface SessionState {
  user: string | null;
  tier: Tier;
  canWrite: boolean;
  canAdmin: boolean;
  /** True while a token is stored (a logged-in user, as opposed to the API key alone). */
  loggedIn: boolean;
}

const ANON: SessionState = { user: null, tier: 'Viewer', canWrite: false, canAdmin: false, loggedIn: false };

let state: SessionState = ANON;
const listeners = new Set<() => void>();

function set(next: SessionState): void {
  state = next;
  for (const l of [...listeners]) l();
}

export const getSession = (): SessionState => state;

export function useSession(): SessionState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

/** Read /auth/session and map permissions to a tier. Without a stored token the user is a Viewer. */
export async function refreshSession(): Promise<void> {
  if (!getToken()) {
    set(ANON);
    return;
  }
  try {
    const s = await apiSession();
    // An expired or unknown token falls back to the site key: the gateway answers 200 as 'api-key:<site>'.
    if (!s.user || s.user.startsWith('api-key:')) {
      clearToken();
      set(ANON);
      return;
    }
    const canAdmin = s.permissions.canAdmin;
    const canWrite = s.permissions.canWrite;
    set({
      user: s.user,
      tier: canAdmin ? 'Director' : canWrite ? 'Operator' : 'Viewer',
      canWrite,
      canAdmin,
      loggedIn: true,
    });
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) set(ANON);
  }
}

/** Returns an error message for the form, or null on success. */
export async function signIn(username: string, password: string): Promise<string | null> {
  try {
    await apiLogin(username, password);
  } catch (e) {
    if (e instanceof HttpError && e.status === 429) {
      return e.retryAfter ? `Too many attempts. Try again in ${Math.ceil(e.retryAfter / 60)} min (${e.retryAfter} s).` : 'Too many attempts. Try again later.';
    }
    return 'Sign-in failed. Check the username and password.';
  }
  await refreshSession();
  toast(`Signed in as ${state.user ?? username} (${state.tier})`);
  return null;
}

export async function signOut(): Promise<void> {
  try {
    await apiLogout();
  } catch {
    clearToken();
  }
  set(ANON);
  toast('Signed out. Viewing as Viewer.', 'warn');
}

/** Call once at start: restore a stored token and fall back to Viewer on any 401. */
export function startSession(): void {
  onUnauthorized(() => {
    set(ANON);
    toast('Session expired. Back to Viewer.', 'warn');
  });
  void refreshSession();
  // Server-side expiry or logout elsewhere shows up as a key-only session, not a 401: re-check now and then.
  setInterval(() => state.loggedIn && void refreshSession(), 30_000);
}
