"""Single source of truth for the Vari8-Beta program (PLAN v2, cards, ledger, graph).

Edit this file, then run `python3 icm/05-build/tools/generate.py` (add `--check` to verify the
committed tree is the generator's output). Every generated artifact (PLAN.md v2, cards/*.md,
coverage-ledger.csv, graph.json, PROGRAM.md, timeline, POST-BETA-INFRA) comes from these tables,
so they cannot drift apart.

Paths: ROOT (inputs) is derived from this file's location, or PROGRAM_ROOT. OUTROOT (where the
generated files go) is ROOT, or PROGRAM_OUT for `--check`. Machine paths that appear inside card
text (worktrees root, Hermes home, jobcap) live in `icm/05-build/program-config.json`, not here.
"""
import json
import os
from pathlib import Path

ROOT = Path(os.environ.get("PROGRAM_ROOT") or Path(__file__).resolve().parents[3]).resolve()
OUTROOT = Path(os.environ.get("PROGRAM_OUT") or ROOT).resolve()
CFG = json.load(open(ROOT / "icm" / "05-build" / "program-config.json"))
WT = CFG["worktrees_root"]          # lane worktrees, as written into the cards
BETA = CFG["integration_worktree"]  # the integration worktree, as written into the cards
HERMES = CFG["hermes_home"]
JOBCAP = CFG["jobcap"]
EVID = f"{WT}/_evidence"

# Routing (PROGRAM-BRIEF "Routing"). model, provider per assignee.
MODELS = {
    "yamato": ("deepseek-v4.1-flash", "opencode-go"),
    "tenten": ("deepseek-v4.1-flash", "opencode-go"),
    "shikamaru": ("deepseek-v4.1-flash", "opencode-go"),
    "neji": ("claude-haiku-5-5", "anthropic"),
    "shinobu": ("claude-haiku-5-5", "anthropic"),
    "kakashi": ("deepseek-v4.1-flash", "opencode-go"),  # merge cards and GATE-CLEAN are mechanical (W0-fix-1 ruling 1)
    "meliodas": ("claude-opus-5-5", "anthropic"),
    "urokodaki": ("claude-opus-5-5", "anthropic"),
    "minato": ("gpt-6.1-sol", "openai-codex"),
}

# The model that actually writes the code, for the "verifier differs from builder" check.
BUILDER_MODEL = {"yamato": "swe-2-max"}

WORKER_SKILLS = {
    "yamato": ["devin", "verification-before-completion", "show-me-your-work"],
    "tenten": ["verification-before-completion", "show-me-your-work"],
    "shikamaru": ["principle-sequence-verifiable-units", "verification-before-completion"],
    "neji": ["behavioral-verification", "webapp-testing", "verification-before-completion"],
    "shinobu": ["security-diff-scan", "verification-before-completion"],
    "kakashi": ["resolving-merge-conflicts", "verification-before-completion"],
    "meliodas": ["verification-before-completion", "show-me-your-work"],
    "urokodaki": ["production-readiness-checklist", "verification-before-completion"],
    "minato": ["verification-before-completion", "principle-attack-the-premise"],
}

# Gear Devin loads (SOUL + skills of a crew bot), per the brief.
GEAR = {
    "kakashi": ["systematic-debugging", "codebase-design", "domain-modeling", "verification-before-completion"],
    "itachi": ["codebase-precedent-research", "how", "verification-before-completion"],
    "gowther": ["domain-modeling", "spec-driven-implementation", "sql-queries", "verification-before-completion"],
    "zenitsu": ["webapp-testing", "annotation-driven-frontend-qa", "immersive-visual-review", "verification-before-completion"],
    "jiraiya": ["technical-writing", "writing-for-agents", "verification-before-completion"],
}
# Skills every Devin builder also reads, from the zenitsu profile, when it wires a canvas screen.
UI_EXTRA = ["webapp-testing", "frontend-design"]

LIVE_ROLES = "owner, coach, client of the same workspace, staff of a foreign workspace, signed out"

