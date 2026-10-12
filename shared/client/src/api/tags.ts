import { buildUrl, fetchJson, postJson } from '../http.js';

export interface TagValue {
  path: string;
  value: unknown;
  quality: string;
  timestamp: string | null;
}

export interface BrowseNode {
  path: string;
  name?: string;
  hasChildren: boolean;
  type?: string;
  dataType?: string;
}

export interface TagWrite {
  path: string;
  value: unknown;
}

export function readTags(paths: string[]): Promise<{ tags: TagValue[] }> {
  return fetchJson(buildUrl('/tags/read', { paths: paths.join(',') }));
}

export function writeTags(writes: TagWrite[]): Promise<{ results: { path: string; quality: string }[] }> {
  return postJson(buildUrl('/tags/write'), writes);
}

export function browseTags(path = ''): Promise<{ path: string; children: BrowseNode[]; count: number }> {
  return fetchJson(buildUrl('/tags/browse', { path }));
}

/** start/end accept Date or ISO strings; returnSize defaults server-side when omitted. */
export function getHistory(
  paths: string[],
  start: Date | string,
  end: Date | string,
  returnSize?: number,
): Promise<unknown> {
  return fetchJson(
    buildUrl('/tags/history', {
      paths: paths.join(','),
      start: start instanceof Date ? start.toISOString() : start,
      end: end instanceof Date ? end.toISOString() : end,
      returnSize,
    }),
  );
}
