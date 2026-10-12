import { vi } from 'vitest';

export class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

export function mockFetch(status = 200, body: unknown = {}) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function lastCall(fn: ReturnType<typeof mockFetch>) {
  const [url, init] = fn.mock.calls.at(-1) as unknown as [string, RequestInit];
  return { url, init, headers: (init.headers ?? {}) as Record<string, string> };
}

export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, Array<(e: { data: string }) => void>>();
  constructor(public url: string, public init?: unknown) {
    FakeEventSource.instances.push(this);
  }
  close() { this.closed = true; }
  addEventListener(name: string, fn: (e: { data: string }) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]);
  }
  /** Deliver a named SSE event (`event: <name>`). */
  emitNamed(name: string, msg: unknown) {
    const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const fn of this.listeners.get(name) ?? []) fn({ data });
  }
  emit(msg: unknown) { this.onmessage?.({ data: typeof msg === 'string' ? msg : JSON.stringify(msg) }); }
  open() { this.onopen?.(); }
  fail() { this.onerror?.(); }
}
