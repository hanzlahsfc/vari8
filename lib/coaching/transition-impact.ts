import { createHash } from "node:crypto";

import { ClientSetupTransitionError } from "./client-setup-transition-gate";
import type { TransitionDirection } from "./transition-diff";

/**
 * P-020B — C2 provider/impact framework (P-020-R3 §15–§18 + R3.1 addendum 2).
 *
 * Separate explicit `DECLARED_CONSUMERS` and `PROVIDERS` maps with static
 * imports only — no import walker, no side-effect registration. Exact
 * key-set equality is enforced both ways: a declaration without a provider
 * and a provider without a declaration are both fail-closed configuration
 * errors (never converted into BlockedReasonCodes).
 *
 * PRODUCTION STATE IN THIS SLICE: zero declared consumers and zero providers
 * — honestly meaning "no data-consuming feature exists", never "history is
 * zero". DailyEntry must add its declaration + provider + tests atomically
 * in its own separately-authorized task; any registration change alters the
 * provider-set identity and stale-fails every outstanding review.
 *
 * CanonicalCount is an unsigned ASCII base-10 STRING ("0" valid, no leading
 * zeros on positives, no sign/whitespace/decimal/exponent/grouping) —
 * BigInt for internal comparisons, never Number. Dates are canonical real
 * calendar `YYYY-MM-DD`; count "0" requires both bounds NULL, positive
 * requires both present and earliest ≤ latest. Counts/dates are runtime
 * review material only — never persisted to summaries or audit meta.
 */

// ── Closed vocabularies (P-020-R3.1 addendum 2 — exact initial sets) ─────

export type ImpactReasonCode = "REMOVED_WITH_HISTORY" | "REBOUND_WITH_HISTORY";

export type ImpactRole = "REMOVED" | "REBOUND_FROM" | "REBOUND_TO";

export type BlockedReasonCode =
  | "TARGET_INELIGIBLE"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_VERSION_MISMATCH"
  | "PROVIDER_EXECUTION_FAILED"
  | "PROVIDER_OUTPUT_INVALID"
  | "PROVIDER_REPORTED_BLOCK";

/** Explicit rank tables — deterministic ordering, never locale sort. */
export const IMPACT_REASON_RANK: Record<ImpactReasonCode, number> = {
  REMOVED_WITH_HISTORY: 0,
  REBOUND_WITH_HISTORY: 1,
};

export const IMPACT_ROLE_RANK: Record<ImpactRole, number> = {
  REMOVED: 0,
  REBOUND_FROM: 1,
  REBOUND_TO: 2,
};

export const BLOCKED_REASON_RANK: Record<BlockedReasonCode, number> = {
  TARGET_INELIGIBLE: 0,
  PROVIDER_UNAVAILABLE: 1,
  PROVIDER_VERSION_MISMATCH: 2,
  PROVIDER_EXECUTION_FAILED: 3,
  PROVIDER_OUTPUT_INVALID: 4,
  PROVIDER_REPORTED_BLOCK: 5,
};

const IMPACT_ROLES = new Set<string>(Object.keys(IMPACT_ROLE_RANK));
const BLOCKED_REASONS = new Set<string>(Object.keys(BLOCKED_REASON_RANK));

// ── Canonical primitives ─────────────────────────────────────────────────

export type CanonicalCount = string;

/** Unsigned ASCII base-10: "0" allowed; positives have no leading zero; no
 * sign, whitespace, decimal point, exponent, or grouping separators. */
export function isCanonicalCount(value: unknown): value is CanonicalCount {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value);
}

/** Canonical real-calendar `YYYY-MM-DD` — no timezone conversion. */
export function isCanonicalCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/** count "0" ⇒ both bounds NULL; positive ⇒ both present, earliest ≤
 * latest. One-sided/malformed fails closed. BigInt comparison — never
 * Number coercion. */
