import { HttpError, buildUrl, clearToken, fetchJson, getToken, postJson, setToken } from '../http.js';

export interface LoginResult {
  token: string;
  user: string;
  roles: string[];
  expiresIn: number;
}

export interface Session {
  authenticated: boolean;
  user: string | null;
  /** How the gateway identified the caller: Bearer login, Ignition web (gateway) session, site API key, or nobody. */
  authMethod: 'bearer' | 'web' | 'apiKey' | null;
  /** True only for a Bearer session (the only kind /auth/logout can end). */
  canLogout: boolean;
  securityLevels: string[];
  permissions: { canWrite: boolean; canAdmin: boolean; canAdminGateway: boolean };
  site: string | null;
}

/** Authenticate and store the Bearer token in localStorage['ignite_token']. */
export async function login(username: string, password: string): Promise<LoginResult> {
  const result = await postJson<LoginResult>(buildUrl('/auth/login'), { username, password });
  setToken(result.token);
  return result;
}

export function session(): Promise<Session> {
  return fetchJson(buildUrl('/auth/session'));
}

/**
 * Invalidate the caller's Bearer session (all of the user's with `everywhere`) and always clear the local token.
 * Resolves with `{ loggedOut: 0 }` when there was nothing to log out (no token, or the 400 for a non-bearer caller).
 */
export async function logout(opts: { everywhere?: boolean } = {}): Promise<{ loggedOut: number }> {
  try {
    if (!getToken()) return { loggedOut: 0 };
    const body = opts.everywhere ? { everywhere: true } : {};
    return await postJson<{ loggedOut: number }>(buildUrl('/auth/logout'), body);
  } catch (e) {
    if (e instanceof HttpError && e.status === 400) return { loggedOut: 0 };
    throw e;
  } finally {
    clearToken();
  }
}
