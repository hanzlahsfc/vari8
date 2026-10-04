# P-008 remaining lifecycle + security — bounded plan (PLAN ONLY, no implementation)

- **Status:** plan only, submitted for parallel review (Apollo request
  `57523a99-a77e-467b-ba53-cc326b3076b5`; corrections per Apollo
  `78d85f64-4881-47c9-96cb-2c47fa1774ed` + Orion ES-5 blockers + Orion
  platform-admin guard finding + Helios conditional-PASS items A/B
  under ES-4a prep `caa50bf4` folded in). No source/test/dep changes
  authorized for planning; ES-4a prep commits `71ca892`/`47558a5` are
  tests + inert scaffold only.
- **Base:** accepted editor/save increment `0c6242b` (+ docs `d4cdd62`)
  on `feature/p008-editor-save-recovery-es2a`.
- **Preserved:** backend service (`lib/onboarding/forms.ts` —
  `publishOnboardingForm`, `openOnboardingDraft`, `archiveOnboardingForm`
  with replay/stale/archived guards), boundary delegates
  (`forms-boundary.ts`), actions (`actions.ts`), helpers (`state.ts`),
  editor (`draft-editor.tsx`). No speculative service changes.
- **Out of scope:** submissions/intake, lifecycle scope expansion,
  push/PR/merge/deploy.

## What already exists vs what is missing

| Layer                                                                                    | State                                         |
| ---------------------------------------------------------------------------------------- | --------------------------------------------- |
| Service publish/reopen/archive + replay/stale guards                                     | EXISTS (verified `lib/onboarding/forms.ts`)   |
| Boundary delegates + server actions (`publishForm`, `openDraft`, `archiveForm`)          | EXISTS (`actions.ts`)                         |
| `no-draft` / `archived-banner` read-only surfaces                                        | EXISTS (`[formId]/page.tsx`)                  |
| `publish-form` / `archive-form` / `open-draft` UI controls                               | MISSING — RED                                 |
| `preview-draft-link` / `preview-version-link` + preview page                             | MISSING — RED                                 |
| Lifecycle controls disabled during in-flight mutation                                    | MISSING — RED (requires shared pending scope) |
| Real-HTTP hostile-Origin / tampered-arg / revoked-session / mid-session-revocation gates | MISSING                                       |
| PLATFORM_ADMIN browser denial fixture                                                    | MISSING (known gap)                           |

## Governing prospective tests (already committed RED)

From `tests/e2e/onboarding-forms.spec.ts` — may be adapted with
provenance only; no silent rewrites:

- `owner creates, edits, publishes, reopens, v2, and archives`
  (line ~1593): create → save (rev 2) → re-save stable field ids
  (rev 3) → draft preview zero-delta → publish → v1 + `no-draft` →
  version preview (`preview-source` "version 1") → `open-draft` seeds
  from v1 (rev 4) → edit+save (rev 5) → publish v2 → `archive-form` →
  list shows ARCHIVED. **Includes preview steps → stays RED through
  ES-4a; only flips at ES-4b.**
- `editor controls disable while a mutation is in flight`
  (line ~1740): `publish-form` + `archive-form` disabled while save
  pending; re-enable after settle. **Lifecycle-only → flips at ES-4a.**
- `responsive + keyboard` `full lifecycle` at 1440/834/390
  (line ~2016): full flow incl. previews + overflow checks. **Stay RED
  through ES-4a; flip at ES-4b.**
- Committed preview contract (line ~1887–1990, authoritative):
  `preview` route = `/workspace/[ws]/onboarding/forms/[formId]/preview`;
  draft is the DEFAULT source; `?src=version` renders the LATEST frozen
  version — NOT a `?version=<seq>` param (reconciled; the committed
  test wins). Zero-delta already pins: serialized `[draft,
draftRevision, name]` byte-equality, version count, auditEvent count
  (`resourceType "onboarding_form"`), empty mutating-request list,
  `storageSnapshot` equality. ES-4b EXTENDS this to full form-row +
  timestamp + per-version snapshot and storage VALUES across all
  preview variants (draft vs latest vs historical seq where
  addressable).