export function isValidImpactBounds(
  count: unknown,
  earliestDate: unknown,
  latestDate: unknown,
): boolean {
  if (!isCanonicalCount(count)) return false;
  if (count === "0") return earliestDate === null && latestDate === null;
  if (
    !isCanonicalCalendarDate(earliestDate) ||
    !isCanonicalCalendarDate(latestDate)
  )
    return false;
  return (earliestDate as string) <= (latestDate as string);
}

// ── Contracts ────────────────────────────────────────────────────────────

export type ParameterImpact = {
  /** Server-side correlation only — stripped before browser output. */
  parameterId: string;
  parameterKey: string;
  impactRole: ImpactRole;
  count: CanonicalCount;
  earliestDate: string | null;
  latestDate: string | null;
  reasonCode: ImpactReasonCode;
};

export type ProviderImpact = {
  consumerKey: string;
  contractVersion: number;
  /** Deterministically sorted (parameterKey → impactRole rank). */
  affectedParameters: ParameterImpact[];
  blockedReasonCodes: BlockedReasonCode[];
};

export type ConsumerDeclaration = {
  consumerKey: string;
  contractVersion: number;
  outputSchemaVersion: number;
};

export type TransitionImpactInput = {
  direction: TransitionDirection;
  removed: Array<{ parameterId: string; parameterKey: string }>;
  reboundFrom: Array<{ parameterId: string; parameterKey: string }>;
  reboundTo: Array<{ parameterId: string; parameterKey: string }>;
};

export type TransitionImpactProvider = {
  evaluate(
    input: TransitionImpactInput,
  ): ProviderImpact | Promise<ProviderImpact>;
};

export type ProviderSet = {
  declarations: readonly ConsumerDeclaration[];
  providers: Readonly<Record<string, TransitionImpactProvider>>;
};

// ── Production provider set — honestly empty ─────────────────────────────

/** No data-consuming feature exists yet — the empty identity means exactly
 * that (never "history is zero"). */
export const DECLARED_CONSUMERS: readonly ConsumerDeclaration[] = [];
export const PROVIDERS: Readonly<Record<string, TransitionImpactProvider>> = {};

// ── Set validation (module-init + injectable for tests) ──────────────────

const isPositiveInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v > 0;

/** Exact key-set equality between declarations and providers; unique
 * declaration keys; positive-integer contract/output versions. Any
 * deviation is a typed fail-closed configuration error. */
export function validateProviderSet(
  declarations: readonly ConsumerDeclaration[],
  providers: Readonly<Record<string, TransitionImpactProvider>>,
): void {
  const keys = new Set<string>();
  for (const d of declarations) {
    if (
      !d ||
      typeof d.consumerKey !== "string" ||
      d.consumerKey.length === 0 ||
      !isPositiveInt(d.contractVersion) ||
      !isPositiveInt(d.outputSchemaVersion)
    )
      throw new ClientSetupTransitionError("provider_configuration");
    if (keys.has(d.consumerKey))
      throw new ClientSetupTransitionError("provider_configuration");
    keys.add(d.consumerKey);
  }
  for (const key of Object.keys(providers)) {
    if (!keys.has(key))
      throw new ClientSetupTransitionError("provider_configuration");
  }
  for (const key of keys) {
    if (typeof providers[key]?.evaluate !== "function")
      throw new ClientSetupTransitionError("provider_configuration");
  }
}

// ── Identity + canonical output hashes ───────────────────────────────────

const lp = (s: string) => `${Buffer.byteLength(s, "utf8")}:${s}`;

export const PROVIDER_SET_MANIFEST_VERSION = 1;

/** Provider-set identity: SHA-256 of the versioned domain, manifest schema
 * version, and sorted (consumerKey, contractVersion, outputSchemaVersion)
 * tuples. Registration changes ⇒ new identity ⇒ all prior fingerprints
 * stale. */
