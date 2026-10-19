# PR-03b re-verification 2 (PR #63, after fix pass 1)

Verifier: Shinobu gear, independent of the builder (Devin swe-2-max).
Tree: `/home/nexuslink/vari8-worktrees/pr-03-react-hooks`, branch `beta/pr-03-react-hooks`, HEAD `3cbee34`, clean (only untracked `icm/05-build/cards/` (pre-existing) and `icm/05-build/evidence/PR-03b-verify-2/`).
Comparison trees: base `55a0f08` and old FIX `26b8690` (detached worktrees, removed afterwards).
PR base now: `ea8f514` (= `origin/Vari8-Beta` tip, merge-base of this branch).
Evidence: `icm/05-build/evidence/PR-03b-verify-2/` (gate logs, `run-gates.sh`, probe sources in `probes/`, all probe logs).

## Verdict: FIX

Hunk 1 (dashboard-editor) and hunk 2 (checkin-calendar) pass with discriminating probes. Hunk 3 (feedback-thread) fails item (b): the success path is fixed, but the mount reconciliation still sets state synchronously inside an async IIFE in the effect, which is the same lint dodge the first verifier flagged. No runtime probe can separate that from base, so the verdict rests on code.

## Per-item verdicts

| Item                                                       | Verdict                                                                                         | Basis                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| (a) hunk 1 dashboard-editor                                | PASS, with one declared divergence from base                                                    | WINDOW probe discriminates (fails 26b8690, passes base and HEAD). Divergence: GAP window (see below). |
| (a) hunk 2 checkin-calendar                                | PASS                                                                                            | LOAD-REBIND discriminates (fails 26b8690, passes base and HEAD).                                      |
| (a) hunk 3 feedback-thread                                 | No discriminating probe exists; success path PASS on end state; mount path not a runtime defect | See §3.                                                                                               |
| (b) no effect setState, no IIFE, no eslint-disable in diff | **FAIL**                                                                                        | Mount reconciliation IIFE, §4.                                                                        |
| (c) four rules at error, zero react-hooks findings         | PASS                                                                                            | §5.                                                                                                   |
| (d) gates fresh; round-1 e2e                               | PASS for gates; round-1 e2e: none exist                                                         | §6.                                                                                                   |
| (e) frontend/ and docs/STATUS.md unchanged                 | PASS                                                                                            | §7.                                                                                                   |

## 1. Probes

Probe sources: `icm/05-build/evidence/PR-03b-verify-2/probes/`. Run with `npx vitest run tests/unit/<probe>` (jsdom, real components, real `reloadDashboardSlot` / `acquireDashboardSlot`, mocked server actions, no DB).

Results (pass/fail per tree; 26b8690 is the old FIX):

| Probe                                                                                                 | 55a0f08 base                              | 26b8690 old FIX                                      | 3cbee34 HEAD | Discriminates 26b8690 from base?                              |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------- | ------------ | ------------------------------------------------------------- |
| H1 CONTROL: flushed reload, then drag commit                                                          | pass                                      | pass                                                 | pass         | n/a (sanity: drag commit runs, x=8)                           |
| **H1 WINDOW: reload commit, then pointerup before passive effects flush; reloaded name must survive** | **pass** (name RELOADED, drag commit x=8) | **FAIL** (name reverted to "Alpha", drag commit x=8) | **pass**     | **yes**. Repeated 3 times: base pass, 26b8690 fail each time. |
| H1 PARITY: rendered reload, then add widget x2                                                        | pass                                      | pass                                                 | pass         | no (parity)                                                   |
| H1 GAP: slot write not yet rendered, then add widget                                                  | FAIL                                      | FAIL                                                 | pass         | HEAD differs from base here, see below                        |
| H2 LOAD-REBIND: same range, new `load` identity                                                       | pass                                      | **FAIL** (stale result, no Loading)                  | pass         | **yes**                                                       |
| H2 PARITY: month navigation shows Loading                                                             | pass                                      | pass                                                 | pass         | no (parity)                                                   |
| H3 end-state PARITY: ok send (row, cleared composer, rotated nonce, marker cleared)                   | pass                                      | pass                                                 | pass         | no                                                            |
| H3 end-state PARITY: error send (body kept, no row, marker kept)                                      | pass                                      | pass                                                 | pass         | no                                                            |
| H3 MOUNT PARITY: checking / sent / not_sent                                                           | pass x3                                   | pass x3                                              | pass x3      | no                                                            |

