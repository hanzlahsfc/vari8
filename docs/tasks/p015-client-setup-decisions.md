# P-015 — Client setup / template-assignment decision record

Status: **decisions approved; implementation NOT authorized.** This document
records the approved C1 product decisions and the reviewed engineering
direction. No code, schema, migration, test, route, gate, or UI exists or may
be created under this record.

## 1. Verified starting state

- `origin/main`: `88e79acb28c4353f5934c72543dc456de19e2abc` (P-014 merge).
- PR #14: MERGED; reviewed head `1db4b72` is an ancestor of main; main CI
  run `37603547155` = SUCCESS on the merge commit.
- Remote branches: `main` only. Main protection: strict `verify` check,
  `enforce_admins`, force-push and deletion disabled. Nothing deployed.
- Docs branch: `docs/p015-client-setup-decisions` — docs-only; **NOT yet
  independently reviewed.**
- `product-decisions.md` ended at decision #48 before this record; #49–#57
  are the next consecutive numbers.

## 2. Scope and non-implementation boundary

This branch may change documentation only. It records owner-approved product
decisions and engineering direction for the next slice. It does not
implement `ClientSetup`, pins, variants, overrides, or any related feature;
it does not open a PR; a planning PASS and owner approval authorize
documentation only — a separately authorized implementation task is still
required.

## 3. Review history (do not rewrite)

- **P-015 initial plan** (Devin SWE-2 High): three-slice decomposition
  proposal with schema, lifecycle, authorization, and a 12-item owner
  decision package.
- **P-015-R1** — `opencode-go/deepseek-v4.1-flash`: **CONDITIONAL PASS**.
  P1-1: source-fidelity misclassification (proposed blueprint mechanics
  presented as source-confirmed). P2: unstable one-row-per-pin identity vs
  C2/C3, self-contradictory archive rule, parameter keys in diff UI,
  mis-scoped owner package. Decomposition C accepted as sound.
- **P-015-R2** corrected: stable per-client aggregate + append-only pin
  history; split C1/C2 archive rules; labels-only diff UI; rebuilt
  10+5+5 owner package.
- **P-015-R2-R1** — DeepSeek: **CONDITIONAL PASS**. All prior findings
  resolved; new P2-N1: variant-key tombstones stored in the nullable draft
  would be lost when publication clears the draft; owner decisions 1/3
  were phrased as internal model shape rather than product-observable
  behavior.
- **P-015-R3** corrected: persistent `retiredVariantKeys` on the
  `CoachingTemplate` container row (mirroring `retiredOptionIds`);
  reduced product-observable nine-decision C1 package; `meta.version`
  bound to `versionSeq`; `schemaVersion`-marked transition summary;
  `seq = max(seq)+1` allocation under lock; exact post-approval chain.
