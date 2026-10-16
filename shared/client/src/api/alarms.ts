import { buildUrl, fetchJson, postJson, type Params } from '../http.js';
import { mapSignatureError, signFields, type SignOptions } from './signature.js';

export interface Alarm {
  id: string | null;
  source: string | null;
  displayPath: string;
  name: string;
  label: string | null;
  priority: string | null;
  state: string | null;
  isAcked: boolean;
  isCleared: boolean;
  isShelved: boolean;
  activeTime?: string;
  ackTime?: string;
  clearTime?: string;
  notes?: string;
}

export interface AlarmFilters extends Params {
  path?: string;
  state?: string;
}

export interface AlarmHistoryFilters extends AlarmFilters {
  start?: string;
  end?: string;
  journal?: string;
}

export function getAlarmStatus(filters: AlarmFilters = {}): Promise<{ count: number; alarms?: Alarm[] }> {
  return fetchJson(buildUrl('/alarms/status', filters));
}

export function getAlarmHistory(
  filters: AlarmHistoryFilters = {},
): Promise<{ start: string; end: string; count: number; alarms?: Alarm[] }> {
  return fetchJson(buildUrl('/alarms/history', filters));
}

export function acknowledgeAlarm(id: string, opts?: SignOptions): Promise<{ acknowledged: number }> {
  const body = opts ? { id, ...signFields(opts) } : { id };
  return postJson<{ acknowledged: number }>(buildUrl('/alarms/acknowledge'), body).catch((e) => {
    throw mapSignatureError(e, !!opts?.signature);
  });
}
