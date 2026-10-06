# P-008 — Onboarding form builder (TDD recovery)

- **Status:** recovery in progress — checkpoint before first slice
- **Branch:** `feature/p008-onboarding-form-builder-tdd`
- **Worktree:** `../repo-p008-tdd`
- **Base:** `origin/main` `5036796309381732e73c650c783cd0b3d1b3c0ea`
  (fetch-verified 2026-10-02T16:13Z, no delta)
- **Read-only reference:** `feature/p008-onboarding-form-builder` @
  `d10d7883e7cebab25d433fa2ee1c6a475847c2cd` — preserved unchanged; consulted
  for contracts/regressions only, production code is never transplanted.

## Why this exists

The original P-008 candidate (`d5048ef`…`d10d788`) passed all technical
review gates but the initial implementation was written **before** its
failing tests (retrospective RED runs against a merge-base tree do not
satisfy test-first). The owner **rejected** the requested test-first
exception. Per Apollo's binding recovery instruction: rebuild the feature
on this fresh branch with strict RED→GREEN per slice. No cherry-pick, merge,
or checkout of the old production tree. Test files may be adapted as
tests-only with provenance noted (see headers in the test files).

## Locked scope (unchanged from P-008 plan + owner decision #29)

- Resource `onboardingFormTemplates`: WORKSPACE_OWNER + ACTIVE COACH
  read/write at workspace scope; ASSISTANT_COACH, SUPPORT, CLIENT,
  PLATFORM_ADMIN and non-members denied on every path.
- `onboarding_form` (mutable draft, `draftRevision`, archive metadata,
  preserved read-only draft) + `onboarding_form_version` (immutable snapshot,
  `publishOriginRevision`, `@@unique(formId, versionSeq)`), Restrict FKs.
- Server-minted `f_*`/`o_*` IDs; ID trust set = CURRENT draft only
  (retired IDs cannot resurrect; reopen explicitly reseeds from latest
  version); save requires an open draft (`no_open_draft`).
- Optimistic revision → `stale_revision`; FOR UPDATE + SERIALIZABLE +
  bounded retry (P2034 AND P2010/40001) on save/open/publish/archive;
  idempotent publish replay + archive.
- Boundary bounds raw `draftJson` bytes BEFORE `JSON.parse`; normalized
  definition byte-bound retained; closed audit-meta allowlist with
  `status: "ARCHIVED"` for archive events.
- Staff-only routes (list/new/edit/preview), server actions only via the
  boundary; editor disables all controls while any mutation is pending;
  publish disabled while unsaved edits exist; editor rebinds to the
  server-returned normalized definition; props re-sync is identity-gated.
- Preview is explicit-source: `?src=draft` vs frozen published version —
  no form element, all controls disabled, zero storage/DB/network delta.
- **Excluded:** intake routes/tokens/response storage, invite wiring,
  profile population, client-flow activation, reset activation, deploy.

## Slice plan (each: tests committed+run RED on the committed tree → minimal

implementation → GREEN, logs captured outside Git)

Per-Apollo slice split (post-checkpoint audit correction): each production
change gets its own committed-test RED on the exact tree first — no bundled
slices, no `not implemented` scaffold release, no bulk transplant.

| Slice | Production scope                                                         | Governing tests                                                                       |
| ----- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 0     | none — tests-only commit + RED capture                                   | all below                                                                             |
| 1A    | `lib/auth/rbac.ts`: `RESOURCES` + matrix row only                        | direct per-role `resolveScope` test in `tests/unit/rbac.test.ts`                      |
| 1B    | `db/schema.prisma` models + migration                                    | `tests/integration/s1-a-identity.test.ts` table-pin (tables absent → meaningful fail) |
| 1C    | `lib/audit.ts`: `ARCHIVED` in status union + validator                   | direct failing meta assertion (committed before edit)                                 |
| 1D    | `lib/onboarding/forms.ts`: types + `validateDefinition` only             | `tests/unit/onboarding-forms.test.ts` bounds/ID-trust describes                       |
| 2     | create/list/get + authorization wiring                                   | integration create/list/get/deny/x-workspace/revoked-reads                            |
| 3     | save/open + ID trust + revisions + `no_open_draft`                       | integration stable-IDs/no-open-draft/retired-IDs tests                                |
| 4     | publish immutability/idempotency + archive + serialized concurrency      | integration publish/immutable/race/archive tests                                      |
| 5     | `forms-boundary.ts` + server actions + routes/pages/editor/preview + nav | unit boundary/seam; e2e spec                                                          |
| 6     | final gates + evidence bundle                                            | all                                                                                   |

