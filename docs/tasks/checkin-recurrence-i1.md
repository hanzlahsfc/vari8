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
