# FRONTEND-INTEGRATION-I4 — client Home due-Check-In card (decision #107)

## Scope note (pre-edit)

- Files: `lib/checkin/instances.ts` (`getOwnNextCheckInInstance` +
  `OwnNextCheckInInstance` type), `lib/checkin/instances-boundary.ts`
  (gate-first `readOwnNextCheckInInstance`), Home `page.tsx` (card),
  `tests/integration/i4-next-checkin.test.ts`,
  `tests/e2e/home-next-checkin.spec.ts`, decision/task/STATUS records.
- Reused protocol: identical own-scope path as `listOwnCheckInInstances`
  — server-resolved own `ClientProfile` rebind → `lockedAuthorize`
  (`chkin:*` + `member` advisories → member FOR UPDATE → in-tx
  `authorize(checkinInstances/read)`) → `grantedScope === "own"`.
- Query: single `checkInInstance.findFirst` —
  `cancelledAt IS NULL AND cancelledByMemberId IS NULL AND
submissions: none` (projector-equivalent to derived SCHEDULED) →
  `ORDER BY dueAt ASC, id ASC` → `findFirst` (equivalent LIMIT 1).
  Filtering is fully in-SQL;
  overdue precedes future by dueAt order.
- Returns `{ instanceId, formName, dueAt, late }` — header-only, no
  answers/identities/aggregates; passive read, no audit (same as the
  existing own-header list path).
- Empty → `next: null` → "No unfinished Check-Ins" card (links to the
  list); non-ok → card hidden (never a fabricated empty state);
  flag off → card absent (mirrors nav gating); destination
  re-authorizes current state — stale links cannot bypass it.

## Evidence

- RED: integration spec predates implementation; first failure was the
  missing export (type-level RED), then fixture corrections — 7/7 GREEN
  on real disposable PG (`i4_int`).
- Mutation battery on `getOwnNextCheckInInstance`:
  - M1 remove `submissions:none` → 2 fails (submitted/reviewed picked)
  - M2 remove cancellation exclusion → 2 fails (cancelled picked)
  - M3 reverse order → 2 fails (latest/wrong winner)
  - M4 post-limit client-side selection → bound test fails
  - M5 remove `grantedScope==="own"` gate → NO BITE: own-profile
    rebinding already confines the target; the check is defense-in-depth
    parity with the list path, kept deliberately
  - M6 remove `clientProfileId` predicate → foreign test fails
  - All restores sha-verified byte-identical.
- E2E `home-next-checkin.spec.ts` 4/4 (browser): overdue card + detail
  link, earliest-future + cancelled excluded + truthful empty state,
  flag-off/staff hiding, keyboard focus + light theme at 390.

## I4-R2 (review P3-1) — scope-barrier regression coverage

Independent review P3-1: the prior owner-denial case failed at profile
rebinding (owners have no clientProfile), so `grantedScope === "own"`
was uncovered. New fixture: a WORKSPACE_OWNER who also owns a coherent
clientProfile with an eligible instance — rebinding succeeds and the
scope gate is the only barrier. Verified: unmodified service denies
(AccessDeniedError), zero result/audit/write; removing ONLY the gate
makes the forbidden principal read the instance (mutation BITES);
restore byte-identical. This is coverage hardening — no production
vulnerability was found or repaired. `findFirst` wording corrected
(P3-2). "Overdue" vs list "Late" wording difference stays disclosed
(P3-3 — UI unchanged in this task).
