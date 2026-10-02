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
