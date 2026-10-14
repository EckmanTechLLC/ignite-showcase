import { buildUrl, fetchJson, HttpError } from '../http.js';

export interface SystemStatus {
  gatewayName: string;
  uptimeMs: number;
  license: {
    /** 'Free' | 'Trial' | 'Activated' | 'Invalid' */
    mode: string;
    trialExpired: boolean;
    /** Null when not in Trial mode. */
    trialTimeLeftMs: number | null;
  };
}

/** GET /system/status (read tier). Resolves null on 404/405 so callers degrade on module builds without the route. */
export async function systemStatus(): Promise<SystemStatus | null> {
  try {
    return await fetchJson<SystemStatus>(buildUrl('/system/status'));
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 405)) return null;
    throw e;
  }
}