# Every PLAN v2 PR. Keys: id, slug, title, track, deps (PLAN ids or DEC ids), who, gear,
# est (build minutes), files, build, see, unit, screens (shot files), sec (extra shinobu verify),
# ext (already running outside the graph), schema (allowed to touch db/).
PRS = [
    dict(
        id="PR-02", slug="pr-02-next16", title="Upgrade root to Next 16.3 and React 19.3", track="Foundation",
        deps=[], who=None, gear="kakashi", est=0, ext="done", issue=57, builder_model="swe-2-max",
        files=["package.json", "package-lock.json", "tsconfig.json", "eslint.config.mjs", "next.config.ts"],
        build=[
            "Shipped outside the graph: PR #57 merged into `Vari8-Beta` at `55a0f08` (02:19), verified by claude-haiku-5-5 (SHIP), branch and worktree cleaned. Folded in as a completed card.",
            "Root `next`, `react`, `react-dom` and types moved to the canvas versions; four react-hooks v6 rules downgraded to warn with 11 findings handed to PR-03B.",
        ],
        see=["Root typecheck, lint, build and unit tests exit 0 on Next 16.3 and React 19.3; `frontend/` still builds; sign-in page answers 200."],
        unit="Existing suite at the same pass count, every difference explained in the report.",
        screens=[],
    ),
    dict(
        id="PR-P1", slug="parity-harness", title="Build the visual parity harness and capture baselines", track="Foundation",
        deps=[], who=None, gear="zenitsu", est=45, ext="running", issue=61, eta=45, builder_model="claude-haiku-5-5", verifier="urokodaki",
        files=["tools/parity/run.mjs, capture.mjs, compare.mjs (in flight)", "tools/parity/baseline/**", "package.json (script `parity` only)", ".gitignore (`tools/parity/out/`)"],
        build=[
            "In flight outside the graph (builder claude-haiku-5-5, zenitsu gear, issue #61; verifier claude-opus-5-5 on urokodaki). Interface as built: `npm run parity` starts the canvas dev server on `PARITY_PORT` (default 3630) unless `PARITY_URL` points at a running app, captures every screen at 1440x900 and 390x844, compares with `tools/parity/baseline/`, writes `tools/parity/out/report.html`, stops the server; exit code is the comparison's. `npm run parity -- --update-baseline` recaptures. `verify-local.sh` calls it.",
            "Acceptance contract the verifier checks: the screen list comes from `icm/04-briefing/shots/index.json` (35 screens, route and click path each), not a hand list; clock frozen and animations off; the next-dev write to `frontend/AGENTS.md` is restored after the run.",
            "Pixel compare with a stated tolerance; masks only for the D32 truth-text table.",
            "The harness bites: a run against the baseline itself passes; a run after one CSS change fails on the changed screens only.",
        ],
        see=["70 baseline captures (35 screens x 2 widths) committed; the self-check passes and the mutated run fails exactly where it should."],
        unit="None needed, the harness is the proof tool; its bite check is the mutated-CSS run.",
        screens=["ALL"],
    ),
    dict(
        id="PR-03A", slug="pr-03-test-audit", title="Apply the TEST-AUDIT cuts", track="Foundation",
        deps=[], who=None, gear="shikamaru", est=60, ext="running", issue=59, eta=60, builder_model="swe-2-max",
        files=["tests/**", "frontend/**/*.test.mjs", "frontend/**/*.checks.mjs", "frontend/scripts/*.test.*", "test configs", "package.json scripts",
               "icm/05-build/tools/apply-test-audit.mjs"],
        build=[
            "In flight outside the graph (swe-2-max, shikamaru gear, issue #59, card `PR-03a`).",
            "Build the lever first: `icm/05-build/tools/apply-test-audit.mjs` parses the TEST-AUDIT per-file action list and the pass-2 block table (AST spans at `58eb6ed`), then deletes every CUT-FILE, the VISIBLE and CUT pass-2 blocks of every TRIM file, the named within-block exclusions, and the 41 old-UI e2e specs.",
            "Leave every KEEP-ALL file, every GUARD block, every CUT-AT-REPLACE block (PR-04 via PR-T2, PR-05, PR-W4) and every REWIRE block untouched.",
            "Re-run the script: the second run changes nothing (idempotent).",
        ],
        see=["`npm run test` and `npm --prefix frontend test` exit 0; the remaining counts reconcile with TEST-AUDIT GUARD plus CUT-AT-REPLACE totals, table in the report."],
        unit="Kept suites pass; no test added.",
        screens=[],
    ),
    dict(
        id="PR-03B", slug="pr-03-react-hooks", title="Fix the react-hooks v6 findings", track="Foundation",
        deps=[], who=None, gear="itachi", est=45, ext="running", issue=60, eta=45, builder_model="swe-2-max",
        files=["the 11 finding sites listed in `icm/05-build/reports/PR-02.md` section E2", "eslint.config.mjs"],
        build=[
            "In flight outside the graph (swe-2-max, itachi gear, issue #60, card `PR-03b`).",
            "Fix each finding at the root cause; set the four rules back to `error`; lint exits 0 with zero react-hooks findings.",
            "Canvas markup and styles stay byte-identical except where a hook fix requires it; each case named in the report.",
        ],
        see=["Lint exits 0 with the four rules at `error`; before and after screenshots at 1440 and 390 show no visual change on every touched screen."],
        unit="None needed; behavior-preserving, proven by screenshots and the existing suites.",
        screens=[],
    ),
    dict(
        id="PR-04", slug="pr-04-dev-runtime", title="Make the backend reachable in dev and park the consent gates", track="Foundation",
        deps=[], who="yamato", gear="gowther", est=45, sec=True,
        files=[".env.example", "scripts/seed/index.ts", "scripts/seed/*.seed.ts", "package.json (scripts `seed:dev`, `db:fresh` only)",
               "lib/consent.ts", "lib/*/consent.ts", "lib/gdpr*.ts", "lib/*/gate.ts", "lib/runtime.ts", "docs/dev/runtime.md", "vitest.config.ts (test env only)"],
        build=[
            "Document every flag the gates read in `.env.example`, including the three missing ones (`ENABLE_CLIENT_DASHBOARD`, `ENABLE_MEAL_PLANS`, `ENABLE_TRAINING_PLANS`).",
            "Add the trusted-runtime check to every exact-1 flag gate (V3-H4-02): a flag only counts in development or test runtimes.",
            "`scripts/seed/index.ts` loads every `scripts/seed/*.seed.ts` in name order (one file per domain, D34). It refuses to run unless the runtime is development or test. `00-workspace.seed.ts` creates the canvas demo workspace, an owner (Liliana Mansfeld, as the canvas shows), one coach and the canvas demo clients (synthetic names from `frontend/src/components/coach/model.ts`), with passwords taken from environment variables, never committed.",
            "`npm run db:fresh` creates `app_<lane>`, migrates, runs the catalog imports (`import:nutrition`, `import:exercise`) and the seed.",
            "Consent and health-data gates read `ENABLE_CONSENT_GATES`, unset by default (D19). Gates allow when it is off. The test environment sets it to 1 in `vitest.config.ts` so the existing consent suites keep testing the parked code until PR-T2 deletes them.",
            "List every gate turned off with file and line in the PR report; PLAN v2 `## Parked: consent and health data` gets the same list at merge.",
            "Merge the five consent gate files into one gate behind the flag where that is a pure move (BACKEND-REDUCTION F11) and inline the empty reset-delivery adapter registry only if PR-05 has not already replaced it (F12).",
        ],
        see=["A fresh database signs in as the seeded owner and opens every existing flagged page (clients, review queue, a client's meal plan, training program, dashboard, daily) instead of 404 or forbidden."],
        unit="One test per gate kind: a gate with `ENABLE_CONSENT_GATES` unset allows, and a flag set to 1 in a production runtime stays off. Both bite.",
        screens=[],
    ),
    dict(
        id="PR-01", slug="pr-01-canvas-takeover", title="Take over the whole canvas into the root app", track="Foundation",
        deps=["PR-02", "PR-P1"], who="yamato", gear="kakashi", est=60,
        files=["app/coach/**", "app/ethereal/**", "app/page.tsx", "app/layout.tsx", "app/globals.css", "components/canvas/**",
               "lib/auth/viewer.ts", "proxy.ts or middleware.ts", "package.json", "package-lock.json", "tsconfig.json", "postcss.config.mjs"],
        build=[
            "Move every canvas route into the root app with its path unchanged: `/coach`, `/ethereal` and `/` (which re-exports the studio today). Move `frontend/src/components/{coach,ethereal,ui}` and `frontend/src/lib` under `components/canvas/` and `lib/canvas/` with `git mv` history where possible; `frontend/` stays as the parity baseline until PR-R1.",
            "Merge the canvas dependencies into the root `package.json` at the canvas versions; one Tailwind 4 and PostCSS setup; carry every canvas CSS file (`globals.css`, `tracker.css`, `weight.css`, `ethereal-*.css`) byte for byte. Do not port the dead `appearance.css` rules beyond `.ap-screen` (S10-21), only if parity stays green.",
            "Point the PR-P1 harness at the root app (`tools/parity/run.mjs` starts the root dev server instead of `frontend/` and signs in as the dev user when a route needs a session); the baseline stays the one captured from `frontend/`.",
            "Behavior stays browser-local exactly as today (the canvas store and its localStorage keys). No screen reads the database yet except identity.",
            "Gate `/coach`, `/ethereal` and `/` behind the existing session: signed out goes to `/login`.",
            "Add the identity seam `lib/auth/viewer.ts` (`getViewer()`: name, initials, workspace, real role `Owner` or `Coach`, D18). It reads the session only through the existing `lib/auth/session.ts` and `lib/auth/route-guard.ts` exports, never `next-auth` directly, so PR-05's Better Auth swap (in flight, #58) changes one module, not the screens. If PR-05 merges first, build on its session API instead. The account block shows the viewer instead of the hardcoded coach; add sign-out to the account block's existing menu or dialog without new visible chrome.",
            "Until PR-04 lands, create a local dev user per `icm/05-build/RUNBOOK.md` section 'Dev user before PR-04'.",
        ],
        see=["Signed in as the seed owner, all 35 screens render on the root app and pass the D32 parity check at 1440 and 390, with the account block showing the real name and role; sign-out returns to `/login`."],
        unit="None needed, proven live by the parity gate and the sign-in round trip.",
        screens=["ALL"],
    ),
    dict(
        id="PR-W1", slug="pr-w1-identity-home", title="Wire identity, workspace and client home", track="Wiring",
        deps=["PR-05", "PR-01"], who="yamato", gear="itachi", est=40, sec=True,
        files=["app/page.tsx", "app/me/**", "lib/auth/viewer.ts", "components/canvas/ethereal/client-tracker/**", "scripts/seed/10-identity.seed.ts"],
        build=[
            "Role-aware landing: staff land on `/coach`, a client lands on their own tracker (the canvas standalone tracker, S11-18) bound to their own `ClientProfile` through `getViewer()`.",
            "The single workspace container (S11-04) shows the viewer's real workspace name.",
            "Client accounts never reach `/coach` or `/ethereal` (server redirect, not UI hiding).",
        ],
        see=["Coach and client sessions in two browser profiles reach their own views at both widths; a client typing `/coach` lands on `/me`."],
        unit="One route-guard test: a client session requesting a staff route is redirected, a staff session is not. Bites.",
        screens=["s09-tracker-today.png"],
    ),
    dict(
        id="PR-03", slug="pr-03-toolchain", title="Adopt Biome, TypeScript 7 and Turbopack", track="Foundation",
        deps=["PR-01", "PR-03A", "PR-03B"], who="yamato", gear="kakashi", est=50,
        files=["package.json", "package-lock.json", "biome.json", "frontend/biome.json", "tsconfig.json", "eslint.config.mjs (deleted)",
               ".prettierrc", ".prettierignore", "playwright.config.ts", "scripts/verify-local.sh"],
        build=[
            "Apply the P2 prototype (`d1b1668`, `ce2efed`) as one policy for root and canvas (D4a): canvas `recommended`, `organizeImports`, `noNextAsyncClientComponent`, `nursery/useReactCompiler` as warning. The react-hooks fixes already landed in PR-03B; keep them green under Biome.",
            "TypeScript 7 native as the only `typescript`; Turbopack for every build (drop `--webpack`); Node 24 in `.nvmrc` and engines.",
            "Prettier only for `*.md`, `*.yml`, `*.yaml`. The reformat is one mechanical commit produced by `npm run format`; the integrator re-runs it after any conflict instead of hand-merging format hunks.",
            "Make Playwright ports selectable by environment (`PLAYWRIGHT_PORT_BASE`) so verifier lanes stop sharing 3000, 3101 and 3102.",
            "Promote `icm/05-build/tools/verify-local.sh` to `scripts/verify-local.sh` (TEST-AUDIT 'Local gate per PR, D13') and point the icm tool at it.",
            "Workflows stay `workflow_dispatch` only (already done in `a9c0b2b`); confirm, do not re-add triggers.",
        ],
        see=["One lint and format command passes, `tsc` exits 0, no `--webpack` anywhere, the parity check stays green on all 35 screens."],
        unit="None needed, toolchain change proven by the full local gate and parity.",
        screens=["ALL"],
    ),
    dict(
        id="PR-T2", slug="pr-t2-consent-test-cuts", title="Delete the parked consent tests", track="Foundation",
        deps=["PR-04", "PR-03A"], who="tenten", gear=None, est=25,
        files=["tests/** (the 9 PR-04 CUT-AT-REPLACE files and the PR-04 blocks)", "vitest.config.ts (drop the test-only `ENABLE_CONSENT_GATES`)"],
        build=[
            "Delete the 9 whole files and the PR-04 CUT-AT-REPLACE blocks the TEST-AUDIT lists, with the PR-03A lever (`icm/05-build/tools/apply-test-audit.mjs`), extended with a replace-PR filter if it lacks one.",
            "Remove the test-only `ENABLE_CONSENT_GATES=1` from `vitest.config.ts`.",
        ],
        see=["Suites pass with gates parked; no consent assertion remains outside the parked code."],
        unit="Kept suites pass.",
        screens=[],
    ),
    dict(
        id="PR-05", slug="pr-05-auth-api", title="Better Auth, versioned API and the ROLES table", track="Foundation",
        deps=[], who=None, gear="kakashi", est=90, sec=True, schema=True, ext="running", issue=58, eta=100, builder_model="swe-2-max",
        files=["auth.ts", "auth.config.ts", "lib/auth/**", "app/api/v1/**", "app/signup/**", "app/reset/**",
               "app/reset-request/**", "lib/mail/**", "docs/security/authorization-model.md", "db/schema.prisma and one migration for the Better Auth tables",
               "tests: the PR-05 CUT-AT-REPLACE and REWIRE files from TEST-AUDIT, a table-driven roles test"],
        build=[
            "In flight outside the graph (swe-2-max, kakashi gear, issue #58, card `PR-05`), started from `55a0f08`. D16a: Better Auth replaces Auth.js v5 with the Prisma adapter; Hanzlah's invite token store stays; reset links 60 minutes, single use; bearer plugin for API clients; refresh rotation is a later mobile issue.",
            "Sign-in, coach self-signup (D17), sign-out, reset, invite acceptance, session revocation on password change, inactive-account lockout, login rate limiting.",
            "`/api/v1` route helper: authenticate (cookie or bearer), resolve workspace and role, Zod-validate, call one service, typed JSON errors (D6). Reference route: the coach roster read.",
            "Delete what Better Auth replaces and its CUT-AT-REPLACE tests; keep the session-revocation, inactive-account, malformed-claim and fail-closed guarantees (TEST-AUDIT).",
            "Program additions checked by its verifier: the D15 capability table lives in one module with one table-driven test of every actor by every capability; `lib/auth/session.ts` keeps an exported session read that `lib/auth/viewer.ts` (PR-01) can call.",
        ],
        see=["Scripted HTTP flow on a fresh database: sign-up, sign-in, wrong password refused, 11th rapid attempt rate limited, reset link reused refused, expired reset refused, session revoked after password change, bearer call to the reference route 200 for the coach, 403 for another workspace, 401 without credentials."],
        verify_extra=[
            "Roles table (D10 and owner answer Q3, written as D15): one module holds the complete capability table for every canvas surface (staff edit, clients read their own plans, D22 workspace-wide staff reads, R3-23 and R3-24 deny every cell), and one table-driven test runs every actor by every capability against the real server check with literal allow and deny. Name the module, the test file and its pass count; mutate one cell and show the test fails.",
            "Session export for PR-01: `lib/auth/session.ts` (or the module PR-05 names in its report) exports one server-side session read that returns user id, name, workspace and role without importing `next-auth` or Better Auth in the caller. Show the export signature and one call from a server component; `lib/auth/viewer.ts` in PR-01 builds on it.",
        ],
        unit="Table-driven roles test (every actor by every capability against the real server check) plus the preserved session and token guards.",
        screens=[],
    ),
    dict(
        id="PR-M0", slug="pr-m0-schema-v2", title="Schema v2: every canvas entity in one migration set", track="Model",
        deps=["PR-05"], who="yamato", gear="gowther", est=75, schema=True,
        files=["db/schema.prisma", "db/migrations/<timestamp>_schema_v2/**", "lib/db-types/**"],
        build=[
            "The only schema writer of the model wave (D34). Add everything the canvas model needs (`frontend/src/components/coach/model.ts`, `plans/domain.ts`, `plans/types.ts`, `builder/schema.ts`), in one reviewed migration set:",
            "ClientProfile: label, coachingSince, heightCm, archivedAt, archive reason (D27). Workspace: retentionDays default 90, appearance (mode, accent, font, density), logo media id, availability text, notification toggles (D25). Member preference: sidebar collapsed.",
            "CoachNote and CoachTask (workspace or client linked, D26); TrackerComment (client x date x parameter).",
            "Template definition slots: modules, summaryParameterIds (max 4), nutrition mode, per-field unit and option overrides, questionnaire binding, dashboard layout (D31). ParameterKind additions for TIME, DURATION, BLOOD_PRESSURE, LOCATION_RATING, CONTEXT, MULTI_CHOICE (D28).",
            "CheckInInstance coach note; CheckInAnswerKind RATING and VISUAL. Habit reason. ClientGoal. SavedMeal. Coach-editable ExerciseLibraryItem.",
            "Conversation, Message, MessageAttachment, MessageDraft, MessageRead, per-client priority-flag permission (D20). MediaObject (D20).",
            "Soft-delete restore window columns for every entity the canvas undoes (D24).",
            "Migration applies to a fresh database and to a database seeded by PR-04; down path documented.",
        ],
        see=["`prisma migrate deploy` on a fresh and on a seeded database exits 0; `prisma validate` exits 0; the seed still runs."],
        unit="One integrity test per new uniqueness or foreign-key rule the canvas relies on (for example one draft per client conversation). Each bites.",
        screens=[],
    ),
    dict(
        id="PR-R0", slug="pr-r0-lib-dedupe", title="Merge the copied retry and boundary helpers", track="Reduction",
        deps=["PR-05", "AUD-REDUCTION-VERIFY"], who="yamato", gear="kakashi", est=35,
        files=["lib/db.ts", "lib/boundary.ts", "the 18 service files with `withSerializedRetry` copies", "the 16 `lib/*/boundary.ts` files"],
        build=[
            "BACKEND-REDUCTION F8: one `withSerializedRetry` in `lib/db.ts` (the classifier already lives at `lib/db.ts:19`); delete the 18 copies and their constants.",
            "BACKEND-REDUCTION F9: one closed, non-disclosing error vocabulary in `lib/boundary.ts` (`CLOSED_MESSAGES`, `fail`, `mapError`, `guard`); delete the 16 copies. Keep every message string identical (R3-15, R3-19).",
            "Runs before the model wave so PR-M1 to PR-M9 edit the merged helpers, not the copies. No `db/` edits (D34).",
        ],
        see=["About 650 lines out; every existing retry and boundary test passes unchanged."],
        unit="Existing data-integrity and trust-boundary GUARD tests pass unchanged; none added.",
        screens=[],
    ),
]

