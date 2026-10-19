# PR #67 independent verification (beta/w0-program, head 1701ef4, base Vari8-Beta)

Verdict: **FIX**. The graph is acyclic and the build/verify/merge pairing holds, but the Sonnet routing, the wiring gate, the R1 disposal list, the P0 ledger coverage and `board.py --release` all fail their checks.

Worktree: `/home/nexuslink/vari8-worktrees/beta`, HEAD 1701ef4 = origin/beta/w0-program. Diff vs merge-base 55a0f08: 172 files, 169 added, 3 modified. Nothing committed, pushed, merged or released. Board ids file unchanged (cmp). Scripts and raw output: `/home/nexuslink/.hermes/cache/scratch/pr67v/` (`verify_graph.py` -> `graph-check.txt`, `verify_ledger.py` -> `ledger-check.txt`, `verify_deps.py`, `verify_release.py`, `board-dry.txt`, `release-dry.txt`).

Graph counts: 145 nodes (44 build, 50 verify, 44 merge, 4 decision, 3 gate). Models: claude-sonnet-5-5 45, claude-haiku-5-5 49, deepseek-v4.1-flash 38, claude-opus-5-5 3, gpt-6.1-sol 1.

## 1. Graph order: PARTIAL PASS, 2 FIX

PASS

- Topological sort succeeds, so no cycles. Every parent key exists (0 missing). Keys are unique.
- Every build has exactly one verify child whose model differs from the build model (0 same-model pairs, 0 builds without verify). Every verify has a merge child; every merge depends on a verify.
- Schema chain: db/ writers per card bodies are exactly PR-05, PR-M0, PR-R2. PR-M0 build waits on PR-05:merge (graph.json, PR-M0:build). PR-R2 waits on PR-M0:merge. All M1 to M9 builds wait on PR-M0:merge.
- Graph parents match PLAN v2 "Depends on" lines for all 44 PRs (0 mismatches, verify_deps.py).
- PR-R0 (lib-only helper merge) waits on PR-05:merge and is an ancestor of every PR-M1 to M9 build.

FIX

- Screen wiring gate (PLAN wiring cards must wait on PR-05 and PR-P1):
  - `pr-w0-data-seam.md` / graph `PR-W0:build` parents = [PR-01:merge, PR-03:merge]. No PR-05 ancestor, no PR-P1 ancestor.
  - `pr-media-storage.md` / graph `PR-MEDIA:build` parents = [PR-M0:merge, PR-05:merge]. No PR-P1 ancestor. PR-MEDIA wires the message screens (PLAN, PR-MEDIA section). Only its verify waits on PR-P1.
  - The other 11 wiring builds (W1 to W10, MSG) pass.

## 2. Model routing: FIX (violations listed by card)

Pass

- Verify models are only claude-haiku-5-5 or claude-opus-5-5 (no FAIL on the role rule).
- gpt-6.1-sol appears only on GATE-FINAL:gate (minato).
- glm: 0 hits in cards, graph, PLAN, tools.
- Provider matches model for every card; exact ids used in graph.json.

Violations

- Sonnet, 45 cards (graph.json, claude-sonnet-5-5, kakashi):
  - All 44 `:merge` cards: PR-02, PR-P1, PR-03A, PR-03B, PR-04, PR-01, PR-W1, PR-03, PR-T2, PR-05, PR-M0, PR-R0, PR-M1 to PR-M9, PR-SV1 to PR-SV4, PR-MEDIA, PR-MSG, PR-W0, PR-W2 to PR-W10, PR-R1, PR-R2, PR-R3, PR-X1, PR-X2, PR-D1, PR-31. Graph key `<PR>:merge`.
  - GATE-CLEAN:gate (`gate-clean.md`, graph.json).
  - Sonnet also appears in tools mapping: `tools/program_data.py:19`, `tools/program_md.py:56`, `tools/board.py:30` (PROVIDER map), `PROGRAM.md:80`.
- Haiku as a builder (not a verifier), violates "Haiku verifiers only":
  - `parity-harness.md:3` and `:27`: PR-P1 build is "Builder: claude-haiku-5-5". Graph model is null. Builder should be Devin swe-2-max or ds4f.
  - `dec-auth-evaluation.md:3` "Haiku lane" (DEC-AUTH:decision).
  - `aud-backend-reduction.md:3` "Haiku, kakuzu gear" (AUD-REDUCTION:decision). kakuzu is Sonnet in SOUL roster; card and roster disagree.
