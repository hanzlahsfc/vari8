# P-008-R ES-2A — clean-recovery provenance (additive)

- **Status:** planning + prospective RED checkpoint only. No ES-2A metadata
  production exists on this branch; implementation requires accepted RED and a
  further Apollo checkpoint.
- **Requested by:** Apollo request `c4f01a4c-af0a-43dd-a627-dd54b279ac7f`
  (P-009 ES-2A NARROW RECOVERY, 2026-10-04), user direction "then do Something
  about it". Progression after reviewed RED acknowledged via Apollo request
  `898ca474-71ab-4b7b-8220-3571fd8ddc65` (implementation remains gated on
  root review of this checkpoint).
- **Branch:** `feature/p008-editor-save-recovery-es2a`
- **Worktree:** `../repo-p008-editor-es2a`
- **Root/base (exact):** `ea8400e9156fafe9877db02d97b96d834a39aa28` —
  ES-1 helpers (`state.ts` implemented through `ffc75ea`), inert ES-2
  scaffold (`b15a60f`), corrected DOM harness tests (`08ff818`), and the
  three-width local-edit browser tests (`ea8400e`). Verified present, and
  `feature/p008-editor-save-recovery` preserved at
  `db986a57ed1bebff4c59a1ebcdfea6a18af90a02` in `../repo-p008-editor-tdd`
  before this branch was created.

## Why a new ES-2A cycle exists

The prior ES-2A evidence chain on `feature/p008-editor-save-recovery` has a
disclosed limitation (see appended ERRATUM 2 in
`gate-logs/p008-editor-recovery/red-es-2a-e2e-local-edit.log`):

- The prospective browser RED at `ea8400e` recorded `CLEAN_AFTER: 1` — a
  dirty file appeared inside the capture window (most consistent with
  `draft-editor.tsx` mid-implementation, per post-hoc inference; the exact
  path/moment is not contemporaneously proven).
- That run's `.next` build output was later overwritten by the GREEN-run
  build, so byte-level proof of which source the production server served
  is not re-derivable; the behavioral signature (inert scaffold) is
  supporting evidence only.
- Consequently the ES-2A production commit
  `d7cf860c6725b330cdf6d8ce7a9b1170f1b33d73` does not sit behind an
  end-to-end provably clean RED capture.

This branch therefore runs ES-2A as a NEW recovery cycle: fresh prospective
RED on a provably clean committed head, then — only after root review — a
freshly derived minimal implementation. This document is additive; it
identifies the limitation without rewriting the old logs, commits, or
reports, which remain preserved unchanged under the old branch and
`gate-logs/p008-editor-recovery/`.

## Hard rules for this cycle

- **No transplant:** no cherry-pick, checkout, copy, or other transplant of
  `d7cf860` (or `e157306`/`d10d788`) production. ES-2A behavior is derived
  fresh from the committed test contracts after accepted RED. Naturally
  convergent minimal code is permissible per root adjudication; cosmetic
  divergence for its own sake is not.
- **Scope:** ES-2A only — existing metadata edits (name/field label/
  required/help/option label) driving local state + dirty arming +
  incoming-props reseed through `reseedDraftState`. Save stays inert;
  add/remove/reorder and option-structure stay no-op; no structure/Save/
  backend/deps/lifecycle/preview changes.
- **Clean-window discipline:** no source/doc/test edits from capture start
  through build/server/test shutdown and final status capture. If the tree
  changes during a run the capture is INVALID and is recaptured on a clean
  committed tree BEFORE any production. Per-run evidence: UTC start/end,
  exact command, immutable SHA + `git status --porcelain` PATH snapshot
  before/after, pipefail exit, DB identity, server identity. Production
  build identity (BUILD_ID + hash) recorded where practical; existing
  `.next` snapshots and historical logs are never deleted or overwritten.
- **Evidence dir (outside all worktrees):**
  `gate-logs/p008-editor-recovery/es2a-clean-recovery/` — new logs only;
  historical logs under `gate-logs/p008-editor-recovery/` untouched.
- **Environment:** owned disposable `juno-p8-pg` (`postgres:16-alpine`,
  `127.0.0.1:5445`); fresh owned DB `p8e_e2e` created 2026-10-04 after a
  negative existence check (plan-proposed name, previously absent).
  `CI=1`, explicit `DATABASE_URL`, production `build && start` on
  `127.0.0.1:3000` (port verified free first). Single PG/server lane.
- **This cycle's RED is prospective evidence for the new head only** — it
  repairs nothing historically and is never cited as proof of the old
  run's sequencing.

## Planned increments (unchanged contract)

- **ES-2A (this cycle):** RED checkpoint → root review → minimal impl →
  scoped GREEN (DOM subset + 3-width local-edit browser) + ES-1 regression.
  DONE: impl `36a2f8f`, gates @`63dfa4e`, record `023de20`.
- **ES-2B:** structure ops only, its own committed-tests-first cycle.
- **ES-3:** save wiring, its own committed-tests-first cycle.
- No push/PR/merge/deploy at any point; user merge approval is a separate
  later gate.

## ES-2B acceptance (prep release `7344de53`, 2026-10-04)

**Scope:** field add/remove/move-up + option add/remove on EXISTING
rendered rows — client-local edits that arm save. Save stays INERT;
server-id/payload assertions stay deferred to ES-3. No backend, helper,
page-wiring, or dependency changes; no invented IDs.

**Test contract (committed before any production):**

- DOM harness `field structure ops` describe: add/remove/move-up field,
  option remove+add AND standalone option add, all six `add-field-*`
  kinds, exactly-one-blank-option for BOTH choice kinds, no options
  region for non-choice kinds, contiguous rendered row sequence,
  dirty arming after each op.
- Browser: NEW `local structure edits arm save — zero
network/storage/DB delta` case at 1440/834/390 — real add-field /
  add-option / move-up / remove-field clicks, then zero non-GET
  requests, unchanged `storageSnapshot`, byte-identical
  `workspaceSnapshot`, armed save.
- Dedicated both-choice blank-option browser cases (existing,
  `seeds exactly one blank option input`) remain governing.
- Strengthening landed prep-side: three-width local-edit case now uses
  the `storageSnapshot` sorted key→value helper (was `Object.keys`) —
  immediate-PASS additional proof, not a fabricated RED; two vitest
  deferred/probe comments reworded to observed-symptom +
  defensive-guard (comment-only).

**Governing RED (clean committed head):** DOM `field structure ops`
subset + dedicated blank-option browser + new local-structure browser
case, all meaningful absent-behavior failures.

**Impl acceptance (later release):** scoped structure GREEN (DOM subset

- new local-structure browser + blank-option browser), ES-2A metadata
  DOM subset + local-edit browser regression GREEN, ES-1 17/17, format/
  lint/typecheck 0; remaining RED enumerated (ES-3 save 5 + deferred
  payload 3). Structure GREEN does NOT imply save/whole-file green.
