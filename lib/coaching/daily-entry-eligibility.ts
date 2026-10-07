/**
 * P-020A — shared pure DailyEntry structural-eligibility function
 * (product-decisions #64, #73, #78 + P-020 contract).
 *
 * `evaluateDailyEntryVersionEligibility` answers ONE question: does this
 * immutable template-version snapshot satisfy the structural contract a
 * future DailyEntry consumer requires? It is pure and deterministic, reads
 * only the snapshot's parameter map + section items, and knows nothing about
 * actors, roles, assignments, pins, flags, consent, or clients.
 *
 * Eligible: every referenced parameter carries `GENERAL_HEALTH` and a
 * currently supported kind/configuration. Ineligible: classification absent
 * (legacy), NULL, malformed, or specialist (CYCLE/BLOODWORK/PED_HRT);
 * unsupported kinds/rating schemes; duplicate parameter references;
 * incoherent or malformed snapshots.
 *
 * Reason codes are a closed vocabulary ordered by explicit rank — never
 * locale sort, declaration order, or object-key order. This module is
 * consumed by NO user-facing path in this slice; P-020B imports it.
 */

export type DailyEntryEligibilityReason =
  | "snapshot_malformed"
  | "duplicate_parameter"
  | "metadata_incoherent"
  | "missing_classification"
  | "malformed_classification"
  | "specialist_classification"
  | "unsupported_kind"
  | "unsupported_rating_scheme";

/** Explicit rank table — deterministic ordering, no locale/object reliance. */
const REASON_RANK: Record<DailyEntryEligibilityReason, number> = {
  snapshot_malformed: 0,
  duplicate_parameter: 1,
  metadata_incoherent: 2,
  missing_classification: 3,
  malformed_classification: 4,
  specialist_classification: 5,
  unsupported_kind: 6,
  unsupported_rating_scheme: 7,
};

const CLASSIFICATIONS = new Set([
  "GENERAL_HEALTH",
  "CYCLE",
  "BLOODWORK",
  "PED_HRT",
]);

const SUPPORTED_KINDS = new Set(["MEASUREMENT", "RATING", "OPTION", "TEXT"]);
const SUPPORTED_RATING_SCHEMES = new Set(["SCALE_1_10", "SCALE_1_5"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function evaluateDailyEntryVersionEligibility(definition: unknown): {
  eligible: boolean;
  reasonCodes: DailyEntryEligibilityReason[];
} {
  const reasons = new Set<DailyEntryEligibilityReason>();
  if (!isPlainObject(definition)) {
    return { eligible: false, reasonCodes: ["snapshot_malformed"] };
  }
  const sections = definition.sections;
  const parameters = definition.parameters;
  if (!Array.isArray(sections) || !isPlainObject(parameters)) {
    return { eligible: false, reasonCodes: ["snapshot_malformed"] };
  }

  // Parameter identity: item.parameterId resolves to an entry in the
  // parameters map whose `key` matches item.parameterKey; the same
  // parameterId referenced by more than one item is a #64 violation.
  const seenParameterIds = new Set<string>();
  const itemParameterIds: string[] = [];
  for (const section of sections) {
    if (!isPlainObject(section) || !Array.isArray(section.items)) {
      reasons.add("snapshot_malformed");
      continue;
    }
    for (const item of section.items) {
      if (
        !isPlainObject(item) ||
        typeof item.parameterId !== "string" ||
        typeof item.parameterKey !== "string"
      ) {
        reasons.add("snapshot_malformed");
        continue;
      }
      if (seenParameterIds.has(item.parameterId))
        reasons.add("duplicate_parameter");
      seenParameterIds.add(item.parameterId);
      itemParameterIds.push(item.parameterId);
      const param = parameters[item.parameterId];
      if (!isPlainObject(param) || param.key !== item.parameterKey)
        reasons.add("metadata_incoherent");
    }
  }
  if (itemParameterIds.length === 0) reasons.add("snapshot_malformed");
  // Orphaned snapshot parameters are incoherent metadata.
  for (const paramId of Object.keys(parameters)) {
    if (!seenParameterIds.has(paramId)) reasons.add("metadata_incoherent");
  }

  for (const paramId of new Set(itemParameterIds)) {
    const param = parameters[paramId];
    if (!isPlainObject(param)) continue; // metadata_incoherent recorded
    const cls = param.dataClassification;
    if (cls === undefined || cls === null) {
      // Legacy-absent and explicit-NULL snapshots are equally ineligible.
      reasons.add("missing_classification");
    } else if (typeof cls !== "string" || !CLASSIFICATIONS.has(cls)) {
      reasons.add("malformed_classification");
    } else if (cls !== "GENERAL_HEALTH") {
      reasons.add("specialist_classification");
    }
    if (typeof param.kind !== "string" || !SUPPORTED_KINDS.has(param.kind))
      reasons.add("unsupported_kind");
    if (
      param.kind === "RATING" &&
      (typeof param.ratingScheme !== "string" ||
        !SUPPORTED_RATING_SCHEMES.has(param.ratingScheme))
    )
      reasons.add("unsupported_rating_scheme");
    // Option parameters must carry a non-empty unique-id option list; a
    // validation block is representable only on MEASUREMENT/DURATION.
    if (param.kind === "OPTION") {
      const opts = param.options;
      if (
        !Array.isArray(opts) ||
        opts.length === 0 ||
        opts.some(
          (o) =>
            !isPlainObject(o) ||
            typeof o.optionId !== "string" ||
            typeof o.label !== "string",
        ) ||
        new Set(opts.map((o) => (o as { optionId: string }).optionId)).size !==
          opts.length
      )
        reasons.add("metadata_incoherent");
    }
    if (
      param.validation !== undefined &&
      param.validation !== null &&
      param.kind !== "MEASUREMENT" &&
      param.kind !== "DURATION"
    )
      reasons.add("metadata_incoherent");
  }

  const ordered = [...reasons].sort((a, b) => REASON_RANK[a] - REASON_RANK[b]);
  return { eligible: ordered.length === 0, reasonCodes: ordered };
}
