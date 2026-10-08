import { createHash } from "node:crypto";

/**
 * P-020B — deterministic structural diff over two immutable
 * `CoachingTemplateVersion.definition` snapshots (P-020-R3 §19/§24).
 *
 * Parameter identity is `parameterId` + verified `parameterKey`
 * (`item.parameterKey` must equal `parameters[parameterId].key`); item and
 * section ids are provenance only — they detect rebinds ("same itemId →
 * different parameter") and moves but carry no identity weight. Categories,
 * details, and summary reason codes are closed vocabularies ordered by
 * explicit rank tables — never locale or object-key order. `diffHash` is a
 * versioned, domain-separated, length-prefixed SHA-256.
 *
 * Defensive semantic drift (kind/unit/ratingScheme/options/validation
 * differences on a parameter bound in both snapshots) is impossible through
 * the application's publish-time semantic lock — its presence means
 * out-of-band mutation, so the diff reports `defective` and callers fail
 * closed. `revision`/`dataClassification` are deliberately excluded: the
 * #78 classification exemption legitimately bumps both on snapshots of
 * already-referenced parameters.
 */

export type TransitionDirection = "UPGRADE" | "ROLLBACK";

export const DIFF_CATEGORY_RANK = {
  removed: 0,
  rebound: 1,
  added: 2,
  moved: 3,
  required: 4,
  display: 5,
} as const;
export type DiffCategory = keyof typeof DIFF_CATEGORY_RANK;

export type DiffDetail =
  | "item_removed"
  | "item_rebound"
  | "item_added"
  | "item_moved"
  | "required_on"
  | "required_off"
  | "label_changed"
  | "help_changed"
  | "group_changed"
  | "title_changed"
  | "section_label_changed";

export type TransitionDiffEntry = {
  category: DiffCategory;
  /** Internal parameter identity — stripped before browser serialization. */
  parameterId: string;
  parameterKey: string;
  parameterLabel: string | null;
  /** Rebound target identity (internal) — present only on `rebound`. */
  reboundParameterId?: string;
  reboundParameterKey?: string;
  reboundParameterLabel?: string | null;
  detail: DiffDetail;
  /** removed/rebound entries require the explicit warn+confirm treatment
   * (decision #71); everything else is informational. */
  warn: boolean;
  /** Snapshot-internal provenance — stripped before browser serialization. */
  itemId: string;
  sectionId: string;
};

export type TransitionCategories = Record<DiffCategory, number>;

export type TransitionDiff = {
  entries: TransitionDiffEntry[];
  categories: TransitionCategories;
  /** Count of warn-level entries (removed + rebound). */
  warningCount: number;
  /** Fail-closed marker: malformed snapshot or defensive semantic drift. */
  defective: boolean;
  diffHash: string;
};

// ── Snapshot collection ──────────────────────────────────────────────────

type SnapshotItem = {
  itemId: string;
  parameterId: string;
  parameterKey: string;
  required: boolean;
  order: number;
  sectionId: string;
};