The first mount probe (`reverify2-mount`) passed on all three trees. It is parity only and was not used as evidence for (a).

### Runtime commands and exit codes

- `npx vitest run tests/unit/zz-p2` on base, old FIX and HEAD: exit 0 / 1 / 0 (base / 26b8690 / HEAD). Repeated twice more: same.
- Main probe (`reverify2-probe`): base exit 1 (only GAP fails), 26b8690 exit 1 (GAP and LOAD-REBIND fail), HEAD exit 0 (6/6). Logs: `v2-*-p1.log`.
- Hunk 3 characterisation (`reverify2-feedback-char`): exit 0 on all three. Output: `probe3-out.txt`.

### Hunk 1, detail

- The probe arms a pointerdown on the widget's `<header>` (the only move handle), then a `MutationObserver` on the editor section fires on the reload commit's DOM mutations. Inside that microtask it dispatches the window pointerup. Passive effects for a default-lane update flush in a later scheduler task, so this callback runs in the gap where the old ref (synced in a passive effect) is stale and base's render-time ref is fresh.
- Result: base and HEAD commit the drag on top of RELOADED. 26b8690 commits on top of the pre-reload config and reverts the reload. This is the defect the first verifier flagged.
- Assertion guard: the probe also asserts the drag commit ran (x=8). An earlier draft passed trivially because the reload itself wrote the name; that draft was corrected before the results above.
- Divergence from base (GAP probe): HEAD reads `slot.latestConfig` at call time. Base reads a render-time snapshot, so a slot write made between the emit and the next render is dropped by a commit in that window (base fails GAP). In every rendered state HEAD and base are identical (PARITY passes on both). The GAP difference is the intended correction the first verdict asked for, and it closes a base defect; it is not byte-identical to base in that window.
- Code: `mutate` and `setRect` read `slot.latestConfig` (dashboard-editor.tsx); the ref and its effect are gone; `commitDashboardConfig` writes the slot synchronously (autosave-coordinator.ts:273). No `latestConfig` ref or effect remains.

### Hunk 2, detail

- Base: `setResult(null)` in the effect on every `[cells, load]` change. HEAD: `loaded = {range, load, value}` and `result` is served only when `loaded.range === range && loaded.load === load`. `range` is memoised on `cells`, so the trigger set is identical to base.
- Remaining trigger check: LOAD-REBIND (same range, new `load`) shows Loading on base and HEAD and shows the stale result on 26b8690. Range navigation shows Loading on all three.

### Hunk 3: why no discriminating probe exists

- Characterisation (`probe3-out.txt`):

| Tree            | `clearMarker` (success) called from a passive-effect flush | Items and textarea at first commit showing "Response sent." | Mount `resolve` called from a passive-effect flush |
| --------------- | ---------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| 55a0f08 base    | true                                                       | 0 rows, "Hello"                                             | true                                               |
| 26b8690 old FIX | true                                                       | 0 rows, "Hello"                                             | true                                               |
| 3cbee34 HEAD    | **false**                                                  | 1 row, ""                                                   | true                                               |