M_SERVICES = [
    ("PR-M1", "pr-m1-client-lifecycle", "Client profile, archive and retention services", ["PR-M0"], 40,
     ["lib/workspace/clients.ts", "lib/workspace/roster-query.ts", "lib/workspace/retention.ts"],
     ["Profile field reads and writes, archive, restore and retention-gated delete (D27), all through `authorize`.",
      "Delete is refused before the retention period ends and audited structurally after."],
     "Archiving hides a client from the roster query; delete before retention is refused.",
     "Archive, restore and delete-after-retention against the real database; the retention boundary date is a literal case."),
    ("PR-M2", "pr-m2-preferences", "Workspace appearance and preference services", ["PR-M0"], 35,
     ["lib/workspace/preferences.ts", "app/api/v1/workspace/preferences/**"],
     ["Read and write appearance and preferences per workspace (D25) and the member's sidebar state, validated with Zod."],
     "Accent and mode persist per workspace and differ between two workspaces.",
     "Trust-boundary validation of accent hex and font enum; workspace isolation."),
    ("PR-M3", "pr-m3-notes-tasks", "Coach notes, coach tasks and tracker comments", ["PR-M0"], 40,
     ["lib/notes/**", "lib/coach-tasks/**", "lib/tracker-comments/**", "app/api/v1/notes/**", "app/api/v1/coach-tasks/**"],
     ["Services for CoachNote, CoachTask and TrackerComment with structural audit (never bodies, D26)."],
     "A client request to a coach note or coach task route gets 403; staff see them.",
     "Isolation: client and foreign-workspace reads denied; audit metadata carries no body text."),
    ("PR-M4", "pr-m4-template-definitions", "Template definition services", ["PR-M0", "PR-M1"], 50,
     ["lib/coaching/templates.ts", "lib/coaching/template-validators.ts"],
     ["Validators and services for the new slots, one variant as the canvas normalizes it (S05-24), soft delete with restore window (D24), empty library (D23)."],
     "The validator accepts every canvas template shape and rejects variant arrays.",
     "Validation at the trust boundary with literal accepted and rejected payloads; restore inside and outside the window."),
    ("PR-M5", "pr-m5-mealplan-payload", "Meal-plan payload and the shared nutrition math", ["PR-M0"], 50,
     ["lib/mealplan/payload.ts", "lib/mealplan/boundary.ts", "lib/nutrition/math.ts"],
     ["Schedule, portions, swaps, saved meals, per-field target kinds.",
      "Move the canvas nutrition functions into `lib/nutrition/math.ts`, used by server and canvas (D29); blank stays missing (#36)."],
     "A draft round-trips; totals from `lib/nutrition/math.ts` equal the canvas totals on the demo plan.",
     "Calculation guards: literal kcal and macro totals for two demo meals, 4/4/9 ring percentages, blank-not-zero."),
    ("PR-M6", "pr-m6-training-payload", "Training payload and the shared volume math", ["PR-M0"], 50,
     ["lib/trainingprogram/payload.ts", "lib/trainingprogram/validators.ts", "lib/training/volume.ts"],
     ["Ordered per-set prescriptions, exercise metadata and goals; coach-editable exercise library.",
      "Move the canvas muscle-volume function into `lib/training/volume.ts` (D29)."],
     "A draft round-trips ordered sets; volume per muscle group equals the canvas panel on the demo program.",
     "Calculation guard: literal working-set counts per group for the demo program."),
    ("PR-M7", "pr-m7-habits", "Habit fields and all-time completion", ["PR-M0"], 30,
     ["lib/habits/**"],
     ["Bounded reason, frequency and goal mapping to the weekday schedule, all-time completion count."],
     "Scheduled habits expose completion counts and reasons.",
     "Date guard: completion counts across a week boundary in Europe/Vienna."),
    ("PR-M8", "pr-m8-checkins", "Check-in fields, explicit generation and projection", ["PR-M0"], 45,
     ["lib/checkin/**"],
     ["Coach note, rating answers, visual answers (media ids).",
      "Schedule save generates occurrences through T+56 (D30); a read-only projection returns later dates for the calendar."],
     "Saving a schedule creates occurrences through T+56 only; the projection lists later dates without writing them.",
     "Date guard: T+56 boundary and weekday rules in Europe/Vienna; no write from the projection."),
    ("PR-M9", "pr-m9-dashboard-config", "Dashboard configuration adapter", ["PR-M0"], 40,
     ["lib/dashboard/config-schema.ts", "lib/dashboard/adapter.ts"],
     ["Adapter between the canvas `DashboardDraft` and the backend schema: visibility, labels, history period, per-breakpoint rectangles, caps (D31)."],
     "Every canvas demo layout converts and converts back unchanged.",
     "Round-trip guard on the demo layouts; cap rejection at 25 widgets."),
]
M_SEED = {"PR-M1": "20-clients", "PR-M2": "21-appearance", "PR-M3": "22-notes", "PR-M4": "30-templates", "PR-M5": "34-nutrition",
          "PR-M6": "35-training", "PR-M7": "32-habits", "PR-M8": "33-checkins", "PR-M9": "36-dashboard"}
