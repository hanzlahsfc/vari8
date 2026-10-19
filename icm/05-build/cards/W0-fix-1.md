# W0 fix pass 1 (PR #67)

The independent review (Haiku, shikamaru gear) returned FIX. Full report: `/home/nexuslink/.hermes/cache/scratch/pr67-verify.md`. Fix every item below on branch `beta/w0-program` in `/home/nexuslink/vari8-worktrees/beta`, regenerate from `icm/05-build/tools/program_data.py` (do not hand-edit generated files), re-run your own checks, commit with explicit pathspecs, push, and post a PR comment listing each item with the commit that fixes it. Do not merge and do not release the board.

## Orchestrator rulings

1. **Sonnet on 45 cards (44 merge cards and GATE-CLEAN).** Sonnet is banned. Merge cards and GATE-CLEAN are mechanical: set them to `deepseek-v4.1-flash` on provider `opencode-go`.
2. **Haiku as builder (PR-P1 and two decision or audit cards).** This is allowed. The owner's routing allows Haiku builds when an Opus verifier checks them. Keep these, and make sure each one's verify card runs on `claude-opus-5-5` (profile urokodaki for PR-P1).
3. **Shorthand.** Use exact model ids in every card line: `deepseek-v4.1-flash`, `claude-haiku-5-5`, `claude-opus-5-5`, `swe-2-max`, `swe-2`, `gpt-6.1-sol`. Prose mentions in explanations may stay.
4. **Wiring gate.**
   - PR-W0 must have PR-05 and PR-P1 as ancestors.
   - The PR-MEDIA build card must have PR-P1 as an ancestor.
   - Add a script check that every card touching canvas wiring descends from both.
5. **`board.py --release`.** Cards are created with `--parent`, and `hermes kanban unblock` moves a card with an open parent to todo, not ready. The reviewer's stub did not model that, so the logic is probably fine, but prove it.
   - Run `hermes kanban show` on 3 real cards that have parents, read-only, and confirm the parent links exist on board `vari8`.
   - On a throwaway board (`--board vari8-selftest`, deleted afterwards), create a parent and a child as blocked, unblock both, and record that the child lands in todo.
   - Add an explicit parent-done check to `--release` anyway, so the script does not rely on that semantics.
6. **R1 disposal list.** Remove S12-43 (`lib/db.ts` is live), S12-44, S12-48 and S12-49 (the extraction files the catalog importers import) from the PR-R1 build and verify cards and from PLAN.md (around :1966 and :1993). R3-17 (parameter create, edit and archive) is kept as an active orphan; add it to the owner-questions list.
7. **P0 coverage.**
   - The baseline has 38 P0 rows, not 31. Every one of the 38 gets a row in `coverage-ledger.csv`: owning card, PRESENT, PARKED (D12), N/A, or `POST-BETA-INFRA`.
   - `POST-BETA-INFRA` covers backups, restore test, PITR, TLS and DNS, SPF, DKIM and DMARC, uptime, error tracking, cost alerts, encryption at rest and account ownership. It means the item needs a hosting decision from the owner and is not built in beta.
   - The 2 rows that have no owner get an owner.
   - Put the full list of POST-BETA-INFRA items in `icm/05-build/POST-BETA-INFRA.md`. The orchestrator turns them into GitHub issues.
8. **Dev DB password literal** in `integrate.sh:53` and `verify-local.sh:91`. Remove the default and read it from the environment, with a clear error when it is unset.
9. **Em dashes** in `coverage-ledger.csv` lines 21, 197 and 321. Replace them with plain punctuation.
10. **Untracked files.** Add `icm/05-build/ORCHESTRATOR-STATE.md`, `icm/05-build/audits/PRODREADY-TICKETS.md`, `icm/05-build/cards/PR-02.md` and `icm/05-build/cards/issue-ids.txt` to this PR. They belong to the orchestrator, so do not edit their contents. Add `icm/05-build/tools/__pycache__/` to `.gitignore`.
11. **PR-05 contract risk.** PR-05's verify and secverify cards must check two things explicitly: the roles table from D10/Q3, and the session export PR-01 needs.

## Done means

- Your graph script passes, and the new check from ruling 4 passes.
- `grep -rn sonnet icm/05-build` finds nothing.
- The ledger has 38 P0 rows.
- The selftest board from ruling 5 is deleted.
- Write `icm/05-build/reports/W0-fix-1.md` with a line for each item.
