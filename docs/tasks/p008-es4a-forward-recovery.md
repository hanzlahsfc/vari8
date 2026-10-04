# P-009 ES-4a forward recovery — closed-branch controls + refresh (PLAN ONLY)

- **Status:** checkpoint only — tests-only provenance commit + prospective
  RED captures. NO implementation until root releases it.
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
