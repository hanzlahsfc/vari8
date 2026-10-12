# FRONTEND-INTEGRATION-I2 — client Home navigation (decision #106)

Owner-authorized bounded slice: Lily-styled navigation cards to existing
client routes only — no data cards, no aggregates, no selection rules.

- Route `/workspace/[ws]/home` under `(tracker)` — same dual-role shell
  admission as daily/check-ins/onboarding; page loads zero data.
- Cards: Daily tracking (+its history), Onboarding (gated), Check-Ins
  (gated; calendar lives on that page). Staff see the staff chrome + a
  client-surface note; cards render only for CLIENT members.
- "Home" link added to the three client navs.
