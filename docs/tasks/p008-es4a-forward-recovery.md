# P-009 ES-4a forward recovery — closed-branch controls + refresh

- **Status:** ES-4a ACCEPTED incrementally on this line (`07c0d22` +
  `a83af56`). ES-4b preview implemented `b4b19a0` under the repaired
  `749ef1e` RED — full onboarding-forms spec 68/68 GREEN.
  ES-5 tests-only prep committed `3bab484` —
  `tests/e2e/onboarding-forms-security.spec.ts` (7 tests): genuine
  same-build captured action protocol, replayed under hostile/missing
  Origin, XFH spoof (app-level diagnostic only), no/forged/revoked
  session, mid-session membership removal (restored in finally),
  wsA→wsB + formId tampering by the A-only coach, no-membership
  PLATFORM_ADMIN (membership-gate proof only — PD29 dual-role tabled,
  not asserted), truncated body. Captures: security spec
  `green-fwd-es5-security-http-v2.log` 7/7 exit 0; full e2e
  `green-fwd-es5-e2e-full.log` 147p/12s exit 0 (the BUILD_ID
  `n8VinkBVcWqj2Kq8LsdXL` first recorded for v2 is MISATTRIBUTED — see
  annotation-es5-build-identity.txt). Tests-only correction `659d424`
  (Apollo `52ead226`): hostile-Origin full-snapshot equality + framework
  500 class, typed-denial legs pinned 200, missing-Origin/XFH observed
  execution asserted as diagnostics (no edge-safety claim). Captured
  `green-fwd-es5-security-http-v3.log` 7/7 exit 0 +
  `green-fwd-es5-e2e-full-v2.log` 147p/12s exit 0, BUILD_ID
  `-rr_xTP_0bl7xnD9kJuvV` (full-v2 run; v3 BUILD_ID overwritten, not
  recorded). Helios B1/B2 repair `b6d2ce6` (Apollo `ccb3a41b`):
  `659d424`'s "full-snapshot delta" and "`{ok:false}` channel" claims
  were overclaims (count/status only) — now real single-save full-row
  delta + decoded RSC typed results. Captured
  `green-fwd-es5-security-http-v4.log` 7/7 exit 0 (BUILD_ID
  `e0yAwuslFUbH31P7w-Ptc`) + `green-fwd-es5-e2e-full-v3.log` 147p/12s
  exit 0 (BUILD_ID `Ti94CNVEv2_ozDDdxE1pJ`). ERRATUM (Apollo
  `cbb3e4c4`): "decoded RSC typed results" above is imprecise — the
  checks are literal raw flight-text substring markers backed by DB
  delta/zero-write checks, not a formal decode; they cover only the
  named helper-passed requests, and the `noSessionNoOrigin` /
  `revokedNoOrigin` companions are observation-only (status logged).
  STOPPED before any security production fix.
- **Authorized by:** Apollo request `cd81077c-ef1c-4bb6-b3b8-7b98b502ebf0`
  (root adjudication of the B-gap on the `feature/p008-editor-save-recovery-es2a`
  branch).
- **Why this cycle exists:** the ES-4a release required a separate fresh
  RED before EACH behavior increment; no committed RED exists between
  impl A (`897f7c1`, DraftEditor publish/archive) and impl B (`7f9f47d`,
  closed-branch controls + page wiring). B could not be retro-approved,
  so this NEW forward cycle re-derives the closed-branch surface from a
  provably-RED committed head. This is NEW evidence, not historical B
  RED, not a waiver.
- **Base (exact):** `897f7c1a26d09c9f7955777eab883d04933a4ef1` — accepted
  backend/helpers/save + DraftEditor publish/archive + inert
  `open-draft-button.tsx` scaffold + page wiring absent.
- **Tests carried (provenance):** the DOM test delta from `43d49fb`
  (hoisted router push/refresh spies; refresh-request-exactly-once pins
  on publish-ok/reopen-ok; never-on-typed/transport pins; corrected
  pending-publish post-success contract) applied verbatim to the
  identical test file on this base. The e2e spec's corrected ES-4a
  contracts are already present via ancestor `e5636c3` — no e2e edits.