## Proposed slices (each: tests-first RED → minimal impl → clean-head gates)

### ES-4a — lifecycle controls wiring

**UI contract** (exact testids, all on `[formId]/page.tsx` surfaces):

- `publish-form` — rendered only when an open draft exists; `disabled`
  when `state.dirty` **OR** any transition is pending (publish
  requires a saved-current clean draft and no in-flight mutation);
  submits `formId` + `expectedRevision` (current `state.revision`) via
  `publishForm`.
- `open-draft` — rendered on the `no-draft` branch; submits `formId`
  via `openDraft`; service-side replay of an already-open draft is
  idempotent.
- `archive-form` — submits `formId` via `archiveForm`; on `ok`
  `router.push` to the canonical list path (committed test asserts
  `/onboarding/forms$` URL + ARCHIVED badge).
- **Pending scope:** `pending = savePending || lifecyclePending` —
  every mutation control (name input, fieldset, save, publish,
  archive) disables during ANY in-flight action. Wiring: publish and
  archive render inside `DraftEditor` (outside the fieldset);
  `open-draft` is a standalone `OpenDraftButton` client component (it
  only renders when no editor is mounted).
- Alert/typing identical to save: typed rejection → boundary message;
  transport → generic; no echo of internals/ids/payload.
- **Tests-only inversion enumeration (Helios A — landed in prep commits
  `71ca892`/`47558a5`, explicit so the ES-4a diff is honest):** the
  shared `expectMountReadOnly` helper is SPLIT into
  `expectArchivedReadOnly` (zero mutation controls; archived incl.
  draft denial + zero-delta assertions unchanged — NOT weakened),
  `expectNoDraftMount` (published/no-draft: `open-draft` + `archive-form`
  enabled, `save-draft` + `publish-form` absent, exactly 2 editor-region
  buttons, name disabled/data-readonly), and `expectEditorReady`
  (open draft: name/fields enabled, `save-draft` clean-disabled,
  `publish-form` + `archive-form` ENABLED on clean mount, `open-draft`
  absent, no submit control). DOM-side pins cover publish
  `disabled` when dirty or pending. These expectations are RED until
  ES-4a production lands — that inversion is the pin, not a weakening.
- **NEW focused e2e cases for ES-4a** (do NOT depend on preview):
  publish-open-draft-only happy path (publish → `no-draft` →
  `open-draft` → seeded editor → publish v2), pending-breadth case
  (existing committed test), archive-only case. The 4 committed cases
  that interleave preview steps stay RED until ES-4b — named, not
  claimed.

### ES-4b — zero-mutation previews

**Route contract (reconciled to committed spec BEFORE tests):**
server component, read-only, guarded read (`getFormForWorkspace`
boundary — workspace + role re-checked server-side every request;
clients/non-members denied):

- `/workspace/[workspaceId]/onboarding/forms/[formId]/preview` —
  current OPEN DRAFT (default `src`). `data-testid
=onboarding-form-preview`, `preview-source` contains `draft`,
  `preview-fields` renders every field kind (shortText input, longText
  textarea, number, date, singleChoice radios, multiChoice checkboxes)
  with ALL controls `disabled` (the committed test counts
  `input[disabled]`/`textarea[disabled]`/`fieldset[disabled]` against
  totals); NO `<form>` element; zero non-GET requests.
- `/preview?src=version` — LATEST frozen published version;
  `preview-source` contains `version <seq>`; same disabled/no-form/
  zero-mutation contract. Historical seq selection (e.g.
  `?src=version&seq=N`) is an additive extension only if a test pins
  it — not assumed.
- **`src` query contract (Helios B — explicit, no silent fallback):**
  `src` missing OR `src=draft` → current open draft;
  `src=version` → latest frozen published version; an UNKNOWN `src`
  value → safe NON-DISCLOSING not-found (same denial surface as
  unauthorized access — never a default draft fallback); `src=version`
  on a form with ZERO published history → non-disclosing fail (no
  draft leak, no empty-version fabrication).
- `preview-draft-link` on the editor (open draft); `preview-version-link`
  on the no-draft branch.
