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
  /** True when the gateway identified a user (Bearer login or Ignition web session), as opposed to the API key alone. */
  loggedIn: boolean;
  /** How the gateway identified the viewer: null = site API key only. 'apiKey' is folded into null. */
  authMethod: 'bearer' | 'web' | null;
  /** True only for a Bearer session (the only kind Log out can end). */
  canLogout: boolean;
  /** Raw Ignition security levels, shown in a tooltip; the tier is computed from permissions only. */
  securityLevels: string[];
}

const ANON: SessionState = { user: null, tier: 'Viewer', canWrite: false, canAdmin: false, loggedIn: false, authMethod: null, canLogout: false, securityLevels: [] };

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

/**
 * Read /auth/session and map permissions to a tier. Called even without a stored token: a gateway admin signed in to
 * the Ignition web UI in this browser arrives as authMethod 'web'. A stored token the server did not accept is dropped.
 */
export async function refreshSession(): Promise<void> {
  try {
    const s = await apiSession();
    const method = s.authMethod === 'bearer' || s.authMethod === 'web' ? s.authMethod : null;
    if (method !== 'bearer' && getToken()) clearToken();
    if (!method || !s.user || s.user.startsWith('api-key:')) {
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
      authMethod: method,
      canLogout: s.canLogout === true && method === 'bearer',
      securityLevels: s.securityLevels ?? [],
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

export async function signOut(everywhere = false): Promise<void> {
  let loggedOut = 0;
  try {
    loggedOut = (await apiLogout({ everywhere })).loggedOut;
  } catch {
    clearToken();
  }
  await refreshSession();
  if (loggedOut > 0) {
    toast(state.authMethod === 'web' ? `Signed out. Back to your gateway session (${state.user}).` : 'Signed out. Viewing as Viewer.', 'warn');
  } else {
    toast('No login session to end.', 'warn');
  }
}

/** Call once at start: restore a stored token and fall back to Viewer on any 401. */
export function startSession(): void {
  onUnauthorized(() => {
    void refreshSession();
    toast('Session expired. Back to Viewer.', 'warn');
  });
  void refreshSession();
  // Server-side expiry or logout elsewhere shows up as a key-only session, not a 401: re-check now and then.
  setInterval(() => state.loggedIn && void refreshSession(), 30_000);
}