Exact commands (run from the worktree root):

- `npx vitest run tests/unit/rbac.test.ts`
- `npx vitest run tests/unit/onboarding-forms.test.ts`
- `npx vitest run tests/unit/audit.test.ts tests/unit/guard.test.ts`
- `INTEGRATION_DATABASE_URL="postgresql://app:app_dev_password@127.0.0.1:5445/p8_int?schema=public" npx vitest run --config vitest.integration.config.ts tests/integration/p008-onboarding-forms.test.ts`
- `DATABASE_URL="postgresql://app:app_dev_password@127.0.0.1:5445/p8_e2e?schema=public" npx playwright test tests/e2e/onboarding-forms.spec.ts`

Final gates: `npm run format:check`, `npm run lint`, `npm run typecheck`,
`npm run test`, `INTEGRATION_DATABASE_URL=… npm run test:integration`,
`npm run build`, `DATABASE_URL=… npm run test:e2e` (+ the reset-404 spec
under `PASSWORD_RESET_DELIVERY_ADAPTER=resend`).

## Evidence

- Gate/RED/GREEN logs outside Git:
  `/Users/apple/October/untitled-workspace/gate-logs/p008-recovery/`
- Test-file provenance: adapted tests-only from the read-only reference
  branch; headers note origin. No production code copied.

## Checkpoint protocol

1. Plan commit → 2. tests-only commit → 3. RED capture → 4. **STOP** —
   report SHA set to Apollo for audit before slice 1.

## Slice 5A — server boundary plan (lib/onboarding/forms-boundary.ts ONLY)

Proposed public surface (all take `(session, input, deps?)` and return a typed
`ActionResult<T> = { ok: true; value: T } | { ok: false; message: string }`,
matching the password-reset boundary convention — safe stable messages, never
service internals/stacks/SQL/payloads):

- `saveDraftFromAction(session, {workspaceId, formId, expectedRevision, draftJson, name?}, {db?})`
  → `{revision, definition}`
- `openDraftFromAction(session, {workspaceId, formId}, {db?})`
  → `{revision, definition}`
- `publishFromAction(session, {workspaceId, formId, expectedRevision}, {db?})`
  → `{versionSeq}`
- `archiveFormFromAction(session, {workspaceId, formId}, {db?})`
  → `{formId}`
- `listFormsForWorkspace(session, {workspaceId}, {db?})` → `{forms: summaries}`
- `getFormForWorkspace(session, {workspaceId, formId}, {db?})` → detail

Boundary rules (test-pinned):

1. `draftJson` byte-bound (UTF-8) BEFORE `JSON.parse` — oversized payloads
   reject pre-parse AND before any service/DB call.
2. Malformed JSON, non-integer revisions, malformed/oversized IDs/strings →
   `invalid_input` mapped to a safe message; no service call.
3. Every wrapper binds the injected `deps.db` (or default prisma) to the
   service call — no global-repo bypass.
4. `OnboardingFormError`/`AccessDeniedError` → safe stable messages;
   unexpected faults → generic message, no stack/SQL/payload echo.
5. Boundary NEVER logs draft content.
6. These are library adapters — they do NOT prove HTTP/CSRF/session security;
   that is asserted only when routes land.

Increments: 5A-1 raw bound + JSON parse + ID/revision guards; 5A-2 mutation
wrappers + error mapping; 5A-3 read wrappers.

## Slice 5B — server actions only, plan v3 (Apollo 71b7d62e)

Scope: `app/workspace/[workspaceId]/onboarding/actions.ts` (`"use server"`)
ONLY. No pages, editor, nav, preview, or routes under 5B.

### CSRF/Origin — pinned framework source (Next 15.5.25)

`node_modules/next/dist/server/app-render/action-handler.js:397-430`:

- `originDomain` from `Origin` header vs `parseHostHeader` (x-forwarded-host
  preferred, else Host — `:322-340`).
- Missing Origin → warning only, action proceeds (`:407-410`).
- Mismatch with host present/absent → E80 "Invalid Server Actions request"
  abort (`:418-430`) unless `serverActions.allowedOrigins` matches
  (`isCsrfOriginAllowed`, `:415`).
- `next.config.ts` sets NO `allowedOrigins`; no custom CSRF layer exists.
  Consequence: framework rejects cross-ORIGIN actions; MISSING-origin requests
  proceed and are gated by session+service authz. A production-HTTP
  hostile-Origin zero-write check is REQUIRED at the later UI-mount slice
  (recorded as a gate, not optional).

