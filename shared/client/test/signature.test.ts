import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureEnv } from '../src/env.js';
import { HttpError } from '../src/http.js';
import { writeTags } from '../src/api/tags.js';
import { acknowledgeAlarm } from '../src/api/alarms.js';
import { callLibrary } from '../src/api/scripts.js';
import {
  SIGNATURE_MEANINGS,
  SignatureRejectedError,
  SignatureRequiredError,
  type Signature,
} from '../src/api/signature.js';
import { lastCall, MemoryStorage, mockFetch } from './helpers.js';

const sig: Signature = { username: 'u', password: 'pw-not-real', meaning: 'CHANGED' };
const body = (f: ReturnType<typeof mockFetch>) => JSON.parse(lastCall(f).init.body as string);

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  configureEnv({ gatewayUrl: 'https://gw.example', site: 's', key: 'K' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  configureEnv({});
});

describe('request bodies', () => {
  it('writeTags: bare array without opts, object form with opts', async () => {
    const f = mockFetch();
    await writeTags([{ path: 'a', value: 1 }]);
    expect(body(f)).toEqual([{ path: 'a', value: 1 }]);
    await writeTags([{ path: 'a', value: 1 }], { signature: sig, reason: 'why' });
    expect(body(f)).toEqual({ writes: [{ path: 'a', value: 1 }], signature: sig, reason: 'why' });
    await writeTags([{ path: 'a', value: 1 }], { reason: 'only reason' });
    expect(body(f)).toEqual({ writes: [{ path: 'a', value: 1 }], reason: 'only reason' });
  });

  it('acknowledgeAlarm and callLibrary carry signature and reason', async () => {
    const f = mockFetch();
    await acknowledgeAlarm('x');
    expect(body(f)).toEqual({ id: 'x' });
    await acknowledgeAlarm('x', { signature: { ...sig, meaning: 'ACKNOWLEDGED' }, reason: 'r' });
    expect(body(f)).toEqual({ id: 'x', signature: { ...sig, meaning: 'ACKNOWLEDGED' }, reason: 'r' });
    await callLibrary('p', 'a.b', [1]);
    expect(body(f)).toEqual({ project: 'p', path: 'a.b', args: [1], kwargs: {} });
    await callLibrary('p', 'a.b', [1], { signature: sig, reason: 'r' });
    expect(body(f)).toEqual({ project: 'p', path: 'a.b', args: [1], kwargs: {}, signature: sig, reason: 'r' });
  });

  it('puts no password in the URL and lists the meanings', async () => {
    const f = mockFetch();
    await writeTags([], { signature: sig });
    expect(lastCall(f).url).not.toContain('pw-not-real');
    expect(SIGNATURE_MEANINGS).toContain('OVERRIDE');
  });
});

describe('error mapping', () => {
  it('403 signature required', async () => {
    mockFetch(403, { error: 'signature required' });
    const e = await writeTags([]).catch((x) => x);
    expect(e).toBeInstanceOf(SignatureRequiredError);
    expect(e).toBeInstanceOf(HttpError);
    expect(e).not.toBeInstanceOf(SignatureRejectedError);
  });

  it('403 invalid and actor mismatch', async () => {
    for (const msg of ['signature invalid', 'signature actor mismatch']) {
      mockFetch(403, { error: msg });
      const e = await acknowledgeAlarm('x', { signature: sig }).catch((x) => x);
      expect(e).toBeInstanceOf(SignatureRejectedError);
      expect((e as SignatureRejectedError).serverMessage).toBe(msg);
    }
  });

  it('429 lockout carries retryAfterSeconds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Too many failed attempts; try again later' }), { status: 429, headers: { 'Retry-After': '42' } })),
    );
    const e = await callLibrary('p', 'a.b', [], { signature: sig }).catch((x) => x);
    expect(e).toBeInstanceOf(SignatureRejectedError);
    expect((e as SignatureRejectedError).retryAfterSeconds).toBe(42);
  });

  it('other errors stay plain HttpError', async () => {
    mockFetch(403, { error: 'Forbidden' });
    const e = await writeTags([], { signature: sig }).catch((x) => x);
    expect(e).toBeInstanceOf(HttpError);
    expect(e).not.toBeInstanceOf(SignatureRejectedError);
    expect(e).not.toBeInstanceOf(SignatureRequiredError);
  });
});