for (pid, slug, title, deps, est, files, build, see, unit) in M_SERVICES:
    seed = f"scripts/seed/{M_SEED[pid]}.seed.ts"
    PRS.append(dict(id=pid, slug=slug, title=title, track="Model", deps=deps + ["PR-R0"], who="yamato", gear="gowther", est=est,
                    files=files + [seed, "their tests"],
                    build=build + [f"Seed the canvas demo data for this domain (synthetic, values copied from the canvas demo state) in `{seed}`, so the wiring PR's parity run compares like with like.",
                                   "No `db/` edits (D34)."], see=[see], unit=unit, screens=[]))

SV = [
    ("PR-SV1", "pr-sv1-roster-read", "Workspace-wide roster and calendar read model", ["PR-M1", "PR-M4", "PR-M8"], 45,
     ["lib/workspace/roster-query.ts", "lib/workspace/attention.ts", "app/api/v1/roster/**", "app/api/v1/calendar/**"],
     ["One scoped query: profile, active setup, next check-in, pending review count, overdue tasks; search, filter and sort as the canvas does; attention rules as the canvas codes them (D22)."],
     "Staff see every client of their workspace and none of a foreign one.",
     "Isolation guard against a foreign workspace; attention rule literal cases.", False),
    ("PR-SV2", "pr-sv2-daily-series", "Daily-entry numeric series", ["PR-M1"], 40,
     ["lib/daily-entry/service.ts", "lib/daily-entry/boundary.ts", "app/api/v1/daily-entries/**"],
     ["Typed per-parameter series for Week and Trends, latest revision (#79), client own scope and staff workspace scope."],
     "Own client and staff reads return the expected dates and values.",
     "Date guard on range ends; latest-revision guard.", False),
    ("PR-SV3", "pr-sv3-widget-feeds", "Dashboard widget feeds", ["PR-SV2", "PR-M5", "PR-M6", "PR-M7"], 60,
     ["lib/dashboard/sources/**", "app/api/v1/dashboard/**"],
     ["One read per bound widget source (bodyweight, measurements, nutrition targets, training week, habits, tasks, check-ins, feedback, roadmap); unbound widgets keep the canvas empty state."],
     "Every bound widget kind returns data for the demo client.",
     "Calculation guards where a widget computes (weekly average, week-over-week delta) with literal values.", False),
    ("PR-SV4", "pr-sv4-invitations", "Client invitations", ["PR-05"], 35,
     ["lib/workspace/invitations.ts", "app/api/v1/invitations/**"],
     ["Create, list and revoke invitations; delivery through the PR-05 mail port; acceptance creates the linked client profile once."],
     "Invite acceptance creates one client profile even when submitted twice.",
     "Token guard and exactly-once acceptance under concurrency.", True),
]
for (pid, slug, title, deps, est, files, build, see, unit, sec) in SV:
    PRS.append(dict(id=pid, slug=slug, title=title, track="Service", deps=deps, who="yamato", gear="kakashi", est=est,
                    files=files + ["their tests"], build=build + ["No `db/` edits (D34)."], see=[see], unit=unit, screens=[], sec=sec))

