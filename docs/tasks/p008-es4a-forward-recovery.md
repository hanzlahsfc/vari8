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
  exit 0 (BUILD_ID `Ti94CNVEv2_ozDDdxE1pJ`). STOPPED before any
  security production fix.
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
