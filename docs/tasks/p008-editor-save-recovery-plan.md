# P-008-R — Editor metadata editing + Save recovery plan

- **Status:** ES-1 helpers complete (`f13a970`) — STOPPED before ES-2; helper
  implementation. Plan `176740e`, tests `dd42327`, scaffold `54e211c`;
  behavioral REDs captured on the clean scaffold tree (see STATUS entry
  2026-10-03). Helper implementation is NOT authorized yet.
- **Approved authority:** Apollo checkpoint release
  `538b5b56-e2f7-4578-90d0-34d2c3cae21c` (P-009, 2026-10-03) — ES-1
  tests+scaffold only on this branch/worktree. Direction approved at audit
  `2feb`; corrections applied in `bb5ef98` (both on
  `feature/p008-onboarding-form-builder-tdd-5c`).
- **Provenance (docs-only):** this plan was carried from
  `docs/tasks/p008-editor-save-recovery-plan.md` @ `bb5ef98` —
  documentation content only; no production file was copied, checked out,
  or transplanted from `e157306`/`d10d788` (reference-only).
- **Requested by:** Apollo request P-009 (2026-10-03).
- **Scope:** definition metadata editing + Save on an existing OPEN draft ONLY.
  Closed-draft and archived states remain fully read-only. NO reopen, publish,
  archive, preview, or client-intake workflows. Retention, client submission,
  and password-reset activation remain deferred.
- **Authority:** this plan does not authorize a push, PR, merge, deploy, or any
  external change. User merge approval is a separate later gate, and this
  increment alone is never merge-ready (see §4 closing).
- **Credentials rule:** no credential or password literal is recorded in any
  tracked file — including synthetic/example/test passwords. Everywhere below,
  `<local-test-password>` stands for a value that lives only in the outside-Git
  local environment (`.env` / shell env). Reports and logs likewise never echo
  credential literals.

## 1. Verified base state (commands run on this worktree, 2026-10-03)

| Item               | Value                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| baseSHA            | `61715321d42c3591861fea56873836750d74e8a8`                                                                             |
| currentmainSHA     | `5036796309381732e73c650c783cd0b3d1b3c0ea`                                                                             |
| Live `origin/main` | `5036796309381732e73c650c783cd0b3d1b3c0ea` — `git fetch` + `git ls-remote origin main` run this session; **no change** |
| Remotes            | `origin` = `hanzlahsfc/The-great-tracker-.git` only — correct                                                          |
| Worktree state     | `repo-p008-tdd` @ `e157306…` on `feature/p008-onboarding-form-builder-tdd-5c`, tree clean                              |

Ancestry/components verified at `61715321`:

- `git merge-base --is-ancestor origin/main 61715321` → true (main-descended;
  `git merge-base 61715321 main` = `50367963` exactly).
- Backend retained: `lib/onboarding/forms.ts` (validateDefinition,
  create/list/get, save `stale_revision`/`no_open_draft`, FOR UPDATE +
  SERIALIZABLE bounded retry), `db/migrations/20261002220000_p008_onboarding_forms/`.
- Boundary + actions retained: `lib/onboarding/forms-boundary.ts`
  (`saveDraftFromAction` byte-bound/safe-message contract) and
  `app/workspace/[workspaceId]/onboarding/actions.ts` (5B contract —
  `workspaceId` first arg, `ActionResult` union, no redirect inside actions).
- Security repair retained: `be20047` — `authorize()` inside EVERY mutating tx
  attempt (`30a1796` mid-retry tests), plus `42d5a7b` tx-binding/mount-delta
  strengthening.
- Read-only mount retained: 5C-2a `app/…/onboarding/forms/[formId]/page.tsx`
  (per-page `getFormForWorkspace` re-authz, non-disclosing 403, read-only in
  every state) + its green mount/read-guard spec.
- Absent at base (the recovery target): `components/onboarding/state.ts`,
  `components/onboarding/draft-editor.tsx`, editable mount wiring,
  `tests/unit/onboarding-draft-editor.test.ts`, the e2e
  `editor save foundation` describe, and the mount-suite open-draft
  reconciliation.

## 2. Recovery topology (proposed — NOT executed)

