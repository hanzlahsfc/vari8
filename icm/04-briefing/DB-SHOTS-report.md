# DB-SHOTS — screenshot evidence lane

Lane of `icm/04-briefing/DB-brief.md`. Captures the real canvas screens as PNG/WebP
plus readiness-annotated copies, so the briefing assembly lane has evidence for every
surface of the gap matrix.

## How it was produced

- Server: `npx next dev --webpack --hostname 127.0.0.1 --port 3420` from
  `/home/nexuslink/vari8-worktrees/merge-proto/frontend` (branch `proto/merge-frontend`,
  HEAD `58eb6ed`).
- Capture: Playwright + system Chromium (`/usr/bin/chromium`), 1440x900 viewport,
  script run from `/tmp` (scratch, not a deliverable).
- Screens and click paths replayed from `icm/02-gap-matrix/output/R3/G5.md` /
  `G5-census.mjs` crawl nodes; Ethereal studio reached via its hash routes.
- Annotation: for each screen, visible on-page text was matched against the
  `element` strings of that surface's rows in `icm/02-gap-matrix/output/viz/matrix.json`.
  Matched elements got a 2px outline plus a small `<status> · <row-id>` label.
  On screens where a native modal (`dialog.showModal()`/popover) is open, matching is
  restricted to that top-layer element and the overlay itself renders in the top layer —
  otherwise the marks would be hidden behind the dialog's backdrop.
- Sizes: files kept under 400 KB; three dense screens were saved as WebP instead of PNG
  (`s08-builder`, `s08-builder-annotated`, `s10-mealplan-studio-annotated`).

### Legend

| Colour | Matrix status    | Label wording |
| ------ | ---------------- | ------------- |
| amber  | UNCONFIGURED     | `switch on`   |
| blue   | UNWIRED          | `connect`     |
| violet | PARTIAL          | `reshape`     |
| red    | MISSING          | `build`       |
| pink   | CONFLICT / ROLES | `your call`   |

## Output

70 files + `index.json` in `icm/04-briefing/shots/` — one clean and one annotated
image per screen. `index.json` maps each shot to surface, screen name, route, click
path, and the matrix rows matched (id, status word, element count). 249 row
matches across all screens; 0 page errors.

| Surface                            | Shots | Files (clean stem)                                                                                                               |
| ---------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| S01 coach shell · roster · profile | 6     | `s01-roster`, `s01-profile-overview`, `s01-profile-plans`, `s01-profile-checkins`, `s01-profile-notes`, `s01-profile-onboarding` |
| S02 messages · notes · media       | 4     | `s02-messages`, `s02-thread`, `s02-thread-attachments`, `s02-notes-todos`                                                        |
| S03 check-ins                      | 3     | `s03-checkins-board`, `s03-add-extra`, `s03-checkin-review`                                                                      |
| S04 habits                         | 2     | `s04-habit-editor`, `s04-template-habits`                                                                                        |
| S05 templates · setup              | 4     | `s05-templates`, `s05-template-editor`, `s05-tracker-setup`, `s05-client-setup`                                                  |
| S06 nutrition                      | 2     | `s06-mealplan-editor`, `s06-template-nutrition`                                                                                  |
| S07 training                       | 2     | `s07-training-editor`, `s07-exercise-library`                                                                                    |
| S08 dashboard builder              | 3     | `s08-builder`, `s08-widget-gallery`, `s08-template-dashboard`                                                                    |
| S09 client tracker                 | 4     | `s09-tracker-today`, `s09-tracker-week`, `s09-tracker-trends`, `s09-tracker-config`                                              |
| S10 appearance · Ethereal studio   | 3     | `s10-appearance`, `s10-clients-studio`, `s10-mealplan-studio`                                                                    |
| S11 identity · access              | 2     | `s11-preferences`, `s11-client-preview`                                                                                          |

## Notes for the assembly lane

- Match counts are _visible-text_ matches: a row counts only if its element text is
  actually rendered on that screen. Low counts (e.g. `s06-template-nutrition` 0/29,
  `s08-builder` 2/43) mean the surface's rows live on other screens or are not
  text-visible in the canvas — not a capture failure.
- `s06-template-nutrition` annotated copy is byte-identical to its clean copy: zero
  rows matched, so nothing was outlined. Expected.
- Modal screens (`s05-client-setup`, `s03-add-extra`, `s09-tracker-*`, `s11-*`)
  annotate only elements inside the open dialog — rows visible on the page behind the
  backdrop are intentionally not marked.
- The Next dev overlay (`nextjs-portal`) is removed before capture; it is tooling
  chrome, not canvas UI.

## Self-check

- [x] Every surface S01–S11 has ≥1 shot (counts above; all 35 captures reported `OK`).
- [x] All 70 image files exist, decode as valid PNG/WebP (verified via `sharp`), and
      are ≤400 KB (smallest 32 KB, largest 398 KB).
- [x] `shots/index.json` parses; 35 entries; each maps file → surface, screen, route,
      click path, matched rows.
- [x] Annotated copies differ from clean copies wherever ≥1 row matched (md5-checked;
      only the 0-match shot above is identical).
- [x] Dev server killed: `kill 179074`; port 3420 free; no `next` processes remain.
- [x] merge-proto tree clean: `git status --short --branch` →
      `## proto/merge-frontend...origin/main [ahead 11]`, no modified/untracked files.
      Next's runtime append to `frontend/AGENTS.md` was restored from the pre-start
      backup. HEAD still `58eb6ed`.
