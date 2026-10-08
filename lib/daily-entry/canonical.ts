import { createHash } from "node:crypto";

/**
 * P-021 — canonical value, revision-hash, and stale-token encodings
 * (decisions #64/#74, P-021-R2 §8, P-021-R3 §5–§6).
 *
 * Three distinct artifacts:
 *  - canonical decimal strings (comma/dot grammar, never JS Number);
 *  - the STORED revision dedup hash (`canonical_hash`), compared only inside
 *    the locked logical entry;
 *  - the BROWSER stale token (`form_token`), consistency/replay material
 *    only — never an authorization source.
 */

// ── Decimal canonicalization (P-021-R3 §5 order — raw checks BEFORE
// normalization so trailing zeros cannot rescue an over-scale fraction) ────

const DECIMAL_INPUT = /^[+-]?[0-9]+(?:[.,][0-9]+)?$/;
const MAX_FRACTION_DIGITS = 8;
/** abs(value) must be < 10^22 — integer part ≤ 22 digits (NUMERIC(30,8)). */
const MAX_INTEGER_DIGITS = 22;

export function canonicalizeDecimal(raw: string): string | null {
  const t = raw.trim();
  if (!DECIMAL_INPUT.test(t)) return null;
  const sep = Math.max(t.indexOf("."), t.indexOf(","));
  if (sep >= 0 && t.length - sep - 1 > MAX_FRACTION_DIGITS) return null;

  let s = t.replace(",", ".").replace(/^\+/, "");
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  const dot = s.indexOf(".");
  let int = dot >= 0 ? s.slice(0, dot) : s;
  let frac = dot >= 0 ? s.slice(dot + 1) : "";
  int = int.replace(/^0+(?=\d)/, "");
  frac = frac.replace(/0+$/, "");
  const out = frac ? `${int}.${frac}` : int;
  const isZero = /^0+$/.test(int) && frac === "";
  const canonical = (neg && !isZero ? "-" : "") + out;
  // Magnitude: integer part digit count ≤ 22 ⇔ abs < 10^22.
  if (int.replace(/^0+/, "").length > MAX_INTEGER_DIGITS) return null;
  return canonical;
}

// ── Tagged values ─────────────────────────────────────────────────────────

export type TaggedValue =
  | { tag: "absent" }
  | { tag: "measurement"; canonical: string }
  | { tag: "rating"; value: number }
  | { tag: "option"; optionId: string }
  | { tag: "text"; value: string };

export type HashParam = {
  parameterId: string;
  parameterKey: string;
  dataClassification: string | null;
  kind: string;
  snapshotRevision: number;
  /** Server-derived from the immutable version definition. */
  sectionId: string;
  itemId: string;
  value: TaggedValue;
};

/** Length-prefixed field encoding (P-020B convention) — unambiguous under
 * concatenation. */
const lp = (s: string) => `${Buffer.byteLength(s, "utf8")}:${s}`;

function taggedValueEncoding(value: TaggedValue): string {
  switch (value.tag) {
    case "absent":
      return "N";
    case "measurement":
      return `M:${value.canonical}`;
    case "rating":
      return `R:${value.value}`;
    case "option":
      return `O:${value.optionId}`;
    case "text":
      return `T:${value.value}`;
  }
}

export const REVISION_HASH_DOMAIN = "DAILY-ENTRY-REV-v1";

/** Stored dedup hash — entry-local scope: workspace/client/date are bound by
 * the locked logical entry row this hash is compared under; pin + version +
 * provenance + typed values are bound explicitly. */
export function computeRevisionCanonicalHash(input: {
  pinId: string;
  templateVersionId: string;
  params: HashParam[];
}): string {
  const hash = createHash("sha256");
  hash.update(`${REVISION_HASH_DOMAIN}\x00`);
  hash.update(lp(input.pinId) + lp(input.templateVersionId));
  hash.update(lp(String(input.params.length)));
  for (const p of input.params) {
    hash.update(
      lp(p.parameterId) +
        lp(p.parameterKey) +
        lp(p.dataClassification ?? "") +
        lp(p.kind) +
        lp(String(p.snapshotRevision)) +
        lp(p.sectionId) +
        lp(p.itemId) +
        lp(taggedValueEncoding(p.value)),
    );
  }
  return hash.digest("hex");
}

export const FORM_TOKEN_DOMAIN = "DAILY-ENTRY-FORM-v1";

/** Browser stale token — consistency material binding the rendered form to
 * the server-resolved workspace, client, date, pin, version, current
 * revision, parameter set, ordinal fingerprint, AND the current actor
 * (session user + workspace member). Actor fields are never read from form
 * input; a replaced membership row (new id) stales outstanding tokens. */
export function computeDailyEntryFormToken(input: {
  workspaceId: string;
  clientProfileId: string;
  entryDate: string;
  pinId: string;
  templateVersionId: string;
  currentRevision:
    | { tag: "absent" }
    | { tag: "present"; revisionId: string; canonicalHash: string }
    | null;
  parameters: Array<{
    parameterId: string;
    parameterKey: string;
    snapshotRevision: number;
  }>;
  ordinalFingerprint: string;
  sessionUserId: string;
  workspaceMemberId: string;
}): string {
  const hash = createHash("sha256");
  hash.update(`${FORM_TOKEN_DOMAIN}\x00`);
  hash.update(
    lp(input.workspaceId) +
      lp(input.clientProfileId) +
      lp(input.entryDate) +
      lp(input.pinId) +
      lp(input.templateVersionId),
  );
  const rev = input.currentRevision;
  hash.update(
    rev && rev.tag === "present"
      ? lp("present") + lp(rev.revisionId) + lp(rev.canonicalHash)
      : lp("absent"),
  );
  hash.update(lp(String(input.parameters.length)));
  for (const p of input.parameters) {
    hash.update(
      lp(p.parameterId) + lp(p.parameterKey) + lp(String(p.snapshotRevision)),
    );
  }
  hash.update(
    lp(input.ordinalFingerprint) +
      lp(input.sessionUserId) +
      lp(input.workspaceMemberId),
  );
  return hash.digest("hex");
}
