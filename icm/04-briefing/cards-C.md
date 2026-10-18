# Vari8 briefing cards, lane DB-WORDS-C (S08 to S11)

## Dashboard builder
Verdict: Far from working: the editor can already save a layout on the backend, but most widgets need data services that do not exist yet, and the switch that turns the dashboard on is off.
Readiness: switch on 4 · connect 11 · reshape 9 · build 18 · your call 1
What works already:
- Layout store and validator: the client dashboard table (db/schema.prisma, ClientDashboardLayout) and the config checker (lib/dashboard/config-schema.ts). They accept the same draft shape the editor produces.
- Save path with autosave, a revision check and an unsaved-changes guard (lib/dashboard/service.ts, lib/dashboard/autosave-coordinator.ts, lib/dashboard/navigation-guard.ts).
- Five widgets already have a data source declared in the backend: client tasks, check-in status, quick links, today's habits and habit consistency (lib/dashboard/config-schema.ts).
The real work:
- Most of the new work is data. Bodyweight, nutrition, workouts, steps, sleep, recovery, roadmap and coach feedback each need a read service that checks the viewer's role (new feed files under lib/dashboard/).
- Every widget needs a staff or client visibility setting, and the backend also requires labels and a history period. The editor sends none of them (lib/dashboard/config-schema.ts, frontend/src/components/coach/builder/gallery.tsx).
- The canvas keeps one layout per template, the backend keeps one per client. The owner picks which, and the choice changes lib/dashboard/service.ts and db/schema.prisma.
Blocked on you:
- The editor draws habit consistency as a percent fill. The product rule allows counts only. Keep counts only, or allow a percent ring?
Start here: PR-W9 (depends on PR-M9, PR-SV3 and PR-W1). First file: lib/dashboard/config-schema.ts, which PR-M9 changes first.
Screenshot: /ethereal#dashboard, then click "Add widget" to open the gallery. Click "Client preview" at the top of the editor for the preview.

## Client tracker
Verdict: Halfway there: the backend can store daily numbers, but the week and trend views need a numeric read path that does not exist yet, and the coach preview runs on made-up data.
Readiness: switch on 5 · connect 1 · reshape 16 · build 9 · your call 4
What works already:
- Daily entry store with dated entries and append-only revisions (db/schema.prisma, DailyEntry, DailyEntryRevision, DailyEntryRevisionValue), written by lib/daily-entry/service.ts.
- Monday-first week grouping already exists (lib/daily-entry/week-groups.ts).
- Each field's current value for today is readable (loadDailyEntrySurface in lib/daily-entry/service.ts), though as formatted text, not numbers.
The real work:
- Week and Trends need typed numbers for each field and each date. The read path returns formatted text today, so a numeric series read goes into lib/daily-entry/service.ts.
- The template has no place for units, field options, rating scales, the four summary fields or the cycle toggle. Add them to the parameter definition in db/schema.prisma (ParameterDefinition).
- Composite answers (multi-choice with a note, location with a rating, context Yes/No with a note) need a new value kind or an approved text format (db/schema.prisma, ParameterKind and DailyEntryRevisionValue).
Blocked on you:
- The security doc says no, and the canvas shows it. Part of the roles decision, which blocks all wiring: should a client see a coach's note under a tracker field?
- The product rule forbids inventing a time format. Hide the weigh-in, bedtime and wake-time fields until one is approved, or approve a format now?
Start here: PR-W4 (depends on PR-SV2, PR-W3 and PR-W1). First file: lib/daily-entry/service.ts, where the numeric read goes.
Screenshot: /ethereal#tracker, the Tracker page (opens on Today, switch to Week or Trends in its header). Coach preview: /coach, click Clients, open a client, then the tracker Preview button.