PRS += [
    dict(
        id="PR-MEDIA", slug="pr-media-storage", title="Media storage, upload and the real recorder", track="Wiring",
        deps=["PR-M0", "PR-05", "PR-P1"], who="yamato", gear="kakashi", est=60, sec=True,
        files=["lib/storage.ts", "lib/storage/local.ts", "lib/storage/s3.ts", "app/api/v1/media/**", "components/canvas/coach/media-card.tsx",
               "components/canvas/coach/demo-recorder.tsx", ".env.example (storage lines)", "scripts/seed/40-media.seed.ts"],
        build=[
            "`lib/storage.ts` port with a local-disk adapter (development) and an S3-compatible adapter (environment-configured). Vendor stays open (D8).",
            "Signed upload and download for images, documents, audio and video (D20), 20 MB cap as the canvas shows, type allowlist, workspace-scoped keys.",
            "The recorder dialog keeps its exact UI and records from `MediaRecorder` instead of the synthesized demo source.",
        ],
        see=["Staff and the client upload and play back a voice note and an image; another workspace's media URL fails closed."],
        unit="Trust-boundary guards: type allowlist, size cap, key scoping, expired signed URL rejected.",
        screens=["s02-thread-attachments.png"],
    ),
    dict(
        id="PR-MSG", slug="pr-msg-messaging", title="Messaging: domain, routes and the three canvas screens", track="Wiring",
        deps=["PR-MEDIA", "PR-M2", "PR-W0", "PR-SV1"], who="yamato", gear="itachi", est=90, sec=True,
        files=["lib/messages/**", "app/api/v1/messages/**", "components/canvas/data/messages.ts", "components/canvas/coach/messages*.tsx",
               "scripts/seed/50-messages.seed.ts"],
        build=[
            "Conversations, messages, drafts, read state, unread counts, priority flags with the per-client permission, context links, thread search (D20).",
            "Wire the messages section, the thread and the attachment picker; nav badges and the roster unread filter read the server counts.",
            "Feedback sent from a check-in review lands in the conversation with its links (S03-20).",
            "Seed the canvas demo conversations so parity compares like with like.",
        ],
        see=["Coach and client exchange text, a voice note, a document and an image in two browser profiles; unread counts and the read check update; parity passes on the three screens."],
        unit="Isolation guard (client sees only own conversation); exactly-once send with a client request id.",
        screens=["s02-messages.png", "s02-thread.png", "s02-thread-attachments.png"],
    ),
    dict(
        id="PR-W0", slug="pr-w0-data-seam", title="Split the canvas store into per-domain data providers", track="Wiring",
        deps=["PR-01", "PR-03", "PR-05", "PR-P1"], who="yamato", gear="kakashi", est=45,
        files=["components/canvas/coach/store.tsx", "components/canvas/data/index.ts", "components/canvas/data/<domain>.ts",
               "components/canvas/ethereal/**/(persistence modules only)"],
        build=[
            "Separate before serializing: replace the one `coach-desktop-mockup-v1` store and the ethereal localStorage keys with one provider per domain (clients, templates, checkins, habits, nutrition, training, dashboard, notes, messages, appearance, tracker). Each provider keeps today's local behavior.",
            "`components/canvas/data/index.ts` lists every domain once, here, so later wiring PRs edit only their own provider file.",
            "Behavior-preserving: no visible change.",
        ],
        see=["All 35 screens pass parity; a grep shows `localStorage` only inside `components/canvas/data/*.ts`."],
        unit="None needed, behavior-preserving refactor proven by parity on all screens.",
        screens=["ALL"],
    ),
]

W = [
    ("PR-W2", "pr-w2-roster-profile", "Wire the roster and the client profile", ["PR-W0", "PR-SV1", "PR-SV2", "PR-SV4", "PR-M1"], 60,
     ["components/canvas/data/clients.ts", "components/canvas/coach/clients.tsx", "components/canvas/ethereal/clients/**"],
     ["Roster, search, filter, sort, card and table views, profile header and tabs, client tasks, onboarding answers, archive with timed restore (D24, D27), the Ethereal clients studio (D21)."],
     "Seed the demo clients, archive one, reload: it leaves the roster and restores from the toast; parity passes on the profile screens.",
     ["s01-roster.png", "s01-profile-overview.png", "s01-profile-plans.png", "s01-profile-checkins.png", "s01-profile-onboarding.png", "s10-clients-studio.png"]),
    ("PR-W3", "pr-w3-templates-setup", "Wire templates, setup and client preview", ["PR-W0", "PR-M4", "PR-SV1"], 75,
     ["components/canvas/data/templates.ts", "components/canvas/coach/templates.tsx", "components/canvas/coach/plans/**(setup only)"],
     ["Library, editor with save (CAS), publish, duplicate, rename, delete with timed restore, assignment and personalization, preview of the assigned tool, habit and module toggles."],
     "Create, save, publish and assign a template; a stale tab's save shows the conflict; parity passes.",
     ["s05-templates.png", "s05-template-editor.png", "s05-tracker-setup.png", "s05-client-setup.png", "s11-client-preview.png"]),
    ("PR-W4", "pr-w4-tracker", "Wire the client tracker, trends and roadmap", ["PR-W0", "PR-SV2", "PR-M3", "PR-M4"], 75,
     ["components/canvas/data/tracker.ts", "components/canvas/coach/client-tracker-preview/**", "components/canvas/ethereal/client-tracker/**",
      "tests: the PR-W4 CUT-AT-REPLACE blocks"],
     ["Today, Week, Trends and Roadmap from the server; every field kind including time and duration (D28) and cycle fields (D19); coach comments; revision history kept (#79); the tracker configurator studio page."],
     "The client logs three days, reloads, and Week and Trends draw from the server; parity passes.",
     ["s09-tracker-today.png", "s09-tracker-week.png", "s09-tracker-trends.png", "s09-tracker-config.png"]),
    ("PR-W5", "pr-w5-habits", "Wire habits", ["PR-W0", "PR-M7", "PR-M4"], 45,
     ["components/canvas/data/habits.ts", "components/canvas/coach/habits-tab.tsx"],
     ["Coach habit manager and the client's scheduled completion; recorded completions aside."],
     "An unscheduled habit cannot be toggled; a scheduled one persists after reload; parity passes.",
     ["s04-habit-editor.png", "s04-template-habits.png"]),
    ("PR-W6", "pr-w6-checkins", "Wire check-ins", ["PR-W0", "PR-M8", "PR-M4", "PR-MEDIA"], 75,
     ["components/canvas/data/checkins.ts", "components/canvas/coach/check-ins.tsx"],
     ["Board (week, month, agenda), filters, extra dates with timed restore, schedules with explicit generation and projection (D30), review workspace, visuals, video feedback, plan adjustments on explicit submit."],
     "Two accounts complete schedule, submission, review and feedback; parity passes.",
     ["s03-checkins-board.png", "s03-add-extra.png", "s03-checkin-review.png"]),
    ("PR-W7", "pr-w7-nutrition", "Wire nutrition and meal plans", ["PR-W0", "PR-M5", "PR-M4"], 75,
     ["components/canvas/data/nutrition.ts", "components/canvas/coach/plans/nutrition/**", "components/canvas/ethereal/mealplan/**"],
     ["Meal plan editor, food catalog, saved meals, IIFYM, client preview, computed totals and ring from `lib/nutrition/math.ts` (D29), the meal plans studio page."],
     "The coach publishes the demo plan and the client sees the same totals the canvas shows; parity passes.",
     ["s06-mealplan-editor.png", "s06-template-nutrition.png", "s10-mealplan-studio.png"]),
    ("PR-W8", "pr-w8-training", "Wire training", ["PR-W0", "PR-M6", "PR-M4"], 75,
     ["components/canvas/data/training.ts", "components/canvas/coach/plans/training/**"],
     ["Program editor with per-set rows, exercise library manager, history, volume panel and body map from `lib/training/volume.ts` (D29), client current week."],
     "The coach publishes a per-set plan and the client sees the current week with the canvas volume numbers; parity passes.",
     ["s07-training-editor.png", "s07-exercise-library.png"]),
    ("PR-W9", "pr-w9-dashboard", "Wire the dashboard builder", ["PR-W0", "PR-M9", "PR-SV3", "PR-M4"], 75,
     ["components/canvas/data/dashboard.ts", "components/canvas/coach/builder/**", "components/canvas/ethereal/builder/**"],
     ["Template dashboard editor, studio builder, widget gallery, per-widget audience visibility, live data for bound widgets (D31)."],
     "The client sees only client-visible widgets with live data; parity passes.",
     ["s08-builder.webp", "s08-widget-gallery.png", "s08-template-dashboard.png"]),
    ("PR-W10", "pr-w10-notes-appearance", "Wire notes, to-dos, appearance and preferences", ["PR-W0", "PR-M2", "PR-M3", "PR-MEDIA"], 60,
     ["components/canvas/data/notes.ts", "components/canvas/data/appearance.ts", "components/canvas/coach/notes.tsx", "components/canvas/coach/appearance-controls.tsx",
      "components/canvas/ethereal/appearance-views.tsx"],
     ["Notes and to-dos section and profile tab, workspace preferences dialog with logo upload, appearance studio, sidebar collapse, all saved per workspace (D25)."],
     "A client gets 403 on the coach-note route; the accent persists per workspace after reload; parity passes.",
     ["s02-notes-todos.png", "s01-profile-notes.png", "s10-appearance.png", "s11-preferences.png"]),
]
for (pid, slug, title, deps, est, files, build, see, screens) in W:
    PRS.append(dict(id=pid, slug=slug, title=title, track="Wiring", deps=deps, who="yamato", gear="itachi", est=est,
                    files=files + ["app/api/v1/** routes the screen calls", "their tests"],
                    build=build + ["Each screen keeps its exact markup; only the data provider and server calls change.",
                                   "The canvas demo data for this domain comes from the model PR's seed file; if a value the screen shows is missing, add it to that seed file in this PR.",
                                   "No `db/` edits (D34)."],
                    see=[see], unit="Only keep-category tests (D14) for rules this PR adds; the screen is proven live.", screens=screens))