- Base and 26b8690 are behaviourally identical on the success path (same effect origin, same commit timing). Therefore no probe can fail 26b8690 and pass base. The IIFE-wrapper defect is a code-shape defect that the runtime cannot see.
- HEAD's success consequences now run inside the action. The row and cleared composer appear one commit earlier than base, in the same commit as the confirm line. End state is identical (PARITY passes on all three). This is a commit-granularity change, not a user-visible one.
- Mount path: `setNonce(marker.nonce)` and `setReconcile("checking")` still run synchronously at the top of an effect-launched async IIFE, and the `resolve` call sits in the same synchronous prefix. Stack evidence confirms the same effect origin on base and HEAD. This is a runtime no-op relative to base, so the only evidence against it is code (§4).

## 2. Hunk-by-hunk code read (vs base 55a0f08)

- **Hunk 1:** dashboard-editor.tsx has no `latestConfig` ref and no effect; `mutate` and `setRect` read `slot.latestConfig`. Covered by probes above.
- **Hunk 2:** checkin-calendar.tsx keyed result as in §1. The `setLoaded` call is inside `.then`, which is async and allowed (the same pattern as base).
- **Hunk 3, success path:** feedback-thread.tsx `useActionState` wrapper runs `clearMarker`, `setReconcile("idle")`, `setNonce`, `setItems`, `setBody("")` after `await sendCheckInFeedbackAction`. `lastHandledRef` and the success effect are removed. Consistent with base end state.
- **Hunk 3, mount path:** see §4.

## 3. Hunk 3 verdict

- Success path: PASS. The consequences no longer run from an effect, and the end state matches base in both ok and error sends.
- Probe limit: no runtime probe fails 26b8690 and passes base, because they are behaviourally the same. The defect the first verifier raised (a dodge of `set-state-in-effect`) is a code-shape defect. Base itself has the same effect-based success path and lint flags it (see §4 for the matching base finding).
- Overall for hunk 3: FIX, because of the mount path in §4.

## 4. Item (b): FAIL

Diff checks run on `git diff 55a0f08 HEAD -- app components lib`:

- `grep '^+.*eslint-disable'`: no added lines. One context line (`// eslint-disable-next-line react-hooks/exhaustive-deps` on the mount effect, unchanged from base) remains in feedback-thread.tsx. It is pre-existing, not in the diff, and not one of the four rules.
- `grep '^+.*async'`: one added IIFE, `void (async () => {` at the mount reconciliation effect (feedback-thread.tsx, diff line 284). It wraps `setNonce(marker.nonce)` and `setReconcile("checking")`, which run synchronously before the first `await`.
- Base finding that matches: `components/checkin/feedback-thread.tsx:148:5` (`set-state-in-effect`) in `icm/05-build/evidence/PR-03b-verify/base-55a0f08-eslint-hooks-findings.log`. The same synchronous setState at base line 148 is flagged by `set-state-in-effect`. Moving it into an IIFE makes the rule stop reporting it without changing when the setState runs. That is the dodge the first verdict asked to remove.
- Success-path IIFE and `eslint-disable` (hunk 14 of the first verification): removed. Confirmed.
- Prev-compare reseeds (draft editors, client-habits-widget, program-bookings) call setState during render under the prev-compare guard, not in effects. Lint covers them.

Required repair (for the builder, not done here): remove the IIFE. The mount reconciliation needs a form that does not call setState synchronously from the effect and does not wrap it in an async IIFE. Options: derive the initial `checking` state from the stored marker through a hydration-safe source (for example `useSyncExternalStore` with a server snapshot), and keep setState only inside the `.then` of the resolve call. The builder must choose; the constraint is that the first paint of "Checking…" keeps base timing.

## 5. Item (c): PASS

- `eslint.config.mjs` lines 13–16: `react-hooks/set-state-in-effect`, `react-hooks/refs`, `react-hooks/purity`, `react-hooks/immutability` all `"error"`.
- `npm run lint` (exit 0): `✖ 3 problems (0 errors, 3 warnings)`. All three are `@typescript-eslint/no-unused-vars` in files with no diff against base: `lib/dashboard/config-schema.ts:445`, `tests/integration/p025b-checkin-instances.test.ts:1127`, `icm/03-plan/tools/plan-to-issues.mjs:7`.
- react-hooks findings: `npx eslint . | grep -cE '(warning|error)  .*react-hooks/'` gives 0. My first grep (`grep -c 'react-hooks/'`) matched 3 path lines because the worktree path contains `pr-03-react-hooks/`. That grep was wrong; the corrected pattern gives 0.

