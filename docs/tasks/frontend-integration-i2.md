# FRONTEND-INTEGRATION-I2 — client Home navigation (decision #106)

Owner-authorized bounded slice: Lily-styled navigation cards to existing
client routes only — no data cards, no aggregates, no selection rules.

- Route `/workspace/[ws]/home` under `(tracker)` — same dual-role shell
  admission as daily/check-ins/onboarding; page loads zero data.
- Cards: Daily tracking (+its history), Onboarding (gated), Check-Ins
  (gated; calendar lives on that page). Staff see the staff chrome + a
  client-surface note; cards render only for CLIENT members.
- "Home" link added to the three client navs.

## R2 — independent-review coverage repair

- **P2-1 fixed:** new E2E covers the layout's non-CLIENT else-branch —
  an ACTIVE SUPPORT member (no `workspaceSettings/read`, verified in
  `rbac.ts:74-79`) reaches the role check and receives 403 + zero cards.
  A second test covers an inactive (REMOVED) membership on a foreign
  workspace (task-owned row, deleted after the test).
- **Mutation:** removing `member.role !== "CLIENT"` from the layout
  else-branch makes the SUPPORT test fail (admitted, no 403) while the
  other 6 pass — the exact branch the review required. Restored
  byte-identical (sha `ac104233…` unchanged); production files are
  byte-identical to `62bd595` — this is coverage hardening, not a
  production-behavior fix.
- **P3-1 assessed, code unchanged:** the page's `isClient` reads
  `role` only — the layout is the authoritative admission (session →
  staff-or-CLIENT-member) and runs first; the page check is a
  presentation switch, not a security boundary. Documented, not changed
  (prompt instruction).
- **P3-2 fixed** by the inactive/foreign test above.
- **P2-R1 disposition:** the P2-1/2/3 findings from the whole-UI
  review remain resolved by scope (no data cards); not re-litigated.
