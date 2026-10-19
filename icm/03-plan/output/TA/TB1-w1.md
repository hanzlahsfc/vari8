# TB1-w1 describe-level audit

Worktree: /home/nexuslink/.hermes/cache/scratch/vari8-tb/TB1-w1 @ 58eb6ed (detached). DB: app_tb_tb1_w1 on vari8-db-1.

Baselines (each file run alone with INTEGRATION_DATABASE_URL set):

| file                                                     | baseline result        |
| -------------------------------------------------------- | ---------------------- |
| tests/integration/checkin-overview-i1.test.ts            | 18 passed (18), 22.83s |
| tests/integration/habits.test.ts                         | 35 passed (35), 8.97s  |
| tests/integration/p020a-parameter-classification.test.ts | 21 passed (21), 5.24s  |
| tests/integration/p021-daily-entry.test.ts               | 19 passed (19), 7.27s  |
| tests/integration/p025b-checkin-instances.test.ts        | 27 passed (27), 7.63s  |
| tests/integration/p025c-checkin-review.test.ts           | 19 passed (19), 7.34s  |
| tests/integration/phase-3-1-invite-acceptance.test.ts    | 6 passed (6), 3.59s    |

| file                                                     | block                                                                                   | lines | tests | target                                                                                                                                                | verdict | reason or mutation                                                                                                                                      | failed tests                                                                                                                                                                                                                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| tests/integration/checkin-overview-i1.test.ts            | CHECK-IN-OVERVIEW-I1 review queue (real PG)                                             | 641   | 18    | lib/checkin/instances listCheckInReviewQueue + instances-boundary                                                                                     | KEEP    | removed `reviews: { none: {} },` unreviewed predicate, instances.ts:3208                                                                                | owner sees every unreviewed submission workspace-wide; reviewed rows are excluded / predicate-before-limit: qualifying rows beyond a page of excluded rows are still returned / a row reviewed after the snapshot disappears on refetch (stale-row contract) |
| tests/integration/habits.test.ts                         | HABITS-I1 (real PG)                                                                     | 1892  | 35    | lib/habits/service createHabit/editHabit/archiveHabit/setHabitLog/listTodayHabits/listStaffHabits/habitConsistency/listHabitChoices + lib/habits/date | KEEP    | inverted `schedule.endDate < boundaryDate` to `>`, service.ts:567 (first mutation `startDate: tomorrow` to `today` at :517 was a no-op, 35 passed)      | rejects endDate that precedes the real (future) effective boundary                                                                                                                                                                                           |
| tests/integration/p020a-parameter-classification.test.ts | P-020A parameter classification > schema + migration                                    | 10    | 1     | prisma schema parameter_definition.data_classification + createParameter                                                                              | KEEP    | added `dataClassification: "GENERAL_HEALTH"` to createParameter create data, parameters.ts:684 area                                                     | leaves existing rows NULL and accepts no implicit default                                                                                                                                                                                                    |
| tests/integration/p020a-parameter-classification.test.ts | P-020A parameter classification > classifyParameter authority + transitions             | 196   | 11    | lib/coaching/parameters classifyParameter + listClassifiableParameterIds                                                                              | KEEP    | flipped `row.data_classification !== null` to `=== null` (already_classified guard), parameters.ts:879                                                  | owner classifies NULL → GENERAL_HEALTH with revision+1 + audit / coach classifies NULL → CYCLE / rejects reclassification and non-NULL transitions / concurrent classifications yield one success and one failure                                            |
| tests/integration/p020a-parameter-classification.test.ts | P-020A parameter classification > classify vs archive — genuine overlap                 | 121   | 2     | classifyParameter + archiveParameter row-lock serialization                                                                                           | KEEP    | flipped `row.status === "ARCHIVED"` to `!==` inside classifyParameter, parameters.ts:875                                                                | archive wins: both in flight; classify then gets parameter_archived with zero mutation/audit / classify wins: both in flight; archive then succeeds and preserves the classification                                                                         |
| tests/integration/p020a-parameter-classification.test.ts | P-020A parameter classification > classify vs publish race + snapshot persistence       | 310   | 4     | templates publishTemplate snapshotParameter + classifyParameter lock ordering                                                                         | KEEP    | snapshot field `dataClassification: row.data_classification` to `null`, templates.ts:428                                                                | publish after classification snapshots the classification and revision / classify wins the lock: overlapping publish fails closed on stale revision, then a re-saved draft snapshots the classification                                                      |
| tests/integration/p020a-parameter-classification.test.ts | P-020A parameter classification > universal duplicate-parameter publish rejection (#64) | 64    | 1     | publishTemplate duplicate-parameter invariant                                                                                                         | KEEP    | `new Set(allItemParameterIds).size !== length` to `===`, templates.ts:804                                                                               | rejects a draft referencing the same parameter twice, zero writes/audit                                                                                                                                                                                      |
| tests/integration/p020a-parameter-classification.test.ts | P-020A parameter classification > positional selection + fingerprint (in-transaction)   | 76    | 2     | classifyParameter in-tx fingerprint + boundedIndex resolution                                                                                         | KEEP    | `input.fingerprint !== expectedFp` to `===`, parameters.ts:869                                                                                          | a positional selection resolves to the parameter inside the mutation transaction / fails closed in-transaction on stale fingerprint and out-of-range index                                                                                                   |
| tests/integration/p021-daily-entry.test.ts               | P-021 DailyEntry > schema constraints                                                   | 201   | 5     | db/migrations/20261009230000_p021_daily_entry composite FKs, CHECK, uniques                                                                           | KEEP    | commented out `daily_entry_workspace_id_client_profile_id_entry_date_key` unique index in migration.sql:67 (fresh DB deploy); DB reset before and after | entry cardinality: one per (workspace, client, date)                                                                                                                                                                                                         |
| tests/integration/p021-daily-entry.test.ts               | P-021 DailyEntry > save lifecycle                                                       | 553   | 13    | lib/daily-entry/service saveDailyEntry + loadDailyEntrySurface + gate                                                                                 | KEEP    | flipped identical-resubmission no-op `canonicalHash === current.canonicalHash` to `!==`, service.ts:526                                                 | identical resubmission is a no-op: no revision, no audit / edit appends a new revision and repoints                                                                                                                                                          |
| tests/integration/p021-daily-entry.test.ts               | P-021 DailyEntry > daily-entry C2 impact provider                                       | 60    | 1     | lib/coaching/daily-entry-impact createDailyEntryImpactProvider                                                                                        | KEEP    | `COUNT(DISTINCT e.id)` to `COUNT(e.id)`, daily-entry-impact.ts:86                                                                                       | counts distinct entries once across superseded revisions                                                                                                                                                                                                     |
| tests/integration/p025b-checkin-instances.test.ts        | P-025-B check-in instances (real PG)                                                    | 1261  | 27    | lib/checkin/instances schedule/cancel/submit/getOwn/listOwn/listForClient/projectCheckInInstanceState                                                 | KEEP    | inverted late comparator `reference.getTime() > row.dueAt.getTime()` to `<`, instances.ts:126                                                           | late submission is allowed and marked late (#93)                                                                                                                                                                                                             |
| tests/integration/p025c-checkin-review.test.ts           | P-025-C check-in staff review (real PG)                                                 | 1118  | 19    | lib/checkin/instances readCheckInSubmissionDetail + markCheckInSubmissionReviewed                                                                     | KEEP    | replay status `"already_reviewed"` to `"reviewed"`, instances.ts:2446                                                                                   | assigned coach marks once: immutable provenance + CREATE audit; replay is idempotent / concurrent double-mark commits exactly one row + one audit                                                                                                            |
| tests/integration/phase-3-1-invite-acceptance.test.ts    | Phase 3.1 invite acceptance boundary (real PG)                                          | 313   | 6     | lib/workspace/invite-acceptance getInviteLinkState + acceptInvitationFromLink, invitations, tokens/store, password                                    | KEEP    | purpose check `!== "WORKSPACE_INVITE"` to `!== "PASSWORD_RESET"`, invite-acceptance.ts:52                                                               | peeks state without consuming; form state is ready only for active invites / returns invalid for consumed, revoked, expired, wrong-purpose, malformed / maps policy failures to safe copy and leaves no partial state                                        |

Per-file verdict lines:

- tests/integration/checkin-overview-i1.test.ts: KEEP-ALL
- tests/integration/habits.test.ts: KEEP-ALL
- tests/integration/p020a-parameter-classification.test.ts: KEEP-ALL (6 nested blocks, all KEEP)
- tests/integration/p021-daily-entry.test.ts: KEEP-ALL (3 nested blocks, all KEEP)
- tests/integration/p025b-checkin-instances.test.ts: KEEP-ALL
- tests/integration/p025c-checkin-review.test.ts: KEEP-ALL
- tests/integration/phase-3-1-invite-acceptance.test.ts: KEEP-ALL

## Could not check

None. Every non-trivial block got a real mutation run; every KEEP row has at least
one of its own tests failing under the mutation.

Anomalies:

- habits.test.ts first mutation (`startDate: tomorrow` to `today` in editHabit,
  service.ts:517) was a no-op: 35/35 still passed. Aimed second mutation killed
  1 own test.
- p020a mutation runs on guard flips make the concurrency-harness tests retry
  and stall; two runs took 127s and 248s wall time instead of the usual ~8s.
  Counts still recorded correctly.
- p021 "schema constraints" needed a migration-file mutation; because
  `prisma migrate deploy` only applies pending migrations, the DB was dropped
  and recreated before and after that one run so the mutated DDL was deployed
  and then the schema was restored clean.
- I00.md lists p021-daily-entry at 1070 lines / 17 tests; the pinned commit has
  19 tests (file grew since pass 1).

## Self-check

- file count: 7/7 baselined, all with INTEGRATION_DATABASE_URL set (real pass
  counts in banners, none skipped).
- block count: 14 rows (p020a and p021 split into nested blocks that target
  different code; other 5 files are one top-level block each).
- every KEEP row has a failing mutation with named failed tests above.
- worktree clean: `git status --porcelain` empty at end.
- writes limited to this output file and /tmp scripts+logs
  (/tmp/tb1-w1-mutate.sh, /tmp/tb1-w1-_.log, /tmp/tb1-w1-_.out).
- DB: only app_tb_tb1_w1 touched; left recreated and clean.
