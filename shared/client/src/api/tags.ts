import { buildUrl, fetchJson, postJson } from '../http.js';
import { mapSignatureError, signFields, type SignOptions } from './signature.js';

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

/** Without `opts` the body is the bare array (unchanged); with `opts` it is `{writes, signature?, reason?}`. */
export function writeTags(
  writes: TagWrite[],
  opts?: SignOptions,
): Promise<{ results: { path: string; quality: string }[] }> {
  const body = opts ? { writes, ...signFields(opts) } : writes;
  return postJson<{ results: { path: string; quality: string }[] }>(buildUrl('/tags/write'), body).catch((e) => {
    throw mapSignatureError(e, !!opts?.signature);
  });
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
