import { getAuditLogs } from '@ignite/client';
import { auditProfile } from '../../identity.svelte';

export interface AuditRow {
  time: number;
  actor: string;
  action: string;
  target: string;
  value: string;
  ok: boolean;
}

const WINDOW_MS = 30 * 60_000;

/** Rows are keyed 'Actor' / 'Action Target' by Ignition; accept any capitalisation or spacing. */
export function parseAudit(res: unknown): AuditRow[] {
  const list = (res as { result?: unknown[] })?.result;
  if (!Array.isArray(list)) return [];
  const out: AuditRow[] = [];
  for (const r of list) {
    const n: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r as Record<string, unknown>)) n[k.toLowerCase().replace(/[^a-z]/g, '')] = v;
    const time = Number(n.timestamp);
    if (!Number.isFinite(time)) continue;
    out.push({
      time,
      actor: String(n.actor ?? '—'),
      action: String(n.action ?? ''),
      target: String(n.actiontarget ?? ''),
      value: String(n.actionvalue ?? ''),
      ok: Number(n.resultcode ?? 0) === 0,
    });
  }
  return out.sort((a, b) => b.time - a.time);
}

/** Last 30 minutes of the site's audit profile (Director tier; the gateway enforces it). */
export async function fetchAudit(): Promise<AuditRow[]> {
  const now = Date.now();
  return parseAudit(await getAuditLogs({ auditProfile, startDate: now - WINDOW_MS, endDate: now }));
}