## 6. Item (d): gates (HEAD 3cbee34, fresh)

Driver: `icm/05-build/evidence/PR-03b-verify-2/run-gates.sh`; `summary.txt`.

| Command                                                       | Exit        | Result                                                                                                                                 |
| ------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                           | 0           | `tsc --noEmit` clean                                                                                                                   |
| `npm run lint`                                                | 0           | 0 errors, 3 pre-existing warnings (see §5)                                                                                             |
| `npx eslint . \| grep -cE '(warning\|error)  .*react-hooks/'` | 0 (count 0) | zero react-hooks findings                                                                                                              |
| `npm run test`                                                | 0           | 96 files passed, 1137 tests passed, 0 skipped (count changed from the 105/1308 in PR-03b because PR-03a's test-audit deletions landed) |
| `npm run build`                                               | 0           | `next build --turbopack`, compiled                                                                                                     |
| `cd frontend && npm run build`                                | 0           | static export                                                                                                                          |

Round-1 e2e specs: none exist at HEAD. `tests/e2e/` holds only `fixture-sweep.ts`, `global-setup.ts`, `global-teardown.ts`, `invite-acceptance.spec.ts`, `password-reset.spec.ts`. All seven round-1 specs (client-dashboard, checkin-feedback, checkin-calendar, checkin-instances, checkin-forms, onboarding-forms, habits) were deleted by PR-03a (`ef012f1`, owner-approved). The `118e26f` harness fix targeted `checkin-instances.spec.ts:644`, which no longer exists. That fix is moot at HEAD and is not runtime evidence for anything. No e2e run was performed; the runtime evidence is the probes above, which is what (a) required.

## 7. Item (e): frontend/ and docs/STATUS.md

- `git diff --name-only ea8f514 HEAD -- frontend docs/STATUS.md`: 0 files (exit 0). This is the PR base.
- `git diff --name-only 55a0f08 HEAD -- frontend docs/STATUS.md`: 15 frontend files (all `.test.mjs` / `.checks.mjs`, deleted by PR-03a's merged commits). They come from the `origin/Vari8-Beta` merge, not from this branch's own commits.
- `docs/STATUS.md`: unchanged vs both `55a0f08` and `ea8f514`. `5febcc5` wrote it and `3cbee34` reverted it.

## 8. Required before SHIP

1. Remove the mount-reconciliation IIFE in feedback-thread.tsx (§4). Re-run lint and the mount probe (parity: checking / sent / not_sent).
2. Re-run the gates after the change.
3. Keep the two discriminating probes (H1 WINDOW, H2 LOAD-REBIND) as the runtime record for hunks 1 and 2. Hunk 3 has no discriminating runtime probe, and the verdict says so.
4. Decide whether the GAP divergence on hunk 1 is acceptable (§1). It is intentional, base is wrong there, and every rendered state matches base.

## 9. Environment and cleanup

- No DB was created by me, so none was dropped. No dev or production server was started by me. The listener on `127.0.0.1:5433` belongs to the pre-existing `vari8-db-1` container and was not touched.
- Detached worktrees `_reverify2-base` (55a0f08) and `_reverify2-fix` (26b8690) were removed with `git worktree remove --force` after unlinking their `node_modules` symlinks. `git worktree list` shows no reverify2 entries.
- Probe files were copied into `tests/unit/` only for each run and removed. `git status` shows no tracked changes; untracked: `icm/05-build/cards/` (pre-existing) and `icm/05-build/evidence/PR-03b-verify-2/`.
- Nothing committed, pushed, or merged.
