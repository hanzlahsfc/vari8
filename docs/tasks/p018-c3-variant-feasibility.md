# P-018 — C3 template variants: feasibility finding + deferral record

Documentation-only task. This record captures the C3 feasibility analysis,
the independent review, and the owner's deferral decision (#63). **No C3
implementation is authorized.**

## Verified starting state (2026-10-08)

- `origin/main` = `e5f94185d965350fa05006555e079b51d43175b8` — the P-017
  docs merge commit (PR #17, MERGED).
- Main CI run `37655433912` — `verify` SUCCESS on that merge commit.
- Remote branches: `main` only. Protection: strict `verify`,
  `enforce_admins`, force-push/deletion blocked. Nothing deployed.
- C1 implemented; C2 rules #58–#62 approved with implementation deferred
  per #62; C3/C4 pending and unauthorized.

## C3 implementation inventory — none exists

Exhaustive scan of `lib/`, `app/`, `db/`, `components/`, `tests/`: **zero**
variant implementation — no `TemplateVariant` model, no `variantKey`, no
variant column, service, boundary, route, component, or test. Every variant
substance lives in `docs/product-alignment-blueprint.md` as PROPOSED text.

## Source/approval classification

- **SOURCE-CONFIRMED (invariant):** switching views/variants within a
  client's assigned template preserves the client's data and never requires
  a new tracker; `ClientAssignment` untouched; nothing deleted.
- **SOURCE-CONFIRMED (terminology):** template variant ≠ nutrition variant
  ≠ template-version upgrade; meal-plan structure is per-client
  `MealPlanConfig`, not template-editor configuration — the earlier
  "meal-plan-based vs IIFYM-based" template-variant example was
  misleading and has been corrected.
- **PROPOSED (never approved):** `TemplateVariant` concept, key shape
  `(versionId, variantKey)`, "view selection not a data fork", variant
  step in config precedence, variant switch behavior, stable keys /
  tombstones / default-variant direction.
- **UNRESOLVED:** variant choice as a per-client configurable element is
  one of three items under D-12 (pending).

## Candidate-payload audit — none approved

| Candidate                                                           | Status                                                   |
| ------------------------------------------------------------------- | -------------------------------------------------------- |
| Parameter inclusion/exclusion                                       | overlaps C4 (pending)                                    |
| Section/item ordering, grouping, alternate presentation             | theoretical, unevidenced, unapproved                     |
| required/optional                                                   | template-item attribute (#43), not variant-scoped        |
| Labels/help text                                                    | parameter/version snapshot fields — no variant dimension |
| Dashboard/widget, roadmap, check-in form, onboarding form selection | absent — deferred future slices                          |
| Meal-plan configuration                                             | SOURCE-CONFIRMED per-client — excluded                   |
| Training configuration                                              | deferred slice                                           |
| Plan/target values                                                  | D-12 territory                                           |
| Visual theme/layout                                                 | absent, never concretely proposed                        |
| Client permissions                                                  | RBAC, not variant-controlled                             |
| Per-parameter visibility                                            | C4 — explicitly separate                                 |

**Conclusion:** an empty variant registry/switcher would have no present
product value; building one would manufacture an abstraction with no
payload and risk colliding with C4's shape.

## Review and decision history

1. **P-018 feasibility plan (SWE-2 High)** — recommended deferring C3
   (the "no payload" finding above).
2. **P-018-R1 independent review** (`opencode-go/deepseek-v4.1-flash`) —
   **PASS**, no P0/P1/P2. Non-blocking P3 observations, corrected in this
   record:
   - timing label: the correct classification is **Option C — defer both
     product decisions and implementation** (the initial report's "Option
     B" label was corrected);
   - archived-template variant switching is **unresolved** — decision #60
     governs C2 pin transitions only and does not resolve future C3
     switching;
   - no persistence/history shape is recommended or approved — it depends
     on the future payload and consumer;
   - alternate ordering/grouping/presentation payloads are theoretical
     and unevidenced — none are approved;
   - next slice recorded as exactly one recommendation: **DailyEntry
     planning** (does not require C3; per #62 it reopens the deferred C2
     implementation-planning gate immediately before the first
     data-consuming implementation — neither is authorized here).
3. **Owner approval** — the one-item deferral package, recorded as
   product-decisions **#63**.

## Approved decision #63 (summary)

Defer both C3 product decisions and C3 implementation until the first
specifically named, approved variant-controlled consumer exists. No empty
variant registry, selector, default-variant model, switching history,
schema, route, or UI may be created without a defined payload. The
SOURCE-CONFIRMED data-preservation invariant stands unchanged. All
proposed mechanics (stable keys, tombstones, defaults, archive
interaction, upgrade mapping, persistence shape, authority, audit, UI)
remain unresolved and non-binding. D-12 pending in full; C4 separate and
pending; nutrition variants remain distinct; meal-plan configuration
remains per-client; C3 deferral blocks nothing (C2, C4, DailyEntry
planning all proceed without it).

## Unresolved / deferred

D-10, D-12, C3 payload definition, C4, DailyEntry details, data-aware C2
blocking rules. C2 implementation stays deferred until immediately before
the first data-consuming slice (#62).

## Status

Documentation complete. No code, schema, tests, PR, merge, or deployment
exist or are authorized for C3. Next gate: independent different-model
review of this docs branch → PR → `verify` CI → separate merge approval.