- Shorthand, not exact ids (rule: exact ids):
  - `ds4f`: `pr-t2-consent-test-cuts.md:3`, `pr-x2-index-final.md:3`, `system-index.md:32`.
  - `Haiku` prose: `dec-auth-evaluation.md:3`, `aud-backend-reduction.md:3`, `pr-02-next16.md:28`, `parity-harness.md:27`.
  - `Opus` prose: `aud-prr-baseline.md:3`.
- Note, not a violation: `urokodaki` (Opus) appears on PR-P1:verify, GATE-PRR and AUD-PRR-BASELINE but is not in the SOUL roster. Opus is allowed; roster drift only.

## 3. Coverage ledger: FIX

Pass

- 44 of 44 PLAN v2 PR sections have a graph build card. 44 `plan-pr` ledger rows, all distinct, each build_card equals the graph slug. 0 empty build_card cells on non-parked rows; 0 build/verify slugs unknown to the graph.

FIX (P0 rows)

- PRODREADY-BASELINE.md has 38 rows with P0 in the priority column, not 31. The 31 are the gaps (16 PARTIAL, 13 MISSING, 2 UNVERIFIED). The other 7 are 2 PRESENT (PR-043, PR-121), 1 PARKED (PR-145, line 233), 4 N/A.
- 0 of the 38 P0 ids are cited anywhere in coverage-ledger.csv.
- Owner column for the 31 gaps:
  - 14 owned by a PLAN PR but not referenced in the ledger: PLAN PR-M0 (PR-001, PR-015, PR-024), PLAN PR-05 (PR-002, PR-003, PR-005, PR-009, PR-010, PR-011, PR-013, PR-023, PR-092), PLAN PR-03 (PR-039, PR-062).
  - 15 owner NEW, with no card, no ledger row, no park row, and no PLAN mention: PR-019, PR-020, PR-036, PR-037, PR-038, PR-041, PR-045, PR-046, PR-068, PR-074, PR-077, PR-081, PR-082, PR-133, PR-146. (Backups, restore, TLS, mail domain, monitoring, cost alerts, dependency scanning, org ownership.)
  - 2 with no owner: PR-025, PR-040 (UNVERIFIED).
- PR-145 (PARKED) and the 2 PRESENT rows need explicit park rows; none exist.

## 4. Tools: FIX

- `board.py --release` (lines 130 to 134): `held = [... if external not in ("running","done")]`, then `unblock(*held)`. It never checks parents. The docstring (lines 6 to 7, 13) says it releases only cards whose parents are done. Dry run (stub `hermes` on PATH, no real board touched): would unblock 133 cards, 131 of which have a parent not yet done (e.g. PR-P1:verify, PR-03A:verify, PR-04:verify, PR-W1:build). Fix: filter by parent status, or remove --release until fixed.
- `board.py --dry-run` (create path): prints only; idempotent ids unchanged. Ran with stub hermes.
- `integrate.sh`: pass on the requested properties.
  - Cannot push to main: only `git push -q origin --delete "$HEAD_BRANCH"` (line 90), and the head branch must match an open PR into Vari8-Beta (lines 28 to 30), so a head of `main` exits 2 before the delete.
  - Cannot trigger Actions: no dispatch; `gh pr merge` (line 80) into Vari8-Beta. Base workflows (`ci.yml`, `frontend.yml` at 55a0f08) are `workflow_dispatch` only, with no push or pull_request triggers.
  - Explicit pathspecs: no `git add` or commit anywhere in integrate.sh.
  - Caveat: the SHIP gate is a comment-text match (lines 35 to 42). It does not check the verifier's identity or model.
- Credential-shaped default: `integrate.sh:53` and `verify-local.sh:91`, `PGPASS="${POSTGRES_PASSWORD:-app_dev_password}"`. Dev DB default password literal in committed code. Replace with a required env var.

## 5. Secrets in the diff: PASS with 2 FIX

- Added lines: 0 hits for `lek_live`, `sk-`, `ghp_`, `AKIA`, private keys, password assignments with literals, `AUTH_SECRET=` with a value.
- DATABASE_URL: only masked forms (`app:***@127.0.0.1`) in RUNBOOK.md and integrate.sh/verify-local.sh.
- FIX: the dev password default in integrate.sh:53 and verify-local.sh:91 (see section 4).

## 6. Em dashes: FIX (minor)

