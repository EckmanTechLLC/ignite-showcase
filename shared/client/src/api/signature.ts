import { HttpError } from '../http.js';

/** Signature meanings accepted by the module (ADR-006). */
export const SIGNATURE_MEANINGS = ['APPROVED', 'REVIEWED', 'CHANGED', 'ACKNOWLEDGED', 'OVERRIDE', 'OTHER'] as const;
export type SignatureMeaning = (typeof SIGNATURE_MEANINGS)[number];

/** An electronic signature (21 CFR Part 11). The password is sent once, in the request body, and never kept. */
export interface Signature {
  username: string;
  password: string;
  meaning: SignatureMeaning;
}

export interface SignOptions {
  signature?: Signature;
  /** At most 200 characters. */
  reason?: string;
}

/** The site requires a signature and the request carried none (403 `signature required`). */
export class SignatureRequiredError extends HttpError {
  constructor(status: number, body: string, retryAfter?: number) {
    super(status, body, retryAfter);
    this.name = 'SignatureRequiredError';
  }
}

/**
 * The signature was refused: 403 `signature invalid` / `signature actor mismatch`, or 429 lockout
 * (`retryAfterSeconds` set). `serverMessage` is the server's own error text.
 */
export class SignatureRejectedError extends HttpError {
  constructor(
    status: number,
    body: string,
    readonly serverMessage: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(status, body, retryAfterSeconds);
    this.name = 'SignatureRejectedError';
  }
}

function errorText(body: string): string {
  try {
    const j = JSON.parse(body) as { error?: unknown };
    if (typeof j.error === 'string') return j.error;
  } catch {
    /* not JSON */
  }
  return body;
}

/** Map a signature-related HttpError to its specific class; anything else is returned unchanged. */
export function mapSignatureError(e: unknown, signed: boolean): unknown {
  if (!(e instanceof HttpError)) return e;
  const msg = errorText(e.body);
  if (e.status === 403 && /^signature required/i.test(msg)) return new SignatureRequiredError(e.status, e.body, e.retryAfter);
  if (e.status === 403 && /^signature (invalid|actor mismatch)/i.test(msg)) {
    return new SignatureRejectedError(e.status, e.body, msg, e.retryAfter);
  }
  if (e.status === 429 && signed) return new SignatureRejectedError(e.status, e.body, msg, e.retryAfter);
  return e;
}

/** The signature/reason members to merge into a request body; empty when there are no options. */
export function signFields(opts: SignOptions): { signature?: Signature; reason?: string } {
  const out: { signature?: Signature; reason?: string } = {};
  if (opts.signature) {
    const { username, password, meaning } = opts.signature;
    out.signature = { username, password, meaning };
  }
  if (opts.reason) out.reason = opts.reason;
  return out;
}