- Fresh branch `feature/p008-editor-save-recovery` off `61715321`, worktree
  `../repo-p008-editor-tdd`. No branch/worktree is created until this plan is
  approved.
- `e157306` (and the frozen `d10d788` candidate) are **reference only** —
  consulted for contracts/regressions. No cherry-pick, merge, checkout, copy,
  or transplant of any production file. Test files may be adapted with a
  provenance header naming the source SHA (`e157306`, tests-only), per the
  established `5debb24` precedent. The pinned selector/testid contract is a
  test contract and is retained verbatim.

## 3. The three original gaps, narrowed

1. **Blank option creation fails on the callable editor scaffold BEFORE
   implementation — and again on the head immediately preceding the
   add-behavior implementation.** New dedicated e2e assertion + unit seam
   case: clicking `add-field-singleChoice` / `add-field-multiChoice` creates
   exactly one blank option input (`field-options-{i}` placeholder
   `Option label`). Both RED captures are explicit acceptance criteria: the
   failure must be the missing behavior (no blank option row), never a
   missing module/route — which is why the scaffold must already mount and
   render the real selector surface (§4 ES-2 step 3 and step 5).
2. **Normalized-name result gets an independently failing test that defeats
   revalidation masking.** Primary: the save-success transition is a pure,
   production-used function `adoptSavedResult(local, saved)` in the state
   seam; the unit test calls it directly and asserts the displayed name
   becomes `saved.definition.title` (server-normalized) rather than the raw
   local string — no revalidation exists in that context, so nothing can
   heal a wrong source. The DOM harness additionally mounts the real
   component with a mocked `saveDraft` resolving a normalized title and
   asserts the rendered input — the real usage path, still unmaskable. The
   padded-name browser assertions are retained as positive coverage but are
   labeled non-authoritative for this defect class (disclosed: action
   responses carry revalidation, so the DOM can be healed).
3. **Monotonic stale-props contract AND actual component usage pinned.**
   `reseedDraftState(local, incoming)` keeps the monotonic guard
   (dirty → preserve; clean → adopt iff `incoming.revision >=
local.revision`) unit-pinned across the revision/dirty matrix. Usage is
   pinned by a **justified DOM component harness** that mounts the REAL
   `DraftEditor` module: `rerender()` with newer/stale props while dirty and
   clean. This is the real component file — not copied logic and not static
   source matching. Justification: the defect class (adoption source, stale
   revalidation clobber) is structurally invisible to the e2e harness
   because action responses carry revalidation; production test-only routes
   are forbidden; a dev-only mount is the minimal mechanism that observes
   the actual usage path.

   Harness = devDependencies only: `jsdom` + `@testing-library/react` +
   `@testing-library/dom`. Apollo APPROVED the harness in principle
   (correction 8) contingent on: exact versions selected for React 19 +
   installed-Node compatibility, published ≥7 days at install, lockfile
   entries reviewed, and `package.json`/`package-lock.json` changes landing
   ONLY in the tests-infra commit before any production code. There is no
   weaker fallback — if the deps cannot satisfy those checks, execution
   stops and escalates rather than substituting a weaker pin.
   `tests/unit/**/*.test.tsx` is added to the vitest include glob and
   `// @vitest-environment jsdom` marks the harness file; all other unit
   tests keep `environment: "node"`.

## 4. Bounded slices (3)

Per-increment discipline: governing tests committed → callable scaffold (where
applicable) → **behavioral RED captured on the exact committed tree** → minimal
implementation in a SEPARATE commit → scoped GREEN with the remaining
not-yet-implemented tests intentionally RED (enumerated, never implied green).
No `not implemented` scaffold is released as a slice; no historical or
reconstructed RED is ever claimed contemporaneous; no waiver. A "RED" entry
without a same-tree raw log does not exist. Only seam helpers that the editor
component actually consumes are exported — no speculative helpers.

### ES-1 — pure editor state seam (per-helper increments)

- **Allowed files:** `tests/unit/onboarding-draft-editor.test.ts` (new,
  adapted+extended w/ provenance), `components/onboarding/state.ts` (new,
  React-free).
