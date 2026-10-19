# PR-03b re-verification 3 (PR #63, after fix pass 2)

Verifier: Shinobu gear, independent of the builder.
Tree: `/home/nexuslink/vari8-worktrees/pr-03-react-hooks`, branch `beta/pr-03-react-hooks`, HEAD `0105160` (= fix `05b7250` + merge of `origin/Vari8-Beta` @ `7072404`).
Comparison tree: base `55a0f08`, detached temp worktree `/home/nexuslink/vari8-worktrees/_reverify3-base` with `node_modules` symlinked (removed afterwards, see §8).
Evidence: `icm/05-build/evidence/PR-03b-verify-3/` (probes, logs, gate logs). Untracked.

## Verdict: SHIP

All five checks pass on HEAD. Three declared notes for the orchestrator (§2, §3, §7). None blocks the ship.

## Per-item verdicts

| Item                                                                             | Verdict                   | Basis |
| -------------------------------------------------------------------------------- | ------------------------- | ----- |
| (1) no effect-level setState, no IIFE, no dodge in feedback-thread               | PASS                      | §1    |
| (2) "Checking..." visible at mount, not deferred by a tick                       | PASS, with wording caveat | §2    |
| (3) round-2 probes pass on HEAD (dashboard and calendar discriminators)          | PASS                      | §3    |
| (4) gates on HEAD                                                                | PASS                      | §4    |
| (5) `origin/Vari8-Beta...HEAD` touches no `frontend/` file, not `docs/STATUS.md` | PASS                      | §5    |

## 1. Item (1): setState in effects, IIFE, dodges

Code read, `components/checkin/feedback-thread.tsx` at HEAD:

- Mount effect (lines 182-219): body is `reconciledRef.current = true` (a ref write) plus `void resolveCheckInFeedbackSendAction(...).then(...).catch(...)`. Every `setReconcile` / `setNonce` / `setItems` call sits inside the `.then` or `.catch` callback, so none runs synchronously in the effect.
- Mount state is derived at render: `useState(() => readMarker(key))`, `useState(() => mountMarker?.nonce ?? crypto.randomUUID())`, `useState(() => mountMarker === null ? "idle" : "checking")`.
- The success path lives in the `useActionState` action (lines 152-174). No effect.
- `grep -n "async () =>"` on the file: no match (exit 1). The IIFE is gone.
- `grep -nE "queueMicrotask|setTimeout|Promise\.resolve"`: no match (exit 1).
- One `eslint-disable-next-line` remains at line 218. It targets `react-hooks/exhaustive-deps`, not one of the four rules. It is present at base (line 183). It is not a setState dodge. Declared as a note, §7.

Lint proof:

