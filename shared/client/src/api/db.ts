import { buildUrl, postJson } from '../http.js';

/** Run a named query (raw SQL is not supported by the gateway, ADR-004 section 5). */
export function namedQuery(query: string, params: Record<string, unknown> = {}): Promise<unknown> {
  return postJson(buildUrl('/db/query'), { type: 'named', query, params });
}
