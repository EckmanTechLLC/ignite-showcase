import { useEffect, useState } from 'react';
import { getAuditLogs } from '@ignite/client';
import { visible } from '../ui';

/** The audit profile name arrives as window.__IGNITE_ENV__.IGNITE_AUDIT_PROFILE (site envVars); absent hides the ticker. */
export function auditProfile(): string | null {
  const env = (window as unknown as { __IGNITE_ENV__?: { IGNITE_AUDIT_PROFILE?: string } }).__IGNITE_ENV__;
  return env?.IGNITE_AUDIT_PROFILE || (import.meta.env.DEV ? (import.meta.env.VITE_AUDIT_PROFILE as string | undefined) || null : null);
}

export interface AuditLine {
  at: number;
  actor: string;
  action: string;
  target: string;
  value: string;
}

const WINDOW_MS = 15 * 60 * 1000;
const POLL_MS = 10_000;

/** Rows are keyed 'Actor' / 'Action Target' by Ignition; accept any capitalisation or spacing. */
export function parseAudit(rows: unknown): AuditLine[] {
  const list = (rows as { result?: unknown[] })?.result;
  if (!Array.isArray(list)) return [];
  const out: AuditLine[] = [];
  for (const r of list) {
    const norm: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r as Record<string, unknown>)) norm[k.toLowerCase().replace(/[^a-z]/g, '')] = v;
    const at = Number(norm.timestamp);
    if (!Number.isFinite(at)) continue;
    out.push({
      at,
      actor: String(norm.actor ?? ''),
      action: String(norm.action ?? ''),
      target: String(norm.actiontarget ?? ''),
      value: String(norm.actionvalue ?? ''),
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Tail the last 15 minutes (the panel's own launch.status polls are hidden) of /audit/logs every 10 s while `enabled` (Director tier, panel open, tab visible). */
export function useAuditTail(enabled: boolean): { lines: AuditLine[]; error: string | null } {
  const [lines, setLines] = useState<AuditLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const profile = auditProfile();
    if (!enabled || !profile) return;
    let stop = false;
    const tick = async () => {
      if (!visible()) return;
      try {
        const now = Date.now();
        const r = await getAuditLogs({ auditProfile: profile, startDate: now - WINDOW_MS, endDate: now });
        if (!stop) {
          setLines(parseAudit(r).filter((l) => l.target !== 'launch.status').slice(0, 60));
          setError(null);
        }
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : 'audit unavailable');
      }
    };
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [enabled]);
  return { lines, error };
}
