# P-022 — Read-only staff DailyEntry review: planning, review chronology, and decision record

Documentation-only task. This record captures the complete P-022 planning
and review chronology and the owner's three approved decisions (#79–#81)
plus the binding engineering contract. **Staff DailyEntry review remains
unimplemented; nothing here authorizes implementation.**

## Verified starting state (2026-10-09)

- `origin/main` = `eea87ae6d3e420a89a9af378fab448b296022084` — the P-021
  merge commit (PR #23, MERGED; parents `2d9bfc8` + reviewed head
  `cca5d76`). Main CI run `37836730067`, job `113515536636`, SUCCESS on
  `eea87ae`. Remote branches: `main` only. Protection: strict `verify`,
  `enforce_admins`, force-push/deletion blocked.
- Nothing deployed; `ENABLE_DAILY_ENTRY` default-off; production consent
  registry unconfigured/fail-closed.
- #78 was the latest recorded product decision; new decisions are #79–#81.

## Current capability and gap

Merged on main: client-only DailyEntry save/edit/history under the dev
gate; append-only immutable revisions behind a current-revision pointer;
composite workspace/client/pin/version coherence; consent-gated reads and
writes (fail-closed); the `daily-entry` C2 transition-impact provider;
audit on mutations only. **No staff read path exists** — clients can log
data that no authorized coach can view; the coaching loop is one-sided.

## Planning and review chronology

1. **P-022** (Devin SWE-2 High) — initial read-only staff-review plan.
2. **P-022-R1** (`opencode-go/deepseek-v4.1-flash`) — **CONDITIONAL PASS**,
   no P0/P1. Findings: the owner package reopened settled RBAC policy
   (assistant inclusion — already resolved by the approved `dailyTracking`
   cell + #69), framed engineering choices as owner decisions
   (entry-point shape, gate wiring), framed settled terminal-assignment
   behavior as a choice, and omitted the client-facing privacy-notice
   question; plus P3s on assistant-assignment operationality, the
   module-private consent helper, unbounded list payload, and
   force-dynamic/no-store.
3. **P-022-R2** — corrected replacement: settled authorization recorded
   verbatim; exactly three owner choices (revision depth, staff-read
   audit, privacy disclosure); bounded header-only list + per-entry
   detail; consent seam kept module-internal; no-migration assessment.
4. **P-022-R2-R1** — **CONDITIONAL PASS**, no P0/P1. All R1 findings
   substantively resolved. One new bounded P2: the read-audit promise had
   no mechanism distinguishing explicit detail access from prefetch,
   refresh, back/forward, or RSC re-execution. Plus immaterial tracker
   citation and input-convention P3s.
5. **P-022-R3** — named the mechanism: header-only list GET (no audit) +
   explicit `useActionState` Server Action "View details" POST containing
   the detail read + audit in one transaction; honest at-least-once POST
   semantics; no detail-bearing GET; audit meta reduced to
   `{changed:false}`.
6. **P-022-R3-R1** — **CONDITIONAL PASS**, no P0/P1. Mechanism verified
   against the stack. One new bounded P2: the action authorized
   _outside_ its transaction — membership/role/assignment needed
   revalidation inside the same Serializable transaction as the value
   read and audit write (TOCTOU).
7. **P-022-R4** — final bounded correction: full transaction-bound
   authorization sequence with the P-021 lock discipline (`csetup` →
   `member` advisories → member row `FOR UPDATE` → in-tx `authorize` →
   assignment row `FOR UPDATE` → client profile `FOR UPDATE` → consent
   rows `FOR UPDATE` in kind order → entry/pointer/snapshot → audit →
   commit); deadlock analysis against `removeClientAssignment` and
   invite-acceptance paths; bounded fresh-transaction retry.
8. **P-022-R4-R1** — **PASS**, no P0/P1/P2, by
   `opencode-go/deepseek-v4.1-flash`. One immaterial P3 (tracker hash
   citation in the planning artifact's metadata table) and one
   implementation note (the `authorize` context does not expose the
   assignment id — re-resolve via `getActiveAssignment` before
   `FOR UPDATE`) remain as record-keeping details.
9. **Owner approval** — all three decisions approved as recommended;
   documentation-only record authorized.

## Approved decisions (#79–#81 in product-decisions.md)

- **#79 Staff revision depth.** Staff see latest revision + revision
  count only; superseded answer values withheld this slice; client
  history unchanged; minimization, not deletion.
- **#80 Staff-read audit.** One structural `READ` audit per committed
  explicit View Details action; never on GET/list/prefetch/rerender;
  meta `{changed:false}` only; at-least-once POST semantics accepted;
  retry idempotency deferred; audit+detail commit or fail together.
- **#81 Privacy disclosure gate.** Client-facing disclosure of staff
  visibility required before production enablement; wording not
  invented; does not block dev-only implementation.

## Settled authorization (verbatim from the approved matrix)

Owner `workspace`-read; coach `assigned`-read; assistant `assigned`-read
(operational via `COACH`-role `ClientAssignment`); client `own` only and
denied the staff route; `SUPPORT` denied; platform role alone denied;
dual-role `PLATFORM_ADMIN` evaluated through an eligible ACTIVE
membership; `REMOVED` assignment ends coach/assistant access; owner
workspace scope continues; retained data is not an access grant.

## Binding engineering contract

Route `/workspace/[workspaceId]/clients/[clientProfileId]/daily` under
the staff layout; roster link entry point; `force-dynamic` + route-scoped
`Cache-Control: no-store` (incl. the action POST — the `/reset` pattern);
existing mode resolver, no new flag; non-persistent modes reveal nothing.
Detail action: outside-tx only mode/session/bounded syntax (+ optional
non-authoritative early denial); inside one Serializable tx the full
ordered lock-and-revalidate sequence above; in-tx `authorize` is
authoritative; `clientProfileId` accepted as untrusted selection, never
authority. No schema/migration/dependency/allowlist change; existing
indexes suffice; snapshot rendering per revision's own
`templateVersionId`; audit writer runs last inside the same transaction.

## Concurrent-behavior evidence required at implementation time

Held membership-revocation, assignment-removal, and consent-revocation
races with deterministic ordering; zero values/zero audit when the
mutation wins; atomic detail+audit when the read wins; audit-failure
rollback; no deadlock; zero audits from GET/prefetch/rerender;
second committed POST → second audit (at-least-once asserted honestly).

## Test-first plan (summary)

Disposable-PostgreSQL integration first (all roles/scopes, consent
states, races above, pagination bounds, pointer incoherence, payload
bounds, snapshot-after-transition); then production-build browser
coverage (roster→detail flow, direct-URL negatives, 1440/834/390,
keyboard/focus/touch/overflow, no-store headers, zero values in denied
responses); full regression suite; independent different-model review
before any PR. No test-count target; no new dependency.

## Exclusions

No staff writes/corrections (D-14 open); no aggregates/trends/charts/
dashboards/alerts/exports; no C3/C4; no cycle/CALORIES/specialist
surfaces; no retention/erasure/export (D-10); no production enablement,
real-client data, or deployment; no schema/dependency/flag/nav changes.

## Status

Documentation complete. No schema, code, tests, flags, PR, merge,
implementation, production enablement, or deployment is authorized.
