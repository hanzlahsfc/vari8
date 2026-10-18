# Review brief RV-A and RV-B (independent verification of landed subagent output)

Standing rule (owner): every subagent output is checked by a different model before anything relies on it. You are that check. The producers of the work you review were DeepSeek v4.1 Flash lanes. Distrust their reports; trust only what you re-derive from source, commands, and primary URLs.

All paths are under `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/` unless absolute. Decisions that depend on this work: `icm/03-plan/DECISIONS.md` D4 to D8.

Load skills first with `skill_view`: `poteto-mode` (then its `playbooks/investigation.md`), `principle-prove-it-works`, `grounded-citations`.

Output: `icm/05-verify/output/<lane>.md`, written incrementally. First line `VERDICT: PASS | PASS WITH FINDINGS | FAIL`. Then the total number of claims you checked, a table `| claim (report path:line) | how checked (command or URL) | result CONFIRMED / WRONG / UNVERIFIABLE | evidence |`, then `## Findings` (each WRONG with what is actually true and which decision it affects), then `## Could not check`. Self-check at the end: PASS or FAIL per required item below.

Rules: never commit, push, or edit any tree or report you review. Throwaway work goes in `/home/nexuslink/.hermes/cache/scratch/vari8-review/<lane>/`. No GUI. Kill everything you start.

## RV-A. P1 (Next 16) and P2 (Biome)

Reports `icm/03-plan/output/P1-next16.md`, `P2-biome.md`. Branches `proto/next16` (`b603c35`, worktree `/home/nexuslink/vari8-worktrees/next16-proto`) and `proto/biome` (`d1b1668`, `ce2efed`, worktree `/home/nexuslink/vari8-worktrees/biome-proto`), both on base `58eb6ed`.

Required:

1. `git diff 58eb6ed b603c35 --stat` and the full diff: confirm the report's change list is complete and no application source changed beyond what it claims.
2. P2 reformat: prove the 98-file reformat changed formatting and the listed safe fixes only. Method: for every changed `.ts/.tsx` file, compare the TypeScript AST (or `tsc --noEmit` declaration output) before and after, or run Biome's formatter on the base with the same config and diff against the commit. Inspect every non-whitespace hunk by hand. List any hunk that changes behavior.
3. Re-run in a fresh copy of each branch (`git worktree add` into scratch, `npm ci`): typecheck, build, unit tests, lint. Record exit codes and test counts; compare to the report.
4. Check the 10 react-hooks findings P1 lists exist at the cited lines.
5. Check the claim "Biome lacks 6 App Router relevant ESLint rules" against `biome explain` or the Biome rule docs.

## RV-B. R1 (mobile), R2 (tooling), R3 (libraries)

Reports `icm/03-plan/output/R1-mobile.md`, `R2-tooling.md`, `R3-libraries.md`.

Required:

1. Every claim that a decision in D5 to D8 rests on (list them first, at least 15), checked against the primary URL or the npm registry. Must include: Auth.js "not intended for native applications"; Next static export drops server actions and `cookies()`; Better Auth bearer plugin exists; Capacitor 8 current version; TypeScript 7.0.2 published and `tsgo` timing on this tree (re-measure: 3 runs each of `npx tsc --noEmit` and the TS7 compiler in a scratch copy of `/home/nexuslink/vari8-worktrees/merge-proto`); Biome vs ESLint timing; Bend 2 description; `muscle-volume.ts` has no 3D need (open the file); canvas chart is hand-rolled SVG (open `smooth-trend.tsx`); backend has no validation library (grep `package.json` and `lib/**/boundary.ts`); `lib/storage.ts` port exists with null backend.
2. 10 further claims sampled at random across the three reports.
3. Any recommendation that does not follow from its evidence.

## RV-B2. Judge the first-pass RV-B report

A non-judging lane (gpt-6-luna) already wrote `icm/05-verify/output/RV-B.md` (VERDICT: PASS WITH FINDINGS, 31 claims). You are the judge. Re-check every row it marked WRONG or UNVERIFIABLE and at least 8 rows it marked CONFIRMED, against the primary source yourself. Check that every RV-B required item above is covered; do any that are missing. Write `icm/05-verify/output/RV-B2.md` in the same format, with a final verdict on R1, R2 and R3 (not on the RV-B report).
