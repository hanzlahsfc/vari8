# Vari8 developer briefing: brief for the DB lanes

Reader: Marcel, the developer. He opens one page and within 30 seconds knows (1) what the merged app is, (2) what to do next, in order, (3) what is blocked on his own decisions. Everything else is drill-down. The previous page (`icm/02-gap-matrix/output/viz/gap-matrix.html`) failed this: it showed status codes and counts (`S06 · PARTIAL · 10`) that mean nothing to a reader. Never show internal status codes, surface ids (S01) or row ids as the main content. Translate everything.

All paths under `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/` unless absolute. Output folder `icm/04-briefing/` (create it). Write only there. Never run installs or formatters in the repo root; builds and dev servers run from the read-only tree `/home/nexuslink/vari8-worktrees/merge-proto` (a background process you own, killed at the end) or your own scratch copy.

## Vocabulary (use only these words for readiness)

| Matrix status    | Say       | Meaning for a dev                                                                                         |
| ---------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| UNCONFIGURED     | Switch on | Backend code exists but is off in a normal run (feature flag, missing seed, env). Turn it on, connect it. |
| UNWIRED          | Connect   | Backend exists and works; the canvas just does not call it.                                               |
| PARTIAL          | Reshape   | Backend exists but stores or returns a different shape or rule than the screen needs.                     |
| MISSING          | Build     | Nothing in the backend. New model, service and route.                                                     |
| CONFLICT / ROLES | Your call | Blocked until Marcel decides. Phrase as a question he can answer.                                         |

## Sources (read, never invent; cite `path:line` in the markdown, not in the page)

- The merge and its state: `icm/01-recon/output/D1-merge-prototype.md`, `L2-stack-merge.md`, `L1-backend-domain.md`, `H1..H4`, `AGENTS.md`, `CONTEXT.md`.
- What each screen needs: `icm/02-gap-matrix/output/F1/S01..S12-*.md` (element detail with both-side citations), `icm/02-gap-matrix/output/GAP-MATRIX.md` (338 rows, statuses), `icm/02-gap-matrix/output/viz/matrix.json` (same rows as data), `icm/02-gap-matrix/output/R3/R3-JUDGED.md`.
- How it gets built: `icm/03-plan/output/PLAN.md` (PR order PR-01 to PR-31 with Depends on, Files, You see), `icm/02-gap-matrix/output/F1/WIRING-SPEC.md` (data model, services, wiring per surface), `F1/OPEN-QUESTIONS.md`.
- Owner decisions: `icm/03-plan/DECISIONS.md` (D1 to D14), `PLAN.md` section `Owner decisions needed`.
- Tests: `icm/03-plan/output/TEST-AUDIT.md` summary only.

## Lanes

### DB-WORDS-A, DB-WORDS-B, DB-WORDS-C (content, strong model)

Each writes screen cards for its surfaces into `icm/04-briefing/cards-<lane>.md`. A: S01 shell/roster, S02 messages/notes/media, S03 check-ins, S04 habits. B: S05 templates/setup, S06 nutrition, S07 training. C: S08 dashboard builder, S09 client tracker, S10 appearance, S11 identity and access. One card per screen, in this exact shape:

```
## <Screen name as a user sees it>
Verdict: <one sentence: how far this screen is from working on the real backend, and the single biggest reason>
Readiness: switch on N · connect N · reshape N · build N · your call N   (from the matrix rows of this surface; totals must match)
What works already: <max 3 bullets, plain words, naming the backend piece that exists, e.g. "Habits table and coach habit editor (lib/habits.ts)">
The real work: <max 3 bullets, the few things that make this screen hard, plain words, each naming the file or model to touch>
Blocked on you: <0 to 2 questions, only if a CONFLICT/ROLES row hits this screen>
Start here: <the PR id from PLAN.md that wires this screen, what it depends on, and the first file a dev opens>
Screenshot: <the canvas route and the action that shows this screen, for the capture lane>
```

Group rows, do not list them: 13 habit rows become "7 parts already exist but are switched off; the real work is per-day habit history; one toggle is new". Every number traces to matrix rows. End the file with `## Self-check`: per card, readiness numbers equal the matrix counts for that surface (PASS/FAIL), every "Start here" PR id exists in PLAN.md, no internal ids in Verdict, What works, The real work.

### DB-STORY (content, strong model)

Writes `icm/04-briefing/story.md`:

1. Next moves: the first 5 concrete steps a dev takes, in order, each one line with the PR id, what you see when it is done, and what it unblocks. Derive from PLAN.md order plus current reality (PR-01 merge prototype exists at `58eb6ed`; decisions open).
2. The merge in three states, as data for three diagrams: Before (two separate apps: Lilly's canvas `frontend/` with state in browser localStorage, no login; Hanzlah's backend app at root with Next.js, Prisma, Postgres, Auth.js, RBAC, consent, flags), Now (one tree `proto/merge-frontend` `58eb6ed`, both run side by side, canvas still on localStorage, nothing connected), After (canvas screens read and write through `app/api/v1/**` with a validated service layer onto Prisma, one login, new roles). For each state: the boxes, the arrows, and one sentence that explains the mechanism.
3. Roadmap as data for a swimlane diagram: every PR from PLAN.md with lane (Foundation, Data model, Services, Wire screens, Messaging/media, Mobile), depends-on edges, and which owner decision blocks it.
4. Your decisions: every open owner decision (ROLES, AUTH, the PLAN.md list, D12 parked items listed as parked) as a question with options, the default if Marcel says nothing, and what it blocks (PR ids and screen names). Most blocking first.
5. Tests in one line from TEST-AUDIT.md: what stays, what goes in PR-03, what waits.
   End with `## Self-check`: every PR id exists in PLAN.md, every decision exists in DECISIONS.md or PLAN.md, no invented facts.

### DB-SHOTS (screenshots, mechanical)

Start the canvas from `/home/nexuslink/vari8-worktrees/merge-proto/frontend` (`npx next dev --webpack --hostname 127.0.0.1 --port 3420`, background, owned, killed at the end; restore any file Next rewrites with `git checkout`). With Playwright from `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/node_modules` (run scripts from `/tmp`), capture one clean 1440x900 PNG per screen listed in the surface table (coach app sections, client profile tabs, template setup, nutrition and training plan editors, dashboard builder, client tracker views, appearance/Ethereal studio). Use the routes and clicks documented in `icm/02-gap-matrix/output/R3/G5.md` and `G5-census.mjs`. Save to `icm/04-briefing/shots/<surface>-<slug>.png` (WebP or PNG under 400 KB each) plus `shots/index.json` mapping file to surface, screen name, route and click path. Then annotated versions: for each screen, find on-page elements whose visible text matches matrix row elements of that surface (matrix.json), draw a 2px outline coloured by readiness (switch on, connect, reshape, build, your call) with a small label, save `shots/<...>-annotated.png`, and record in index.json how many rows matched. Report in `icm/04-briefing/DB-SHOTS-report.md` with self-check (every surface has at least one shot, files open, server killed, tree clean).

### DB-PAGE (assembly, after the four above)

Builds `icm/04-briefing/vari8-dev-briefing.html` from the markdown and shots, via `icm/04-briefing/build.py` (stdlib; inlines images as base64 so the file works alone from `file://`). Load and apply `design-nexus` (base, wins conflicts), `hud-dashboard-design`, `creative-eye`, `frontend-design`, `ui-ux-pro-max`, `web-design-guidelines`, `accessibility-review`, `unslop`, `architecture-diagram`, `archify` or `excalidraw` for diagrams if useful. Page order:

1. Top: "What to do next": the 5 next moves as a numbered track, each with its PR id and what you see when done.
2. The merge: Before, Now, After as three SVG architecture diagrams side by side (stacked on mobile) with the mechanism sentence under each.
3. The roadmap: SVG swimlane of all PRs by lane with dependency arrows; PRs blocked by a decision carry a marker linking to section 4.
4. Your decisions: question cards, most blocking first, options and default, what each unblocks.
5. Screen by screen: one card per screen with its annotated screenshot (click to enlarge), verdict, a readiness bar in the five plain words, what works, the real work, blocked on you, start here.
6. Tests: one strip from TEST-AUDIT.
7. Footer: sources and the full 338-row list linked as the old page.

Rules: no internal codes or ids as headline content; every number traces to the markdown; word budget is high because this is a process document, but every section leads with its visual; plain English, no long dashes, no hedge phrases.

### DB-CHECK (independent reviewer, different model)

Opens the page headless at 1440 and 390 px, runs `measure-page.mjs`, and answers as Marcel: in 30 seconds, can you say what to do Monday morning, what the merged app looks like, and what you must decide? Checks every number against the markdown and matrix.json. Writes `icm/04-briefing/DB-CHECK.md` with findings ranked and a SHIP or FIX verdict.
