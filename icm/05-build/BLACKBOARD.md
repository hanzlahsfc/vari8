# Vari8-Beta blackboard

Live state of the Vari8-Beta program. The state sections are rewritten by the program lead (meliodas) or the orchestrator; the log at the bottom is append-only. Merges append to `/home/nexuslink/vari8-worktrees/_live/merge-log.md` under the integration lock (`icm/05-build/tools/integrate.sh`), outside git, so no merge needs a follow-up commit on `Vari8-Beta`. Plan: `icm/03-plan/output/PLAN.md` v2. Program: `icm/05-build/PROGRAM.md`. Runbook: `icm/05-build/RUNBOOK.md`. Board: `hermes kanban --board vari8 list`.

## State at 03:00, 2026-10-19

| Item                        | State                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration branch          | `origin/Vari8-Beta` at `55a0f08` (PR-02 merged). The W0 program commits ride on PR `beta/w0-program` into `Vari8-Beta` (see the lead report)                                                                        |
| Board `vari8`               | 145 cards created by meliodas, ids in `icm/05-build/cards/board-ids.tsv`. 7 done (W0 and PR-02), 138 blocked so nothing dispatches before the graph check. Go step: `python3 icm/05-build/tools/board.py --release` |
| In flight outside the graph | PR-05 #58, PR-03A #59, PR-03B #60 (3 Devin builders), PR-P1 #61 (Haiku), PR-X1 #62 (ds4f). Their build cards stay blocked; the orchestrator completes each with the PR URL and head SHA when its builder exits      |
| D16a                        | recorded in `icm/03-plan/DECISIONS.md`: Better Auth, reset links 60 minutes single use, refresh rotation deferred                                                                                                   |
| 05:00 checkpoint target     | merged: PR-02, PR-P1, PR-03A, PR-03B, PR-X1, PR-05, PR-04, PR-01 (04:55, no buffer); PR-T2 verifying                                                                                                                |

## Owners

| Role                             | Owner                                                                    |
| -------------------------------- | ------------------------------------------------------------------------ |
| Program lead, graph, escalations | meliodas                                                                 |
| Integration (merge cards)        | kakashi, escalation meliodas                                             |
| Builders                         | Devin swe-2-max via yamato (gear per card); bulk lanes tenten, shikamaru |
| Verifiers                        | neji (behavior, parity), urokodaki (PR-P1), shinobu (security PRs)       |
| Production-readiness gate        | urokodaki                                                                |
| Final judgement                  | minato, once                                                             |
| GitHub                           | each card opens its issue and PR; only `integrate.sh` merges             |

## Blockers and open calls

| Id  | Blocker                                                                                                  | Unblocks with                                                                               | Owner        |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------ |
| B1  | W0 program PR not merged: card worktrees must start from a base that has `icm/05-build/tools/`           | merge the W0 PR, then `prep-worktrees.sh`, then `board.py --release`                        | orchestrator |
| B2  | Node 24 not installed (mise has 22 and 26); TEST-AUDIT ran green on 26                                   | `mise install node@24`, then `REQUIRE_NODE24=1`                                             | orchestrator |
| B3  | D23 parameter catalog for production                                                                     | Marcel says `seed-catalog` or keeps the default                                             | Marcel       |
| B4  | 17 `NEW` P0 rows in the readiness baseline need hosting, backup, TLS, mail-domain and monitoring choices | owner decisions; listed in the lead report                                                  | Marcel       |
| B5  | PR-01 has no buffer before 05:00                                                                         | release the board by 03:00; if late, the checkpoint shows PR-01 open with its verify report | orchestrator |

## Log

| Time             | Card    | Event                                                      | SHA     | Detail                                                      |
| ---------------- | ------- | ---------------------------------------------------------- | ------- | ----------------------------------------------------------- |
| 2026-10-19 02:06 | PR-02   | started outside graph                                      | 17352b0 | Devin swe-2-max, kakashi gear                               |
| 2026-10-19 02:20 | W0 lead | DECISIONS D15 to D36 committed                             | 6b54a7d | owner answers 2026-10-18                                    |
| 2026-10-19 02:19 | PR-02   | merged as #57                                              | 55a0f08 | Haiku verifier SHIP, branch and worktree removed            |
| 2026-10-19 02:30 | W0 lead | PLAN v2 committed                                          | 019388a | generated from `program_data.py`                            |
| 2026-10-19 02:35 | W0 lead | blackboard and lane tools committed                        | 6dfe6b3 | local gate, integrate, Devin slots, worktree prep, dev user |
| 2026-10-19 02:51 | W0 lead | board `vari8` populated                                    |         | 145 cards, 7 done, 138 blocked                              |
| 2026-10-19 03:00 | W0 lead | D16a, PROGRAM, RUNBOOK, SYSTEM-INDEX-SPEC, PLAN v2 refresh |         | external lanes folded in, GitHub pipeline in every card     |