### Definite action contract

```ts
type OnboardingActionResult<T> =
  { ok: true; value: T } | { ok: false; message: string };
```

Every mutation returns this union — NO `redirect()`/`forbidden()` inside
actions. `revalidatePath` runs ONLY after `{ ok: true }`. `deps` is never
accepted as action input — wrappers use the default client; the injected-db
seam remains internal/test-only.

### Actions (all `auth()` first; missing session → `DENIED` before service)

- `createForm(formData)` → `{formId}`; `name` single string ≤ 120.
- `saveDraft(formData)` → `{revision, definition}`; `formId`,
  `expectedRevision`, `draftJson`, optional `name`.
- `publishForm(formData)` → `{versionSeq}`; `formId`, `expectedRevision`.
- `archiveForm(formData)` → `{formId}`; `formId`.
- `openDraft(formData)` → `{revision, definition}`; `formId`.

Input rules: `singleString(fd, key, max)` uses `fd.getAll(key)` — rejects
duplicates, `File`, missing, empty, oversized. `expectedRevision` requires
`/^[0-9]+$/` → `Number()` → `Number.isSafeInteger` and `<= 2147483647`
(Int column). No `parseInt` coercion; no coercion of non-decimals.
`draftJson` passes to the boundary as raw string — the byte bound stays
there. Workspace scope comes from the ROUTE param `workspaceId` bound
server-side by the caller — never trusted as a form field.
Service remains the final membership/role/workspace authority.

### Test list (before impl)

Unit (labeled auth mock — `vi.mock("@/auth")` + boundary spies):
missing session → `{ok:false,DENIED}` + zero service calls; File/duplicate/
missing/oversized fields → INVALID without delegation; revision `'abc'`,
`'2.5'`, `'1e3'`, `''`, `9999999999999999` → INVALID; success forwards exact
raw strings + returns `ok`; `revalidatePath` called only on ok; no payload
in logs.

Integration (seeded fixtures, real service via boundary): owner create/
save/publish/archive happy paths through real action functions;
cross-workspace formId denied; post-demotion actor denied; failures write
zero rows (version/audit counts unchanged).

Callable scaffold RED checkpoint: signatures + untyped throws committed
separately, RED on clean committed tree, then increments — 5B-1 input
validation, 5B-2 delegation+revalidate.

### 5B signature clarification (Apollo 5376ff93)

Exact signatures — `workspaceId` is an explicit FIRST ARG bound by the
calling page later; it remains an UNTRUSTED request input (validated shape +
guarded service enforces current actor access — argument binding is never
authorization):

```ts
createForm(workspaceId: string, formData: FormData)
saveDraft(workspaceId: string, formData: FormData)
publishForm(workspaceId: string, formData: FormData)
archiveForm(workspaceId: string, formData: FormData)
openDraft(workspaceId: string, formData: FormData)
```

- `expectedRevision` policy: `0` is syntactically valid (safe Int32) — the
  service's stale-revision gate decides semantics.
- Optional `name`: absent → `undefined`; present → strict string bound, then
  service normalization decides blank handling. Actions don't pre-bless.

## Slice 5C — UI plan v2 (expanded, Apollo 3b0ce3aa — no impl until audit)

Canonical routes (matching the 5B actions):

- `app/workspace/[workspaceId]/onboarding/forms/page.tsx` — list
- `app/workspace/[workspaceId]/onboarding/forms/new/page.tsx` — create
- `app/workspace/[workspaceId]/onboarding/forms/[formId]/page.tsx` — editor
- `app/workspace/[workspaceId]/onboarding/forms/[formId]/preview/page.tsx`
  — preview (`?src=draft` | `?src=version`)
- `WorkspaceNav` entry gated by the same `onboardingFormTemplates` read scope.

### Authorization contract (resource-specific, per page)

The parent workspace layout check is INSUFFICIENT — each of list/new/detail/
preview performs its OWN boundary call (`listFormsForWorkspace` /
`getFormForWorkspace`) with the current session so owner + ACTIVE coach
reach the page and ASSISTANT_COACH / CLIENT / SUPPORT / PLATFORM_ADMIN /
nonmember receive the repo-standard 403 (`forbidden()`) and revoked or
inactive users/members are denied immediately with no cached authority.
Cross-workspace formId and nonexistent formId are indistinguishable (403 —
non-disclosure, consistent with the boundary's cross-workspace=missing
contract); malformed workspace/form segments fail before any read.
Unauthenticated deep links redirect to /login via `requireSessionUser`.
The nav entry is rendered only when the server-computed current scope
permits (NOT cosmetic hiding — the pages still re-check on every request).

