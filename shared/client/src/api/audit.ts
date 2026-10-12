import { buildUrl, fetchJson } from '../http.js';

export interface AuditQuery {
  auditProfile: string;
  /** epoch millis */
  startDate?: number | string;
  endDate?: number | string;
  actor?: string;
  action?: string;
  target?: string;
}

export function getAuditLogs(q: AuditQuery): Promise<unknown> {
  return fetchJson(buildUrl('/audit/logs', { ...q }));
}
