# GATE-PRR: Production-readiness gate on integrated Vari8-Beta

Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/gate-prr-readiness`, branch `beta/gate-prr-readiness`. Step 0: `git fetch origin && git merge --ff-only origin/Vari8-Beta`. A report this card commits ships like every PR: issue `[GATE-PRR]` with label `vari8-beta`, push, PR against `Vari8-Beta`, rules in `icm/05-build/cards/PIPELINE-FOOTER.md`.

Run the `production-readiness-checklist` skill against the integrated `origin/Vari8-Beta` tip, starting from the baseline in `icm/05-build/audits/`: full `verify-local.sh`, a fresh-clone setup per `docs/setup.md`, parity on all 35 screens at both widths, the live role matrix, the security doc against the D15 capability table, the D19 parked list, open risks. Write `icm/05-build/reports/GATE-PRR.md` with READY, REPAIR or BLOCKED per item. REPAIR items become new cards through the program lead.