type Collected = {
  title: string | null;
  /** sectionId → label */
  sectionLabels: Map<string, string>;
  items: SnapshotItem[];
  parameters: Map<string, Record<string, unknown>>;
  malformed: boolean;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function collectDefinition(raw: unknown): Collected {
  const result: Collected = {
    title: null,
    sectionLabels: new Map(),
    items: [],
    parameters: new Map(),
    malformed: false,
  };
  if (!isPlainObject(raw)) {
    result.malformed = true;
    return result;
  }
  if (raw.title !== undefined && typeof raw.title === "string")
    result.title = raw.title;
  const sections = raw.sections;
  const parameters = raw.parameters;
  if (!Array.isArray(sections) || !isPlainObject(parameters)) {
    result.malformed = true;
    return result;
  }
  const seenItems = new Set<string>();
  for (const section of sections) {
    if (!isPlainObject(section) || typeof section.sectionId !== "string") {
      result.malformed = true;
      continue;
    }
    if (typeof section.label === "string")
      result.sectionLabels.set(section.sectionId, section.label);
    if (!Array.isArray(section.items)) {
      result.malformed = true;
      continue;
    }
    for (const item of section.items) {
      if (
        !isPlainObject(item) ||
        typeof item.itemId !== "string" ||
        typeof item.parameterId !== "string" ||
        typeof item.parameterKey !== "string" ||
        typeof item.required !== "boolean" ||
        typeof item.order !== "number"
      ) {
        result.malformed = true;
        continue;
      }
      if (seenItems.has(item.itemId)) {
        result.malformed = true;
        continue;
      }
      seenItems.add(item.itemId);
      result.items.push({
        itemId: item.itemId,
        parameterId: item.parameterId,
        parameterKey: item.parameterKey,
        required: item.required,
        order: item.order,
        sectionId: section.sectionId,
      });
    }
  }
  for (const [id, p] of Object.entries(parameters)) {
    if (!isPlainObject(p)) {
      result.malformed = true;
      continue;
    }
    result.parameters.set(id, p);
  }
  return result;
}

function labelOf(
  parameters: Map<string, Record<string, unknown>>,
  parameterId: string,
): string | null {
  const label = parameters.get(parameterId)?.label;
  return typeof label === "string" ? label : null;
}

/** Verified identity check: item.parameterKey must equal the snapshot's
 * parameters[parameterId].key. A mismatch is incoherent metadata → the
 * caller fails closed. */
function verifyIdentity(c: Collected): boolean {
  for (const item of c.items) {
    const param = c.parameters.get(item.parameterId);
    if (!param || param.key !== item.parameterKey) return false;
  }
  return true;
}

/** Semantic fields are publish-locked; a difference is out-of-band drift. */
const SEMANTIC_FIELDS = [
  "kind",
  "unit",
  "ratingScheme",
  "options",
  "validation",
] as const;

function semanticDrift(
  from: Map<string, Record<string, unknown>>,
  to: Map<string, Record<string, unknown>>,
): boolean {
  for (const [id, fp] of from) {
    const tp = to.get(id);
    if (!tp) continue;
    for (const field of SEMANTIC_FIELDS) {
      const a = JSON.stringify(fp[field] ?? null);
      const b = JSON.stringify(tp[field] ?? null);
      if (a !== b) return true;
    }
  }
  return false;
}

// ── Canonical hash ───────────────────────────────────────────────────────

const lp = (s: string) => `${Buffer.byteLength(s, "utf8")}:${s}`;

/** Locale-independent code-unit ordering — canonical paths must never sort
 * by locale (host/environment dependent). */
function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Versioned, domain-separated, length-prefixed canonical diff hash. */
export function computeDiffHash(entries: TransitionDiffEntry[]): string {
  const hash = createHash("sha256");
  hash.update("C2-DIFF-v1\x00");
  hash.update(lp(String(entries.length)));
  for (const e of entries) {
    hash.update(
      lp(e.category) +
        lp(e.parameterId) +
        lp(e.parameterKey) +
        lp(e.reboundParameterId ?? "") +
        lp(e.reboundParameterKey ?? "") +
        lp(e.detail) +
        lp(e.itemId) +
        lp(e.sectionId),
    );
  }
  return hash.digest("hex");
}

// ── Diff computation ─────────────────────────────────────────────────────

export function computeTransitionDiff(
  fromRaw: unknown,
  toRaw: unknown,
): TransitionDiff {
  const from = collectDefinition(fromRaw);
  const to = collectDefinition(toRaw);
  let defective = from.malformed || to.malformed;
  if (!defective) defective = !verifyIdentity(from) || !verifyIdentity(to);
  if (!defective) defective = semanticDrift(from.parameters, to.parameters);

  const entries: TransitionDiffEntry[] = [];
  if (!defective) {
    const fromItems = new Map(from.items.map((i) => [i.itemId, i]));
    const toItems = new Map(to.items.map((i) => [i.itemId, i]));

    for (const item of from.items) {
      if (!toItems.has(item.itemId)) {
        entries.push({
          category: "removed",
          parameterId: item.parameterId,
          parameterKey: item.parameterKey,
          parameterLabel: labelOf(from.parameters, item.parameterId),
          detail: "item_removed",
          warn: true,
          itemId: item.itemId,
          sectionId: item.sectionId,
        });
      }
    }
    for (const item of to.items) {
      const prev = fromItems.get(item.itemId);
      if (!prev) {
        entries.push({
          category: "added",
          parameterId: item.parameterId,
          parameterKey: item.parameterKey,
          parameterLabel: labelOf(to.parameters, item.parameterId),
          detail: "item_added",
          warn: false,
          itemId: item.itemId,
          sectionId: item.sectionId,
        });
        continue;
      }
      if (prev.parameterId !== item.parameterId) {
        entries.push({
          category: "rebound",
          parameterId: prev.parameterId,
          parameterKey: prev.parameterKey,
          parameterLabel: labelOf(from.parameters, prev.parameterId),
          reboundParameterId: item.parameterId,
          reboundParameterKey: item.parameterKey,
          reboundParameterLabel: labelOf(to.parameters, item.parameterId),
          detail: "item_rebound",
          warn: true,
          itemId: item.itemId,
          sectionId: item.sectionId,
        });
        continue;
      }
      if (prev.sectionId !== item.sectionId || prev.order !== item.order) {
        entries.push({
          category: "moved",
          parameterId: item.parameterId,
          parameterKey: item.parameterKey,
          parameterLabel: labelOf(to.parameters, item.parameterId),
          detail: "item_moved",
          warn: false,
          itemId: item.itemId,
          sectionId: item.sectionId,
        });
      }
      if (prev.required !== item.required) {
        entries.push({
          category: "required",
          parameterId: item.parameterId,
          parameterKey: item.parameterKey,
          parameterLabel: labelOf(to.parameters, item.parameterId),
          detail: item.required ? "required_on" : "required_off",
          warn: false,
          itemId: item.itemId,
          sectionId: item.sectionId,
        });
      }
    }

    // Display-level parameter metadata (editable post-publish) + template
    // title + section labels.
    for (const [id, fp] of from.parameters) {
      const tp = to.parameters.get(id);
      if (!tp) continue;
      const displayDiff = (
        field: "label" | "helpText" | "group",
        detail: DiffDetail,
      ) => {
        if ((fp[field] ?? null) !== (tp[field] ?? null)) {
          entries.push({
            category: "display",
            parameterId: id,
            parameterKey:
              typeof tp.key === "string" ? tp.key : String(fp.key ?? ""),
            parameterLabel: labelOf(to.parameters, id),
            detail,
            warn: false,
            itemId: "",
            sectionId: "",
          });
        }
      };
      displayDiff("label", "label_changed");
      displayDiff("helpText", "help_changed");
      displayDiff("group", "group_changed");
    }
    if (from.title !== to.title) {
      entries.push({
        category: "display",
        parameterId: "",
        parameterKey: "",
        parameterLabel: null,
        detail: "title_changed",
        warn: false,
        itemId: "",
        sectionId: "",
      });
    }
    for (const [sectionId, fromLabel] of from.sectionLabels) {
      const toLabel = to.sectionLabels.get(sectionId);
      if (toLabel !== undefined && toLabel !== fromLabel) {
        entries.push({
          category: "display",
          parameterId: "",
          parameterKey: "",
          parameterLabel: null,
          detail: "section_label_changed",
          warn: false,
          itemId: "",
          sectionId,
        });
      }
    }
  }

  entries.sort(
    (a, b) =>
      DIFF_CATEGORY_RANK[a.category] - DIFF_CATEGORY_RANK[b.category] ||
      compareCodeUnits(a.parameterKey, b.parameterKey) ||
      compareCodeUnits(
        a.reboundParameterKey ?? "",
        b.reboundParameterKey ?? "",
      ) ||
      compareCodeUnits(a.itemId, b.itemId) ||
      compareCodeUnits(a.detail, b.detail),
  );

  const categories: TransitionCategories = {
    added: 0,
    removed: 0,
    rebound: 0,
    moved: 0,
    required: 0,
    display: 0,
  };
  let warningCount = 0;
  for (const e of entries) {
    categories[e.category] += 1;
    if (e.warn) warningCount += 1;
  }

  return {
    entries,
    categories,
    warningCount,
    defective,
    diffHash: computeDiffHash(entries),
  };
}

// ── Structural transition summary (persisted on the successor pin) ───────

/** Closed warning-code union — structural facts only, never provider or
 * history claims (the empty provider set cannot assert history). */
export const TRANSITION_SUMMARY_REASONS = ["REMOVED", "REBOUND"] as const;
export type TransitionSummaryReason =
  (typeof TRANSITION_SUMMARY_REASONS)[number];

const SUMMARY_REASON_RANK: Record<TransitionSummaryReason, number> = {
  REMOVED: 0,
  REBOUND: 1,
};

export type TransitionSummary = {
  schemaVersion: 1;
  direction: TransitionDirection;
  categories: TransitionCategories;
  reasonCodes: TransitionSummaryReason[];
};

const CATEGORY_KEYS = [
  "added",
  "removed",
  "rebound",
  "moved",
  "required",
  "display",
] as const;

/** Derives the persisted summary from the computed diff — warning codes are
 * the closed structural union only (no provider/history/data claims). */
export function buildTransitionSummary(
  direction: TransitionDirection,
  categories: TransitionCategories,
): TransitionSummary {
  const reasonCodes: TransitionSummaryReason[] = [];
  if (categories.removed > 0) reasonCodes.push("REMOVED");
  if (categories.rebound > 0) reasonCodes.push("REBOUND");
  reasonCodes.sort((a, b) => SUMMARY_REASON_RANK[a] - SUMMARY_REASON_RANK[b]);
  return {
    schemaVersion: 1,
    direction,
    categories: { ...categories },
    reasonCodes,
  };
}

/** Full service-side allowlist validation of a stored/candidate summary:
 * exact keys, no extras, schemaVersion 1, enum direction, six non-negative
 * integer categories, closed reason-code union. Returns null on any
 * deviation — callers fail closed. */
export function validateTransitionSummary(
  value: unknown,
): TransitionSummary | null {
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value).sort();
  if (
    JSON.stringify(keys) !==
    JSON.stringify(["categories", "direction", "reasonCodes", "schemaVersion"])
  )
    return null;
  if (value.schemaVersion !== 1) return null;
  if (value.direction !== "UPGRADE" && value.direction !== "ROLLBACK")
    return null;
  const categories = value.categories;
  if (!isPlainObject(categories)) return null;
  const catKeys = Object.keys(categories).sort();
  if (JSON.stringify(catKeys) !== JSON.stringify([...CATEGORY_KEYS].sort()))
    return null;
  for (const key of CATEGORY_KEYS) {
    const v = categories[key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return null;
  }
  const reasonCodes = value.reasonCodes;
  if (!Array.isArray(reasonCodes)) return null;
  for (const code of reasonCodes) {
    if (
      typeof code !== "string" ||
      !(TRANSITION_SUMMARY_REASONS as readonly string[]).includes(code)
    )
      return null;
  }
  return {
    schemaVersion: 1,
    direction: value.direction,
    categories: categories as unknown as TransitionCategories,
    reasonCodes: reasonCodes as TransitionSummaryReason[],
  };
}