- **Zero-delta breadth (per Apollo):** before/after snapshots across
  draft + version variants — full form row (`draft`, `draftRevision`,
  `name`, `updatedAt`/timestamps, status), version rows (count AND
  per-row serialized content), auditEvent count/content for the
  resource, storage snapshot VALUES (not just keys), and the captured
  mutating-request list empty.

### ES-5 — real-HTTP security gates (new spec, owned infra)

New spec `tests/e2e/onboarding-forms-security.spec.ts`; owned
`juno-p8-pg`/`p8e_e2e`; `CI=1`; production `build && start`; port 3000
verified free; `workers: 1`. Orion blockers B1–B7 folded in below.

**Protocol discipline (B1/B6):** every negative probe pairs with a
positive control in the SAME build — capture the real action protocol
(`Next-Action` header id + RSC/FormData body encoding) from a live
browser-driven save on the production build; replay that captured
encoding for negatives. A negative is only meaningful if its sibling
positive control produces the expected write/audit row. Distinct
expected outcomes are asserted explicitly: framework-level reject
(Next 15.5.x Origin/X-Forwarded-Host check → error status, no typed
result) vs typed action denial (`{ok:false}` safe message) — no
hardcoded status/body assumptions without observed evidence; no
hardcoded action ids (captured per build). Each case uses fresh,
isolated form state so stale rows cannot mask a false pass; negative
assertions snapshot FULL `onboardingForm`/`onboardingFormVersion`/
`auditEvent` rows (not counts only), positives assert the exact
expected write.

**Cookie/session handling (B7):** `page.context().request` shares the
browser's HttpOnly cookie jar (use it for authenticated probes); a
standalone `request` fixture does NOT carry cookies (use it for the
no-session arm). Credentials and captured action ids never appear in
logs (redacted); any fixture/member mutation is restored in `finally`;
the `deactivated` fixture's upsert sets `status: "ACTIVE"` (verified
`global-setup.ts` — it is a no-membership user, not a deactivated
account; membership/status are asserted fresh in-test before use).

**Matrix (all on the real action endpoints):**

1. **Positive control** — valid session + valid same-origin `Origin`
   - captured action encoding → expected mutation lands (form row +
     audit row), observed status/body recorded as the reference.
2. **Missing Origin** — valid session + valid payload + NO `Origin`
   header → OBSERVE and document actual behavior (must not assume Next
   rejects); the result is recorded honestly either way.
3. **Hostile Origin** — matching valid session/payload with
   `Origin: https://evil.example` + real `Host` → zero writes, full-row
   negative snapshots; observed reject class named.
4. **Hostile Origin + spoofed `X-Forwarded-Host`** — pinned Next
   15.5.25 prioritizes XFH for the host check, so
   `Origin: https://evil.example` + `X-Forwarded-Host: evil.example`
   MAY execute at app level. This documents app behavior ONLY — not
   proxy proof; the deployment edge MUST strip/overwrite
   `X-Forwarded-Host`/`Forwarded` and `Host` trust assumptions are
   bounded by it. `auth.config.ts` `trustHost: true` scope is noted.
   No owned edge harness exists → named as a FINAL DEPLOYMENT GATE; no
   CSRF config is silently changed.
5. **Tampered bound argument** — valid session, action POST with
   `workspaceId` rebound to workspace B. `coach` is a member of A only
   (verified `global-setup.ts`: owner has A+B) → use the COACH session
   so denial probes workspace authorization, not ownership; plus a
   foreign-formId arm (publish/open/archive on a ws-B form id from a
   ws-A session). Existing dual-member read-isolation coverage
   preserved untouched.
6. **Revoked session** — JWT strategy (verified: `auth.config.ts`
   `session.strategy = "jwt"`; revocation counter is
   `User.sessionVersion` — `lib/auth/session.ts` gates `token.sv`
   against the DB value; password reset bumps it via
   `sessionVersion: { increment: 1 }`). Revoke by incrementing
   `sessionVersion` (and/or `status` flip) in the DB, then action POST
   → safe denial + zero writes; NO session-row deletion (there are no
   session rows — JWT).
