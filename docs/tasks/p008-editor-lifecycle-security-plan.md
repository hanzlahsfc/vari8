# P-008 remaining lifecycle + security — bounded plan (PLAN ONLY, no implementation)

- **Status:** plan only, submitted for parallel review (Apollo request
  `57523a99-a77e-467b-ba53-cc326b3076b5`). No source/test/dep changes
  authorized; no infra runs for this planning task.
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
  (rev 3) → draft preview zero-mutation → publish → v1 + `no-draft` →
  version preview (`preview-source` "version 1") → `open-draft` seeds
  from v1 (rev 4) → edit+save (rev 5) → publish v2 → `archive-form` →
  list shows ARCHIVED.
- `editor controls disable while a mutation is in flight`
  (line ~1740): `publish-form` + `archive-form` disabled while save
  pending; re-enable after settle.
- `responsive + keyboard` `full lifecycle` at 1440/834/390
  (line ~2016): same flow + focusability + no overflow on editor and
  both preview pages.

## Proposed slices (each: tests-first RED → minimal impl → clean-head gates)

### ES-4a — lifecycle controls wiring

**UI contract** (exact testids, all on `[formId]/page.tsx` surfaces):

- `publish-form` button — rendered only when an open draft exists;
  `disabled` while `state.dirty` (publish requires a saved-current
  clean draft) AND while any transition is pending; submits
  `formId` + `expectedRevision` (current `state.revision`) via
  `publishForm` action.
- `open-draft` button — rendered on the `no-draft` branch (published
  history, no open draft); submits `formId` via `openDraft`; replay of
  an already-open draft is service-side idempotent.
- `archive-form` button — submits `formId` via `archiveForm`; success
  leaves the form read-only (page revalidates to archived branch) —
  the e2e expects navigation to the list; implement via
  `router.push` to the canonical list path after `ok`.
- **Pending scope:** save + publish + archive share one pending
  boundary (`pending = savePending || lifecyclePending`), so every
  mutation control — name input, fieldset, save, publish, archive —
  disables during any in-flight action. Cheapest honest wiring:
  publish/archive controls live inside `DraftEditor` (outside the
  fieldset, own `disabled={pending || …}`); `open-draft` is a small
  standalone client component (`OpenDraftButton`) since it only
  renders when no editor is mounted.
- Alert/typing contract identical to save: typed rejection → boundary
  message; transport → generic; no echo.

**Test-first RED:** DOM pins in `onboarding-draft-editor.dom.test.tsx`
(publish disabled-while-dirty / sends current expectedRevision /
in-flight disables all lifecycle controls / archive typed-failure
alert) + the five already-committed e2e cases flip GREEN.

### ES-4b — zero-mutation previews

**Route contract:** server component, read-only, authz through the
existing guarded read path (`getFormForWorkspace` boundary — workspace

- role re-checked server-side; archived/published history readable,
  clients/non-members denied):

* `/workspace/[workspaceId]/onboarding/forms/[formId]/preview` —
  renders the CURRENT OPEN DRAFT. `data-testid=onboarding-form-preview`,
  `preview-source` contains `draft`, `preview-fields` renders every
  field kind (shortText input, longText textarea, number, date,
  singleChoice radio group, multiChoice checkbox group) with ALL
  controls `disabled`; NO `<form>` element anywhere on the page; zero
  non-GET requests; storage snapshot byte-identical; version count
  unchanged.
* `?version=<seq>` on the same route renders the FROZEN published
  version snapshot (latest or historical seq); `preview-source`
  contains `version <seq>`; same disabled/no-form/zero-mutation
  contract. Unknown/future seq → safe not-found, not a raw error.
* `preview-draft-link` on the editor page (open draft only);
  `preview-version-link` on the no-draft/published branch (latest
  version).

**Test-first RED:** DOM/component coverage optional (server component —
prefer a small pure `PreviewFields` renderer unit + the existing e2e
pins); e2e already asserts zero-mutation + content + disabled
breadth at all widths.

### ES-5 — real-HTTP security gates (new spec, owned infra)

New spec `tests/e2e/onboarding-forms-security.spec.ts`, owned
`juno-p8-pg`/`p8e_e2e`, `CI=1`, production `build && start` — real
`fetch`/request calls, not UI clicks, where noted:

1. **Hostile Origin** — `request.post` to the server-action endpoint
   with `Origin: https://evil.example` (and the captured `Next-Action`
   id) → rejected before the boundary; zero DB delta.
2. **Tampered bound argument** — real session cookie, action POST with
   `workspaceId` rebound to workspace B (`s1h-e2e-workspace-b` id) →
   guarded service denies (bound arg is untrusted, membership decides);
   zero delta in BOTH workspaces.
3. **Revoked session** — sign in, invalidate the session server-side
   (delete session row / bump `sessionVersion`), then action POST →
   safe denial; editor page → auth redirect.
4. **Mid-session membership revocation** — active session, then the
   `workspaceMember` row deleted/deactivated between mount and POST →
   denied (service reauthorizes every call); zero delta.
5. **PLATFORM_ADMIN browser denial** — NEW fixture (reserved
   `platform-admin@s1h-e2e.test`, `platformRole: PLATFORM_ADMIN`, NO
   workspace membership) added to `global-setup.ts` upsert list:
   browser visit to list/editor/preview routes → denied; action POST →
   denied. Closes the documented fixture gap.
6. **Baseline pins** — `nonmember` and `deactivated` fixtures already
   exist; carry the same denial assertions for parity.

**Test-first RED:** the spec lands RED against current controls
(hostile-origin/tampered/revoked cases must fail or, where the
existing guards already hold, record as immediate-PASS additional
proof — named honestly, not fabricated RED).

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

## Open human product choices (unresolved — need stakeholder/Hanzlah)

1. **Publish/archive confirmation UX** — the committed tests press
   `publish-form` / `archive-form` with NO confirmation step.
   Publish creates an immutable version and archive makes the form
   permanently read-only; is a confirm dialog/second step wanted, or
   is single-press intended?
2. **Archive destination** — e2e asserts navigation to the list;
   confirmed intent, but flagging in case archive should instead stay
   on the form page showing `archived-banner`.
3. **Preview URL shape** — plan assumes
   `…/[formId]/preview` + `?version=<seq>` (shareable). Alternative:
   `/versions/[seq]` subroute. Cosmetic, but a URL contract is worth
   one confirmation.

No other unresolved product choices identified — lifecycle semantics
(frozen versions, reopen seeding, archive permanence) are already
locked in the service layer.