PRS += [
    dict(
        id="PR-R1", slug="pr-r1-delete-superseded", title="Delete what the canvas replaced", track="Reduction",
        deps=["PR-W2", "PR-W3", "PR-W4", "PR-W5", "PR-W6", "PR-W7", "PR-W8", "PR-W9", "PR-W10", "PR-MSG"], who="yamato", gear="kakashi", est=60,
        files=["app/workspace/** (UI pages)", "app/(tracker)/**", "app/library/**", "app/sheets/**", "app/daily/**", "components/** (old UI, keep `sign-out-button.tsx` if still used)",
               "lib/extraction/{crosssheet,redact,source,summaries,theme}.ts", "scripts/extract-sheets.ts and the `extract:sheets` script",
               "lib/daily-prototype.ts", "lib/sheet-viewer.ts", "lib/catalog.ts", "lib/spec-artifacts.ts", "lib/trainingprogram/weeks.ts (`versionForWeek`)",
               "lib/coaching/*transition* (conditional, F4)", "components/canvas/data/*.ts (localStorage fallbacks, created by PR-01 and PR-W0)", "frontend/**", "tests that only covered deleted code"],
        build=[
            "Input: `icm/05-build/BACKEND-REDUCTION.md` (findings F1, F2, F4, F5, F6, F13; about 21,800 lines). Census first: for every candidate, a committed command output proving zero runtime callers (`icm/05-build/reports/PR-R1-census.txt`).",
            "Do not delete `lib/db.ts` or the extraction modules the catalog importers (`lib/nutrition/source.ts`, `lib/exercise/source.ts`) import directly or through `parse.ts`: `contracts.ts`, `databases.ts`, `normalize.ts`, `parse.ts`, `css.ts`. They are not R1 work; the census only confirms they still have callers. The parameter manager (`app/workspace/[workspaceId]/parameters/**`, `lib/coaching/parameters.ts`) also stays, although it sits under `app/workspace/**`: it waits for an owner answer.",
            "Delete the template-version transition subsystem (F4) only after confirming the canvas assign flow (S01-27 setup review) does not call `transition-diff`; otherwise keep it and say why.",
            "Delete the old backend UI replaced by canvas screens, the public fixture library pages, dead helpers and dead exported symbols (D33).",
            "Remove the localStorage fallbacks from the data providers (S01-13).",
            "Last step: after one final parity run against the committed baseline, delete `frontend/` and switch the harness to serve only the root app. The baseline images stay in `tools/parity/baseline/`.",
        ],
        see=["Full local gate green; parity green on all 35 screens; the line count drop is reported per directory."],
        unit="Deleted code's tests deleted with it; GUARD tests of kept code untouched.",
        screens=["ALL"],
    ),
    dict(
        id="PR-R2", slug="pr-r2-schema-reduction", title="Drop database models left without a reader", track="Reduction",
        deps=["PR-R1", "PR-M0"], who="yamato", gear="gowther", est=40, schema=True,
        files=["db/schema.prisma", "db/migrations/<timestamp>_schema_reduction/**"],
        build=["Census per model (zero readers after PR-R1), then one migration that drops them. Third and last schema writer (D34)."],
        see=["Migration applies to a fresh and to a seeded database; the app and the seed run."],
        unit="None needed beyond the migration and the full local gate.",
        screens=[],
    ),
    dict(
        id="PR-R3", slug="pr-r3-flags-deps", title="Collapse product flags and drop unused dependencies", track="Reduction",
        deps=["PR-R1"], who="yamato", gear="kakashi", est=40,
        files=["lib/*/gate.ts", ".env.example", "package.json", "package-lock.json", "lib/runtime.ts"],
        build=["BACKEND-REDUCTION F10 and F6: delete the 11 product `ENABLE_*` flags and the 2 dev-tool flags whose tools PR-R1 removed; merge the four `classifyXRuntime` copies into one; keep the `APP_ENV` trust check and `ENABLE_CONSENT_GATES` (D19, D33). Remove dependencies with no import left."],
        see=["A fresh database with an empty `.env` (except database, auth secret and storage) opens every canvas screen."],
        unit="The flag-gate tests of deleted flags go with them; the remaining gate tests pass.",
        screens=["ALL"],
    ),
    dict(
        id="PR-X1", slug="system-index", title="Build the system index generator and the first index", track="Index",
        deps=[], who=None, gear="tenten", est=50, ext="running", issue=62, eta=50, builder_model="deepseek-v4.1-flash",
        files=["scripts/index/generate.ts and glossary-seed.json (in flight)", "AGENTS.md routers per directory (generated)", "docs/index/SYMBOLS.md", "docs/index/ROUTES.md",
               "docs/index/DATA-MODEL.md", "docs/index/GLOSSARY.md", "docs/index/README.md", "package.json (scripts `index`, `index:check` only)", "tests/unit/system-index.test.ts"],
        build=["In flight outside the graph (deepseek-v4.1-flash, tenten gear, issue #62). Acceptance contract: `icm/05-build/SYSTEM-INDEX-SPEC.md` (deterministic generator, per-directory routers, symbol and route maps, glossary, check mode). Its verifier checks the generator against the spec, not the content of a tree that is still moving."],
        see=["`npm run index` twice produces no diff; `npm run index:check` fails after a route is added without rebuilding."],
        unit="None needed; the determinism and staleness checks are the proof.",
        screens=[],
    ),
    dict(
        id="PR-X2", slug="pr-x2-index-final", title="Rebuild the system index on the final tree", track="Index",
        deps=["PR-X1", "PR-R2", "PR-R3"], who="shikamaru", gear=None, est=25,
        files=["the generated index files only", "scripts/index/** (only to fix a spec gap found on the final tree)"],
        build=["Run `npm run index` on the reduced tree, review the routers for dead paths, commit. Add `index:check` to `scripts/verify-local.sh` if PR-03 has not."],
        see=["`npm run index:check` exits 0 on the final tree; every router names only paths that exist."],
        unit="None needed.",
        screens=[],
    ),
    dict(
        id="PR-D1", slug="pr-d1-readme-setup", title="README, setup guide and infographics", track="Docs",
        deps=["PR-R3", "PR-X1"], who="yamato", gear="jiraiya", est=50,
        files=["README.md", "docs/setup.md", "docs/infographics/*.svg", "docs/architecture.html"],
        build=[
            "Polished README: what Vari8 is, the screens, one-command local setup (`db:fresh`, `seed:dev`, dev server), roles, the local gate, the index.",
            "Infographics as hand-checked SVG: architecture (browser, api/v1, services, authorize, Prisma), request lifecycle, data model overview, setup steps, role matrix.",
            "A fresh clone on a clean database follows `docs/setup.md` to a signed-in canvas, recorded in the report.",
        ],
        see=["A new reader goes from clone to the signed-in canvas with only the README and setup guide."],
        unit="None needed; proven by the fresh-clone walkthrough.",
        screens=[],
    ),
    dict(
        id="PR-31", slug="pr-31-pwa-mobile", title="PWA install and the Capacitor 8 scope", track="Mobile",
        deps=["PR-05", "PR-W1"], who="yamato", gear="kakashi", est=45,
        files=["app/manifest.ts", "public/icons/**", "docs/mobile/PWA-CAPACITOR-SCOPE.md"],
        build=["Installable PWA (manifest, icons, no offline promise). Decision package for Capacitor 8 and the mobile bearer-token design D6 requires before any token is built."],
        see=["Chrome reports the app installable at 390 width; the scope document names native scope and gates and promises no release."],
        unit="None needed.",
        screens=[],
    ),
    dict(
        id="PR-SUPP", slug="pr-supp-plan", title="Supplement plan per client", track="Service",
        deps=["PR-M1"], who="yamato", gear="kakashi", est=60, schema=True, sec=True, issue=161,
        files=["db/schema.prisma", "db/migrations/<timestamp>_supplement_plan/**", "lib/supplements/{model,gate,service,boundary}.ts",
               "lib/audit.ts (resource type)", "lib/auth/rbac.ts (resource cell)", "lib/consent.ts (parked registry)",
               "app/workspace/[workspaceId]/clients/[clientProfileId]/supplements/actions.ts", ".env.example",
               "tests/unit/supplements-plan.test.ts", "tests/integration/supplements-plan.test.ts"],
        build=[
            "Contract source: `frontend/docs/supplements-frontend-execution-brief.md` and `frontend/src/components/coach/supplements/{model,draft,editor,plan-view}.ts(x)` on FRONTEND 51fa6a2 (PR #151; beta sync is PR #160, unmerged at card creation).",
            "One saved supplement plan per client; the coach edits name and ordered items with explicit Save/Cancel; the client reads the saved plan only. No draft/active/history lifecycle, no dates, weekdays, cycles or pause states.",
            "Each item embeds the product snapshot (brand, name, reference quantity/unit, declared amount/unit, URL) plus quantity, dose unit, free-text timing and notes, and status in {must-have, optional, none}. Snapshots stay readable when the catalogue later changes; there is no backend-managed catalogue.",
            "Validation mirrors the frontend model: positive finite quantity, catalogue-compatible dose unit, safe http(s) product URL (hostname, no credentials), exact status union, unknown keys rejected. Missing composition stays null; never persist derived dosage; no check-off, adherence, dose logic or PED/HRT behavior.",
            "One `supplement_plan` + `supplement_plan_item` migration pair with hand-authored down.sql, composite same-workspace coherence FKs in raw SQL (Prisma cannot express them), expected-revision CAS under advisory lock and serializable transaction, re-resolved authorization inside the transaction.",
            "Access reuses the closed `plan.read`/`plan.write` capability cells exactly as `mealPlans`; no new capability, no broadened permission. Client reads own; unassigned staff and foreign workspace/client are non-disclosing.",
            "Actions follow the established order: feature gate `ENABLE_SUPPLEMENT_PLAN`, session, bounded input validation, service boundary, `revalidatePath`. Closed safe errors; `supplement_plan` audit resource with structural metadata only (no payload bodies).",
        ],
        see=["A coach saves a named plan with ordered items and the client reads exactly the saved data; a second stale save fails without writes; a foreign workspace or client sees the same not-found as an absent plan."],
        unit="Literal validation cases (quantities, units, URLs, statuses, unknown keys, null versus zero composition) and integration cases for ordering, CAS, role matrix, audit and flag-off, each failing when the guard breaks.",
        screens=[],
    ),
]