- 0 em dashes in cards and in every added doc.
- 3 em dashes in `coverage-ledger.csv` lines 21, 197, 321 (quoted matrix copy: "Client create: not drawn", "Training week: Completed sessions", "Submitted onboarding" tab). Replace with a plain separator or reword.
- En dashes (7) appear only in quoted UI copy (`pr-msg-messaging*.md`, `pr-w7-nutrition*.md`, ledger). Not em dashes; no action required.

## 7. R1 disposal, R0 helper, WIRING-SPEC citations (user addition): FIX

- FIX, R1 disposal list names live ids (23 hits):
  - `pr-r1-delete-superseded.md:39, 40, 44, 45, 51` (S12-43, S12-44, S12-48, S12-49, R3-17), each annotated "(keep ...)" but still in the disposal list.
  - `pr-r1-delete-superseded-verify.md:34, 35, 39, 40, 46`.
  - `PLAN.md:1966` (four ids, "Keep lib/db.ts ... " checklist) and `PLAN.md:1993` (disposed list includes S12-43, S12-44, S12-48, S12-49, R3-17).
  - `pr-r1-delete-superseded.md:80` is the correct keep line; the list entries above it must be removed.
  - Evidence: BACKEND-REDUCTION.md section 5 items 2 and 3 (lines 81 to 82) say remove these ids from R1.
- PASS, lib-only helper before PR-M1: `pr-r0-lib-dedupe.md:34 to 42` covers F8 (withSerializedRetry in lib/db.ts) and F9 (lib/boundary.ts), has no db/ writes, and graph `PR-M1:build` waits on `PR-R0:merge`.
- PASS, WIRING-SPEC citations in cards: 0 hits in cards/*.md and graph.json. The file `icm/02-gap-matrix/output/F1/WIRING-SPEC.md` is absent (0 on disk).
  - Note, not cards: tracked docs still cite it (`BACKEND-REDUCTION.md` lines 25 and 80 as the missing-file defect, `PROGRAM-BRIEF.md`, `DECISIONS.md`, `PLAN-brief.md`, `DB-brief.md`, `F1-card.md`, `RESUME-2026-10-18-crash.md`, and `03-plan/output/issues.dry-run.json` with 62 hits). Owner should decide whether the generated dry-run JSON is stale.

## Required fixes

1. Re-route the 44 `:merge` cards and GATE-CLEAN off claude-sonnet-5-5 (graph.json, tools mapping in program_data.py/program_md.py/board.py, PROGRAM.md:80). Suggest deepseek-v4.1-flash for the mechanical merges and claude-haiku-5-5 for GATE-CLEAN.
2. Give PR-P1 (`parity-harness`) a non-Haiku builder (Devin swe-2-max, or ds4f). Haiku remains verifier-only. Decision and audit cards: record as exceptions or re-route.
3. Replace shorthand with exact ids: `ds4f` at pr-t2-consent-test-cuts.md:3, pr-x2-index-final.md:3, system-index.md:32; "Haiku"/"Opus" prose at dec-auth-evaluation.md:3, aud-backend-reduction.md:3, aud-prr-baseline.md:3, pr-02-next16.md:28, parity-harness.md:27.
4. Wiring gate: add PR-05:merge and PR-P1:merge as ancestors of PR-W0 build (update PLAN "Depends on" for PR-W0 too), and add PR-P1:merge to PR-MEDIA build (PLAN PR-MEDIA section).
5. `board.py --release`: filter unblocks to cards whose parents are all done; re-run the dry run and confirm the list before any release.
6. Remove S12-43, S12-44, S12-48, S12-49, R3-17 from the R1 disposal lists in build card, verify card and PLAN.md:1966 and :1993.
7. Ledger: add rows for all 38 P0-column rows of PRODREADY-BASELINE (31 gaps, 2 PRESENT, PR-145 PARKED, 4 N/A) mapping each to a PLAN PR, a new card for the 15 NEW gaps, or an explicit park/post-beta row.
8. Remove the default dev DB password literal from integrate.sh:53 and verify-local.sh:91 (required env var).
9. Replace the three em dashes in coverage-ledger.csv lines 21, 197, 321.

## Limits

- Worktree has untracked files not in the PR (ORCHESTRATOR-STATE.md, audits/PRODREADY-TICKETS.md, cards/PR-02.md, cards/issue-ids.txt, `tools/__pycache__`). Not reviewed as part of the diff; ORCHESTRATOR-STATE.md:30 still says "no Sonnet".
- Did not run the local gate, verify-local.sh or any Devin/Hermes CLI against the real board.
- The `--release` and `--dry-run` runs used a stub `hermes` binary, so no kanban state was touched.
