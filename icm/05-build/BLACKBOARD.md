# Vari8-Beta blackboard

Live state of the Vari8-Beta program. The state sections are rewritten by the program lead (meliodas) or the orchestrator; the log at the bottom is append-only and written under the integration lock (`icm/05-build/tools/integrate.sh` appends one row per merge). Plan: `icm/03-plan/output/PLAN.md` v2. Program: `icm/05-build/PROGRAM.md`. Board: `hermes kanban --board vari8 list`.

## State at 02:35, 2026-10-19

| Item                 | State                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration branch   | `Vari8-Beta` in `/home/nexuslink/vari8-worktrees/beta`, not pushed                                                                            |
| Kanban board `vari8` | created by the W0 lead; dispatcher not started (orchestrator starts it after the graph check)                                                 |
| PR-02 Next 16        | running outside the graph (Devin, `/home/nexuslink/vari8-worktrees/pr-02-next16`), card parked as blocked until the orchestrator completes it |
| DEC-AUTH             | running outside the graph (Haiku, `icm/05-build/AUTH-DECISION.md`), card parked as blocked                                                    |
| 05:00 checkpoint     | target: PR-02, PR-P1, PR-T1, PR-04 merged; PR-01 verified and merging; D16a recorded                                                          |

## Owners

| Role                             | Owner                                                                    |
| -------------------------------- | ------------------------------------------------------------------------ |
| Program lead, graph, escalations | meliodas                                                                 |
| Integration (merge cards)        | kakashi, escalation meliodas                                             |
| Builders                         | Devin swe-2-max via yamato (gear per card); bulk lanes tenten, shikamaru |
| Verifiers                        | neji (behavior, parity), shinobu (security PRs)                          |
| Production-readiness gate        | urokodaki                                                                |
| Final judgement                  | minato, once                                                             |
| GitHub (push, issues, PRs)       | orchestrator only                                                        |

## Blockers and open calls

| Id  | Blocker                                                     | Unblocks with                                               | Owner                  |
| --- | ----------------------------------------------------------- | ----------------------------------------------------------- | ---------------------- |
| B1  | D16a, the AUTH outcome                                      | AUTH-DECISION.md lands, DEC-AUTH-REVIEW accepts             | orchestrator, meliodas |
| B2  | Node 24 not installed (mise has 22 and 26)                  | `mise install node@24`, then `REQUIRE_NODE24=1`             | orchestrator           |
| B3  | plan-to-issues label rules for PR-P, PR-T, PR-R, PR-X, PR-D | generator edit (uncommitted edits sit in the root checkout) | orchestrator           |
| B4  | D23 parameter catalog for production                        | Marcel says `seed-catalog` or keeps the default             | Marcel                 |

## Log

| Time             | Card    | Event                          | SHA     | Detail                        |
| ---------------- | ------- | ------------------------------ | ------- | ----------------------------- |
| 2026-10-19 02:06 | PR-02   | started outside graph          | 17352b0 | Devin swe-2-max, kakashi gear |
| 2026-10-19 02:20 | W0 lead | DECISIONS D15 to D36 committed | 6b54a7d | owner answers 2026-10-18      |
| 2026-10-19 02:30 | W0 lead | PLAN v2 committed              | 019388a | 41 PR sections, generated     |
