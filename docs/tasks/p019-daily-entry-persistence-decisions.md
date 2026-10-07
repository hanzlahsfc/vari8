# P-019 — DailyEntry persistence: planning, review chronology, and decision record

Documentation-only task. This record captures the complete P-019 planning and
review chronology and the owner's fifteen approved decisions (#64–#78) plus the
binding correctness constraints. **DailyEntry and C2 implementation remain
unauthorized.**

## Verified starting state (2026-10-08)

- `origin/main` = `4616a9bc3109d9c57a69ba2ed0e9c4065b6702b7` — the P-018 docs
  merge commit (PR #18, MERGED).
- Main CI run `37661036206` — `verify` SUCCESS on that merge commit.
- Remote branches: `main` only. Protection: strict `verify`,
  `enforce_admins`, force-push/deletion blocked. Nothing deployed.
- #63 was the latest recorded product decision; new decisions are #64–#78.
- C1 implemented; C2 rules #58–#62 approved with implementation deferred;
  C3 deferred (#63); C4 pending; DailyEntry not implemented.

## Source/provenance inspection

- `lib/daily-tracker.ts` — source-verified section/field contract: only two
  observed validations (biofeedback 1–10; DAY LABEL enum); MENSES marked
  `requires: ["cycleConsent"]`; CALORIES/computed/target/HRT excluded.
- `app/daily/` + `lib/daily-prototype.ts` — non-persistent dev prototype
  under `ENABLE_DAILY_PROTOTYPE`; not evidence of approved persistence.
- `lib/auth/rbac.ts` — approved `dailyTracking` cell: CLIENT `own/own`,
  COACH `assigned/assigned`, ASSISTANT `assigned`/`-`, OWNER `workspace`/`-`,
  SUPPORT/PLATFORM denied.
- `lib/consent.ts` — `dailyTracking` requires `PRIVACY_NOTICE`+`HEALTH_DATA`
  at current versions; production registry unconfigured →
  `policy_not_configured` fail-closed.
- `lib/coaching/parameters.ts` — closed kinds (MEASUREMENT, RATING, TIME,
  DURATION, OPTION, TEXT); `options` are OPTION-only; `ratingScheme`
  RATING-only; `WORD_LABELS` has no vocabulary; `validation` min/max on
  MEASUREMENT/DURATION.
- `docs/tasks/phase-0-1-source-blueprint.md` §2 — prior planned-slice
  contract (one entry per date, consent gates, comma-decimal flag).
- No timezone field exists anywhere in schema/profiles.

## Review chronology

1. **P-019 initial plan** (Devin SWE-2 High).
2. **P-019-R1** (`opencode-go/deepseek-v4.1-flash`) — **FAIL**: item-keyed
   identity, aggregate JSONB, kind-vocabulary errors, date contradiction,
   non-enforceable sensitivity, warning-only C2, hedged ordering, and more.
3. **P-019-R2** — corrected: parameter-keyed identity, normalized value rows,
   real kind vocabulary, classification field, normalized C2 counts, shared
   advisory namespace.
4. **P-019-R2-R1** — **FAIL**: value-only dedup lost provenance; restoration
   could revive ineligible fields; classification migration unspecified;
   date rule still contradictory; `PHOTOS` wrongly included; read-after-
   revocation missing; decimal ambiguity; hedged delivery.
5. **P-019-R3** — corrected: provenance-aware dedup, restoration removed,
   closed classification + NULL→enum migration, exact UTC+1 date rule,
   `PHOTOS` removed, revocation-read decision added, exact decimal grammar,
   fixed delivery order.
6. **P-019-R3-R1** — **FAIL**: reserved classifications assignable by
   coaches/owners; structural vs runtime eligibility conflated; both-flags-on
   didn't block actions; relational/current-revision integrity
   underspecified; decimal edge cases; no capability marker existed for
   publish validation; malformed owner-package alternative; no hash test
   vector.
7. **P-019-R4** — corrected: reserved `BLOODWORK`/`PED_HRT` unassignable by
   every role; two-layer structural/runtime eligibility; shared fail-closed
   mode resolver blocking actions; complete composite-FK invariants;
   universal publish duplicate invariant; exact decimal regex; hash test
   vector; sixteen-item package.
8. **P-019-R4-R1** (`opencode-go/deepseek-v4.1-flash`) — **CONDITIONAL PASS**,
   no P0/P1; final bounded corrections required.
9. **P-019-R5** — **produced by `opencode-go/deepseek-v4.1-flash`** after the
   prompt was misrouted to the reviewer: bounded correction synthesis
   applying the reviewer's own findings (composite pin/version FK targets,
   tagged-nullable provenance encoding, entry↔pin client-equality service
   invariant, current-revision-pointer integrity proof, universal invariant
   wording). It is recorded accurately as reviewer-authored synthesis, not
   Devin-authored work and not a new independent review.
10. **Owner approval** — the corrected plan and its fifteen-item package plus
    binding correctness constraints; docs-only record authorized.

## Final P2/P3 dispositions

- Reserved classifications (`BLOODWORK`, `PED_HRT`) are **unassignable by
  every role** — hard safety boundary, not owner preference; the one-time
  migration permits only `NULL→GENERAL_HEALTH`/`NULL→CYCLE`, audited and
  immutable.
- Structural eligibility is a pure function of the immutable snapshot;
  runtime checks (mode/session/RBAC/pin/consent) are separate and never
  cached into it; ineligible-version and no-consent states are distinct.
- Both-flags-on is a configuration error refusing pages AND actions before
  session/input/DB.
- Duplicate rejection is a **universal publish invariant** (no capability
  marker); eligibility re-checks as defense in depth.
- `currentRevisionId` uses a composite FK to `(revision.id, entry.id)`;
  non-null-after-commit proven by integration test, not claimed by schema.
- Entry-client↔pin-client equality is a mandatory locked-transaction
  service invariant (DB-enforceable variant allowed by future reviewed
  schema).
- Decimal grammar fixed exactly (`^[+-]?[0-9]+(?:[.,][0-9]+)?$`); precision/
  scale is an engineering bound, not `NUMERIC(12,4)` by fiat.
- Canonical hash requires a fixed synthetic SHA-256 test vector including
  tagged-nullable `itemId`/`sectionId` encoding before implementation
  acceptance.

## Decisions recorded (#64–#78 in product-decisions.md)

#64 one-value-per-parameter + universal duplicate rejection; #65 one entry
per client/date + append-only revisions; #66 declared-DATE bounds; #67
explicit save, no drafts; #68 client edits current+past, read-only history;
#69 no staff writes; #70 stale fails closed (safety boundary); #71 C2
warn/confirm/block rules with history; #72 dev-gated/production boundary;
#73 GENERAL_HEALTH-only + reserved classifications unassignable (safety
boundary); #74 comma/dot decimals; #75 TIME/DURATION/WORD_LABELS ineligible;
#76 post-revocation fail-closed interim; #77 restoration deferred; #78
classification migration constraints.

