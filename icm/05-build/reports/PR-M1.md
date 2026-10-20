# PR-M1 report

Card `icm/05-build/cards/pr-m1-client-lifecycle.md`, issue #105, PR #106.
Branch `beta/pr-m1-client-lifecycle`, base `f00d37b` (merge base with
`origin/Vari8-Beta`). Gate-verified head: see the gate summary below; this
report is committed after that head and changes no product code.

## What changed

- `lib/workspace/roster-query.ts`: `rosterClientVisibility(includeArchived)`,
  the one place the roster's "hide archived" predicate (D27) is defined.
- `lib/workspace/clients.ts`:
  - `ClientProfileDetail` + `readClientProfileDetail`: the full canvas profile
    field set (name, `label`, `coachingSince`, `heightCm`,
    `priorityMessagesAllowed`, `archivedAt`, `archiveReason`).
  - `updateClientProfileFields`: staff write of the canvas fields; `null`
    clears nullable columns, per-field validation, CLIENT `own` scope refused.
  - `archiveClientProfile` / `restoreClientProfile`: soft archive pair writes
    (D27), idempotent (`changed: false` on no-op), staff only, structural
    audit event on every real transition.
  - `listAccessibleClientProfiles` gained `includeArchived` (default: hide
    archived). `buildClientProfileWhere` keeps its old default for the two
    pre-existing non-roster callers; the roster passes the flag.
- `lib/workspace/retention.ts` (new): `retentionCutoff` / `retentionElapsed`
  (inclusive boundary, literal case in tests) and `deleteClientProfile`:
  refuses `client_not_archived`, `retention_not_elapsed` (inside
  `workspace.retentionDays`, default 90), `client_not_deletable` (RESTRICT
  dependents), then deletes the row and writes one DELETE audit event in the
  same transaction.
- `lib/workspace/roster.ts`: the `/api/v1` roster read hides archived
  profiles by default (`includeArchived` opt-in).
- `lib/audit.ts`: `client_profile` added to the audit resource allowlist
  (outside the card's file list; required for the D27 delete audit).
- `scripts/seed/20-clients.seed.ts` (new): syncs `label`, `coachingSince`,
  `heightCm`, `priorityMessagesAllowed` onto the 15 seeded profiles from the
  canvas demo state (`frontend/src/data/mock-data.json`; priority flags per
  `model.ts` seedState indices 0 and 4). All demo clients are
  `archived: false` in the canvas, so the archive pair stays unset.
- Tests: `tests/integration/m1-client-lifecycle.test.ts` (10 tests, real
  Postgres); `tests/unit/clients-service.test.ts` expectation updated for the
  new default archived filter.

## Commands and exit codes

Gate log: `/home/nexuslink/vari8-worktrees/pr-m1-client-lifecycle.check.log`.

| Command | Exit | Result |
| ------- | ---- | ------ |
| `npm run typecheck` | 0 | clean |
| `npx eslint` (changed files) | 0 | clean |
| `npx prettier --check` (changed files) | 0 | clean after format |
| `npm run index` + `index:check` | 0 | regenerated SYMBOLS committed |
| `vitest run tests/unit/clients-service.test.ts` | 0 | 6/6 |
| `vitest run --config vitest.integration.config.ts tests/integration/m1-client-lifecycle.test.ts` | 0 | 10/10 |
| `npm run db:fresh` on `app_m1` (skip-catalogs) | 0 | 15 profiles seeded with canvas fields |
| `verify-local.sh` BASE_SHA=f00d37b LANE_DB=app_m1 LANE_PORT=3850 CARD=PR-M1 | TBD | see PR comment |

## Live check

Evidence: `/home/nexuslink/vari8-worktrees/_evidence/PR-M1/build/`.
The sign-in credential was granted directly on the throwaway lane DB
(seed credential workaround until SEED-FIX merges; `live-user.log`).
The app ran on port 3850 against a migrated and seeded `app_m1`; the owner
signed in through the real login form and the proof drove
`GET /api/v1/workspaces/<id>/clients` in a real browser at 1440x900 and
390x844. The acceptance flow:

- `proof-before-archive.json` + `owner-before-archive-{1440,390}.png`:
  HTTP 200, 15 clients.
- `step-archive.log`: `archiveClientProfile` on "Oliver Stone" ->
  `changed: true`, roster-visible 14.
- `proof-after-archive.json` + `owner-after-archive-{1440,390}.png`:
  HTTP 200, 14 clients, the archived name absent (archive hides a client
  from the roster query).
- `step-delete-early.log`: `deleteClientProfile` while inside the 90-day
  window refused with `retention_not_elapsed`.
- `step-restore.log` + `proof-restored.json` +
  `owner-restored-{1440,390}.png`: restore `changed: true`, back to 15.
- `step-age.log` + `step-delete.log`: after `archived_at` was moved past the
  retention window on the throwaway DB, delete returned `changed: true`;
  `proof-after-delete.json` + `owner-after-delete-{1440,390}.png`: HTTP 200,
  14 clients, the row gone.
- `step-audit.log` (psql): four `client_profile` events on the deleted id -
  UPDATE/ARCHIVED, UPDATE/ACTIVE, UPDATE/ARCHIVED, DELETE/REMOVED, all ALLOW.
- `proof-signed-out.json` + `signedout-{1440,390}.png`: the same roster call
  without a session returns HTTP 401 at both widths.

The browser-visible surface is the `/api/v1` roster JSON (no roster UI is
wired on this branch; the roster page belongs to PR-W2).

## Parity

D32 parity: no screens are owned by this card. The parity regression step of
the gate is expected to stay green (harness present on the branch).

## Matrix rows closed

None (foundation/service PR per the card).

## Decisions and boundaries (unproven or open items are labelled)

- Staff-only lifecycle: `authorize` resolves CLIENT writes to `own` scope on
  `clientProfiles`; archive/restore/delete/field-writes refuse `own` (D15 row
  "Invite a client, archive and delete a client": owner and coach allow,
  client deny). A coach still needs an ACTIVE assignment under the current
  matrix (PR-05 rewrites the capability table to D15).
- Delete is a hard delete of the `client_profile` row after the retention
  gate. Every client-scoped dependent FK is RESTRICT (PR-M0), so a profile
  with dependent records refuses with `client_not_deletable`; the audit event
  is not written and nothing is deleted (tested). Erasure of the dependent
  records themselves is the parked retention/erasure policy (D12,
  product-decisions D-10), not this card.
- "Ending a membership archives the client" (D27) has no seam yet: no
  membership-end service exists in `lib/` (`WorkspaceMember` status
  transitions are not mutated anywhere outside invitations). When a
  member-removal path lands (PR-SV4/PR-W2 area), it calls
  `archiveClientProfile`.
- Archive/restore audit events are new (the card requires delete audited;
  archive and restore get the same structural treatment since they change
  staff-visible state).
