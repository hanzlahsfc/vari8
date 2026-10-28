import { canonicalizeDecimal, type TaggedValue } from "./canonical";

/**
 * P-021 — snapshot-driven DailyEntry value validation (decisions #64/#74).
 * Values resolve by POSITIONAL ORDINAL against the immutable pinned version
 * snapshot — the browser never sends parameter identifiers.
 */

export type SnapshotParam = {
  parameterId: string;
  parameterKey: string;
  kind: string;
  required: boolean;
  unit: string | null;
  ratingScheme: string | null;
  decimals: number | null;
  summary: string | null;
  options: Array<{ optionId: string; label: string }>;
  validation: { min: number | null; max: number | null } | null;
  dataClassification: string | null;
  snapshotRevision: number;
  sectionId: string;
  itemId: string;
};

export const DAILY_ENTRY_TEXT_MAX = 5000;

const RATING_BOUNDS: Record<string, { min: number; max: number }> = {
  SCALE_1_10: { min: 1, max: 10 },
  SCALE_1_5: { min: 1, max: 5 },
};

export type OrdinalValue = { ordinal: number; raw: string };

type ResolveOk = {
  ok: true;
  values: Map<string, { raw: string; param: SnapshotParam }>;
};
type ResolveErr = { ok: false; reason: string };

/** Maps positional ordinals to snapshot parameters. Rejects duplicate,
 * negative, fractional, or out-of-range ordinals. Empty/whitespace raw
 * values are retained as absent markers. */
export function resolveDailyEntryValues(
  values: readonly OrdinalValue[],
  ordinals: readonly string[],
  snapshot: readonly SnapshotParam[],
): ResolveOk | ResolveErr {
  const seen = new Set<number>();
  const out = new Map<string, { raw: string; param: SnapshotParam }>();
  for (const { ordinal, raw } of values) {
    if (
      !Number.isSafeInteger(ordinal) ||
      ordinal < 0 ||
      ordinal >= ordinals.length
    )
      return { ok: false, reason: "invalid_ordinal" };
    if (seen.has(ordinal)) return { ok: false, reason: "duplicate_ordinal" };
    seen.add(ordinal);
    const parameterId = ordinals[ordinal];
    const param = snapshot.find((p) => p.parameterId === parameterId);
    if (!param) return { ok: false, reason: "incoherent_snapshot" };
    out.set(parameterId, { raw, param });
  }
  // Every rendered eligible parameter may appear; unrendered parameters
  // cannot be submitted (ordinal range already rejects them).
  return { ok: true, values: out };
}

type ValidateOk = { ok: true; values: Map<string, TaggedValue> };
type ValidateErr = { ok: false; reason: string; parameterId?: string };

/** Per-kind validation against the snapshot. Empty raw → "absent"; a
 * required parameter must be present. Returns the full ordered value map —
 * every snapshot parameter gets a tagged value (absent or canonical). */
export function validateDailyEntryValues(
  values: readonly OrdinalValue[],
  ordinals: readonly string[],
  snapshot: readonly SnapshotParam[],
): ValidateOk | ValidateErr {
  const resolved = resolveDailyEntryValues(values, ordinals, snapshot);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };

  const out = new Map<string, TaggedValue>();
  for (const param of snapshot) {
    const entry = resolved.values.get(param.parameterId);
    const raw = entry?.raw?.trim() ?? "";
    if (raw === "") {
      if (param.required)
        return {
          ok: false,
          reason: "required_missing",
          parameterId: param.parameterId,
        };
      out.set(param.parameterId, { tag: "absent" });
      continue;
    }
    const parsed = parseByKind(param, raw);
    if (!parsed.ok) {
      return {
        ok: false,
        reason: parsed.reason,
        parameterId: param.parameterId,
      };
    }
    out.set(param.parameterId, parsed.value);
  }
  return { ok: true, values: out };
}

function parseByKind(
  param: SnapshotParam,
  raw: string,
): { ok: true; value: TaggedValue } | { ok: false; reason: string } {
  switch (param.kind) {
    case "MEASUREMENT": {
      const canonical = canonicalizeDecimal(raw);
      if (canonical === null) return { ok: false, reason: "invalid_decimal" };
      const bounds = param.validation;
      if (bounds) {
        // Bounds are small declared integers; compare canonically —
        // never via JS Number.
        const rel = decimalCompare(
          canonical,
          bounds.min === null ? "" : String(bounds.min),
          bounds.max === null ? "" : String(bounds.max),
        );
        if (rel !== 0) return { ok: false, reason: "out_of_range" };
      }
      return { ok: true, value: { tag: "measurement", canonical } };
    }
    case "RATING": {
      if (!/^[+-]?\d+$/.test(raw.trim()))
        return { ok: false, reason: "invalid_rating" };
      const v = Number.parseInt(raw.trim(), 10);
      const bounds = param.ratingScheme
        ? RATING_BOUNDS[param.ratingScheme]
        : undefined;
      if (!bounds || v < bounds.min || v > bounds.max)
        return { ok: false, reason: "rating_out_of_bounds" };
      return { ok: true, value: { tag: "rating", value: v } };
    }
    case "OPTION": {
      // Option selection is positional within the snapshot option list —
      // DOM values carry ordinals, never option ids.
      if (!/^\d+$/.test(raw.trim()))
        return { ok: false, reason: "invalid_option" };
      const idx = Number.parseInt(raw.trim(), 10);
      const opt = param.options[idx];
      if (!opt) return { ok: false, reason: "invalid_option" };
      return { ok: true, value: { tag: "option", optionId: opt.optionId } };
    }
    case "TEXT": {
      const text = raw.trim();
      if (text.length > DAILY_ENTRY_TEXT_MAX)
        return { ok: false, reason: "text_too_long" };
      return { ok: true, value: { tag: "text", value: text } };
    }
    default:
      return { ok: false, reason: "unsupported_kind" };
  }
}

/** Compares a canonical decimal against [min, max] integer bounds without
 * JS Number on arbitrary precision. Returns null when bounds are absent;
 * -1 below, 0 within, 1 above. */
function decimalCompare(
  canonical: string,
  minStr: string,
  maxStr: string,
): number | null {
  const cmp = (a: string, b: string): number => {
    // Both are canonical decimals; compare via sign, integer-part length,
    // then lexicographic, then fractional padding.
    const pa = splitDec(a);
    const pb = splitDec(b);
    if (pa.neg !== pb.neg) return pa.neg ? -1 : 1;
    const dir = pa.neg ? -1 : 1;
    if (pa.int.length !== pb.int.length)
      return pa.int.length < pb.int.length ? -dir : dir;
    if (pa.int !== pb.int) return pa.int < pb.int ? -dir : dir;
    const fl = Math.max(pa.frac.length, pb.frac.length);
    const fa = pa.frac.padEnd(fl, "0");
    const fb = pb.frac.padEnd(fl, "0");
    if (fa !== fb) return fa < fb ? -dir : dir;
    return 0;
  };
  const min = minStr === "" ? null : minStr;
  const max = maxStr === "" ? null : maxStr;
  if (min !== null && cmp(canonical, min) < 0) return -1;
  if (max !== null && cmp(canonical, max) > 0) return 1;
  return 0;
}

function splitDec(s: string): { neg: boolean; int: string; frac: string } {
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const dot = body.indexOf(".");
  const int = (dot >= 0 ? body.slice(0, dot) : body).replace(/^0+(?=\d)/, "");
  const frac = dot >= 0 ? body.slice(dot + 1).replace(/0+$/, "") : "";
  return { neg: neg && (int !== "0" || frac !== ""), int, frac };
}
