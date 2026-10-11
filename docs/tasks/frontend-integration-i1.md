# FRONTEND-INTEGRATION-I1 — Lily visual treatment on client DailyEntry

Owner-approved slice (decision #105): restyle the persistent client
DailyEntry panel + bounded history with Lily's tracker look; add a
declared-date picker with prev/next controls (`parseDeclaredDate`
bounds); week-grouped history (presentation only); existing fonts; no
shell changes. No autosave, localStorage, mode toggle, aggregates,
coach comments, or staff edits.

## Files

- `app/(tracker)/workspace/[workspaceId]/daily/page.tsx` — accepts
  `?date=` via `searchParams`, runs `parseDeclaredDate` (invalid →
  `role="alert"`, panel not rendered), passes `entryDate` to
  `loadDailyEntrySurface`.
- `app/(tracker)/workspace/[workspaceId]/daily/daily-entry-panel.tsx` —
  Lily-derived `de-*` markup: `DailyDateNav` (prev/next Links +
  `type=date` picker; `confirm()` guard on unsaved edits), `de-card`
  sections, `de-cell` inputs, `de-week` history groups. Save contract
  (`formToken` + `v{ordinal}` → `saveDailyEntryAction`) unchanged.
- `lib/daily-entry/week-groups.ts` — pure Monday-start grouping of the
  bounded history, UTC-naive declared-date math.
- `app/globals.css` — `de-*` styles on existing theme tokens; no hex,
  no new fonts/deps; `prefers-reduced-motion` covered.
- `tests/unit/daily-week-groups.test.ts`, `tests/e2e/daily-entry-lily.spec.ts`.

## Known limitation (pre-existing, out of scope)

At <390 px the structural `DailyTrackerShell`/page header overflows the
viewport (pre-dates this slice; the owner scoped restyle to the panel
only). The `de-*` subtree itself never overflows its container.

## Gates

Pending at branch head — see builder report.
