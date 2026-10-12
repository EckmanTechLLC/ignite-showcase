import { buildUrl, fetchJson, postJson } from '../http.js';

export function listProjects(): Promise<unknown> {
  return fetchJson(buildUrl('/script/projects'));
}

/** Call a project library function, e.g. path "launch.resume". */
export function callLibrary(
  project: string,
  path: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
): Promise<unknown> {
  return postJson(buildUrl('/script/library'), { project, path, args, kwargs });
}

/** Call a system.* function, e.g. "system.tag.readBlocking". */
export function callSystem(
  fn: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
  project?: string,
): Promise<unknown> {
  return postJson(buildUrl('/script/system'), { ...(project ? { project } : {}), function: fn, args, kwargs });
}
