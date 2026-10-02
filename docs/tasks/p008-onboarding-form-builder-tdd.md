# P-008 — Onboarding form builder (TDD recovery)

- **Status:** recovery in progress — checkpoint before first slice
- **Branch:** `feature/p008-onboarding-form-builder-tdd`
- **Worktree:** `../repo-p008-tdd`
- **Base:** `origin/main` `5036796309381732e73c650c783cd0b3d1b3c0ea`
  (fetch-verified 2026-10-02T16:2xZ, no delta)
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

| Slice | Production scope                                                                                                                                                                      | Governing tests (already committed)                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 0     | none — tests-only commit + RED capture                                                                                                                                                | all below                                                                                                                           |
| 1     | `db/schema.prisma` models + migration; RBAC resource; `AuditMeta.status` + `ARCHIVED`; `lib/onboarding/forms.ts` **scaffold** exporting typed signatures that throw `not implemented` | `tests/unit/rbac.test.ts` matrix; `tests/integration/s1-a-identity.test.ts` table pin; suite RED becomes callable-boundary failures |
| 2     | create/list/get + authorization wiring                                                                                                                                                | integration create/list/get/deny-matrix/x-workspace/revoked-reads                                                                   |
| 3     | draft lifecycle: open/save/publish/archive + IDs/revision/concurrency/audit                                                                                                           | remaining integration tests                                                                                                         |
| 4     | boundary module + server actions + routes/pages/editor/preview/nav                                                                                                                    | unit onboarding-forms + source-policy; e2e authz + full lifecycle                                                                   |
| 5     | final gates + evidence bundle                                                                                                                                                         | all                                                                                                                                 |

Per-slice commands:
`npx vitest run tests/unit/...`, `INTEGRATION_DATABASE_URL=<disposable> npx
vitest run --config vitest.integration.config.ts tests/integration/...`,
`DATABASE_URL=<disposable> npx playwright test tests/e2e/onboarding-forms.spec.ts`.
Final: `format:check`, `lint`, `typecheck`, `test`, `test:integration`,
`build`, `test:e2e` (+ reset 404 assertions under forged adapter env).

## Evidence

- Gate/RED/GREEN logs outside Git:
  `/Users/apple/October/untitled-workspace/gate-logs/p008-recovery/`
- Test-file provenance: adapted tests-only from the read-only reference
  branch; headers note origin. No production code copied.

## Checkpoint protocol

1. Plan commit → 2. tests-only commit → 3. RED capture → 4. **STOP** —
   report SHA set to Apollo for audit before slice 1.
