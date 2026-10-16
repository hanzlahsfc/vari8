# CHECK-IN-RECURRENCE-I1 — bounded weekly scheduling (task record)

Contract: `CHECK-IN-RECURRENCE-P3-plan.md` (SHA `b560cda2…`, 263 lines) +
P3-R1 PASS refinements (`c37cba13…`, 76 lines). Owner-approved bounded
first version only; synthetic/testing boundaries; no production/flag/
deploy authorization.

## Implementation plan (written before code)

Paths:

- `db/schema.prisma` — `CheckInScheduleRule` model, `CheckInScheduleRuleStatus`,
  `CheckInWeekday` enums; `CheckInInstance` + `originRuleId`/`occurrenceDate`;
  coherence uniques/indexes. New migration `db/migrations/<ts>_checkin_recurrence_i1/`
  with raw CHECKs + composite coherence FK.
- `lib/checkin/timezone.ts` — IANA validation, `localDateInZone`,
  `resolveLocalInstant` (two-pass offset + fold→earlier + crossing-detection
  gap→first-valid ≤180 min; sub-day only; whole-day skip → unrepresentable).
- `lib/checkin/schedules.ts` — `createCheckInScheduleRule` (atomic
  `replacesRuleId` end+create), `setCheckInScheduleRuleStatus`
  (pause/resume/end), `generateCheckInScheduleRuleInstances`,
  `listCheckInScheduleRules` (read). Reviewed lock order; two bounded
  pre-queries classify generated/conflict/new; audits last;
  `scheduledByMemberId` = current actor.
- `lib/checkin/instances-boundary.ts` — closed-vocabulary wrappers.
- `app/.../clients/[clientProfileId]/checkins/actions.ts` + new
  `components/checkin/schedule-rules.tsx` + page section.
- `lib/audit.ts` — `checkin_schedule_rule` resource type.
- Tests: `tests/unit/checkin-schedule-timezone.test.ts`,
  `tests/unit/checkin-schedules.test.ts`,
  `tests/integration/checkin-recurrence-i1.test.ts`,
  `tests/e2e/checkin-recurrence.spec.ts`.

Commands (gates): `npm run format:check`, `npm run typecheck`,
`npm run lint`, `npx prisma validate` + `migrate diff` drift check,
`npm run test`, `INTEGRATION_DATABASE_URL=… npm run test:integration`,
`npm run build`, focused + full `npm run test:e2e` on disposable DBs.

Acceptance: contract §8 — RED→GREEN with the full behavioral matrix;
fresh + base→candidate migration proofs; no read-path writes/audits;
truthful batch outcomes; horizon `T..T+56` inclusive (≤9 occurrences).

## Status log

- 2026-10-16: branch `feature/checkin-recurrence-i1` from verified
  `origin/main` `18d9f6f`; contracts re-read (instances.ts protocol,
  boundary, actions, page, schema, migrations, rbac, audit, tests).
- 2026-10-16: RED-A committed `92ffcfe` (timezone + enumeration unit
  tests fail on missing modules). Schema+ migration committed `61a3280`
  — enums, `CheckInScheduleRule` (unique `replacedByRuleId`), instance
  `origin_rule_id`/`occurrence_date`, paired-null CHECK, composite
  coherence FK; hand-authored migration (migrate diff can't see raw
  constraints); fresh + base→candidate deploys identical.
- 2026-10-16: RED-B committed `c7a66a5` (17-test integration + E2E spec).
  GREEN committed `cd6df45`: `timezone.ts` (crossing-detection gap,
  fold→earlier, ≤181-min bounded scan, whole-day→unrepresentable,
  2000–2100 bounds), `schedules.ts` (create/pause/resume/end/replace/
  generate/list; two pre-queries → created/alreadyGenerated/
  skippedConflicts; audits last; current-actor `scheduledByMemberId`),
  boundary wrappers, server actions, `schedule-rules.tsx` UI section.
  Unit 26/26; integration 17/17.
- 2026-10-16: theme.test.ts failure was a `#114` comment in actions.ts
  matching the hex regex — comment reworded; suite green 1282/1282.
  E2E locator disambiguation committed `a772519`.
- 2026-10-16: Mutation sweep on `rec_i1_it` disposable DB: M1–M7, M9,
  M12–M15 bit immediately. No-bites closed with coverage — M8
  (assigned-assistant write denied), M10 (per-instance CREATE audit
  count), M11 (`now`-dep past-instant exclusion) → `9f97e12`, 18/18
  green. Honest no-bite: M16 alternate advisory namespace is
  unobservable through serialized-outcome tests (the advisory is a
  transaction-internal serialization mechanism; outcome-equivalent).
- 2026-10-16: decision #114 appended to `docs/product-decisions.md`.