- **Order:** (0) tests-only commit covering all three subsets → RED
  `npx vitest run tests/unit/onboarding-draft-editor.test.ts` (module
  absent — recorded, not claimed as behavioral); (1) ONE scaffold commit —
  exported types + signatures whose bodies
  `throw new Error("not implemented")` → behavioral RED re-run proving every
  subset binds the real module. Then per helper subset, each its own
  production commit:
  - **ES-1a `initialDraftState` + `reseedDraftState`** (mount seed ordering;
    monotonic/dirty props contract — gap 3): recapture subset RED on the
    scaffold head → impl commit → scoped GREEN; subsets b+c stay RED.
  - **ES-1b `adoptSavedResult`** (normalized-title adoption — gap 2):
    recapture subset RED on the ES-1a head → impl commit → scoped GREEN;
    subset c stays RED.
  - **ES-1c `addDraftField`** (exactly-one-blank-option seed for choice
    kinds — gap 1): recapture subset RED on the ES-1b head → impl commit →
    full-file GREEN.
- **Acceptance:** full suite green; recorded mutant check in an ISOLATED
  disposable worktree — removing the `incoming.revision < local.revision`
  guard produces ≥1 failure (see §6 for mutant procedure).

### ES-2 — callable editor scaffold + client-local interactions

- **Allowed files:** `tests/e2e/onboarding-forms.spec.ts` (adapted
  `editor save foundation` describe, mount-suite open-draft reconciliation
  `expectEditorReady`, NEW blank-option test, provenance header update),
  `tests/unit/onboarding-draft-editor.dom.test.tsx` (harness: usage pin,
  monotonic rerender, normalized-name on mocked action — this last one stays
  RED until ES-3, see below), `vitest.config.ts` (`.tsx` include),
  `package.json`/`package-lock.json` (harness dev-deps per §3),
  `components/onboarding/draft-editor.tsx` (new),
  `app/workspace/[workspaceId]/onboarding/forms/[formId]/page.tsx` (mount
  wiring only).
- **Order:**
  1. tests-only + harness commit (spec, unit harness file, vitest config,
     dev-deps) → prospective RED on the clean base: the open-draft mount is
     still read-only and the component module is absent, so
     `expectEditorReady`, the editing assertions, and every harness test
     fail meaningfully.
  2. **Callable scaffold commit:** page mounts `DraftEditor` for
     open-draft + non-archived only (closed/archived untouched read-only
     paths). The scaffold renders the REAL pinned selector surface
     (`form-name`, `field-label-*`, `field-required-*`, `field-help-*`,
     `field-options-*` + `Option label` placeholders, `add-option-*`,
     `Remove field N`/`Remove option N`/`Move field N up` aria labels, all
     six `add-field-*`, visible disabled `save-draft`, an empty
     `role="alert"` region) from the passed props with every handler
     inert (no-op). It is testable-only, never shipped as done: **no fake
     alerts, no fake answers, no fabricated state** — selectors and markup
     are stable metadata, behavior is absent.
  3. **Behavioral RED on the scaffold tree (hard checkpoint):** the
     blank-option test MUST fail here (missing option row, not missing
     module); every edit/dirty/pending/save assertion MUST fail here. If
     any targeted assertion passes on the scaffold, the test is vacuous —
     fix the test, recommit tests-first, recapture RED before any impl.
  4. **Increment A** (mount wiring + local edit state through the seam +
     dirty arming — `save-draft` enabled iff dirty and not pending):
     recapture the governing-subset RED on the clean scaffold head → impl
     commit → scoped GREEN for that subset only.
  5. **Increment B** (field/option add-remove-reorder incl. the
     blank-option seed): recapture the interaction-subset RED — including
     the blank-option test a SECOND time — on the clean Increment-A head
     → impl commit → scoped GREEN.
- **Save stays inert in ES-2** — ES-3 owns action wiring. Consequently the
  harness normalized-name/mocked-action test and all e2e save assertions
  remain intentionally RED at ES-2 head; ES-2 acceptance does NOT claim
  whole-harness or whole-describe green.
- **Acceptance:** `draft-editor` mounts editor-ready on open drafts;
  closed/archived mount tests stay GREEN (regression); edit phase issues
  zero non-GET requests and zero storage delta; harness usage/monotonic
  tests green; blank-option test green after Increment B.

