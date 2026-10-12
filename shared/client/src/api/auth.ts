import { buildUrl, clearToken, fetchJson, getToken, postJson, setToken } from '../http.js';

export interface LoginResult {
  token: string;
  user: string;
  roles: string[];
  expiresIn: number;
}

export interface Session {
  authenticated: boolean;
  user: string | null;
  authMethod: string | null;
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

/** Invalidate the server session (best effort) and always clear the local token. */
export async function logout(): Promise<void> {
  try {
    if (getToken()) await postJson(buildUrl('/auth/logout'), {});
  } finally {
    clearToken();
  }
}
