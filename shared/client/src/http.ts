import { readEnv } from './env.js';

export const TOKEN_KEY = 'ignite_token';

export type Params = Record<string, string | number | boolean | null | undefined>;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    /** Seconds from a Retry-After header (429 lockout), when present. */
    readonly retryAfter?: number,
  ) {
    super(`HTTP ${status}: ${body || 'request failed'}`);
    this.name = 'HttpError';
  }
}

// --- token storage (localStorage may be unavailable) ---

export function getToken(): string | null {
  try {
    return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    globalThis.localStorage?.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearToken(): void {
  try {
    globalThis.localStorage?.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

// --- events ---

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

/** Subscribe to 401 responses received while a token was stored. Returns an unsubscribe function. */
export function onUnauthorized(fn: Listener): () => void {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

function emitUnauthorized(): void {
  for (const fn of [...unauthorizedListeners]) fn();
}

// --- URLs and headers ---

export function apiBase(): string {
  return `${readEnv().gatewayUrl}/data/ignite`;
}

export function toQuery(params: Params): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/** Build an API URL. Never carries credentials: the key travels in a header (ADR-004), SSE aside. */
export function buildUrl(path: string, params: Params = {}): string {
  return `${apiBase()}${path}${toQuery(params)}`;
}

export function authHeaders(): Record<string, string> {
  const { site, key } = readEnv();
  const token = getToken();
  const h: Record<string, string> = {};
  if (site) h['X-Ignite-Site'] = site;
  if (key) h['X-Ignite-Key'] = key;
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const hadToken = getToken() !== null;
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) {
    if (res.status === 401 && hadToken) {
      clearToken();
      emitUnauthorized();
    }
    const text = await res.text().catch(() => '');
    const ra = Number(res.headers.get('Retry-After'));
    throw new HttpError(res.status, text || res.statusText, Number.isFinite(ra) && ra > 0 ? ra : undefined);
  }
  return (await res.json()) as T;
}

export function fetchJson<T = unknown>(url: string): Promise<T> {
  return request<T>(url, { headers: authHeaders() });
}

export function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
}