## Appearance and the Ethereal studio
Verdict: Far from the real backend: light or dark mode and the accent colour live only in the browser, and the studio is a design sandbox on made-up data, so no server model stores any of it yet.
Readiness: switch on 3 · connect 3 · reshape 5 · build 10 · your call 0
What works already:
- Dashboard store and validator shared with the coach builder (lib/dashboard/config-schema.ts, ClientDashboardLayout in db/schema.prisma). Saving the studio dashboard needs little new backend.
- Light and dark mode is already allowed as a browser-only setting (docs/STATUS.md, the browser-local decision).
- Dashboard access rules exist (lib/auth/rbac.ts, clientDashboards): the owner and assigned coach edit, and the client sees their own subset.
The real work:
- Accent, logo and font have nowhere to live on the server. Add a workspace preference model (db/schema.prisma) and a new service under lib/workspace/.
- Two appearance systems exist: the coach preferences record (frontend/src/components/coach/model.ts) and the studio's own state (frontend/src/lib/ethereal-appearance.tsx). Pick one before wiring, or the screens will disagree.
- Most of the studio is specimens, primitives and sample data (frontend/PROJECT_CONTEXT.md). Wiring them has no product value, so decide which parts ship first.
Blocked on you:
None on this screen. Two owner choices reach it: where accent and logo are saved, and whether the studio ships at all. Both are in the decisions section.
Start here: PR-W10 (depends on PR-M2, PR-M3 and PR-W1). First file: db/schema.prisma, where PR-M2 adds the preference model.
Screenshot: /coach, click "Workspace preferences" on the coach's name in the sidebar for the light, dark and accent controls. Studio: /ethereal#appearance.

## Sign-in, roles and who sees what
Verdict: The real sign-in, six roles and invite code exist, but nothing creates the first coach account yet, so the canvas cannot run end to end.
Readiness: switch on 5 · connect 6 · reshape 9 · build 8 · your call 2
What works already:
- Sign-in and sign-out with Auth.js credentials sessions (app/login/page.tsx, app/login/actions.ts, app/api/auth/[...nextauth]/route.ts).
- Six-role access matrix, and a client's own scope tied to their login (lib/auth/rbac.ts, lib/auth/guard.ts).
- Invite acceptance code (lib/workspace/invitations.ts). The canvas draws an invite list but has no accept screen.
The real work:
- Nothing creates the first workspace or owner. Pick the first-owner path, then add it under db/ or scripts/. lib/workspace/invitations.ts has no bootstrap.
- Messages and notes have no model yet. Permission cells for coach and client notes already exist (lib/auth/rbac.ts), so the new work is db/schema.prisma plus new message and note services.
- Invites and password reset cannot send email: there is no mail library, and the reset pages return 404 (lib/auth/password-reset-delivery.ts, lib/workspace/invitations.ts).
Blocked on you:
- The security doc and the code treat this cell differently. Which scope should a client's daily numbers use in the standalone tracker: the client's own, the assigned coach, or the whole workspace?
- The matrix recommends a trusted-runtime check on the flags that must read exactly "1". Add that check before any of them is switched on?
Start here: PR-W1 (depends on PR-01 and PR-05). First file: app/(tracker)/, the route group PR-W1 edits. If no coach account exists on a fresh local database, PR-04 comes first.
Screenshot: /coach, click the coach's name in the sidebar ("Workspace preferences") for the coach identity. On a client, click "Preview assigned tool" to show the client view.

## Self-check

- Readiness per card equals the matrix row counts for that surface (matrix.json, viz folder): Dashboard builder 43 rows (4 · 11 · 9 · 18 · 1), Client tracker 35 (5 · 1 · 16 · 9 · 4), Appearance 21 (3 · 3 · 5 · 10 · 0), Sign-in 30 (5 · 6 · 9 · 8 · 2). Each card sums to its total. PASS.
- Every PR id in "Start here" exists in PLAN.md (31 PR headings; all cited ids checked). PASS.
- No internal ids in Verdict, What works already, or The real work (checked for surface codes, row ids, PR ids, decision and question numbers). PASS.
- Each Verdict is one sentence. PASS.
- Blocked on you: Dashboard builder 1, Client tracker 2, Appearance 0 (no CONFLICT or ROLES row lands there), Sign-in 2. Each question ends with a question mark. PASS.
- No long dashes in the file. PASS.
- Notes, not failures:
  - The field file for the dashboard builder (F1/S08) counts 37 rows. The merged matrix counts 43 (round 3 and the roles rows added 6). The card uses 43.
  - Parked consent rows (S09-17 cycle tracking, S11-23 implied consent, V3-H4-03 consent route) are not in the counts and are not asked. Decision D12 parks them.
  - Not asked, to stay within the two-question cap: S09 V3-CO03 (tracker edits overwrite values, decision #79) and R3-13 (calories as an entered field, decision line 299-300). The story lane may need them.
  - Screenshot routes come from the round-3 census labels (R3/G5-census.txt). I did not open the app, so the capture lane must confirm each click path.
  - Sign-in card: on a fresh local database, PR-04 (sign-in for a dev run) comes before PR-W1.
