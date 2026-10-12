export interface IgniteEnv {
  /** Gateway origin without trailing slash; empty string means same origin. */
  gatewayUrl: string;
  site: string;
  key: string;
}

interface InjectedEnv {
  IGNITE_GATEWAY_URL?: string;
  IGNITE_SITE?: string;
  IGNITE_API_KEY?: string;
}

let overrides: Partial<IgniteEnv> = {};

/** Explicit override (highest precedence). Mainly for tests and non-standard hosts. */
export function configureEnv(next: Partial<IgniteEnv>): void {
  overrides = { ...next };
}

function injected(): InjectedEnv {
  const w = (typeof window !== 'undefined' ? window : undefined) as
    | (Window & { __IGNITE_ENV__?: InjectedEnv })
    | undefined;
  return w?.__IGNITE_ENV__ ?? {};
}

function viteEnv(): Record<string, string | undefined> {
  // Present only when the consumer is built/served by Vite; VITE_* are dev-time fallbacks.
  return ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {};
}

/**
 * Resolution order: configureEnv() override, the gateway-injected window.__IGNITE_ENV__,
 * then VITE_GATEWAY_URL / VITE_SITE / VITE_API_KEY for local development.
 */
export function readEnv(): IgniteEnv {
  const inj = injected();
  const vite = viteEnv();
  const gatewayUrl = overrides.gatewayUrl ?? inj.IGNITE_GATEWAY_URL ?? vite.VITE_GATEWAY_URL ?? '';
  return {
    gatewayUrl: gatewayUrl.replace(/\/+$/, ''),
    site: overrides.site ?? inj.IGNITE_SITE ?? vite.VITE_SITE ?? '',
    key: overrides.key ?? inj.IGNITE_API_KEY ?? vite.VITE_API_KEY ?? '',
  };
}