| Command                                                                                                                                                         | Exit | Result                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npx eslint --no-inline-config --rule '{"react-hooks/set-state-in-effect":"error", ...}' components/checkin/feedback-thread.tsx` (all disables ignored)         | 0    | 0 set-state-in-effect, 0 refs, 0 purity, 0 immutability. One `exhaustive-deps` warning on the line-218 disable (pre-existing). |
| Same command on base `55a0f08`                                                                                                                                  | 1    | `148:5 error set-state-in-effect` (the synchronous setState that the first verifier flagged).                                  |
| Positive control `components/checkin/v3-control.tsx` (temporary, removed): A = sync `setN` in effect body; B = same setState in an effect-launched `async` IIFE | 1    | A flagged (`7:5 error set-state-in-effect`). B not flagged.                                                                    |

The control proves two things. The rule is live in this config, so 0 findings on HEAD is not vacuous. And the IIFE really does hide the setState from the rule, which is why the code-level grep matters. HEAD has neither the IIFE nor a sync setState.

## 2. Item (2): "Checking..." mount timing

Probe: `icm/05-build/evidence/PR-03b-verify-3/probes/mount-timing.dom.test.tsx` (verifier-authored, jsdom, real component, resolve action never settles, marker in sessionStorage).

- T1: after `render()` returns, with no `await`, the `checkin-feedback-checking` note is in the DOM, and textarea and send button are disabled.
- T2 (diagnostic): a `useLayoutEffect` sibling reads the DOM at the first commit, before any passive effect.

| Tree                                                       | T1 (sync after mount)                                 | T2 first-commit value                                                      | Exit |
| ---------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------- | ---- |
| base `55a0f08`                                             | PASS                                                  | `false` (note appears in the commit caused by the passive-effect setState) | 0    |
| HEAD `0105160`                                             | PASS                                                  | `true` (note is in the first commit)                                       | 0    |
| HEAD, deferred variant (`checking` set in `setTimeout(0)`) | **FAIL** (`Unable to find checkin-feedback-checking`) | `false`                                                                    | 1    |
| base, same deferred variant                                | FAIL                                                  | `false`                                                                    | 1    |

Variant: `probes/variant-deferred-thread.tsx` is HEAD's component with the `checking` state moved into a one-tick timer. The probe fails it. So the probe discriminates a deferral. The variant fails on base too only because it is a deliberately deferred copy; that is the control, not a base defect.

Wording caveat: the card and the orchestrator brief say "visible on the first commit after mount, as on base, both pass". The literal first-commit form fails on base (T2 = `false`). Base shows the note after the passive-effect flush, one commit later. HEAD shows it one commit earlier. The earlier commit is the change the card allowed (derive mount state at render). No deferral exists on HEAD; the note is at or before base's timing in every observed commit. This is a declared divergence in commit granularity, not a deferral. The card's "same moment as base" should read "not later than base".

## 3. Item (3): round-2 probes on HEAD

Probes from `icm/05-build/evidence/PR-03b-verify-2/probes/`, copied to `tests/unit/`, run with `npx vitest run <file> --reporter=verbose`, then removed.

| Probe                                  | Tests | Exit | Covers                                                                                                        |
| -------------------------------------- | ----- | ---- | ------------------------------------------------------------------------------------------------------------- |
| `reverify2-probe.dom.test.tsx`         | 6/6   | 0    | hunk 1 PARITY and GAP; hunk 2 PARITY and **LOAD-REBIND** (calendar discriminator); hunk 3 PARITY ok and error |
| `reverify2-window.dom.test.tsx`        | 2/2   | 0    | hunk 1 CONTROL and **WINDOW** (dashboard discriminator)                                                       |
| `reverify2-mount.dom.test.tsx`         | 3/3   | 0    | hunk 3 mount checking, sent, not_sent                                                                         |
| `reverify2-feedback-char.dom.test.tsx` | 2/2   | 0    | hunk 3 characterisation                                                                                       |

Logs: `evidence/PR-03b-verify-3/logs/v2-reverify2-*-HEAD.log`.

## 4. Item (4): gates on HEAD

| Command                                                       | Exit        | Result                                                                               |
| ------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `npm run typecheck`                                           | 0           | `tsc --noEmit` clean                                                                 |
| `npm run lint`                                                | 0           | 0 errors, 3 warnings (pre-existing `no-unused-vars` in files with no diff vs base)   |
| `npx eslint . \| grep -cE "(warning\|error)  .*react-hooks/"` | 0 (count 0) | 0 react-hooks findings; the four rules at `error` in `eslint.config.mjs` lines 13-16 |
| `npm run test`                                                | 0           | 97 files passed, 1155 tests passed                                                   |
| `npm run build`                                               | 0           | `next build --turbopack`, compiled                                                   |
| `cd frontend && npm run build`                                | 0           | static export                                                                        |
| `npm run index:check`                                         | 0           | "index:check OK: 6 index docs and all AGENTS.md routers match"                       |

Logs: `evidence/PR-03b-verify-3/gates/`.

## 5. Item (5): diff scope

- `git diff --name-only origin/Vari8-Beta...HEAD | wc -l`: 118 files.
- `git diff --name-only origin/Vari8-Beta...HEAD -- frontend | wc -l`: 0.
- `git diff --name-only origin/Vari8-Beta...HEAD -- docs/STATUS.md | wc -l`: 0.
- `git merge-base HEAD origin/Vari8-Beta`: `7072404f71461c834ac345d875ad56f72f6a69f9` (the merge is on the origin side; the three-dot diff is the branch's own work).

## 6. Environment and tree state

- No DB or dev server started. Probes ran in jsdom with mocked server actions.
- Temporary files: `tests/unit/` probe copies and the deferred-variant component were created and removed after each run. Control file `components/checkin/v3-control.tsx` created and removed.
- `git status --short` on HEAD tree after all runs: only `?? icm/05-build/cards/` (pre-existing) and `?? icm/05-build/evidence/PR-03b-verify-3/` (this run) and `?? icm/05-build/reports/PR-03b-verify-3.md`. No tracked changes.
- Nothing committed, pushed, merged, or commented.

## 7. Notes for the orchestrator (not blockers)

1. Wording: "Checking..." is one commit earlier than base, not the same commit (§2). Recommend the card say "not later than base".
2. `eslint-disable-next-line react-hooks/exhaustive-deps` remains on the mount effect (line 218). Pre-existing at base. It suppresses a real exhaustive-deps warning (verified with `--no-inline-config`). It does not hide the four rules. Removing it needs a real deps decision, so I left it to the builder.
3. `eslint.config.mjs` now adds `icm/**/evidence/` to ignores. Lint no longer checks evidence files. Reasonable (probe sources carry `any`), but it widens what lint skips. Visible in the diff, outside this check's scope.
4. Hunk 3 still has no discriminating runtime probe (as verify-2 said). Its end-state parity is covered by the PARITY probes.
5. Not checked here (outside the five items): the card's `PR-03b.md` "Fix pass 2" section, the commits, the push, and the PR #63 comment.

## 8. Cleanup

- Temp base worktree `_reverify3-base`: `node_modules` symlink unlinked, then `git worktree remove --force`, then `git worktree prune` (exit 0). `git worktree list` has no reverify3 entry. HEAD tree `node_modules` intact.
- Scratch files live in `/home/nexuslink/.hermes/cache/scratch/pr03b-v3/` (copies of the probes and logs, not in the repo).

## Commands used (reproduce)

```
W=/home/nexuslink/vari8-worktrees/pr-03-react-hooks
B=/home/nexuslink/vari8-worktrees/_reverify3-base
git worktree add --detach $B 55a0f08 && ln -s $W/node_modules $B/node_modules
cp <probe> $T/tests/unit/<name>.dom.test.tsx && (cd $T && npx vitest run tests/unit/<name>.dom.test.tsx --reporter=verbose); rm <copy>
npx eslint --no-inline-config --rule '{"react-hooks/set-state-in-effect":"error"}' components/checkin/feedback-thread.tsx
npm run typecheck; npm run lint; npx eslint .; npm run test; npm run build; (cd frontend && npm run build); npm run index:check
git diff --name-only origin/Vari8-Beta...HEAD -- frontend docs/STATUS.md
```
