# CONTEXT.md (L1 router)

Where do I go? Route by task, open one stage, stop early.

| Task                                                              | Open                                                            |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Understand what the canvas and the backend each have              | `icm/01-recon/CONTEXT.md`                                       |
| Which canvas element is wired, unwired, or missing in the backend | `icm/02-gap-matrix/CONTEXT.md`                                  |
| The approved merge program (PR order, gates)                      | `icm/03-plan/CONTEXT.md`                                        |
| Build one slice of the program                                    | `icm/04-build/CONTEXT.md`                                       |
| Verify a slice before merge                                       | `icm/05-verify/CONTEXT.md`                                      |
| Canvas UI work inside `frontend/`                                 | `frontend/docs/agent-workflow/CONTEXT.md`                       |
| Backend rules, product and security decisions                     | `AGENTS.md`, then `docs/product-decisions.md`, `docs/security/` |
| Implementation history                                            | `docs/STATUS.md` (newest first)                                 |

Stage status is whatever exists in each stage's `output/`. No status file.

Branch model. `TRACKER` is the integration branch and becomes `main`. Work branches come off `TRACKER` and return by PR.