### Pinned test/selector contract

The existing spec's selector contract is authoritative (retained; no
production transplant): `new-onboarding-form` (list CTA), `form-name-input`
(create input), `Create form` role-button (create submit),
`onboarding-forms-table`, `onboarding-empty-state`,
`onboarding-form-editor`, `form-name`, `draft-editor`, `no-draft`,
`save-draft`, `publish-form`, `archive-form`, `open-draft`,
`add-field-*`, `add-option-*`, `field-label-*`, `field-options-*`,
`onboarding-form-preview`, `preview-*`. Accessible roles/names preferred
for user-facing elements. Implemented 5C-1 additions, now equally pinned:
`form-status-badge` (DRAFT/PUBLISHED/ARCHIVED), `form-version` (`v{n}` or
`—`), `create-onboarding-form` (create form wrapper), `archived-banner`
(editor read-only marker for archived forms).

UI1 ownership command (this slice's green scope ONLY — the remaining
editor/preview specs are intentionally RED, never claim whole-feature
green): `npx playwright test tests/e2e/onboarding-forms.spec.ts
--grep-invert "owner creates|editor controls|full lifecycle"` with
explicit owned `DATABASE_URL` (disposable DB identity mandatory; an unset
fallback is not disposability proof).

### List page

- Renders forms with name, status (DRAFT-only / has versions / ARCHIVED
  badge), latest version number, updated timestamp.
- Empty state with a single primary "New form" action.
- Status badges distinct for draft-only, published, archived; archived rows
  visibly marked and open the read-only editor view.
- Mixed state contract (pinned by seed): an OPEN draft over published
  history shows DRAFT + the retained latest `v{n}` — published history is
  never implied gone while a current draft exists.
- Closed-draft fixtures are seeded with `Prisma.DbNull` (SQL NULL) —
  matching what publish actually writes, not JSON null.
- Non-blocking observations (documented, NOT rewritten this slice):
  a) the list page maps ANY boundary `!ok` to `forbidden()` — including
  infra faults; a future distinction between denied and degraded is a
  deliberate follow-up, not silent scope creep;
  b) `listOnboardingForms` selects the whole `draft` JSON column only to
  compute `hasDraft` — a cheaper `draft IS NOT NULL` projection is a
  valid future optimization inside the service/boundary contract.

### Create page

- Name field bound to the `createForm` action (FormData `name` only —
  workspaceId is a bound first arg, never a form field).
- Exact safe validation result surfaced (`{ ok:false, message }` — no
  inline server detail leak).
- Submit control + name input disabled while the action is pending
  (double-submit-safe); on `{ ok:true }` → `router.push` to the new
  form's editor route.
- No anonymous or client-facing intake surface exists.

### Editor mount + read guards (5C-2a)

- Canonical route `/workspace/[workspaceId]/onboarding/forms/[formId]`
  performs its own current-resource `read` authorization via
  `getFormForWorkspace` — every request re-resolves membership/role/
  workspace; `!ok` fails closed to the non-disclosing 403.
- Rendered read states only — READ-ONLY in EVERY state this slice, not
  only archived: `form-name` is a disabled control, `draft-editor` field
  controls are all disabled, and ZERO mutation/submit control exists in
  the editor region (`save-draft`, `publish-form`, `archive-form`,
  `open-draft`, any `button`/`[type=submit]` inside
  `onboarding-form-editor`). Mount issues ZERO mutating requests and zero
  DB/audit delta. Open draft → `draft-editor`; otherwise → `no-draft`;
  archived → `archived-banner` — and an archived form carrying a
  preserved draft renders that draft content read-only (never editable).
- Denial/non-disclosure probes (browser, production server): assistant
  deep link 403 (only denied role past the layout — the page-level guard
  probe); DUAL-member wsA-formId-under-wsB identical to nonexistent
  (same `access-denied` content, form name never rendered); nonexistent
  and malformed formIds identical 403; unauthenticated → `/login`; no
  horizontal overflow at 1440/834/390.
- Coverage note (named outstanding): a PLATFORM_ADMIN browser-denial
  fixture does not exist in the E2E identities — platform denial is
  covered at the unit/integration matrix level; an E2E fixture may be
  added later. Full actor coverage is NOT claimed here.