7. **Mid-session membership revocation** — active session mounted,
   then the `workspaceMember` row deleted/deactivated between mount
   and POST → denial + zero writes (service reauthorizes per call);
   member row restored in `finally`.
8. **PLATFORM_ADMIN legs (Orion blocker — corrected):** the workspaceId
   authorize path selects the ACTIVE membership role, so a
   `platformRole: PLATFORM_ADMIN` user WITHOUT membership is denied by
   the membership gate BEFORE the role is ever evaluated — that fixture
   proves membership-gating ONLY, not platform-role denial.
   a. `platform-admin@s1h-e2e.test` (PLATFORM_ADMIN, NO workspace
   membership) → denied + zero writes; asserted and DOCUMENTED as
   membership-gate proof, not platform-role proof.
   b. **TABLED as unresolved PD29 precedence question / possible gap:**
   a dual-role fixture (PLATFORM_ADMIN + ACTIVE OWNER/COACH
   membership) would evaluate the membership role, so expected
   behavior under PD29 ("platform admin denied") needs CONTRACT
   REVIEW before it can be pinned — NOT asserted either way here.
   No silent global guard change is made or proposed by this plan.
9. **No-session / stale-session legs** — standalone `request` fixture
   (no cookie jar) + valid captured action encoding → denial + zero
   writes; plus a STALE/forged session-cookie arm (cookie present but
   no longer valid against `sessionVersion`/status) → denial + zero
   writes. Paired with the positive control in the same build.
10. **Malformed-payload leg** — valid session + valid `Origin` +
    action POST with a malformed/truncated RSC-FormData body (valid
    `Next-Action` id, broken argument encoding) → safe failure + ZERO
    writes (full-row snapshots), no 5xx internals echo.
11. **Parity arms** — existing `nonmember` + `deactivated` fixtures
    carry the same denial assertions.

**Test-first RED honesty:** where existing guards may already hold
(e.g. hostile Origin at framework level), a first-pass result that
passes is recorded as immediate-PASS additional proof — named as such,
not presented as governing RED.

## Per-slice gate set (all captures on clean committed head)

- DOM full file + ES-1 helpers + full unit (`npm run test`).
- `format:check` / `typecheck` / `lint` / `build`.
- Full integration (`p8e_int` disposable, `CI=1`).
- Full `onboarding-forms.spec.ts` (+ `onboarding-forms-security.spec.ts`
  at ES-5) on `juno-p8-pg`/`p8e_e2e`, `CI=1`, production build+start,
  port 3000 verified free; every remaining RED named, never claimed.
- Capture format unchanged: outside-worktree absolute logs, exactSHA +
  empty porcelain paths before/after, UTC start/end, exact command,
  real exit, DB + BUILD_ID identity; all attempts preserved; mutants
  isolated disposable worktree + byte-exact restore.

## Resolved by review (no longer open)

- Preview URL: committed spec pins `preview` + `?src=version` — plan
  reconciled to it; no `?version=<seq>` contract.
- Default UX: single-press publish/archive, archive navigates to list
  — committed tests govern; a confirm step remains an OPTIONAL
  stakeholder preference, not a blocker.
- Session revocation mechanism: `User.sessionVersion` increment (JWT),
  verified in repo — not session-row deletion.
- Rebound-arg denial identity: `coach` (member of A only), not owner.
- Platform-admin fixture: NO-membership variant = membership-gate proof
  only (Orion-verified authorize path); the dual-role
  PLATFORM_ADMIN + active-membership case is TABLED as an unresolved
  PD29 precedence question — see matrix item 8b.

## Open human product choices

1. **Confirm step on publish/archive** — committed tests drive
   single-press; raising for stakeholder visibility only. Not blocking.
2. **Historical-version preview selection** — committed contract covers
   latest version via `?src=version`; whether coaches need an explicit
   older-version selector (`seq` param or version list) is a product
   call. Not blocking the planned slices.

No other unresolved product choices identified — lifecycle semantics
(frozen versions, reopen seeding, archive permanence) are locked in
the service layer.
