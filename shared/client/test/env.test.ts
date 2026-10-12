import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureEnv, readEnv } from '../src/env.js';

afterEach(() => {
  vi.unstubAllGlobals();
  configureEnv({});
});

describe('env', () => {
  it('reads window.__IGNITE_ENV__ and strips trailing slash', () => {
    vi.stubGlobal('window', {
      __IGNITE_ENV__: { IGNITE_GATEWAY_URL: 'https://g.example//', IGNITE_SITE: 's', IGNITE_API_KEY: 'k' },
    });
    expect(readEnv()).toEqual({ gatewayUrl: 'https://g.example', site: 's', key: 'k' });
  });

  it('configureEnv overrides the injected value', () => {
    vi.stubGlobal('window', { __IGNITE_ENV__: { IGNITE_SITE: 'inj' } });
    configureEnv({ site: 'dev' });
    expect(readEnv().site).toBe('dev');
  });
});