- **Scope awaiting release (one bounded increment or fresh-RED-per-commit
  at root's choice):** closed-branch `open-draft` + `archive-form`
  controls with shared pending under `OpenDraftButton` (or a tiny shared
  closed-controls component justified by the tested contract), mounted
  only on the non-archived no-draft branch; `router.refresh()` after ok
  on publish AND reopen (outside the action catch — refresh/navigation
  failure never misreports a committed mutation); archive `router.push`
  to the canonical list on ok only.
- **Explicitly out:** backend/actions/helpers/service/save/editor-A
  changes, archived-state mutation controls, preview surfaces (ES-4b),
  ES-5 security gates, deps, push/PR/merge/deploy.
- **Evidence protocol (unchanged):** captures on clean committed head —
  exact SHA, empty `git status --porcelain` PATHS before/after, UTC
  start/end, exact command, real exit, DB + build identity; logs outside
  all worktrees under
  `gate-logs/p008-editor-recovery/es2a-clean-recovery/`; all attempts
  preserved including invalid ones; no edits during a capture.

## Atlas final2 evidence audit — 2026-10-05 (scoped local acceptance)

Atlas read-only audited the final2 integration/E2E captures and their
failed-run/targeted-retry chronology on exact clean `6391f61`: VALID,
zero discrepancies. It verified the single authorized full integration
289/289 exit 0 preceded the conditional full E2E 149 passed/12 skipped
exit 0, with in-window BUILD_ID `wyVUUGzregIu8WxhrmFuf`, clean
porcelain, exact SHA and redacted DB identities. Earlier FAILED
integration and 62/62 targeted retry are distinct preserved windows,
not retroactively waived. Mechanism/unit captures at `28d1796` apply
to the byte-identical production/test tree; later changes are docs
only. Combined with Helios's bounded code PASS and Orion's read-only
unified whole-diff security PASS, the P-008 form-definition builder
reaches a scoped LOCAL code/evidence acceptance checkpoint. Reviewers
did not independently run tests. Owned-edge verification and explicit
user authority remain required before any push/PR/merge/deploy;
no release action occurred.

## Final2 integrated local gates — 2026-10-05 (edge/release still open)

After explicit user approval for both the full disposable integration
`p8e_int` and conditional full E2E `p8e_e2e` runs, Juno captured both
on clean committed `6391f6131c502f041f5f3ff17675eb5a2d432fea`:
`final2-p008-integration-full.log` 24/24 files and 289/289 tests,
exit 0; `final2-p008-e2e-full.log` 149 passed/12 skipped, exit 0,
BUILD_ID `wyVUUGzregIu8WxhrmFuf` inside its capture window. Logs
under outside-Git `gate-logs/p008-final-gate-28d1796/` bind SHA,
empty before/after porcelain, UTC, DB identity and real exit. The
older failed full run and targeted retry below remain preserved as
separate evidence. Mechanism gates and 588/588 unit were green at
`28d1796`; successors through `6391f61` are docs-only.

Orion's read-only different-model whole-diff synthesis on
`5036796..6391f61` returned PASS for local code/security readiness,
not edge/merge/deploy approval or independent test execution. The
non-blocking shared-audit-status vocabulary widening remains a
follow-up; Atlas final2 evidence audit is pending. Host/DB I/O
starvation is supported by the earlier long checkpoint plus this
prompt unchanged-code rerun, but the exact first wait is unproven.
Owned-edge header verification, the missing-Origin policy question,
non-save foreign-ID HTTP coverage choice, and user authorization for
push/PR/merge/deploy remain open. No release action occurred.

## Targeted integration retry — 2026-10-05 (not full-gate closure)

With explicit user approval for the three failed files' fixture
truncation on disposable `p8e_int`, Juno rechecked database health and
ran only those files on clean committed `10acc9b`: P-008 forms 46/46,
S1-C assignments 9/9, nutrition import 7/7, each exit 0. Raw logs
`retry-p008-int-{forms,s1c,nutrition}.log` under outside-Git
`gate-logs/p008-final-gate-28d1796/` bind SHA and empty before/after
porcelain. The full integration attempt below still exited 1; no full
suite or browser rerun has occurred on this docs-only successor.
A 2987s PostgreSQL checkpoint supports transient I/O starvation as a
hypothesis, but no in-stall lock/activity snapshot proves the first
wait; a schema-less `public.users` lookup remains unexplained. Atlas
whole-diff inventory and bounded Helios/Orion read-only reviews are
complete (both reviewer scopes PASS, not whole-feature approval). Orion
noted a non-blocking global audit-status vocabulary widening. Helios
corrected an unsupported timeout attribution and preserved his
untracked review artifact outside Git; the worktree is clean.

## Final local gate attempt — 2026-10-05, integration blocker

Juno captured the exact `28d179690a51d0a5c1ebc954d8617ab779755885`
committed tree with clean before/after porcelain. The outside-Git directory
`gate-logs/p008-final-gate-28d1796/` contains successful format, lint,
typecheck, build and full unit (588/588) captures. The full integration
capture exited 1: 278 passed, 2 timed out, 9 skipped (S1-C setup hook
timed out). This is a failed gate, not an acceptable final baseline.
The suspected lock-contention cascade is not established as root cause.
Juno stopped before browser gates; no exact-tree full E2E claim exists.
Read-only diagnosis and independent whole-diff reviews are queued, not
completed at this record. No destructive DB action, retry, production
edit, remote operation, or deployment is authorized here.

## PD29 reconciliation addendum — 2026-10-05

The integration accounting below was written on `793b0e0` before the
PD29 dual-role repair and remains historical for that pin. The tabled
PLATFORM_ADMIN-with-membership item in its security caveats and remaining
gates was resolved locally by tests `904cb12`, production guard fix
`814620a`, and the docs record `afa7cd2`: Helios code/contract PASS,
Orion different-model security PASS, Atlas evidence VALID on those
exact pins. No reviewer ran tests or changed files. The scoped PD29
increment is accepted locally, not as final P-008 sign-off. Fresh final
integrated gates, whole-diff independent review, owned-edge verification,
and explicit user authority for any push/PR/merge/deploy remain open.
See `docs/STATUS.md` and the PD29 section of
`docs/tasks/p008-editor-lifecycle-security-plan.md` for the bounded
review and gate details.

## Integration accounting (PLAN-ONLY, Apollo `59423372`)

Local completeness record for the P-008 onboarding form-definition
builder (P-009 editor slices ES-1..ES-5). This is NOT final sign-off:
no push/PR/merge/deploy authority and no edge/deployment approval.
Scope is the coach-owned form-DEFINITION builder only — NO intake,
NO submissions, NO client-facing form filling.

### Branch and tree

- Branch `feature/p008-es4a-closed-forward`; base `main` `5036796`.
- Final local tree: `793b0e0f0f446f182575bfc7398c7eca3dfb94e7`
  (followed by this docs-only accounting commit).
- Production is byte-unchanged since `b4b19a0`: `git diff b4b19a0
793b0e0` outside `tests/` and `docs/` is empty.
- `b6d2ce6..793b0e0` touches comments/docs only (every changed spec
  line is a comment).
- Pre-ES P-008 foundation also on this branch since `5036796`
  (schema + migration, service, boundary, actions, list/create pages,
  5C-2a mount, Orion-435 tx reauthorization `be20047`, etc.) was
  accepted under earlier P-008 records and is not re-enumerated here.

### Immutable pins per slice (first-parent, this branch)

| Slice | Tests / scaffold                                                                                             | Production                                            | Docs / records                                        |
| ----- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------- |
| ES-1  | `dd42327`, `54e211c` (scaffold), `ffc75ea`                                                                   | `6e25230` (1a), `3d2e18c` (1b), `f13a970` (1c)        | `5734af4`, `8b3a095`, `23a7c21`                       |
| ES-2  | `2c46546` (dev deps), `4087c23`, `a86a453`, `b15a60f` (scaffold), `6ba4c22`, `d37673c`, `6dbeaeb`, `08ff818` | — (harness/scaffold)                                  | `404b571`, `cd805c6`                                  |
| ES-2A | `ea8400e`                                                                                                    | `36a2f8f`                                             | `65fdab4`, `18c4916`, `63dfa4e`, `023de20`, `cfab0cf` |
| ES-2B | `13483f5`                                                                                                    | `741336d`                                             | `372499f`, `88792af`, `a6a0fb6`                       |
| ES-3  | `d537ec4`                                                                                                    | `0c6242b`                                             | `1cd243d`, `5f77978`, `d4cdd62`, `a6cecf6`            |
| ES-4a | `71ca892`, `47558a5`, `39a6427`, `e5636c3`, `394704e` (fwd provenance)                                       | `897f7c1` (A), `07c0d22` (fwd combined closed-branch) | `1ead789`, `65947c3`, `ac146bc`, `06f2f59`, `a83af56` |
| ES-4b | `3d9522f`, `749ef1e`                                                                                         | `b4b19a0`                                             | `1b55dd0`                                             |
| ES-5  | `3bab484`, `659d424`, `b6d2ce6` (accepted test pin), `793b0e0` (comments)                                    | — (tests-only)                                        | `a1ec048`, `758685b`, `ca8235e`, `a82d5b9`, `793b0e0` |

Not on this line (superseded, not merged): old ES-4a branch
`feature/p008-editor-save-recovery-es2a` (`7f9f47d`, `43d49fb`,
`3452055`, … `0ba8873`). Only the `43d49fb` DOM test delta was
carried forward, with provenance, in `394704e`.

### Gates — what still applies vs what needs a fresh rerun

Still applicable to the production code (production unchanged since
`b4b19a0`; tests changed since then only in the new e2e security
spec, which unit/DOM/helpers/integration do not load):

- On `b4b19a0`: format, lint, typecheck and build all exit 0; DOM
  40/40; helpers 17/17; unit 580/580; integration 288/288
  (`p8e_int`, CI=1); focused preview 9/9; focused lifecycle 35/35;
  full `onboarding-forms.spec.ts` 68/68. BUILD_ID
  `EZ17DdUJSOuL5ZRNcGcDF`.
- On `b6d2ce6` (ES-5): focused security spec 7/7 exit 0
  (`green-fwd-es5-security-http-v4.log`); full e2e 147 passed /
  12 skipped exit 0 (`green-fwd-es5-e2e-full-v3.log`). The 12 skips
  are pre-existing gated password-reset tests.
- On `793b0e0`: no capture. It is comments/docs only relative to
  `b6d2ce6`, so the behavior is identical, but no gate is bound to
  this exact tree.

A fresh rerun is required before any final sign-off: the full gate
set (format, lint, typecheck, build, unit, DOM, helpers, integration,
full e2e) in one clean sequence on the exact tree proposed for merge.
Reasons:

- No capture exists on `793b0e0`.
- ES-5 BUILD_IDs are attested, not byte-bound in the logs (see
  below).
- Any rebase onto current `main` produces a new tree.

### Evidence disclosures (all preserved outside Git; logs untouched)

- Unpreserved scratch runs: a pre-commit 7/7 run on the dirty tree
  that checked raw-marker reliability (`b6d2ce6` cycle); earlier
  ES-4a dirty-tree DOM runs on the old branch. None is claimed as
  evidence.
- v2 BUILD_ID misattribution: `n8VinkBVcWqj2Kq8LsdXL`, recorded for
  `green-fwd-es5-security-http-v2.log`, was read before that run and
  belongs to the superseded run. See
  `annotation-es5-build-identity.txt`.
- BUILD_IDs attested, not byte-bound: under CI=1 every Playwright run
  rebuilds, and `run-capture.sh` does not embed the BUILD_ID.
  - v4 `e0yAwuslFUbH31P7w-Ptc` and full-v3 `Ti94CNVEv2_ozDDdxE1pJ`
    were each read immediately after their own run, but they are
    recorded only in docs and reports, not inside the log bytes.
  - The v3 focused BUILD_ID was overwritten and never recorded.
- Superseded credential log:
  `superseded-es5-security-http-unredacted-cmd.log` (outside Git)
  contains the disposable E2E database credential in its COMMAND
  line.
  - It is labeled SUPERSEDED, and every governing log has 0
    credential bytes.
  - The file should be deleted or rotated per the owner's decision;
    it was not deleted here.
- ES-4a historical B RED is absent on the old branch. The forward
  cycle supplies new evidence; it is not a waiver.
- `659d424`/`b6d2ce6` wording overclaims are corrected by later
  append-only entries.

### Security scope caveats

- Helios caveat, foreign-formId per action: the HTTP tamper arms
  (wsA→wsB rebinding and foreign formId) replay the captured
  `saveDraft` only. `publish`, `openDraft`, `archiveForm` and
  `createForm` are not replayed over real HTTP with foreign IDs.
  Their protection rests on the shared guarded service path plus
  integration tests, not on ES-5 HTTP evidence.
- Typed-result checks are literal raw RSC flight-text markers backed
  by DB checks, not a formal decode. The `noSessionNoOrigin` and
  `revokedNoOrigin` companion requests are observation-only.
- PD29 dual-role (PLATFORM_ADMIN with an ACTIVE membership) is TABLED
  and unasserted. The no-membership PLATFORM_ADMIN leg proves the
  membership gate only.
- Missing-Origin and hostile-Origin plus spoofed `X-Forwarded-Host`
  both EXECUTE the action at app level. This is recorded app behavior
  and NOT edge safety.
- Owned-edge verification is required before any deployment claim:
  the edge must strip or overwrite `X-Forwarded-Host`/`Forwarded`
  and handle Origin policy, with `trustHost: true` bounded by it. No
  guard, `allowedOrigins` or infra change was made.

### Remaining decisions / gates (none started)

1. Owned-edge header verification (Origin, XFH, Forwarded, Host).
   Deployment prerequisite.
2. Product/security decision on missing-Origin execution: whether to
   require Origin at app level. That would be a production change and
   needs a new bounded release with test-first evidence.
3. PD29 dual-role precedence contract review.
4. Whether HTTP foreign-ID tamper coverage is required for `publish`,
   `openDraft`, `archiveForm` and `createForm`.
5. Fresh full gate set on the exact final/merge tree.
6. Independent final review of the whole `main..final` diff,
   including:
   - the migration and schema changes;
   - `lib/audit.ts` and `lib/auth/rbac.ts` changes;
   - the dev dependency additions in `package.json` and
     `package-lock.json` (jsdom/testing-library harness).
7. Disposition of the superseded credential-bearing log, and of the
   old ES-4a branch.
8. Deferred product question: historical-version preview selector.
9. Intake and submissions: out of scope, a separate future effort.
10. PR/merge/deploy authorization from Hanzlah. None exists now.