export function providerSetIdentity(
  declarations: readonly ConsumerDeclaration[],
): string {
  const sorted = [...declarations].sort((a, b) =>
    a.consumerKey === b.consumerKey
      ? a.contractVersion - b.contractVersion ||
        a.outputSchemaVersion - b.outputSchemaVersion
      : a.consumerKey < b.consumerKey
        ? -1
        : 1,
  );
  const hash = createHash("sha256");
  hash.update("C2-PROVIDER-SET-v1\x00");
  hash.update(lp(String(PROVIDER_SET_MANIFEST_VERSION)));
  hash.update(lp(String(sorted.length)));
  for (const d of sorted) {
    hash.update(
      lp(d.consumerKey) +
        lp(String(d.contractVersion)) +
        lp(String(d.outputSchemaVersion)),
    );
  }
  return hash.digest("hex");
}

/** Canonical hash of validated provider outputs — fingerprint material. */
export function canonicalProviderOutputsHash(
  impacts: readonly ProviderImpact[],
): string {
  const hash = createHash("sha256");
  hash.update("C2-PROVIDER-OUT-v1\x00");
  hash.update(lp(String(impacts.length)));
  for (const impact of impacts) {
    hash.update(lp(impact.consumerKey) + lp(String(impact.contractVersion)));
    hash.update(lp(String(impact.affectedParameters.length)));
    for (const p of impact.affectedParameters) {
      hash.update(
        lp(p.parameterId) +
          lp(p.parameterKey) +
          lp(p.impactRole) +
          lp(p.count) +
          lp(p.earliestDate ?? "") +
          lp(p.latestDate ?? "") +
          lp(p.reasonCode),
      );
    }
    hash.update(lp(String(impact.blockedReasonCodes.length)));
    for (const code of impact.blockedReasonCodes) hash.update(lp(code));
  }
  return hash.digest("hex");
}

// ── Provider output validation ───────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function roleFor(
  input: TransitionImpactInput,
  parameterId: string,
): ImpactRole | null {
  if (input.removed.some((p) => p.parameterId === parameterId))
    return "REMOVED";
  if (input.reboundFrom.some((p) => p.parameterId === parameterId))
    return "REBOUND_FROM";
  if (input.reboundTo.some((p) => p.parameterId === parameterId))
    return "REBOUND_TO";
  return null;
}

function expectedReasonCode(role: ImpactRole): ImpactReasonCode {
  return role === "REMOVED" ? "REMOVED_WITH_HISTORY" : "REBOUND_WITH_HISTORY";
}

/**
 * Validates one provider's raw output: identity must match its declaration;
 * every affected parameter must reference a known diff identity with the
 * matching role/key; counts and dates canonical; reason/blocked codes
 * inside the closed unions; strict (parameterKey → roleRank) ordering. On
 * any failure returns a sentinel — the caller maps it to a blocked code.
 */
