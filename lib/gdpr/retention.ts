import { ACCESS_TOKEN_TERMINAL_RETENTION_MS } from "../tokens/store";
import { consentGatesEnabled, type ConsentGateEnv } from "../runtime";

/**
 * S1-G retention: policy represented as data, evaluation only.
 *
 * Every record family's duration is `TODO(human)` — none is invented. The one
 * decided duration (30-day terminal `access_token` cleanup, founder decision
 * #26) is owned and implemented by `lib/tokens/store.ts`
 * (`cleanupTerminalAccessTokens`); the policy map references that constant
 * read-only rather than duplicating it.
 *
 * `evaluateRetention` is all-or-nothing fail closed: while ANY family is
 * unset it returns an empty set, so nothing can ever be considered "due".
 * There is deliberately no timer, job runner, or startup hook —
 * `assertAutomaticRetentionConfigured` fails closed until human policy lands.
 */

export const RETENTION_FAMILIES = [
  "clientProfile",
  "consentRecord",
  "auditEvent",
  "accessToken",
  // Health families exist as names only — no health tables exist yet.
  "dailyTracking",
  "cycleData",
  "nutrition",
  "training",
  "checkIn",
  "note",
  "bloodwork",
  "pedHrt",
  "media",
] as const;
export type RetentionFamily = (typeof RETENTION_FAMILIES)[number];

export type RetentionPolicyEntry = { retainForMs: number | null };
export type RetentionPolicy = Readonly<
  Record<RetentionFamily, RetentionPolicyEntry>
>;

export const RETENTION_POLICY: RetentionPolicy = {
  clientProfile: { retainForMs: null }, // TODO(human)
  consentRecord: { retainForMs: null }, // TODO(human)
  auditEvent: { retainForMs: null }, // TODO(human)
  // Founder-decided 30-day terminal cleanup — referenced read-only; the
  // owning implementation is lib/tokens/store.ts.
  accessToken: { retainForMs: ACCESS_TOKEN_TERMINAL_RETENTION_MS },
  dailyTracking: { retainForMs: null }, // TODO(human)
  cycleData: { retainForMs: null }, // TODO(human)
  nutrition: { retainForMs: null }, // TODO(human)
  training: { retainForMs: null }, // TODO(human)
  checkIn: { retainForMs: null }, // TODO(human)
  note: { retainForMs: null }, // TODO(human)
  bloodwork: { retainForMs: null }, // TODO(human)
  pedHrt: { retainForMs: null }, // TODO(human)
  media: { retainForMs: null }, // TODO(human)
};

export class RetentionError extends Error {
  constructor(readonly code: "invalid_input" | "retention_not_configured") {
    super(code);
    this.name = "RetentionError";
  }
}

export function retentionFamilies(): readonly RetentionFamily[] {
  return RETENTION_FAMILIES;
}

function isValidPolicyEntry(value: unknown): value is RetentionPolicyEntry {
  if (value === null || typeof value !== "object") return false;
  const retainForMs = (value as RetentionPolicyEntry).retainForMs;
  return (
    retainForMs === null ||
    (typeof retainForMs === "number" &&
      Number.isFinite(retainForMs) &&
      retainForMs >= 0)
  );
}

/**
 * Evaluate which families have a configured cutoff at `now`. Returns `[]`
 * while any family duration is unset — a partially configured policy can
 * never make anything due.
 */
export function evaluateRetention(
  now: Date = new Date(),
  policy: RetentionPolicy = RETENTION_POLICY,
): { family: RetentionFamily; cutoff: Date }[] {
  if (!(now instanceof Date) || Number.isNaN(now.getTime()))
    throw new RetentionError("invalid_input");
  if (policy === null || typeof policy !== "object" || Array.isArray(policy))
    throw new RetentionError("invalid_input");
  const keys = Object.keys(policy);
  if (
    keys.length !== RETENTION_FAMILIES.length ||
    !RETENTION_FAMILIES.every((family) => keys.includes(family)) ||
    !RETENTION_FAMILIES.every((family) => isValidPolicyEntry(policy[family]))
  )
    throw new RetentionError("invalid_input");
  const entries = RETENTION_FAMILIES.map((family) => ({
    family,
    retainForMs: policy[family].retainForMs,
  }));
  if (entries.some((entry) => entry.retainForMs === null)) return [];
  return entries.map(({ family, retainForMs }) => ({
    family,
    cutoff: new Date(now.getTime() - (retainForMs as number)),
  }));
}

/**
 * Automatic retention enforcement is forbidden until human policy supplies
 * durations and an approved runner exists. No code may arrange or trigger
 * cleanup through this module.
 *
 * D19: a parked consent/health-data gate — with `ENABLE_CONSENT_GATES`
 * off the assertion allows; when set it keeps failing closed as before.
 */
export function assertAutomaticRetentionConfigured(
  env: ConsentGateEnv = process.env,
): void {
  if (!consentGatesEnabled(env)) return;
  throw new RetentionError("retention_not_configured");
}
