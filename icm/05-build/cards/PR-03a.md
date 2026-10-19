Gear: read `/home/nexuslink/.hermes/profiles/shikamaru/SOUL.md` and work as that persona. Read these skills (SKILL.md under `/home/nexuslink/.hermes/skills/`, find them with `find ~/.hermes/skills -name SKILL.md -path '*NAME*'`): nexus-project-workflow, verification-before-completion, test-audit-reconciliation, principle-subtract-before-you-add.
Read first: `AGENTS.md`, `icm/03-plan/DECISIONS.md` (D1 to D36), `/home/nexuslink/vari8-worktrees/beta/icm/03-plan/OWNER-ANSWERS-1018.md`, and the pipeline rules in `/home/nexuslink/vari8-worktrees/beta/icm/05-build/cards/PIPELINE-FOOTER.md` (binding).

# PR-03a: execute the TEST-AUDIT deletions (issue #59)

Worktree `/home/nexuslink/vari8-worktrees/pr-03-test-audit`, branch `beta/pr-03-test-audit`.

Source of truth: `icm/03-plan/output/TEST-AUDIT.md` (approved by Marcel, including the cut of `tests/e2e/auth.spec.ts`).

1. Build the lever first: a script `icm/05-build/tools/apply-test-audit.mjs` that parses TEST-AUDIT.md and lists every file and describe block tagged VISIBLE or CUT, plus the 41 CUT-AT-PORT e2e specs. Use it to delete them (whole files where the whole file is cut, describe blocks otherwise). Do NOT delete GUARD blocks or CUT-AT-REPLACE blocks (those go in the replacing PRs, e.g. auth in PR-05).
2. Rewire setup and config files the deletions orphan (vitest configs, playwright config, global setup, fixtures, package.json scripts) so the remaining suites run.
3. Reconcile: the remaining test counts must match TEST-AUDIT.md's GUARD plus CUT-AT-REPLACE totals (tests and lines); write the reconciliation table into your report. Every remaining suite green.
   Only touch `tests/`, test config files, `package.json` scripts and your tool. No product code.

Card id `PR-03a`, issue #59. Report: `icm/05-build/reports/PR-03a.md`.
