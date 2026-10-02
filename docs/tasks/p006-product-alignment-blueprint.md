# P-006 — Product-alignment blueprint task record

**Documentation only.** Branch `docs/p006-product-alignment-blueprint` off
verified `main` `25994573cca028ba804fddb6883f65746b0ca74f`. Builder: Juno
(SWE-2 High). Merge hold active; no push/PR until released.

## Plan (written after first candidate — honest timing)

The conductor-required written plan was not committed ahead of the first draft:
Apollo's P-006 brief functioned as the written plan (it enumerates required
content §1–§9, traceability, and acceptance). This record is created at the
first repair round; timing noted honestly rather than backdated.

- Deliverable: `docs/product-alignment-blueprint.md`.
- Reconciliation edits: `docs/product-decisions.md` (dated #2 addendum),
  `docs/implementation-plan.md` (status note), `docs/STATUS.md` (heading +
  entry), `docs/open-questions.md` (D-pointer),
  `docs/tasks/phase-0-1-source-blueprint.md` (dated preserved-but-superseded
  notice).
- Source: `/Users/apple/Downloads/coaching-system-development-brief.html`
  (55,897 bytes, read in full; stays outside Git).
- Acceptance: all nine required blueprint sections present; traceability
  matrix covers every brief function ID; every unapproved decision marked
  PROPOSED/PENDING with owner/reason/tradeoff/blocks; no code/schema edits;
  baseline gates executed on the exact candidate tree with real exit codes.

## Verification commands (docs candidate)

| Command                                          | Exit  | Notes                                                                                                           |
| ------------------------------------------------ | ----- | --------------------------------------------------------------------------------------------------------------- |
| `git fetch origin` + `git rev-parse origin/main` | 0     | `25994573cca028ba804fddb6883f65746b0ca74f` — unchanged, matches base                                            |
| `gh pr list --state all`                         | 0     | 7 PRs, all MERGED; none open                                                                                    |
| `git status --short --branch`                    | 0     | clean before edits; unrelated changes none                                                                      |
| `npm run format:check`                           | 1 → 0 | initial warn on 2 docs; `--write` fixed; recheck clean                                                          |
| `git diff --check`                               | 0     | no whitespace errors                                                                                            |
| `npm run typecheck`                              | 0     | `tsc --noEmit` clean                                                                                            |
| `npm run lint`                                   | 0     | eslint clean                                                                                                    |
| `npm run test` (vitest unit)                     | 0     | 45 files / 462 tests (incl. `source-data-policy` guard)                                                         |
| `npm run test:integration` (disposable PG)       | 0     | 21 files / 226 tests; disposable `juno_int` on `juno-audit-pg` :5444 via `INTEGRATION_DATABASE_URL`             |
| `npm run build`                                  | 0     | `next build --turbopack`; ƒ /reset + /reset-request emitted                                                     |
| `npm run test:e2e`                               | 0     | 72 passed, 12 capability-skipped (gated reset flows — P-005 invariant holds); disposable `juno_e2e` DB on :5444 |

E2E note: a first attempt failed `ENOENT pages-manifest.json` because a manual
`npm run build` ran concurrently with Playwright's own webServer build — an
infra collision in `.next`, not a product failure; clean re-run passed 72/12.

## Review rounds

- **Round 1 (initial):** Apollo read-only review (Codex/GPT-6, different model
  from builder) — **BLOCK**, findings R1–R7. Helios independent read-only
  review — **BLOCK**, additional findings. Both folded into this repair round:
  retention PENDING instead of infinite-retention claim; dated authoritative
  supersession attributing confirmed direction to Hanzlah/Lilly's brief;
  expanded template/version/override rules with versioned parameter snapshots,
  explicit rating preservation, atomic conflicted-upgrade handling, and
  template-assignment vs ClientAssignment separation; onboarding rewritten to
  durable domain IDs (never raw bearer/token-hash keys), immutable submission
  revisions, PD#21 re-invite; decisions table extended to D-01…D-14 with
  owner/reason/tradeoff/blocks; intake promoted to slice 1; RBAC corrections
  (owner≠assigned coach scope, deactivation fails closed, coach-note privacy
  current-vs-proposed); N05/M01 details enumerated; terminology aligned to the
  brief.
- **Round 2:** pending re-review (Apollo + Helios) of the revised candidate.

## Constraints honored

Docs-only diff; no app/schema/migration/dependency/route/RBAC change; no real
client data, source dumps, credentials, or token values committed; merge hold
preserved; P-005 premerge-review deviation recorded as historical and never
retroactively satisfiable.
