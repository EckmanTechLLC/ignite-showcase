import { getHistory } from './api/tags.js';
import { systemStatus } from './api/system.js';

/**
 * 'ok'          history rows carry values
 * 'unavailable' history answered but every value is null: the historian is not recording
 *               (typically the gateway's 2-hour trial has expired; tags keep moving, history/alarms stop)
 * 'unknown'     no usable answer (request failed or too few rows to judge)
 */
export type HistoryHealth = 'ok' | 'unavailable' | 'unknown';

/** Classify a /tags/history response for one tag: all-null values over >= 2 rows means "unavailable". */
export function classifyHistory(res: unknown): HistoryHealth {
  const rows = (res as { rows?: unknown[][] } | null)?.rows;
  if (!Array.isArray(rows) || rows.length < 2) return 'unknown';
  const anyValue = rows.some((r) => Array.isArray(r) && r.slice(1).some((v) => v !== null && v !== undefined));
  return anyValue ? 'ok' : 'unavailable';
}

/**
 * Cheap trial/historian probe: ask for a few history rows of a tag known to move (and to be historized)
 * over the last `windowMs`. One small request; callers repeat it at a slow cadence (~60 s).
 */
export async function probeHistory(path: string, windowMs = 10 * 60_000, rows = 6): Promise<HistoryHealth> {
  try {
    const end = new Date();
    return classifyHistory(await getHistory([path], new Date(end.getTime() - windowMs), end, rows));
  } catch {
    return 'unknown';
  }
}

export interface HealthProbe {
  /** 'status' = GET /system/status answered; 'history' = route missing (older module), history probe used. */
  source: 'status' | 'history';
  trialExpired: boolean | null;
  trialTimeLeftMs: number | null;
  licenseMode: string | null;
  historian: HistoryHealth | null;
}

/**
 * Licence/trial probe. Asks /system/status first; only when that route is missing (404/405 -> null) does it fall
 * back to the history probe on `fallbackPath` (skipped when no path is given). Never throws.
 */
export async function probeHealth(fallbackPath?: string): Promise<HealthProbe> {
  try {
    const s = await systemStatus();
    if (s) {
      return {
        source: 'status',
        trialExpired: s.license.trialExpired,
        trialTimeLeftMs: s.license.trialTimeLeftMs,
        licenseMode: s.license.mode,
        historian: null,
      };
    }
  } catch {
    return { source: 'status', trialExpired: null, trialTimeLeftMs: null, licenseMode: null, historian: null };
  }
  const historian = fallbackPath ? await probeHistory(fallbackPath) : null;
  return { source: 'history', trialExpired: historian === null || historian === 'unknown' ? null : historian === 'unavailable', trialTimeLeftMs: null, licenseMode: null, historian };
}

/** History/alarms state implied by a probe: 'unknown' when it carried no answer (callers keep their last value). */
export function historyOf(h: HealthProbe): HistoryHealth {
  return h.trialExpired === null ? 'unknown' : h.trialExpired ? 'unavailable' : 'ok';
}

export const TRIAL_EXPIRED_TEXT = 'Trial expired \u2014 history/alarms paused';

/** "Trial \u00b7 1 h 42 m left" while in Trial mode with time left; '' otherwise. */
export function trialDetail(h: Pick<HealthProbe, 'licenseMode' | 'trialExpired' | 'trialTimeLeftMs'>): string {
  if (h.trialExpired || h.licenseMode !== 'Trial' || h.trialTimeLeftMs === null || h.trialTimeLeftMs <= 0) return '';
  const m = Math.floor(h.trialTimeLeftMs / 60_000);
  return `Trial \u00b7 ${m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} m` : `${m} m`} left`;
}
