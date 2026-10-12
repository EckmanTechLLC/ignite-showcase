import { getHistory } from './api/tags.js';

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