- Ownership command: `npx playwright test tests/e2e/onboarding-forms.spec.ts
-g "editor mount"` — this slice's scope only; lifecycle/edit/preview
  tests remain intentionally RED.
- Editing behaviors are expressly NOT part of 5C-2a.

### Editor state machine (5C-2b+)

- Server-normalized definition + `draftRevision` arrive as revalidated
  props; client edits update local state and set `dirtyRef` — prop identity
  changes re-seed only when NOT dirty (no refresh clobber of in-flight
  edits).
- ALL editing + mutating controls inside `fieldset[disabled]` while any
  action is pending.
- Save is enabled only while dirty=true and not pending; it carries the
  current `expectedRevision`.
- Publish requires an OPEN draft that is SAVED-CURRENT (dirty=false — the
  latest draft state has been saved at a known `expectedRevision`), no
  pending mutation, and the form not archived. dirty=true blocks publish.
- Reopen is enabled only while the form is ACTIVE and no draft is open
  (closed/published state); it seeds the draft from the latest published
  version and is idempotent. An ARCHIVED form is permanently read-only —
  reopen is never offered and the service denies with `form_archived`.
- Archived form: editor renders read-only (no save/publish/archive/open
  controls); archived banner. Reopen is never offered — verified pinned.
- Publish history is immutable — version rows never editable.
- Pending-disable coverage: the slowed-mutation test MUST exercise both
  save AND open-draft controls while a mutation is in flight, not only the
  save path.
- Authorization probes pinned for the editor: the assistant deep link is
  the reliable page-level guard test (other denied roles are already
  rejected by the parent staff layout, so only the assistant exercises the
  resource guard itself); foreign-workspace and nonexistent formIds return
  the IDENTICAL non-disclosing 403 — proven with a DUAL-member actor
  (member of BOTH workspaces): a wsA formId fetched under a wsB URL must
  exercise the resource-level workspace scoping, not mere nonmembership
  (the existing list-level foreign test only proves layout nonmembership);
  an archived form deep link renders the read-only view + banner; a
  mid-session revoked/inactivated member is denied on the next real
  browser request (no cached authority).

### Preview pages (5C-4)

- `?src=draft` renders the current draft definition; `?src=version`
  renders the latest published version — explicit and labeled.
- `?src` missing or carrying any other value fails safely; `?src=version`
  on a form with ZERO published versions resolves the pinned non-disclosing
  failure, never a draft leak.
- Version selection is exact: `src=version` renders the LATEST published
  version; where an explicit version is addressable, an older version
  renders its own frozen snapshot — never silently the latest.
- All preview inputs disabled; the page issues ZERO mutating requests.
- Snapshot: storage key→value pairs, draft JSON, draftRevision, version
  count, audit-event count identical before/after viewing — the audit
  delta is asserted on EVERY preview variant, not only `src=draft`.
- Assistant deep-link denial applies to preview routes for the same
  page-level guard reason.

### Browser gates (per increment, prospective RED)

- Full lifecycle at 1440/834/390 (not width-sampled).
- Keyboard/focus flow; no horizontal overflow on any populated page.
- Production-mounted action HTTP checks: hostile-Origin, tampered bound
  argument, and revoked-session zero-write. Missing-Origin behavior
  observed and labeled (framework warns+proceeds); proxy trust assumptions
  documented explicitly.
- Mid-session revocation: demote/inactivate a signed-in member server-side
  and assert the next real navigation/action is denied — proves no cached
  authority survives role loss.

### Increments

- 5C-1 list + create + nav entry (per-page checks, denied matrix, deep
  links, empty/draft/published/archived list states, pending-safe create)
  — DONE @ `14a7467`; prospective RED captured at `40a5115`, gates +
  remaining RED recorded in `gate-logs/p008-recovery/slice-5c1.md`.
  STOPPED for audit before 5C-2.
- 5C-2a editor mount + read guards: canonical route mount, per-page
  resource authorization, denied/foreign/nonexistent non-disclosure,
  archived permanently-read-only mount, width overflow — ownership
  `-g "editor mount"`; NO save/publish/reopen/preview behavior
- 5C-2b editor: add/remove/reorder fields+options, save, reopen seeding,
  dirty/pending state machine, archive read-only view
- 5C-3 publish + archive flows + immutable version list
- 5C-4 preview pages + zero-mutation/storage/DB delta proofs + HTTP
  hostile-Origin/tamper/revoked-session checks

Scope: no submissions, client workflow, retention decisions, or intake UI.