## Binding correctness constraints (recorded, not owner choices)

Structural-eligibility-vs-runtime-access separation; fail-closed
feature-mode resolver; relational/service coherence (composite pin/version
FK targets; entry↔pin client-equality service invariant; no non-unique
"FK targets"); current-revision pointer integrity; shared advisory lock +
global lock order + retry recomputation + audit rollback; provenance-aware
canonical deduplication with tagged-nullable provenance and a required
synthetic test vector.

## Residual trust risk (recorded)

Authorized managers may misclassify a specialist parameter as
`GENERAL_HEALTH` — accuracy cannot be inferred from labels/groups/units.
Owner-only classification or owner-review is optional future hardening
needing separate approval.

## Unresolved / deferred

D-10 (retention/erasure/export), D-14 staff-write half, IANA timezone,
TIME/DURATION formats, WORD_LABELS vocabulary, restoration, C3, C4,
formulas/CALORIES, specialist-data slices, production enablement,
deployment, real-client data.

## Fixed delivery order

This record → independent doc review → doc PR + CI + merge approval →
corrected C2 data-aware plan → independent C2-plan review → separately
authorized C2 implementation/merge → separately authorized dev-gated
DailyEntry implementation/merge → D-10/consent/privacy readiness →
deployment via separate authorization. **C2 merges before DailyEntry.**

## Status

Documentation complete. No schema, code, tests, flags, PR, merge,
implementation, production enablement, or deployment is authorized.