# Decision and audit cards outside the PR list. ext: "done" (create, then complete) or "running" (parked as blocked).
DECISION_CARDS = [
    dict(id="DEC-AUTH", slug="dec-auth-evaluation", title="AUTH evaluation: Better Auth vs Auth.js v5 plus own tokens", who=None,
         deps=[], ext="done", est=0, builder_model="claude-haiku-5-5",
         body="Done outside the graph (builder claude-haiku-5-5; reviewed by DEC-AUTH-REVIEW on claude-opus-5-5): `icm/05-build/AUTH-DECISION.md`, verdict Better Auth, with the orchestrator ruling of 02:12. Recorded as D16a in `icm/03-plan/DECISIONS.md`."),
    dict(id="DEC-AUTH-REVIEW", slug="dec-auth-review", title="Review of the AUTH decision, record D16a", who="meliodas",
         deps=["DEC-AUTH"], ext="done", est=0,
         body="Done: the orchestrator ruled at 02:12 (verdict accepted, reset links 60 minutes single use, refresh rotation deferred to the Capacitor milestone). The W0 lead recorded D16a and committed AUTH-DECISION.md."),
    dict(id="AUD-REDUCTION", slug="aud-backend-reduction", title="Backend reduction audit", who=None,
         deps=[], ext="done", est=0, builder_model="claude-haiku-5-5",
         body="Done outside the graph (builder claude-haiku-5-5, kakuzu gear; verified by AUD-REDUCTION-VERIFY on claude-opus-5-5): `icm/05-build/BACKEND-REDUCTION.md`. Folded into PR-04, PR-R0, PR-R1, PR-R2 and PR-R3; its section 5 defects are fixed in PLAN v2."),
    dict(id="AUD-PRR-BASELINE", slug="aud-prr-baseline", title="Production-readiness baseline audit", who=None,
         deps=[], ext="done", est=0,
         body="Done outside the graph (urokodaki, claude-opus-5-5, medium): `icm/05-build/audits/PRODREADY-BASELINE.md` at `55a0f08` (160 entries, 38 P0 rows: 31 gaps, 2 present, 1 parked, 4 not applicable as graded by the baseline; every P0 row has a ledger disposition). GATE-PRR re-runs it on the integrated tip; the hosting-dependent rows are listed in `icm/05-build/POST-BETA-INFRA.md`."),
    dict(id="AUD-REDUCTION-VERIFY", slug="aud-backend-reduction-verify", title="Verify the backend reduction audit before the reduction PRs use it", who="urokodaki",
         deps=["AUD-REDUCTION"], est=30,
         body=(f"Independent check of `icm/05-build/BACKEND-REDUCTION.md` (built on claude-haiku-5-5) on claude-opus-5-5. Worktree `{WT}/aud-backend-reduction-verify`, "
               "detached at `origin/Vari8-Beta`. Read only; no product edits.\n\n"
               "1. For every finding F1 to F13 re-run the caller census it cites (or an equivalent `rg`/`git grep` over `app/`, `lib/`, `scripts/`, `components/`, `tests/`) and record the command, the count and PASS or FAIL against the audit's claim.\n"
               "2. Check the import closure of the catalog importers (`lib/nutrition/source.ts`, `lib/exercise/source.ts`, `lib/nutrition/import.ts`, `lib/exercise/import.ts`): every `lib/extraction/*` module in it must be absent from PR-R1's delete list (the program lead found `databases.ts` and `css.ts` in the closure at 03:20; the audit names only `contracts`, `normalize`, `parse`).\n"
               "3. Check the line counts the audit claims per finding within 10 percent.\n"
               f"4. Write `{EVID}/AUD-REDUCTION/verify.md` with the table and a first line `SHIP AUD-REDUCTION` or `FIX AUD-REDUCTION`. On FIX, list the PR-R0, PR-R1, PR-R2 or PR-R3 card text that must change; the program lead regenerates the cards. Complete this card with the verdict line.\n")),
]
GATES = [
    dict(id="GATE-PRR", slug="gate-prr-readiness", title="Production-readiness gate on integrated Vari8-Beta", who="urokodaki",
         deps=["PR-D1", "PR-31", "AUD-PRR-BASELINE"], est=60),
    dict(id="GATE-FINAL", slug="gate-final-judgement", title="Final branch judgement", who="minato",
         deps=["GATE-PRR"], est=40),
    dict(id="GATE-CLEAN", slug="gate-clean", title="Ship-all and cleanup check", who="kakashi",
         deps=["GATE-FINAL"], est=20),
]