function validateProviderOutput(
  declaration: ConsumerDeclaration,
  raw: unknown,
  input: TransitionImpactInput,
): { ok: true; impact: ProviderImpact } | { ok: false; mismatch: boolean } {
  if (!isPlainObject(raw)) return { ok: false, mismatch: false };
  if (
    raw.consumerKey !== declaration.consumerKey ||
    raw.contractVersion !== declaration.contractVersion
  )
    return { ok: false, mismatch: true };

  const blocked: BlockedReasonCode[] = [];
  const rawBlocked = raw.blockedReasonCodes;
  if (!Array.isArray(rawBlocked)) return { ok: false, mismatch: false };
  for (const code of rawBlocked) {
    if (typeof code !== "string" || !BLOCKED_REASONS.has(code))
      return { ok: false, mismatch: false };
    blocked.push(code as BlockedReasonCode);
  }

  const rawParams = raw.affectedParameters;
  if (!Array.isArray(rawParams)) return { ok: false, mismatch: false };
  const affected: ParameterImpact[] = [];
  let lastKey = "";
  let lastRoleRank = -1;
  for (const entry of rawParams) {
    if (!isPlainObject(entry)) return { ok: false, mismatch: false };
    const { parameterId, parameterKey, impactRole } = entry;
    if (
      typeof parameterId !== "string" ||
      typeof parameterKey !== "string" ||
      typeof impactRole !== "string" ||
      !IMPACT_ROLES.has(impactRole)
    )
      return { ok: false, mismatch: false };
    const role = impactRole as ImpactRole;
    const expectedRole = roleFor(input, parameterId);
    if (expectedRole !== role) return { ok: false, mismatch: false };
    const known = [
      ...input.removed,
      ...input.reboundFrom,
      ...input.reboundTo,
    ].find((p) => p.parameterId === parameterId);
    if (!known || known.parameterKey !== parameterKey)
      return { ok: false, mismatch: false };
    if (entry.reasonCode !== expectedReasonCode(role))
      return { ok: false, mismatch: false };
    if (!isValidImpactBounds(entry.count, entry.earliestDate, entry.latestDate))
      return { ok: false, mismatch: false };
    const roleRank = IMPACT_ROLE_RANK[role];
    if (
      parameterKey < lastKey ||
      (parameterKey === lastKey && roleRank <= lastRoleRank)
    )
      return { ok: false, mismatch: false };
    lastKey = parameterKey;
    lastRoleRank = roleRank;
    affected.push({
      parameterId,
      parameterKey,
      impactRole: role,
      count: entry.count as CanonicalCount,
      earliestDate: entry.earliestDate as string | null,
      latestDate: entry.latestDate as string | null,
      reasonCode: entry.reasonCode as ImpactReasonCode,
    });
  }

  return {
    ok: true,
    impact: {
      consumerKey: declaration.consumerKey,
      contractVersion: declaration.contractVersion,
      affectedParameters: affected,
      blockedReasonCodes: blocked,
    },
  };
}

// ── Collection ───────────────────────────────────────────────────────────

/**
 * Executes every declared provider (read-only) and collects validated
 * impacts. Failures map to closed blocked codes — provider exceptions,
 * identity mismatches, malformed outputs, and self-reported blocks all
 * block the transition; they never throw arbitrary provider text to the
 * caller. Returns impacts sorted by consumerKey then the provider's
 * validated ordering.
 */
export async function collectProviderImpacts(
  set: ProviderSet,
  input: TransitionImpactInput,
): Promise<{
  impacts: ProviderImpact[];
  blockedReasonCodes: BlockedReasonCode[];
}> {
  validateProviderSet(set.declarations, set.providers);
  const impacts: ProviderImpact[] = [];
  const blocked = new Set<BlockedReasonCode>();
  for (const declaration of set.declarations) {
    const provider = set.providers[declaration.consumerKey];
    if (!provider) {
      blocked.add("PROVIDER_UNAVAILABLE");
      continue;
    }
    let raw: unknown;
    try {
      raw = await provider.evaluate(input);
    } catch {
      blocked.add("PROVIDER_EXECUTION_FAILED");
      continue;
    }
    if (raw === null || raw === undefined) {
      blocked.add("PROVIDER_UNAVAILABLE");
      continue;
    }
    const validated = validateProviderOutput(declaration, raw, input);
    if (!validated.ok) {
      blocked.add(
        validated.mismatch
          ? "PROVIDER_VERSION_MISMATCH"
          : "PROVIDER_OUTPUT_INVALID",
      );
      continue;
    }
    if (validated.impact.blockedReasonCodes.length > 0)
      blocked.add("PROVIDER_REPORTED_BLOCK");
    impacts.push(validated.impact);
  }
  impacts.sort((a, b) =>
    a.consumerKey < b.consumerKey ? -1 : a.consumerKey > b.consumerKey ? 1 : 0,
  );
  return {
    impacts,
    blockedReasonCodes: [...blocked].sort(
      (a, b) => BLOCKED_REASON_RANK[a] - BLOCKED_REASON_RANK[b],
    ),
  };
}

// Module-init contract validation — a misconfigured production provider set
// fails closed at import time, not at first request.
validateProviderSet(DECLARED_CONSUMERS, PROVIDERS);