### ES-3 — save wiring + error semantics

- **Allowed files:** `components/onboarding/draft-editor.tsx` (save
  handler). `adoptSavedResult` landed fully in ES-1b — no seam change is
  expected here.
- **Contract:** `saveDraft(workspaceId, FormData{formId, expectedRevision,
draftJson, name})`; exactly one action POST per press; ALL controls
  disabled while pending (`fieldset[disabled]`); success →
  `adoptSavedResult` (server `revision`, `definition.fields`,
  `definition.title`); `!ok` → the boundary's safe scoped alert text,
  unsaved edits preserved, controls re-enable; thrown transport → generic
  alert, preserved edits, NO blind retry; committed-but-lost → explicit
  retry conflicts on `stale_revision` (no double write/audit); server ids
  round-trip across two saves; reload renders persisted state only.
- **Order:** recapture RED on the ES-2 head for the save subset (still
  RED — save inert) → impl → GREEN.
- **Acceptance:** full `editor save foundation` describe GREEN;
  `editor mount` describe GREEN; per-width round-trips at 1440/834/390;
  recorded mutants (isolated disposable worktree per §6):
  (a) adopt raw client name instead of `definition.title` → the DIRECT
  `adoptSavedResult` helper test AND the REAL-component harness test must
  fail — these are the authoritative mutant-killers; the browser e2e
  assertions are positive coverage only and are NEVER counted as mutant
  evidence (they may be healed by revalidation — the known masking
  limitation); (b) drop the monotonic guard → unit subset fails.

### Closing gates (after ES-3, on the recovery head)

- Mechanism: `npm run format:check` · `npm run lint` · `npm run typecheck` ·
  `npm run test` (full unit incl. harness) · `npm run build`.
- Integration (owned disposable DB, §5): `npm run test:integration` full
  suite under `INTEGRATION_DATABASE_URL`.
- E2E (owned disposable DB + production server, §5): the OWNED scoped
  greens — `-g "editor save foundation"`, `-g "editor mount"`,
  `--grep-invert "owner creates|editor controls|full lifecycle"` — PLUS a
  full-repo `npx playwright test` baseline accounting: every spec file's
  result is recorded against the pre-recovery baseline, and each remaining
  intentional RED (reopen/publish/archive/preview lifecycle + preview
  tests) is enumerated by name — never reported as final full-spec green.
- Then STOP → fresh-context **SWE-2** review + distinct-model **Orion**
  review of this increment → repair loop → incremental acceptance ONLY.
  This recovery head is NOT PR/merge-ready: the remaining P-008 slices
  (reopen/publish/archive flows, preview pages + zero-delta proofs,
  production-HTTP hostile-Origin/tampered-bound-arg/revoked-session checks,
  the PLATFORM_ADMIN E2E denial fixture, full final gates + reviews) land
  under their own plans/releases BEFORE any PR, and user merge approval
  remains a separate gate.

## 5. Environment (owned + disposable)

- Disposable PG: reuse the running OWNED `juno-p8-pg` container
  (`postgres:16-alpine`, `127.0.0.1:5445`). Ownership is validated first:
  `docker ps --format '{{.Names}}'` must list `juno-p8-pg` and
  `docker exec juno-p8-pg psql -U app -d postgres -tc 'SELECT 1'` must
  succeed. Credentials come from the outside-Git env — e.g.
  `docker run -d --name juno-p8-pg -e POSTGRES_USER=app -e
POSTGRES_PASSWORD=<local-test-password> -p 127.0.0.1:5445:5432
postgres:16-alpine` only if the container is absent.
- Fresh databases `p8e_int` + `p8e_e2e` are CREATED only after an existence
  check — `psql -tc "SELECT 1 FROM pg_database WHERE datname='p8e_int'"`
  empty → `CREATE DATABASE`. A named existing database is NEVER dropped or
  destroyed; if a stale one collides, pick a new unique name and record it.