- **P-015-R4** narrow wording corrections: retention-qualified history
  language ("immutable through ordinary product editing — never legally
  undeletable"; no absolute retention claim) and unambiguous audit
  `meta.version` wording.
- **P-015-R4-R1** — DeepSeek V4.1 Flash: **PASS** — P0/P1/P2 none; the
  nine-decision package was judged ready for owner presentation.
- **Owner approval:** the complete nine-decision C1 package was approved
  → `docs/product-decisions.md` **#49–#57** (substance recorded there).

## 4. Approved product decisions #49–#57

Verbatim substance lives in `docs/product-decisions.md`; summary:

- **#49** One current template assignment per client; prior assignments
  preserved as append-only, immutable product history under the interim
  retention posture; no ordinary product action rewrites/reactivates/
  reuses/hard-deletes them; authorized retention/erasure/anonymization/
  legal-hold workflows may act once D-10/legal land; "immutable" means no
  in-place business edit, never legally undeletable; multiple concurrent
  current assignments not approved.
- **#50** New assignments always pin the template's latest published
  version, selected atomically by the server; staff cannot initially
  choose an older version; does not authorize upgrade/rollback.
- **#51** Owner cancels any client's assignment; coach cancels only while
  actively assigned; revoked/unassigned coach cannot cancel; an
  authorized actor may cancel even when client/template/pinned version is
  no longer eligible; cancellation does not delete history.
- **#52** D-11 resolved: any currently ACTIVE assigned coach may manage
  the client's template assignment, audited; not restricted to PRIMARY;
  template assignment never creates/modifies/confers `ClientAssignment`
  scope; assistant coaches write-denied.
- **#53** Archived templates cannot be newly assigned; existing
  assignments to their immutable versions stay effective and readable;
  archive never silently cancels or rewrites setup/history; authorized
  cancellation remains possible; archived-template upgrade/rollback is
  deferred to C2.
- **#54** History visibility: owner — workspace-wide; coach/assistant —
  only clients currently assigned to them (assistant read-only); client —
  none in this staff-only slice; support/platform admin (incl. dual-role)
  denied.
- **#55** Atomic cross-template replacement deferred; changing templates
  is two audited actions (cancel, then assign); the temporary
  no-assignment state is valid and visible; no silent replacement or
  automatic propagation.
- **#56** Terminology: "client setup" = stable configuration context;
  "template assignment"/"version history" = applied template/version;
  "coach assignment" = `ClientAssignment` authorization only; never
  conflated in UI/docs; internal names stay engineering decisions.
- **#57** Classification: client-associated operational metadata;
  preserved under the interim posture (no ordinary hard-delete); future
  client-data export includes records remaining within the approved
  retention period; retention/erasure/anonymization/legal-hold/backup/
  regulatory behavior pending D-10/legal/privacy; no GDPR-readiness
  claim; no real-client use or deployment; no retention duration or
  erasure mechanism inferred.

## 5. Engineering conclusions (reviewed direction — NOT owner decisions)

Recorded for traceability; these bind no owner and authorize nothing:

- Stable `ClientSetup` identity per client (one aggregate per
  `(workspaceId, clientProfileId)`, deliberately statusless).
- Append-only `ClientSetupPin` history; at most one ACTIVE pin per setup
  (partial-unique backstop); the current pin is derived from the ACTIVE
  child — no redundant mutable pointer.
- Immutable pin tuple `(templateId, templateVersionId, assignedBy,
assignedAt)`; only status + ending provenance may change, exactly once
  (ACTIVE → CANCELLED | SUPERSEDED reserved for C2).
- Composite workspace/template/version coherence foreign keys (the
  version∈template∈workspace target already exists); RESTRICT deletes.
- Per-client advisory lock + deterministic template-row lock during
  initial assignment; authorization-before-lock; uniform non-disclosure.
- `ClientSetupPin.seq = max(seq)+1` allocated under the per-client
  advisory lock and aggregate row lock, with `@@unique([clientSetupId,
seq])` as the database backstop.
- Transaction-bound structural audits; audit failure rolls back the
  transition; IDs stay in structural columns, never in `meta`.
- Audit `meta.version` means `CoachingTemplateVersion.versionSeq`
  (e.g. `"v3"`), never the pin's per-client sequence; pin `seq` is never
  written to `meta.version`; a separate field needs a separately reviewed
  schema change.
- Exact `"1"` development feature gate (e.g. `ENABLE_CLIENT_SETUP=1`) for
  any future implementation; flag-off refuses before auth/input parsing.
- Synthetic fixtures only; no real-client data.
- Persistent template-level retired variant-key storage is the corrected
  deferred C3 direction (tombstones must survive publish/draft-clear).
- None of these conclusions authorize implementation.

## 6. Decomposition (C1–C4)

- **C1** — client-setup identity + initial latest-published assignment +
  cancellation + history. **Product behavior approved (#49–#57).**
- **C2** — explicit upgrade/rollback via atomic pin transition + reviewed
  structural diff. PENDING; may land immediately before the first
  data-consuming slice.
- **C3** — versioned variants + switching. PENDING.
- **C4** — per-parameter visibility overrides. PENDING; split from C3.

## 7. Authorization direction (C1)

Owner: workspace read/write. Coach: assigned read/write via the actor's
current ACTIVE `ClientAssignment` (in-transaction re-read; revocation
fails closed). Assistant coach: assigned read, write-denied. Client,
support, and platform admin — including dual-role platform admins —
denied. Template assignment never creates, modifies, or confers coaching
scope; missing/foreign/denied objects share one non-disclosing error.

## 8. Lifecycle and archive direction

Aggregate created on first assignment and never carries a status; pins
make exactly one terminal transition and are never reused or repinned in
place; reassignment after cancellation reuses the aggregate and appends
`seq+1`. Archived templates accept no new assignments; existing pins stay
effective/readable; archive never silently cancels or rewrites history;
an authorized actor can always cancel. Cross-template change is two
audited actions in C1 (cancel + assign); the no-assignment interval is a
valid visible state.

## 9. Data classification and retention qualification

Client setup/template-assignment records are **client-associated
operational metadata** (parallel to approved #34). History is append-only
and immutable **through ordinary product editing** — "immutable" means no
in-place business edit, never legally undeletable. Preserve under the
interim posture (RESTRICT deletes; no ordinary product action
hard-deletes); future client-data export includes records remaining
within the approved retention period; retention, erasure, anonymization,
legal-hold, backup, and regulatory behavior are pending D-10/legal/
privacy approval. No duration or erasure mechanism is inferred; no GDPR
readiness is claimed; no real-client use or deployment is authorized.

## 10. Tests-first plan for a future C1 implementation

- **Unit RED:** feature-gate truth table; flag-first action ordering;
  boundary-import mechanical ban; nav pinning; RBAC cells incl. dual-role
  denial; uniform error mapping.
- **Integration (fresh disposable PG):** one aggregate per client; one
  ACTIVE pin; `seq` uniqueness/allocation under contention; composite FK
  coherence; provenance CHECK; full authorization matrix (incl. revoked
  coach mid-transaction, suspended member, dual-role platform admin);
  uniform non-disclosure; eligibility edges; deterministic
  archive-vs-assign; concurrent assign → exactly one commits; audit
  rollback; zero-audit failures.
- **E2E (1440/834/390):** flag-off 404/nav-absent/zero-effect POST;
  owner+coach assign/cancel/history; assistant read-only; client/support
  denied; no keys/IDs in DOM or copy; duplicate template names
  disambiguated by version/date/archived status.
- Standard gate battery + different-model review before PR.

## 11. Explicit exclusions and deferred work

No implementation is authorized. Deferred: C2 upgrade/rollback,
archived-template rollback target, structural-diff acknowledgement and
durable transition summaries, C3 variant creation/switching, C4
per-parameter visibility, plan/target storage, DailyEntry persistence,
client-facing setup surfaces, D-10 retention/erasure/legal policy, D-12
wider per-client configuration, formulas/computed fields, PRGRSS starter
data and CALORIES, onboarding submissions/answers, real-client use, and
deployment.

## 12. Post-approval gate chain

1. Independent different-model review of **this docs-only record**.
2. PR + CI; merged **only with separate approval**.
3. A **separately authorized** C1 implementation task is issued.
4. Tests-first implementation on a feature branch.
5. Independent different-model code review **before** that PR.
6. Separate merge approval for implementation.
7. No deployment without separate authorization.

## 13. Authorization statement

**This document authorizes nothing beyond its own review and merge.** No
code, schema, migration, test, route, gate, UI, PR, merge, deployment, or
real-client-data use is approved by this record.