PARKED = [
    ("V3-H4-03", "CONFLICT (S11)", "No route may grant consent; the assertion fails closed. Parked behind `ENABLE_CONSENT_GATES` (D19).", "PR-04"),
    ("S09-17", "CONFLICT (S09)", "Cycle tracking group. Wired like any parameter (D19).", "PR-W4"),
    ("V2-H4", "CONFLICT (S05)", "Goal picker cycle parameters. Wired like any parameter (D19).", "PR-W3"),
    ("S11-23", "UNCONFIGURED (S11)", "Implied consent step. None is required of the canvas (D19).", "PR-04"),
    ("G6-102", "PARKED-D12", "Sensitive consent kinds and grant sources stay in the schema, unextended.", "PR-04"),
    ("G6-504", "PARKED-D12", "Export, erasure and audit-log cells: no canvas surface, denied by D15.", "PR-05"),
]

# Owner rulings O1-O16 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md`
# "Owner rulings") recorded on the build cards by the rulings merge (D37).
# They live here so generated output stays the committed card text. Build
# cards only; verify and merge bodies never carry them.
CARD_RULINGS = {
    "PR-01": [
        'Owner ruling O9 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): the server parent passes the viewer down; `getViewer()` stays server-side for the session gate (spec X9).',
    ],
    "PR-05": [
        'Owner ruling O7 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): coaches never log tracker entries for a client; the capability table records coach tracker write as comment-only (the spec narrows `lib/auth/rbac.ts:134` to comments).',
        'Owner ruling O16 (owner, 2026-10-20, same source): the generic sign-in, sign-up, reset and invite-acceptance pages are kept and excluded from parity; PR-W10 restyles them later to canvas tokens, type, spacing and components.',
    ],
    "PR-31": [
        'Owner ruling O1 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): cookie session for web and PWA, bearer token for Capacitor apps (spec X3); token storage and refresh rotation stay in this card\'s scope.',
    ],
    "PR-M2": [
        'Owner ruling O3 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): the client settings screen is blocked on Lilly\'s canvas design; per-user client preferences stay unwired until it lands.',
    ],
    "PR-M3": [
        'Owner ruling O7 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): the coach\'s tracker write path is comments only (TrackerComment); there is no coach entry logging.',
        'Owner ruling O13 (owner, 2026-10-20, same source): general coaching notes are client-visible while private coach notes and coach to-dos stay staff-only (D26); the note model carries the two kinds.',
    ],
    "PR-M6": [
        'Owner ruling O5 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): this card adds the set-logging model with the per-set shape (actual reps, load, RPE, set note, flags); PR-W8 wires it.',
        'Owner ruling O12 (owner, 2026-10-20, same source): no prescribed load per set; the canvas does not show it.',
    ],
    "PR-M8": [
        'Owner ruling O4 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): clients may not start a custom check-in; the server keeps CLIENT create denied on `checkinInstances` (`lib/auth/rbac.ts:169-176`).',
    ],
    "PR-SV4": [
        'Owner ruling O6 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): the submitted onboarding form creates the client record; this card owns the backend change so invite acceptance no longer creates the `ClientProfile` (`lib/workspace/invitations.ts:657-661`) while the invitation still creates the account and membership.',
        'Owner ruling O8 (owner, 2026-10-20, same source): the roster gets exactly one Add or invite control under a D32 parity exception; it calls this card\'s invitation API.',
    ],
    "PR-W0": [
        'Owner ruling O1 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): transport is same-origin `/api/v1` JSON, cookie session for web and PWA, bearer for Capacitor; this card owns the one shared fetch client, which also sets the failure and loading convention (spec X1, X5, X7).',
    ],
    "PR-W1": [
        'Owner ruling O9 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): the server parent passes the viewer down; `getViewer()` stays server-side and the client shell does not fetch the session route for first paint.',
        'Owner ruling O15 (owner, 2026-10-20, same source): no multi-workspace switcher; the shell keeps one workspace label showing the real workspace name.',
    ],
    "PR-W10": [
        'Owner ruling O3 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): no client settings screen is wired until Lilly\'s canvas design lands; this card keeps the coach-side settings only.',
        'Owner ruling O13 (owner, 2026-10-20, same source): general coaching notes render to the client; private coach notes and coach to-dos stay staff-only (D26).',
        'Owner ruling O16 (owner, 2026-10-20, same source): the generic sign-in, sign-up, reset and invite-acceptance pages are kept, excluded from parity, and this card owns their restyle to canvas tokens, type, spacing and components.',
    ],
    "PR-W2": [
        'Owner ruling O6 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): the submitted onboarding form creates the client record, replacing invite-first profile creation; PR-SV4 owns the backend change and this card wires the roster/profile side.',
        'Owner ruling O8 (owner, 2026-10-20, same source): a narrow D32 parity exception grants exactly one Add or invite-client control in the coach roster; no other new chrome.',
        'Owner ruling O14 (owner, 2026-10-20, same source): the assigned coach may complete a client task (supersedes the staff bar in decision #109); "overdue" derives from the due date (`taskDueState`).',
    ],
    "PR-W4": [
        'Owner ruling O2 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): the food diary N04 to N07 stays deferred and out of wiring scope; only generic tracker intake is wired.',
        'Owner ruling O7 (owner, 2026-10-20, same source): the tracker mode switch is view versus comment, not entry mode; coaches never log entries for a client and the `dailyTracking` coach write grant (`lib/auth/rbac.ts:134`) is narrowed to comments.',
        'Owner ruling O10 (owner, 2026-10-20, same source): calories are an ordinary tracked daily parameter (gap row R3-13); the old exclusion is superseded.',
    ],
    "PR-W6": [
        'Owner ruling O4 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): clients may not start a custom check-in; the client-side custom-start control is not wired and the server keeps CLIENT create denied on `checkinInstances`.',
    ],
    "PR-W7": [
        'Owner ruling O2 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): the food diary N04 to N07 stays deferred and out of wiring scope.',
        'Owner ruling O11 (owner, 2026-10-20, same source): archived meal plans are the superseded immutable plan versions; this card lists them as the archive.',
    ],
    "PR-W8": [
        'Owner ruling O5 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): set logging P04 to P06 is in scope: PR-M6 adds the model (actual reps, load, RPE, set note, flags) and this card wires it.',
        'Owner ruling O12 (owner, 2026-10-20, same source): no prescribed load per set; the canvas does not show it.',
    ],
}
CARD_BUILD_EXTRA = {
    "PR-W8": [
        "Booking code (TRAINING-I1B-2, `TrainingSessionBooking`) stays and is flagged as possibly removed later (docs/product-decisions.md #119); PR-W8 must not delete booking code without a ruling.",
    ],
}
for _p in PRS:
    if _p["id"] in CARD_RULINGS:
        _p["rulings"] = CARD_RULINGS[_p["id"]]
    if _p["id"] in CARD_BUILD_EXTRA:
        _p["build"].extend(CARD_BUILD_EXTRA[_p["id"]])