- Exact env mapping: `DATABASE_URL` is the application's variable — it is
  set EXPLICITLY on every e2e command (inherited by BOTH the Playwright
  `webServer` env AND `global-setup.ts`, which runs
  `DATABASE_URL=postgresql://app:<local-test-password>@127.0.0.1:5445/p8e_e2e?schema=public
npx prisma migrate deploy` internally). `INTEGRATION_DATABASE_URL` is the
  vitest-integration variable — the integration config maps it onto
  `DATABASE_URL` for the test process, and the integration DB is migrated
  with `DATABASE_URL="$INTEGRATION_DATABASE_URL" npx prisma migrate deploy`.
- **Production server for all e2e:** Playwright `webServer` runs
  `npm run build && npm run start`. `CI=1` is set on EVERY e2e command so
  `reuseExistingServer` can never silently bind a stale dev server; port
  3000 is verified free first (`lsof -i :3000`).
- Browser scope commands (each prefixed `CI=1 DATABASE_URL=postgresql://app:<local-test-password>@127.0.0.1:5445/p8e_e2e?schema=public`):
  `npx playwright test tests/e2e/onboarding-forms.spec.ts -g "editor save foundation"` (slice scope),
  `-g "editor mount"` (read-only regression),
  `--grep-invert "owner creates|editor controls|full lifecycle"` (UI1 regression),
  and the unfiltered spec + full-repo run for closing gates.

## 6. Evidence protocol

- Log dir (outside Git): `gate-logs/p008-editor-recovery/`.
- The interactive terminal is zsh — `$PIPESTATUS` is Bash-specific. Every
  gate/RED/GREEN command therefore runs through an explicit bash runner so
  pipeline status is reliable:
  `bash -o pipefail -c '<cmd> 2>&1 | tee <log>'; rc=$?` — the `rc=$?`
  capture is the IMMEDIATELY next statement (before any `date`/`echo`/tool
  call that would overwrite status). Equivalent form inside a bash script:
  `set -o pipefail; <cmd> 2>&1 | tee <log>; rc=$?`.
- For every gate run the manifest records, in order: UTC start
  (`date -u +%FT%TZ`), `git rev-parse HEAD`, `git status --porcelain`
  (must be empty), the exact command, the safe DB identity (database NAME
  and container only — never credentials), `rc`, UTC end, and post-run
  `git status --porcelain` + HEAD.
- Naming: `red-es{1a,1b,1c,2,3}-*.log`, `green-es{1a,1b,1c,2,3}-*.log`,
  `raw-*-final.log`; failed assertion output is preserved verbatim in the
  log files.
- Test/harness corrections discovered during a RED/GREEN attempt are
  committed BEFORE any production fix, and RED is recaptured on the new
  committed tests tree.
- **Mutant procedure (no destructive ops on the recovery tree):**
  `git worktree add ../p008-mutant-<n> <recovery-head-sha>` → apply the
  single mutation there → run the targeted test → record the failure →
  `git worktree remove` (the recovery worktree itself is never touched —
  no `checkout --`/`reset`/`clean`). Restoration proof: `sha256` of the
  mutated file in the recovery tree recorded before AND after the mutant
  run must match, plus `git status --porcelain` empty.
- `docs/STATUS.md` + this file updated (newest first, real commands/exit
  codes/SHAs) on the recovery branch after every meaningful step.

## 7. Risks + blocked choices (for audit)

- **Resolved by audit:** harness dev-deps approved in principle (§3 —
  exact-version/React-19/Node compat + lockfile review at install, deps in
  the tests-infra commit only); recovery branch/worktree naming accepted.
- **Blocked choice B — none outstanding** other than final version pinning
  at install time.
- Risk: adapted mount reconciliation turns previously-green open-draft
  mount tests RED until ES-2 lands — intended; enumerated in RED logs.
- Risk: harness jsdom is not RSC — it cannot reproduce server-driven
  revalidation; it pins component usage of the seams, and the real
  revalidation path stays covered by the browser tests. Browser
  normalized-name assertions may be healed — they are coverage, never
  mutant evidence.
- Risk: `vitest.config.ts` include-glob change is test-infra, committed in
  the tests/harness commit before production.
- Out of scope and deferred: reopen/publish/archive/preview + their HTTP
  abuse checks, intake, retention, client submission, reset activation,
  push/PR/merge/deploy.
