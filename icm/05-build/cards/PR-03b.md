Gear: read `/home/nexuslink/.hermes/profiles/itachi/SOUL.md` and work as that persona. Read these skills (SKILL.md under `/home/nexuslink/.hermes/skills/`, find them with `find ~/.hermes/skills -name SKILL.md -path '*NAME*'`): nexus-project-workflow, verification-before-completion, React, typescript-best-practices, principle-fix-root-causes.
Read first: `AGENTS.md`, `icm/03-plan/DECISIONS.md` (D1 to D36), `/home/nexuslink/vari8-worktrees/beta/icm/03-plan/OWNER-ANSWERS-1018.md`, and the pipeline rules in `/home/nexuslink/vari8-worktrees/beta/icm/05-build/cards/PIPELINE-FOOTER.md` (binding).

# PR-03b: fix the 11 react-hooks v6 findings (issue #60)

Worktree `/home/nexuslink/vari8-worktrees/pr-03-react-hooks`, branch `beta/pr-03-react-hooks`.

PR-02 (merged, #57) downgraded four `eslint-plugin-react-hooks` v6 rules to warn because 11 findings in pre-existing code fail them. See `icm/05-build/reports/PR-02.md` section E2 for the list.
1. Fix each finding at the code, at the root cause (derive state instead of syncing it in effects, move setState out of render, stable refs, etc.). Behaviour and visuals stay identical.
2. Set the four rules back to `error` in `eslint.config.mjs`. Lint must exit 0 with zero react-hooks findings.
3. For every component you touched that renders on a screen, attach before and after screenshots at 1440 and 390 px from the running app proving no visual change.
Applies to both the root app and `frontend/` if the canvas has findings, but canvas markup and styles stay byte-identical except where a hook fix requires a change; note each such case.

Card id `PR-03b`, issue #60. Report: `icm/05-build/reports/PR-03b.md`.
