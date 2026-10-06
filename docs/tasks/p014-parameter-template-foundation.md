# P-014 — Parameter library + coaching-template versioning foundation

Status: **decisions approved; implementation NOT started.** This record fixes
the approved plan; no code, schema, migration, test, route, or UI exists yet
for this slice.

Base: `origin/main` @ `49fc7654f7ac94d947d9e0a3e47d7f8e4198fd18`
(P-013 merged via PR #12; `10b3c74` ancestor; main CI green).
Docs branch: `docs/p014-parameter-template-decisions` — docs-only; NOT
independently reviewed yet.

## Review history (do not rewrite)

- Devin's original P-014 plan: **FAIL** from `opencode-go/deepseek-v4.1-flash`
  — P1-1 (PRGRSS seed canonicalized unprinted `CALORIES`/`kcal`), P1-2
  (self-contradictory archived-reference rule), P1-3 (understated
  owner-decision set), plus P2 issues (coarse provenance,
  interpretation-risk seed fields, unspecified seed permission, missing
  direct action-gate tests).
- P-014-R2 revised plan (this document's scope/rules): **CONDITIONAL PASS**
  — remaining P2 engineering corrections are folded in below as binding
  requirements (version/parameter reference rows, deterministic lock order,
  replay key, option-ID tombstones, acknowledged-revision protocol,
  validation-field lock).
- Owner then approved the recommended decision package →
  `docs/product-decisions.md` **#41–#48** (recorded verbatim there).
- Docs head `313b82c` independently reviewed by DeepSeek V4.1 Flash →
  **CONDITIONAL PASS** (no P0/P1; decisions, engineering plan, source
  fidelity, and boundaries passed). One stale blueprint slice-order entry
  (PRGRSS seed + assignment claims) and three P3 documentation items
  corrected in the forward R5 commit — that commit is NOT yet independently
  reviewed.

## Approved slice definition

> "Workspace-shared parameter-library and immutable coaching-template
> versioning mechanics. Definitions are created by authorized staff —
> WORKSPACE_OWNER and COACH per decisions #41–#42; synthetic fixtures are
> used for development/test evidence only."

**In scope:** `ParameterDefinition`, `CoachingTemplate`,
`CoachingTemplateVersion`, `CoachingTemplateVersionParameter`; bounded
mutable drafts; immutable published snapshots; optimistic revisions;
transactional audit; dev-only feature gate; staff-only management UI;
synthetic fixtures only. (The earlier "coach-created" wording wrongly
excluded workspace owners and conflated real staff-authored configuration
with test fixtures — corrected P-014-R4.)

**Out of scope:** PRGRSS seed or any source-derived production row · client
data/assignments · variants · per-client overrides · entries, plans,
targets, submissions, check-ins, answers · consent/retention/erasure ·
formulas or calculated fields · nutrition/meal-plan or training-program
construction · invitation/token work · deployment.

## Owner decisions (authoritative — `product-decisions.md` #41–#48)

#41 workspace-shared ownership (D-03 resolved) · #42 owner+coach ws read/
write; assistant/client/support denied; platform-admin denied incl.
dual-role · #43 key+kind immutable; semantic fields (unit, rating scheme,
option identity/set, validation) locked after first publish; display fields
editable; `required` lives on the item · #44 terminal archive; no
restore/delete; keys stay reserved · #45 archived references rejected at
save AND publish — no exceptions · #46 duplicate template names allowed;
IDs authoritative · #47 immutable self-contained snapshots; nothing
auto-propagates; variants/assignments/upgrades deferred · #48 no seed —
future starter set is a separately source-reviewed slice (CALORIES excluded
absent new evidence).

## Binding engineering requirements (reviewer-folded, NOT owner decisions)

1. **Validation semantics.** `validation` (declarative `min`/`max` only) is
   semantic metadata — same post-publish lock as unit/rating/options. No
   formulas, expressions, arithmetic, conditional logic, cross-field rules,
   or derived output can be represented. If min/max cannot be implemented
   unambiguously, omit the field from the first implementation.
2. **Reference integrity.** `CoachingTemplateVersionParameter`
   `(workspaceId, templateId, versionId, parameterId)` — unique per
   (version, parameter); composite FKs making cross-workspace or
   wrong-template references impossible (parameter↔workspace,
   version↔workspace, version↔template coherence; raw SQL, `Restrict`
   deletes — P-013 pattern). Also supplies the `EXISTS` post-publish
   semantic-lock check and future per-parameter version lookups.
3. **Deterministic locking.** Publish locks the template container row
   (`FOR UPDATE`) first, resolves the full referenced parameter set, then
   locks parameter rows in **ascending parameter-ID order**. Serializable
   transactions + bounded retry (existing reviewed pattern); archive vs
   publish races produce one valid outcome, never deadlock.
4. **Publish replay/sequence.** Unique `(templateId, publishOriginRevision)`
   replay key; `versionSeq = max+1` assigned only under the container lock;
   concurrent replay returns the existing version; published version rows
   have no update/delete service path.
5. **Option-ID non-reuse.** Server-minted option IDs; caller-supplied IDs
   accepted only when already known to the current parameter revision;
   removing an option moves its ID into a retained tombstone set (never
   restored/reused); unknown caller IDs rejected; post-publish the complete
   option identity/value set is semantically locked.
6. **Draft acknowledgment protocol.** Items store parameter identity +
   server-stamped `acknowledgedParameterRevision` — never caller-chosen;
   save/refresh re-reads and re-stamps; publish re-reads AND locks all
   referenced params; mismatch → stable `parameter_changed` conflict
   (zero mutation/audit); archived reference → stable non-publishable
   conflict.
7. **No parameter-version table yet** — mutable definition + immutable
   publish-time snapshots preserve historical meaning; published versions
   stay valid if a parameter is later archived. Nutrition/exercise catalogs
   remain separate master-data domains.

## Proposed shape (for the implementation task)

- **RBAC:** new closed resources `parameterDefinitions` + `coachingTemplates`
  (identical cells; both platform-admin-denied).
- **Audit:** `parameter_definition`, `coaching_template`,
  `coaching_template_version` — IDs + structural counts + `changed` only;
  never labels/options/draft JSON.
- **Engineering safety limits (not product limits):** definition JSON ≤
  64KB byte-before-parse; depth ≤ 4; ≤ 32 sections; ≤ 64 items/section; ≤
  128 items/template; ≤ 64 options/param; label ≤ 120; helpText ≤ 500;
  key ≤ 64; name ≤ 120; request body ≤ 128KB.
- **Feature gate:** `ENABLE_COACHING_TEMPLATES`, exact `"1"`. Flag-off: 404
  routes, absent nav, actions return before `auth()`/FormData/boundary/DB/
  revalidation/audit — proven by direct exported-action tests, never by
  page-POST claims.
- **Routes:** `/workspace/[workspaceId]/parameters`,
  `/workspace/[workspaceId]/templates`, `/templates/[templateId]`,
  `/templates/[templateId]/preview`; separate "Parameters" and "Templates"
  nav entries; no client-facing routes; 1440/834/390 responsive.

## Ordered RED→GREEN plan (for the implementation task)

1. Unit RED — gate truth table; action flag-first ordering; boundary-import
   mechanical ban; nav DOM; definition validation incl. byte-before-parse,
   depth/count/length limits, duplicate stable-key/option-ID rejection;
   RBAC matrix rows + dual-role platform denial.
2. Integration RED (disposable PG) — migration constraints; full authz
   matrix; uniform non-disclosure; kind/semantic immutability incl.
   validation lock; option tombstones; draft-revision conflicts;
   `parameter_changed` at publish; archived-ref rejection at save + publish;
   cross-workspace rejection; overlapping-parameter concurrent publishes;
   archive-vs-publish race; idempotent replay + seq uniqueness; snapshot
   immutability; audit-failure rollback.
3. GREEN — schema + migration, service, boundary, RBAC/audit/route-guard.
4. E2E RED→GREEN — flag-off server (:3101) 404/nav/zero-effect POST
   (transport-level only); owner+coach lifecycle; denial surfaces; conflict
   states; 1440/834/390.
5. Gates — P-013 battery: diff-check, format, typecheck, lint, unit, prisma
   generate/validate, migrate deploy+status from zero + drift review, full +
   focused integration, build, focused + full E2E, secrets/scope scan,
   base→head review, **different-model independent review before PR**.

## Deferred work

PRGRSS starter seed (source-reviewed slice per #48) · template variants ·
assignments/upgrade/rollback/overrides (§2 + D-11/D-12 pending) ·
calculations (D-06 + #7) · client entries/submissions (#38–#40) · assistant
read access if a later slice needs it · unarchive/duplicate (additive).

---

## P-014-I1 implementation record (2026-10-07)

**Branch:** `feature/p014-parameter-template-foundation` (from `origin/main`
`630fc4c`, PR #13 merge). Builder: Devin SWE-2 High. Independent review
pending — required before any PR.

### RED evidence (run before implementation)

- `vitest run tests/unit/coaching-*.test.ts* tests/unit/rbac.test.ts`
  → exit 1: 5 files failed on missing modules (`lib/coaching/gate`,
  `parameters`, `templates`, both boundaries) and `RESOURCES` count
  21 ≠ 23. Boundary-import ban passed vacuously (no app files existed).
- Integration file added before schema existed — first real-PG run on the
  migration produced 21 pass / 4 fail; failures traced to test-side fixture
  gaps (missing `updatedByMemberId` on direct creates, wrong error class on
  a foreign-id read, eager promise rejection). Service code unchanged.
- E2E first run: 11 pass / 2 fail — parameter `key` leaked into DOM
  `option[value]` attributes (fixed: picker carries positional indices) and
  a row-locator test bug. Both fixed; keys now never enter the DOM — only
  the server-boundary payload.

### What was built

- **Schema/migration** `db/migrations/20261007090000_p014_coaching_foundation/`:
  `ParameterDefinition`, `CoachingTemplate`, `CoachingTemplateVersion`,
  `CoachingTemplateVersionParameter`; enums `ParameterKind` (MEASUREMENT,
  RATING, TIME, DURATION, OPTION, TEXT), `RatingScheme`, `ParameterStatus`,
  `CoachingTemplateStatus`. Uniques: `(workspace_id, key)`,
  `(template_id, version_seq)`, `(template_id, publish_origin_revision)` —
  the replay key. Composite FKs enforce param/ws, template/ws, and
  version/template/ws coherence; archive provenance CHECKs on both
  lifecycle tables; all FKs RESTRICT.
- **Services** `lib/coaching/parameters.ts` + `templates.ts`: Serializable
  transactions, in-tx `authorize`, scoped `FOR UPDATE` locks, optimistic
  revisions, server-stamped acknowledgment revisions, deterministic
  ascending parameter-ID lock order at publish, semantic lock via the
  normalized reference table, option-ID tombstones, publish replay,
  `versionSeq = max+1` under the container lock, audit-in-transaction.
- **Boundaries** `parameters-boundary.ts` + `templates-boundary.ts`:
  flag-off refusal before any service call (defense in depth behind the
  action/route gates), byte-before-parse bounds, safe closed error map.
- **Actions** `parameters/actions.ts` + `templates/actions.ts`: flag check
  before `auth()`, before FormData reads, before boundary; success-only
  revalidation.
- **RBAC/audit:** resources `parameterDefinitions` + `coachingTemplates`
  (owner+coach ws read/write; all others denied, platform-admin denied set
  extended); audit types `parameter_definition`, `coaching_template`,
  `coaching_template_version`.
- **UI:** `/workspace/[id]/parameters` (list/create/edit/archive + semantic
  -lock messaging), `/templates` (list/create), `/templates/[id]` (bounded
  draft editor: sections/items/add/remove/reorder/picker/required + save/
  publish), `/templates/[id]/preview?v=N` (immutable snapshot view).
  `Parameters` + `Templates` nav entries gated on flag + owner/coach pin.

### Gate results (implementation tree)

- `npm test` — 724/724 unit (64 files), exit 0.
- Full integration (fresh disposable PG `p014_integration_test`) —
  353/353, 27 files, exit 0; P-014 file alone 25/25.
- `npm run typecheck`, `lint`, `format:check` — exit 0.
- `npm run build` — exit 0; all four routes compiled.
- Focused E2E `coaching-templates` — 13/13 on real Chromium incl. flag-off
  404s on :3101, owner/coach lifecycle, stale-revision and
  `parameter_changed` conflicts, archive confirmation, deny matrix,
  1440/834/390 no-overflow, keyboard focus, no raw IDs in DOM/visible text.
- Full E2E suite run recorded in STATUS.

### Known limitations / honest notes

- `validation` = declarative `{min,max}` numeric bounds on MEASUREMENT and
  DURATION only; no pattern/expression/conditional rule exists or is
  representable (unknown keys are rejected).
- Option labels are unique within a parameter at write time.
- `openTemplateDraft` seeds from the latest version only; items referencing
  since-archived parameters reopen with ack `-1` and fail closed at save.
- Template editor renders labels + kind only — parameter keys/IDs never
  reach DOM attributes.
- E2E relies on the dedicated flag-off server on :3101 (Playwright
  webServer config); the shared test DB accumulates run-unique rows and
  the spec self-cleans in `afterAll`.
