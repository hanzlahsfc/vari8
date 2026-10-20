import { AccessDeniedError } from "./auth/guard";
import { ConsentError } from "./consent";
import { isSerializationConflict } from "./db";

/**
 * The one closed, non-disclosing boundary vocabulary (BACKEND-REDUCTION
 * F9, R3-15, R3-19). Every `lib/*boundary*.ts` module keeps its own
 * `CLOSED_MESSAGES` message table at its call site, string for string;
 * this module owns the shared machinery that tables plug into:
 *
 * - `SafeResult`: the coded failure shape.
 * - `fail` / `failMessage`: closed failure results.
 * - `mapError`: the shared error skeleton (denied -> consent -> domain
 *   -> raw-serialization backstop -> closed fallback).
 * - `guard`: feature gate first, then the call, errors mapped closed.
 */

export type ClosedMessages<C extends string> = Record<C, string>;

export type SafeResult<C extends string, T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code: C;
      message: string;
      detail?: Record<string, unknown>;
    };

/** fail(): a closed failure result against the domain's message table. */
export function fail<C extends string, T = never>(
  messages: ClosedMessages<C>,
  code: C,
  detail?: Record<string, unknown>,
): SafeResult<C, T> {
  return detail === undefined
    ? { ok: false, code, message: messages[code] }
    : { ok: false, code, message: messages[code], detail };
}

/** fail() for the message-only boundary family (no code crosses). */
export function failMessage(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

/**
 * mapError(): the shared mapping order. AccessDeniedError always maps to
 * the denied surface; ConsentError maps when the domain passes `consent`;
 * the domain's own error class maps through `domain` (null = not ours);
 * a raw serialization conflict maps only where the boundary exposed that
 * backstop; everything else lands on the closed fallback. Each thunk
 * returns the boundary's own failure shape, so coded and message-only
 * boundaries share this skeleton.
 */
export function mapError<F>(
  error: unknown,
  mapping: {
    denied: () => F;
    consent?: (error: ConsentError) => F;
    domain: (error: unknown) => F | null | undefined;
    serializationConflict?: () => F;
    fallback: () => F;
  },
): F {
  if (error instanceof AccessDeniedError) return mapping.denied();
  if (mapping.consent !== undefined && error instanceof ConsentError)
    return mapping.consent(error);
  const mapped = mapping.domain(error);
  if (mapped !== null && mapped !== undefined) return mapped;
  if (
    mapping.serializationConflict !== undefined &&
    isSerializationConflict(error)
  )
    return mapping.serializationConflict();
  return mapping.fallback();
}

/**
 * guard(): the feature boundary FIRST (flag gate before any session or
 * database work), then the call. Any throw maps through the closed
 * vocabulary.
 */
export async function guard<F, T>(
  options: {
    enabled: boolean;
    off: () => F;
    map: (error: unknown) => F;
  },
  fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | F> {
  if (!options.enabled) return options.off();
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return options.map(error);
  }
}
