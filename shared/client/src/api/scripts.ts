import { buildUrl, fetchJson, postJson } from '../http.js';
import { mapSignatureError, signFields, type SignOptions } from './signature.js';

export function listProjects(): Promise<unknown> {
  return fetchJson(buildUrl('/script/projects'));
}

/**
 * Call a project library function, e.g. path "launch.resume". `opts` may carry `kwargs` and, for
 * signed calls, `signature` and `reason`; without `signature`/`reason` the body is unchanged.
 */
export function callLibrary(
  project: string,
  path: string,
  args: unknown[] = [],
  opts: SignOptions & { kwargs?: Record<string, unknown> } = {},
): Promise<unknown> {
  const { kwargs = {}, ...sign } = opts;
  return postJson(buildUrl('/script/library'), { project, path, args, kwargs, ...signFields(sign) }).catch((e) => {
    throw mapSignatureError(e, !!sign.signature);
  });
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
